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
  retirementReachedNotified: false,
  mood: "day",
};

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
  notifyButton: document.querySelector("#notifyButton"),
  moodToggle: document.querySelector("#moodToggle"),
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
  permissionState: document.querySelector("#permissionState"),
  calculationModeLabel: document.querySelector("#calculationModeLabel"),
  workerTypeLabel: document.querySelector("#workerTypeLabel"),
  flexModeLabel: document.querySelector("#flexModeLabel"),
  pickerSheet: document.querySelector("#pickerSheet"),
  pickerTitle: document.querySelector("#pickerTitle"),
  pickerOptions: document.querySelector("#pickerOptions"),
  pickerClose: document.querySelector("#pickerClose"),
  pickerHandle: document.querySelector("#pickerHandle"),
};

let settings = loadSettings();
let reminderTimer = null;
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

init();

function init() {
  els.flexMonths.max = String(FLEX_LIMIT_MONTHS);
  els.flexMonths.setAttribute("aria-valuemax", String(FLEX_LIMIT_MONTHS));
  applySettingsToForm();
  applyMood();
  refreshPolicyCalculation();
  updateCountdown();
  updatePermissionState();
  scheduleReminder();

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

  els.flexMonths.addEventListener("input", () => updateFlexSliderDisplay(els.flexMonths.value));

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
    updateCountdown();
    await scheduleReminder();
    closeSettingsDialog();
  });

  els.notifyButton.addEventListener("click", requestNotifications);

  els.moodToggle.addEventListener("click", () => {
    settings.mood = settings.mood === "dusk" ? "day" : "dusk";
    saveSettings();
    applyMood();
  });

  els.openSettings.addEventListener("click", openSettingsDialog);
  els.closeSettings.addEventListener("click", closeSettingsDialog);

  setupPickers();
  setupSheetDragToClose();

  window.setInterval(updateCountdown, 60 * 1000);

  if (!isNative() && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
}

function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    stored = {};
  }
  const needsMigration = stored.dark !== undefined && stored.mood === undefined;
  if (needsMigration) {
    stored.mood = stored.dark ? "dusk" : "day";
    delete stored.dark;
  }
  const merged = { ...defaults, ...stored };
  if (needsMigration) {
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
  els.birthDate.value = settings.birthDate;
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
}

function openSettingsDialog() {
  if (typeof els.settingsDialog.showModal === "function") {
    els.settingsDialog.showModal();
  } else {
    els.settingsDialog.setAttribute("open", "");
  }
}

function closeSettingsDialog() {
  if (typeof els.settingsDialog.close === "function") {
    els.settingsDialog.close();
  } else {
    els.settingsDialog.removeAttribute("open");
  }
}

function setupPickers() {
  document.querySelectorAll(".picker-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => openPicker(trigger.dataset.picker));
  });
  els.pickerClose.addEventListener("click", closePicker);
  els.pickerSheet.addEventListener("click", (event) => {
    if (event.target === els.pickerSheet) closePicker();
  });
}

function openPicker(field) {
  const options = PICKER_OPTIONS[field];
  if (!options) {
    console.warn(`Unknown picker field: ${field}`);
    return;
  }
  const input = document.getElementById(field);
  const currentValue = input?.value ?? "";

  els.pickerTitle.textContent = pickerTitleFor(field);
  els.pickerOptions.replaceChildren();

  options.forEach((opt) => {
    const li = document.createElement("li");
    li.className = "picker-option";
    li.setAttribute("role", "option");
    li.dataset.value = opt.value;
    li.setAttribute("aria-selected", String(opt.value === currentValue));
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
}

function closePicker() {
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
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function pickerTitleFor(field) {
  switch (field) {
    case "calculationMode": return "计算方式";
    case "workerType": return "人员类型";
    case "flexMode": return "弹性退休";
    default: return "选择";
  }
}

function setupSheetDragToClose() {
  if (!els.settingsHandle) return;
  const DRAG_THRESHOLD_PX = 80;
  const VELOCITY_THRESHOLD = 0.5; // px per ms

  const dialog = els.settingsDialog;
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

  els.settingsHandle.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    startTime = Date.now();
    translate = 0;
    dragging = true;
    dialog.style.transition = "none";
  }, { passive: true });

  els.settingsHandle.addEventListener("touchmove", (event) => {
    if (!dragging || event.touches.length !== 1) return;
    const dy = event.touches[0].clientY - startY;
    translate = Math.max(0, dy);
    dialog.style.transform = `translateY(${translate}px)`;
  }, { passive: true });

  els.settingsHandle.addEventListener("touchend", () => {
    if (!dragging) return;
    const duration = Math.max(Date.now() - startTime, 1);
    const velocity = translate / duration;
    if (translate > DRAG_THRESHOLD_PX || velocity > VELOCITY_THRESHOLD) {
      closeSettingsDialog();
    }
    reset();
  });

  els.settingsHandle.addEventListener("touchcancel", reset);
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
  els.statutoryResult.textContent = `${result.statutoryDate}(${result.statutoryAgeText},延迟 ${result.delayMonths} 个月)`;
  els.finalResult.textContent = `${result.finalDate}(${result.finalAgeText}${formatFlexSummary(result)})`;
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
  if (els.heroCount.textContent === text) return;
  els.heroCount.textContent = text;
  if (reduceMotionQuery.matches || typeof els.heroCount.animate !== "function") return;
  els.heroCount.animate(
    [
      { transform: "translateY(-12px)", opacity: 0 },
      { transform: "translateY(0)", opacity: 1 },
    ],
    { duration: 360, easing: "cubic-bezier(.2,.7,.2,1)" },
  );
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
    els.monthDots.appendChild(li);
  }
}

async function requestNotifications() {
  if (isNative()) {
    const permission = await LocalNotifications.requestPermissions();
    await ensureAndroidNotificationChannel();
    updatePermissionState();

    if (permission.display === "granted") {
      await scheduleReminder();
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
    }
    return;
  }

  if (!("Notification" in window)) {
    updatePermissionState("当前浏览器不支持通知");
    return;
  }

  const permission = await Notification.requestPermission();
  updatePermissionState();

  if (permission === "granted") {
    showWebNotification("退休倒计时已开启", "之后会按你设置的时间提醒。");
    scheduleReminder();
  }
}

async function scheduleReminder() {
  window.clearTimeout(reminderTimer);

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

async function updatePermissionState(customText) {
  if (customText) {
    els.permissionState.textContent = customText;
    els.permissionState.classList.add("warning");
    return;
  }

  if (isNative()) {
    const permission = await LocalNotifications.checkPermissions();
    const granted = permission.display === "granted";
    els.permissionState.textContent = granted ? "通知已开启" : "通知未开启";
    els.permissionState.classList.toggle("warning", !granted);
    return;
  }

  const supported = "Notification" in window;
  const permission = supported ? Notification.permission : "unsupported";
  els.permissionState.classList.toggle("warning", permission !== "granted");

  if (!supported) {
    els.permissionState.textContent = "不支持通知";
  } else if (permission === "granted") {
    els.permissionState.textContent = "通知已开启";
  } else if (permission === "denied") {
    els.permissionState.textContent = "通知被拒绝";
  } else {
    els.permissionState.textContent = "通知未开启";
  }
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
