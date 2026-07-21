export interface PlanDayResult {
  selected: string[];
  deferred: string[];
  note: string;
  totalMinutes: number;
  overloaded: boolean;
}

export const DAY_CAPACITY_MIN = 480;
export const DEFAULT_TASK_MINUTES = 30;

const OVERLOADED_FALLBACK_NOTE = "Задач більше, ніж влізе у день.";

export function sanitizePlanDayResponse(
  raw: unknown,
  validIds: Set<string>,
  minutesById: Map<string, number | null>
): PlanDayResult {
  const rawSelected =
    raw && typeof raw === "object" && Array.isArray((raw as { selected?: unknown }).selected)
      ? (raw as { selected: unknown[] }).selected
      : [];

  const seen = new Set<string>();
  const candidateIds: string[] = [];
  for (const id of rawSelected) {
    if (typeof id !== "string") continue;
    if (!validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    candidateIds.push(id);
  }

  const selected: string[] = [];
  let totalMinutes = 0;
  for (const id of candidateIds) {
    const minutes = minutesById.get(id);
    const duration = typeof minutes === "number" ? minutes : DEFAULT_TASK_MINUTES;
    if (totalMinutes + duration > DAY_CAPACITY_MIN) break;
    selected.push(id);
    totalMinutes += duration;
  }

  const selectedSet = new Set(selected);
  const deferred = [...validIds].filter((id) => !selectedSet.has(id));
  const overloaded = deferred.length > 0;

  const rawNote =
    raw && typeof raw === "object" ? (raw as { note?: unknown }).note : undefined;
  const note =
    typeof rawNote === "string" && rawNote.trim().length > 0
      ? rawNote
      : overloaded
        ? OVERLOADED_FALLBACK_NOTE
        : "";

  return { selected, deferred, note, totalMinutes, overloaded };
}
