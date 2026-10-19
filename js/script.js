// Blood Donor Finder — frontend application logic
// Keep the Apps Script URL in sync with the deployed Google Apps Script web app.
const NODE_API_URL = "http://localhost:3000";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwExlMBAGM9PrCtF8-gtuKSHhBoO_yiIQu-awFa-kMORe0t2fOs_gxatIaQouH-dp8P/exec";

// ---------- API helpers ----------

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchDonorsFromBackend() {
  try {
    const data = await requestJson(
      `${APPS_SCRIPT_URL}?action=getDonors`,
      { method: "GET" }
    );

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Fetch donors error:", error);
    return null;
  }
}

async function searchDonorsFromBackend(
  bloodGroup,
  state,
  district
) {
  try {
    const params = new URLSearchParams({
      action: "searchDonors"
    });

    if (bloodGroup) params.set("bloodGroup", bloodGroup);
    if (state) params.set("state", state);
    if (district) params.set("district", district);

    const data = await requestJson(
      `${APPS_SCRIPT_URL}?${params.toString()}`
    );

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Search donors error:", error);
    return null;
  }
}

async function registerDonorToBackend(donorData) {
  try {
    return await requestJson(`${NODE_API_URL}/api/donors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(donorData)
    });
  } catch (error) {
    console.error("Register error:", error);

    return {
      success: false,
      error: error.message || "Network or server error"
    };
  }
}

async function submitEmergencyToBackend(requestData) {
  try {
    return await requestJson(
      `${NODE_API_URL}/api/emergency-requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestData)
      }
    );
  } catch (error) {
    console.error("Emergency request error:", error);

    return {
      success: false,
      error: error.message || "Network or server error"
    };
  }
}


