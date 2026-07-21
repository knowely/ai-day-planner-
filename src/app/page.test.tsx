import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "./page";

const { addTasksFromText, addParsedTasks, useAudioRecordingMock } = vi.hoisted(
  () => ({
    addTasksFromText: vi.fn(),
    addParsedTasks: vi.fn(),
    useAudioRecordingMock: vi.fn(),
  })
);

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({ addTasksFromText, addParsedTasks }),
}));

vi.mock("@/hooks/useAudioRecording", () => ({
  useAudioRecording: (onTranscript: (text: string) => void) =>
    useAudioRecordingMock(onTranscript),
}));

describe("CapturePage", () => {
  beforeEach(() => {
    window.localStorage.setItem("ai-day-planner:onboarding-seen", "true");
    addTasksFromText.mockClear();
    addParsedTasks.mockClear();
    useAudioRecordingMock.mockReset();
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: false,
      isTranscribing: false,
      error: null,
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
    useAudioRecordingMock.mockReturnValue({
      isSupported: false,
      isRecording: false,
      isTranscribing: false,
      error: null,
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
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: false,
      isTranscribing: false,
      error: null,
      start,
      stop: vi.fn(),
    });
    const user = userEvent.setup();
    render(<CapturePage />);

    await user.click(screen.getByRole("button", { name: "Диктувати" }));

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("calls stop() when the mic is tapped while recording", async () => {
    const stop = vi.fn();
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: true,
      isTranscribing: false,
      error: null,
      start: vi.fn(),
      stop,
    });
    const user = userEvent.setup();
    render(<CapturePage />);

    await user.click(screen.getByRole("button", { name: "Диктувати" }));

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("shows a recording status message while recording", () => {
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: true,
      isTranscribing: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });
    render(<CapturePage />);

    expect(screen.getByText("Записую…")).toBeInTheDocument();
  });

  it("shows a transcribing status message while transcribing", () => {
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: false,
      isTranscribing: true,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });
    render(<CapturePage />);

    expect(screen.getByText("Розпізнаю…")).toBeInTheDocument();
  });

  it("disables the mic button while transcribing", () => {
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: false,
      isTranscribing: true,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });
    render(<CapturePage />);

    expect(screen.getByRole("button", { name: "Диктувати" })).toBeDisabled();
  });

  it("shows a permission error message when the microphone is denied", () => {
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: false,
      isTranscribing: false,
      error: "mic-permission-denied",
      start: vi.fn(),
      stop: vi.fn(),
    });
    render(<CapturePage />);

    expect(
      screen.getByText(
        "Немає доступу до мікрофона. Дозволь доступ у налаштуваннях браузера або введи текст вручну."
      )
    ).toBeInTheDocument();
  });

  it("shows a transcription error message when transcription fails", () => {
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: false,
      isTranscribing: false,
      error: "transcribe-failed",
      start: vi.fn(),
      stop: vi.fn(),
    });
    render(<CapturePage />);

    expect(
      screen.getByText(
        "Не вдалося розпізнати мовлення. Спробуй ще раз або введи текст вручну."
      )
    ).toBeInTheDocument();
  });

  describe("onboarding", () => {
    it("shows the onboarding overlay on first visit", async () => {
      window.localStorage.clear();
      render(<CapturePage />);
      await waitFor(() =>
        expect(screen.getByText("Плануй день голосом")).toBeInTheDocument()
      );
    });

    it("does not show the onboarding overlay once it has been seen", async () => {
      render(<CapturePage />);
      await waitFor(() => {
        expect(
          screen.queryByText("Плануй день голосом")
        ).not.toBeInTheDocument();
      });
    });

    it("hides the overlay, remembers the flag, and focuses the textarea when Почати is clicked", async () => {
      window.localStorage.clear();
      const user = userEvent.setup();
      render(<CapturePage />);

      await waitFor(() =>
        expect(screen.getByText("Плануй день голосом")).toBeInTheDocument()
      );
      await user.click(screen.getByRole("button", { name: "Почати" }));

      expect(screen.queryByText("Плануй день голосом")).not.toBeInTheDocument();
      expect(
        window.localStorage.getItem("ai-day-planner:onboarding-seen")
      ).toBe("true");
      expect(screen.getByLabelText("Що в голові?")).toHaveFocus();
    });
  });

  describe("empty-state hint", () => {
    it("shows the hint when the field is empty", () => {
      render(<CapturePage />);
      expect(
        screen.getByText(/Запиши або натисни мікрофон і проговори все/)
      ).toBeInTheDocument();
    });

    it("hides the hint once text is typed", async () => {
      const user = userEvent.setup();
      render(<CapturePage />);

      await user.type(screen.getByLabelText("Що в голові?"), "купити молоко");

      expect(
        screen.queryByText(/Запиши або натисни мікрофон і проговори все/)
      ).not.toBeInTheDocument();
    });
  });
});
