import type { ParsedTask, TaskPriority } from "./tasks";

const VALID_PRIORITIES: readonly TaskPriority[] = ["low", "medium", "high"];
const MAX_ESTIMATED_MINUTES = 480;
const MAX_TASKS = 50;
const DEADLINE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeParsedTasks(raw: unknown): ParsedTask[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { tasks?: unknown }).tasks)
  ) {
    return [];
  }

  const rawTasks = (raw as { tasks: unknown[] }).tasks;
  const sanitized: ParsedTask[] = [];

  for (const item of rawTasks) {
    const parsed = sanitizeParsedTask(item);
    if (parsed !== null) sanitized.push(parsed);
  }

  return sanitized.slice(0, MAX_TASKS);
}

function sanitizeParsedTask(item: unknown): ParsedTask | null {
  if (!item || typeof item !== "object") return null;

  const candidate = item as Record<string, unknown>;
  const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
  if (text.length === 0) return null;

  return {
    text,
    priority: sanitizePriority(candidate.priority),
    estimatedMinutes: sanitizeEstimatedMinutes(candidate.estimatedMinutes),
    deadline: sanitizeDeadline(candidate.deadline),
  };
}

function sanitizePriority(value: unknown): TaskPriority {
  return VALID_PRIORITIES.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : "medium";
}

function sanitizeEstimatedMinutes(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.min(value, MAX_ESTIMATED_MINUTES);
}

function sanitizeDeadline(value: unknown): string | null {
  if (typeof value !== "string" || !DEADLINE_PATTERN.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  const roundTripped = `${parsed.getUTCFullYear().toString().padStart(4, "0")}-${(parsed.getUTCMonth() + 1).toString().padStart(2, "0")}-${parsed.getUTCDate().toString().padStart(2, "0")}`;
  return roundTripped === value ? value : null;
}
