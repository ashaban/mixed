'use strict'

const logger = require('winston')
const pd = require('pretty-data').pd
const async = require("async")

module.exports = (mongo,fhirResources) => {
  const fhirCore = require('../fhir/core.js')(mongo, fhirResources)
  function getPractitionerRole(resource,ctx,query,callback) {
    const entryCtx = JSON.parse(JSON.stringify(ctx))
    entryCtx.url = '/fhir/'+resource+"?"+query
    entryCtx.query = {}
    entryCtx.query.practitioner = query
    fhirCore.search(entryCtx, resource, (err,results)=>{
      callback(results)
    })
  }

  function getLocationByIdentifier(ctx,identifier,callback) {
    const entryCtx = JSON.parse(JSON.stringify(ctx))
    entryCtx.url = '/fhir/Location'
    entryCtx.query = {}
    entryCtx.query.identifier = identifier
    fhirCore.search(entryCtx, 'Location', (err,results)=>{
      callback(results)
    }) 
  }
  return {
  	translatePractitionerToCSD: (bundleResource,ctx,callback) => {
      const promises = []
  		let directory = `<csd:providerDirectory>`
  		bundleResource.resource.entry.forEach( (entry)=>{
  			var resource = entry.resource
  			var entityID = ''
  			resource.identifier.forEach((identifier)=>{
  				if(identifier.system == "urn:ihe:iti:csd:2013:entityID")
  					entityID = identifier.value
  			})
        var practitioner = "Practitioner/"+entityID
        getPractitionerRole("PractitionerRole",ctx,practitioner,(practitionerRole)=>{
          directory += `<csd:provider entityID="${entityID}">`
          resource.identifier.forEach((identifier)=>{
            if(identifier.system != "urn:ihe:iti:csd:2013:entityID") {
              directory += `<csd:otherID assigningAuthorityName="${identifier.system}">${identifier.value}</csd:otherID>`
            }
          })
          directory += `<csd:demographic>`
          resource.name.forEach((name)=>{
            var commonName = name.text
            var surname = name.family
            var given = name.given.split(" ")
            if(given.length>0) {
              var forename = given[0]
              given.splice(0,1)
              if(given.length>0)
                var otherName = given.join(" ")
              else
                var otherName = ''
            }
            else {
              var forename = ''
              var otherName = ''
            }
            var honoric = name.prefix
            var suffix = name.suffix
            directory += `<csd:name>
                            <csd:commonName>${commonName}</csd:commonName>
                            <csd:surname>${surname}</csd:surname>
                            <csd:forename>${forename}</csd:forename>
                            <csd:otherName>${otherName}</csd:otherName>
                            <csd:honorific>${honoric}</csd:honorific>
                            <csd:suffix>${suffix}</csd:suffix>
                          </csd:name>`

          })
          directory += `<csd:dateOfBirth>${resource.birthDate}</csd:dateOfBirth>`
          directory += `<csd:gender>${resource.gender}</csd:gender>`
          //extracting address
          resource.address.forEach((address)=>{
            var type = ''
            if(address.type == 'mailing address')
              type = address.type
            else if(address.type == 'postal')
              type = "Mailing"
            else if(address.type == 'physical')
              type = "Physical"
            directory += `<csd:address type='${type}'>`

            if(address.line)
              directory +=  `<csd:addressLine component='streetAddress'>${address.line}</csd:addressLine>`
            if(address.city)
              directory +=  `<csd:addressLine component='city'>${address.city}</csd:addressLine>`
            if(address.state)
              directory +=  `<csd:addressLine component='stateProvince'>${address.state}</csd:addressLine>`
            if(address.country)
              directory +=  `<csd:addressLine component='country'>${address.country}</csd:addressLine>`
            if(address.postalCode)
              directory +=  `<csd:addressLine component='postalCode'>${address.postalCode}</csd:addressLine>`
            directory += `</csd:address>`;

          })

          //extract credentials
          resource.qualification.forEach((qualification)=>{
            directory += `<csd:credential>`
            if(qualification.hasOwnProperty("identifier"))
            qualification.identifier.forEach((identifier)=>{
              directory += `<csd:number>${identifier.value}</csd:number>`
            })
            qualification.code.coding.forEach((coding)=>{
              if(coding.display)
                var display = coding.display
              else
                var display = ''
              directory += `<csd:codedType code='${coding.code}' codingScheme='${coding.system}'>${display}</csd:codedType>`
            })
            if(qualification.hasOwnProperty('issuer'))
            directory += `<csd:issuingAuthority>${qualification.issuer.display}</csd:issuingAuthority>`
            if(qualification.hasOwnProperty('period') && qualification.period.hasOwnProperty('start'))
            directory += `<csd:credentialIssueDate>${qualification.period.start}</csd:credentialIssueDate>`
            if(qualification.hasOwnProperty('period') && qualification.period.hasOwnProperty('end'))
            directory += `<csd:csd:credentialRenewalDate>${qualification.period.end}</csd:csd:credentialRenewalDate>`
            directory += `</csd:credential>`
          })
          //extracting contacts
          resource.telecom.forEach((telecom)=>{
            directory += `<csd:contactPoint>`
            var code = ''
            if(telecom.system == 'phone')
              code = "BP"
            if(telecom.system == 'email')
              code = "EMAIL"
            if(telecom.system == 'fax')
              code = "FAX"
            else if(telecom.system == "other")
              code = "OTHER"
            directory += `<csd:codedType code='${code}'>${telecom.value}</csd:codedType>`
            directory += `</csd:contactPoint>`
          })
          directory += `</csd:demographic>`

          resource.communication.forEach((communication)=>{
            communication.coding.forEach((coding)=>{
              directory += `<csd:language code='${coding.code}' codingScheme='${coding.system}'>${coding.display}</csd:language>`
            })
          })

          var providerSpecialty = ''
          promises.push(new Promise((resolve, reject) => {
            async.eachSeries(practitionerRole.resource.entry,(entryPractRole,nxtEntry)=>{
              if(entryPractRole.resource.hasOwnProperty("specialty"))
                async.eachSeries(entryPractRole.resource.specialty,(specialty,nxtSpec)=>{
                  async.eachSeries(specialty.code.coding,(coding,nxtCoding)=>{
                    providerSpecialty += `
                    <csd:specialty code=${coding.code} codingScheme=${coding.system}>${coding.display}</csd:specialty>`
                    return nxtCoding()
                  },function(){
                    nxtSpec()
                  })

                },function(){
                  nxtEntry()
                })
            },function(){
              resolve()
            })
          }))

          var providerOrganizations = ''
          promises.push(new Promise((resolve, reject) => {
            var organizations = false
            async.eachSeries(practitionerRole.resource.entry,(entryPractRole,nxtEntry)=>{
              if(entryPractRole.resource.hasOwnProperty("location"))
                async.eachSeries(entryPractRole.resource.location,(location,nxtLoc)=>{
                  var referenceArr = location.reference.split("Location/")
                  var reference = referenceArr[referenceArr.length-1]
                  getLocationByIdentifier(ctx,reference,(loc)=>{
                    loc.resource.entry.forEach((entryLoc)=>{
                      entryLoc.resource.physicalType.coding.forEach((coding)=>{
                        if(coding.code == "jdn") {
                          if(!organizations)
                          providerOrganizations += `<csd:organizations>`
                          organizations = true
                          providerOrganizations += `<csd:organization entityID="${reference}"/>`
                          return nxtLoc()
                        }
                        else
                          return nxtLoc()
                      })
                    })
                  })
                },function(){
                  nxtEntry()
                })
              else
                return nxtEntry()

            },function(){
              if(organizations)
              providerOrganizations += `</csd:organizations>`
              return resolve()
            })
          }))

          var providerFacilities = ''
          promises.push(new Promise((resolve, reject) => {
            var facilities = false
            async.eachSeries(practitionerRole.resource.entry,(entryPractRole,nxtEntry)=>{
              if(entryPractRole.resource.hasOwnProperty("location"))
                async.eachSeries(entryPractRole.resource.location,(location,nxtLoc)=>{
                  var referenceArr = location.reference.split("Location/")
                  var reference = referenceArr[referenceArr.length-1]
                  getLocationByIdentifier(ctx,reference,(loc)=>{
                    loc.resource.entry.forEach((entryLoc)=>{
                      entryLoc.resource.physicalType.coding.forEach((coding)=>{
                        if(coding.code == "bu") {
                          if(!facilities)
                          providerFacilities += `<csd:facilities>`
                          facilities = true
                          providerFacilities += `<csd:facility entityID="${reference}"/>`
                          return nxtLoc()
                        }
                        else
                          return nxtLoc()
                      })
                    })
                  })
                },function(){
                  nxtEntry()
                })
              else
                return nxtEntry()

            },function(){
              if(facilities)
              providerFacilities += `</csd:facilities>`
              return resolve()
            })
          }))

          var providerRecord = ''
          
          Promise.all(promises).then(() => {
            directory += providerSpecialty
            directory += providerOrganizations
            directory += providerFacilities
            directory += `</csd:provider>`
            directory += `<csd:providerDirectory>`
            logger.error(pd.xml(directory))
          })
        })
	    })
  	}
  }
}
