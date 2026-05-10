import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const STORAGE_KEY = "retirement-countdown-settings";
const NOTIFICATION_ID = 1001;

const RETIREMENT_RULES = {
  male: {
    label: "男职工：原 60 岁退休",
    baseAgeMonths: 60 * 12,
    reformStart: { year: 1965, month: 1 },
    monthsPerDelayMonth: 4,
    maxDelayMonths: 36,
    originalMinimumAgeMonths: 60 * 12,
  },
  female55: {
    label: "女职工：原 55 岁退休",
    baseAgeMonths: 55 * 12,
    reformStart: { year: 1970, month: 1 },
    monthsPerDelayMonth: 4,
    maxDelayMonths: 36,
    originalMinimumAgeMonths: 55 * 12,
  },
  female50: {
    label: "女职工：原 50 岁退休",
    baseAgeMonths: 50 * 12,
    reformStart: { year: 1975, month: 1 },
    monthsPerDelayMonth: 2,
    maxDelayMonths: 60,
    originalMinimumAgeMonths: 50 * 12,
  },
};

const defaults = {
  calculationMode: "policy",
  birthDate: "",
  workerType: "male",
  flexMode: "statutory",
  flexMonths: 0,
  retireDate: "",
  reminderTime: "09:00",
  reminderText: "今天也离退休更近了一天",
  dark: false,
};

const els = {
  form: document.querySelector("#settingsForm"),
  calculationMode: document.querySelector("#calculationMode"),
  policyFields: document.querySelector("#policyFields"),
  birthDate: document.querySelector("#birthDate"),
  workerType: document.querySelector("#workerType"),
  flexMode: document.querySelector("#flexMode"),
  flexMonths: document.querySelector("#flexMonths"),
  flexMonthsLabel: document.querySelector("#flexMonthsLabel"),
  retireDate: document.querySelector("#retireDate"),
  policyNote: document.querySelector("#policyNote"),
  reminderTime: document.querySelector("#reminderTime"),
  reminderText: document.querySelector("#reminderText"),
  notifyButton: document.querySelector("#notifyButton"),
  themeToggle: document.querySelector("#themeToggle"),
  todayLabel: document.querySelector("#todayLabel"),
  targetLabel: document.querySelector("#targetLabel"),
  heroCount: document.querySelector("#heroCount .number"),
  monthsLeft: document.querySelector("#monthsLeft"),
  weeksLeft: document.querySelector("#weeksLeft"),
  hoursLeft: document.querySelector("#hoursLeft"),
  status: document.querySelector("#retirementStatus"),
  nextReminder: document.querySelector("#nextReminder"),
  permissionState: document.querySelector("#permissionState"),
};

let settings = loadSettings();
let reminderTimer = null;

init();

function init() {
  applySettingsToForm();
  applyTheme();
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

  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    refreshPolicyCalculation();

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

    saveSettings();
    updateCountdown();
    await scheduleReminder();
  });

  els.notifyButton.addEventListener("click", requestNotifications);

  els.themeToggle.addEventListener("click", () => {
    settings.dark = !settings.dark;
    saveSettings();
    applyTheme();
  });

  window.setInterval(updateCountdown, 60 * 1000);

  if (!isNative() && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
}

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return { ...defaults };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettingsToForm() {
  els.calculationMode.value = settings.calculationMode;
  els.birthDate.value = settings.birthDate;
  els.workerType.value = settings.workerType;
  els.flexMode.value = settings.flexMode;
  els.flexMonths.value = settings.flexMonths;
  els.retireDate.value = settings.retireDate;
  els.reminderTime.value = settings.reminderTime;
  els.reminderText.value = settings.reminderText;
}

function applyTheme() {
  document.body.classList.toggle("dark", Boolean(settings.dark));
}

function refreshPolicyCalculation() {
  const policyMode = els.calculationMode.value === "policy";
  els.policyFields.hidden = !policyMode;
  els.retireDate.readOnly = policyMode;
  els.flexMonthsLabel.hidden = els.flexMode.value === "statutory";

  if (!policyMode) {
    els.policyNote.textContent = "手动日期适合特殊工种、已确认退休时间，或不适用企业职工法定退休年龄规则的情况。";
    return;
  }

  if (!els.birthDate.value) {
    els.retireDate.value = "";
    els.policyNote.textContent = "填写出生日期后自动计算。特殊工种、提前退休资格和养老金缴费年限需以当地社保经办口径为准。";
    return;
  }

  const result = calculateRetirementDate({
    birthDate: els.birthDate.value,
    workerType: els.workerType.value,
    flexMode: els.flexMode.value,
    flexMonths: els.flexMonths.value,
  });

  els.retireDate.value = result.date;
  els.policyNote.textContent = result.note;
}

