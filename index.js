// Kiosk Logic for CAARMS 2026 Big Agenda Dashboard
// Auto-refresh interval: the client pulls agenda_data.json every 30 seconds to capture updates.

let agendaData = null;
let activeDay = null; // Dynamically resolved on load to default to Sunday, June 28
let activeEventIndex = -1;
let autoCycleTimer = null;
let idleTimer = null;
const IDLE_TIMEOUT_MS = 120000; // 2 minutes idle before auto-cycling
const CYCLE_INTERVAL_MS = 30000; // Cycle day tabs every 30 seconds

// List of dates in order
const conferenceDates = ["2026-06-28", "2026-06-29", "2026-06-30", "2026-07-01"];

// Timezone Helper: Construct a date object representing America/New_York local time
function getNewYorkDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const partMap = {};
  parts.forEach(p => partMap[p.type] = p.value);
  
  return new Date(
    partMap.year,
    partMap.month - 1,
    partMap.day,
    partMap.hour,
    partMap.minute,
    partMap.second
  );
}

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  generateQRCode();
  loadAgendaData();
  
  // Set up day tab event listeners
  document.querySelectorAll(".day-tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const selectedDay = e.target.getAttribute("data-day");
      selectDay(selectedDay, true); // User click (reset idle)
    });
  });

  // Start polling for agenda data updates every 30 seconds
  setInterval(loadAgendaData, 30000);
});

