// Blood Donor Finder — frontend application logic
// Keep the Apps Script URL in sync with the deployed Google Apps Script web app.

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxGgfbNHZeMk_5RDA411pJ6ezYMSuGNmfgrX452ie73lnZND7Hhsh-eL9RtQZ73ybx6/exec";

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
    return await requestJson(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "addDonor",
        ...donorData
      })
    });
  } catch (error) {
    console.error("Register error:", error);

    return {
      success: false,
      error: "Network or server error"
    };
  }
}

async function submitEmergencyToBackend(requestData) {
  try {
    return await requestJson(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "addEmergency",
        ...requestData
      })
    });
  } catch (error) {
    console.error("Emergency request error:", error);

    return {
      success: false,
      error: "Network or server error"
    };
  }
}

// ---------- Validation and UI helpers ----------

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
  const value = String(phone || "").replace(/\D/g, "");

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

function setFieldMsg(element, valid, text) {
  if (!element) return;

  element.textContent = text || "";
  element.className =
    `field-msg ${valid ? "valid" : "invalid"}`;
}

function setStatus(element, text, type = "") {
  if (!element) return;

  element.textContent = text;
  element.className = type
    ? `results-message ${type}`
    : "results-message";
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

  if (
    !form ||
    !bloodGroupInput ||
    !stateInput ||
    !districtInput
  ) {
    return;
  }

  populateStateDropdown(stateInput);
  setupDistrictDependent(stateInput, districtInput);

  setStatus(message, "Loading donor listings...");

  const donors = await fetchDonorsFromBackend();

  if (donors === null) {
    displayDonors([]);

    setStatus(
      message,
      "Donor listings could not be loaded. Check your connection and try again.",
      "error"
    );

  }
  else {
    displayDonors(donors);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    setStatus(message, "Searching for donors...");

    const results = await searchDonorsFromBackend(
      bloodGroupInput.value,
      stateInput.value,
      districtInput.value
    );

    setFieldMsg(
      emailMessage,
      emailCheck.valid,
      emailCheck.msg
    );

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
  setupDistrictDependent(stateInput, districtInput);

  nameInput.addEventListener("input", () => {
    const cursorAtEnd =
      nameInput.selectionStart === nameInput.value.length;

    nameInput.value = formatName(nameInput.value);

    if (cursorAtEnd) {
      nameInput.setSelectionRange(
        nameInput.value.length,
        nameInput.value.length
      );
    }

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
    phoneInput.value = phoneInput.value
      .replace(/\D/g, "")
      .slice(0, 10);

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
    const phone = phoneInput.value.replace(/\D/g, "");

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

        setFieldMsg(
          document.getElementById("donor-name-msg"),
          true,
          ""
        );

        setFieldMsg(
          document.getElementById("donor-age-msg"),
          true,
          ""
        );

        setFieldMsg(
          document.getElementById("donor-phone-msg"),
          true,
          ""
        );

        setFieldMsg(
          document.getElementById("donor-blood-msg"),
          true,
          ""
        );

        setFieldMsg(
          document.getElementById("donor-state-msg"),
          true,
          ""
        );

        setFieldMsg(
          document.getElementById("donor-district-msg"),
          true,
          ""
        );

        districtInput.replaceChildren();

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a state first";

        districtInput.appendChild(placeholder);
        districtInput.disabled = true;
      } else {
        setStatus(
          message,
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

  if (!nameInput || !phoneInput || !locationInput) {
    console.error(
      "Emergency form is missing one or more required fields."
    );

    return;
  }

  nameInput.addEventListener("input", () => {
    nameInput.value = formatName(nameInput.value);

    const result = validateName(nameInput.value);

    setFieldMsg(
      document.getElementById("patient-name-msg"),
      result.valid,
      result.msg
    );
  });

  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value
      .replace(/\D/g, "")
      .slice(0, 10);

    const result = validatePhone(phoneInput.value);

    setFieldMsg(
      document.getElementById("emergency-phone-msg"),
      result.valid,
      result.msg
    );
  });

  locationInput.addEventListener("input", () => {
    const valid = Boolean(locationInput.value.trim());

    setFieldMsg(
      document.getElementById("emergency-location-msg"),
      valid,
      valid ? "" : "Location is required."
    );
  });

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
    const phone = phoneInput.value.replace(/\D/g, "");

    const detailsInput = document.getElementById(
      "emergency-message-details"
    );

    const nameCheck = validateName(patientName);
    const phoneCheck = validatePhone(phone);


    const bloodOk = Boolean(bloodGroup);
    const locationOk = Boolean(location);

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
      locationOk,
      locationOk ? "" : "Location is required."
    );

    if (
      !(
        nameCheck.valid &&
        phoneCheck.valid &&
        bloodOk &&
        locationOk
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
      } else {
        setStatus(
          message,
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

    const heading = document.createElement("h4");
    heading.textContent = String(donor.name || "Donor");

    const blood = document.createElement("p");
    blood.className = "detail";
    blood.append("Blood Group: ");

    const bloodStrong = document.createElement("strong");
    bloodStrong.textContent = String(
      donor.bloodGroup || "Not provided"
    );

    blood.appendChild(bloodStrong);

    const age = document.createElement("p");
    age.className = "detail";
    age.textContent = `Age: ${donor.age ?? "Not provided"}`;

    const location = document.createElement("p");
    location.className = "detail";
    location.textContent =
      `District: ${String(donor.district || "Not provided")}, ` +
      `${String(donor.state || "Not provided")}`;

    const phone = document.createElement("p");
    phone.className = "detail";
    phone.textContent =
      `Phone: +91 ${String(donor.phone || "Not provided")}`;

    card.append(heading, blood, age, location, phone);
    grid.appendChild(card);
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

function populateStateDropdown(selectEl) {
  if (!selectEl) return;

  const placeholderText =
    selectEl.options.length > 0
      ? selectEl.options[0].textContent
      : selectEl.id === "state"
        ? "All states"
        : "Select a state";

  selectEl.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderText;

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
}

// ---------- Initialize the correct page ----------

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page || "home";

  if (page === "find-donor") {
    initFindDonor();
  }

  if (page === "register") {
    initRegister();
  }

  if (page === "emergency") {
    initEmergency();
  }

  highlightActiveNav();
});