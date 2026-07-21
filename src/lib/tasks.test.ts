import { beforeEach, describe, expect, it } from "vitest";
import {
  createTask,
  createTaskFromParsed,
  formatBacklogCount,
  formatPlanSummary,
  formatTaskMeta,
  formatTodayCount,
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

  it("does not crash on a pre-Phase-2 task shape (fields missing entirely)", () => {
    const legacyShape = {} as unknown as {
      priority: "low" | "medium" | "high";
      estimatedMinutes: number | null;
      deadline: string | null;
    };
    expect(formatTaskMeta(legacyShape)).toBe("🟡");
  });
});

describe("formatBacklogCount", () => {
  it("uses the singular form for 1", () => {
    expect(formatBacklogCount(1)).toBe("У беклозі 1 задача.");
  });

  it("uses the few form for 2-4", () => {
    expect(formatBacklogCount(2)).toBe("У беклозі 2 задачі.");
    expect(formatBacklogCount(3)).toBe("У беклозі 3 задачі.");
    expect(formatBacklogCount(4)).toBe("У беклозі 4 задачі.");
  });

  it("uses the many form for 5-20", () => {
    expect(formatBacklogCount(5)).toBe("У беклозі 5 задач.");
    expect(formatBacklogCount(11)).toBe("У беклозі 11 задач.");
    expect(formatBacklogCount(12)).toBe("У беклозі 12 задач.");
    expect(formatBacklogCount(14)).toBe("У беклозі 14 задач.");
    expect(formatBacklogCount(20)).toBe("У беклозі 20 задач.");
  });

  it("uses the singular form for 21 and the few form for 22-24", () => {
    expect(formatBacklogCount(21)).toBe("У беклозі 21 задача.");
    expect(formatBacklogCount(22)).toBe("У беклозі 22 задачі.");
    expect(formatBacklogCount(24)).toBe("У беклозі 24 задачі.");
  });

  it("uses the many form for 25 and for 0", () => {
    expect(formatBacklogCount(25)).toBe("У беклозі 25 задач.");
    expect(formatBacklogCount(0)).toBe("У беклозі 0 задач.");
  });
});

describe("formatPlanSummary", () => {
  it("shows minutes when under an hour", () => {
    expect(formatPlanSummary(45)).toBe("~45 хв заплановано");
  });

  it("shows whole hours", () => {
    expect(formatPlanSummary(120)).toBe("~2 год заплановано");
  });

  it("rounds to the nearest half hour", () => {
    expect(formatPlanSummary(100)).toBe("~1.5 год заплановано");
    expect(formatPlanSummary(370)).toBe("~6 год заплановано");
    expect(formatPlanSummary(390)).toBe("~6.5 год заплановано");
  });

  it("handles zero minutes", () => {
    expect(formatPlanSummary(0)).toBe("~0 хв заплановано");
  });
});

describe("formatTodayCount", () => {
  it("uses the singular form for 1", () => {
    expect(formatTodayCount(1)).toBe("1 задача на сьогодні");
  });

  it("uses the few form for 2-4", () => {
    expect(formatTodayCount(2)).toBe("2 задачі на сьогодні");
    expect(formatTodayCount(4)).toBe("4 задачі на сьогодні");
  });

  it("uses the many form for 5-20 and for 0", () => {
    expect(formatTodayCount(5)).toBe("5 задач на сьогодні");
    expect(formatTodayCount(11)).toBe("11 задач на сьогодні");
    expect(formatTodayCount(0)).toBe("0 задач на сьогодні");
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

  it("backfills default metadata onto pre-Phase-2 tasks missing the new fields", () => {
    const legacyTask = {
      id: "1",
      text: "старий запис",
      status: "inbox",
      done: false,
      createdAt: 1,
      // no priority/estimatedMinutes/deadline — shape from before this feature shipped
    };
    window.localStorage.setItem("ai-day-planner:tasks", JSON.stringify([legacyTask]));

    const loaded = loadTasks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      id: "1",
      text: "старий запис",
      priority: "medium",
      estimatedMinutes: null,
      deadline: null,
    });
  });
});
