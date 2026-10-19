const cors = require("cors");
const express = require("express");
const { google } = require("googleapis");
const path = require("path");
require("dotenv").config();

const nodemailer = require("nodemailer");

const mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

const app = express();
app.use(cors({
    origin: [
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "20kb" }));
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const DONORS_SHEET = "Donors";
const EMERGENCY_SHEET = "EmergencyRequests";

async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: path.join(__dirname, "credentials.json"),
        scopes: [
            "https://www.googleapis.com/auth/spreadsheets"
        ]
    });

    const authClient = await auth.getClient();

    return google.sheets({
        version: "v4",
        auth: authClient
    });
}

async function getRows(sheets, sheetName) {
    const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:Z`
    });

    const values = result.data.values || [];
    if (values.length < 2) return [];

    const headers = values[0].map(h => String(h).trim());

    return values.slice(1).map(row => {
        const record = {};

        headers.forEach((header, index) => {
            record[header] = row[index] || "";
        });

        return record;
    });
}

async function appendByHeaders(sheets, sheetName, record) {
    const headerResult = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!1:1`
    });

    const headers = (headerResult.data.values || [])[0];

    if (!headers || headers.length === 0) {
        throw new Error(`Headers missing in ${sheetName}`);
    }

    const row = headers.map(header => {
        const key = String(header).trim();
        return record[key] === undefined ? "" : record[key];
    });

    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:Z`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
            values: [row]
        }
    });
}

function publicDonor(donor) {
    return {
        name: donor.Name || "",
        age: donor.Age || "",
        bloodGroup: donor.BloodGroup || "",
        state: donor.State || "",
        district: donor.District || "",
        phone: donor.Phone || ""
    };
}


async function sendEmailSafely({ to, subject, text }) {
    if (!to) {
        console.warn("[EMAIL SKIPPED] No recipient address provided.");
        return false;
    }

    try {
        await mailer.sendMail({
            from: `"Blood Donor Finder" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            text
        });

        console.log(`[EMAIL SENT] ${subject} -> ${to}`);
        return true;
    } catch (error) {
        // Do not log passwords or other credentials.
        console.error("[EMAIL FAILED]", {
            recipient: to,
            subject,
            code: error.code || "UNKNOWN",
            message: error.message
        });

        return false;
    }
}

function emailConsentIsTrue(value) {
    return value === true ||
        String(value).trim().toLowerCase() === "true";
}

function locationMatchesDonor(donor, requestLocation) {
    const location = String(requestLocation || "").toLowerCase().trim();
    const district = String(donor.District || "").toLowerCase().trim();
    const state = String(donor.State || "").toLowerCase().trim();

    if (!location) return false;

    return Boolean(
        (district && location.includes(district)) ||
        (state && location.includes(state))
    );
}


function validEmail(email) {
    return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Blood Donor Finder backend is running!"
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "healthy"
    });
});

// GET /api/donors
app.get("/api/donors", async (req, res) => {
    try {
        const sheets = await getSheetsClient();
        const donors = await getRows(sheets, DONORS_SHEET);

        res.json({
            success: true,
            donors: donors.map(publicDonor)
        });
    } catch (error) {
        console.error("Get donors error:", error.message);
        res.status(500).json({
            success: false,
            error: "Unable to retrieve donors."
        });
    }
});

// GET /api/donors/search?bloodGroup=A%2B&state=Uttar%20Pradesh&district=Meerut
app.get("/api/donors/search", async (req, res) => {
    try {
        const bloodGroup = String(req.query.bloodGroup || "")
            .trim().toLowerCase();
        const state = String(req.query.state || "").trim().toLowerCase();
        const district = String(req.query.district || "")
            .trim().toLowerCase();

        const sheets = await getSheetsClient();
        const donors = await getRows(sheets, DONORS_SHEET);

        const matches = donors.filter(donor =>
            (!bloodGroup ||
                String(donor.BloodGroup || "").trim().toLowerCase() === bloodGroup) &&
            (!state ||
                String(donor.State || "").trim().toLowerCase() === state) &&
            (!district ||
                String(donor.District || "").trim().toLowerCase() === district)
        );

        res.json({
            success: true,
            count: matches.length,
            donors: matches.map(publicDonor)
        });
    } catch (error) {
        console.error("Search donors error:", error.message);
        res.status(500).json({
            success: false,
            error: "Unable to search donors."
        });
    }
});

