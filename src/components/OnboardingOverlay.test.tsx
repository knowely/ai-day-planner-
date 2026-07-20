import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingOverlay } from "./OnboardingOverlay";

describe("OnboardingOverlay", () => {
  it("renders the heading, subheading, and all three cards", () => {
    render(<OnboardingOverlay onStart={() => {}} />);

    expect(screen.getByText("Плануй день голосом")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Надиктуй усе, що в голові. AI розкладе це на задачі — з пріоритетом, часом і дедлайном — і сам складе твій план на сьогодні."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Capture")).toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("calls onStart when Почати is clicked", async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingOverlay onStart={onStart} />);

    await user.click(screen.getByRole("button", { name: "Почати" }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
