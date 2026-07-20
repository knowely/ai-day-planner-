# AI-розбиття тексту на задачі (Фаза 2, Фаза A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Capture screen's naive line-split with an AI call (via OpenRouter, model `anthropic/claude-haiku-4.5`) that splits chaotic text into clean tasks, each with a priority/estimated duration/deadline, falling back silently to the existing line-split behavior on any failure.

**Architecture:** A pure sanitizer (`src/lib/parseTasksResponse.ts`) validates whatever the model returns before it ever reaches app state — nothing from the AI is trusted structurally. A Next.js Route Handler (`src/app/api/parse-tasks/route.ts`) owns the `OPENROUTER_API_KEY` and the OpenRouter call, using tool calling to force structured JSON output. The Capture screen calls this route and falls back to the existing `addTasksFromText` on any failure (network, timeout, bad response). `useTasks()` gains a second entry point, `addParsedTasks`, for adding already-structured tasks without re-splitting them.

**Tech Stack:** Next.js 16 (App Router Route Handlers), TypeScript, Vitest + React Testing Library. No new npm dependencies — the OpenRouter call is a plain `fetch`.

## Global Constraints

- OpenRouter endpoint: `https://openrouter.ai/api/v1/chat/completions` — spec §2.
- Model: `anthropic/claude-haiku-4.5` — spec §2.
- Env var name: `OPENROUTER_API_KEY`, read only via `process.env` inside `src/app/api/parse-tasks/route.ts`, never exposed to the client — spec §2, §4.
- Structured output via tool calling (function `extract_tasks`), not free-text JSON parsing — spec §2.
- `priority` — exactly `'low' | 'medium' | 'high'`; invalid/missing → `'medium'` — spec §4.
- `estimatedMinutes` — `null` or a number; negative/non-numeric → `null`; values above 480 clamp to 480 — spec §4.
- `deadline` — `null` or a `YYYY-MM-DD` string; anything else → `null` — spec §4.
- Max 50 tasks per response — spec §4.
- Client-side request timeout: 15000ms — spec §4.
- On any failure (network, non-200, invalid/malformed response, timeout) the Capture screen falls back **silently** to the existing `addTasksFromText` line-split — no error shown to the user, textarea still clears — spec §4, §5.
- No new UI for editing priority/time/deadline in this phase — display only (spec §4, "UI полів").

---

## File Structure

```
ai-day-planner/
├── src/
│   ├── lib/
│   │   ├── tasks.ts                          # modify — Task/ParsedTask types, createTaskFromParsed, formatTaskMeta
│   │   ├── tasks.test.ts                     # modify
│   │   ├── parseTasksResponse.ts             # new — sanitizeParsedTasks (pure validation)
│   │   └── parseTasksResponse.test.ts        # new
│   ├── hooks/
│   │   ├── useTasks.tsx                      # modify — add addParsedTasks
│   │   └── useTasks.test.tsx                 # modify
│   └── app/
│       ├── api/
│       │   └── parse-tasks/
│       │       ├── route.ts                  # new — POST handler, calls OpenRouter
│       │       └── route.test.ts             # new
│       ├── page.tsx                          # modify — Capture screen calls the route, falls back
│       ├── page.test.tsx                     # modify
│       ├── inbox/
│       │   ├── page.tsx                      # modify — render formatTaskMeta
│       │   └── page.test.tsx                 # modify
│       └── today/
│           ├── page.tsx                      # modify — render formatTaskMeta
│           └── page.test.tsx                 # modify
```

---

### Task 1: Extend the task data model with priority/time/deadline

