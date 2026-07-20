import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "./page";
import type { Task } from "@/lib/tasks";

const { toggleDone, removeTask, tasksMock } = vi.hoisted(() => ({
  toggleDone: vi.fn(),
  removeTask: vi.fn(),
  tasksMock: vi.fn<() => Task[]>(),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: tasksMock(),
    toggleDone,
    removeTask,
  }),
}));

const inboxTask: Task = {
  id: "1",
  text: "ще не розкладено",
  status: "inbox",
  done: false,
  createdAt: 1,
  priority: "medium",
  estimatedMinutes: null,
  deadline: null,
};
const todayTask: Task = {
  id: "2",
  text: "купити молоко",
  status: "today",
  done: false,
  createdAt: 2,
  priority: "low",
  estimatedMinutes: 15,
  deadline: null,
};
const doneTask: Task = {
  id: "3",
  text: "вже зроблено",
  status: "today",
  done: true,
  createdAt: 3,
  priority: "medium",
  estimatedMinutes: null,
  deadline: null,
};

describe("TodayPage", () => {
  beforeEach(() => {
    toggleDone.mockClear();
    removeTask.mockClear();
  });

  it("shows a placeholder when there are no today tasks", () => {
    tasksMock.mockReturnValue([inboxTask]);
    render(<TodayPage />);
    expect(
      screen.getByText("Тут з'являться задачі на сьогодні")
    ).toBeInTheDocument();
  });

  it("renders only today tasks", () => {
    tasksMock.mockReturnValue([inboxTask, todayTask]);
    render(<TodayPage />);
    expect(screen.getByText("купити молоко")).toBeInTheDocument();
    expect(screen.queryByText("ще не розкладено")).not.toBeInTheDocument();
  });

  it("renders the priority/time/deadline metadata line", () => {
    tasksMock.mockReturnValue([todayTask]);
    render(<TodayPage />);
    expect(screen.getByText("🟢 · ~15 хв")).toBeInTheDocument();
  });

  it("shows done tasks with a done-styled checkbox", () => {
    tasksMock.mockReturnValue([doneTask]);
    render(<TodayPage />);
    expect(
      screen.getByRole("button", { name: "Позначити незробленою" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles done on click", async () => {
    tasksMock.mockReturnValue([todayTask]);
    const user = userEvent.setup();
    render(<TodayPage />);

    await user.click(
      screen.getByRole("button", { name: "Позначити зробленою" })
    );

    expect(toggleDone).toHaveBeenCalledWith("2");
  });

  it("removes a task on click", async () => {
    tasksMock.mockReturnValue([todayTask]);
    const user = userEvent.setup();
    render(<TodayPage />);

    await user.click(screen.getByRole("button", { name: "Видалити" }));

    expect(removeTask).toHaveBeenCalledWith("2");
  });
});
