// ===== BACKEND CONFIG =====
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxGgfbNHZeMk_5RDA411pJ6ezYMSuGNmfgrX452ie73lnZND7Hhsh-eL9RtQZ73ybx6/exec"; // Your Google Apps Script Web App URL
// ===========================

// --- FIND DONOR PAGE ---
async function fetchDonorsFromBackend() {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getDonors`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Fetch donors error:", err);
    return [];
  }
}

async function searchDonorsFromBackend(bloodGroup, state, district) {
  try {
    const params = new URLSearchParams({ action: "searchDonors" });
    if (bloodGroup) params.append("bloodGroup", bloodGroup);
    if (state) params.append("state", state);
    if (district) params.append("district", district);
    const res = await fetch(`${APPS_SCRIPT_URL}?${params}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("Search donors error:", err);
    return [];
  }
}

async function initFindDonor() {
  const form = document.getElementById("search-form");
  const bloodGroupInput = document.getElementById("blood-group");
  const stateInput = document.getElementById("state");
  const districtInput = document.getElementById("district");
  const grid = document.getElementById("donors-grid");
  const message = document.getElementById("results-message");

  populateStateDropdown(stateInput);
  setupDistrictDependent(stateInput, districtInput);

  // Initial load
  const donors = await fetchDonorsFromBackend();
  displayDonors(donors);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const bloodGroup = bloodGroupInput.value;
    const state = stateInput.value;
    const district = districtInput.value;
    message.textContent = "Searching...";
    const results = await searchDonorsFromBackend(bloodGroup, state, district);
    displayDonors(results);
  });
}

// --- REGISTER PAGE ---
async function registerDonorToBackend(donorData) {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "addDonor", ...donorData })
    });
    return await res.json();
  } catch (err) {
    console.error("Register error:", err);
    return { success: false, error: "Network error" };
  }
}

// --- VALIDATION HELPERS ---

// Capitalize first letter of each word, rest lowercase
function formatName(value) {
  return value.split(" ")
    .filter(w => w !== "")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function validateName(name) {
  if (!name) return { valid: false, msg: "Name is required." };
  if (!/^[a-zA-Z ]+$/.test(name)) return { valid: false, msg: "Name can only contain letters and spaces." };
  return { valid: true, msg: "" };
}

function validateAge(age) {
  if (age === "" || age === null) return { valid: false, msg: "Age is required." };
  const num = Number(age);
  if (isNaN(num) || num < 18 || num > 65) return { valid: false, msg: "Age must be between 18 and 65." };
  return { valid: true, msg: "" };
}

function validatePhone(phone) {
  if (!phone) return { valid: false, msg: "Phone number is required." };
  if (!/^\d{10}$/.test(phone)) return { valid: false, msg: "Enter a valid 10-digit number." };
  if (/^[1-5]/.test(phone)) return { valid: false, msg: "Number cannot start with 1-5." };
  return { valid: true, msg: "" };
}

function setFieldMsg(msgEl, valid, text) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className = "field-msg " + (valid ? "valid" : "invalid");
}

