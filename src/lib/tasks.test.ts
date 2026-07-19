import { beforeEach, describe, expect, it } from "vitest";
import { createTask, loadTasks, parseCaptureText, saveTasks } from "./tasks";

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
  it("creates an inbox task with the given text", () => {
    const task = createTask("купити молоко");
    expect(task.text).toBe("купити молоко");
    expect(task.status).toBe("inbox");
    expect(task.done).toBe(false);
    expect(typeof task.id).toBe("string");
    expect(task.id.length).toBeGreaterThan(0);
    expect(typeof task.createdAt).toBe("number");
  });

  it("gives distinct ids to two tasks", () => {
    const a = createTask("a");
    const b = createTask("b");
    expect(a.id).not.toBe(b.id);
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
