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

  it("shows the empty-state message and a link back to Capture when there are no inbox tasks", () => {
    tasksMock.mockReturnValue([todayTask]);
    render(<InboxPage />);
    expect(
      screen.getByText(
        "Inbox поки порожній. Тут з'являться задачі, щойно ти щось надиктуєш."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← У Capture" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("renders only inbox tasks", () => {
    tasksMock.mockReturnValue([inboxTask, todayTask]);
    render(<InboxPage />);
    expect(screen.getByText("купити молоко")).toBeInTheDocument();
    expect(screen.queryByText("вже розкладено")).not.toBeInTheDocument();
  });

  it("renders the priority/time/deadline metadata line", () => {
    tasksMock.mockReturnValue([inboxTask]);
    render(<InboxPage />);
    expect(screen.getByText("● Високий")).toBeInTheDocument();
    expect(screen.getByText("~15 хв")).toBeInTheDocument();
    expect(screen.getByText("25.07")).toBeInTheDocument();
  });

  it("moves a task to today on click", async () => {
    tasksMock.mockReturnValue([inboxTask]);
    const user = userEvent.setup();
    render(<InboxPage />);

    await user.click(screen.getByRole("button", { name: "Сьогодні" }));

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
