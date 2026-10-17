// ============================================================
// BLOOD DONOR FINDER — BACKEND
// Google Apps Script web app + Google Sheets data store
// ============================================================

// ---------- Sheet names ----------

const DONORS_SHEET = "Donors";
const EMERGENCY_SHEET = "EmergencyRequests";
const NOTIFICATIONS_SHEET = "Notifications";

// ---------- Configuration ----------

// Preferred source for the spreadsheet id is the "SPREADSHEET_ID" script
// property (Project Settings > Script Properties). The literal below is
// only a fallback so the project still runs before that property is set.
const FALLBACK_SPREADSHEET_ID =
  "1zIHb7NL0TietuRQD_Hepgy7JZsEP-wwfvtXXm0u-6f0";

// These limits are duplicated in js/script.js. Keep both files in sync,
// otherwise users get rejected with no useful explanation.
const NAME_MAX = 80;
const LOCATION_MAX = 200;
const MESSAGE_MAX = 1000;

const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-"
];

const NOTIFICATION_LIMIT = 50;

// Only one alert batch per blood group per area per hour. MailApp allows
// just 100 emails a day on a personal Gmail account, so an unthrottled
// fan-out can silence the feature for the rest of the day. Set to 0 while
// testing to disable throttling.
const ALERT_COOLDOWN_SECONDS = 3600;

// Abuse limits. Apps Script cannot see the caller's IP, so requests are
// bucketed by the verified phone number plus a short global cooldown.
const RATE_LIMITS = {
  addDonor: { max: 5, windowSeconds: 21600 },        // 5 / 6 hours
  addEmergency: { max: 3, windowSeconds: 3600 },     // 3 / hour
  withdrawConsent: { max: 5, windowSeconds: 21600 }  // 5 / 6 hours
};

const GLOBAL_COOLDOWN_SECONDS = 10;

const DONOR_REQUIRED_HEADERS = [
  "Name",
  "Age",
  "BloodGroup",
  "State",
  "District",
  "Phone"
];

// Optional columns. They are not fatal when missing, but the email alert
// feature cannot work without them, so that is logged loudly.
const DONOR_ALERT_HEADERS = ["Email", "EmailConsent"];

// ========================================
// GET REQUESTS
// ========================================

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "";

    if (action === "getDonors") {
      return json(getDonors(getParam(e, "limit")));
    }

    if (action === "searchDonors") {
      return json(
        searchDonors({
          bloodGroup: getParam(e, "bloodGroup"),
          state: getParam(e, "state"),
          district: getParam(e, "district")
        })
      );
    }

    if (action === "getNotifications") {
      return json({
        success: true,
        notifications: getNotifications()
      });
    }

    return json(failure("Invalid action."));

  } catch (error) {
    console.error("GET error:", error);

    return json(
      failure("Unable to process the request. Please try again.")
    );
  }
}

// ========================================
// POST REQUESTS
// ========================================

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json(failure("Request body is missing."));
    }

    const data = JSON.parse(e.postData.contents);
    const action = String(data.action || "").trim();

    // Honeypot: the field is hidden with CSS and carries no label, so a
    // real person never fills it in. Answer as if it succeeded so bots
    // get no signal that they were caught.
    if (cleanText(data.hpField)) {
      console.warn("Blocked submission: honeypot field was filled.");

      return json({
        success: true,
        message: "Request received."
      });
    }

    if (action === "addDonor") {
      return json(guarded("addDonor", addDonor, data));
    }

    if (action === "addEmergency") {
      return json(guarded("addEmergency", addEmergency, data));
    }

    if (action === "withdrawConsent") {
      return json(guarded("withdrawConsent", withdrawConsent, data));
    }

    return json(failure("Invalid action."));

  } catch (error) {
    console.error("POST error:", error);

    return json(
      failure("Unable to process your request. Please try again.")
    );
  }
}

