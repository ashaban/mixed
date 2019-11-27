const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.json')[env];
const axios = require('axios');
const async = require('async');
const URI = require('urijs');
const _ = require('lodash');
const structureDefinition = require('./structureDefinition');
const Fhir = require('fhir').Fhir;

const fhir = new Fhir();

const flattenComplex = extension => {
  let results = {};
  for (let ext of extension) {
    let value = '';
    for (let key of Object.keys(ext)) {
      if (key !== 'url') {
        value = ext[key];
      }
    }
    if (results[ext.url]) {
      if (Array.isArray(results[ext.url])) {
        results[ext.url].push(value);
      } else {
        results[ext.url] = [results[ext.url], value];
      }
    } else {
      if (Array.isArray(value)) {
        results[ext.url] = [value];
      } else {
        results[ext.url] = value;
      }
    }
  }
  return results;
};

const matchQuery = (query, obj) => {
  if (query === '') return true;
  let queries = query.split('&');
  var result = true;
  for (let qry of queries) {
    let match = qry.split('=');
    if (match.length !== 2) {
      console.error('INVALID query: ' + query);
      return false;
    } else {
      result = result && obj[match[0]] === match[1];
    }
  }
  return result;
};

const singleDeterminate = (val1, val2, func) => {
  if (func === '') {
    return true;
  } else if (func === 'max') {
    if (val1 >= val2) return true;
  } else if (func === 'min') {
    if (val1 <= val2) return true;
  }
  return false;
};

const getImmediateLinks = (orderedResources, links, callback) => {
  if (orderedResources.length - 1 === links.length) {
    return callback(orderedResources);
  }
  let promises = [];
  for (let link of links) {
    promises.push(
      new Promise((resolve, reject) => {
        link = flattenComplex(link.extension);
        let parentOrdered = orderedResources.find(orderedResource => {
          return orderedResource.name === link.linkTo;
        });
        let exists = orderedResources.find(orderedResource => {
          return JSON.stringify(orderedResource) === JSON.stringify(link);
        });
        if (parentOrdered && !exists) {
          orderedResources.push(link);
        }
        resolve();
      })
    );
  }
  Promise.all(promises).then(() => {
    if (orderedResources.length - 1 !== links.length) {
      getImmediateLinks(orderedResources, links, orderedResources => {
        return callback(orderedResources);
      });
    } else {
      return callback(orderedResources);
    }
  });
};

const getReportRelationship = callback => {
  let url = URI(config.fhir.server)
    .segment('fhir')
    .segment('Basic');
  url.addQuery('code', 'iHRISRelationship');
  url = url.toString();
  axios
    .get(url, {
      withCredentials: true,
      auth: {
        username: config.fhir.username,
        password: config.fhir.password,
      },
    })
    .then(relationships => {
      return callback(false, relationships.data);
    })
    .catch(err => {
      console.error(err);
      return callback(err, false);
    });
};

const createESIndex = (name, IDFields, callback) => {
  console.info('Checking if index ' + name + ' exists');
  let url = URI(config.elastic.server)
    .segment(name)
    .toString();
  axios({
      method: 'head',
      url,
      auth: {
        username: config.elastic.username,
        password: config.elastic.password,
      },
    })
    .then(response => {
      if (response.status === 200) {
        console.info('Index ' + name + ' exist, not creating');
        return callback(false);
      } else {
        return callback(true);
      }
    })
    .catch(err => {
      if (err.response && err.response.status && err.response.status === 404) {
        console.info('Index not found, creating index ' + name);
        let mappings = {
          mappings: {
            properties: {},
          },
        };
        for (let IDField of IDFields) {
          mappings.mappings.properties[IDField] = {};
          mappings.mappings.properties[IDField].type = 'keyword';
        }
        axios({
            method: 'put',
            url,
            data: mappings,
            auth: {
              username: config.elastic.username,
              password: config.elastic.password,
            },
          })
          .then(response => {
            if (response.status !== 200) {
              console.error('Something went wrong and index was not created');
              console.error(response.data);
              return callback(true);
            } else {
              console.info('Index ' + name + ' created successfully');
              return callback(false);
            }
          })
          .catch(err => {
            console.error(err);
            return callback(true);
          });
      } else {
        console.log(err);
      }
    });
};

