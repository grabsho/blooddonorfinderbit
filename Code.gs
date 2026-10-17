
const SHEET_ID = "1zIHb7NL0TietuRQD_Hepgy7JZsEP-wwfvtXXm0u-6f0";

const DONORS_SHEET = "Donors";
const EMERGENCY_SHEET = "EmergencyRequests";
const NOTIFICATIONS_SHEET = "Notifications";

// ========================================
// GET REQUESTS
// ========================================

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "";

    if (action === "getDonors") {
      return json(getDonors());
    }

    if (action === "searchDonors") {
      return json(searchDonors({
        bloodGroup: getParam(e, "bloodGroup"),
        state: getParam(e, "state"),
        district: getParam(e, "district")
      }));
    }

    if (action === "getNotifications") {
      return json({
        success: true,
        notifications: getNotifications()
      });
    }

    return json({
      success: false,
      error: "Invalid action."
    });

  } catch (error) {
    console.error("GET error:", error);

    return json({
      success: false,
      error: "Unable to process the request. Please try again."
    });
  }
}

// ========================================
// POST REQUESTS
// ========================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({
        success: false,
        error: "Request body is missing."
      });
    }

    const data = JSON.parse(e.postData.contents);
    const action = String(data.action || "").trim();

    if (action === "addDonor") {
      return json(addDonor(data));
    }

    if (action === "addEmergency") {
      return json(addEmergency(data));
    }

    return json({
      success: false,
      error: "Invalid action."
    });

  } catch (error) {
    console.error("POST error:", error);

    return json({
      success: false,
      error: "Unable to process your request. Please try again."
    });
  }
}

// ========================================
// GET DONORS
// ========================================

function getDonors() {
  const records = readRecords(getSheet(DONORS_SHEET));

  return records.map(function (record) {
    return {
      name: record.Name || "",
      age: record.Age || "",
      bloodGroup: record.BloodGroup || "",
      state: record.State || "",
      district: record.District || "",
      phone: record.Phone || ""
    };
  });
}

// ========================================
// SEARCH DONORS
// ========================================

function searchDonors(filters) {
  const records = readRecords(getSheet(DONORS_SHEET));

  const bloodGroup = normalize(filters.bloodGroup).toUpperCase();
  const state = normalize(filters.state).toLowerCase();
  const district = normalize(filters.district).toLowerCase();

  return records
    .filter(function (record) {
      const matchesBlood =
        !bloodGroup ||
        normalize(record.BloodGroup).toUpperCase() === bloodGroup;

      const matchesState =
        !state ||
        normalize(record.State).toLowerCase() === state;

      const matchesDistrict =
        !district ||
        normalize(record.District).toLowerCase() === district;

      return matchesBlood && matchesState && matchesDistrict;
    })
    .map(function (record) {
      return {
        name: record.Name || "",
        age: record.Age || "",
        bloodGroup: record.BloodGroup || "",
        state: record.State || "",
        district: record.District || "",
        phone: record.Phone || ""
      };
    });
}

// ========================================
// REGISTER DONOR
// ========================================