async function withdrawConsentFromBackend(phone) {
  try {
    return await requestJson(
      `${NODE_API_URL}/api/donors/withdraw-consent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: normalizePhoneInput(phone)
        })
      }
    );
  } catch (error) {
    console.error("Withdraw consent error:", error);

    return {
      success: false,
      error: error.message || "Network or server error"
    };
  }
}


// Returns null (not []) on failure so callers can tell "backend down"
// apart from "there is genuinely nothing to show".
async function fetchNotificationsFromBackend() {
  try {
    const data = await requestJson(
      `${APPS_SCRIPT_URL}?action=getNotifications`
    );

    if (!data || data.success !== true) {
      throw new Error(
        (data && data.error) || "Unexpected response shape."
      );
    }

    return Array.isArray(data.notifications)
      ? data.notifications
      : [];

  } catch (error) {
    console.error("Fetch notifications error:", error);

    return null;
  }
}

// ---------- Validation and UI helpers ----------

// These limits mirror the server-side rules in Code.gs on purpose.
// Keep both files in sync or users will hit unexplained rejections.
const NAME_MAX = 80;
const LOCATION_MAX = 200;
const MESSAGE_MAX = 1000;

function formatName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word.charAt(0).toUpperCase() +
      word.slice(1).toLowerCase()
    )
    .join(" ");
}

function validateName(name) {
  const value = String(name || "").trim();

  if (!value) {
    return {
      valid: false,
      msg: "Name is required."
    };
  }

  if (value.length < 2) {
    return {
      valid: false,
      msg: "Name must be at least 2 characters."
    };
  }

  if (value.length > NAME_MAX) {
    return {
      valid: false,
      msg: `Name must be ${NAME_MAX} characters or fewer.`
    };
  }

  if (!/^[a-zA-Z ]+$/.test(value)) {
    return {
      valid: false,
      msg: "Use English letters and spaces only."
    };
  }

  return {
    valid: true,
    msg: ""
  };
}

function validateLocation(location) {
  const value = String(location || "").trim();

  if (!value) {
    return {
      valid: false,
      msg: "Location is required."
    };
  }

  if (value.length > LOCATION_MAX) {
    return {
      valid: false,
      msg: `Location must be ${LOCATION_MAX} characters or fewer.`
    };
  }

  return {
    valid: true,
    msg: ""
  };
}

// Accepts what people actually paste: "98765 43210", "+91 98765 43210",
// "(98765) 43210". The server only ever receives a bare 10-digit number.
function normalizePhoneInput(phone) {
  let digits = String(phone || "").replace(/\D/g, "");

  if (digits.length > 10 && digits.slice(0, 2) === "91") {
    digits = digits.slice(2);
  }

  return digits.slice(0, 10);
}

// Rewrites a field in place while keeping the caret where the user left it.
// Without this, reformatting on every keystroke throws the caret to the end.
function applyFormatKeepingCaret(input, formatted) {
  const caret = input.selectionStart;

  if (input.value === formatted) return;

  const delta = formatted.length - input.value.length;

  input.value = formatted;

  if (caret == null) return;

  const next = Math.min(
    Math.max(caret + delta, 0),
    formatted.length
  );

  input.setSelectionRange(next, next);
}

function validateAge(age) {
  if (age === "" || age === null || age === undefined) {
    return {
      valid: false,
      msg: "Age is required."
    };
  }

  const number = Number(age);

  if (!Number.isInteger(number) || number < 18 || number > 65) {
    return {
      valid: false,
      msg: "Age must be a whole number from 18 to 65."
    };
  }

  return {
    valid: true,
    msg: ""
  };
}

function validatePhone(phone) {
  const value = normalizePhoneInput(phone);

  if (!value) {
    return {
      valid: false,
      msg: "Phone number is required."
    };
  }

  if (!/^[6-9]\d{9}$/.test(value)) {
    return {
      valid: false,
      msg: "Enter a valid 10-digit Indian mobile number."
    };
  }

  return {
    valid: true,
    msg: ""
  };
}

function validateEmail(email, consent) {
  const value = String(email || "").trim();

  if (!value && consent) {
    return {
      valid: false,
      msg: "Enter your email to receive emergency alerts."
    };
  }

  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return {
      valid: false,
      msg: "Enter a valid email address."
    };
  }

  return {
    valid: true,
    msg: ""
  };
}

// Toggles modifier classes instead of replacing className, so the
// page-specific base class on the element survives every update.
function setFieldMsg(element, valid, text) {
  if (!element) return;

  element.textContent = text || "";
  element.classList.remove("valid", "invalid");
  element.classList.add(valid ? "valid" : "invalid");
}

function setStatus(element, text, type = "") {
  if (!element) return;

  element.textContent = text;
  element.classList.remove("error", "success");

  if (type === "error" || type === "success") {
    element.classList.add(type);
  }
}

function getCheckedBloodGroup(form) {
  return (
    form.querySelector(
      'input[name="bloodGroup"]:checked'
    )?.value || ""
  );
}

function setButtonBusy(
  form,
  busy,
  busyLabel = "Please wait..."
) {
  const button = form.querySelector(
    'button[type="submit"], input[type="submit"]'
  );

  if (!button) return () => { };

  const originalText =
    button.tagName === "INPUT"
      ? button.value
      : button.textContent;

  button.disabled = busy;

  if (button.tagName === "INPUT") {
    button.value = busy ? busyLabel : originalText;
  } else {
    button.textContent = busy ? busyLabel : originalText;
  }

  return () => {
    button.disabled = false;

    if (button.tagName === "INPUT") {
      button.value = originalText;
    } else {
      button.textContent = originalText;
    }
  };
}

// ---------- Find donor page ----------

async function initFindDonor() {
  const form = document.getElementById("search-form");
  const bloodGroupInput =
    document.getElementById("blood-group");
  const stateInput = document.getElementById("state");
  const districtInput = document.getElementById("district");
  const message = document.getElementById("results-message");
  const grid = document.getElementById("donors-grid");

  if (
    !form ||
    !bloodGroupInput ||
    !stateInput ||
    !districtInput
  ) {
    return;
  }

  populateStateDropdown(stateInput);

  const refreshDistricts = setupDistrictDependent(
    stateInput,
    districtInput
  );

  // Remembers the unfiltered listing so "Clear Filters" can restore it
  // without spending another backend call.
  let fullListing = [];

  function setGridBusy(busy) {
    if (grid) {
      grid.setAttribute("aria-busy", busy ? "true" : "false");
    }
  }

  setGridBusy(true);
  setStatus(message, "Loading donor listings...");

  const donors = await fetchDonorsFromBackend();

  if (donors === null) {
    fullListing = [];
    setGridBusy(false);

    displayDonors([]);

    setStatus(
      message,
      "Donor listings could not be loaded. Check your connection and try again.",
      "error"
    );

  } else {
    fullListing = donors;
    setGridBusy(false);

    displayDonors(donors);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const restoreButton = setButtonBusy(
      form,
      true,
      "Searching..."
    );

    setGridBusy(true);
    setStatus(message, "Searching for donors...");

    const results = await searchDonorsFromBackend(
      bloodGroupInput.value,
      stateInput.value,
      districtInput.value
    );

    setGridBusy(false);
    restoreButton();

    if (results === null) {
      displayDonors([]);

      setStatus(
        message,
        "Search failed. Please check your connection and try again.",
        "error"
      );

      return;
    }

    displayDonors(results);
  });

  // A native reset restores the select boxes but never fires "change",
  // so the district list has to be rebuilt by hand.
  form.addEventListener("reset", () => {
    setTimeout(() => {
      refreshDistricts();

      setStatus(
        message,
        fullListing.length > 0
          ? `Filters cleared. Showing all ${fullListing.length} donor(s).`
          : "Filters cleared.",
        fullListing.length > 0 ? "success" : ""
      );

      if (fullListing.length > 0) {
        displayDonors(fullListing);
      }
    }, 0);
  });
}

// ---------- Register donor page ----------

function initRegister() {
  const form = document.getElementById("register-form");

  if (!form) return;

  const message = document.getElementById("register-message");
  const stateInput = document.getElementById("donor-state");
  const districtInput =
    document.getElementById("donor-district");
  const nameInput = document.getElementById("donor-name");
  const ageInput = document.getElementById("donor-age");
  const phoneInput = document.getElementById("donor-phone");
  const emailInput = document.getElementById("donor-email");
  const emailConsentInput = document.getElementById("donor-email-consent");
  const emailMessage = document.getElementById("donor-email-msg");


  if (
    !stateInput ||
    !districtInput ||
    !nameInput ||
    !ageInput ||
    !phoneInput
  ) {
    console.error(
      "Registration form is missing one or more required fields."
    );

    return;
  }

  populateStateDropdown(stateInput);

  const refreshDistricts = setupDistrictDependent(
    stateInput,
    districtInput
  );

  nameInput.addEventListener("input", () => {
    applyFormatKeepingCaret(nameInput, formatName(nameInput.value));

    const result = validateName(nameInput.value);

    setFieldMsg(
      document.getElementById("donor-name-msg"),
      result.valid,
      result.msg
    );
  });

  ageInput.addEventListener("input", () => {
    const result = validateAge(ageInput.value);

    setFieldMsg(
      document.getElementById("donor-age-msg"),
      result.valid,
      result.msg
    );
  });

  phoneInput.addEventListener("input", () => {
    phoneInput.value = normalizePhoneInput(phoneInput.value);

    const result = validatePhone(phoneInput.value);

    setFieldMsg(
      document.getElementById("donor-phone-msg"),
      result.valid,
      result.msg
    );
  });

  form
    .querySelectorAll('input[name="bloodGroup"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        setFieldMsg(
          document.getElementById("donor-blood-msg"),
          true,
          ""
        );
      });
    });

  stateInput.addEventListener("change", () => {
    const valid = Boolean(stateInput.value);

    setFieldMsg(
      document.getElementById("donor-state-msg"),
      valid,
      valid ? "" : "Select a state."
    );

    setFieldMsg(
      document.getElementById("donor-district-msg"),
      false,
      ""
    );
  });

  districtInput.addEventListener("change", () => {
    const valid = Boolean(districtInput.value);

    setFieldMsg(
      document.getElementById("donor-district-msg"),
      valid,
      valid ? "" : "Select a district."
    );
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    const age = ageInput.value;
    const bloodGroup = getCheckedBloodGroup(form);
    const state = stateInput.value;
    const district = districtInput.value;
    const phone = normalizePhoneInput(phoneInput.value);

    // Bots fill every field they can find; people never see this one.
    const honeypot = document.getElementById("hp-field");

    if (honeypot && honeypot.value) {
      setStatus(
        message,
        "Registration failed. Please try again.",
        "error"
      );

      return;
    }

    const nameCheck = validateName(name);
    const ageCheck = validateAge(age);
    const phoneCheck = validatePhone(phone);

    const bloodOk = Boolean(bloodGroup);
    const stateOk = Boolean(state);
    const districtOk = Boolean(district);

    setFieldMsg(
      document.getElementById("donor-name-msg"),
      nameCheck.valid,
      nameCheck.msg
    );

    setFieldMsg(
      document.getElementById("donor-age-msg"),
      ageCheck.valid,
      ageCheck.msg
    );

    setFieldMsg(
      document.getElementById("donor-phone-msg"),
      phoneCheck.valid,
      phoneCheck.msg
    );

    setFieldMsg(
      document.getElementById("donor-blood-msg"),
      bloodOk,
      bloodOk ? "" : "Select a blood group."
    );

    setFieldMsg(
      document.getElementById("donor-state-msg"),
      stateOk,
      stateOk ? "" : "Select a state."
    );

    setFieldMsg(
      document.getElementById("donor-district-msg"),
      districtOk,
      districtOk ? "" : "Select a district."
    );

    const email = emailInput ? emailInput.value.trim() : "";
    const emailConsent = emailConsentInput
      ? emailConsentInput.checked
      : false;

    const emailCheck = validateEmail(email, emailConsent);

    setFieldMsg(
      emailMessage,
      emailCheck.valid,
      emailCheck.msg
    );

    if (
      !(
        nameCheck.valid &&
        phoneCheck.valid &&
        ageCheck.valid &&
        bloodOk &&
        stateOk &&
        districtOk &&
        emailCheck.valid
      )
    ) {
      setStatus(
        message,
        "Please fill in all required fields correctly.",
        "error"
      );
      return;
    }

    const restoreButton = setButtonBusy(
      form,
      true,
      "Registering..."
    );

    setStatus(message, "Submitting your registration...");

    try {
      const result = await registerDonorToBackend({
        name,
        age: Number.parseInt(age, 10),
        bloodGroup,
        state,
        district,
        phone,
        email,
        emailConsent
      });

      if (result && result.success) {
        setStatus(
          message,
          "Registration submitted successfully.",
          "success"
        );

        form.reset();

        [
          "donor-name-msg",
          "donor-age-msg",
          "donor-phone-msg",
          "donor-blood-msg",
          "donor-state-msg",
          "donor-district-msg"
        ].forEach((id) => {
          setFieldMsg(document.getElementById(id), true, "");
        });

        // form.reset() does not fire "change", so the district list is
        // rebuilt explicitly.
        refreshDistricts();

      } else {
        setStatus(
          message,
          (result && result.error) ||
            "Registration failed. Please try again.",
          "error"
        );
      }
    } catch (error) {
      console.error("Registration submission error:", error);

      setStatus(
        message,
        "Registration failed. Please try again.",
        "error"
      );
    } finally {
      restoreButton();
    }
  });
}

// ---------- Emergency page ----------

function initEmergency() {
  const form = document.getElementById("emergency-form");

  if (!form) return;

  const message = document.getElementById("emergency-message");
  const nameInput = document.getElementById("patient-name");
  const phoneInput = document.getElementById("emergency-phone");
  const locationInput =
    document.getElementById("emergency-location");
  const stateInput = document.getElementById("emergency-state");
  const districtInput =
    document.getElementById("emergency-district");

  if (!nameInput || !phoneInput || !locationInput) {
    console.error(
      "Emergency form is missing one or more required fields."
    );

    return;
  }

  const detailsInput = document.getElementById(
    "emergency-message-details"
  );

  if (detailsInput) {
    // Keep the markup and the shared limit from drifting apart.
    detailsInput.maxLength = MESSAGE_MAX;
  }

  let refreshDistricts = null;

  if (stateInput && districtInput) {
    populateStateDropdown(stateInput);

    refreshDistricts = setupDistrictDependent(
      stateInput,
      districtInput
    );
  }

  nameInput.addEventListener("input", () => {
    applyFormatKeepingCaret(nameInput, formatName(nameInput.value));

    const result = validateName(nameInput.value);

    setFieldMsg(
      document.getElementById("patient-name-msg"),
      result.valid,
      result.msg
    );
  });

  phoneInput.addEventListener("input", () => {
    phoneInput.value = normalizePhoneInput(phoneInput.value);

    const result = validatePhone(phoneInput.value);

    setFieldMsg(
      document.getElementById("emergency-phone-msg"),
      result.valid,
      result.msg
    );
  });

  locationInput.addEventListener("input", () => {
    const result = validateLocation(locationInput.value);

    setFieldMsg(
      document.getElementById("emergency-location-msg"),
      result.valid,
      result.msg
    );
  });

  if (stateInput) {
    stateInput.addEventListener("change", () => {
      const valid = Boolean(stateInput.value);

      setFieldMsg(
        document.getElementById("emergency-state-msg"),
        valid,
        valid ? "" : "Select a state."
      );

      setFieldMsg(
        document.getElementById("emergency-district-msg"),
        false,
        ""
      );
    });
  }

  if (districtInput) {
    districtInput.addEventListener("change", () => {
      const valid = Boolean(districtInput.value);

      setFieldMsg(
        document.getElementById("emergency-district-msg"),
        valid,
        valid ? "" : "Select a district."
      );
    });
  }

  form
    .querySelectorAll('input[name="bloodGroup"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        setFieldMsg(
          document.getElementById("emergency-blood-msg"),
          true,
          ""
        );
      });
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const patientName = nameInput.value.trim();
    const bloodGroup = getCheckedBloodGroup(form);
    const location = locationInput.value.trim();
    const phone = normalizePhoneInput(phoneInput.value);
    const state = stateInput ? stateInput.value : "";
    const district = districtInput ? districtInput.value : "";

    // Bots fill every field they can find; people never see this one.
    const honeypot = document.getElementById("hp-field");

    if (honeypot && honeypot.value) {
      setStatus(
        message,
        "Request submission failed. Please try again.",
        "error"
      );

      return;
    }

    const nameCheck = validateName(patientName);
    const phoneCheck = validatePhone(phone);
    const locationCheck = validateLocation(location);

    const bloodOk = Boolean(bloodGroup);

    setFieldMsg(
      document.getElementById("patient-name-msg"),
      nameCheck.valid,
      nameCheck.msg
    );

    setFieldMsg(
      document.getElementById("emergency-phone-msg"),
      phoneCheck.valid,
      phoneCheck.msg
    );

    setFieldMsg(
      document.getElementById("emergency-blood-msg"),
      bloodOk,
      bloodOk ? "" : "Select a blood group."
    );

    setFieldMsg(
      document.getElementById("emergency-location-msg"),
      locationCheck.valid,
      locationCheck.msg
    );

    if (
      !(
        nameCheck.valid &&
        phoneCheck.valid &&
        bloodOk &&
        locationCheck.valid
      )
    ) {
      setStatus(
        message,
        "Please fill in all required fields correctly.",
        "error"
      );

      return;
    }

    const restoreButton = setButtonBusy(
      form,
      true,
      "Submitting..."
    );

    setStatus(message, "Submitting your request...");

    try {
      const result = await submitEmergencyToBackend({
        patientName,
        bloodGroup,
        location,
        phone,
        state,
        district,
        message: detailsInput
          ? detailsInput.value.trim()
          : ""
      });

      if (result && result.success) {
        setStatus(
          message,
          "Your request was submitted. This website does not automatically guarantee donor contact. In an emergency, contact local emergency services or a hospital.",
          "success"
        );

        form.reset();

        if (refreshDistricts) {
          refreshDistricts();
        }

        [
          "patient-name-msg",
          "emergency-phone-msg",
          "emergency-blood-msg",
          "emergency-location-msg",
          "emergency-state-msg",
          "emergency-district-msg"
        ].forEach((id) => {
          setFieldMsg(document.getElementById(id), true, "");
        });
      } else {
        setStatus(
          message,
          (result && result.error) ||
            "Request submission failed. Please try again.",
          "error"
        );
      }
    } catch (error) {
      console.error("Emergency submission error:", error);

      setStatus(
        message,
        "Request submission failed. Please try again.",
        "error"
      );
    } finally {
      restoreButton();
    }
  });
}

// ---------- Consent withdrawal ----------

function initWithdrawConsent() {
  const form = document.getElementById("withdraw-form");

  if (!form) return;

  const phoneInput = document.getElementById("withdraw-phone");
  const message = document.getElementById("withdraw-message");

  if (!phoneInput) return;

  phoneInput.addEventListener("input", () => {
    phoneInput.value = normalizePhoneInput(phoneInput.value);

    const result = validatePhone(phoneInput.value);

    setFieldMsg(
      document.getElementById("withdraw-phone-msg"),
      result.valid,
      result.msg
    );
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const phone = normalizePhoneInput(phoneInput.value);
    const check = validatePhone(phone);

    setFieldMsg(
      document.getElementById("withdraw-phone-msg"),
      check.valid,
      check.msg
    );

    if (!check.valid) {
      setStatus(
        message,
        "Enter the mobile number you registered with.",
        "error"
      );

      return;
    }

    const restoreButton = setButtonBusy(
      form,
      true,
      "Updating..."
    );

    setStatus(message, "Withdrawing consent...");

    try {
      const result = await withdrawConsentFromBackend(phone);

      if (result && result.success) {
        setStatus(
          message,
          result.message ||
            "Email alert consent has been withdrawn.",
          "success"
        );

        form.reset();

        setFieldMsg(
          document.getElementById("withdraw-phone-msg"),
          true,
          ""
        );

      } else {
        setStatus(
          message,
          (result && result.error) ||
            "Could not withdraw consent. Please try again.",
          "error"
        );
      }
    } catch (error) {
      console.error("Withdraw consent error:", error);

      setStatus(
        message,
        "Could not withdraw consent. Please try again.",
        "error"
      );
    } finally {
      restoreButton();
    }
  });
}

// ---------- Navigation and safe donor rendering ----------

function highlightActiveNav() {
  const currentPage =
    window.location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".nav-links a").forEach((link) => {
    const href = link.getAttribute("href");

    if (href === currentPage) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    } else {
      link.classList.remove("active");
      link.removeAttribute("aria-current");
    }
  });
}

function displayDonors(donors) {
  const grid = document.getElementById("donors-grid");
  const message = document.getElementById("results-message");

  if (!grid) return;

  grid.replaceChildren();

  if (!Array.isArray(donors) || donors.length === 0) {
    setStatus(
      message,
      "No donors found matching your criteria.",
      "error"
    );

    return;
  }

  setStatus(
    message,
    `Found ${donors.length} donor(s).`,
    "success"
  );

  donors.forEach((donor) => {
    // Render backend data as text, not executable HTML.
    const card = document.createElement("article");
    card.className = "donor-card";

    const heading = document.createElement("h3");
    heading.textContent = String(donor.name || "Donor");

    const blood = document.createElement("span");
    blood.className = "blood-group-badge";
    blood.textContent = String(
      donor.bloodGroup || "Not provided"
    );

    const age = document.createElement("p");
    age.className = "detail";
    age.textContent = `Age: ${donor.age ?? "Not provided"}`;

    const location = document.createElement("p");
    location.className = "detail";
    location.textContent =
      `District: ${String(donor.district || "Not provided")}, ` +
      `${String(donor.state || "Not provided")}`;

    card.append(heading, blood, age, location);

    const phone = String(donor.phone || "");

    if (/^[6-9]\d{9}$/.test(phone)) {
      const actions = document.createElement("div");
      actions.className = "donor-card-actions";

      const call = document.createElement("a");
      call.href = `tel:+91${phone}`;
      call.textContent = "Call";
      call.setAttribute(
        "aria-label",
        `Call ${String(donor.name || "this donor")}`
      );

      const whatsapp = document.createElement("a");
      whatsapp.href =
        `https://wa.me/91${phone}` +
        `?text=${encodeURIComponent(
          "Hi, I found your contact in the Blood Donor Finder " +
          "directory and would like to discuss a blood donation."
        )}`;
      whatsapp.textContent = "WhatsApp";
      whatsapp.setAttribute("target", "_blank");
      whatsapp.setAttribute("rel", "noopener noreferrer");
      whatsapp.setAttribute(
        "aria-label",
        `Message ${String(donor.name || "this donor")} on WhatsApp`
      );

      actions.append(call, whatsapp);
      card.appendChild(actions);

    } else {
      const noPhone = document.createElement("p");
      noPhone.className = "detail";
      noPhone.textContent = "Phone: Not provided";

      card.appendChild(noPhone);
    }

    grid.appendChild(card);
  });
}

