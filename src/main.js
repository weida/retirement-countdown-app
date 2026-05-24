import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  FLEX_LIMIT_MONTHS,
  calculateRetirementDate,
  formatCountdownStatus,
  isRetired,
  normalizeFlexMonths,
  parseDateOnly,
  startOfDay,
} from "./retirement.js";
import { isShareCanceledError } from "./share.js";

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
const RETIRE_YEAR_MIN = 2010;
const RETIRE_YEAR_MAX = 2080;
const RETIRE_YEAR_DEFAULT_FOCUS = String(new Date().getFullYear() + 10);
const REMINDER_MINUTE_STEP = 5;

// 每日一句小签:轻、稳、松弛、有盼头。同一天稳定显示,不写入 localStorage。
// 365 条,大致一年不重复;按主题分桶覆盖(接近/慢/日常/自我允许/休息/时间为伴/观察/平凡/盼头)。
const DAILY_LINES = [
  // === 第 1 批:原始 80 条(已上线验证) ===
  "再靠近一点",
  "今天也算数",
  "慢慢就到了",
  "把今天过稳",
  "离自由更近",
  "又少了一天",
  "稳稳往前走",
  "日子在变短",
  "未来在靠近",
  "今天轻一点",
  "向松弛靠近",
  "把盼头留住",
  "继续靠近自由",
  "今天也有进度",
  "少一天班,多一点盼",
  "把生活还给自己",
  "时间站在你这边",
  "退休不是终点",
  "保持自己的节奏",
  "离自己的时间更近了",
  "慢一点没关系",
  "一天天往前数",
  "又翻过一页",
  "不急不慢的",
  "走得慢也是走着",
  "节奏比方向重要",
  "风景就在前面",
  "留点力气给自己",
  "不用太用力",
  "把今天过得不勉强",
  "时光在替你存着",
  "每一天都在做减法",
  "减一天,多一份从容",
  "今天也是路上的一格",
  "心里有数,不必表演",
  "该歇就歇",
  "工作之外,还有很多",
  "慢慢就稳了",
  "静静地走",
  "把今天种好",
  "给自己一点温柔",
  "不为难自己",
  "还有不少日子可以期待",
  "现在还来得及",
  "今天也可以发呆一会儿",
  "把今天的余下交给自己",
  "今天轻轻收尾",
  "该来的都会来",
  "把今天的份过好",
  "留点空白给自己",
  "累的时候就停一停",
  "路还长,慢慢走",
  "今天没安排也很好",
  "把闲下来当作正事",
  "今天的天很大",
  "安稳就好",
  "安稳本身就是好事",
  "多陪自己一会儿",
  "把心放轻一点",
  "不必凡事都赶",
  "今天给自己留个位置",
  "走着走着就到了",
  "不必赶在所有人前面",
  "把今天的累放下",
  "慢慢来,比较快",
  "没人比你更懂自己的节奏",
  "把日历翻得轻一点",
  "今天不评分",
  "时间不会催你",
  "这一天属于你自己",
  "退休那天总会到",
  "留住今天的好心情",
  "不必每天有意义",
  "把无聊也当作休息",
  "把今天过成自己的样子",
  "路在脚下慢慢延展",
  "看见前面的光",
  "今天也是好天气",
  "把今天过得不那么用力",
  "慢一拍也好",

  // === 接近 / 倒数 ===
  "离那天又近一点",
  "又减掉一天",
  "又翻掉一页日历",
  "进度又前进了一格",
  "退休日又近了",
  "一格一格地往前走",
  "离心里那天更近",
  "不知不觉就近了",
  "又少了一段班",
  "离自由再近一寸",
  "又少了一格",
  "离收工又近一些",
  "走过今天就少了一站",
  "又一天落进口袋",
  "今天也算一格",
  "又一页要翻过去",
  "今天结束就更近了",
  "又走过一段路",
  "离回到自己更近",
  "又少了一次早起",
  "不动声色地近着",
  "一点点把日子走完",
  "一格一格擦掉",
  "又过了一夜",
  "时间在替你倒数",
  "离脱班更近一步",
  "工龄又长了一天",
  "倒计时又少一颗",
  "进度条又往前一截",
  "又翻完一页",
  "想着想着就近了",
  "时间正在帮忙",
  "离那一天只差一些天",
  "减得很稳",
  "又过完一日",

  // === 慢 / 节奏 ===
  "慢一点也行",
  "不必每件事都赶",
  "慢一点更踏实",
  "不必催自己",
  "不必跟谁比快",
  "慢点没差",
  "不必赶在前头",
  "走慢一点没事",
  "慢一步看更清楚",
  "慢一拍听得见自己",
  "慢比快稳",
  "慢有慢的好",
  "不必赶时间",
  "慢慢从容",
  "慢慢就懂了",
  "慢一点也没耽误",
  "不急也不躁",
  "慢慢做也是做",
  "不必拼命",
  "不必爬得太快",
  "走慢点能看见路",
  "慢慢呼吸",
  "慢一点把今天过完",
  "不必和谁较劲",
  "慢慢就行",
  "慢一点不会输",
  "不必赶进度",
  "走两步歇一歇",
  "慢点也到得了",
  "该慢就慢",
  "慢得有道理",
  "缓一缓更稳",
  "不慌不忙",
  "慢慢摊开来",
  "慢慢理清",

  // === 日常 / 轻盈 ===
  "今天画一个圈",
  "又过了一天",
  "又是一天过去",
  "今日已尽",
  "今日不空",
  "今日得一闲",
  "今日不焦",
  "今日松一截",
  "今日不慌",
  "今日心安",
  "今日小满",
  "今日如愿",
  "今天平安过",
  "今天落定",
  "今天合上",
  "今天交班",
  "今天也无大事",
  "今天能放就放",
  "今天就这样",
  "一日复一日",
  "一天过完一天",
  "一日是一日",
  "今天收好尾",
  "今天平稳收束",
  "今天能完就完",
  "今天不再多想",
  "今天从容收尾",
  "今天收得干净",
  "今天清清淡淡",
  "今天也很安稳",

  // === 自我允许 ===
  "给自己几分钟",
  "给自己留个角",
  "不必什么都做好",
  "不必每天紧绷",
  "不必每天满分",
  "不必时刻在线",
  "不必随时回复",
  "不必满足所有期待",
  "自己说了算",
  "自己的事自己定",
  "没人比你更重要",
  "自己也要紧",
  "把自己当回事",
  "不必委屈自己",
  "不必将就",
  "不必太委屈",
  "不必勉强自己",
  "不必假装精神好",
  "累就承认累",
  "困就早点睡",
  "不开心就不开心",
  "想静就静",
  "想停就停",
  "想歇就歇",
  "不必假装好",
  "不必伪装",
  "不必合群",
  "不必填满每一天",
  "不必证明什么",
  "不必交代什么",
  "不必道歉太多",
  "不必每天好心情",
  "不必凡事说明",
  "不必凡事做对",
  "不必给所有事打分",
  "不必让所有人懂",
  "不必让所有人喜欢",
  "不必争赢",
  "不必处处正确",
  "不必完美",

  // === 休息 / 放下 ===
  "工作之外世界还大",
  "任务可以放下",
  "信息可以晚回",
  "邮件可以明天看",
  "不必随时待命",
  "关掉一会儿也好",
  "让自己安静一会",
  "休假是必要的",
  "充电也是工作",
  "安静一会就好了",
  "放下也是收获",
  "放下一段",
  "该放就放",
  "不必抓住所有事",
  "累了就停",
  "想睡就睡",
  "今晚早一点睡",
  "周末归自己",
  "周五早点歇",
  "累一天就歇一天",
  "多歇不亏",
  "想放松也行",
  "偷得浮生半日闲",
  "一日清闲胜过万金",
  "闲下来不是浪费",
  "把空闲当正经事",
  "不必随时高效",
  "高效不是必须",
  "这一杯水慢慢喝",
  "多躺一会",
  "多睡一刻",
  "多闲一阵",
  "多坐一会",
  "多发会儿呆",
  "多歇一刻",

  // === 时间为伴 ===
  "时间在你这边",
  "时间会帮你",
  "时间替你解决",
  "时间慢慢化",
  "时间在打磨",
  "时间在替你考虑",
  "时间不会负你",
  "时间记着你",
  "时光不会丢",
  "路会自己出现",
  "前面有日子",
  "前面有自己",
  "好日子还在路上",
  "想要的会来",
  "想去的会去",
  "想过的日子会过到",
  "春天会来",
  "夏天还长",
  "秋天来得不慌",
  "冬天也短",
  "月亮会到圆",
  "季节自有节奏",
  "时间足够",
  "时间还够用",
  "时间够你用",

  // === 观察 / 当下 ===
  "风是好的",
  "阳光也是",
  "树还在长",
  "鸟还在叫",
  "天空还在",
  "云慢慢飘",
  "雨过会晴",
  "晚风很好",
  "早晨值得",
  "黄昏也美",
  "月亮挂着",
  "路灯亮着",
  "看一会天",
  "听一会风",
  "喝口热茶",
  "喝杯白水",
  "散个步",
  "看看远方",
  "抱抱自己",
  "笑一笑也好",
  "深呼一口气",
  "闭眼几秒",
  "看看窗外的光",
  "看看窗外",
  "望望远处",
  "看一片叶子",
  "看云也好",
  "今天值得记一笔",
  "听见水声",
  "闻到饭香",
  "摸摸植物",
  "看看花",
  "听窗外",
  "听一首歌",
  "晒一会太阳",

  // === 普通 / 平凡也好 ===
  "普通也很好",
  "普通也珍贵",
  "平凡是日常",
  "不必出彩",
  "不必出众",
  "不必被看见",
  "没人看见也好",
  "安静也是力气",
  "一个人也好",
  "自己也要一份",
  "不必急着交卷",
  "不必汇报",
  "不必表态",
  "不必凡事明白",
  "不必每天都新",
  "不必每天都奇",
  "普通日子最稳",
  "不必每天都精彩",
  "平淡也算好",
  "平凡里有福",
  "不必处处用力",
  "不必凡事用心",
  "不必每天都对",
  "平平静静就好",
  "不张扬也行",

  // === 盼头 / 退休是开始 ===
  "退休是开始",
  "退休也是新生活",
  "退休是被允许休息",
  "退休是合法发呆",
  "退休是想做就做",
  "退休是不必再赶",
  "退休是过自己的生活",
  "退休是更近的自由",
  "想做的事还来得及",
  "想去的地方还能去",
  "想见的人还能见",
  "想读的书还能读",
  "想学的事还能学",
  "想睡的觉还能睡",
  "还有一万个早晨",
  "还有不少黄昏",
  "还有许多春天",
  "还有不少夏夜",
  "还有许多个秋",
  "还有不少个冬",
  "还有不少周末",
  "还有不少假期",
  "退休不必着急",
  "退休是慢慢学会的",
  "慢慢就到自由了",
];

