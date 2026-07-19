export type TaskStatus = "inbox" | "today";

export interface Task {
  id: string;
  text: string;
  status: TaskStatus;
  done: boolean;
  createdAt: number;
}

const STORAGE_KEY = "ai-day-planner:tasks";

export function parseCaptureText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function createTask(text: string): Task {
  return {
    id: crypto.randomUUID(),
    text,
    status: "inbox",
    done: false,
    createdAt: Date.now(),
  };
}

export function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Task[];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // localStorage unavailable (private mode, quota) — drop the write silently
  }
}
