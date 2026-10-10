const SHEET_ID = "1zIHb7NL0TietuRQD_Hepgy7JZsEP-wwfvtXXm0u-6f0"; // Get from Sheet URL (between /d/ and /edit)
const DONORS_SHEET = "Donors";
const EMERGENCY_SHEET = "EmergencyRequests";

function doGet(e) {
  const action = e.parameter.action;
  const sheet = SpreadsheetApp.openById(SHEET_ID);

  if (action === "getDonors") {
    const data = sheet.getSheetByName(DONORS_SHEET).getDataRange().getValues();
    const headers = data[0];
    let col = {};
    headers.forEach((h, i) => col[String(h).trim()] = i);
    const rows = [];
    for (let r = 1; r < data.length; r++) {
      const rowArr = data[r];
      rows.push({
        name: rowArr[col["Name"]] || "",
        age: rowArr[col["Age"]] || "",
        bloodGroup: rowArr[col["BloodGroup"]] || "",
        state: rowArr[col["State"]] || "",
        district: rowArr[col["District"]] || "",
        phone: rowArr[col["Phone"]] || ""
      });
    }
    return json(rows);
  }

  if (action === "searchDonors") {
    const bloodGroup = e.parameter.bloodGroup;
    const state = e.parameter.state;
    const district = e.parameter.district;
    const data = sheet.getSheetByName(DONORS_SHEET).getDataRange().getValues();
    const headers = data[0];
    let col = {};
    headers.forEach((h, i) => col[String(h).trim()] = i);
    const bloodIndex = col["BloodGroup"];
    const stateIndex = col["State"];
    const districtIndex = col["District"];
    const rows = [];
    for (let r = 1; r < data.length; r++) {
      const rowArr = data[r];
      const matchBlood = !bloodGroup || rowArr[bloodIndex] === bloodGroup;
      const matchState = !state || rowArr[stateIndex] === state;
      const matchDistrict = !district || rowArr[districtIndex] === district;
      if (matchBlood && matchState && matchDistrict) {
        rows.push({
          name: rowArr[col["Name"]] || "",
          age: rowArr[col["Age"]] || "",
          bloodGroup: rowArr[col["BloodGroup"]] || "",
          state: rowArr[col["State"]] || "",
          district: rowArr[col["District"]] || "",
          phone: rowArr[col["Phone"]] || ""
        });
      }
    }
    return json(rows);
  }

  return json({ error: "Invalid action" });
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;
  const sheet = SpreadsheetApp.openById(SHEET_ID);

  if (action === "addDonor") {
    const ws = sheet.getSheetByName(DONORS_SHEET);
    const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    const row = [];
    // Start with a row of empty values sized to the headers
    for (let i = 0; i < headers.length; i++) row.push("");

    const map = {
      "ID": new Date(),
      "Name": data.name,
      "Age": data.age,
      "BloodGroup": data.bloodGroup,
      "State": data.state,
      "District": data.district,
      "Phone": data.phone,
      "RegisteredAt": new Date()
    };

    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i]).trim();
      if (map.hasOwnProperty(h)) row[i] = map[h];
    }

    ws.appendRow(row);
    return json({ success: true });
  }

  if (action === "addEmergency") {
    const ws = sheet.getSheetByName(EMERGENCY_SHEET);
    const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    const row = [];
    for (let i = 0; i < headers.length; i++) row.push("");

    const map = {
      "ID": new Date(),
      "PatientName": data.patientName,
      "BloodGroup": data.bloodGroup,
      "Location": data.location,
      "Phone": data.phone,
      "Message": data.message,
      "RequestedAt": new Date()
    };

    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i]).trim();
      if (map.hasOwnProperty(h)) row[i] = map[h];
    }

    ws.appendRow(row);
    return json({ success: true });
  }

  return json({ error: "Invalid action" });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