**Files:**
- Modify: `src/lib/tasks.ts`
- Modify: `src/lib/tasks.test.ts`
- Modify: `src/app/inbox/page.test.tsx` (fixtures only — add the 3 new required fields so the file still type-checks; no behavioral change in this task)
- Modify: `src/app/today/page.test.tsx` (fixtures only — same reason)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type TaskPriority = "low" | "medium" | "high"`
  - `interface Task { id: string; text: string; status: TaskStatus; done: boolean; createdAt: number; priority: TaskPriority; estimatedMinutes: number | null; deadline: string | null }`
  - `interface ParsedTask { text: string; priority: TaskPriority; estimatedMinutes: number | null; deadline: string | null }`
  - `createTask(text: string): Task` — now also sets `priority: "medium"`, `estimatedMinutes: null`, `deadline: null`.
  - `createTaskFromParsed(parsed: ParsedTask): Task`
  - `formatTaskMeta(task: Pick<Task, "priority" | "estimatedMinutes" | "deadline">): string`
  - Later tasks import `TaskPriority`, `ParsedTask`, `createTaskFromParsed`, `formatTaskMeta` from `@/lib/tasks`.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/lib/tasks.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTask,
  createTaskFromParsed,
  formatTaskMeta,
  loadTasks,
  parseCaptureText,
  saveTasks,
} from "./tasks";

describe("parseCaptureText", () => {
  it("splits multi-line text into trimmed non-empty lines", () => {
    expect(parseCaptureText("купити молоко\n  подзвонити мамі  \n\nзабрати посилку"))
      .toEqual(["купити молоко", "подзвонити мамі", "забрати посилку"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseCaptureText("   \n  \n")).toEqual([]);
    expect(parseCaptureText("")).toEqual([]);
  });
});

describe("createTask", () => {
  it("creates an inbox task with the given text and default metadata", () => {
    const task = createTask("купити молоко");
    expect(task.text).toBe("купити молоко");
    expect(task.status).toBe("inbox");
    expect(task.done).toBe(false);
    expect(typeof task.id).toBe("string");
    expect(task.id.length).toBeGreaterThan(0);
    expect(typeof task.createdAt).toBe("number");
    expect(task.priority).toBe("medium");
    expect(task.estimatedMinutes).toBeNull();
    expect(task.deadline).toBeNull();
  });

  it("gives distinct ids to two tasks", () => {
    const a = createTask("a");
    const b = createTask("b");
    expect(a.id).not.toBe(b.id);
  });
});

describe("createTaskFromParsed", () => {
  it("creates an inbox task carrying the parsed metadata", () => {
    const task = createTaskFromParsed({
      text: "Купити молоко",
      priority: "high",
      estimatedMinutes: 15,
      deadline: "2026-07-25",
    });
    expect(task.text).toBe("Купити молоко");
    expect(task.status).toBe("inbox");
    expect(task.done).toBe(false);
    expect(task.priority).toBe("high");
    expect(task.estimatedMinutes).toBe(15);
    expect(task.deadline).toBe("2026-07-25");
    expect(typeof task.id).toBe("string");
    expect(typeof task.createdAt).toBe("number");
  });
});

describe("formatTaskMeta", () => {
  it("shows only the priority dot when no other metadata is present", () => {
    expect(
      formatTaskMeta({ priority: "medium", estimatedMinutes: null, deadline: null })
    ).toBe("🟡");
  });

  it("adds estimated minutes when present", () => {
    expect(
      formatTaskMeta({ priority: "high", estimatedMinutes: 15, deadline: null })
    ).toBe("🔴 · ~15 хв");
  });

  it("adds a formatted deadline when present", () => {
    expect(
      formatTaskMeta({ priority: "low", estimatedMinutes: null, deadline: "2026-07-25" })
    ).toBe("🟢 · 25.07");
  });

  it("combines minutes and deadline", () => {
    expect(
      formatTaskMeta({ priority: "high", estimatedMinutes: 30, deadline: "2026-12-01" })
    ).toBe("🔴 · ~30 хв · 01.12");
  });
});

describe("loadTasks / saveTasks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty array when nothing is stored", () => {
    expect(loadTasks()).toEqual([]);
  });

  it("round-trips tasks through localStorage", () => {
    const tasks = [createTask("купити молоко")];
    saveTasks(tasks);
    expect(loadTasks()).toEqual(tasks);
  });

  it("returns an empty array when stored JSON is corrupt", () => {
    window.localStorage.setItem("ai-day-planner:tasks", "{not json");
    expect(loadTasks()).toEqual([]);
  });

  it("returns an empty array when stored value is not an array", () => {
    window.localStorage.setItem("ai-day-planner:tasks", JSON.stringify({ oops: true }));
    expect(loadTasks()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/tasks.test.ts`
Expected: FAIL — `createTaskFromParsed` and `formatTaskMeta` are not exported yet.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/lib/tasks.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/tasks.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Fix the now-broken fixtures in Inbox/Today tests**

`Task` now requires `priority`/`estimatedMinutes`/`deadline`, so the inline fixtures in `src/app/inbox/page.test.tsx` and `src/app/today/page.test.tsx` no longer type-check. Fix only the fixtures — no other changes in this step.

In `src/app/inbox/page.test.tsx`, replace:

```ts
const inboxTask: Task = {
  id: "1",
  text: "купити молоко",
  status: "inbox",
  done: false,
  createdAt: 1,
};
const todayTask: Task = {
  id: "2",
  text: "вже розкладено",
  status: "today",
  done: false,
  createdAt: 2,
};
```

