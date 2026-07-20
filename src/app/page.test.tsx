import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "./page";

const { addTasksFromText, addParsedTasks, useSpeechRecognitionMock } = vi.hoisted(
  () => ({
    addTasksFromText: vi.fn(),
    addParsedTasks: vi.fn(),
    useSpeechRecognitionMock: vi.fn(),
  })
);

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({ addTasksFromText, addParsedTasks }),
}));

vi.mock("@/hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: (onResult: (text: string) => void) =>
    useSpeechRecognitionMock(onResult),
}));

describe("CapturePage", () => {
  beforeEach(() => {
    addTasksFromText.mockClear();
    addParsedTasks.mockClear();
    useSpeechRecognitionMock.mockReset();
    useSpeechRecognitionMock.mockReturnValue({
      isSupported: true,
      isListening: false,
      start: vi.fn(),
      stop: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds AI-parsed tasks and clears the field on a successful parse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              text: "Купити молоко",
              priority: "medium",
              estimatedMinutes: null,
              deadline: null,
            },
          ],
        }),
      })
    );
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addParsedTasks).toHaveBeenCalledWith([
        {
          text: "Купити молоко",
          priority: "medium",
          estimatedMinutes: null,
          deadline: null,
        },
      ])
    );
    expect(addTasksFromText).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("");
  });

  it("falls back to line-splitting when the parse request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addTasksFromText).toHaveBeenCalledWith("купити молоко")
    );
    expect(addParsedTasks).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("");
  });

  it("falls back to line-splitting when the server responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) })
    );
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addTasksFromText).toHaveBeenCalledWith("купити молоко")
    );
  });

  it("falls back to line-splitting when the response payload has no tasks array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ oops: true }) })
    );
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addTasksFromText).toHaveBeenCalledWith("купити молоко")
    );
  });

  it("falls back to line-splitting when the AI returns an empty tasks array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks: [] }) })
    );
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addTasksFromText).toHaveBeenCalledWith("купити молоко")
    );
    expect(addParsedTasks).not.toHaveBeenCalled();
  });

  it("disables Додати and shows a loading label while the request is in flight", async () => {
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
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    expect(screen.getByRole("button", { name: "Розбираю…" })).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({ tasks: [] }) });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Додати" })).toBeInTheDocument()
    );
  });

  it("disables Додати while the field is empty", () => {
    render(<CapturePage />);
    expect(screen.getByRole("button", { name: "Додати" })).toBeDisabled();
  });

  it("shows a fallback message when the mic is tapped without browser support", async () => {
    useSpeechRecognitionMock.mockReturnValue({
      isSupported: false,
      isListening: false,
      start: vi.fn(),
      stop: vi.fn(),
    });
    const user = userEvent.setup();
    render(<CapturePage />);

    await user.click(screen.getByRole("button", { name: "Диктувати" }));

    expect(
      screen.getByText(
        "Диктування не підтримується в цьому браузері, введи текст вручну"
      )
    ).toBeInTheDocument();
  });

  it("calls start() when the mic is tapped with browser support", async () => {
    const start = vi.fn();
    useSpeechRecognitionMock.mockReturnValue({
      isSupported: true,
      isListening: false,
      start,
      stop: vi.fn(),
    });
    const user = userEvent.setup();
    render(<CapturePage />);

    await user.click(screen.getByRole("button", { name: "Диктувати" }));

    expect(start).toHaveBeenCalledTimes(1);
  });
});