const RETIRED_DAILY_LINE = "新的时间开始了";

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
  retireYear: Array.from({ length: RETIRE_YEAR_MAX - RETIRE_YEAR_MIN + 1 }, (_, i) => {
    const y = RETIRE_YEAR_MIN + i;
    return { value: String(y), label: `${y} 年` };
  }),
  retireMonth: Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} 月`,
  })),
  reminderHour: Array.from({ length: 24 }, (_, i) => ({
    value: String(i),
    label: `${String(i).padStart(2, "0")} 时`,
  })),
  reminderMinute: Array.from({ length: 60 / REMINDER_MINUTE_STEP }, (_, i) => {
    const m = i * REMINDER_MINUTE_STEP;
    return { value: String(m), label: `${String(m).padStart(2, "0")} 分` };
  }),
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
  retireDay: () => {
    const year = parseInt(document.getElementById("retireYear").value || RETIRE_YEAR_DEFAULT_FOCUS, 10);
    const month = parseInt(document.getElementById("retireMonth").value || "1", 10);
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
  retireYear: RETIRE_YEAR_DEFAULT_FOCUS,
  retireMonth: "1",
  retireDay: "1",
  reminderHour: "9",
  reminderMinute: "0",
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
  openExplainer: document.querySelector("#openExplainer"),
  explainerSheet: document.querySelector("#explainerSheet"),
  explainerClose: document.querySelector("#explainerClose"),
  explainerAck: document.querySelector("#explainerAck"),
  explainerHandle: document.querySelector("#explainerHandle"),
  explainerBirth: document.querySelector("#explainerBirth"),
  explainerWorker: document.querySelector("#explainerWorker"),
  explainerStep1Desc: document.querySelector("#explainerStep1Desc"),
  explainerStep1Date: document.querySelector("#explainerStep1Date"),
  explainerStep2Desc: document.querySelector("#explainerStep2Desc"),
  explainerStep2Date: document.querySelector("#explainerStep2Date"),
  explainerStep3Desc: document.querySelector("#explainerStep3Desc"),
  explainerStep3Note: document.querySelector("#explainerStep3Note"),
  explainerFinalDate: document.querySelector("#explainerFinalDate"),
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
  dailyLine: document.querySelector("#dailyLine"),
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
  retireYear: document.querySelector("#retireYear"),
  retireMonth: document.querySelector("#retireMonth"),
  retireDay: document.querySelector("#retireDay"),
  retireYearLabel: document.querySelector("#retireYearLabel"),
  retireMonthLabel: document.querySelector("#retireMonthLabel"),
  retireDayLabel: document.querySelector("#retireDayLabel"),
  retireDateHint: document.querySelector("#retireDateHint"),
  reminderHour: document.querySelector("#reminderHour"),
  reminderMinute: document.querySelector("#reminderMinute"),
  reminderHourLabel: document.querySelector("#reminderHourLabel"),
  reminderMinuteLabel: document.querySelector("#reminderMinuteLabel"),
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

    if (els.calculationMode.value === "manual" && !els.retireDate.value) {
      showRetireDateHint();
      return;
    }
    hideRetireDateHint();

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
    await scheduleReminderSafely();
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

  els.openExplainer?.addEventListener("click", openExplainerSheet);
  els.explainerClose?.addEventListener("click", closeExplainerSheet);
  els.explainerAck?.addEventListener("click", closeExplainerSheet);

  setupPickers();
  setupCalendar();
  setupSheetDragToClose();
  setupBackButton();

  window.setInterval(updateCountdown, 60 * 1000);

  if (!isNative() && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }

  // Reminder init runs after UI is wired so a notification scheduling
  // failure can't dead-shell the app. setupReminderToggle resolves the
  // null permission state before scheduleReminderSafely reads it,
  // preserving the prior race fix. scheduleReminderSafely owns its own
  // catch + status fallback.
  try {
    await setupReminderToggle();
  } catch (err) {
    console.error("setupReminderToggle failed", err);
    if (els.reminderStatus) {
      els.reminderStatus.textContent = "提醒初始化失败";
      els.reminderStatus.classList.add("warning");
    }
  }
  await scheduleReminderSafely();
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
  applyRetireDateToForm(settings.retireDate);
  applyReminderTimeToForm(settings.reminderTime);
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

function applyRetireDateToForm(iso) {
  els.retireDate.value = iso || "";
  if (!iso) {
    els.retireYear.value = "";
    els.retireMonth.value = "";
    els.retireDay.value = "";
    els.retireYearLabel.textContent = "年";
    els.retireMonthLabel.textContent = "月";
    els.retireDayLabel.textContent = "日";
    return;
  }
  const [y, m, d] = iso.split("-");
  els.retireYear.value = String(parseInt(y, 10));
  els.retireMonth.value = String(parseInt(m, 10));
  els.retireDay.value = String(parseInt(d, 10));
  els.retireYearLabel.textContent = `${parseInt(y, 10)} 年`;
  els.retireMonthLabel.textContent = `${parseInt(m, 10)} 月`;
  els.retireDayLabel.textContent = `${parseInt(d, 10)} 日`;
}

function syncRetireDateFromParts() {
  // User is actively picking → clear the empty-submit hint regardless of completeness.
  hideRetireDateHint();

  const y = els.retireYear.value;
  const m = els.retireMonth.value;
  let d = els.retireDay.value;

  if (y && m && d) {
    const maxDay = new Date(Number(y), Number(m), 0).getDate();
    if (Number(d) > maxDay) {
      d = String(maxDay);
      els.retireDay.value = d;
      els.retireDayLabel.textContent = `${maxDay} 日`;
    }
    els.retireDate.value = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  } else {
    els.retireDate.value = "";
  }
  els.retireDate.dispatchEvent(new Event("input", { bubbles: true }));
  els.retireDate.dispatchEvent(new Event("change", { bubbles: true }));
}

function showRetireDateHint() {
  if (!els.retireDateHint) return;
  els.retireDateHint.hidden = false;
  const firstTrigger = document.querySelector('.picker-trigger[data-picker="retireYear"]');
  firstTrigger?.focus();
  firstTrigger?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function hideRetireDateHint() {
  if (!els.retireDateHint) return;
  els.retireDateHint.hidden = true;
}

function applyReminderTimeToForm(hhmm) {
  const fallback = hhmm && /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : "09:00";
  const [hStr, mStr] = fallback.split(":");
  const rawH = Math.max(0, Math.min(23, parseInt(hStr, 10) || 0));
  const rawM = Math.max(0, Math.min(59, parseInt(mStr, 10) || 0));
  // Round to nearest 5-min step instead of floor, with carry into the next hour
  // (e.g. 09:07 → 09:05; 09:08 → 09:10; 23:58 → 00:00).
  const totalMin = rawH * 60 + rawM;
  const snapped = Math.round(totalMin / REMINDER_MINUTE_STEP) * REMINDER_MINUTE_STEP;
  const h = Math.floor(snapped / 60) % 24;
  const m = snapped % 60;
  els.reminderHour.value = String(h);
  els.reminderMinute.value = String(m);
  els.reminderHourLabel.textContent = `${String(h).padStart(2, "0")} 时`;
  els.reminderMinuteLabel.textContent = `${String(m).padStart(2, "0")} 分`;
  els.reminderTime.value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function syncReminderTimeFromParts() {
  const h = parseInt(els.reminderHour.value, 10);
  const m = parseInt(els.reminderMinute.value, 10);
  if (Number.isFinite(h) && Number.isFinite(m)) {
    els.reminderTime.value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } else {
    els.reminderTime.value = "";
  }
  els.reminderTime.dispatchEvent(new Event("input", { bubbles: true }));
  els.reminderTime.dispatchEvent(new Event("change", { bubbles: true }));
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

function openExplainerSheet() {
  if (!els.explainerSheet) return;
  if (typeof els.explainerSheet.showModal === "function") {
    els.explainerSheet.showModal();
  } else {
    els.explainerSheet.setAttribute("open", "");
  }
  triggerHaptic();
}

function closeExplainerSheet() {
  if (!els.explainerSheet) return;
  if (typeof els.explainerSheet.close === "function") {
    els.explainerSheet.close();
  } else {
    els.explainerSheet.removeAttribute("open");
  }
  triggerHaptic();
}

function updateExplainer(calc) {
  if (!els.openExplainer) return;

  if (!calc) {
    els.openExplainer.disabled = true;
    els.openExplainer.title = "填写出生日期后可查看计算依据";
    return;
  }

  els.openExplainer.disabled = false;
  els.openExplainer.title = "";

  const birthText = formatDate(parseDateOnly(els.birthDate.value));
  els.explainerBirth.textContent = birthText;
  els.explainerWorker.textContent = calc.workerLabel;

  // Step 1: Original statutory retirement (before reform)
  const baseAgeYears = Math.round((calc.statutoryAgeMonths - calc.delayMonths) / 12);
  els.explainerStep1Desc.textContent = `${baseAgeYears} 岁`;
  els.explainerStep1Date.textContent = formatDate(parseDateOnly(calc.baseDate));

  // Step 2: Reform-adjusted statutory retirement
  if (calc.delayMonths === 0) {
    els.explainerStep2Desc.textContent = "未触及改革过渡，无延迟";
  } else {
    els.explainerStep2Desc.textContent = `延迟 ${calc.delayMonths} 个月`;
  }
  els.explainerStep2Date.textContent = formatDate(parseDateOnly(calc.statutoryDate));

  // Step 3: Flexible adjustment
  const requested = calc.requestedFlexMonths;
  const applied = calc.appliedFlexMonths;
  const step3Note = els.explainerStep3Note;
  step3Note.hidden = true;
  step3Note.textContent = "";

  if (calc.flexMode === "statutory" || (calc.flexMode !== "early" && calc.flexMode !== "late")) {
    els.explainerStep3Desc.textContent = "按法定退休年龄 · 未提前 / 未延迟";
  } else if (calc.flexMode === "early") {
    if (applied === 0 && requested > 0) {
      els.explainerStep3Desc.textContent = `你选择提前 ${requested} 个月`;
      step3Note.textContent = "受规则限制：弹性提前后不能低于原法定退休年龄，实际未提前。";
      step3Note.hidden = false;
    } else if (applied < requested) {
      els.explainerStep3Desc.textContent = `你选择提前 ${requested} 个月 · 实际提前 ${applied} 个月`;
      step3Note.textContent = "受规则限制：弹性提前后不能低于原法定退休年龄。";
      step3Note.hidden = false;
    } else {
      els.explainerStep3Desc.textContent = `提前 ${applied} 个月`;
    }
  } else if (calc.flexMode === "late") {
    els.explainerStep3Desc.textContent = applied > 0 ? `延迟 ${applied} 个月` : "未延迟";
  }

  els.explainerFinalDate.textContent = formatDate(parseDateOnly(calc.finalDate));
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
  } else if (field === "retireYear" || field === "retireMonth" || field === "retireDay") {
    syncRetireDateFromParts();
  } else if (field === "reminderHour" || field === "reminderMinute") {
    syncReminderTimeFromParts();
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
    case "retireYear": return "退休年份";
    case "retireMonth": return "退休月份";
    case "retireDay": return "退休日";
    case "reminderHour": return "提醒时";
    case "reminderMinute": return "提醒分";
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
      if (els.explainerSheet?.open) {
        closeExplainerSheet();
        return;
      }
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
  attachDragToClose(els.explainerHandle, els.explainerSheet, closeExplainerSheet);
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

function setRetirePickerEnabled(enabled) {
  document.querySelectorAll('.picker-trigger[data-picker="retireYear"], .picker-trigger[data-picker="retireMonth"], .picker-trigger[data-picker="retireDay"]').forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function refreshPolicyCalculation() {
  const policyMode = els.calculationMode.value === "policy";
  els.policyFields.hidden = !policyMode;
  els.resultCard.hidden = true;
  setRetirePickerEnabled(!policyMode);
  els.flexMonthsLabel.hidden = els.flexMode.value === "statutory";
  if (policyMode) hideRetireDateHint();

  if (!policyMode) {
    els.policyNote.textContent = "手动日期适合特殊工种、已确认退休时间,或不适用企业职工法定退休年龄规则的情况。";
    updateExplainer(null);
    return null;
  }

  if (!els.birthDate.value) {
    applyRetireDateToForm("");
    els.policyNote.textContent = "填写出生日期后自动计算。特殊工种、提前退休资格和养老金缴费年限需以当地社保经办口径为准。";
    updateExplainer(null);
    return null;
  }

  const result = calculateRetirementDate({
    birthDate: els.birthDate.value,
    workerType: els.workerType.value,
    flexMode: els.flexMode.value,
    flexMonths: els.flexMonths.value,
  });

  applyRetireDateToForm(result.finalDate);
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

  updateExplainer(result);

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
  updateDailyLine(today);

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

  els.status.textContent = formatCountdownStatus({
    days,
    remindersEnabled: !!settings.remindersEnabled,
  });

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

function getDailyLine(date = new Date()) {
  const iso = isoFromDate(date);
  let hash = 0;
  for (const char of iso) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return DAILY_LINES[hash % DAILY_LINES.length];
}

function updateDailyLine(today = new Date()) {
  if (!els.dailyLine) return;
  if (!settings.retireDate) {
    els.dailyLine.hidden = true;
    els.dailyLine.textContent = "";
    return;
  }
  els.dailyLine.hidden = false;
  els.dailyLine.textContent = isRetired(settings.retireDate)
    ? RETIRED_DAILY_LINE
    : getDailyLine(today);
}

function setHeroCount(value) {
  const text = String(value);
  if (els.heroCount.dataset.value === text) return;
  els.heroCount.dataset.value = text;

  const digitCount = (text.match(/\d/g) || []).length;
  if (digitCount > 0) {
    els.hero.dataset.digitCount = String(digitCount);
  } else {
    delete els.hero.dataset.digitCount;
  }

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
  await scheduleReminderSafely();

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
    scheduleReminderSafely();
  }, Math.max(next.getTime() - Date.now(), 1000));
}

// Warnings that scheduleReminderSafely should clear on next success.
// Permission-denied warnings ("通知被拒绝...") are intentionally excluded
// because the underlying OS permission is still unfixed; that one is
// cleared by applyReminderSwitchState when the user re-toggles.
const TRANSIENT_REMINDER_WARNINGS = new Set([
  "提醒初始化失败",
  "提醒调度失败,请重试",
]);

async function scheduleReminderSafely() {
  try {
    await scheduleReminder();
    if (
      els.reminderStatus?.classList.contains("warning") &&
      TRANSIENT_REMINDER_WARNINGS.has(els.reminderStatus.textContent)
    ) {
      applyReminderSwitchState();
    }
  } catch (err) {
    console.error("scheduleReminder failed", err);
    if (els.reminderStatus) {
      els.reminderStatus.textContent = "提醒调度失败,请重试";
      els.reminderStatus.classList.add("warning");
    }
  }
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
    scheduleReminderSafely();
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

  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;

  drawSharePoster(ctx, {
    isDusk,
    days: els.heroCount.dataset.value || "--",
    dailyLine: els.dailyLine?.textContent || getDailyLine(new Date()),
    today: formatDate(new Date()),
    retireDate: formatDate(parseDateOnly(settings.retireDate)),
    statusText: els.status?.textContent || "",
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
      if (isShareCanceledError(err)) return;
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
      if (!isShareCanceledError(err)) downloadImage(canvas);
    }
  } else {
    downloadImage(canvas);
  }
}

const POSTER_SERIF = '"Newsreader", "Noto Serif SC", "Songti SC", serif';
const POSTER_SANS = 'Inter, system-ui, -apple-system, sans-serif';
const POSTER_WIDTH = 1080;
const POSTER_HEIGHT = 1440;

function drawSharePoster(ctx, { isDusk, days, dailyLine, today, retireDate, statusText }) {
  // Color hierarchy per v2 spec: hero uses `secondary`; unit + daily line
  // use `accent`; eyebrow + footer use `muted`.
  const theme = isDusk
    ? {
        bg: "#1A1411",
        hero: "#F0E5D4",
        accent: "#D4A76A",
        muted: "#8C8279",
        glow: { x: 200, y: 1200, color: "rgba(212,167,106,0.12)" },
      }
    : {
        bg: "#FBF9F6",
        hero: "#1A1A1A",
        accent: "#126C62",
        muted: "#8C8C8C",
        glow: { x: 900, y: 200, color: "rgba(18,108,98,0.06)" },
      };

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  // Radial glow — CSS `radial-gradient(circle at X Y, color 0%, transparent 70%)`
  // with default `farthest-corner` sizing. Translate the 70% stop into canvas by
  // running the gradient out to the farthest-corner distance from (gx, gy).
  const corners = [
    [0, 0], [POSTER_WIDTH, 0], [0, POSTER_HEIGHT], [POSTER_WIDTH, POSTER_HEIGHT],
  ];
  const farthest = Math.max(
    ...corners.map(([x, y]) => Math.hypot(x - theme.glow.x, y - theme.glow.y)),
  );
  const grad = ctx.createRadialGradient(
    theme.glow.x, theme.glow.y, 0,
    theme.glow.x, theme.glow.y, farthest,
  );
  grad.addColorStop(0, theme.glow.color);
  grad.addColorStop(0.7, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

  const centerX = POSTER_WIDTH / 2;

  // 1. Eyebrow "退休倒计时" — top:160, 24px sans 500, letter-spacing 0.4em
  ctx.fillStyle = theme.muted;
  ctx.font = `500 24px ${POSTER_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.letterSpacing = "9.6px"; // 0.4em of 24
  ctx.fillText("退休倒计时", centerX, 160);

  // 2. Hero group — stacked column with the hero number visually centered
  //    a touch above middle (y≈720). We position from the *actual* ink box
  //    rather than the CSS line-box, because digits in Newsreader have a
  //    near-zero descender (5px) — using line-box math leaves an unwanted
  //    50-80px gap above the unit.
  ctx.fillStyle = theme.hero;
  ctx.font = `700 320px ${POSTER_SERIF}`;
  ctx.letterSpacing = "-12.8px"; // -0.04em of 320
  const heroMetrics = ctx.measureText(days);
  const heroAsc = heroMetrics.actualBoundingBoxAscent || 245;
  const heroDesc = heroMetrics.actualBoundingBoxDescent || 5;

  const heroVisualCenterY = 700;
  const heroBaselineY = heroVisualCenterY + (heroAsc - heroDesc) / 2;
  const heroInkBottom = heroBaselineY + heroDesc;

  ctx.textBaseline = "alphabetic";
  ctx.fillText(days, centerX, heroBaselineY);

  // Unit "天" — sits a deliberate 32px below the hero's *visible* ink
  //   bottom (not the line-box bottom), so the perceived gap matches
  //   the designer's intent regardless of font descender metrics.
  ctx.fillStyle = theme.accent;
  ctx.font = `500 48px ${POSTER_SERIF}`;
  ctx.letterSpacing = "4.8px";
  ctx.textBaseline = "top";
  ctx.fillText("天", centerX, heroInkBottom + 32);

  // 3. Daily line — mirror the in-app daily line below the hero number.
  ctx.fillStyle = theme.accent;
  ctx.font = `400 36px ${POSTER_SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.letterSpacing = "5.4px"; // 0.15em of 36
  ctx.fillText(dailyLine || getDailyLine(new Date()), centerX, 960);

  // 4. Footer info — bottom:160, column gap 20, muted color
  //    Dates row: 24px sans ls 0.05em, two items with gap 40.
  //    Status note mirrors the in-app footer status.
  const estimationFontSize = 18;
  const estimationLineH = estimationFontSize * 1.2;
  const datesFontSize = 24;
  const datesLineH = datesFontSize * 1.2;
  const footerBottom = POSTER_HEIGHT - 160;
  const estimationBottom = footerBottom;
  const datesBottom = footerBottom - estimationLineH - 20;

  ctx.fillStyle = theme.muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  // Dates row: render the two items centered with a 40px gap
  ctx.font = `400 ${datesFontSize}px ${POSTER_SANS}`;
  ctx.letterSpacing = "1.2px";
  const todayText = `今天 ${today}`;
  const retireText = `退休日 ${retireDate}`;
  const todayW = ctx.measureText(todayText).width;
  const retireW = ctx.measureText(retireText).width;
  const rowGap = 40;
  const rowW = todayW + rowGap + retireW;
  ctx.textAlign = "left";
  ctx.fillText(todayText, centerX - rowW / 2, datesBottom);
  ctx.fillText(retireText, centerX - rowW / 2 + todayW + rowGap, datesBottom);

  // Status note
  ctx.textAlign = "center";
  ctx.font = `400 ${estimationFontSize}px ${POSTER_SANS}`;
  ctx.letterSpacing = "0.9px";
  ctx.globalAlpha = 0.8;
  ctx.fillText(statusText || "设置退休日期后开始倒计时。", centerX, estimationBottom);
  ctx.globalAlpha = 1;

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
