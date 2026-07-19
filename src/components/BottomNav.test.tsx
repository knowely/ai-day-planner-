import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

describe("BottomNav", () => {
  it("renders all three tabs with correct links", () => {
    usePathname.mockReturnValue("/");
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: /capture/i })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: /inbox/i })).toHaveAttribute(
      "href",
      "/inbox"
    );
    expect(screen.getByRole("link", { name: /today/i })).toHaveAttribute(
      "href",
      "/today"
    );
  });

  it("marks the current route as active", () => {
    usePathname.mockReturnValue("/inbox");
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: /inbox/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: /capture/i })
    ).not.toHaveAttribute("aria-current");
  });
});
