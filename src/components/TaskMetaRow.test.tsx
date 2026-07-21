import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskMetaRow } from "./TaskMetaRow";

describe("TaskMetaRow", () => {
  it("shows the high-priority chip", () => {
    render(<TaskMetaRow priority="high" estimatedMinutes={null} deadline={null} />);
    expect(screen.getByText("● Високий")).toBeInTheDocument();
  });

  it("shows the medium-priority chip", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={null} deadline={null} />);
    expect(screen.getByText("● Середній")).toBeInTheDocument();
  });

  it("shows the low-priority chip", () => {
    render(<TaskMetaRow priority="low" estimatedMinutes={null} deadline={null} />);
    expect(screen.getByText("● Низький")).toBeInTheDocument();
  });

  it("shows estimated minutes when present", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={45} deadline={null} />);
    expect(screen.getByText("~45 хв")).toBeInTheDocument();
  });

  it("does not show a time element when estimatedMinutes is null", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={null} deadline={null} />);
    expect(screen.queryByText(/хв/)).not.toBeInTheDocument();
  });

  it("shows a formatted deadline when present", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={null} deadline="2026-07-25" />);
    expect(screen.getByText("25.07")).toBeInTheDocument();
  });

  it("does not show a deadline element when deadline is null", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={null} deadline={null} />);
    expect(screen.queryByText(/^\d{2}\.\d{2}$/)).not.toBeInTheDocument();
  });

  it("shows both minutes and deadline together", () => {
    render(<TaskMetaRow priority="high" estimatedMinutes={30} deadline="2026-12-01" />);
    expect(screen.getByText("~30 хв")).toBeInTheDocument();
    expect(screen.getByText("01.12")).toBeInTheDocument();
  });

  it("falls back to the medium chip for an unrecognized priority value", () => {
    const legacyProps = {
      priority: "urgent" as unknown as "high",
      estimatedMinutes: null,
      deadline: null,
    };
    render(<TaskMetaRow {...legacyProps} />);
    expect(screen.getByText("● Середній")).toBeInTheDocument();
  });
});
