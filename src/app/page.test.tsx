import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "./page";

const { addTasksFromText, useSpeechRecognitionMock } = vi.hoisted(() => ({
  addTasksFromText: vi.fn(),
  useSpeechRecognitionMock: vi.fn(),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({ addTasksFromText }),
}));

vi.mock("@/hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: (onResult: (text: string) => void) =>
    useSpeechRecognitionMock(onResult),
}));

describe("CapturePage", () => {
  beforeEach(() => {
    addTasksFromText.mockClear();
    useSpeechRecognitionMock.mockReset();
  });

  it("adds the typed text and clears the field", async () => {
    useSpeechRecognitionMock.mockReturnValue({
      isSupported: true,
      isListening: false,
      start: vi.fn(),
      stop: vi.fn(),
    });
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    expect(addTasksFromText).toHaveBeenCalledWith("купити молоко");
    expect(textarea).toHaveValue("");
  });

  it("disables Додати while the field is empty", () => {
    useSpeechRecognitionMock.mockReturnValue({
      isSupported: true,
      isListening: false,
      start: vi.fn(),
      stop: vi.fn(),
    });
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