// POST /api/donors
app.post("/api/donors", async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const age = Number(req.body.age);
        const bloodGroup = String(req.body.bloodGroup || "").trim();
        const state = String(req.body.state || "").trim();
        const district = String(req.body.district || "").trim();
        const phone = String(req.body.phone || "").replace(/\D/g, "");
        const email = String(req.body.email || "").trim();
        const emailConsent =
            req.body.emailConsent === true ||
            String(req.body.emailConsent).toLowerCase() === "true";

        const allowedBloodGroups = [
            "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"
        ];

        if (
            !name ||
            !Number.isInteger(age) ||
            age < 18 ||
            age > 100 ||
            !allowedBloodGroups.includes(bloodGroup) ||
            !state ||
            !district ||
            !/^\d{10}$/.test(phone) ||
            !validEmail(email) ||
            (emailConsent && !email)
        ) {
            return res.status(400).json({
                success: false,
                error: "Please provide valid donor details."
            });
        }

        const sheets = await getSheetsClient();
        const donors = await getRows(sheets, DONORS_SHEET);

        const duplicate = donors.some(donor =>
            String(donor.Phone || "").replace(/\D/g, "") === phone
        );

        if (duplicate) {
            return res.status(409).json({
                success: false,
                error: "This phone number is already registered."
            });
        }

        await appendByHeaders(sheets, DONORS_SHEET, {
            ID: require("crypto").randomUUID(),
            Name: name,
            Age: age,
            BloodGroup: bloodGroup,
            State: state,
            District: district,
            Phone: phone,
            RegisteredAt: new Date().toISOString(),
            Email: email,
            EmailConsent: emailConsent
        });


        if (email) {
            await sendEmailSafely({
                to: email,
                subject: "Welcome to Blood Donor Finder — Registration Confirmed",
                text: [
                    `Hello ${name},`,
                    "",
                    "Thank you for registering as a blood donor with Blood Donor Finder.",
                    "Your registration has been received successfully.",
                    "",
                    "Thank you for helping connect people who may need blood donors.",
                    "",
                    "Please remember that donor availability and medical eligibility",
                    "must be confirmed separately by appropriate healthcare professionals.",
                    "",
                    "— Blood Donor Finder Team"
                ].join("\n")
            });
        }


        res.status(201).json({
            success: true,
            message: "Donor registered successfully."
        });
    } catch (error) {
        console.error("Register donor error:", error.message);
        res.status(500).json({
            success: false,
            error: "Unable to register donor."
        });
    }
});

// POST /api/donors/withdraw-consent
app.post("/api/donors/withdraw-consent", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").replace(/\D/g, "");

    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid 10-digit registered phone number."
      });
    }

    const sheets = await getSheetsClient();

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${DONORS_SHEET}!A:Z`
    });

    const rows = result.data.values || [];

    if (rows.length < 2) {
      return res.status(404).json({
        success: false,
        error: "No registered donor found with this phone number."
      });
    }

    const headers = rows[0].map(h => String(h).trim());
    const phoneIndex = headers.indexOf("Phone");
    const consentIndex = headers.indexOf("EmailConsent");

    if (phoneIndex === -1 || consentIndex === -1) {
      throw new Error("Phone or EmailConsent column is missing.");
    }

    const rowIndex = rows.findIndex((row, index) =>
      index > 0 &&
      String(row[phoneIndex] || "").replace(/\D/g, "") === phone
    );

    if (rowIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "No registered donor found with this phone number."
      });
    }

    const columnToLetter = (columnIndex) => {
      let n = columnIndex + 1;
      let letter = "";

      while (n > 0) {
        const remainder = (n - 1) % 26;
        letter = String.fromCharCode(65 + remainder) + letter;
        n = Math.floor((n - 1) / 26);
      }

      return letter;
    };

    const consentCell =
      `${DONORS_SHEET}!${columnToLetter(consentIndex)}${rowIndex + 1}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: consentCell,
      valueInputOption: "RAW",
      requestBody: {
        values: [[false]]
      }
    });

    console.log("[CONSENT WITHDRAWN]", {
      donorRow: rowIndex + 1
    });

    return res.json({
      success: true,
      message: "Email alert consent has been withdrawn successfully."
    });

  } catch (error) {
    console.error("Withdraw consent error:", error.message);

    return res.status(500).json({
      success: false,
      error: "Unable to withdraw consent right now. Please try again."
    });
  }
});

