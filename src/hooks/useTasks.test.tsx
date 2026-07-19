import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TasksProvider, useTasks } from "./useTasks";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <TasksProvider>{children}</TasksProvider>;
}

describe("useTasks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with an empty task list", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));
  });

  it("adds one inbox task per non-empty line", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко\nподзвонити мамі");
    });

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks[0]).toMatchObject({
      text: "купити молоко",
      status: "inbox",
      done: false,
    });
    expect(result.current.tasks[1]).toMatchObject({
      text: "подзвонити мамі",
      status: "inbox",
      done: false,
    });
  });

  it("does not add anything for blank text", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("   \n  ");
    });

    expect(result.current.tasks).toEqual([]);
  });

  it("moves a task from inbox to today", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const id = result.current.tasks[0].id;

    act(() => {
      result.current.moveToToday(id);
    });

    expect(result.current.tasks[0].status).toBe("today");
  });

  it("toggles done on a task", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const id = result.current.tasks[0].id;

    act(() => {
      result.current.toggleDone(id);
    });
    expect(result.current.tasks[0].done).toBe(true);

    act(() => {
      result.current.toggleDone(id);
    });
    expect(result.current.tasks[0].done).toBe(false);
  });

  it("removes a task", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const id = result.current.tasks[0].id;

    act(() => {
      result.current.removeTask(id);
    });

    expect(result.current.tasks).toEqual([]);
  });

  it("persists changes to localStorage", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem("ai-day-planner:tasks");
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].text).toBe("купити молоко");
    });
  });

  it("throws when useTasks is called outside a TasksProvider", () => {
    const { result } = renderHook(() => useTasks());
    expect(result.error).toBeInstanceOf(Error);
  });
});