// ---------- Notifications ----------

function formatRelativeTime(isoString) {
  const then = new Date(isoString);

  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round(
    (Date.now() - then.getTime()) / 1000
  );

  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);

  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function displayNotifications(list) {
  const container =
    document.getElementById("notifications-list");

  if (!container) return;

  container.replaceChildren();

  if (!Array.isArray(list) || list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "notification-empty";
    empty.textContent =
      "No active blood requests right now.";

    container.appendChild(empty);

    return;
  }

  list.forEach((item) => {
    const article = document.createElement("article");
    article.className = "notification-item";

    const header = document.createElement("header");

    const heading = document.createElement("h3");
    heading.textContent = `${String(item.bloodGroup || "Unknown")} blood needed`;

    const time = document.createElement("time");
    time.className = "notification-time";
    time.dateTime = String(item.createdAt || "");
    time.textContent = formatRelativeTime(item.createdAt);

    header.append(heading, time);

    const location = document.createElement("p");
    location.textContent = `Location: ${String(item.location || "Not provided")}`;

    article.append(header, location);

    const contact = String(item.contact || "").trim();

    if (contact) {
      const contactLine = document.createElement("p");
      contactLine.className = "notification-contact";
      contactLine.textContent = `Contact: ${contact}`;

      const note = document.createElement("small");
      note.textContent =
        " (partial number — consenting donors receive the full number by email)";

      contactLine.appendChild(note);

      article.appendChild(contactLine);
    }

    const message = String(item.message || "").trim();

    if (message) {
      const detail = document.createElement("p");
      detail.textContent = message;

      article.appendChild(detail);
    }

    container.appendChild(article);
  });
}

