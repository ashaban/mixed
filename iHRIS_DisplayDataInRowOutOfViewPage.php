#form_process_exam_application.html (default template)
<div id="siteContent" class="dataTable">
  <table border="0" cellspacing="2" cellpadding="0">
    <tr style="background-color:black;color:white">
      <th>First Name</th>
      <th>Surname</th>
      <th>Exam</th>
      <th>Payment Slip</th>
      <th>Application Date</th>
      <th>Status</th>
      <th>Action</th>
    </tr>
    <div id='applicants_list'>

    </div>
  </table>
  <div id="hidden_data">

  </div>
</div>

#applicant.html
<div>
  <tr>
    <td><span type='form' name="person:firstname"></span></td>
    <td><span type='form' name="person:surname"></span></td>
    <td><span type='form' name="exam_apply:exam_type_schedule"></span></td>
    <td><span type='form' name="exam_apply:payment_slip"></span></td>
    <td><span type='form' name="exam_apply:application_date"></span></td>
    <td><span type='form' name="exam_apply:exam_app_status"></span></td>
    <td>
      <span type="form" name="exam_apply:id" href="process_exam_application?type=approve&exam_apply=" parent="true">Approve</span>
      |
      <span type="form" name="exam_apply:id" href="process_exam_application?type=reject&exam_apply=" parent="true">Reject</span>
    </td>
  </tr>
</div>

<?php
/*
	* © Copyright 2007, 2008 IntraHealth International, Inc.
	* 
	* This File is part of iHRIS
	* 
	* iHRIS is free software; you can redistribute it and/or modify
	* it under the terms of the GNU General Public License as published by
	* the Free Software Foundation; either version 3 of the License, or
	* (at your option) any later version.
	* 
	* This program is distributed in the hope that it will be useful,
	* but WITHOUT ANY WARRANTY; without even the implied warranty of
	* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	* GNU General Public License for more details.
	* 
	* You should have received a copy of the GNU General Public License
	* along with this program.  If not, see <http://www.gnu.org/licenses/>.
	*/
	/**
	* Manage license renewals.
	* 
	* @package iHRIS
	* @subpackage Qualify
	* @access public
	* @author Ally Shaban <allyshaban5@gmail.com>
	* @since v2.0.0
	* @version v2.0.0
	*/
	
	/**
	* Page object to handle the renewal of licenses.
	* 
	* @package iHRIS
	* @subpackage Qualify
	* @access public
	*/
class LBBoards_PageFormProcessExamApplication extends I2CE_Page {
  protected function action() {
    $this->factory = I2CE_FormFactory::instance();
    $applicant_node = $this->template->appendFileById("applicant.html", "div", "applicants_list");
    $personObj = $this->factory->createContainer("person|10367");
    $personObj->populate();
    $this->template->setForm($personObj, $applicant_node);
    $applicationObj = $this->factory->createContainer("exam_apply|10368");
    $applicationObj->populate();
    $this->template->setForm($applicationObj, $applicant_node);
  }
}
