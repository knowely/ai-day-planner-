import { describe, expect, it } from "vitest";
import { sanitizePlanDayResponse } from "./planDayResponse";

describe("sanitizePlanDayResponse", () => {
  it("returns an empty array when raw is not an object", () => {
    expect(sanitizePlanDayResponse(null, new Set(["1"]))).toEqual([]);
    expect(sanitizePlanDayResponse("oops", new Set(["1"]))).toEqual([]);
  });

  it("returns an empty array when taskIds is missing or not an array", () => {
    expect(sanitizePlanDayResponse({}, new Set(["1"]))).toEqual([]);
    expect(sanitizePlanDayResponse({ taskIds: "oops" }, new Set(["1"]))).toEqual([]);
  });

  it("keeps only ids present in validIds, preserving order", () => {
    const validIds = new Set(["a", "b", "c"]);
    expect(sanitizePlanDayResponse({ taskIds: ["b", "a", "z"] }, validIds)).toEqual([
      "b",
      "a",
    ]);
  });

  it("drops non-string entries", () => {
    const validIds = new Set(["a"]);
    expect(sanitizePlanDayResponse({ taskIds: ["a", 5, null] }, validIds)).toEqual([
      "a",
    ]);
  });

  it("dedupes, keeping the first occurrence", () => {
    const validIds = new Set(["a", "b"]);
    expect(sanitizePlanDayResponse({ taskIds: ["a", "b", "a"] }, validIds)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns an empty array when validIds is empty", () => {
    expect(sanitizePlanDayResponse({ taskIds: ["a"] }, new Set())).toEqual([]);
  });
});
