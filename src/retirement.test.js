import { describe, expect, it } from "vitest";
import {
  calculateRetirementDate,
  formatCountdownStatus,
  isRetired,
  normalizeFlexMonths,
} from "./retirement.js";

describe("calculateRetirementDate", () => {
  it("does not delay male workers born before the reform start cohort", () => {
    const result = calculateRetirementDate({
      birthDate: "1964-12-15",
      workerType: "male",
    });

    expect(result.delayMonths).toBe(0);
    expect(result.statutoryAgeText).toBe("60 岁");
    expect(result.finalDate).toBe("2024-12-15");
  });

  it("adds one month for male workers in the first reform cohort", () => {
    const result = calculateRetirementDate({
      birthDate: "1965-01-10",
      workerType: "male",
    });

    expect(result.delayMonths).toBe(1);
    expect(result.statutoryAgeText).toBe("60 岁 1 个月");
    expect(result.finalDate).toBe("2025-02-10");
  });

  it("calculates an intermediate male delay cohort", () => {
    const result = calculateRetirementDate({
      birthDate: "1972-09-01",
      workerType: "male",
    });

    expect(result.delayMonths).toBe(24);
    expect(result.statutoryAgeText).toBe("62 岁");
    expect(result.finalDate).toBe("2034-09-01");
  });

  it("caps male worker delay at 63 years old", () => {
    const result = calculateRetirementDate({
      birthDate: "1976-09-01",
      workerType: "male",
    });

    expect(result.delayMonths).toBe(36);
    expect(result.statutoryAgeText).toBe("63 岁");
    expect(result.finalDate).toBe("2039-09-01");
  });

  it("adds one month for female workers originally retiring at 55 in the first reform cohort", () => {
    const result = calculateRetirementDate({
      birthDate: "1970-01-10",
      workerType: "female55",
    });

    expect(result.delayMonths).toBe(1);
    expect(result.statutoryAgeText).toBe("55 岁 1 个月");
    expect(result.finalDate).toBe("2025-02-10");
  });

  it("adds one month for female workers originally retiring at 50 in the first reform cohort", () => {
    const result = calculateRetirementDate({
      birthDate: "1975-01-10",
      workerType: "female50",
    });

    expect(result.delayMonths).toBe(1);
    expect(result.statutoryAgeText).toBe("50 岁 1 个月");
    expect(result.finalDate).toBe("2025-02-10");
  });

  it("caps female workers originally retiring at 50 at 55 years old", () => {
    const result = calculateRetirementDate({
      birthDate: "1984-11-01",
      workerType: "female50",
    });

    expect(result.delayMonths).toBe(60);
    expect(result.statutoryAgeText).toBe("55 岁");
    expect(result.finalDate).toBe("2039-11-01");
  });

  it("does not allow flexible early retirement below the original statutory age", () => {
    const result = calculateRetirementDate({
      birthDate: "1965-01-10",
      workerType: "male",
      flexMode: "early",
      flexMonths: 36,
    });

    expect(result.finalAgeText).toBe("60 岁");
    expect(result.appliedFlexMonths).toBe(1);
    expect(result.finalDate).toBe("2025-01-10");
  });

  it("applies flexible late retirement up to the shared 36-month product limit", () => {
    const result = calculateRetirementDate({
      birthDate: "1975-01-10",
      workerType: "female50",
      flexMode: "late",
      flexMonths: 99,
    });

    expect(result.requestedFlexMonths).toBe(36);
    expect(result.appliedFlexMonths).toBe(36);
    expect(result.finalAgeText).toBe("53 岁 1 个月");
  });
});

describe("normalizeFlexMonths", () => {
  it("normalizes invalid, negative and over-limit values", () => {
    expect(normalizeFlexMonths("abc")).toBe(0);
    expect(normalizeFlexMonths(-2)).toBe(0);
    expect(normalizeFlexMonths(99)).toBe(36);
  });
});

describe("isRetired", () => {
  it("returns true on and after the retirement date", () => {
    expect(isRetired("2026-05-10", new Date("2026-05-09T23:59:59"))).toBe(false);
    expect(isRetired("2026-05-10", new Date("2026-05-10T00:00:00"))).toBe(true);
    expect(isRetired("2026-05-10", new Date("2026-05-11T00:00:00"))).toBe(true);
  });
});

describe("formatCountdownStatus", () => {
  it("does not mention daily reminders when reminders are disabled", () => {
    expect(formatCountdownStatus({ days: 6701, remindersEnabled: false }))
      .toBe("还有 6701 天。");
  });

  it("mentions daily reminders when reminders are enabled", () => {
    expect(formatCountdownStatus({ days: 6701, remindersEnabled: true }))
      .toBe("还有 6701 天,每天定时提醒一次。");
  });
});