with:

```ts
const inboxTask: Task = {
  id: "1",
  text: "купити молоко",
  status: "inbox",
  done: false,
  createdAt: 1,
  priority: "high",
  estimatedMinutes: 15,
  deadline: "2026-07-25",
};
const todayTask: Task = {
  id: "2",
  text: "вже розкладено",
  status: "today",
  done: false,
  createdAt: 2,
  priority: "medium",
  estimatedMinutes: null,
  deadline: null,
};
```

In `src/app/today/page.test.tsx`, replace:

```ts
const inboxTask: Task = {
  id: "1",
  text: "ще не розкладено",
  status: "inbox",
  done: false,
  createdAt: 1,
};
const todayTask: Task = {
  id: "2",
  text: "купити молоко",
  status: "today",
  done: false,
  createdAt: 2,
};
const doneTask: Task = {
  id: "3",
  text: "вже зроблено",
  status: "today",
  done: true,
  createdAt: 3,
};
```

with:

```ts
const inboxTask: Task = {
  id: "1",
  text: "ще не розкладено",
  status: "inbox",
  done: false,
  createdAt: 1,
  priority: "medium",
  estimatedMinutes: null,
  deadline: null,
};
const todayTask: Task = {
  id: "2",
  text: "купити молоко",
  status: "today",
  done: false,
  createdAt: 2,
  priority: "low",
  estimatedMinutes: 15,
  deadline: null,
};
const doneTask: Task = {
  id: "3",
  text: "вже зроблено",
  status: "today",
  done: true,
  createdAt: 3,
  priority: "medium",
  estimatedMinutes: null,
  deadline: null,
};
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tasks.ts src/lib/tasks.test.ts src/app/inbox/page.test.tsx src/app/today/page.test.tsx
git commit -m "feat: add priority/estimatedMinutes/deadline to the task model"
```

---

### Task 2: AI response sanitizer

**Files:**
- Create: `src/lib/parseTasksResponse.ts`
- Test: `src/lib/parseTasksResponse.test.ts`

**Interfaces:**
- Consumes: `ParsedTask`, `TaskPriority` from `@/lib/tasks` (Task 1).
- Produces: `sanitizeParsedTasks(raw: unknown): ParsedTask[]`. Task 3 imports this from `@/lib/parseTasksResponse`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/parseTasksResponse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeParsedTasks } from "./parseTasksResponse";