// Update initRegister() with real-time validation:
async function initRegister() {
  const form = document.getElementById("register-form");
  const message = document.getElementById("register-message");
  const stateInput = document.getElementById("donor-state");
  const districtInput = document.getElementById("donor-district");
  const nameInput = document.getElementById("donor-name");
  const ageInput = document.getElementById("donor-age");
  const phoneInput = document.getElementById("donor-phone");
  const bloodInputs = document.querySelectorAll('#register-form input[name="bloodGroup"]');

  populateStateDropdown(stateInput);
  setupDistrictDependent(stateInput, districtInput);

  // Real-time formatting: capitalize name as user types
  nameInput.addEventListener("input", () => {
    nameInput.value = formatName(nameInput.value);
    const res = validateName(nameInput.value);
    setFieldMsg(document.getElementById("donor-name-msg"), res.valid, res.msg);
  });

  // Real-time age validation
  ageInput.addEventListener("input", () => {
    const res = validateAge(ageInput.value);
    setFieldMsg(document.getElementById("donor-age-msg"), res.valid, res.msg);
  });

  // Real-time phone validation (digits only)
  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 10);
    const res = validatePhone(phoneInput.value);
    setFieldMsg(document.getElementById("donor-phone-msg"), res.valid, res.msg);
  });

  // Real-time blood group
  bloodInputs.forEach(rb => rb.addEventListener("change", () => {
    let checked = document.querySelector('#register-form input[name="bloodGroup"]:checked');
    const res = checked ? { valid: true, msg: "" } : { valid: false, msg: "Select a blood group." };
    setFieldMsg(document.getElementById("donor-blood-msg"), res.valid, res.msg);
  }));

  // Real-time state/district
  stateInput.addEventListener("change", () => {
    const res = stateInput.value ? { valid: true, msg: "" } : { valid: false, msg: "Select a state." };
    setFieldMsg(document.getElementById("donor-state-msg"), res.valid, res.msg);
  });
  districtInput.addEventListener("change", () => {
    const res = districtInput.value ? { valid: true, msg: "" } : { valid: false, msg: "Select a district." };
    setFieldMsg(document.getElementById("donor-district-msg"), res.valid, res.msg);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = nameInput.value;
    const age = ageInput.value;
    const bloodGroupEl = document.querySelector('#register-form input[name="bloodGroup"]:checked');
    const bloodGroup = bloodGroupEl ? bloodGroupEl.value : "";
    const state = stateInput.value;
    const district = districtInput.value;
    const phone = phoneInput.value;

    // Run all validations
    const nameCheck = validateName(name);
    const ageCheck = validateAge(age);
    const phoneCheck = validatePhone(phone);
    const bloodOk = !!bloodGroup;
    const stateOk = !!state;
    const districtOk = !!district;

    setFieldMsg(document.getElementById("donor-name-msg"), nameCheck.valid, nameCheck.msg);
    setFieldMsg(document.getElementById("donor-age-msg"), ageCheck.valid, ageCheck.msg);
    setFieldMsg(document.getElementById("donor-phone-msg"), phoneCheck.valid, phoneCheck.msg);
    setFieldMsg(document.getElementById("donor-blood-msg"), bloodOk, bloodOk ? "" : "Select a blood group.");
    setFieldMsg(document.getElementById("donor-state-msg"), stateOk, stateOk ? "" : "Select a state.");
    setFieldMsg(document.getElementById("donor-district-msg"), districtOk, districtOk ? "" : "Select a district.");

    if (!(nameCheck.valid && ageCheck.valid && phoneCheck.valid && bloodOk && stateOk && districtOk)) {
      message.textContent = "Please fix the highlighted fields.";
      message.style.color = "var(--danger)";
      return;
    }

    const data = {
      name: name,
      age: parseInt(age, 10),
      bloodGroup: bloodGroup,
      state: state,
      district: district,
      phone: phone
    };

    message.textContent = "Registering...";
    message.style.color = "var(--text)";
    const result = await registerDonorToBackend(data);
    
    if (result.success) {
      message.textContent = "Registered successfully! You can now be found by recipients.";
      message.style.color = "var(--success)";
      form.reset();
      nameInput.dispatchEvent(new Event("input"));
    } else {
      message.textContent = "Registration failed. Try again.";
      message.style.color = "var(--danger)";
    }
  });
}

// --- EMERGENCY PAGE ---
async function submitEmergencyToBackend(requestData) {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "addEmergency", ...requestData })
    });
    return await res.json();
  } catch (err) {
    console.error("Emergency error:", err);
    return { success: false, error: "Network error" };
  }
}