// Runs a handler behind the shared rate limit plus a global cooldown.
function guarded(action, handler, data) {
  const phone = cleanPhone(data.phone);

  if (phone) {
    const phoneLimit = checkRateLimit(
      "rl:" + action + ":" + phone,
      RATE_LIMITS[action].max,
      RATE_LIMITS[action].windowSeconds
    );

    if (!phoneLimit.allowed) {
      console.warn(
        "Rate limit hit for " + action + " (" +
        maskPhone(phone) + ")."
      );

      return failure(
        "Too many requests from this number. Please try again later."
      );
    }
  }

  const cooldown = checkCooldown(action);

  if (!cooldown.allowed) {
    return failure(
      "Please wait a few seconds before submitting again."
    );
  }

  return handler(data);
}

// ========================================
// RATE LIMITING
// ========================================

function checkRateLimit(key, max, windowSeconds) {
  const cache = CacheService.getScriptCache();

  let state;

  try {
    state = JSON.parse(cache.get(key) || "null");
  } catch (error) {
    // A corrupt cache entry should not take the whole endpoint down.
    console.warn("Rate limit cache read failed:", error);
    state = null;
  }

  const now = Date.now();

  if (!state || now >= (state.resetAt || 0)) {
    cache.put(
      key,
      JSON.stringify({ count: 1, resetAt: now + windowSeconds * 1000 }),
      windowSeconds
    );

    return { allowed: true, remaining: max - 1 };
  }

  if (state.count >= max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(
        Math.max(state.resetAt - now, 0) / 1000
      )
    };
  }

  state.count += 1;

  cache.put(
    key,
    JSON.stringify(state),
    Math.max(Math.ceil((state.resetAt - now) / 1000), 1)
  );

  return { allowed: true, remaining: max - state.count };
}