function initNotifications() {
  const container =
    document.getElementById("notifications-list");

  if (!container) return;

  const status =
    document.getElementById("notifications-message");

  let refreshTimer = null;

  async function load() {
    container.setAttribute("aria-busy", "true");

    const list = await fetchNotificationsFromBackend();

    container.setAttribute("aria-busy", "false");

    if (list === null) {
      setStatus(
        status,
        "Live requests could not be loaded. Please refresh to try again.",
        "error"
      );

      // Keep polling; the outage is probably transient.
      return;
    }

    displayNotifications(list);

    setStatus(
      status,
      list.length > 0
        ? `Showing the ${list.length} most recent request(s).`
        : "",
      "success"
    );
  }

  setStatus(status, "Loading recent blood requests...");

  load();

  // Poll while the tab is visible so background tabs stay cheap.
  refreshTimer = setInterval(() => {
    if (document.visibilityState !== "hidden") {
      load();
    }
  }, 60000);

  window.addEventListener("pagehide", () => {
    if (refreshTimer) clearInterval(refreshTimer);
  });
}

// ---------- State / district data ----------


const stateDistricts = {
  "Andhra Pradesh": [
    "Alluri Sitharama Raju",
    "Anakapalli",
    "Anantapur",
    "Annamayya",
    "Bapatla",
    "Chittoor",
    "Dr. B. R. Ambedkar Konaseema",
    "East Godavari",
    "Eluru",
    "Guntur",
    "Kakinada",
    "Krishna",
    "Kurnool",
    "Nandyal",
    "Nellore",
    "NTR",
    "Palnadu",
    "Parvathipuram Manyam",
    "Prakasam",
    "Sri Potti Sriramulu Nellore",
    "Sri Sathya Sai",
    "Srikakulam",
    "Tirupati",
    "Visakhapatnam",
    "Vizianagaram",
    "West Godavari",
    "YSR Kadapa"
  ],

  "Arunachal Pradesh": [
    "Anjaw",
    "Changlang",
    "Dibang Valley",
    "East Kameng",
    "East Siang",
    "Itanagar Capital Complex",
    "Kamle",
    "Keyi Panyor",
    "Kra Daadi",
    "Kurung Kumey",
    "Lepa Rada",
    "Lohit",
    "Longding",
    "Lower Dibang Valley",
    "Lower Siang",
    "Lower Subansiri",
    "Namsai",
    "Pakke Kessang",
    "Papum Pare",
    "Shi Yomi",
    "Siang",
    "Tawang",
    "Tirap",
    "Upper Siang",
    "Upper Subansiri",
    "West Kameng",
    "West Siang"
  ],

  "Assam": [
    "Bajali",
    "Baksa",
    "Barpeta",
    "Biswanath",
    "Bongaigaon",
    "Cachar",
    "Charaideo",
    "Chirang",
    "Darrang",
    "Dhemaji",
    "Dhubri",
    "Dibrugarh",
    "Dima Hasao",
    "Goalpara",
    "Golaghat",
    "Hailakandi",
    "Hojai",
    "Jorhat",
    "Kamrup",
    "Kamrup Metropolitan",
    "Karbi Anglong",
    "Karimganj",
    "Kokrajhar",
    "Lakhimpur",
    "Majuli",
    "Morigaon",
    "Nagaon",
    "Nalbari",
    "Sivasagar",
    "Sonitpur",
    "South Salmara-Mankachar",
    "Tinsukia",
    "Udalguri",
    "West Karbi Anglong"
  ],

  "Bihar": [
    "Araria",
    "Arwal",
    "Aurangabad",
    "Banka",
    "Begusarai",
    "Bhagalpur",
    "Bhojpur",
    "Buxar",
    "Darbhanga",
    "East Champaran",
    "Gaya",
    "Gopalganj",
    "Jamui",
    "Jehanabad",
    "Kaimur",
    "Katihar",
    "Khagaria",
    "Kishanganj",
    "Lakhisarai",
    "Madhepura",
    "Madhubani",
    "Munger",
    "Muzaffarpur",
    "Nalanda",
    "Nawada",
    "Patna",
    "Purnia",
    "Rohtas",
    "Saharsa",
    "Samastipur",
    "Saran",
    "Sheikhpura",
    "Sheohar",
    "Sitamarhi",
    "Siwan",
    "Supaul",
    "Vaishali",
    "West Champaran"
  ],

  "Chandigarh": [
    "Chandigarh"
  ],

  "Chhattisgarh": [
    "Balod",
    "Baloda Bazar",
    "Balrampur",
    "Bastar",
    "Bemetara",
    "Bijapur",
    "Bilaspur",
    "Dantewada",
    "Dhamtari",
    "Durg",
    "Gariaband",
    "Gaurela-Pendra-Marwahi",
    "Janjgir-Champa",
    "Jashpur",
    "Kabirdham",
    "Kanker",
    "Khairagarh-Chhuikhadan-Gandai",
    "Kondagaon",
    "Korba",
    "Koriya",
    "Mahasamund",
    "Manendragarh-Chirmiri-Bharatpur",
    "Mohla-Manpur-Ambagarh Chowki",
    "Mungeli",
    "Narayanpur",
    "Raigarh",
    "Raipur",
    "Rajnandgaon",
    "Sakti",
    "Sarangarh-Bilaigarh",
    "Sukma",
    "Surajpur",
    "Surguja"
  ],

  "Delhi": [
    "Central Delhi",
    "East Delhi",
    "New Delhi",
    "North Delhi",
    "North East Delhi",
    "North West Delhi",
    "Shahdara",
    "South Delhi",
    "South East Delhi",
    "South West Delhi",
    "West Delhi"
  ],

  "Goa": [
    "North Goa",
    "South Goa"
  ],

  "Gujarat": [
    "Ahmedabad",
    "Amreli",
    "Anand",
    "Aravalli",
    "Banaskantha",
    "Bharuch",
    "Bhavnagar",
    "Botad",
    "Chhota Udaipur",
    "Dahod",
    "Dang",
    "Devbhoomi Dwarka",
    "Gandhinagar",
    "Gir Somnath",
    "Jamnagar",
    "Junagadh",
    "Kheda",
    "Kutch",
    "Mahisagar",
    "Mehsana",
    "Morbi",
    "Narmada",
    "Navsari",
    "Panchmahal",
    "Patan",
    "Porbandar",
    "Rajkot",
    "Sabarkantha",
    "Surat",
    "Surendranagar",
    "Tapi",
    "Vadodara",
    "Valsad"
  ],

  "Haryana": [
    "Ambala",
    "Bhiwani",
    "Charkhi Dadri",
    "Faridabad",
    "Fatehabad",
    "Gurugram",
    "Hisar",
    "Jhajjar",
    "Jind",
    "Kaithal",
    "Karnal",
    "Kurukshetra",
    "Mahendragarh",
    "Nuh",
    "Palwal",
    "Panchkula",
    "Panipat",
    "Rewari",
    "Rohtak",
    "Sirsa",
    "Sonipat",
    "Yamunanagar"
  ],

  "Himachal Pradesh": [
    "Bilaspur",
    "Chamba",
    "Hamirpur",
    "Kangra",
    "Kinnaur",
    "Kullu",
    "Lahaul and Spiti",
    "Mandi",
    "Shimla",
    "Sirmaur",
    "Solan",
    "Una"
  ],

  "Jammu and Kashmir": [
    "Anantnag",
    "Bandipora",
    "Baramulla",
    "Budgam",
    "Doda",
    "Ganderbal",
    "Jammu",
    "Kathua",
    "Kishtwar",
    "Kulgam",
    "Kupwara",
    "Poonch",
    "Pulwama",
    "Rajouri",
    "Ramban",
    "Reasi",
    "Samba",
    "Shopian",
    "Srinagar",
    "Udhampur"
  ],

  "Jharkhand": [
    "Bokaro",
    "Chatra",
    "Deoghar",
    "Dhanbad",
    "Dumka",
    "East Singhbhum",
    "Garhwa",
    "Giridih",
    "Godda",
    "Gumla",
    "Hazaribagh",
    "Jamtara",
    "Khunti",
    "Koderma",
    "Latehar",
    "Lohardaga",
    "Pakur",
    "Palamu",
    "Ramgarh",
    "Ranchi",
    "Sahebganj",
    "Seraikela-Kharsawan",
    "Simdega",
    "West Singhbhum"
  ],

  "Karnataka": [
    "Bagalkot",
    "Ballari",
    "Belagavi",
    "Bengaluru Rural",
    "Bengaluru Urban",
    "Bidar",
    "Chamarajanagar",
    "Chikkaballapur",
    "Chikkamagaluru",
    "Chitradurga",
    "Dakshina Kannada",
    "Davanagere",
    "Dharwad",
    "Gadag",
    "Hassan",
    "Haveri",
    "Kalaburagi",
    "Kodagu",
    "Kolar",
    "Koppal",
    "Mandya",
    "Mysuru",
    "Raichur",
    "Ramanagara",
    "Shivamogga",
    "Tumakuru",
    "Udupi",
    "Uttara Kannada",
    "Vijayanagara",
    "Vijayapura",
    "Yadgir"
  ],

  "Kerala": [
    "Alappuzha",
    "Ernakulam",
    "Idukki",
    "Kannur",
    "Kasaragod",
    "Kollam",
    "Kottayam",
    "Kozhikode",
    "Malappuram",
    "Palakkad",
    "Pathanamthitta",
    "Thiruvananthapuram",
    "Thrissur",
    "Wayanad"
  ],

  "Ladakh": [
    "Kargil",
    "Leh"
  ],

  "Lakshadweep": [
    "Agatti",
    "Amini",
    "Andrott",
    "Bitra",
    "Chetlat",
    "Kadmat",
    "Kalpeni",
    "Kavaratti",
    "Kiltan",
    "Minicoy"
  ],

  "Madhya Pradesh": [
    "Agar Malwa",
    "Alirajpur",
    "Anuppur",
    "Ashoknagar",
    "Balaghat",
    "Barwani",
    "Betul",
    "Bhind",
    "Bhopal",
    "Burhanpur",
    "Chhatarpur",
    "Chhindwara",
    "Damoh",
    "Datia",
    "Dewas",
    "Dhar",
    "Dindori",
    "Guna",
    "Gwalior",
    "Harda",
    "Indore",
    "Jabalpur",
    "Jhabua",
    "Katni",
    "Khandwa",
    "Khargone",
    "Maihar",
    "Mandla",
    "Mandsaur",
    "Mauganj",
    "Morena",
    "Narmadapuram",
    "Narsinghpur",
    "Neemuch",
    "Niwari",
    "Pandhurna",
    "Panna",
    "Raisen",
    "Rajgarh",
    "Ratlam",
    "Rewa",
    "Sagar",
    "Satna",
    "Sehore",
    "Seoni",
    "Shahdol",
    "Shajapur",
    "Sheopur",
    "Shivpuri",
    "Sidhi",
    "Singrauli",
    "Tikamgarh",
    "Ujjain",
    "Umaria",
    "Vidisha"
  ],

  "Maharashtra": [
    "Ahilyanagar",
    "Akola",
    "Amravati",
    "Beed",
    "Bhandara",
    "Buldhana",
    "Chandrapur",
    "Chhatrapati Sambhajinagar",
    "Dharashiv",
    "Dhule",
    "Gadchiroli",
    "Gondia",
    "Hingoli",
    "Jalgaon",
    "Jalna",
    "Kolhapur",
    "Latur",
    "Mumbai City",
    "Mumbai Suburban",
    "Nagpur",
    "Nanded",
    "Nandurbar",
    "Nashik",
    "Palghar",
    "Parbhani",
    "Pune",
    "Raigad",
    "Ratnagiri",
    "Sangli",
    "Satara",
    "Sindhudurg",
    "Solapur",
    "Thane",
    "Wardha",
    "Washim",
    "Yavatmal"
  ],

  "Manipur": [
    "Bishnupur",
    "Chandel",
    "Churachandpur",
    "Imphal East",
    "Imphal West",
    "Jiribam",
    "Kakching",
    "Kamjong",
    "Kangpokpi",
    "Noney",
    "Pherzawl",
    "Senapati",
    "Tamenglong",
    "Tengnoupal",
    "Thoubal",
    "Ukhrul"
  ],

  "Meghalaya": [
    "East Garo Hills",
    "East Jaintia Hills",
    "East Khasi Hills",
    "Eastern West Khasi Hills",
    "North Garo Hills",
    "Ri-Bhoi",
    "South Garo Hills",
    "South West Garo Hills",
    "South West Khasi Hills",
    "West Garo Hills",
    "West Jaintia Hills",
    "West Khasi Hills"
  ],

  "Mizoram": [
    "Aizawl",
    "Champhai",
    "Hnahthial",
    "Khawzawl",
    "Kolasib",
    "Lawngtlai",
    "Lunglei",
    "Mamit",
    "Saiha",
    "Saitual",
    "Serchhip"
  ],

  "Nagaland": [
    "Chumoukedima",
    "Dimapur",
    "Kiphire",
    "Kohima",
    "Longleng",
    "Mokokchung",
    "Mon",
    "Niuland",
    "Noklak",
    "Peren",
    "Phek",
    "Shamator",
    "Tseminyu",
    "Tuensang",
    "Wokha",
    "Zunheboto"
  ],

  "Odisha": [
    "Angul",
    "Balangir",
    "Balasore",
    "Bargarh",
    "Bhadrak",
    "Boudh",
    "Cuttack",
    "Deogarh",
    "Dhenkanal",
    "Gajapati",
    "Ganjam",
    "Jagatsinghpur",
    "Jajpur",
    "Jharsuguda",
    "Kalahandi",
    "Kandhamal",
    "Kendrapara",
    "Kendujhar",
    "Khordha",
    "Koraput",
    "Malkangiri",
    "Mayurbhanj",
    "Nabarangpur",
    "Nayagarh",
    "Nuapada",
    "Puri",
    "Rayagada",
    "Sambalpur",
    "Subarnapur",
    "Sundargarh"
  ],

  "Puducherry": [
    "Karaikal",
    "Mahe",
    "Puducherry",
    "Yanam"
  ],

  "Punjab": [
    "Amritsar",
    "Barnala",
    "Bathinda",
    "Faridkot",
    "Fatehgarh Sahib",
    "Fazilka",
    "Ferozepur",
    "Gurdaspur",
    "Hoshiarpur",
    "Jalandhar",
    "Kapurthala",
    "Ludhiana",
    "Malerkotla",
    "Mansa",
    "Moga",
    "Pathankot",
    "Patiala",
    "Rupnagar",
    "Sahibzada Ajit Singh Nagar",
    "Sangrur",
    "Shaheed Bhagat Singh Nagar",
    "Sri Muktsar Sahib",
    "Tarn Taran"
  ],

  "Rajasthan": [
    "Ajmer",
    "Alwar",
    "Balotra",
    "Banswara",
    "Baran",
    "Barmer",
    "Beawar",
    "Bharatpur",
    "Bhilwara",
    "Bikaner",
    "Bundi",
    "Chittorgarh",
    "Churu",
    "Dausa",
    "Deeg",
    "Dholpur",
    "Didwana-Kuchaman",
    "Dudu",
    "Dungarpur",
    "Gangapur City",
    "Hanumangarh",
    "Jaipur",
    "Jaipur Rural",
    "Jaisalmer",
    "Jalore",
    "Jhalawar",
    "Jhunjhunu",
    "Jodhpur",
    "Jodhpur Rural",
    "Karauli",
    "Kekri",
    "Khairthal-Tijara",
    "Kota",
    "Kotputli-Behror",
    "Nagaur",
    "Neem Ka Thana",
    "Pali",
    "Phalodi",
    "Pratapgarh",
    "Rajsamand",
    "Salumbar",
    "Sanchore",
    "Sawai Madhopur",
    "Shahpura",
    "Sikar",
    "Sirohi",
    "Sri Ganganagar",
    "Tonk",
    "Udaipur"
  ],

  "Sikkim": [
    "Gangtok",
    "Gyalshing",
    "Mangan",
    "Namchi",
    "Pakyong",
    "Soreng"
  ],

  "Tamil Nadu": [
    "Ariyalur",
    "Chengalpattu",
    "Chennai",
    "Coimbatore",
    "Cuddalore",
    "Dharmapuri",
    "Dindigul",
    "Erode",
    "Kallakurichi",
    "Kanchipuram",
    "Kanniyakumari",
    "Karur",
    "Krishnagiri",
    "Madurai",
    "Mayiladuthurai",
    "Nagapattinam",
    "Namakkal",
    "Nilgiris",
    "Perambalur",
    "Pudukkottai",
    "Ramanathapuram",
    "Ranipet",
    "Salem",
    "Sivaganga",
    "Tenkasi",
    "Thanjavur",
    "Theni",
    "Thoothukudi",
    "Tiruchirappalli",
    "Tirunelveli",
    "Tirupathur",
    "Tiruppur",
    "Tiruvallur",
    "Tiruvannamalai",
    "Tiruvarur",
    "Vellore",
    "Viluppuram",
    "Virudhunagar"
  ],

  "Telangana": [
    "Adilabad",
    "Bhadradri Kothagudem",
    "Hanumakonda",
    "Hyderabad",
    "Jagtial",
    "Jangaon",
    "Jayashankar Bhupalpally",
    "Jogulamba Gadwal",
    "Kamareddy",
    "Karimnagar",
    "Khammam",
    "Komaram Bheem Asifabad",
    "Mahabubabad",
    "Mahabubnagar",
    "Mancherial",
    "Medak",
    "Medchal-Malkajgiri",
    "Mulugu",
    "Nagarkurnool",
    "Nalgonda",
    "Narayanpet",
    "Nirmal",
    "Nizamabad",
    "Peddapalli",
    "Rajanna Sircilla",
    "Rangareddy",
    "Sangareddy",
    "Siddipet",
    "Suryapet",
    "Vikarabad",
    "Wanaparthy",
    "Warangal",
    "Yadadri Bhuvanagiri"
  ],

  "Tripura": [
    "Dhalai",
    "Gomati",
    "Khowai",
    "North Tripura",
    "Sepahijala",
    "South Tripura",
    "Unakoti",
    "West Tripura"
  ],

  "Uttar Pradesh": [
    "Agra",
    "Aligarh",
    "Ambedkar Nagar",
    "Amethi",
    "Amroha",
    "Auraiya",
    "Ayodhya",
    "Azamgarh",
    "Baghpat",
    "Bahraich",
    "Ballia",
    "Balrampur",
    "Banda",
    "Barabanki",
    "Bareilly",
    "Basti",
    "Bhadohi",
    "Bijnor",
    "Budaun",
    "Bulandshahr",
    "Chandauli",
    "Chitrakoot",
    "Deoria",
    "Etah",
    "Etawah",
    "Farrukhabad",
    "Fatehpur",
    "Firozabad",
    "Gautam Buddha Nagar",
    "Ghaziabad",
    "Ghazipur",
    "Gonda",
    "Gorakhpur",
    "Hamirpur",
    "Hapur",
    "Hardoi",
    "Hathras",
    "Jalaun",
    "Jaunpur",
    "Jhansi",
    "Kannauj",
    "Kanpur Dehat",
    "Kanpur Nagar",
    "Kasganj",
    "Kaushambi",
    "Kheri",
    "Kushinagar",
    "Lalitpur",
    "Lucknow",
    "Maharajganj",
    "Mahoba",
    "Mainpuri",
    "Mathura",
    "Mau",
    "Meerut",
    "Mirzapur",
    "Moradabad",
    "Muzaffarnagar",
    "Pilibhit",
    "Pratapgarh",
    "Prayagraj",
    "Raebareli",
    "Rampur",
    "Saharanpur",
    "Sambhal",
    "Sant Kabir Nagar",
    "Shahjahanpur",
    "Shamli",
    "Shravasti",
    "Siddharthnagar",
    "Sitapur",
    "Sonbhadra",
    "Sultanpur",
    "Unnao",
    "Varanasi"
  ],

  "Uttarakhand": [
    "Almora",
    "Bageshwar",
    "Chamoli",
    "Champawat",
    "Dehradun",
    "Haridwar",
    "Nainital",
    "Pauri Garhwal",
    "Pithoragarh",
    "Rudraprayag",
    "Tehri Garhwal",
    "Udham Singh Nagar",
    "Uttarkashi"
  ],

  "West Bengal": [
    "Alipurduar",
    "Bankura",
    "Birbhum",
    "Cooch Behar",
    "Dakshin Dinajpur",
    "Darjeeling",
    "Hooghly",
    "Howrah",
    "Jalpaiguri",
    "Jhargram",
    "Kalimpong",
    "Kolkata",
    "Malda",
    "Murshidabad",
    "Nadia",
    "North 24 Parganas",
    "Paschim Bardhaman",
    "Paschim Medinipur",
    "Purba Bardhaman",
    "Purba Medinipur",
    "Purulia",
    "South 24 Parganas",
    "Uttar Dinajpur"
  ]
};