describe("sanitizeParsedTasks", () => {
  it("returns an empty array when raw is not an object", () => {
    expect(sanitizeParsedTasks(null)).toEqual([]);
    expect(sanitizeParsedTasks("oops")).toEqual([]);
  });

  it("returns an empty array when tasks is missing or not an array", () => {
    expect(sanitizeParsedTasks({})).toEqual([]);
    expect(sanitizeParsedTasks({ tasks: "oops" })).toEqual([]);
  });

  it("passes through a fully valid task", () => {
    expect(
      sanitizeParsedTasks({
        tasks: [
          {
            text: "Купити молоко",
            priority: "high",
            estimatedMinutes: 15,
            deadline: "2026-07-25",
          },
        ],
      })
    ).toEqual([
      { text: "Купити молоко", priority: "high", estimatedMinutes: 15, deadline: "2026-07-25" },
    ]);
  });

  it("skips non-object items", () => {
    expect(sanitizeParsedTasks({ tasks: ["oops", 5, null] })).toEqual([]);
  });

  it("skips items with an empty or missing text", () => {
    expect(
      sanitizeParsedTasks({
        tasks: [
          { text: "   ", priority: "medium", estimatedMinutes: null, deadline: null },
          { priority: "medium", estimatedMinutes: null, deadline: null },
        ],
      })
    ).toEqual([]);
  });

  it("trims text", () => {
    expect(
      sanitizeParsedTasks({
        tasks: [
          { text: "  Купити молоко  ", priority: "medium", estimatedMinutes: null, deadline: null },
        ],
      })
    ).toEqual([
      { text: "Купити молоко", priority: "medium", estimatedMinutes: null, deadline: null },
    ]);
  });

  it("defaults an invalid or missing priority to medium", () => {
    const result = sanitizeParsedTasks({
      tasks: [
        { text: "a", priority: "urgent", estimatedMinutes: null, deadline: null },
        { text: "b", estimatedMinutes: null, deadline: null },
      ],
    });
    expect(result[0].priority).toBe("medium");
    expect(result[1].priority).toBe("medium");
  });

  it("defaults a negative or non-numeric estimatedMinutes to null", () => {
    const result = sanitizeParsedTasks({
      tasks: [
        { text: "a", priority: "low", estimatedMinutes: -5, deadline: null },
        { text: "b", priority: "low", estimatedMinutes: "15", deadline: null },
      ],
    });
    expect(result[0].estimatedMinutes).toBeNull();
    expect(result[1].estimatedMinutes).toBeNull();
  });

  it("clamps estimatedMinutes above 480 down to 480", () => {
    const result = sanitizeParsedTasks({
      tasks: [{ text: "a", priority: "low", estimatedMinutes: 600, deadline: null }],
    });
    expect(result[0].estimatedMinutes).toBe(480);
  });

  it("defaults an invalid deadline format to null", () => {
    const result = sanitizeParsedTasks({
      tasks: [
        { text: "a", priority: "low", estimatedMinutes: null, deadline: "tomorrow" },
        { text: "b", priority: "low", estimatedMinutes: null, deadline: "25-07-2026" },
      ],
    });
    expect(result[0].deadline).toBeNull();
    expect(result[1].deadline).toBeNull();
  });

  it("keeps a valid deadline unchanged", () => {
    const result = sanitizeParsedTasks({
      tasks: [{ text: "a", priority: "low", estimatedMinutes: null, deadline: "2026-07-25" }],
    });
    expect(result[0].deadline).toBe("2026-07-25");
  });

  it("truncates to 50 tasks", () => {
    const tasks = Array.from({ length: 60 }, (_, index) => ({
      text: `Task ${index}`,
      priority: "medium",
      estimatedMinutes: null,
      deadline: null,
    }));
    expect(sanitizeParsedTasks({ tasks })).toHaveLength(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/parseTasksResponse.test.ts`
Expected: FAIL — `Cannot find module './parseTasksResponse'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/parseTasksResponse.ts`:

```ts
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
  return Number.isNaN(parsed.getTime()) ? null : value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/parseTasksResponse.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parseTasksResponse.ts src/lib/parseTasksResponse.test.ts
git commit -m "feat: add AI response sanitizer for parsed tasks"
```

---

### Task 3: `/api/parse-tasks` Route Handler

**Files:**
- Create: `src/app/api/parse-tasks/route.ts`
- Test: `src/app/api/parse-tasks/route.test.ts`

**Interfaces:**
- Consumes: `sanitizeParsedTasks` from `@/lib/parseTasksResponse` (Task 2); `ParsedTask` type from `@/lib/tasks` (Task 1).
- Produces: `POST(request: Request): Promise<Response>` at route `/api/parse-tasks`. Response contract: `200 { tasks: ParsedTask[] }` on success, `{ error: string }` with a `4xx`/`5xx` status on failure. Task 5 (Capture screen) calls this route via `fetch("/api/parse-tasks", { method: "POST", body: JSON.stringify({ text }) })`.

This project uses Next.js 16, which may differ from your training data — Route Handlers here follow the standard Web `Request`/`Response` API (`export async function POST(request: Request) { ... return Response.json(data, { status }) }`), confirmed against `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` in this repo.

Note: this test file uses the global `fetch`/`Request`/`Response` (Node/undici globals, not jsdom-provided) — the same globals prior tasks in this project have relied on for `crypto.randomUUID()`. If these are unexpectedly unavailable in the Vitest environment, stop and report it rather than working around it blindly.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/parse-tasks/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/parse-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function toolCallResponse(toolArguments: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: "extract_tasks",
                  arguments: JSON.stringify(toolArguments),
                },
              },
            ],
          },
        },
      ],
    }),
    { status: 200 }
  );
}

describe("POST /api/parse-tasks", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns sanitized tasks on a successful tool call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        toolCallResponse({
          tasks: [
            {
              text: "Купити молоко",
              priority: "high",
              estimatedMinutes: 10,
              deadline: "2026-07-21",
            },
            { text: "  ", priority: "low", estimatedMinutes: 5, deadline: null },
          ],
        })
      )
    );

    const response = await POST(makeRequest({ text: "купити молоко терміново" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual([
      { text: "Купити молоко", priority: "high", estimatedMinutes: 10, deadline: "2026-07-21" },
    ]);
  });

  it("returns 400 when text is missing", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 400 when text is blank", async () => {
    const response = await POST(makeRequest({ text: "   " }));
    expect(response.status).toBe(400);
  });

  it("returns 500 when OPENROUTER_API_KEY is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(500);
  });

  it("returns 502 when the upstream request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }))
    );
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the model did not call the tool", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "no tool call" } }] }),
          { status: 200 }
        )
      )
    );
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the tool arguments are not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    { function: { name: "extract_tasks", arguments: "{not json" } },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )
    );
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/api/parse-tasks/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/parse-tasks/route.ts`:

```ts
import { sanitizeParsedTasks } from "@/lib/parseTasksResponse";
import type { ParsedTask } from "@/lib/tasks";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-4.5";

const EXTRACT_TASKS_TOOL = {
  type: "function",
  function: {
    name: "extract_tasks",
    description:
      "Split a stream-of-consciousness text dump into individual, clearly worded tasks, each with a priority, an estimated duration in minutes, and a deadline.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description:
                  "A single, clearly worded task, starting with a capital letter, with filler words and dictation typos cleaned up.",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high"],
                description:
                  "How urgent/important the task sounds. Default to medium if unclear.",
              },
              estimatedMinutes: {
                type: ["number", "null"],
                description:
                  "Estimated minutes to complete the task, or null if it cannot be reasonably estimated.",
              },
              deadline: {
                type: ["string", "null"],
                description:
                  "Deadline in YYYY-MM-DD format, inferred from explicit or implicit urgency in the text, or null if there truly is none.",
              },
            },
            required: ["text", "priority", "estimatedMinutes", "deadline"],
          },
        },
      },
      required: ["tasks"],
    },
  },
} as const;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text =
    body &&
    typeof body === "object" &&
    typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";

  if (text.length === 0) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Server is not configured" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `Today's date is ${today}. Extract tasks from the user's message using the extract_tasks tool. Respond only by calling the tool.`,
          },
          { role: "user", content: text },
        ],
        tools: [EXTRACT_TASKS_TOOL],
        tool_choice: { type: "function", function: { name: "extract_tasks" } },
      }),
    });
  } catch {
    return Response.json({ error: "Upstream request failed" }, { status: 502 });
  }

  if (!upstreamResponse.ok) {
    return Response.json({ error: "Upstream request failed" }, { status: 502 });
  }

  let upstreamData: unknown;
  try {
    upstreamData = await upstreamResponse.json();
  } catch {
    return Response.json({ error: "Invalid upstream response" }, { status: 502 });
  }

  const toolArguments = extractToolArguments(upstreamData);
  if (toolArguments === null) {
    return Response.json(
      { error: "Model did not return structured tasks" },
      { status: 502 }
    );
  }

  const tasks: ParsedTask[] = sanitizeParsedTasks(toolArguments);
  return Response.json({ tasks }, { status: 200 });
}

function extractToolArguments(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;

  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const message = (choices[0] as { message?: unknown })?.message;
  if (!message || typeof message !== "object") return null;

  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;

  const fn = (toolCalls[0] as { function?: unknown })?.function;
  const args = (fn as { arguments?: unknown })?.arguments;
  if (typeof args !== "string") return null;

  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/api/parse-tasks/route.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Run the full suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS; build output lists `/api/parse-tasks` as a route (dynamic, since it's a `POST`-only handler with no static export).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/parse-tasks/route.ts src/app/api/parse-tasks/route.test.ts
git commit -m "feat: add /api/parse-tasks Route Handler calling OpenRouter"
```

---

### Task 4: `useTasks().addParsedTasks`

**Files:**
- Modify: `src/hooks/useTasks.tsx`
- Modify: `src/hooks/useTasks.test.tsx`

**Interfaces:**
- Consumes: `createTaskFromParsed`, `ParsedTask` from `@/lib/tasks` (Task 1).
- Produces: `useTasks()` now also returns `addParsedTasks: (parsed: ParsedTask[]) => void`. Task 5 (Capture screen) calls this.

- [ ] **Step 1: Write the failing tests**

In `src/hooks/useTasks.test.tsx`, insert these three `it` blocks immediately after the existing `"removes a task"` test (before `"persists changes to localStorage"`):

```tsx
  it("adds tasks with AI-provided metadata", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addParsedTasks([
        {
          text: "Купити молоко",
          priority: "high",
          estimatedMinutes: 10,
          deadline: "2026-07-25",
        },
      ]);
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({
      text: "Купити молоко",
      status: "inbox",
      done: false,
      priority: "high",
      estimatedMinutes: 10,
      deadline: "2026-07-25",
    });
  });

  it("ignores parsed items with empty text", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addParsedTasks([
        { text: "   ", priority: "medium", estimatedMinutes: null, deadline: null },
      ]);
    });

    expect(result.current.tasks).toEqual([]);
  });

  it("gives line-split tasks default metadata", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });

    expect(result.current.tasks[0]).toMatchObject({
      priority: "medium",
      estimatedMinutes: null,
      deadline: null,
    });
  });

```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/hooks/useTasks.test.tsx`
Expected: FAIL — `result.current.addParsedTasks is not a function` (the third new test passes already, since it only exercises existing behavior — that's fine, only the first two must fail).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/hooks/useTasks.tsx`:

```tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createTask,
  createTaskFromParsed,
  loadTasks,
  parseCaptureText,
  saveTasks,
  type ParsedTask,
  type Task,
} from "@/lib/tasks";

interface TasksContextValue {
  tasks: Task[];
  addTasksFromText: (text: string) => void;
  addParsedTasks: (parsed: ParsedTask[]) => void;
  moveToToday: (id: string) => void;
  toggleDone: (id: string) => void;
  removeTask: (id: string) => void;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Reading localStorage must happen post-mount so the first client render
    // matches the server's empty-array render and avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(loadTasks());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveTasks(tasks);
  }, [tasks, hydrated]);

  function addTasksFromText(text: string) {
    const lines = parseCaptureText(text);
    if (lines.length === 0) return;
    setTasks((prev) => [...prev, ...lines.map(createTask)]);
  }

  function addParsedTasks(parsed: ParsedTask[]) {
    const valid = parsed.filter((item) => item.text.trim().length > 0);
    if (valid.length === 0) return;
    setTasks((prev) => [...prev, ...valid.map(createTaskFromParsed)]);
  }

  function moveToToday(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, status: "today" as const } : task
      )
    );
  }

  function toggleDone(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    );
  }

  function removeTask(id: string) {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }

  return (
    <TasksContext.Provider
      value={{
        tasks,
        addTasksFromText,
        addParsedTasks,
        moveToToday,
        toggleDone,
        removeTask,
      }}
    >
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks(): TasksContextValue {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return context;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/hooks/useTasks.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTasks.tsx src/hooks/useTasks.test.tsx
git commit -m "feat: add addParsedTasks to TasksProvider"
```

---

### Task 5: Capture screen calls the AI route, falls back silently

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `useTasks().addTasksFromText` (existing) and `useTasks().addParsedTasks` (Task 4); calls `POST /api/parse-tasks` (Task 3) expecting `{ tasks: ParsedTask[] }` on success.
- Produces: updated `CapturePage` behavior — no new exports for other tasks to consume (this is the last task that touches the request/fallback flow).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "./page";

const { addTasksFromText, addParsedTasks, useSpeechRecognitionMock } = vi.hoisted(
  () => ({
    addTasksFromText: vi.fn(),
    addParsedTasks: vi.fn(),
    useSpeechRecognitionMock: vi.fn(),
  })
);

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({ addTasksFromText, addParsedTasks }),
}));

vi.mock("@/hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: (onResult: (text: string) => void) =>
    useSpeechRecognitionMock(onResult),
}));

