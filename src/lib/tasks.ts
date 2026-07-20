export type TaskStatus = "inbox" | "today";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  text: string;
  status: TaskStatus;
  done: boolean;
  createdAt: number;
  priority: TaskPriority;
  estimatedMinutes: number | null;
  deadline: string | null;
}

export interface ParsedTask {
  text: string;
  priority: TaskPriority;
  estimatedMinutes: number | null;
  deadline: string | null;
}

const STORAGE_KEY = "ai-day-planner:tasks";

const PRIORITY_ICON: Record<TaskPriority, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

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
    priority: "medium",
    estimatedMinutes: null,
    deadline: null,
  };
}

export function createTaskFromParsed(parsed: ParsedTask): Task {
  return {
    id: crypto.randomUUID(),
    text: parsed.text,
    status: "inbox",
    done: false,
    createdAt: Date.now(),
    priority: parsed.priority,
    estimatedMinutes: parsed.estimatedMinutes,
    deadline: parsed.deadline,
  };
}

export function formatTaskMeta(
  task: Pick<Task, "priority" | "estimatedMinutes" | "deadline">
): string {
  const parts = [PRIORITY_ICON[task.priority]];
  if (task.estimatedMinutes !== null) {
    parts.push(`~${task.estimatedMinutes} хв`);
  }
  if (task.deadline !== null) {
    const [, month, day] = task.deadline.split("-");
    parts.push(`${day}.${month}`);
  }
  return parts.join(" · ");
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