// ---------- State and district dropdowns ----------

// placeholderText: explicit label for the empty option. When omitted the
// label already present on the element is reused, which keeps the
// find-donor "All states" wording intact.
function populateStateDropdown(selectEl, placeholderText) {
  if (!selectEl) return;

  const existing = selectEl.options.length > 0
    ? selectEl.options[0].textContent
    : "";

  const label = placeholderText || existing || "Select a state";

  selectEl.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = label;

  selectEl.appendChild(placeholder);

  Object.keys(stateDistricts)
    .sort((a, b) => a.localeCompare(b))
    .forEach((state) => {
      const option = document.createElement("option");

      option.value = state;
      option.textContent = state;

      selectEl.appendChild(option);
    });
}

function setupDistrictDependent(stateSelect, districtSelect) {
  if (!stateSelect || !districtSelect) return;

  function populateDistricts() {
    districtSelect.replaceChildren();

    const state = stateSelect.value;
    const placeholder = document.createElement("option");

    placeholder.value = "";

    if (!state) {
      placeholder.textContent = "Select a state first";

      districtSelect.appendChild(placeholder);
      districtSelect.disabled = true;

      return;
    }

    placeholder.textContent = "Select a district";
    districtSelect.appendChild(placeholder);

    (stateDistricts[state] || [])
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .forEach((district) => {
        const option = document.createElement("option");

        option.value = district;
        option.textContent = district;

        districtSelect.appendChild(option);
      });

    districtSelect.disabled = false;
  }

  stateSelect.addEventListener("change", populateDistricts);

  populateDistricts();

  return populateDistricts;
}

// ---------- Initialize the correct page ----------

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page || "home";

  if (page === "find-donor") {
    initFindDonor();
    initNotifications();
  }

  if (page === "home") {
    initNotifications();
  }

  if (page === "register") {
    initRegister();
    initWithdrawConsent();
  }

  if (page === "emergency") {
    initEmergency();
  }

  highlightActiveNav();
});
