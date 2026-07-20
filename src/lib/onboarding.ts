const ONBOARDING_STORAGE_KEY = "ai-day-planner:onboarding-seen";

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  } catch {
    // localStorage unavailable — nothing to persist, onboarding will just show again
  }
}