getReportRelationship(async (err, relationships) => {
  if (err) {
    return;
  }
  if (!relationships.entry || !Array.isArray(relationships.entry)) {
    console.error('invalid resource returned');
    return;
  }
  relationships.entry.forEach(relationship => {
    relationship = require('/home/ally/Desktop/staff.json');
    console.info('processing relationship ID ' + relationship.resource.id);
    relationship = relationship.resource;
    let sd = relationship.subject.reference.substring(
      relationship.subject.reference.lastIndexOf('/')
    );
    structureDefinition(sd, (err, subject) => {
      if (err) {
        console.error(err);
        return;
      }
      let details = relationship.extension.find(ext => ext.url === 'http://ihris.org/fhir/StructureDefinition/iHRISReportDetails');
      let links = relationship.extension.filter(ext => ext.url === 'http://ihris.org/fhir/StructureDefinition/iHRISReportLink');
      let reportDetails = flattenComplex(details.extension);
      let orderedResources = [];
      let IDFields = [];
      reportDetails.resource = subject._type;
      orderedResources.push(reportDetails);
      IDFields.push(reportDetails.name);
      for (let linkIndex1 in links) {
        let link1 = links[linkIndex1];
        let flattenedLink1 = flattenComplex(link1.extension);
        IDFields.push(flattenedLink1.name);
        for (let link2 of links) {
          let flattenedLink2 = flattenComplex(link2.extension);
          if (
            flattenedLink2.linkTo === flattenedLink1.name &&
            !flattenedLink2.linkElement.startsWith(
              flattenedLink2.resource + '.'
            )
          ) {
            let linkElement = flattenedLink2.linkElement.split('.').pop();
            links[linkIndex1].extension.push({
              url: 'http://ihris.org/fhir/StructureDefinition/iHRISReportElement',
              extension: [{
                  url: 'label',
                  valueString: linkElement,
                },
                {
                  url: 'name',
                  valueString: linkElement,
                },
              ],
            });
          }
        }
      }
      createESIndex(reportDetails.name, IDFields, err => {
        if (err) {
          console.error('Stop creating report due to error in creating index');
          return;
        }
        getImmediateLinks(orderedResources, links, () => {
          async.eachSeries(orderedResources, (orderedResource, nxtResource) => {
            let url = URI(config.fhir.server)
              .segment('fhir')
              .segment(orderedResource.resource)
              .segment('_history');
            url.addQuery('_count', 500);
            url = url.toString();
            let resourceData = [];
            console.info(`Getting data for resource ${orderedResource.name}`);
            async.whilst(
              callback => {
                return callback(null, url != false);
              },
              callback => {
                axios
                  .get(url, {
                    withCredentials: true,
                    auth: {
                      username: config.fhir.username,
                      password: config.fhir.password,
                    },
                  })
                  .then(response => {
                    url = false;
                    const next = response.data.link.find(
                      link => link.relation === 'next'
                    );
                    if (next) {
                      url = next.url;
                    }
                    if (
                      response.data.total > 0 &&
                      response.data.entry &&
                      response.data.entry.length > 0
                    ) {
                      resourceData = resourceData.concat(response.data.entry);
                    }
                    url = false;
                    return callback(null, url);
                  })
                  .catch(err => {
                    console.log(err);
                  });
              },
              () => {
                console.log('Done fetching data for resource ' + orderedResource.name);
                console.log('Writting resource data for resource ' + orderedResource.name + ' into elastic search');
                //resourceData = resourceData.reverse()
                let processedRecords = []
                async.eachSeries(resourceData, (data, next) => {
                  console.log('processing ');
                  let id = data.resource.resourceType + '/' + data.resource.id;
                  let processed = processedRecords.find((record) => {
                    return record === id
                  })
                  if (processed) {
                    return next();
                  } else {
                    processedRecords.push(id)
                  }
                  let queries = [];
                  // just in case there are multiple queries
                  if (orderedResource.query) {
                    queries = orderedResource.query.split('&');
                  }
                  for (let query of queries) {
                    let limits = query.split('=');
                    let limitParameters = limits[0];
                    let limitValue = limits[1];
                    let resourceValue = fhir.evaluate(
                      data.resource,
                      limitParameters
                    );
                    // if (resourceValue != limitValue) {
                    //   return next()
                    // }
                  }
                  let record = {};
                  for (let element of orderedResource["http://ihris.org/fhir/StructureDefinition/iHRISReportElement"]) {
                    let fieldLabel
                    let fieldName
                    for (let el of element) {
                      let value = '';
                      for (let key of Object.keys(el)) {
                        if (key !== 'url') {
                          value = el[key];
                        }
                      }
                      if (el.url === "label") {
                        fieldLabel = value
                      } else {
                        fieldName = value
                      }
                    }
                    let displayData = fhir.evaluate(data.resource, fieldName);
                    let value
                    if (Array.isArray(displayData)) {
                      value = displayData.pop();
                    } else {
                      value = displayData;
                    }
                    if (value) {
                      record[fieldLabel] = value
                    }
                  }
                  record[orderedResource.name] = id
                  let match = {};
                  if (orderedResource.hasOwnProperty('linkElement') && orderedResource.linkElement.startsWith(orderedResource.resource + '.')) {
                    //remove resource name from link element i.e if PractionerRole.practioner then remove PractitionerRole. and remain with practioner
                    let linkElement = orderedResource.linkElement.replace(orderedResource.resource + '.', '');
                    let linkTo = fhir.evaluate(data.resource, linkElement + '.reference');
                    match[orderedResource.linkTo] = linkTo;
                  } else if (orderedResource.hasOwnProperty('linkElement') && !orderedResource.linkElement.startsWith(orderedResource.resource + '.')) {
                    let linkElement = orderedResource.linkElement.split('.').pop();
                    match[linkElement] = data.resource.resourceType + '/' + data.resource.id;
                  } else {
                    match[orderedResource.name] = data.resource.resourceType + '/' + data.resource.id;
                  }
                  let ctx = '';
                  for (let field in record) {
                    ctx += 'ctx._source.' + field + "='" + record[field] + "';";
                  }

                  let url = URI(config.elastic.server)
                    .segment(reportDetails.name)
                    .segment('_update_by_query')
                    .toString();
                  let body = {
                    script: {
                      lang: 'painless',
                      source: ctx
                    },
                    query: {
                      match,
                    },
                  };
                  axios({
                      method: 'post',
                      url,
                      data: body,
                      auth: {
                        username: config.elastic.username,
                        password: config.elastic.password,
                      },
                    })
                    .then(response => {
                      // if nothing was updated and its from the primary (top) resource then create as new
                      if (response.data.updated == 0 && !orderedResource.hasOwnProperty('linkElement')) {
                        console.info('No record with id ' + data.resource.id + ' found on elastic search, creating new');
                        let url = URI(config.elastic.server)
                          .segment(reportDetails.name)
                          .segment('_doc')
                          .toString();
                        axios({
                            method: 'post',
                            url,
                            data: record,
                            auth: {
                              username: config.elastic.username,
                              password: config.elastic.password,
                            },
                          })
                          .then(response => {
                            return next();
                          })
                          .catch(err => {
                            console.error(err);
                            return next();
                          });
                      } else {
                        return next();
                      }
                    })
                    .catch(err => {
                      console.log(err);
                      return next();
                    });
                }, () => {
                  console.log('Done Writting resource data for resource ' + orderedResource.name + ' into elastic search');
                  return nxtResource()
                });
              }
            );
          });
        });
      });
    });
  });
});
