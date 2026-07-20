import { beforeEach, describe, expect, it } from "vitest";
import {
  createTask,
  createTaskFromParsed,
  formatTaskMeta,
  loadTasks,
  parseCaptureText,
  saveTasks,
} from "./tasks";

describe("parseCaptureText", () => {
  it("splits multi-line text into trimmed non-empty lines", () => {
    expect(parseCaptureText("купити молоко\n  подзвонити мамі  \n\nзабрати посилку"))
      .toEqual(["купити молоко", "подзвонити мамі", "забрати посилку"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseCaptureText("   \n  \n")).toEqual([]);
    expect(parseCaptureText("")).toEqual([]);
  });
});

describe("createTask", () => {
  it("creates an inbox task with the given text and default metadata", () => {
    const task = createTask("купити молоко");
    expect(task.text).toBe("купити молоко");
    expect(task.status).toBe("inbox");
    expect(task.done).toBe(false);
    expect(typeof task.id).toBe("string");
    expect(task.id.length).toBeGreaterThan(0);
    expect(typeof task.createdAt).toBe("number");
    expect(task.priority).toBe("medium");
    expect(task.estimatedMinutes).toBeNull();
    expect(task.deadline).toBeNull();
  });

  it("gives distinct ids to two tasks", () => {
    const a = createTask("a");
    const b = createTask("b");
    expect(a.id).not.toBe(b.id);
  });
});

describe("createTaskFromParsed", () => {
  it("creates an inbox task carrying the parsed metadata", () => {
    const task = createTaskFromParsed({
      text: "Купити молоко",
      priority: "high",
      estimatedMinutes: 15,
      deadline: "2026-07-25",
    });
    expect(task.text).toBe("Купити молоко");
    expect(task.status).toBe("inbox");
    expect(task.done).toBe(false);
    expect(task.priority).toBe("high");
    expect(task.estimatedMinutes).toBe(15);
    expect(task.deadline).toBe("2026-07-25");
    expect(typeof task.id).toBe("string");
    expect(typeof task.createdAt).toBe("number");
  });
});

describe("formatTaskMeta", () => {
  it("shows only the priority dot when no other metadata is present", () => {
    expect(
      formatTaskMeta({ priority: "medium", estimatedMinutes: null, deadline: null })
    ).toBe("🟡");
  });

  it("adds estimated minutes when present", () => {
    expect(
      formatTaskMeta({ priority: "high", estimatedMinutes: 15, deadline: null })
    ).toBe("🔴 · ~15 хв");
  });

  it("adds a formatted deadline when present", () => {
    expect(
      formatTaskMeta({ priority: "low", estimatedMinutes: null, deadline: "2026-07-25" })
    ).toBe("🟢 · 25.07");
  });

  it("combines minutes and deadline", () => {
    expect(
      formatTaskMeta({ priority: "high", estimatedMinutes: 30, deadline: "2026-12-01" })
    ).toBe("🔴 · ~30 хв · 01.12");
  });
});

describe("loadTasks / saveTasks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty array when nothing is stored", () => {
    expect(loadTasks()).toEqual([]);
  });

  it("round-trips tasks through localStorage", () => {
    const tasks = [createTask("купити молоко")];
    saveTasks(tasks);
    expect(loadTasks()).toEqual(tasks);
  });

  it("returns an empty array when stored JSON is corrupt", () => {
    window.localStorage.setItem("ai-day-planner:tasks", "{not json");
    expect(loadTasks()).toEqual([]);
  });

  it("returns an empty array when stored value is not an array", () => {
    window.localStorage.setItem("ai-day-planner:tasks", JSON.stringify({ oops: true }));
    expect(loadTasks()).toEqual([]);
  });
});