// Update initEmergency() submit handler:
async function initEmergency() {
  const form = document.getElementById("emergency-form");
  const message = document.getElementById("emergency-message");
  const nameInput = document.getElementById("patient-name");
  const phoneInput = document.getElementById("emergency-phone");
  const locationInput = document.getElementById("emergency-location");

  // Real-time name formatting
  nameInput.addEventListener("input", () => {
    nameInput.value = formatName(nameInput.value);
    const res = validateName(nameInput.value);
    setFieldMsg(document.getElementById("patient-name-msg"), res.valid, res.msg);
  });

  // Real-time phone validation
  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 10);
    const res = validatePhone(phoneInput.value);
    setFieldMsg(document.getElementById("emergency-phone-msg"), res.valid, res.msg);
  });

  // Real-time location
  locationInput.addEventListener("input", () => {
    const res = locationInput.value ? { valid: true, msg: "" } : { valid: false, msg: "Location is required." };
    setFieldMsg(document.getElementById("emergency-location-msg"), res.valid, res.msg);
  });

  // Real-time blood group
  document.querySelectorAll('#emergency-form input[name="bloodGroup"]').forEach(rb => {
    rb.addEventListener("change", () => {
      let checked = document.querySelector('#emergency-form input[name="bloodGroup"]:checked');
      const res = checked ? { valid: true, msg: "" } : { valid: false, msg: "Select a blood group." };
      setFieldMsg(document.getElementById("emergency-blood-msg"), res.valid, res.msg);
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const patientName = nameInput.value;
    const bloodGroupEl = document.querySelector('#emergency-form input[name="bloodGroup"]:checked');
    const bloodGroup = bloodGroupEl ? bloodGroupEl.value : "";
    const location = locationInput.value.trim();
    const phone = phoneInput.value;

    const nameCheck = validateName(patientName);
    const phoneCheck = validatePhone(phone);
    const bloodOk = !!bloodGroup;
    const locationOk = !!location;

    setFieldMsg(document.getElementById("patient-name-msg"), nameCheck.valid, nameCheck.msg);
    setFieldMsg(document.getElementById("emergency-phone-msg"), phoneCheck.valid, phoneCheck.msg);
    setFieldMsg(document.getElementById("emergency-blood-msg"), bloodOk, bloodOk ? "" : "Select a blood group.");
    setFieldMsg(document.getElementById("emergency-location-msg"), locationOk, locationOk ? "" : "Location is required.");

    if (!(nameCheck.valid && phoneCheck.valid && bloodOk && locationOk)) {
      message.textContent = "Please fill all required fields correctly.";
      message.style.color = "var(--danger)";
      return;
    }

    const data = {
      patientName: patientName,
      bloodGroup: bloodGroup,
      location: location,
      phone: phone,
      message: document.getElementById("emergency-message-details").value.trim()
    };

    message.textContent = "Submitting emergency request...";
    message.style.color = "var(--text)";
    const result = await submitEmergencyToBackend(data);
    
    if (result.success) {
      message.textContent = "Emergency request submitted! Matching donors will be notified.";
      message.style.color = "var(--success)";
      form.reset();
    } else {
      message.textContent = "Submission failed. Try again.";
      message.style.color = "var(--danger)";
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page || "home";
  if (page === "find-donor") await initFindDonor();
  if (page === "register") initRegister();
  if (page === "emergency") initEmergency();
  highlightActiveNav();
});

function highlightActiveNav() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const navLinks = document.querySelectorAll(".nav-links a");
  
  navLinks.forEach(link => {
    const href = link.getAttribute("href");
    if (href === currentPage || (currentPage === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });
}

function displayDonors(donors) {
  const grid = document.getElementById("donors-grid");
  const message = document.getElementById("results-message");
  
  if (!grid) return;
  
  if (donors.length === 0) {
    grid.innerHTML = "";
    if (message) {
      message.textContent = "No donors found matching your criteria.";
      message.className = "results-message error";
    }
    return;
  }
  
  if (message) {
    message.textContent = `Found ${donors.length} donor(s)`;
    message.className = "results-message success";
  }
  
  grid.innerHTML = donors.map(donor => `
    <div class="donor-card">
      <h4>${donor.name}</h4>
      <p class="detail">Blood Group: <strong>${donor.bloodGroup}</strong></p>
      <p class="detail">Age: ${donor.age}</p>
      <p class="detail">District: ${donor.district}, ${donor.state}</p>
      <p class="detail">Phone: +91 ${donor.phone}</p>
    </div>
  `).join("");
}

// ===== STATE / DISTRICT DATA =====
const stateDistricts = {
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati"],
  "Delhi": ["New Delhi", "Central Delhi", "East Delhi", "South Delhi", "North Delhi"],
  "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"],
  "Karnataka": ["Bangalore", "Mysuru", "Mangaluru", "Hubli", "Belagavi"],
  "Kerala": ["Thiruvananthapuram", "Ernakulam", "Kozhikode", "Palakkad", "Thrissur"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain"],
  "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane"],
  "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Mohali"],
  "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Alwar"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli"],
  "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Rangareddy"],
  "Uttar Pradesh": ["Lucknow", "Kanpur", "Varanasi", "Agra", "Noida"],
  "West Bengal": ["Kolkata", "Howrah", "Darjeeling", "Siliguri", "Nadia"]
};

function populateStateDropdown(selectEl) {
  if (!selectEl) return;
  const states = Object.keys(stateDistricts);
  states.forEach(state => {
    const option = document.createElement("option");
    option.value = state;
    option.textContent = state;
    selectEl.appendChild(option);
  });
}

function setupDistrictDependent(stateSelect, districtSelect) {
  if (!stateSelect || !districtSelect) return;
  stateSelect.addEventListener("change", () => {
    districtSelect.innerHTML = "";
    const state = stateSelect.value;
    if (!state) {
      districtSelect.disabled = true;
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select State First";
      districtSelect.appendChild(placeholder);
      districtSelect.value = "";
      return;
    }
    const districts = stateDistricts[state] || [];
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select District";
    districtSelect.appendChild(placeholder);
    districts.forEach(district => {
      const option = document.createElement("option");
      option.value = district;
      option.textContent = district;
      districtSelect.appendChild(option);
    });
    districtSelect.disabled = false;
    districtSelect.value = "";
  });
}