// Stops bursts from a single script even when each request uses a
// different phone number.
function checkCooldown(action) {
  const key = "rl:cooldown:" + action;

  const cache = CacheService.getScriptCache();
  const last = Number(cache.get(key) || 0);

  const waitSeconds = Math.ceil(
    (last + GLOBAL_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000
  );

  if (last && waitSeconds > 0) {
    return { allowed: false, retryAfterSeconds: waitSeconds };
  }

  cache.put(key, String(Date.now()), GLOBAL_COOLDOWN_SECONDS + 1);

  return { allowed: true, retryAfterSeconds: 0 };
}

// ========================================
// GET DONORS
// ========================================

function getDonors(limitParam) {
  const records = readRecords(getSheet(DONORS_SHEET));

  const limit = Number(limitParam);

  const slice = limit > 0
    ? records.slice(0, limit)
    : records;

  return slice.map(toDonorDto);
}

function toDonorDto(record) {
  return {
    name: record.Name || "",
    age: record.Age === undefined || record.Age === ""
      ? ""
      : record.Age,
    bloodGroup: record.BloodGroup || "",
    state: record.State || "",
    district: record.District || "",
    phone: record.Phone || ""
  };
}

// ========================================
// SEARCH DONORS
// ========================================

function searchDonors(filters) {
  const records = readRecords(getSheet(DONORS_SHEET));

  const bloodGroup = normalize(filters.bloodGroup);
  const state = normalize(filters.state);
  const district = normalize(filters.district);

  return records
    .filter(function (record) {
      const matchesBlood =
        !bloodGroup ||
        normalize(record.BloodGroup) === bloodGroup;

      const matchesState =
        !state ||
        normalize(record.State) === state;

      const matchesDistrict =
        !district ||
        normalize(record.District) === district;

      return matchesBlood && matchesState && matchesDistrict;
    })
    .map(toDonorDto);
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

  const emailConsent = toBoolean(data.emailConsent);

  if (!name || name.length < 2 || name.length > NAME_MAX) {
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

  if (email && !isValidEmail(email)) {
    return failure("Please enter a valid email address.");
  }

  if (emailConsent && !email) {
    return failure(
      "Email is required if you consent to email alerts."
    );
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
  } catch (error) {
    console.error("Could not acquire lock for addDonor:", error);

    return failure(
      "The service is busy right now. Please try again."
    );
  }

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

  } catch (error) {
    console.error("addDonor write failed:", error);

    return failure(
      "We could not save your registration. Please try again."
    );

  } finally {
    lock.releaseLock();
  }

  return {
    success: true,
    message: "Donor registered successfully."
  };
}

// ========================================
// WITHDRAW EMAIL CONSENT
// ========================================

function withdrawConsent(data) {
  const phone = cleanPhone(data.phone);

  if (!isValidPhone(phone)) {
    return failure("Please enter a valid phone number.");
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
  } catch (error) {
    console.error("Could not acquire lock:", error);

    return failure("The service is busy right now. Please try again.");
  }

  try {
    const sheet = getSheet(DONORS_SHEET);
    const headers = readHeaders(sheet);
    const consentColumn = headers.indexOf("EmailConsent") + 1;
    const phoneColumn = headers.indexOf("Phone") + 1;

    if (consentColumn === 0) {
      console.error(
        "withdrawConsent: the " + DONORS_SHEET + " sheet has no " +
        "EmailConsent column. Add it to enable consent withdrawal."
      );

      return failure(
        "Consent withdrawal is not available right now. Please contact the project team."
      );
    }

    if (phoneColumn === 0) {
      console.error(
        "withdrawConsent: the " + DONORS_SHEET + " sheet has no " +
        "Phone column, so consent cannot be matched to a record."
      );

      return failure(
        "Consent withdrawal is not available right now. Please contact the project team."
      );
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return failure(
        "No donor record was found for that mobile number."
      );
    }

    const rowCount = lastRow - 1;

    // The two columns are read separately so their positions in the sheet
    // do not matter, and absolute row numbers are tracked directly.
    // Mapping positions back to rows through readRecords() would be wrong
    // whenever a blank row has been skipped.
    const phoneValues =
      sheet.getRange(2, phoneColumn, rowCount, 1).getValues();

    const consentValues =
      sheet.getRange(2, consentColumn, rowCount, 1).getValues();

    const matched = [];
    const targetRows = [];

    phoneValues.forEach(function (row, index) {
      if (cleanPhone(row[0]) !== phone) return;

      matched.push(index + 2);

      if (toBoolean(consentValues[index][0])) {
        targetRows.push(index + 2);
      }
    });

    if (!matched.length) {
      return failure(
        "No donor record was found for that mobile number."
      );
    }

    // Consecutive rows are written as one range to keep the number of
    // Sheets calls down.
    const groups = [];

    targetRows.forEach(function (rowNumber) {
      const group = groups[groups.length - 1];

      if (group && rowNumber === group[group.length - 1] + 1) {
        group.push(rowNumber);
      } else {
        groups.push([rowNumber]);
      }
    });

    groups.forEach(function (group) {
      sheet
        .getRange(group[0], consentColumn, group.length, 1)
        .setValues(Array.from({ length: group.length }, () => [false]));
    });

    SpreadsheetApp.flush();

    console.log(
      "Consent withdrawn on " + targetRows.length + " of " +
      matched.length + " matching record(s) (" + maskPhone(phone) + ")."
    );

    return {
      success: true,
      updated: targetRows.length,
      matched: matched.length,
      message:
        "Email alert consent has been withdrawn. You will no longer receive emergency emails from this project."
    };

  } catch (error) {
    console.error("withdrawConsent failed:", error);

    return failure(
      "We could not update your consent. Please try again."
    );

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
  const state = cleanText(data.state);
  const district = cleanText(data.district);
  const phone = cleanPhone(data.phone);
  const message = cleanText(data.message);

  if (!patientName || patientName.length < 2 ||
      patientName.length > NAME_MAX) {
    return failure("Please enter a valid patient name.");
  }

  if (!isValidBloodGroup(bloodGroup)) {
    return failure("Please select a valid blood group.");
  }

  if (!location || location.length > LOCATION_MAX) {
    return failure(
      "Please enter a location of " + LOCATION_MAX +
      " characters or fewer."
    );
  }

  if (!isValidPhone(phone)) {
    return failure("Please enter a valid phone number.");
  }

  if (message.length > MESSAGE_MAX) {
    return failure(
      "The message must be " + MESSAGE_MAX + " characters or fewer."
    );
  }

  const request = {
    id: Utilities.getUuid(),
    patientName: patientName,
    bloodGroup: bloodGroup,
    location: location,
    state: state,
    district: district,
    phone: phone,
    message: message,
    requestedAt: new Date()
  };

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
  } catch (error) {
    console.error("Could not acquire lock for addEmergency:", error);

    return failure(
      "The service is busy right now. Please try again."
    );
  }

  try {
    appendRecord(getSheet(EMERGENCY_SHEET), {
      ID: request.id,
      PatientName: request.patientName,
      BloodGroup: request.bloodGroup,
      Location: request.location,
      State: request.state,
      District: request.district,
      Phone: request.phone,
      Message: request.message,
      RequestedAt: request.requestedAt
    });

    SpreadsheetApp.flush();

    // Written inside the same lock so two concurrent requests cannot
    // target the same next-free row.
    createEmergencyNotification(request);

  } catch (error) {
    console.error("Emergency write failed:", error);

    return failure(
      "We could not save your request. Please try again."
    );

  } finally {
    lock.releaseLock();
  }

  // The request is safely stored by this point. Notification and email
  // failures are logged but never reported as a failed submission,
  // because the user's request was in fact recorded.

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
  appendRecord(getOrCreateNotificationsSheet(), {
    ID: request.id,
    BloodGroup: request.bloodGroup,
    Location: request.location,
    State: request.state,
    District: request.district,
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

  // The requester's number is joined in from the emergency sheet instead
  // of being copied here, so the phone number is not duplicated into a
  // second table. Degrades quietly if that sheet is unavailable.
  const requestsById = indexRequestsById();

  // Return only the newest entries, newest first.
  return records
    .slice(-NOTIFICATION_LIMIT)
    .reverse()
    .map(function (record) {
      const id = String(record.ID || "");
      const request = requestsById[id] || {};

      // Only a masked number ever leaves the server. The full number is
      // sent by email to donors who opted in.
      const contact = maskPhone(cleanPhone(request.Phone || ""));

      return {
        id: id,
        bloodGroup: String(record.BloodGroup || ""),
        location: String(record.Location || ""),
        district: String(record.District || ""),
        state: String(record.State || ""),
        message: String(record.Message || ""),
        contact: contact === "***" ? "" : contact,
        createdAt: record.CreatedAt instanceof Date
          ? record.CreatedAt.toISOString()
          : String(record.CreatedAt || "")
      };
    });
}

function indexRequestsById() {
  const index = {};

  try {
    readRecords(getSheet(EMERGENCY_SHEET)).forEach(function (record) {
      const id = String(record.ID || "");

      if (id) index[id] = record;
    });

  } catch (error) {
    console.warn(
      "Could not index " + EMERGENCY_SHEET +
      "; notifications will show no contact number:",
      error
    );
  }

  return index;
}

// ========================================
// SEND EMERGENCY EMAIL ALERTS
// ========================================

function sendEmergencyEmailAlerts(request) {
  const sheet = getSheet(DONORS_SHEET);
  const headers = readHeaders(sheet);

  const missing = DONOR_ALERT_HEADERS.filter(function (header) {
    return headers.indexOf(header) === -1;
  });

  if (missing.length) {
    console.error(
      "Email alerts skipped: the " + DONORS_SHEET + " sheet is " +
      "missing the column(s) " + missing.join(", ") + ". Add " +
      "them to the header row to enable emergency alerts."
    );

    return 0;
  }

  const donors = readRecords(sheet);

  const bloodGroup = normalize(request.bloodGroup);

  const matchingDonors = donors.filter(function (donor) {
    const email = cleanText(donor.Email).toLowerCase();
    const consent = toBoolean(donor.EmailConsent);

    if (!email || !consent) return false;

    if (normalize(donor.BloodGroup) !== bloodGroup) {
      return false;
    }

    return locationMatches(donor, request);
  });

  const uniqueEmails = countUniqueEmails(matchingDonors);

  console.log(
    "Matching consenting donors: " + matchingDonors.length +
    ", unique addresses: " + uniqueEmails
  );

  if (!uniqueEmails) return 0;

  // One alert batch per area and blood group per window. Without this a
  // handful of requests can burn the whole daily MailApp quota, which
  // MailApp has no way of replenishing until midnight.
  const throttle = checkAlertThrottle(request, uniqueEmails);

  if (!throttle.allowed) {
    console.warn(
      "Email alerts suppressed for " + request.bloodGroup + " in " +
      (request.district || request.state || "the request area") +
      ": a batch already went out " +
      Math.round(ALERT_COOLDOWN_SECONDS / 60) + " minute(s) ago."
    );

    return 0;
  }

  // Avoid duplicate messages to the same email address.
  const sentTo = {};

  let sent = 0;

  matchingDonors.forEach(function (donor) {
    const email = cleanText(donor.Email).toLowerCase();

    if (sentTo[email]) return;

    sentTo[email] = true;

    if (MailApp.getRemainingDailyQuota() < 1) {
      console.error(
        "Daily email quota exhausted. " +
        (uniqueEmails - sent) + " alert(s) skipped."
      );

      return;
    }

    try {
      MailApp.sendEmail({
        to: email,
        subject:
          "URGENT: " + request.bloodGroup + " blood needed in " +
          (request.district || request.state || request.location),
        body: buildAlertBody(request)
      });

      sent += 1;

    } catch (emailError) {
      console.error(
        "Email failed for " + maskEmail(email) + ":",
        emailError
      );
    }
  });

  console.log("Emails sent: " + sent + " of " + uniqueEmails + ".");

  return sent;
}

function countUniqueEmails(donors) {
  const seen = {};

  donors.forEach(function (donor) {
    const email = cleanText(donor.Email).toLowerCase();

    if (email) seen[email] = true;
  });

  return Object.keys(seen).length;
}

// One alert batch per area plus blood group per window. The key is scoped
// by blood group so an A+ request never suppresses an O+ one, and scoped
// by the most specific area the requester supplied.
function checkAlertThrottle(request, plannedCount) {
  if (ALERT_COOLDOWN_SECONDS <= 0) {
    return { allowed: true };
  }

  const area = normalize(
    request.district || request.state || request.location
  );

  if (!area) return { allowed: true };

  const key = "alert:" + normalize(request.bloodGroup) + ":" + area;

  const cache = CacheService.getScriptCache();
  const previous = Number(cache.get(key) || 0);

  if (previous) {
    const elapsed = Math.floor((Date.now() - previous) / 1000);

    if (elapsed < ALERT_COOLDOWN_SECONDS) {
      return {
        allowed: false,
        retryAfterSeconds: ALERT_COOLDOWN_SECONDS - elapsed,
        previousBatchAt: previous
      };
    }
  }

  cache.put(key, String(Date.now()), ALERT_COOLDOWN_SECONDS + 60);

  return { allowed: true, planned: plannedCount };
}

// The requester's number is only ever revealed to donors who explicitly
// opted in. A reply-to header cannot be used because it accepts an email
// address, not a phone number.
function buildAlertBody(request) {
  const area = request.district
    ? request.district + ", " + (request.state || "")
    : request.state || request.location;

  const lines = [
    "URGENT: a " + request.bloodGroup + " blood request was submitted.",
    "",
    "Contact the requester: +91 " + request.phone
  ];

  if (area) {
    lines.push("Area: " + area.trim());
  }

  lines.push(
    "Patient: " + request.patientName,
    "",
    request.message
      ? "Requester said:\n" + request.message
      : "The requester did not add any extra details.",
    "",
    "What to do:",
    "1. Call the number above if you are free and feel well enough to donate.",
    "2. Confirm the requirement and the hospital directly before travelling.",
    "3. A directory match is not a medical clearance. A blood bank or doctor",
    "   must confirm your eligibility before any donation.",
    "",
    "If you are not eligible right now, please ignore this message. You will",
    "only be alerted about requests that match your blood group and area.",
    "",
    "You received this because you consented to emergency alerts. You can",
    "withdraw consent at any time from the registration page of the",
    "Blood Donor Finder website."
  );

  return lines.join("\n");
}

// Prefers the structured state/district the requester picked from the
// dropdowns, and only falls back to substring matching against the free
// text location when no dropdown was used.
function locationMatches(donor, request) {
  const donorDistrict = normalize(donor.District);
  const donorState = normalize(donor.State);

  const requestDistrict = normalize(request.district);
  const requestState = normalize(request.state);

  if (requestDistrict) {
    return donorDistrict === requestDistrict;
  }

  if (requestState) {
    return donorState === requestState;
  }

  const requestLocation = normalize(request.location);

  if (!requestLocation) return true;

  return (
    (donorDistrict && requestLocation.indexOf(donorDistrict) !== -1) ||
    (donorState && requestLocation.indexOf(donorState) !== -1)
  );
}

// ========================================
// SHEET ACCESS
// ========================================

function getSpreadsheetId() {
  const configured = PropertiesService
    .getScriptProperties()
    .getProperty("SPREADSHEET_ID");

  if (configured) return configured;

  return FALLBACK_SPREADSHEET_ID;
}

// Opening the spreadsheet is comparatively expensive, and several
// helpers need it within a single request, so it is opened once.
let spreadsheetCache = null;

function getSpreadsheet() {
  if (!spreadsheetCache) {
    spreadsheetCache = SpreadsheetApp.openById(getSpreadsheetId());
  }

  return spreadsheetCache;
}

function getSheet(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }

  return sheet;
}

function getOrCreateNotificationsSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(NOTIFICATIONS_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(NOTIFICATIONS_SHEET);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "ID",
      "BloodGroup",
      "Location",
      "State",
      "District",
      "Message",
      "CreatedAt"
    ]);
  }

  return sheet;
}