describe("CapturePage", () => {
  beforeEach(() => {
    addTasksFromText.mockClear();
    addParsedTasks.mockClear();
    useSpeechRecognitionMock.mockReset();
    useSpeechRecognitionMock.mockReturnValue({
      isSupported: true,
      isListening: false,
      start: vi.fn(),
      stop: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds AI-parsed tasks and clears the field on a successful parse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              text: "Купити молоко",
              priority: "medium",
              estimatedMinutes: null,
              deadline: null,
            },
          ],
        }),
      })
    );
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addParsedTasks).toHaveBeenCalledWith([
        {
          text: "Купити молоко",
          priority: "medium",
          estimatedMinutes: null,
          deadline: null,
        },
      ])
    );
    expect(addTasksFromText).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("");
  });

  it("falls back to line-splitting when the parse request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addTasksFromText).toHaveBeenCalledWith("купити молоко")
    );
    expect(addParsedTasks).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("");
  });

  it("falls back to line-splitting when the server responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) })
    );
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addTasksFromText).toHaveBeenCalledWith("купити молоко")
    );
  });

  it("falls back to line-splitting when the response payload has no tasks array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ oops: true }) })
    );
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    await waitFor(() =>
      expect(addTasksFromText).toHaveBeenCalledWith("купити молоко")
    );
  });

  it("disables Додати and shows a loading label while the request is in flight", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    expect(screen.getByRole("button", { name: "Розбираю…" })).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({ tasks: [] }) });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Додати" })).toBeInTheDocument()
    );
  });

  it("disables Додати while the field is empty", () => {
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/page.test.tsx`
Expected: FAIL — the current `page.tsx` calls `addTasksFromText` directly with no `fetch` call, so the AI-success and fallback tests fail, and `addParsedTasks`/loading-label tests fail too.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { ParsedTask } from "@/lib/tasks";

const PARSE_TIMEOUT_MS = 15000;

export default function CapturePage() {
  const { addTasksFromText, addParsedTasks } = useTasks();
  const [text, setText] = useState("");
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isSupported, isListening, start, stop } = useSpeechRecognition(
    (transcript) => {
      setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
    }
  );

  async function handleAdd() {
    const currentText = text;
    if (currentText.trim().length === 0) return;

    setIsSubmitting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    try {
      const response = await fetch("/api/parse-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentText }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("parse-tasks request failed");

      const data: unknown = await response.json();
      const tasks =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { tasks?: unknown }).tasks)
          ? ((data as { tasks: ParsedTask[] }).tasks)
          : null;

      if (tasks === null) throw new Error("parse-tasks returned an invalid payload");

      addParsedTasks(tasks);
    } catch {
      addTasksFromText(currentText);
    } finally {
      clearTimeout(timeoutId);
      setIsSubmitting(false);
      setText("");
    }
  }

  function handleMicClick() {
    if (!isSupported) {
      setMicMessage(
        "Диктування не підтримується в цьому браузері, введи текст вручну"
      );
      return;
    }
    setMicMessage(null);
    if (isListening) {
      stop();
    } else {
      start();
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100dvh-5rem)] flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Що в голові?</h1>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Що в голові?"
        aria-label="Що в голові?"
        className="flex-1 w-full resize-none rounded-2xl border border-black/10 bg-white p-4 text-lg leading-relaxed outline-none focus:border-black/30 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
      />
      {micMessage && (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
          {micMessage}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleMicClick}
          aria-pressed={isListening}
          aria-label="Диктувати"
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl ${
            isListening
              ? "bg-red-500 text-white"
              : "bg-zinc-100 text-black dark:bg-zinc-800 dark:text-white"
          }`}
        >
          🎤
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={text.trim().length === 0 || isSubmitting}
          className="h-16 flex-1 rounded-full bg-black text-lg font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
        >
          {isSubmitting ? "Розбираю…" : "Додати"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/page.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: Capture screen calls AI parsing with silent fallback"
```

---

### Task 6: Render priority/time/deadline in Inbox and Today

**Files:**
- Modify: `src/app/inbox/page.tsx`
- Modify: `src/app/inbox/page.test.tsx`
- Modify: `src/app/today/page.tsx`
- Modify: `src/app/today/page.test.tsx`

**Interfaces:**
- Consumes: `formatTaskMeta` from `@/lib/tasks` (Task 1).
- Produces: no new exports — this is the last task in the sequence.

- [ ] **Step 1: Write the failing tests**

In `src/app/inbox/page.test.tsx`, insert this test immediately after `"renders only inbox tasks"`:

```tsx
  it("renders the priority/time/deadline metadata line", () => {
    tasksMock.mockReturnValue([inboxTask]);
    render(<InboxPage />);
    expect(screen.getByText("🔴 · ~15 хв · 25.07")).toBeInTheDocument();
  });

```

In `src/app/today/page.test.tsx`, insert this test immediately after `"renders only today tasks"`:

```tsx
  it("renders the priority/time/deadline metadata line", () => {
    tasksMock.mockReturnValue([todayTask]);
    render(<TodayPage />);
    expect(screen.getByText("🟢 · ~15 хв")).toBeInTheDocument();
  });

```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/inbox/page.test.tsx src/app/today/page.test.tsx`
Expected: FAIL — neither page currently renders a metadata line.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/app/inbox/page.tsx`:

```tsx
"use client";

import { formatTaskMeta } from "@/lib/tasks";
import { useTasks } from "@/hooks/useTasks";

export default function InboxPage() {
  const { tasks, moveToToday, removeTask } = useTasks();
  const inboxTasks = tasks.filter((task) => task.status === "inbox");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      {inboxTasks.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          Тут з&apos;являться твої задачі
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {inboxTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
            >
              <div className="flex-1">
                <span className="block text-lg">{task.text}</span>
                <span className="block text-sm text-zinc-500 dark:text-zinc-400">
                  {formatTaskMeta(task)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => moveToToday(task.id)}
                className="h-12 rounded-full bg-black px-4 text-sm font-medium text-white dark:bg-white dark:text-black"
              >
                → Сьогодні
              </button>
              <button
                type="button"
                onClick={() => removeTask(task.id)}
                aria-label="Видалити"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-xl dark:bg-zinc-800"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Replace the full contents of `src/app/today/page.tsx`:

```tsx
"use client";

import { formatTaskMeta } from "@/lib/tasks";
import { useTasks } from "@/hooks/useTasks";

export default function TodayPage() {
  const { tasks, toggleDone, removeTask } = useTasks();
  const todayTasks = tasks.filter((task) => task.status === "today");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Today</h1>
      {todayTasks.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          Тут з&apos;являться задачі на сьогодні
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {todayTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
            >
              <button
                type="button"
                onClick={() => toggleDone(task.id)}
                aria-pressed={task.done}
                aria-label={
                  task.done ? "Позначити незробленою" : "Позначити зробленою"
                }
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 ${
                  task.done
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/30 dark:border-white/30"
                }`}
              >
                {task.done ? "✓" : ""}
              </button>
              <div className="flex-1">
                <span
                  className={`block text-lg ${
                    task.done ? "text-zinc-400 line-through" : ""
                  }`}
                >
                  {task.text}
                </span>
                <span className="block text-sm text-zinc-500 dark:text-zinc-400">
                  {formatTaskMeta(task)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeTask(task.id)}
                aria-label="Видалити"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-xl dark:bg-zinc-800"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/inbox/page.test.tsx src/app/today/page.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/inbox/page.tsx src/app/inbox/page.test.tsx src/app/today/page.tsx src/app/today/page.test.tsx
git commit -m "feat: render priority/time/deadline metadata in Inbox and Today"
```

---

### Task 7: Full verification pass

**Files:** none created — this task runs checks across everything built in Tasks 1-6.

**Interfaces:**
- Consumes: the entire feature.
- Produces: confidence that lint, the full test suite, the production build, and a real (non-mocked) OpenRouter call all work end-to-end.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every test file from Tasks 1-6 PASSes, 0 failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, `/api/parse-tasks` listed among the routes.

- [ ] **Step 4: Real end-to-end check against OpenRouter (not mocked)**

All automated tests mock `fetch` — this step is the first real call to OpenRouter with the actual `OPENROUTER_API_KEY`.

Create `.env.local` in the project root (already covered by `.gitignore`) if it doesn't exist, with:

```
OPENROUTER_API_KEY=<the real key from Vercel/OpenRouter>
```

Run: `npm run dev`

In a second terminal:

```bash
curl -s -X POST http://localhost:3000/api/parse-tasks \
  -H "Content-Type: application/json" \
  -d '{"text":"терміново подзвонити в банк\nколись помити вікна\nзабрати посилку завтра"}' | head -c 2000
```

Expected: HTTP 200 with a JSON body like `{"tasks":[{"text":"Подзвонити в банк","priority":"high",...},...]}` — 3 tasks, varied priorities, at least one with a non-null `deadline` (the "завтра" one).

- [ ] **Step 5: Manual walkthrough in a mobile viewport**

With `npm run dev` still running, open `http://localhost:3000` in a mobile-width viewport and walk through the design spec's checklist (`docs/superpowers/specs/2026-07-20-ai-task-parsing-design.md` §7):

1. Type multiple sentences with varied urgency on Capture, tap "Додати" → tasks appear in Inbox with different priority dots and, where appropriate, a deadline.
2. Dictate via the mic button → resulting tasks still get metadata after AI parsing.
3. In DevTools, go offline, tap "Додати" → tasks still appear (fallback line-split, `medium` priority, no deadline), no error shown.
4. Confirm the metadata line under each task doesn't break the layout or crowd the buttons on a narrow screen.

Stop the dev server (`Ctrl+C`) once done.

- [ ] **Step 6: Commit if anything was fixed during the walkthrough**

If Steps 4-5 surfaced no code changes, skip this step. Otherwise:

```bash
git add -A
git commit -m "fix: address issues found in AI parsing end-to-end walkthrough"
```

---

## After This Plan

Pushing to `main` and then to `https://github.com/knowely/ai-day-planner-.git` triggers Vercel's existing auto-deploy, which already has `OPENROUTER_API_KEY` configured. Push is a separate, explicit-confirmation step — not part of this plan's tasks.
