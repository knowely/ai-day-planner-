import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "./page";
import type { Task } from "@/lib/tasks";

const { moveToToday, removeTask, tasksMock } = vi.hoisted(() => ({
  moveToToday: vi.fn(),
  removeTask: vi.fn(),
  tasksMock: vi.fn<() => Task[]>(),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: tasksMock(),
    moveToToday,
    removeTask,
  }),
}));

const inboxTask: Task = {
  id: "1",
  text: "купити молоко",
  status: "inbox",
  done: false,
  createdAt: 1,
  priority: "high",
  estimatedMinutes: 15,
  deadline: "2026-07-25",
};
const todayTask: Task = {
  id: "2",
  text: "вже розкладено",
  status: "today",
  done: false,
  createdAt: 2,
  priority: "medium",
  estimatedMinutes: null,
  deadline: null,
};

describe("InboxPage", () => {
  beforeEach(() => {
    moveToToday.mockClear();
    removeTask.mockClear();
  });

  it("shows a placeholder when there are no inbox tasks", () => {
    tasksMock.mockReturnValue([todayTask]);
    render(<InboxPage />);
    expect(screen.getByText("Тут з'являться твої задачі")).toBeInTheDocument();
  });

  it("renders only inbox tasks", () => {
    tasksMock.mockReturnValue([inboxTask, todayTask]);
    render(<InboxPage />);
    expect(screen.getByText("купити молоко")).toBeInTheDocument();
    expect(screen.queryByText("вже розкладено")).not.toBeInTheDocument();
  });

  it("moves a task to today on click", async () => {
    tasksMock.mockReturnValue([inboxTask]);
    const user = userEvent.setup();
    render(<InboxPage />);

    await user.click(screen.getByRole("button", { name: "→ Сьогодні" }));

    expect(moveToToday).toHaveBeenCalledWith("1");
  });

  it("removes a task on click", async () => {
    tasksMock.mockReturnValue([inboxTask]);
    const user = userEvent.setup();
    render(<InboxPage />);

    await user.click(screen.getByRole("button", { name: "Видалити" }));

    expect(removeTask).toHaveBeenCalledWith("1");
  });
});