function calculateRetirementDate({ birthDate, workerType, flexMode, flexMonths }) {
  const birth = parseDateOnly(birthDate);
  const rule = RETIREMENT_RULES[workerType] || RETIREMENT_RULES.male;
  const delayMonths = calculateDelayMonths(birth, rule);
  const statutoryAgeMonths = rule.baseAgeMonths + delayMonths;
  const statutoryDate = addMonths(birth, statutoryAgeMonths);
  const normalizedFlexMonths = normalizeFlexMonths(flexMonths);

  let finalAgeMonths = statutoryAgeMonths;
  if (flexMode === "early") {
    finalAgeMonths = Math.max(
      rule.originalMinimumAgeMonths,
      statutoryAgeMonths - normalizedFlexMonths,
    );
  } else if (flexMode === "late") {
    finalAgeMonths = statutoryAgeMonths + normalizedFlexMonths;
  }

  const finalDate = addMonths(birth, finalAgeMonths);
  const statutoryAge = formatAge(statutoryAgeMonths);
  const finalAge = formatAge(finalAgeMonths);
  const flexText =
    flexMode === "early"
      ? `弹性提前 ${statutoryAgeMonths - finalAgeMonths} 个月`
      : flexMode === "late"
        ? `弹性延迟 ${normalizedFlexMonths} 个月`
        : "未选择弹性调整";

  return {
    date: formatInputDate(finalDate),
    note: `${rule.label}；改革后法定退休年龄 ${statutoryAge}，延迟 ${delayMonths} 个月；${flexText}；当前计算退休年龄 ${finalAge}。`,
  };
}

function calculateDelayMonths(birth, rule) {
  const startIndex = rule.reformStart.year * 12 + (rule.reformStart.month - 1);
  const birthIndex = birth.getFullYear() * 12 + birth.getMonth();
  const monthsAfterStart = birthIndex - startIndex;
  if (monthsAfterStart < 0) return 0;

  const delayMonths = Math.floor(monthsAfterStart / rule.monthsPerDelayMonth) + 1;
  return Math.min(delayMonths, rule.maxDelayMonths);
}

function updateCountdown() {
  const today = new Date();
  els.todayLabel.textContent = `今天：${formatDate(today)}`;

  if (!settings.retireDate) {
    setEmptyCountdown();
    return;
  }

  const target = startOfDay(new Date(`${settings.retireDate}T00:00:00`));
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  const days = Math.ceil(diff / dayMs());
  const safeDays = Math.max(days, 0);

  els.targetLabel.textContent = `退休日：${formatDate(target)}`;
  els.heroCount.textContent = String(safeDays);
  els.monthsLeft.textContent = String(Math.max(monthDiff(today, target), 0));
  els.weeksLeft.textContent = String(Math.max(Math.ceil(safeDays / 7), 0));
  els.hoursLeft.textContent = String(Math.max(Math.ceil(diff / (60 * 60 * 1000)), 0));

  if (days > 1) {
    els.status.textContent = `距离目标还有 ${safeDays} 天。按设定时间每天提醒一次。`;
  } else if (days === 1) {
    els.status.textContent = "明天就是退休日。";
  } else {
    els.status.textContent = "退休日已到，祝你开启新的节奏。";
  }
}

function setEmptyCountdown() {
  els.targetLabel.textContent = "目标日期未设置";
  els.heroCount.textContent = "--";
  els.monthsLeft.textContent = "--";
  els.weeksLeft.textContent = "--";
  els.hoursLeft.textContent = "--";
  els.status.textContent = "设置退休日期后开始倒计时。";
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
  if (permission.display !== "granted") return;

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
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  showWebNotification(settings.reminderText, nativeReminderBody());
}

function nativeReminderBody() {
  const daysLeft = settings.retireDate
    ? Math.max(Math.ceil((new Date(`${settings.retireDate}T00:00:00`).getTime() - Date.now()) / dayMs()), 0)
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

function addMonths(date, months) {
  const copy = new Date(date);
  const day = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(day, lastDay));
  return startOfDay(copy);
}

function parseDateOnly(value) {
  return startOfDay(new Date(`${value}T00:00:00`));
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAge(totalMonths) {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months ? `${years} 岁 ${months} 个月` : `${years} 岁`;
}

function normalizeFlexMonths(value) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return 0;
  return Math.min(Math.max(number, 0), 36);
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

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
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