// ========================================
// GOOGLE SHEETS HELPERS
// ========================================

function readHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) return [];

  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function (header) {
      return String(header).trim();
    });
}

function readRecords(sheet) {
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) return [];

  const headers = values[0].map(function (header) {
    return String(header).trim();
  });

  if (sheet.getName() === DONORS_SHEET) {
    DONOR_REQUIRED_HEADERS.forEach(function (header) {
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

// Writes one record using the sheet's own header row for column order, so
// column order never has to match the object literal above.
function appendRecord(sheet, record) {
  const headers = readHeaders(sheet);

  if (!headers.length) {
    throw new Error(
      "The sheet " + sheet.getName() + " needs a header row."
    );
  }

  if (headers.every(function (header) { return !header; })) {
    throw new Error(
      "The sheet " + sheet.getName() + " has no column headers."
    );
  }

  const row = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(record, header)
      ? record[header]
      : "";
  });

  const target = sheet.getRange(
    sheet.getLastRow() + 1,
    1,
    1,
    headers.length
  );

  // Formatting the cells as plain text before writing stops Sheets from
  // evaluating user input that starts with =, +, - or @ as a formula.
  target.setNumberFormat("@");
  target.setValues([row]);
}

// ========================================
// VALIDATION HELPERS
// ========================================

function getParam(e, key) {
  if (!e || !e.parameter) return "";

  return String(e.parameter[key] || "").trim();
}

function cleanText(value) {
  return String(value == null ? "" : value).trim();
}

// Case-insensitive, whitespace-insensitive comparison key.
function normalize(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

// Reduces every accepted phone format to a bare 10-digit number so that
// records written with "+91 98765 43210" still match a withdrawal request
// made with "9876543210".
function cleanPhone(value) {
  const digits = String(value == null ? "" : value).replace(/\D/g, "");

  if (digits.length === 12 && digits.slice(0, 2) === "91") {
    return digits.slice(2);
  }

  return digits;
}

function isValidPhone(phone) {
  return /^[6-9]\d{9}$/.test(phone);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidBloodGroup(group) {
  return BLOOD_GROUPS.indexOf(group) !== -1;
}

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;

  return String(value == null ? "" : value)
    .trim()
    .toLowerCase() === "true";
}

// Shows only the carrier prefix and the last three digits, e.g.
// 9876543210 becomes 98XXXXX210. Used both for log lines and for the
// partially masked contact number shown on the public website.
function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length !== 10) return "***";

  return digits.slice(0, 2) + "XXXXX" + digits.slice(-3);
}

function maskEmail(email) {
  const parts = String(email || "").split("@");

  if (parts.length !== 2) return "***";

  const name = parts[0];
  const visible = name.slice(0, 2);

  return visible + "***@" + parts[1];
}

// ========================================
// RESPONSES
// ========================================

function failure(message) {
  return {
    success: false,
    error: message
  };
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
