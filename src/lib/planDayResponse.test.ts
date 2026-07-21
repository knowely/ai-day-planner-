import { describe, expect, it } from "vitest";
import {
  DAY_CAPACITY_MIN,
  DEFAULT_TASK_MINUTES,
  sanitizePlanDayResponse,
} from "./planDayResponse";

const noMinutes = new Map<string, number | null>();

describe("sanitizePlanDayResponse", () => {
  it("returns everything deferred when raw is not an object", () => {
    const validIds = new Set(["1"]);
    const minutesById = new Map<string, number | null>([["1", 30]]);
    const expected = {
      selected: [],
      deferred: ["1"],
      note: "Задач більше, ніж влізе у день.",
      totalMinutes: 0,
      overloaded: true,
    };
    expect(sanitizePlanDayResponse(null, validIds, minutesById)).toEqual(expected);
    expect(sanitizePlanDayResponse("oops", validIds, minutesById)).toEqual(expected);
  });

  it("returns everything deferred when selected is missing or not an array", () => {
    const validIds = new Set(["1"]);
    const minutesById = new Map<string, number | null>([["1", 30]]);
    expect(sanitizePlanDayResponse({}, validIds, minutesById).selected).toEqual([]);
    expect(
      sanitizePlanDayResponse({ selected: "oops" }, validIds, minutesById).selected
    ).toEqual([]);
  });

  it("keeps only ids present in validIds, preserving order, and defers the rest", () => {
    const validIds = new Set(["a", "b", "c"]);
    const minutesById = new Map<string, number | null>([
      ["a", 30],
      ["b", 30],
      ["c", 30],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["b", "a", "z"] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["b", "a"]);
    expect(result.deferred).toEqual(["c"]);
  });

  it("drops non-string entries", () => {
    const validIds = new Set(["a"]);
    const minutesById = new Map<string, number | null>([["a", 30]]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", 5, null] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["a"]);
  });

  it("dedupes, keeping the first occurrence", () => {
    const validIds = new Set(["a", "b"]);
    const minutesById = new Map<string, number | null>([
      ["a", 30],
      ["b", 30],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b", "a"] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["a", "b"]);
  });

  it("defers nothing and selects nothing when validIds is empty", () => {
    const result = sanitizePlanDayResponse({ selected: ["a"] }, new Set(), noMinutes);
    expect(result).toEqual({
      selected: [],
      deferred: [],
      note: "",
      totalMinutes: 0,
      overloaded: false,
    });
  });

  it("sums estimatedMinutes for selected tasks", () => {
    const validIds = new Set(["a", "b"]);
    const minutesById = new Map<string, number | null>([
      ["a", 60],
      ["b", 45],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b"] },
      validIds,
      minutesById
    );
    expect(result.totalMinutes).toBe(105);
    expect(result.overloaded).toBe(false);
  });

  it("uses DEFAULT_TASK_MINUTES for tasks with a null estimate", () => {
    const validIds = new Set(["a"]);
    const minutesById = new Map<string, number | null>([["a", null]]);
    const result = sanitizePlanDayResponse(
      { selected: ["a"] },
      validIds,
      minutesById
    );
    expect(result.totalMinutes).toBe(DEFAULT_TASK_MINUTES);
  });

  it("stops selecting once the next task would exceed DAY_CAPACITY_MIN, deferring the rest", () => {
    const validIds = new Set(["a", "b", "c"]);
    const minutesById = new Map<string, number | null>([
      ["a", 300],
      ["b", 200],
      ["c", 30],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b", "c"] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["a"]);
    expect(result.totalMinutes).toBe(300);
    expect(result.deferred).toEqual(["b", "c"]);
    expect(result.overloaded).toBe(true);
  });

  it("fits selected tasks exactly at DAY_CAPACITY_MIN", () => {
    const validIds = new Set(["a", "b"]);
    const minutesById = new Map<string, number | null>([
      ["a", DAY_CAPACITY_MIN - 60],
      ["b", 60],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b"] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["a", "b"]);
    expect(result.totalMinutes).toBe(DAY_CAPACITY_MIN);
    expect(result.overloaded).toBe(false);
  });

  it("uses the model's note when provided and non-empty", () => {
    const validIds = new Set(["a"]);
    const minutesById = new Map<string, number | null>([["a", 30]]);
    const result = sanitizePlanDayResponse(
      { selected: ["a"], note: "Ранок для важкого." },
      validIds,
      minutesById
    );
    expect(result.note).toBe("Ранок для важкого.");
  });

  it("falls back to a default note when overloaded and the model's note is missing", () => {
    const validIds = new Set(["a", "b"]);
    const minutesById = new Map<string, number | null>([
      ["a", DAY_CAPACITY_MIN],
      ["b", 30],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b"] },
      validIds,
      minutesById
    );
    expect(result.overloaded).toBe(true);
    expect(result.note).toBe("Задач більше, ніж влізе у день.");
  });

  it("defaults note to an empty string when not overloaded and the model returned none", () => {
    const validIds = new Set(["a"]);
    const minutesById = new Map<string, number | null>([["a", 30]]);
    const result = sanitizePlanDayResponse({ selected: ["a"] }, validIds, minutesById);
    expect(result.note).toBe("");
  });
});