// 1. Clock and Date Logic
function initClock() {
  const timeEl = document.getElementById("kiosk-time");
  const dateEl = document.getElementById("kiosk-date");

  function updateClock() {
    const now = new Date();
    
    // Time format in America/New_York
    const optionsTime = {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    };
    
    const timeParts = now.toLocaleTimeString("en-US", optionsTime).split(" ");
    const timeStr = timeParts[0]; // e.g. "3:00"
    const ampmStr = timeParts[1]; // e.g. "PM"
    
    const colonIndex = timeStr.indexOf(":");
    let html = timeStr;
    if (colonIndex !== -1) {
      const hr = timeStr.substring(0, colonIndex);
      const min = timeStr.substring(colonIndex + 1);
      html = `${hr}<span class="clock-colon">:</span>${min}`;
    }

    timeEl.innerHTML = `${html} <span style="font-size: 1.5rem; font-weight: 600;">${ampmStr}</span>`;

    // Date format in America/New_York
    const optionsDate = {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    };
    dateEl.innerText = now.toLocaleDateString("en-US", optionsDate);
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// 2. Generate QR Code using CDN QRCode.js
function generateQRCode() {
  const qrContainer = document.getElementById("qrcode");
  qrContainer.innerHTML = '<div class="qr-scan-line"></div>'; // Re-insert scan line

  // Wait for QRCode.js to load or construct if ready
  if (typeof QRCode !== 'undefined') {
    new QRCode(qrContainer, {
      text: "https://caarms.princeton.edu/agenda",
      width: 128,
      height: 128,
      colorDark : "#0a0a0c",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.M
    });
  } else {
    // Retry in 500ms if library not fully loaded yet
    setTimeout(generateQRCode, 500);
  }
}

// 3. Fetch Agenda JSON Data
async function loadAgendaData() {
  try {
    const res = await fetch("agenda_data.json?t=" + new Date().getTime());
    if (!res.ok) throw new Error("Failed to load JSON");
    const data = await res.json();
    
    // Simple deep equality check to prevent DOM re-renders if no changes occurred
    if (JSON.stringify(agendaData) === JSON.stringify(data)) {
      updateActiveEventHighlighting(); // Keep current highlighting active based on changing clock
      return;
    }
    
    agendaData = data;
    console.log("Loaded fresh agenda data.", agendaData);
    
    // Initial day resolution (runs only on first fetch)
    if (!activeDay) {
      determineInitialDay();
    }
    
    renderDaySelectors();
    selectDay(activeDay, false);
    
    document.getElementById("last-updated-time").innerText = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" });
  } catch (err) {
    console.error("Error loading agenda data:", err);
  }
}

// 4. Day Navigation Logic
function determineInitialDay() {
  // Try to match current calendar date in America/New_York
  const now = getNewYorkDate();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  if (conferenceDates.includes(todayStr)) {
    activeDay = todayStr;
  } else {
    activeDay = conferenceDates[0]; // Sunday, June 28 default
  }
}

function renderDaySelectors() {
  document.querySelectorAll(".day-tab-btn").forEach(btn => {
    const dayDate = btn.getAttribute("data-day");
    if (agendaData && agendaData[dayDate]) {
      btn.innerText = agendaData[dayDate].day_name;
    }
  });
}

function selectDay(dayDate, isManual = false) {
  if (!agendaData || !agendaData[dayDate]) return;
  
  activeDay = dayDate;
  
  // Update Tab buttons UI
  document.querySelectorAll(".day-tab-btn").forEach(btn => {
    if (btn.getAttribute("data-day") === dayDate) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  renderTimeline();
  
  if (isManual) {
    resetIdleTimer();
  }
}

// 5. Render Left Timeline
function renderTimeline() {
  const wrapper = document.getElementById("events-timeline-container");
  wrapper.innerHTML = "";
  
  const dayInfo = agendaData[activeDay];
  if (!dayInfo || !dayInfo.events || dayInfo.events.length === 0) {
    wrapper.innerHTML = `<div class="text-center text-muted py-5">No events scheduled for this day.</div>`;
    return;
  }

  dayInfo.events.forEach((ev, idx) => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "events-list-conference-item fade-in";
    itemDiv.style.animationDelay = `${idx * 0.05}s`;
    itemDiv.setAttribute("data-index", idx);
    
    // Determine Event Type Badges
    let badgeHtml = "";
    const titleL = ev.title.toLowerCase();
    if (titleL.includes("break") || titleL.includes("lunch") || titleL.includes("breakfast")) {
      badgeHtml = `<span class="event-type-badge type-break">Break / Meal</span>`;
    } else if (titleL.includes("reception") || titleL.includes("banquet")) {
      badgeHtml = `<span class="event-type-badge type-social">Social / Reception</span>`;
    } else {
      badgeHtml = `<span class="event-type-badge type-talk">Talk / Session</span>`;
    }

    // Render title/speaker
    let speakerLine = "";
    if (ev.speaker && ev.speaker.trim() !== ev.title.trim()) {
      speakerLine = `<div class="event-speaker-meta"><i class="fa-solid fa-user"></i> <strong>${ev.speaker}</strong> ${ev.affiliation ? `(${ev.affiliation})` : ''}</div>`;
    } else if (ev.affiliation) {
      speakerLine = `<div class="event-speaker-meta"><i class="fa-solid fa-graduation-cap"></i> ${ev.affiliation}</div>`;
    }

    // Parse times
    const times = ev.time.split("-");
    const startTime = times[0] ? times[0].trim() : "";
    const endTime = times[1] ? times[1].trim() : "";

    itemDiv.innerHTML = `
      <div class="events-list-conference-item-sidebar">
        <div class="field field--name-field-ps-events-date field--type-daterange-enhanced field--label-hidden field__item">
          <span class="time">${startTime}</span>
          <span class="date-range-separator"> - </span>
          <span class="time">${endTime}</span>
        </div>
      </div>
      <div class="events-list-conference-item-details">
        <span class="field field--name-title field--type-string field--label-hidden">
          <a>${ev.title}</a>
        </span>
        ${speakerLine}
        ${ev.location ? `
        <div class="field field--name-field-ps-events-location-name field--type-string field--label-inline clearfix">
          <div class="field__label" style="display:inline; margin-right:5px; font-weight:bold;">Location:</div>
          <div class="field__item" style="display:inline;">${ev.location}</div>
        </div>` : ""}
        <div style="margin-top: 2px;">
          ${badgeHtml}
        </div>
      </div>
    `;

    // Click handler to view details of this item manually
    itemDiv.addEventListener("click", () => {
      highlightFeaturedEvent(idx);
      resetIdleTimer();
    });

    wrapper.appendChild(itemDiv);
  });

  updateActiveEventHighlighting();
}

// 6. Highlight Active Event & Populate Sidebar
function parseEventTimeRange(timeStr, activeDayStr) {
  // Parses a string like "3:00 pm - 5:30 pm" or "8:00 am - 9:00 am"
  // Returns { start: Date, end: Date } based on activeDayStr calendar date
  const parts = timeStr.split("-");
  if (parts.length !== 2) return null;

  const [yr, mo, dy] = activeDayStr.split("-").map(Number);

  function parseTime(str) {
    str = str.trim().toLowerCase();
    const match = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
    if (!match) return null;

    let hr = parseInt(match[1], 10);
    const min = parseInt(match[2], 10);
    const ampm = match[3];

    if (ampm === "pm" && hr < 12) hr += 12;
    if (ampm === "am" && hr === 12) hr = 0;

    return new Date(yr, mo - 1, dy, hr, min, 0, 0);
  }

  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);

  if (!start || !end) return null;
  return { start, end };
}

function updateActiveEventHighlighting() {
  if (!agendaData || !agendaData[activeDay]) return;

  const events = agendaData[activeDay].events;
  const now = getNewYorkDate();
  
  // Set pre-conference check (First event: Sunday, June 28 at 3:00 pm)
  const firstEventTime = new Date(2026, 5, 28, 15, 0, 0); // June 28, 3:00 PM (month is 0-indexed)
  const isPreConference = now < firstEventTime;
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  const isToday = (activeDay === todayStr);

  let currentActiveIdx = -1;
  let upcomingIdx = -1;

  for (let i = 0; i < events.length; i++) {
    const range = parseEventTimeRange(events[i].time, activeDay);
    if (range) {
      if (now >= range.start && now <= range.end) {
        currentActiveIdx = i;
        break;
      }
      if (now < range.start && upcomingIdx === -1) {
        upcomingIdx = i;
      }
    }
  }

  // Choose which event index to highlight
  let targetIdx = -1;
  let labelText = "Upcoming Session";

  if (isPreConference) {
    if (activeDay === "2026-06-28") {
      targetIdx = 0;
      labelText = "Now Happening";
    } else {
      targetIdx = 0;
      labelText = "Upcoming Session";
    }
  } else {
    if (isToday) {
      if (currentActiveIdx !== -1) {
        targetIdx = currentActiveIdx;
        labelText = "Now Happening";
      } else if (upcomingIdx !== -1) {
        targetIdx = upcomingIdx;
        labelText = "Up Next";
      } else {
        targetIdx = 0;
        labelText = "Schedule Item";
      }
    } else {
      targetIdx = 0;
      labelText = "Schedule Item";
    }
  }

  // Update Highlight UI
  document.querySelectorAll(".events-list-conference-item").forEach((item, idx) => {
    if (idx === targetIdx) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Display details on the right panel
  if (targetIdx !== activeEventIndex) {
    highlightFeaturedEvent(targetIdx, labelText);
  }
}

function highlightFeaturedEvent(index, labelOverride = null) {
  if (!agendaData || !agendaData[activeDay]) return;
  const events = agendaData[activeDay].events;
  if (!events[index]) return;

  activeEventIndex = index;
  const ev = events[index];
  
  const detailCard = document.getElementById("featured-detail-content");
  detailCard.className = "featured-talk-info"; // Reset class for refade trigger
  
  // Set Tag Label (Now, Up Next, etc)
  let tagText = labelOverride || "Featured Session";
  document.getElementById("featured-tag-text").innerText = tagText;

  // Render content
  const speakerNameEl = document.getElementById("featured-speaker-name");
  const speakerAffEl = document.getElementById("featured-speaker-affiliation");
  const talkTitleEl = document.getElementById("featured-talk-title");
  const abstractEl = document.getElementById("featured-talk-abstract");
  const avatarEl = document.getElementById("featured-speaker-avatar");
  const profileContainer = document.getElementById("featured-speaker-profile");

  // Determine if it is a break/social event (no speaker profile)
  const isBreak = !ev.speaker && !ev.affiliation && !ev.abstract && !ev.image;

  if (isBreak) {
    profileContainer.style.display = "none";
    speakerNameEl.innerText = "";
    speakerAffEl.innerText = "";
    talkTitleEl.innerText = ev.title;
    abstractEl.innerText = ev.location ? `Location: ${ev.location}. Enjoy the break!` : "Enjoy the break!";
  } else {
    profileContainer.style.display = "flex";
    speakerNameEl.innerText = ev.speaker || ev.title;
    speakerAffEl.innerText = ev.affiliation || "";
    talkTitleEl.innerText = ev.speaker ? ev.title : "";
    abstractEl.innerText = ev.abstract || "No abstract available for this talk.";

    // Avatar resolution - hide avatar container completely if there is no speaker image
    const avatarCropEl = document.querySelector(".speaker-avatar-crop");
    if (ev.image) {
      avatarEl.src = ev.image;
      avatarEl.style.display = "block";
      if (avatarCropEl) avatarCropEl.style.display = "block";
    } else {
      avatarEl.src = "";
      avatarEl.style.display = "none";
      if (avatarCropEl) avatarCropEl.style.display = "none";
    }
  }

  // Smooth scroll left timeline to center the selected event
  const timelineItem = document.querySelector(`.events-list-conference-item[data-index="${index}"]`);
  if (timelineItem) {
    timelineItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Trigger quick refade micro-animation
  void detailCard.offsetWidth; // Trigger reflow
  detailCard.classList.add("fade-in");
}

// 7. Auto-Cycling and Idle Reset Logic
function resetIdleTimer() {
  stopAutoCycle();
  clearTimeout(idleTimer);
  
  // After 2 minutes of inactivity, resume auto-cycling
  idleTimer = setTimeout(() => {
    console.log("Kiosk is idle. Starting auto-cycle...");
    startAutoCycle();
  }, IDLE_TIMEOUT_MS);
}

function startAutoCycle() {
  stopAutoCycle();
  
  autoCycleTimer = setInterval(() => {
    // Find next day index in conferenceDates
    const currentIdx = conferenceDates.indexOf(activeDay);
    const nextIdx = (currentIdx + 1) % conferenceDates.length;
    const nextDay = conferenceDates[nextIdx];
    
    console.log(`Auto-cycling to next day: ${nextDay}`);
    selectDay(nextDay, false);
  }, CYCLE_INTERVAL_MS);
}

function stopAutoCycle() {
  if (autoCycleTimer) {
    clearInterval(autoCycleTimer);
    autoCycleTimer = null;
  }
}
