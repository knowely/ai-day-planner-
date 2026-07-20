import { describe, expect, it } from "vitest";
import { sanitizeParsedTasks } from "./parseTasksResponse";

describe("sanitizeParsedTasks", () => {
  it("returns an empty array when raw is not an object", () => {
    expect(sanitizeParsedTasks(null)).toEqual([]);
    expect(sanitizeParsedTasks("oops")).toEqual([]);
  });

  it("returns an empty array when tasks is missing or not an array", () => {
    expect(sanitizeParsedTasks({})).toEqual([]);
    expect(sanitizeParsedTasks({ tasks: "oops" })).toEqual([]);
  });

  it("passes through a fully valid task", () => {
    expect(
      sanitizeParsedTasks({
        tasks: [
          {
            text: "Купити молоко",
            priority: "high",
            estimatedMinutes: 15,
            deadline: "2026-07-25",
          },
        ],
      })
    ).toEqual([
      { text: "Купити молоко", priority: "high", estimatedMinutes: 15, deadline: "2026-07-25" },
    ]);
  });

  it("skips non-object items", () => {
    expect(sanitizeParsedTasks({ tasks: ["oops", 5, null] })).toEqual([]);
  });

  it("skips items with an empty or missing text", () => {
    expect(
      sanitizeParsedTasks({
        tasks: [
          { text: "   ", priority: "medium", estimatedMinutes: null, deadline: null },
          { priority: "medium", estimatedMinutes: null, deadline: null },
        ],
      })
    ).toEqual([]);
  });

  it("trims text", () => {
    expect(
      sanitizeParsedTasks({
        tasks: [
          { text: "  Купити молоко  ", priority: "medium", estimatedMinutes: null, deadline: null },
        ],
      })
    ).toEqual([
      { text: "Купити молоко", priority: "medium", estimatedMinutes: null, deadline: null },
    ]);
  });

  it("defaults an invalid or missing priority to medium", () => {
    const result = sanitizeParsedTasks({
      tasks: [
        { text: "a", priority: "urgent", estimatedMinutes: null, deadline: null },
        { text: "b", estimatedMinutes: null, deadline: null },
      ],
    });
    expect(result[0].priority).toBe("medium");
    expect(result[1].priority).toBe("medium");
  });

  it("defaults a negative or non-numeric estimatedMinutes to null", () => {
    const result = sanitizeParsedTasks({
      tasks: [
        { text: "a", priority: "low", estimatedMinutes: -5, deadline: null },
        { text: "b", priority: "low", estimatedMinutes: "15", deadline: null },
      ],
    });
    expect(result[0].estimatedMinutes).toBeNull();
    expect(result[1].estimatedMinutes).toBeNull();
  });

  it("clamps estimatedMinutes above 480 down to 480", () => {
    const result = sanitizeParsedTasks({
      tasks: [{ text: "a", priority: "low", estimatedMinutes: 600, deadline: null }],
    });
    expect(result[0].estimatedMinutes).toBe(480);
  });

  it("defaults an invalid deadline format to null", () => {
    const result = sanitizeParsedTasks({
      tasks: [
        { text: "a", priority: "low", estimatedMinutes: null, deadline: "tomorrow" },
        { text: "b", priority: "low", estimatedMinutes: null, deadline: "25-07-2026" },
      ],
    });
    expect(result[0].deadline).toBeNull();
    expect(result[1].deadline).toBeNull();
  });

  it("defaults an impossible calendar date to null", () => {
    const result = sanitizeParsedTasks({
      tasks: [
        { text: "a", priority: "low", estimatedMinutes: null, deadline: "2026-02-30" },
        { text: "b", priority: "low", estimatedMinutes: null, deadline: "2026-04-31" },
        { text: "c", priority: "low", estimatedMinutes: null, deadline: "2026-02-29" },
      ],
    });
    expect(result[0].deadline).toBeNull();
    expect(result[1].deadline).toBeNull();
    expect(result[2].deadline).toBeNull();
  });

  it("keeps a valid leap-year February 29th deadline", () => {
    const result = sanitizeParsedTasks({
      tasks: [{ text: "a", priority: "low", estimatedMinutes: null, deadline: "2028-02-29" }],
    });
    expect(result[0].deadline).toBe("2028-02-29");
  });

  it("keeps a valid deadline unchanged", () => {
    const result = sanitizeParsedTasks({
      tasks: [{ text: "a", priority: "low", estimatedMinutes: null, deadline: "2026-07-25" }],
    });
    expect(result[0].deadline).toBe("2026-07-25");
  });

  it("truncates to 50 tasks", () => {
    const tasks = Array.from({ length: 60 }, (_, index) => ({
      text: `Task ${index}`,
      priority: "medium",
      estimatedMinutes: null,
      deadline: null,
    }));
    expect(sanitizeParsedTasks({ tasks })).toHaveLength(50);
  });
});
