export const RETIREMENT_RULES = {
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

export const FLEX_LIMIT_MONTHS = 36;

export function calculateRetirementDate({
  birthDate,
  workerType,
  flexMode = "statutory",
  flexMonths = 0,
}) {
  const birth = parseDateOnly(birthDate);
  const rule = RETIREMENT_RULES[workerType] || RETIREMENT_RULES.male;
  const delayMonths = calculateDelayMonths(birth, rule);
  const statutoryAgeMonths = rule.baseAgeMonths + delayMonths;
  const statutoryDate = addMonths(birth, statutoryAgeMonths);
  const baseDate = addMonths(birth, rule.baseAgeMonths);
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
  const appliedFlexMonths = Math.abs(finalAgeMonths - statutoryAgeMonths);

  return {
    workerType,
    workerLabel: rule.label,
    delayMonths,
    baseDate: formatInputDate(baseDate),
    statutoryDate: formatInputDate(statutoryDate),
    statutoryAgeMonths,
    statutoryAgeText: formatAge(statutoryAgeMonths),
    finalDate: formatInputDate(finalDate),
    finalAgeMonths,
    finalAgeText: formatAge(finalAgeMonths),
    flexMode,
    requestedFlexMonths: normalizedFlexMonths,
    appliedFlexMonths,
  };
}

export function calculateDelayMonths(birth, rule) {
  const startIndex = rule.reformStart.year * 12 + (rule.reformStart.month - 1);
  const birthIndex = birth.getFullYear() * 12 + birth.getMonth();
  const monthsAfterStart = birthIndex - startIndex;
  if (monthsAfterStart < 0) return 0;

  // The reform-start birth month maps to +1 month delay; every N birth months after
  // that adds another month until the rule's maximum delay is reached.
  const delayMonths = Math.floor(monthsAfterStart / rule.monthsPerDelayMonth) + 1;
  return Math.min(delayMonths, rule.maxDelayMonths);
}

export function normalizeFlexMonths(value) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return 0;
  return Math.min(Math.max(number, 0), FLEX_LIMIT_MONTHS);
}

export function isRetired(retireDate, now = new Date()) {
  if (!retireDate) return false;
  return startOfDay(now).getTime() >= parseDateOnly(retireDate).getTime();
}

export function addMonths(date, months) {
  const copy = new Date(date);
  const day = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(day, lastDay));
  return startOfDay(copy);
}

export function parseDateOnly(value) {
  return startOfDay(new Date(`${value}T00:00:00`));
}

export function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatAge(totalMonths) {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months ? `${years} 岁 ${months} 个月` : `${years} 岁`;
}

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
