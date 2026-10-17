# Blood Donor Finder

A college mini project that lets people search a donor directory by blood
group and location, register as a donor, submit an emergency blood request,
and receive email alerts when a request matches their profile.

Static HTML/CSS/JavaScript on the front end, Google Apps Script + Google
Sheets on the back end.

> This is a student project, not a medical service. It does not establish
> donor eligibility and must never be used instead of emergency services.

## Project structure

```
.
├── index.html              Home page + live request feed
├── find-donor.html         Donor search + live request feed
├── register.html           Donor registration + consent withdrawal
├── emergency.html          Emergency blood request form
├── about.html              Project documentation
├── css/
│   └── style.css           Shared design system
├── js/
│   └── script.js           All front-end logic
├── Code.gs                 Apps Script backend (doGet / doPost)
├── appsscript.json         Apps Script manifest
└── .gitignore
```

## Spreadsheet setup

Create a Google Sheet with two tabs and these exact headers.

**Tab: `Donors`**

| Name | Age | BloodGroup | State | District | Phone | ID | RegisteredAt | Email | EmailConsent |
|------|-----|------------|-------|----------|-------|----|--------------|-------|--------------|

- `Name`, `Age`, `BloodGroup`, `State`, `District`, `Phone` are required.
  The backend refuses to run without them.
- `Email` and `EmailConsent` are optional but **required for emergency
  alerts to work at all**. Without them the backend logs
  `Email alerts skipped: ...` and sends nothing.

**Tab: `EmergencyRequests`**

| ID | PatientName | BloodGroup | Location | State | District | Phone | Message | RequestedAt |
|----|-------------|------------|----------|-------|----------|-------|---------|-------------|

**Tab: `Notifications`** is created automatically on first use. Nothing to
set up.

## Deploying the backend

1. Open <https://script.google.com> and create a new project.
2. Add `Code.gs` and `appsscript.json` (Project Settings → tick
   *Show "appsscript.json" manifest file in editor*).
3. Project Settings → Script Properties, add:
   - Key `SPREADSHEET_ID`
   - Value = your spreadsheet ID (the long string in the sheet URL)
4. Deploy → New deployment → **Web app**
   - Execute as **Me**
   - Who has access: **Anyone**
5. Copy the `/exec` URL into `APPS_SCRIPT_URL` at the top of `js/script.js`.
6. Edit the spreadsheet, share it with the account that owns the script.

`Code.gs` keeps a hardcoded fallback spreadsheet id so it still runs before
the script property is set. Set the property and remove the fallback if you
want the id out of version control.

## Running locally

Any static file server works. Opening the files over `file://` will load
but the backend calls need a real origin.

```bash
npx serve .
# or
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## API

All responses are JSON. `POST` uses `Content-Type: text/plain` to avoid a
CORS preflight, which Apps Script does not answer.

### GET

| Action | Query | Returns |
|--------|-------|---------|
| `getDonors` | `limit` (optional) | array of donors |
| `searchDonors` | `bloodGroup`, `state`, `district` | array of donors |
| `getNotifications` | – | `{ success, notifications }`, newest first, max 50 |

### POST

Body is JSON with an `action` field.

| Action | Fields |
|--------|--------|
| `addDonor` | `name`, `age`, `bloodGroup`, `state`, `district`, `phone`, `email`, `emailConsent` |
| `addEmergency` | `patientName`, `bloodGroup`, `location`, `state`, `district`, `phone`, `message` |
| `withdrawConsent` | `phone` |

Every form also posts a hidden `hpField` honeypot. It must stay empty.

## Emergency email alerts

When a request is submitted, `addEmergency` saves it and then calls
`sendEmergencyEmailAlerts`, which emails every donor who has **all** of:

- a non-empty `Email`
- `EmailConsent` set to true
- the same `BloodGroup`
- a matching `District`, or `State`, or the district name appearing in the
  free-text `Location`

### What the email contains

- Subject: `URGENT: <blood group> blood needed in <area>`
- The requester's **full phone number** with the `+91` prefix
- Area, patient name, and the requester's own description
- Clear instructions to confirm with a blood bank before travelling, and a
  reminder that a directory match is not medical clearance

`MailApp.sendEmail` has no `replyTo` support for phone numbers, so the
number is placed as the second line of the body where the donor will
actually see it.

### Contact numbers on the website

The public notification feed only ever receives a **masked** number such as
`98XXXXX210`. The full number is never sent to the browser, so it cannot be
recovered from the page source, the network tab, or a "reveal" button.

### Quota throttling

A personal Gmail account gets **100 emails a day** from `MailApp`, and the
quota resets at midnight server-side. An unthrottled fan-out would silently
disable alerts for the rest of the day.

`checkAlertThrottle` therefore allows only **one alert batch per blood group
per area per hour**. Two requests for `O+` in Lucknow an hour apart send one
batch, not two. An `A+` request in the same hour is unaffected.

To turn throttling off while testing, set `ALERT_COOLDOWN_SECONDS` to `0` at
the top of `Code.gs` and redeploy.

### If alerts are not arriving

Check the Apps Script execution log. It reports the cause directly:

| Log line | Cause |
|----------|-------|
| `Email alerts skipped: the Donors sheet is missing the column(s) Email, EmailConsent` | The sheet has no header for those columns |
| `Matching consenting donors: 0` | No donor matched the blood group and area |
| `Email alerts suppressed for ... a batch already went out` | Throttled — expected |
| `Daily email quota exhausted` | 100 emails already used today |
| `Email failed for ra***@...` | The address bounced or is invalid |

## Abuse protection

The public endpoints are protected by:

- a hidden honeypot field (`hpField`) that bots fill in and people never see,
- per-phone rate limits — 5 registrations and 3 emergency requests per phone
  per window, plus 5 consent withdrawals,
- a 10 second global cooldown per action,
- a per-area alert throttle so one request cannot exhaust the email quota,
- plain-text cell formatting on every write, so a name like
  `=IMPORTXML(...)` is stored as text instead of being executed by Sheets.

Phone numbers are masked in logs and in anything the website serves. Logs
use masked phone numbers and emails.

## Accessibility

Labelled inputs, `aria-live` status regions, radio groups inside
`fieldset`/`legend`, visible focus rings, a working skip target on
`#main-content`, and `prefers-reduced-motion` support.

## Team

- Aditya Gupta — Lead HTML Developer
- Ashwin — HTML Developer
- Ayush — CSS & JavaScript Developer
- Ayush Panwar — Project Coordinator & Documentation
