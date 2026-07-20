import { beforeEach, describe, expect, it } from "vitest";
import { hasSeenOnboarding, markOnboardingSeen } from "./onboarding";

describe("hasSeenOnboarding / markOnboardingSeen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns false when the flag has never been set", () => {
    expect(hasSeenOnboarding()).toBe(false);
  });

  it("returns true after markOnboardingSeen is called", () => {
    markOnboardingSeen();
    expect(hasSeenOnboarding()).toBe(true);
  });

  it("stores the flag under the ai-day-planner namespace", () => {
    markOnboardingSeen();
    expect(window.localStorage.getItem("ai-day-planner:onboarding-seen")).toBe(
      "true"
    );
  });
});