function addDonor(data) {
  const name = cleanText(data.name);
  const age = Number(data.age);
  const bloodGroup = cleanText(data.bloodGroup).toUpperCase();
  const state = cleanText(data.state);
  const district = cleanText(data.district);
  const phone = cleanPhone(data.phone);
  const email = cleanText(data.email).toLowerCase();

  const emailConsent =
    data.emailConsent === true ||
    String(data.emailConsent).toLowerCase() === "true";

  if (!name || name.length < 2 || name.length > 80) {
    return failure("Please enter a valid name.");
  }

  if (!Number.isInteger(age) || age < 18 || age > 65) {
    return failure("Donor age must be between 18 and 65.");
  }

  if (!isValidBloodGroup(bloodGroup)) {
    return failure("Please select a valid blood group.");
  }

  if (!state || !district) {
    return failure("Please select your state and district.");
  }

  if (!isValidPhone(phone)) {
    return failure("Please enter a valid phone number.");
  }

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return failure("Please enter a valid email address.");
  }

  if (emailConsent && !email) {
    return failure(
      "Email is required if you consent to email alerts."
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(DONORS_SHEET);

    appendRecord(sheet, {
      ID: Utilities.getUuid(),
      Name: name,
      Age: age,
      BloodGroup: bloodGroup,
      State: state,
      District: district,
      Phone: phone,
      RegisteredAt: new Date(),
      Email: email,
      EmailConsent: emailConsent
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Donor registered successfully."
    };

  } finally {
    lock.releaseLock();
  }
}

// ========================================
// SUBMIT EMERGENCY REQUEST
// ========================================

function addEmergency(data) {
  const patientName = cleanText(data.patientName);
  const bloodGroup = cleanText(data.bloodGroup).toUpperCase();
  const location = cleanText(data.location);
  const phone = cleanPhone(data.phone);
  const message = cleanText(data.message);

  if (
    !patientName ||
    patientName.length < 2 ||
    patientName.length > 80
  ) {
    return failure("Please enter a valid patient name.");
  }

  if (!isValidBloodGroup(bloodGroup)) {
    return failure("Please select a valid blood group.");
  }

  if (!location || location.length > 200) {
    return failure("Please enter a valid location.");
  }

  if (!isValidPhone(phone)) {
    return failure("Please enter a valid phone number.");
  }

  if (message.length > 1000) {
    return failure(
      "The message must be 1000 characters or fewer."
    );
  }

  const request = {
    id: Utilities.getUuid(),
    patientName: patientName,
    bloodGroup: bloodGroup,
    location: location,
    phone: phone,
    message: message,
    requestedAt: new Date()
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(EMERGENCY_SHEET);

    appendRecord(sheet, {
      ID: request.id,
      PatientName: request.patientName,
      BloodGroup: request.bloodGroup,
      Location: request.location,
      Phone: request.phone,
      Message: request.message,
      RequestedAt: request.requestedAt
    });

    SpreadsheetApp.flush();

  } finally {
    lock.releaseLock();
  }

  // Notifications and emails are attempted after the request is saved.
  // Failure in either operation must not erase the saved request.

  try {
    createEmergencyNotification(request);
  } catch (error) {
    console.error("Website notification failed:", error);
  }

  try {
    sendEmergencyEmailAlerts(request);
  } catch (error) {
    console.error("Emergency email alerts failed:", error);
  }

  return {
    success: true,
    message: "Emergency request submitted successfully."
  };
}

// ========================================
// CREATE WEBSITE NOTIFICATION
// ========================================

function createEmergencyNotification(request) {
  const sheet = getOrCreateNotificationsSheet();

  appendRecord(sheet, {
    ID: request.id,
    BloodGroup: request.bloodGroup,
    Location: request.location,
    Message: request.message,
    CreatedAt: request.requestedAt
  });

  SpreadsheetApp.flush();
}

// ========================================
// GET WEBSITE NOTIFICATIONS
// ========================================

function getNotifications() {
  const sheet = getOrCreateNotificationsSheet();
  const records = readRecords(sheet);

  // Return only the newest 50 notifications.
  return records
    .slice(-50)
    .reverse()
    .map(function (record) {
      return {
        id: String(record.ID || ""),
        bloodGroup: String(record.BloodGroup || ""),
        location: String(record.Location || ""),
        message: String(record.Message || ""),
        createdAt: record.CreatedAt instanceof Date
          ? record.CreatedAt.toISOString()
          : String(record.CreatedAt || "")
      };
    });
}

// ========================================
// SEND EMERGENCY EMAIL ALERTS
// ========================================

function sendEmergencyEmailAlerts(request) {
  const donors = readRecords(getSheet(DONORS_SHEET));

  const requestLocation =
    normalize(request.location).toLowerCase();

  const bloodGroup =
    normalize(request.bloodGroup).toUpperCase();

  const matchingDonors = donors.filter(function (donor) {
    const email = cleanText(donor.Email);
    const consent =
      String(donor.EmailConsent).toLowerCase() === "true";

    const donorBlood =
      normalize(donor.BloodGroup).toUpperCase();

    const district =
      normalize(donor.District).toLowerCase();

    const state =
      normalize(donor.State).toLowerCase();

    const locationMatches =
      (district && requestLocation.includes(district)) ||
      (state && requestLocation.includes(state));

    return (
      email &&
      consent &&
      donorBlood === bloodGroup &&
      locationMatches
    );
  });

  // Avoid duplicate messages to the same email address.
  const sentTo = {};

  matchingDonors.forEach(function (donor) {
    const email = cleanText(donor.Email).toLowerCase();

    if (sentTo[email]) {
      return;
    }

    sentTo[email] = true;

    try {
      if (MailApp.getRemainingDailyQuota() < 1) {
        console.error("Daily email quota exhausted.");
        return;
      }

      MailApp.sendEmail({
        to: email,
        subject: "Emergency Blood Request - " + bloodGroup,
        body:
          "An emergency blood request may match your donor profile.\n\n" +
          "Blood group: " + bloodGroup + "\n" +
          "Location: " + request.location + "\n" +
          "Details: " +
          (request.message ||
            "Please check the website for more information.") +
          "\n\n" +
          "Please contact the requester through the official website " +
          "and donate only if you are eligible and available.\n\n" +
          "You received this email because you consented to emergency alerts."
      });

    } catch (emailError) {
      console.error(
        "Email failed for " + email + ":",
        emailError
      );
    }
  });

  console.log(
    "Matching consenting donors: " + matchingDonors.length
  );
}

// ========================================
// CREATE NOTIFICATIONS SHEET IF NEEDED
// ========================================

function getOrCreateNotificationsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(NOTIFICATIONS_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(NOTIFICATIONS_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "ID",
      "BloodGroup",
      "Location",
      "Message",
      "CreatedAt"
    ]);
  }

  return sheet;
}

