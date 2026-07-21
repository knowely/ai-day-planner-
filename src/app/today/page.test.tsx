import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "./page";
import type { Task } from "@/lib/tasks";

const { toggleDone, removeTask, applyDayPlan, tasksMock } = vi.hoisted(() => ({
  toggleDone: vi.fn(),
  removeTask: vi.fn(),
  applyDayPlan: vi.fn(),
  tasksMock: vi.fn<() => Task[]>(),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: tasksMock(),
    toggleDone,
    removeTask,
    applyDayPlan,
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
    applyDayPlan.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the empty-backlog message when there are no today tasks and no backlog", () => {
    tasksMock.mockReturnValue([]);
    render(<TodayPage />);
    expect(
      screen.getByText("Спершу додай задачі в Inbox — і AI складе твій день.")
    ).toBeInTheDocument();
  });

  it("shows the backlog count when there are no today tasks but the backlog has tasks", () => {
    tasksMock.mockReturnValue([inboxTask]);
    render(<TodayPage />);
    expect(screen.getByText("У беклозі 1 задача.")).toBeInTheDocument();
  });

  it("uses the correct plural form for a backlog of several tasks", () => {
    const secondInboxTask: Task = { ...inboxTask, id: "4" };
    tasksMock.mockReturnValue([inboxTask, secondInboxTask]);
    render(<TodayPage />);
    expect(screen.getByText("У беклозі 2 задачі.")).toBeInTheDocument();
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

  describe("Сформувати день", () => {
    it("does not render the button when the backlog is empty", () => {
      tasksMock.mockReturnValue([todayTask]);
      render(<TodayPage />);
      expect(
        screen.queryByRole("button", { name: "✨ Сформувати день" })
      ).not.toBeInTheDocument();
    });

    it("renders the button when the backlog has tasks, even if Today already has tasks", () => {
      tasksMock.mockReturnValue([inboxTask, todayTask]);
      render(<TodayPage />);
      expect(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      ).toBeInTheDocument();
    });

    it("calls applyDayPlan with the returned taskIds on success", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ taskIds: ["1"] }),
        })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() => expect(applyDayPlan).toHaveBeenCalledWith(["1"]));
    });

    it("sends the backlog in the request body", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ taskIds: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, requestInit] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/plan-day");
      const body = JSON.parse(requestInit.body);
      expect(body.backlog).toEqual([
        {
          id: "1",
          text: "ще не розкладено",
          priority: "medium",
          estimatedMinutes: null,
          deadline: null,
        },
      ]);
    });

    it("shows a loading label while the request is in flight", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      let resolveFetch: (value: unknown) => void = () => {};
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveFetch = resolve;
            })
        )
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      expect(
        screen.getByRole("button", { name: "AI планує твій день…" })
      ).toBeDisabled();

      resolveFetch({ ok: true, json: async () => ({ taskIds: [] }) });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "✨ Сформувати день" })
        ).toBeInTheDocument()
      );
    });

    it("shows an error message and does not call applyDayPlan when the request fails", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down"))
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() =>
        expect(
          screen.getByText("Не вдалося скласти план, спробуй ще раз.")
        ).toBeInTheDocument()
      );
      expect(applyDayPlan).not.toHaveBeenCalled();
    });

    it("shows an error message when the server responds with an error status", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() =>
        expect(
          screen.getByText("Не вдалося скласти план, спробуй ще раз.")
        ).toBeInTheDocument()
      );
      expect(applyDayPlan).not.toHaveBeenCalled();
    });
  });
});