// POST /api/emergency-requests
app.post("/api/emergency-requests", async (req, res) => {
    try {
        const patientName = String(req.body.patientName || "").trim();
        const bloodGroup = String(req.body.bloodGroup || "").trim();
        const location = String(req.body.location || "").trim();
        const hospitalName = String(req.body.hospitalName || "").trim();
        const phone = String(req.body.phone || "").replace(/\D/g, "");
        const message = String(req.body.message || "").trim();

        const allowedBloodGroups = [
            "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"
        ];

        if (
            !patientName ||
            !allowedBloodGroups.includes(bloodGroup) ||
            !location ||
            !/^\d{10}$/.test(phone)
        ) {
            return res.status(400).json({
                success: false,
                error: "Please provide valid emergency request details."
            });
        }

        const sheets = await getSheetsClient();

        await appendByHeaders(sheets, EMERGENCY_SHEET, {
            ID: require("crypto").randomUUID(),
            PatientName: patientName,
            BloodGroup: bloodGroup,
            Location: location,
            Hospital: hospitalName,
            Phone: phone,
            Message: message,
            RequestedAt: new Date().toISOString()
        });


        const donors = await getRows(sheets, DONORS_SHEET);

        const matchingDonors = donors.filter(donor => {
            const email = String(donor.Email || "").trim();

            return (
                email &&
                emailConsentIsTrue(donor.EmailConsent) &&
                String(donor.BloodGroup || "").trim().toLowerCase() ===
                bloodGroup.toLowerCase() &&
                locationMatchesDonor(donor, location)
            );
        });

        let alertsSent = 0;
        let alertsFailed = 0;

        for (const donor of matchingDonors) {
            const email = String(donor.Email).trim();

            const sent = await sendEmailSafely({
                to: email,
                subject: `Emergency blood request: ${bloodGroup}`,
                text: [
                    "An emergency blood request matches your registered donor preferences.",
                    "",
                    `Blood group needed: ${bloodGroup}`,
                    `Patient name: ${patientName}`,
                    `Hospital: ${hospitalName || "Not provided"}`,
                    `Location: ${location}`,
                    `Contact phone: ${phone}`,
                    message ? `Additional message: ${message}` : "",
                    "",
                    "Please contact the requester to confirm the details.",
                    "Donate only if you are willing and medically eligible, as assessed by a qualified healthcare professional.",
                    "",
                    "If you no longer wish to receive alerts, use the project's consent withdrawal process."
                ].filter(Boolean).join("\n")
            });

            if (sent) {
                alertsSent++;
            } else {
                alertsFailed++;
            }
        }

        console.log("[EMERGENCY ALERT SUMMARY]", {
            matchingDonors: matchingDonors.length,
            alertsSent,
            alertsFailed
        });


        res.status(201).json({
            success: true,
            message: "Emergency request submitted successfully.",
            alertsSent,
            alertsFailed,
            matchingDonors: matchingDonors.length
        });
    } catch (error) {
        console.error("Emergency request error:", error.message);
        res.status(500).json({
            success: false,
            error: "Unable to submit emergency request."
        });
    }
});


app.post("/api/test-email", async (req, res) => {
    try {
        if (
            !process.env.GMAIL_USER ||
            !process.env.GMAIL_APP_PASSWORD
        ) {
            return res.status(500).json({
                success: false,
                error: "Gmail environment variables are missing."
            });
        }

        await mailer.sendMail({
            from: `"Blood Donor Finder" <${process.env.GMAIL_USER}>`,
            to: process.env.GMAIL_USER,
            subject: "Blood Donor Finder - Email Test",
            text: "Success! Your Node.js backend can send email."
        });

        res.json({
            success: true,
            message: "Test email sent to your project Gmail account."
        });
    } catch (error) {
        console.error("Email test failed:", error);

        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            responseCode: error.responseCode
        });
    }
});


app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
});
