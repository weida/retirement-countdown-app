import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  FLEX_LIMIT_MONTHS,
  calculateRetirementDate,
  isRetired,
  normalizeFlexMonths,
  parseDateOnly,
  startOfDay,
} from "./retirement.js";

const STORAGE_KEY = "retirement-countdown-settings";
const NOTIFICATION_ID = 1001;
const MONTH_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const defaults = {
  calculationMode: "policy",
  birthDate: "",
  workerType: "male",
  flexMode: "statutory",
  flexMonths: 0,
  retireDate: "",
  reminderTime: "09:00",
  reminderText: "今天也离退休更近了一天",
  remindersEnabled: null,
  retirementReachedNotified: false,
  mood: "day",
  crossedMarks: { day: [], month: [], week: [], hour: [] },
};

const CALENDAR_VIEWS = ["day", "month", "week", "hour"];

const BIRTH_YEAR_MIN = 1955;
const BIRTH_YEAR_MAX = 2010;
const BIRTH_YEAR_DEFAULT_FOCUS = "1970";

const PICKER_OPTIONS = {
  calculationMode: [
    { value: "policy", label: "按中国法定退休政策自动计算" },
    { value: "manual", label: "手动设置退休日期" },
  ],
  workerType: [
    { value: "male", label: "男职工:原 60 岁退休" },
    { value: "female55", label: "女职工:原 55 岁退休" },
    { value: "female50", label: "女职工:原 50 岁退休" },
  ],
  flexMode: [
    { value: "statutory", label: "按改革后法定退休年龄" },
    { value: "early", label: "弹性提前退休,提前 3 年内" },
    { value: "late", label: "弹性延迟退休,延迟 3 年内" },
  ],
  birthYear: Array.from({ length: BIRTH_YEAR_MAX - BIRTH_YEAR_MIN + 1 }, (_, i) => {
    const y = BIRTH_YEAR_MIN + i;
    return { value: String(y), label: `${y} 年` };
  }),
  birthMonth: Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} 月`,
  })),
};

const DYNAMIC_PICKER_OPTIONS = {
  birthDay: () => {
    const year = parseInt(document.getElementById("birthYear").value || BIRTH_YEAR_DEFAULT_FOCUS, 10);
    const month = parseInt(document.getElementById("birthMonth").value || "1", 10);
    const dayCount = new Date(year, month, 0).getDate();
    return Array.from({ length: dayCount }, (_, i) => ({
      value: String(i + 1),
      label: `${i + 1} 日`,
    }));
  },
};

const PICKER_DEFAULT_FOCUS = {
  birthYear: BIRTH_YEAR_DEFAULT_FOCUS,
  birthMonth: "1",
  birthDay: "1",
};

const els = {
  form: document.querySelector("#settingsForm"),
  calculationMode: document.querySelector("#calculationMode"),
  policyFields: document.querySelector("#policyFields"),
  birthDate: document.querySelector("#birthDate"),
  workerType: document.querySelector("#workerType"),
  flexMode: document.querySelector("#flexMode"),
  flexMonths: document.querySelector("#flexMonths"),
  flexMonthsValue: document.querySelector("#flexMonthsValue"),
  flexMonthsLabel: document.querySelector("#flexMonthsLabel"),
  retireDate: document.querySelector("#retireDate"),
  policyNote: document.querySelector("#policyNote"),
  resultCard: document.querySelector("#policyResult"),
  statutoryResult: document.querySelector("#statutoryResult"),
  finalResult: document.querySelector("#finalResult"),
  reminderTime: document.querySelector("#reminderTime"),
  reminderText: document.querySelector("#reminderText"),
  remindersToggle: document.querySelector("#remindersToggle"),
  reminderDetails: document.querySelector("#reminderDetails"),
  reminderStatus: document.querySelector("#reminderStatus"),
  moodToggle: document.querySelector("#moodToggle"),
  shareBtn: document.querySelector("#shareBtn"),
  openSettings: document.querySelector("#openSettings"),
  closeSettings: document.querySelector("#closeSettings"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsHandle: document.querySelector("#settingsHandle"),
  bandYear: document.querySelector("#bandYear"),
  bandCaption: document.querySelector("#bandCaption"),
  monthDots: document.querySelector("#monthDots"),
  todayLabel: document.querySelector("#todayLabel"),
  targetLabel: document.querySelector("#targetLabel"),
  heroCount: document.querySelector("#heroCount"),
  monthsLeft: document.querySelector("#monthsLeft"),
  weeksLeft: document.querySelector("#weeksLeft"),
  hoursLeft: document.querySelector("#hoursLeft"),
  status: document.querySelector("#retirementStatus"),
  nextReminder: document.querySelector("#nextReminder"),
  calculationModeLabel: document.querySelector("#calculationModeLabel"),
  workerTypeLabel: document.querySelector("#workerTypeLabel"),
  flexModeLabel: document.querySelector("#flexModeLabel"),
  birthYear: document.querySelector("#birthYear"),
  birthMonth: document.querySelector("#birthMonth"),
  birthDay: document.querySelector("#birthDay"),
  birthYearLabel: document.querySelector("#birthYearLabel"),
  birthMonthLabel: document.querySelector("#birthMonthLabel"),
  birthDayLabel: document.querySelector("#birthDayLabel"),
  pickerSheet: document.querySelector("#pickerSheet"),
  pickerTitle: document.querySelector("#pickerTitle"),
  pickerOptions: document.querySelector("#pickerOptions"),
  pickerClose: document.querySelector("#pickerClose"),
  pickerHandle: document.querySelector("#pickerHandle"),
  hero: document.querySelector(".hero"),
  stamps: document.querySelectorAll(".stamp"),
  calendarSheet: document.querySelector("#calendarSheet"),
  calendarHandle: document.querySelector("#calendarHandle"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarPrev: document.querySelector("#calendarPrev"),
  calendarNext: document.querySelector("#calendarNext"),
  calendarClose: document.querySelector("#calendarClose"),
  calendarDays: document.querySelector("#calendarDays"),
  calendarStats: document.querySelector("#calendarStats"),
  calendarTabs: document.querySelector("#calendarTabs"),
};

let settings = loadSettings();
let reminderTimer = null;
const crossSets = {
  day: new Set(settings.crossedMarks?.day ?? []),
  month: new Set(settings.crossedMarks?.month ?? []),
  week: new Set(settings.crossedMarks?.week ?? []),
  hour: new Set(settings.crossedMarks?.hour ?? []),
};
let calendarView = "day";
let calendarCursor = null;
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

init();

async function init() {
  els.flexMonths.max = String(FLEX_LIMIT_MONTHS);
  els.flexMonths.setAttribute("aria-valuemax", String(FLEX_LIMIT_MONTHS));
  applySettingsToForm();
  applyMood();
  refreshPolicyCalculation();
  updateCountdown();

  [
    els.calculationMode,
    els.birthDate,
    els.workerType,
    els.flexMode,
    els.flexMonths,
  ].forEach((element) => {
    element.addEventListener("input", refreshPolicyCalculation);
    element.addEventListener("change", refreshPolicyCalculation);
  });

  let lastSliderValue = -1;
  els.flexMonths.addEventListener("input", () => {
    const value = normalizeFlexMonths(els.flexMonths.value);
    updateFlexSliderDisplay(value);
    if ((value === 0 || value === FLEX_LIMIT_MONTHS) && lastSliderValue !== value) {
      triggerHaptic();
    }
    lastSliderValue = value;
  });

  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const calculation = refreshPolicyCalculation();
    const previousRetireDate = settings.retireDate;

    settings = {
      ...settings,
      calculationMode: els.calculationMode.value,
      birthDate: els.birthDate.value,
      workerType: els.workerType.value,
      flexMode: els.flexMode.value,
      flexMonths: normalizeFlexMonths(els.flexMonths.value),
      retireDate: els.retireDate.value,
      reminderTime: els.reminderTime.value || defaults.reminderTime,
      reminderText: els.reminderText.value.trim() || defaults.reminderText,
    };

    if (calculation) {
      settings.retireDate = calculation.finalDate;
    }

    if (settings.retireDate !== previousRetireDate && !isRetired(settings.retireDate)) {
      settings.retirementReachedNotified = false;
    }

    saveSettings();
    triggerHaptic("Medium");
    updateCountdown();
    await scheduleReminder();
    closeSettingsDialog();
  });

  els.moodToggle.addEventListener("click", () => {
    settings.mood = settings.mood === "dusk" ? "day" : "dusk";
    saveSettings();
    applyMood();
    triggerHaptic();
  });

  els.shareBtn?.addEventListener("click", generateShareImage);

  els.openSettings.addEventListener("click", openSettingsDialog);
  els.closeSettings.addEventListener("click", closeSettingsDialog);

  setupPickers();
  setupCalendar();
  setupSheetDragToClose();
  setupBackButton();

  window.setInterval(updateCountdown, 60 * 1000);

  if (!isNative() && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }

  // Reminder init runs after UI is wired so a notification scheduling
  // failure (e.g. native LocalNotifications.schedule rejection) can't
  // dead-shell the app. setupReminderToggle resolves the null permission
  // state before scheduleReminder reads it, preserving the prior race fix.
  try {
    await setupReminderToggle();
    await scheduleReminder();
  } catch (err) {
    console.error("reminder init failed", err);
    if (els.reminderStatus) {
      els.reminderStatus.textContent = "提醒初始化失败";
      els.reminderStatus.classList.add("warning");
    }
  }
}

function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    stored = {};
  }
  let migrated = false;
  if (stored.dark !== undefined && stored.mood === undefined) {
    stored.mood = stored.dark ? "dusk" : "day";
    delete stored.dark;
    migrated = true;
  }
  if (Array.isArray(stored.crossedDates) && !stored.crossedMarks) {
    stored.crossedMarks = { day: stored.crossedDates, month: [], week: [], hour: [] };
    delete stored.crossedDates;
    migrated = true;
  }
  const merged = { ...defaults, ...stored };
  merged.crossedMarks = {
    day: merged.crossedMarks?.day ?? [],
    month: merged.crossedMarks?.month ?? [],
    week: merged.crossedMarks?.week ?? [],
    hour: merged.crossedMarks?.hour ?? [],
  };
  if (migrated) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // localStorage write may fail in private mode / quota; in-memory state still works
    }
  }
  return merged;
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettingsToForm() {
  setHiddenAndLabel("calculationMode", settings.calculationMode);
  applyBirthDateToForm(settings.birthDate);
  setHiddenAndLabel("workerType", settings.workerType);
  setHiddenAndLabel("flexMode", settings.flexMode);
  els.flexMonths.value = settings.flexMonths;
  updateFlexSliderDisplay(settings.flexMonths);
  els.retireDate.value = settings.retireDate;
  els.reminderTime.value = settings.reminderTime;
  els.reminderText.value = settings.reminderText;
}

function setHiddenAndLabel(field, value) {
  const input = document.getElementById(field);
  const labelEl = document.getElementById(`${field}Label`);
  if (!input) return;
  input.value = value;
  const option = (PICKER_OPTIONS[field] || []).find((opt) => opt.value === value);
  if (labelEl && option) labelEl.textContent = option.label;
}

function applyBirthDateToForm(iso) {
  els.birthDate.value = iso || "";
  if (!iso) {
    els.birthYear.value = "";
    els.birthMonth.value = "";
    els.birthDay.value = "";
    els.birthYearLabel.textContent = "年";
    els.birthMonthLabel.textContent = "月";
    els.birthDayLabel.textContent = "日";
    return;
  }
  const [y, m, d] = iso.split("-");
  els.birthYear.value = String(parseInt(y, 10));
  els.birthMonth.value = String(parseInt(m, 10));
  els.birthDay.value = String(parseInt(d, 10));
  els.birthYearLabel.textContent = `${parseInt(y, 10)} 年`;
  els.birthMonthLabel.textContent = `${parseInt(m, 10)} 月`;
  els.birthDayLabel.textContent = `${parseInt(d, 10)} 日`;
}

function syncBirthDateFromParts() {
  const y = els.birthYear.value;
  const m = els.birthMonth.value;
  let d = els.birthDay.value;

  if (y && m && d) {
    const maxDay = new Date(Number(y), Number(m), 0).getDate();
    if (Number(d) > maxDay) {
      d = String(maxDay);
      els.birthDay.value = d;
      els.birthDayLabel.textContent = `${maxDay} 日`;
    }
    els.birthDate.value = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  } else {
    els.birthDate.value = "";
  }
  els.birthDate.dispatchEvent(new Event("input", { bubbles: true }));
  els.birthDate.dispatchEvent(new Event("change", { bubbles: true }));
}

function updateFlexSliderDisplay(rawValue) {
  const value = normalizeFlexMonths(rawValue);
  els.flexMonths.style.setProperty("--slider-fill", `${(value / FLEX_LIMIT_MONTHS) * 100}%`);
  els.flexMonthsValue.textContent = `${value} 个月`;
}

function applyMood() {
  const mood = settings.mood === "dusk" ? "dusk" : "day";
  document.body.dataset.mood = mood;
  els.moodToggle.title = mood === "dusk" ? "切换到白昼" : "切换到傍晚";
  const themeColor = mood === "dusk" ? "#1a1411" : "#f7f4ed";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  applyStatusBar(mood);
}

async function applyStatusBar(mood) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: mood === "dusk" ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: mood === "dusk" ? "#1a1411" : "#f7f4ed" });
    }
  } catch {
    // plugin unavailable or unsupported on this device; ignore
  }
}

async function triggerHaptic(style = "Light") {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const impact = style === "Medium" ? ImpactStyle.Medium : ImpactStyle.Light;
    await Haptics.impact({ style: impact });
  } catch {
    // plugin or hardware unavailable; ignore
  }
}

function openSettingsDialog() {
  if (typeof els.settingsDialog.showModal === "function") {
    els.settingsDialog.showModal();
  } else {
    els.settingsDialog.setAttribute("open", "");
  }
  triggerHaptic();
}

function closeSettingsDialog() {
  if (typeof els.settingsDialog.close === "function") {
    els.settingsDialog.close();
  } else {
    els.settingsDialog.removeAttribute("open");
  }
  triggerHaptic();
}

let _activePickerTrigger = null;

function setupPickers() {
  document.querySelectorAll(".picker-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => openPicker(trigger.dataset.picker));
  });
  els.pickerClose.addEventListener("click", closePicker);
  els.pickerSheet.addEventListener("click", (event) => {
    if (event.target === els.pickerSheet) closePicker();
  });
  els.pickerOptions.addEventListener("keydown", (event) => {
    const options = Array.from(els.pickerOptions.querySelectorAll(".picker-option"));
    const focused = document.activeElement;
    const idx = options.indexOf(focused);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = options[(idx + 1) % options.length];
      next?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = options[(idx - 1 + options.length) % options.length];
      prev?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (focused && options.includes(focused)) focused.click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
    }
  });
}

function openPicker(field) {
  const options = DYNAMIC_PICKER_OPTIONS[field]?.() ?? PICKER_OPTIONS[field];
  if (!options) {
    console.warn(`Unknown picker field: ${field}`);
    return;
  }
  const input = document.getElementById(field);
  const currentValue = input?.value ?? "";

  _activePickerTrigger = document.querySelector(`.picker-trigger[data-picker="${field}"]`);
  if (_activePickerTrigger) _activePickerTrigger.setAttribute("aria-expanded", "true");

  els.pickerTitle.textContent = pickerTitleFor(field);
  els.pickerOptions.replaceChildren();

  let selectedLi = null;
  options.forEach((opt) => {
    const li = document.createElement("li");
    li.className = "picker-option";
    li.setAttribute("role", "option");
    li.setAttribute("tabindex", "0");
    li.dataset.value = opt.value;
    const isSelected = opt.value === currentValue;
    li.setAttribute("aria-selected", String(isSelected));
    if (isSelected) selectedLi = li;
    const text = document.createElement("span");
    text.textContent = opt.label;
    li.appendChild(text);
    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.setAttribute("class", "check");
    check.setAttribute("viewBox", "0 0 24 24");
    check.setAttribute("width", "18");
    check.setAttribute("height", "18");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", "currentColor");
    check.setAttribute("stroke-width", "2.4");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    check.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 12l4 4L19 7");
    check.appendChild(path);
    li.appendChild(check);
    li.addEventListener("click", () => {
      setPickerValue(field, opt.value, opt.label);
      closePicker();
    });
    els.pickerOptions.appendChild(li);
  });

  if (typeof els.pickerSheet.showModal === "function") {
    els.pickerSheet.showModal();
  } else {
    els.pickerSheet.setAttribute("open", "");
  }

  let focusTarget = selectedLi;
  if (!focusTarget) {
    const defaultValue = PICKER_DEFAULT_FOCUS[field];
    if (defaultValue) {
      focusTarget = els.pickerOptions.querySelector(`.picker-option[data-value="${defaultValue}"]`);
    }
  }
  focusTarget = focusTarget ?? els.pickerOptions.querySelector(".picker-option");
  if (focusTarget) {
    focusTarget.focus();
    focusTarget.scrollIntoView({ block: "center" });
  }
}

function closePicker() {
  if (_activePickerTrigger) {
    _activePickerTrigger.setAttribute("aria-expanded", "false");
    _activePickerTrigger = null;
  }
  if (typeof els.pickerSheet.close === "function") {
    els.pickerSheet.close();
  } else {
    els.pickerSheet.removeAttribute("open");
  }
}

function setPickerValue(field, value, label) {
  const input = document.getElementById(field);
  const labelEl = document.getElementById(`${field}Label`);
  if (!input) return;
  input.value = value;
  if (labelEl) labelEl.textContent = label;

  if (field === "birthYear" || field === "birthMonth" || field === "birthDay") {
    syncBirthDateFromParts();
  } else {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  triggerHaptic();
}

function pickerTitleFor(field) {
  switch (field) {
    case "calculationMode": return "计算方式";
    case "workerType": return "人员类型";
    case "flexMode": return "弹性退休";
    case "birthYear": return "出生年份";
    case "birthMonth": return "出生月份";
    case "birthDay": return "出生日";
    default: return "选择";
  }
}

function setupCalendar() {
  els.hero.addEventListener("click", () => {
    if (!settings.retireDate) {
      openSettingsDialog();
    } else {
      openCalendar("day");
    }
  });
  els.stamps.forEach((stamp) => {
    stamp.addEventListener("click", () => openCalendar(stamp.dataset.view));
  });
  els.calendarClose.addEventListener("click", closeCalendar);
  els.calendarPrev.addEventListener("click", () => navigateCalendar(-1));
  els.calendarNext.addEventListener("click", () => navigateCalendar(1));
  els.calendarSheet.addEventListener("click", (event) => {
    if (event.target === els.calendarSheet) closeCalendar();
  });
  els.calendarTabs.addEventListener("click", (event) => {
    const tab = event.target.closest(".calendar-tab");
    if (!tab) return;
    switchView(tab.dataset.view);
  });
  els.calendarDays.addEventListener("click", (event) => {
    const cell = event.target.closest(".day-cell");
    if (!cell || !cell.dataset.key || cell.classList.contains("day-cell--empty")
        || cell.classList.contains("day-cell--disabled")) return;
    toggleCross(calendarView, cell.dataset.key, cell);
  });
}

function openCalendar(view = "day") {
  switchView(view, { skipRender: true });
  resetCursor();
  renderCalendar();
  if (typeof els.calendarSheet.showModal === "function") {
    els.calendarSheet.showModal();
  } else {
    els.calendarSheet.setAttribute("open", "");
  }
  triggerHaptic();
}

function closeCalendar() {
  if (typeof els.calendarSheet.close === "function") {
    els.calendarSheet.close();
  } else {
    els.calendarSheet.removeAttribute("open");
  }
  triggerHaptic();
}

function switchView(view, { skipRender = false } = {}) {
  if (!CALENDAR_VIEWS.includes(view)) return;
  if (calendarView === view && !skipRender) return;
  calendarView = view;
  els.calendarSheet.dataset.view = view;
  els.calendarTabs.querySelectorAll(".calendar-tab").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.view === view));
  });
  if (!skipRender) {
    resetCursor();
    renderCalendar();
  }
}

function resetCursor() {
  const today = new Date();
  if (calendarView === "day") {
    calendarCursor = { year: today.getFullYear(), month: today.getMonth() };
  } else if (calendarView === "month" || calendarView === "week") {
    calendarCursor = { year: today.getFullYear() };
  } else {
    calendarCursor = null;
  }
}

function navigateCalendar(direction) {
  if (calendarView === "day") {
    let { year, month } = calendarCursor;
    month += direction;
    if (month < 0) { month = 11; year -= 1; }
    else if (month > 11) { month = 0; year += 1; }
    calendarCursor = { year, month };
  } else if (calendarView === "month" || calendarView === "week") {
    calendarCursor = { year: calendarCursor.year + direction };
  } else {
    return;
  }
  renderCalendar();
  triggerHaptic();
}

function renderCalendar() {
  if (calendarView === "day") renderDayView();
  else if (calendarView === "month") renderMonthView();
  else if (calendarView === "week") renderWeekView();
  else if (calendarView === "hour") renderHourView();
  updateCalendarStats();
}

function renderDayView() {
  const { year, month } = calendarCursor;
  els.calendarTitle.textContent = `${year} 年 ${month + 1} 月`;

  const todayIso = isoFromDate(new Date());
  const todayMonthKey = todayIso.slice(0, 7);
  const viewKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const retireIso = settings.retireDate || "";
  const retireMonthKey = retireIso.slice(0, 7);

  els.calendarPrev.disabled = false;
  els.calendarNext.disabled = retireMonthKey ? viewKey >= retireMonthKey : viewKey >= todayMonthKey;

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  els.calendarDays.replaceChildren();

  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "day-cell day-cell--empty";
    els.calendarDays.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday = iso === todayIso;
    const isRetirement = retireIso && iso === retireIso;
    const isFuture = iso > todayIso;
    const cell = buildCell({
      key: iso,
      label: String(d),
      crossed: crossSets.day.has(iso),
      today: isToday,
      retirement: isRetirement,
      disabled: isFuture,
      ariaLabel: `${iso}${isToday ? " · 今天" : ""}${isRetirement ? " · 退休日" : ""}`,
    });
    els.calendarDays.appendChild(cell);
  }
}

function renderMonthView() {
  const { year } = calendarCursor;
  els.calendarTitle.textContent = `${year} 年`;

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const retireIso = settings.retireDate || "";
  const retireYear = retireIso ? Number(retireIso.slice(0, 4)) : null;
  const retireMonth = retireIso ? Number(retireIso.slice(5, 7)) - 1 : null;

  els.calendarPrev.disabled = false;
  els.calendarNext.disabled = retireYear !== null ? year >= retireYear : year >= todayYear;

  els.calendarDays.replaceChildren();

  for (let m = 0; m < 12; m++) {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    const isFuture = year > todayYear || (year === todayYear && m > todayMonth);
    const isThisMonth = year === todayYear && m === todayMonth;
    const isRetirementMonth = retireYear !== null && year === retireYear && m === retireMonth;
    const cell = buildCell({
      key,
      label: `${m + 1} 月`,
      crossed: crossSets.month.has(key),
      today: isThisMonth,
      retirement: isRetirementMonth,
      disabled: isFuture,
      ariaLabel: `${year} 年 ${m + 1} 月${isThisMonth ? " · 本月" : ""}${isRetirementMonth ? " · 退休月" : ""}`,
    });
    els.calendarDays.appendChild(cell);
  }
}

function renderWeekView() {
  const { year } = calendarCursor;
  els.calendarTitle.textContent = `${year} 年 · 周`;

  const today = new Date();
  const todayWeek = isoWeekOf(today);
  const retireIso = settings.retireDate || "";
  const retireDate = retireIso ? new Date(`${retireIso}T00:00:00`) : null;
  const retireWeek = retireDate ? isoWeekOf(retireDate) : null;

  els.calendarPrev.disabled = false;
  els.calendarNext.disabled = retireWeek ? year >= retireWeek.year : year >= todayWeek.year;

  const total = isoWeeksInYear(year);
  els.calendarDays.replaceChildren();

  for (let w = 1; w <= total; w++) {
    const key = `${year}-W${String(w).padStart(2, "0")}`;
    const isFuture = year > todayWeek.year || (year === todayWeek.year && w > todayWeek.week);
    const isThisWeek = year === todayWeek.year && w === todayWeek.week;
    const isRetireWeek = retireWeek && year === retireWeek.year && w === retireWeek.week;
    const { start, end } = isoWeekDates(year, w);
    const range = `${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`;
    const cell = buildCell({
      key,
      label: `W${w}`,
      sub: range,
      crossed: crossSets.week.has(key),
      today: isThisWeek,
      retirement: isRetireWeek,
      disabled: isFuture,
      ariaLabel: `${key} · ${range}${isThisWeek ? " · 本周" : ""}${isRetireWeek ? " · 退休周" : ""}`,
    });
    els.calendarDays.appendChild(cell);
  }
}

function renderHourView() {
  const today = new Date();
  const todayIso = isoFromDate(today);
  els.calendarTitle.textContent = `今日 ${today.getMonth() + 1} 月 ${today.getDate()} 日`;
  els.calendarPrev.disabled = true;
  els.calendarNext.disabled = true;

  const retireIso = settings.retireDate || "";
  const reachedRetirement = retireIso && todayIso > retireIso;
  const currentHour = today.getHours();
  els.calendarDays.replaceChildren();

  for (let h = 0; h < 24; h++) {
    const key = `${todayIso}T${String(h).padStart(2, "0")}`;
    const isNow = h === currentHour;
    const isFuture = h > currentHour;
    const cell = buildCell({
      key,
      label: `${String(h).padStart(2, "0")}:00`,
      crossed: crossSets.hour.has(key),
      today: isNow,
      disabled: reachedRetirement || isFuture,
      ariaLabel: `${todayIso} ${h} 时${isNow ? " · 当前" : ""}`,
    });
    els.calendarDays.appendChild(cell);
  }
}

function buildCell({ key, label, sub, crossed, today, retirement, disabled, ariaLabel }) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "day-cell";
  cell.dataset.key = key;
  cell.setAttribute("role", "gridcell");
  if (today) cell.classList.add("day-cell--today");
  if (retirement) cell.classList.add("day-cell--retirement");
  if (disabled) { cell.classList.add("day-cell--disabled"); cell.disabled = true; }
  cell.setAttribute("aria-pressed", String(!!crossed));
  if (ariaLabel) cell.setAttribute("aria-label", `${ariaLabel} · ${crossed ? "已划掉" : "未划掉"}`);

  const num = document.createElement("span");
  num.className = "day-num";
  num.textContent = label;
  cell.appendChild(num);

  if (sub) {
    const subEl = document.createElement("span");
    subEl.className = "day-sub";
    subEl.textContent = sub;
    cell.appendChild(subEl);
  }

  cell.appendChild(createCrossSvg());

  if (retirement) {
    const flag = document.createElement("span");
    flag.className = "day-flag";
    flag.textContent = "退休";
    cell.appendChild(flag);
  }
  return cell;
}

function createCrossSvg() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "day-cross");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M7 8 L25 24", "M25 8 L7 24"]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function toggleCross(view, key, cell) {
  const set = crossSets[view];
  if (!set) return;
  if (set.has(key)) set.delete(key);
  else set.add(key);
  const pressed = set.has(key);
  cell.setAttribute("aria-pressed", String(pressed));
  settings.crossedMarks = {
    day: Array.from(crossSets.day).sort(),
    month: Array.from(crossSets.month).sort(),
    week: Array.from(crossSets.week).sort(),
    hour: Array.from(crossSets.hour).sort(),
  };
  saveSettings();
  triggerHaptic(pressed ? "Medium" : "Light");
  updateCalendarStats();
}

function updateCalendarStats() {
  const total = crossSets[calendarView]?.size ?? 0;
  const unit = { day: "天", month: "月", week: "周", hour: "时" }[calendarView] || "项";
  els.calendarStats.textContent = total > 0
    ? `已划掉 ${total} ${unit}`
    : `点击${unit === "天" ? "日期" : unit + "块"}标记已过`;
}

function isoFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function isoWeeksInYear(year) {
  const jan1 = new Date(year, 0, 1).getDay();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (isLeap && jan1 === 3) ? 53 : 52;
}

function isoWeekDates(year, week) {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(year, 0, 4 - jan4Day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

async function setupBackButton() {
  if (!isNative()) return;
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => {
      if (els.pickerSheet.open) {
        closePicker();
        return;
      }
      if (els.calendarSheet.open) {
        closeCalendar();
        return;
      }
      if (els.settingsDialog.open) {
        closeSettingsDialog();
        return;
      }
      App.minimizeApp();
    });
  } catch {
    // App plugin unavailable; let default behavior take over
  }
}

function setupSheetDragToClose() {
  attachDragToClose(els.settingsHandle, els.settingsDialog, closeSettingsDialog);
  attachDragToClose(els.pickerHandle, els.pickerSheet, closePicker);
  attachDragToClose(els.calendarHandle, els.calendarSheet, closeCalendar);
}

function attachDragToClose(handle, dialog, closeFn) {
  if (!handle || !dialog) return;
  const DRAG_THRESHOLD_PX = 80;
  const VELOCITY_THRESHOLD = 0.5; // px per ms

  let startY = 0;
  let startTime = 0;
  let dragging = false;
  let translate = 0;

  function reset() {
    dragging = false;
    dialog.style.transition = "transform 0.25s cubic-bezier(.2,.7,.2,1)";
    dialog.style.transform = "";
    requestAnimationFrame(() => {
      dialog.style.transition = "";
    });
  }

  handle.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    startTime = Date.now();
    translate = 0;
    dragging = true;
    dialog.style.transition = "none";
  }, { passive: true });

  handle.addEventListener("touchmove", (event) => {
    if (!dragging || event.touches.length !== 1) return;
    const dy = event.touches[0].clientY - startY;
    translate = Math.max(0, dy);
    dialog.style.transform = `translateY(${translate}px)`;
  }, { passive: true });

  handle.addEventListener("touchend", () => {
    if (!dragging) return;
    const duration = Math.max(Date.now() - startTime, 1);
    const velocity = translate / duration;
    if (translate > DRAG_THRESHOLD_PX || velocity > VELOCITY_THRESHOLD) {
      closeFn();
    }
    reset();
  });

  handle.addEventListener("touchcancel", reset);
}

function refreshPolicyCalculation() {
  const policyMode = els.calculationMode.value === "policy";
  els.policyFields.hidden = !policyMode;
  els.resultCard.hidden = true;
  els.retireDate.readOnly = policyMode;
  els.flexMonthsLabel.hidden = els.flexMode.value === "statutory";

  if (!policyMode) {
    els.policyNote.textContent = "手动日期适合特殊工种、已确认退休时间,或不适用企业职工法定退休年龄规则的情况。";
    return null;
  }

  if (!els.birthDate.value) {
    els.retireDate.value = "";
    els.policyNote.textContent = "填写出生日期后自动计算。特殊工种、提前退休资格和养老金缴费年限需以当地社保经办口径为准。";
    return null;
  }

  const result = calculateRetirementDate({
    birthDate: els.birthDate.value,
    workerType: els.workerType.value,
    flexMode: els.flexMode.value,
    flexMonths: els.flexMonths.value,
  });

  els.retireDate.value = result.finalDate;
  els.resultCard.hidden = false;

  // Update Timeline
  document.getElementById("baseRetireDate").textContent = result.baseDate.slice(2);
  document.getElementById("statutoryRetireDate").textContent = result.statutoryDate.slice(2);
  document.getElementById("finalRetireDate").textContent = result.finalDate.slice(2);
  
  const delayLabel = document.getElementById("delayLabel");
  delayLabel.textContent = `+${result.delayMonths}m`;
  delayLabel.hidden = result.delayMonths === 0;
  document.getElementById("delayArrow").style.opacity = result.delayMonths === 0 ? "0.3" : "1";

  const flexLabel = document.getElementById("flexLabel");
  const flexPrefix = result.flexMode === "early" ? "-" : "+";
  flexLabel.textContent = `${flexPrefix}${result.appliedFlexMonths}m`;
  flexLabel.hidden = result.appliedFlexMonths === 0;
  document.getElementById("flexArrow").style.opacity = result.appliedFlexMonths === 0 ? "0.3" : "1";

  // Update Summary
  els.statutoryResult.textContent = `${result.statutoryDate}(${result.statutoryAgeText})`;
  els.finalResult.textContent = `${result.finalDate}(${result.finalAgeText})`;
  els.policyNote.textContent = `${result.workerLabel};弹性提前/延迟统一按最多 ${FLEX_LIMIT_MONTHS} 个月处理。特殊工种、缴费年限等仍需以当地社保经办口径为准。`;

  return result;
}

function formatFlexSummary(result) {
  if (result.flexMode === "early") return `,提前 ${result.appliedFlexMonths} 个月`;
  if (result.flexMode === "late") return `,延迟 ${result.appliedFlexMonths} 个月`;
  return "";
}

function updateCountdown() {
  const today = new Date();
  els.todayLabel.textContent = `今天 ${formatDate(today)}`;

  if (!settings.retireDate) {
    setEmptyCountdown();
    return;
  }

  const target = startOfDay(new Date(`${settings.retireDate}T00:00:00`));
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  const days = Math.ceil(diff / dayMs());
  const safeDays = Math.max(days, 0);

  els.targetLabel.textContent = `退休日 ${formatDate(target)}`;
  setHeroCount(String(safeDays));
  els.monthsLeft.textContent = String(Math.max(monthDiff(today, target), 0));
  els.weeksLeft.textContent = String(Math.max(Math.ceil(safeDays / 7), 0));
  els.hoursLeft.textContent = String(Math.max(Math.ceil(diff / (60 * 60 * 1000)), 0));

  if (days > 1) {
    els.status.textContent = `还有 ${safeDays} 天,每天定时提醒一次。`;
  } else if (days === 1) {
    els.status.textContent = "明天就是退休日。";
  } else {
    els.status.textContent = "退休日已到,祝你开启新的节奏。";
  }

  renderMonthBand(target);
}

function setEmptyCountdown() {
  els.targetLabel.textContent = "退休日未设置";
  setHeroCount("--");
  els.monthsLeft.textContent = "--";
  els.weeksLeft.textContent = "--";
  els.hoursLeft.textContent = "--";
  els.status.textContent = "设置退休日期后开始倒计时。";
  renderMonthBand(null);
}

function setHeroCount(value) {
  const text = String(value);
  if (els.heroCount.dataset.value === text) return;
  els.heroCount.dataset.value = text;
  
  // Clear existing reels
  els.heroCount.replaceChildren();
  
  if (reduceMotionQuery.matches || isNaN(parseInt(text, 10))) {
    els.heroCount.textContent = text;
    return;
  }

  // Create reels for each digit
  text.split("").forEach((char) => {
    if (isNaN(parseInt(char, 10))) {
      const span = document.createElement("span");
      span.textContent = char;
      els.heroCount.appendChild(span);
      return;
    }

    const reel = document.createElement("div");
    reel.className = "digit-reel";
    // Create 0-9 spans
    for (let i = 0; i <= 9; i++) {
      const s = document.createElement("span");
      s.textContent = String(i);
      reel.appendChild(s);
    }
    els.heroCount.appendChild(reel);
    
    // Animate to position
    requestAnimationFrame(() => {
      reel.style.transform = `translateY(-${parseInt(char, 10) * 10}%)`;
    });
  });
}

function renderMonthBand(target) {
  els.monthDots.replaceChildren();

  if (!target) {
    els.bandYear.textContent = "----";
    els.bandCaption.textContent = "设置退休日后,这里会显示退休年的工作 / 退休月份。";
    for (let m = 1; m <= 12; m++) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = MONTH_LABELS[m - 1];
      els.monthDots.appendChild(li);
    }
    return;
  }

  const year = target.getFullYear();
  const retireMonth = target.getMonth() + 1;
  els.bandYear.textContent = String(year);
  els.bandCaption.textContent = `${year} 年内,前 ${retireMonth - 1} 个月仍在工作,从 ${retireMonth} 月起退休。`;

  for (let m = 1; m <= 12; m++) {
    const li = document.createElement("li");
    if (m >= retireMonth) li.classList.add("retired");
    if (m === retireMonth) li.classList.add("retire-month");
    li.textContent = MONTH_LABELS[m - 1];
    
    // Tooltip logic
    const monthDate = new Date(year, m - 1, 1);
    const today = startOfDay(new Date());
    if (monthDate > today) {
      const diff = monthDate.getTime() - today.getTime();
      const days = Math.ceil(diff / dayMs());
      li.setAttribute("data-tooltip", `距该月还有 ${days} 天`);
    } else if (monthDate.getMonth() === today.getMonth() && monthDate.getFullYear() === today.getFullYear()) {
      li.setAttribute("data-tooltip", "本月");
    } else {
      li.setAttribute("data-tooltip", "已过去");
    }
    
    els.monthDots.appendChild(li);
  }
}

async function setupReminderToggle() {
  if (settings.remindersEnabled === null || settings.remindersEnabled === undefined) {
    settings.remindersEnabled = await isNotificationPermissionGranted();
    saveSettings();
  }
  applyReminderSwitchState();
  const row = document.querySelector("#reminderSwitchRow");
  (row ?? els.remindersToggle).addEventListener("click", toggleReminders);
}

function applyReminderSwitchState() {
  const on = !!settings.remindersEnabled;
  els.remindersToggle.setAttribute("aria-checked", String(on));
  els.reminderDetails.dataset.open = String(on);
  els.reminderDetails.setAttribute("aria-hidden", String(!on));
  els.reminderStatus.classList.remove("warning");
  els.reminderStatus.textContent = on ? "已开启" : "已关闭";
}

async function toggleReminders() {
  const target = !settings.remindersEnabled;
  triggerHaptic();

  if (target) {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      els.reminderStatus.textContent = "通知被拒绝,请到系统设置开启";
      els.reminderStatus.classList.add("warning");
      triggerHaptic("Medium");
      return;
    }
  } else {
    await cancelNativeReminder();
  }

  settings.remindersEnabled = target;
  saveSettings();
  applyReminderSwitchState();
  await scheduleReminder();

  if (target && isNative()) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now() % 100000,
            title: "退休倒计时已开启",
            body: "之后会按你设置的时间提醒。",
            schedule: { at: new Date(Date.now() + 1000) },
          },
        ],
      });
    } catch {}
  } else if (target && !isNative()) {
    showWebNotification("退休倒计时已开启", "之后会按你设置的时间提醒。");
  }
}

async function isNotificationPermissionGranted() {
  if (isNative()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      return perm.display === "granted";
    } catch {
      return false;
    }
  }
  return "Notification" in window && Notification.permission === "granted";
}

async function ensureNotificationPermission() {
  if (isNative()) {
    try {
      const perm = await LocalNotifications.requestPermissions();
      await ensureAndroidNotificationChannel();
      return perm.display === "granted";
    } catch {
      return false;
    }
  }
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

async function scheduleReminder() {
  window.clearTimeout(reminderTimer);

  if (!settings.remindersEnabled) {
    els.nextReminder.textContent = "未启用";
    await cancelNativeReminder();
    return;
  }

  if (!settings.retireDate || !settings.reminderTime) {
    els.nextReminder.textContent = "未设置";
    await cancelNativeReminder();
    return;
  }

  if (isRetired(settings.retireDate)) {
    els.nextReminder.textContent = "已退休,提醒已停止";
    await cancelNativeReminder();
    await notifyRetirementReachedOnce();
    return;
  }

  const next = getNextReminderTime(settings.reminderTime);
  els.nextReminder.textContent = formatDateTime(next);

  if (isNative()) {
    await scheduleNativeReminder(next);
    return;
  }

  reminderTimer = window.setTimeout(() => {
    fireWebDailyReminder();
    scheduleReminder();
  }, Math.max(next.getTime() - Date.now(), 1000));
}

async function scheduleNativeReminder(next) {
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted" || isRetired(settings.retireDate)) return;

  await ensureAndroidNotificationChannel();
  await cancelNativeReminder();

  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: settings.reminderText,
        body: nativeReminderBody(),
        schedule: {
          at: next,
          repeats: true,
          every: "day",
          allowWhileIdle: true,
        },
        channelId: "daily-retirement-reminder",
      },
    ],
  });
}

async function cancelNativeReminder() {
  if (!isNative()) return;
  await LocalNotifications.cancel({
    notifications: [{ id: NOTIFICATION_ID }],
  }).catch(() => {});
}

async function ensureAndroidNotificationChannel() {
  if (!isNative() || Capacitor.getPlatform() !== "android") return;

  await LocalNotifications.createChannel({
    id: "daily-retirement-reminder",
    name: "每日退休倒计时提醒",
    description: "每天定时发送退休倒计时提醒",
    importance: 4,
    visibility: 1,
    sound: "default",
  }).catch(() => {});
}

function fireWebDailyReminder() {
  updateCountdown();
  if (isRetired(settings.retireDate)) {
    notifyRetirementReachedOnce();
    scheduleReminder();
    return;
  }

  if (!("Notification" in window) || Notification.permission !== "granted") return;
  showWebNotification(settings.reminderText, nativeReminderBody());
}

async function notifyRetirementReachedOnce() {
  if (settings.retirementReachedNotified) return;

  if (isNative()) {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") return;

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now() % 100000,
            title: "退休日已到",
            body: "退休倒计时提醒已停止。",
            schedule: { at: new Date(Date.now() + 1000) },
            channelId: "daily-retirement-reminder",
          },
        ],
      });
      markRetirementReachedNotified();
    } catch {
      // Native schedule rejected; leave the flag unset so the next pass retries.
    }
    return;
  }

  if ("Notification" in window && Notification.permission === "granted") {
    showWebNotification("退休日已到", "退休倒计时提醒已停止。");
    markRetirementReachedNotified();
  }
}

function markRetirementReachedNotified() {
  settings.retirementReachedNotified = true;
  saveSettings();
}

function nativeReminderBody() {
  if (isRetired(settings.retireDate)) return "退休日已到,提醒已停止。";

  const daysLeft = settings.retireDate
    ? Math.max(Math.ceil((parseDateOnly(settings.retireDate).getTime() - Date.now()) / dayMs()), 0)
    : 0;
  return `距离退休还有 ${daysLeft} 天。`;
}

function showWebNotification(title, body) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "retirement-countdown",
      });
    });
    return;
  }

  new Notification(title, {
    body,
    icon: "/icon.svg",
    tag: "retirement-countdown",
  });
}

function getNextReminderTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date();
  next.setHours(hours || 0, minutes || 0, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

async function generateShareImage() {
  if (!settings.retireDate) {
    alert("请先设置退休日期再分享。");
    return;
  }

  triggerHaptic("Medium");
  const isDusk = settings.mood === "dusk";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const dpr = 2;
  canvas.width = 600 * dpr;
  canvas.height = 800 * dpr;
  ctx.scale(dpr, dpr);

  drawSharePoster(ctx, {
    isDusk,
    days: els.heroCount.dataset.value || "--",
    today: formatDate(new Date()),
    retireDate: formatDate(parseDateOnly(settings.retireDate)),
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    alert("生成图片失败,请稍后再试。");
    return;
  }

  if (isNative()) {
    try {
      await shareImageNative(blob);
    } catch (err) {
      console.error("native share failed", err);
      alert("分享失败,请稍后再试。");
    }
    return;
  }

  const file = new File([blob], "retirement-countdown.png", { type: "image/png" });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "我的退休倒计时",
        text: `我离退休还有 ${els.heroCount.dataset.value} 天!`,
      });
    } catch (err) {
      if (err.name !== "AbortError") downloadImage(canvas);
    }
  } else {
    downloadImage(canvas);
  }
}

const POSTER_SERIF = '"Newsreader", "Noto Serif SC", "Songti SC", serif';
const POSTER_SANS = 'Inter, system-ui, -apple-system, sans-serif';

function drawSharePoster(ctx, { isDusk, days, today, retireDate }) {
  const theme = isDusk
    ? {
        bg: "#1A1411",
        primary: "#D4A76A",
        secondary: "#F0E5D4",
        muted: "#A89886",
        glow: { x: 300, y: 550, radius: 500, color: "rgba(212,167,106,0.15)", stop: 0.8 },
        slogan: "Life begins at retirement",
      }
    : {
        bg: "#F7F4ED",
        primary: "#126C62",
        secondary: "#1F2933",
        muted: "#6B7280",
        glow: { x: 500, y: 100, radius: 400, color: "rgba(18,108,98,0.08)", stop: 0.7 },
        slogan: "开启退休新节奏",
      };

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, 600, 800);

  const grad = ctx.createRadialGradient(
    theme.glow.x, theme.glow.y, 0,
    theme.glow.x, theme.glow.y, theme.glow.radius,
  );
  grad.addColorStop(0, theme.glow.color);
  grad.addColorStop(theme.glow.stop, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 800);

  // 1. Eyebrow — top:80, 12px sans 700, letter-spacing 0.25em (=3px), uppercase
  ctx.fillStyle = theme.muted;
  ctx.font = `700 12px ${POSTER_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.letterSpacing = "3px";
  ctx.fillText("RETIREMENT COUNTDOWN", 300, 80);

  // 2. Hero number + unit, baseline-aligned, group horiz-centered, group vert-centered at y=360
  ctx.fillStyle = theme.primary;
  ctx.textBaseline = "alphabetic";

  ctx.font = `700 140px ${POSTER_SERIF}`;
  ctx.letterSpacing = "-2.8px"; // -0.02em of 140
  const heroW = ctx.measureText(days).width;
  const heroMetrics = ctx.measureText(days);
  const asc = heroMetrics.fontBoundingBoxAscent || heroMetrics.actualBoundingBoxAscent || 105;
  const desc = heroMetrics.fontBoundingBoxDescent || heroMetrics.actualBoundingBoxDescent || 30;
  const baselineY = 360 + (asc - desc) / 2;

  ctx.font = `500 36px ${POSTER_SERIF}`;
  ctx.letterSpacing = "0px";
  const unitW = ctx.measureText("天").width;

  const groupW = heroW + 12 + unitW;
  const startX = (600 - groupW) / 2;

  ctx.font = `700 140px ${POSTER_SERIF}`;
  ctx.letterSpacing = "-2.8px";
  ctx.textAlign = "left";
  ctx.fillText(days, startX, baselineY);

  ctx.font = `500 36px ${POSTER_SERIF}`;
  ctx.letterSpacing = "0px";
  ctx.fillText("天", startX + heroW + 12, baselineY);

  // 3. Slogan — top:520, 22px serif, letter-spacing 0.12em (=2.64px), secondary
  ctx.fillStyle = theme.secondary;
  ctx.font = `400 22px ${POSTER_SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.letterSpacing = "2.64px";
  ctx.fillText(theme.slogan, 300, 520);

  // 4. Footer dates — bottom:80 (container bottom at y=720), 14px sans, gap 10, ls 0.05em
  ctx.fillStyle = theme.muted;
  ctx.font = `400 14px ${POSTER_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.letterSpacing = "0.7px";

  const lineH = 14 * 1.2;
  const line2Bottom = 720;
  const line1Bottom = line2Bottom - lineH - 10;
  ctx.fillText(`今天：${today}`, 300, line1Bottom);
  ctx.fillText(`退休日：${retireDate}`, 300, line2Bottom);

  ctx.letterSpacing = "0px";
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__drawSharePoster = drawSharePoster;
}

async function shareImageNative(blob) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const base64 = await blobToBase64(blob);
  const filename = `retirement-countdown-${Date.now()}.png`;
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({
    title: "我的退休倒计时",
    text: `我离退休还有 ${els.heroCount.dataset.value} 天!`,
    url: written.uri,
    dialogTitle: "分享我的退休倒计时",
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function downloadImage(canvas) {
  const link = document.createElement("a");
  link.download = "retirement-countdown.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function formatDate(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function monthDiff(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
}

function dayMs() {
  return 24 * 60 * 60 * 1000;
}

function isNative() {
  return Capacitor.isNativePlatform();
}