// ========================================
// GOOGLE SHEETS HELPERS
// ========================================

function getSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }

  return sheet;
}

function readRecords(sheet) {
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(function (header) {
    return String(header).trim();
  });

  const requiredHeaders = [
    "Name",
    "Age",
    "BloodGroup",
    "State",
    "District",
    "Phone"
  ];

  if (sheet.getName() === DONORS_SHEET) {
    requiredHeaders.forEach(function (header) {
      if (headers.indexOf(header) === -1) {
        throw new Error(
          "Missing column in " + sheet.getName() + ": " + header
        );
      }
    });
  }

  return values.slice(1)
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== "" && cell !== null;
      });
    })
    .map(function (row) {
      const record = {};

      headers.forEach(function (header, index) {
        if (header) {
          record[header] = row[index];
        }
      });

      return record;
    });
}

function appendRecord(sheet, record) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error(
      "The sheet " + sheet.getName() + " needs a header row."
    );
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function (header) {
      return String(header).trim();
    });

  if (headers.every(function (header) {
    return !header;
  })) {
    throw new Error(
      "The sheet " + sheet.getName() + " has no column headers."
    );
  }

  const row = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(record, header)
      ? record[header]
      : "";
  });

  sheet.appendRow(row);
}

// ========================================
// VALIDATION HELPERS
// ========================================

function getParam(e, key) {
  if (!e || !e.parameter) {
    return "";
  }

  return String(e.parameter[key] || "").trim();
}

function cleanText(value) {
  return String(value == null ? "" : value).trim();
}

function normalize(value) {
  return cleanText(value);
}

function cleanPhone(value) {
  return String(value == null ? "" : value)
    .replace(/[\s()-]/g, "")
    .trim();
}

function isValidPhone(phone) {
  // Supports Indian mobile numbers with optional +91.
  return /^(?:\+91)?[6-9]\d{9}$/.test(phone);
}

function isValidBloodGroup(group) {
  return [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-"
  ].indexOf(group) !== -1;
}

function failure(message) {
  return {
    success: false,
    error: message
  };
}

// ========================================
// JSON RESPONSE
// ========================================

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
