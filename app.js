const STORAGE_KEY = "retirement-countdown-settings";

const defaults = {
  retireDate: "",
  reminderTime: "09:00",
  reminderText: "今天也离退休更近了一天",
  dark: false,
};

const els = {
  form: document.querySelector("#settingsForm"),
  retireDate: document.querySelector("#retireDate"),
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
  updateCountdown();
  updatePermissionState();
  scheduleReminder();

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    settings = {
      ...settings,
      retireDate: els.retireDate.value,
      reminderTime: els.reminderTime.value || defaults.reminderTime,
      reminderText: els.reminderText.value.trim() || defaults.reminderText,
    };
    saveSettings();
    updateCountdown();
    scheduleReminder();
  });

  els.notifyButton.addEventListener("click", requestNotifications);

  els.themeToggle.addEventListener("click", () => {
    settings.dark = !settings.dark;
    saveSettings();
    applyTheme();
  });

  window.setInterval(updateCountdown, 60 * 1000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
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
  els.retireDate.value = settings.retireDate;
  els.reminderTime.value = settings.reminderTime;
  els.reminderText.value = settings.reminderText;
}

function applyTheme() {
  document.body.classList.toggle("dark", Boolean(settings.dark));
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
  if (!("Notification" in window)) {
    updatePermissionState("当前浏览器不支持通知");
    return;
  }

  const permission = await Notification.requestPermission();
  updatePermissionState();

  if (permission === "granted") {
    showNotification("退休倒计时已开启", "之后会按你设置的时间提醒。");
    scheduleReminder();
  }
}

function scheduleReminder() {
  window.clearTimeout(reminderTimer);

  if (!settings.retireDate || !settings.reminderTime) {
    els.nextReminder.textContent = "未设置";
    return;
  }

  const next = getNextReminderTime(settings.reminderTime);
  els.nextReminder.textContent = formatDateTime(next);

  reminderTimer = window.setTimeout(() => {
    fireDailyReminder();
    scheduleReminder();
  }, Math.max(next.getTime() - Date.now(), 1000));
}

function fireDailyReminder() {
  updateCountdown();
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const daysLeft = settings.retireDate
    ? Math.max(Math.ceil((new Date(`${settings.retireDate}T00:00:00`).getTime() - Date.now()) / dayMs()), 0)
    : 0;

  showNotification(settings.reminderText, `距离退休还有 ${daysLeft} 天。`);
}

function showNotification(title, body) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        body,
        icon: "./icon.svg",
        badge: "./icon.svg",
        tag: "retirement-countdown",
      });
    });
    return;
  }

  new Notification(title, {
    body,
    icon: "./icon.svg",
    tag: "retirement-countdown",
  });
}

function updatePermissionState(customText) {
  const supported = "Notification" in window;
  const permission = supported ? Notification.permission : "unsupported";
  els.permissionState.classList.toggle("warning", permission !== "granted");

  if (customText) {
    els.permissionState.textContent = customText;
  } else if (!supported) {
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
