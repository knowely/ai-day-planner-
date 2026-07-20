# Фаза B: авто-формування Today, онбординг, порожні екрани Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let AI form the Today list from the Inbox backlog (respecting priority/deadline/time budget), show a one-time onboarding overlay explaining the app, and replace bare empty-state text with helpful copy and actions across Capture/Inbox/Today.

**Architecture:** A new Route Handler (`/api/plan-day`) mirrors `/api/parse-tasks`'s OpenRouter tool-calling pattern exactly — same model, same defensive request/response handling, same "sanitize against a known-good set" trust boundary (here, the backlog ids the server itself sent out). A new `applyDayPlan` mutator on the existing `TasksProvider` moves selected backlog tasks to Today, prepending them. Onboarding is a self-contained overlay component gated by a `localStorage` flag, mounted only on the Capture screen (where "Почати" always leads) using the same post-mount hydration-safe pattern already used for task loading. Empty states are pure UI/copy changes to already-existing pages.

**Tech Stack:** Next.js 16 (App Router Route Handlers), TypeScript, Tailwind CSS, Vitest + React Testing Library. No new npm dependencies.

## Global Constraints

- OpenRouter endpoint: `https://openrouter.ai/api/v1/chat/completions`, model `anthropic/claude-haiku-4.5` — same as `src/app/api/parse-tasks/route.ts`.
- `OPENROUTER_API_KEY` read only via `process.env` inside `src/app/api/plan-day/route.ts`, never exposed to the client — same rule as every existing route.
- Structured output via tool calling (function `plan_day`), not free-text JSON — matches the project's established "don't trust the model" pattern from Phase A.
- Server validates every returned id against the backlog ids it actually sent — unknown/duplicate ids are dropped, order is preserved.
- Time budget guidance to the model: ~360 minutes (6 hours) of estimated work, used as guidance not a hard cap.
- On `/api/plan-day` failure (network, timeout, bad response) — show an error message, **do not** change any task state. No silent fallback exists for "which tasks go today" (unlike Phase A's line-split fallback for text parsing).
- Re-running "Сформувати день" **adds** newly-selected backlog tasks on top of whatever Today already contains (manual or previous AI picks) — never removes or reorders existing Today tasks.
- `localStorage` key for onboarding: `ai-day-planner:onboarding-seen` (same `ai-day-planner:` namespace as `ai-day-planner:tasks`).
- Onboarding lives only on the Capture screen (`src/app/page.tsx`), not in the root layout — no cross-page navigation/focus signaling needed.
- All new client-side state that reads `localStorage` must follow the existing hydration-safe pattern: start with the value that matches server render, read the real value only inside a post-mount `useEffect`.
- Exact UI copy (verbatim, do not paraphrase):
  - Capture hint (only when the field is empty and no other status message is showing): `Натисни 🎤 і просто проговори все, що треба зробити.` then on a new line `Напр.: «Завтра прибрати квартиру, це важливо, десь година. І зібрати валізу.»`
  - Inbox empty state: `Inbox поки порожній. Тут з'являться задачі, щойно ти щось надиктуєш.` with a `← У Capture` link to `/`.
  - Today empty + empty backlog: `Спершу додай задачі в Inbox — і AI складе твій день.`
  - Today empty + backlog has tasks: `У беклозі {N} задач.`
  - Today plan button: `✨ Сформувати день`, loading label `AI планує твій день…`, error message `Не вдалося скласти план, спробуй ще раз.`
  - Onboarding heading: `Плануй день голосом`; subheading: `Надиктуй усе, що в голові. AI розкладе це на задачі — з пріоритетом, часом і дедлайном — і сам складе твій план на сьогодні.`; button `Почати`.

---

## File Structure

```
ai-day-planner/
├── src/
│   ├── lib/
│   │   ├── planDayResponse.ts        # new — sanitizePlanDayResponse (pure validation)
│   │   ├── planDayResponse.test.ts   # new
│   │   ├── onboarding.ts             # new — hasSeenOnboarding/markOnboardingSeen
│   │   └── onboarding.test.ts        # new
│   ├── hooks/
│   │   ├── useTasks.tsx              # modify — add applyDayPlan
│   │   └── useTasks.test.tsx         # modify
│   ├── components/
│   │   ├── OnboardingOverlay.tsx     # new — presentational, 3-card grid + Почати button
│   │   └── OnboardingOverlay.test.tsx # new
│   └── app/
│       ├── api/
│       │   └── plan-day/
│       │       ├── route.ts          # new — POST handler, calls OpenRouter
│       │       └── route.test.ts     # new
│       ├── page.tsx                  # modify — mount OnboardingOverlay, empty-field hint
│       ├── page.test.tsx             # modify
│       ├── inbox/
│       │   ├── page.tsx              # modify — richer empty state + Capture link
│       │   └── page.test.tsx         # modify
│       └── today/
│           ├── page.tsx              # modify — "Сформувати день" button + empty states
│           └── page.test.tsx         # modify
```

---

### Task 1: AI plan-day response sanitizer

**Files:**
- Create: `src/lib/planDayResponse.ts`
- Test: `src/lib/planDayResponse.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sanitizePlanDayResponse(raw: unknown, validIds: Set<string>): string[]`. Task 2 imports this from `@/lib/planDayResponse`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/planDayResponse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizePlanDayResponse } from "./planDayResponse";

describe("sanitizePlanDayResponse", () => {
  it("returns an empty array when raw is not an object", () => {
    expect(sanitizePlanDayResponse(null, new Set(["1"]))).toEqual([]);
    expect(sanitizePlanDayResponse("oops", new Set(["1"]))).toEqual([]);
  });

  it("returns an empty array when taskIds is missing or not an array", () => {
    expect(sanitizePlanDayResponse({}, new Set(["1"]))).toEqual([]);
    expect(sanitizePlanDayResponse({ taskIds: "oops" }, new Set(["1"]))).toEqual([]);
  });

  it("keeps only ids present in validIds, preserving order", () => {
    const validIds = new Set(["a", "b", "c"]);
    expect(sanitizePlanDayResponse({ taskIds: ["b", "a", "z"] }, validIds)).toEqual([
      "b",
      "a",
    ]);
  });

  it("drops non-string entries", () => {
    const validIds = new Set(["a"]);
    expect(sanitizePlanDayResponse({ taskIds: ["a", 5, null] }, validIds)).toEqual([
      "a",
    ]);
  });

  it("dedupes, keeping the first occurrence", () => {
    const validIds = new Set(["a", "b"]);
    expect(sanitizePlanDayResponse({ taskIds: ["a", "b", "a"] }, validIds)).toEqual([
      "a",
      "b",
    ]);
  });

  it("returns an empty array when validIds is empty", () => {
    expect(sanitizePlanDayResponse({ taskIds: ["a"] }, new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/planDayResponse.test.ts`
Expected: FAIL — `Cannot find module './planDayResponse'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/planDayResponse.ts`:

```ts
export function sanitizePlanDayResponse(
  raw: unknown,
  validIds: Set<string>
): string[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { taskIds?: unknown }).taskIds)
  ) {
    return [];
  }

  const rawIds = (raw as { taskIds: unknown[] }).taskIds;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of rawIds) {
    if (typeof id !== "string") continue;
    if (!validIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/planDayResponse.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planDayResponse.ts src/lib/planDayResponse.test.ts
git commit -m "feat: add sanitizer for AI day-plan responses"
```

---

### Task 2: `/api/plan-day` Route Handler

**Files:**
- Create: `src/app/api/plan-day/route.ts`
- Test: `src/app/api/plan-day/route.test.ts`

**Interfaces:**
- Consumes: `sanitizePlanDayResponse` from `@/lib/planDayResponse` (Task 1).
- Produces: `POST(request: Request): Promise<Response>` at route `/api/plan-day`. Request contract: `{ backlog: Array<{ id: string; text: string; priority: string; estimatedMinutes: number | null; deadline: string | null }> }`. Response contract: `200 { taskIds: string[] }` on success, `{ error: string }` with a `4xx`/`5xx` status on failure. Task 7 (Today screen) calls this route.

This project uses Next.js 16, which may differ from your training data in places — Route Handlers here follow the standard Web `Request`/`Response` API (`export async function POST(request: Request) { ... return Response.json(data, { status }) }`), already used in `src/app/api/parse-tasks/route.ts` and `src/app/api/transcribe/route.ts` in this repo — read either as a reference if anything is unclear.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/plan-day/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/plan-day", {
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
                  name: "plan_day",
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

const sampleBacklog = [
  {
    id: "1",
    text: "Купити молоко",
    priority: "high",
    estimatedMinutes: 15,
    deadline: "2026-07-20",
  },
  {
    id: "2",
    text: "Помити вікна",
    priority: "low",
    estimatedMinutes: 60,
    deadline: null,
  },
];

describe("POST /api/plan-day", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns sanitized taskIds on a successful tool call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(toolCallResponse({ taskIds: ["1", "999", "1"] }))
    );

    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.taskIds).toEqual(["1"]);
  });

  it("returns 400 when backlog is missing", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 400 when backlog is an empty array", async () => {
    const response = await POST(makeRequest({ backlog: [] }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when backlog items are malformed", async () => {
    const response = await POST(makeRequest({ backlog: [{ oops: true }] }));
    expect(response.status).toBe(400);
  });

  it("returns 500 when OPENROUTER_API_KEY is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    expect(response.status).toBe(500);
  });

  it("returns 502 when the upstream request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }))
    );
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{not json", { status: 200 }))
    );
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
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
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    expect(response.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/api/plan-day/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/plan-day/route.ts`:

```ts
import { sanitizePlanDayResponse } from "@/lib/planDayResponse";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-4.5";
const TIME_BUDGET_MINUTES = 360;

interface BacklogItem {
  id: string;
  text: string;
  priority: string;
  estimatedMinutes: number | null;
  deadline: string | null;
}

const PLAN_DAY_TOOL = {
  type: "function",
  function: {
    name: "plan_day",
    description:
      "Select and order backlog tasks that should be done today, respecting priority, deadline urgency, and a total time budget.",
    parameters: {
      type: "object",
      properties: {
        taskIds: {
          type: "array",
          items: { type: "string" },
          description:
            "IDs of selected backlog tasks, in the order they should be tackled today.",
        },
      },
      required: ["taskIds"],
    },
  },
} as const;

function parseBacklog(body: unknown): BacklogItem[] | null {
  if (!body || typeof body !== "object") return null;
  const backlog = (body as { backlog?: unknown }).backlog;
  if (!Array.isArray(backlog) || backlog.length === 0) return null;

  const items: BacklogItem[] = [];
  for (const item of backlog) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.text !== "string") {
      return null;
    }
    items.push({
      id: candidate.id,
      text: candidate.text,
      priority: typeof candidate.priority === "string" ? candidate.priority : "medium",
      estimatedMinutes:
        typeof candidate.estimatedMinutes === "number" ? candidate.estimatedMinutes : null,
      deadline: typeof candidate.deadline === "string" ? candidate.deadline : null,
    });
  }
  return items;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const backlog = parseBacklog(body);
  if (backlog === null) {
    return Response.json({ error: "backlog is required" }, { status: 400 });
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
            content: `Today's date is ${today}. You are planning a realistic today-list from a backlog of tasks (given as JSON in the user message). Prefer higher priority and closer deadlines. Keep the total estimated time roughly under ${TIME_BUDGET_MINUTES} minutes, using judgement for tasks with no time estimate. Select and order the chosen tasks using the plan_day tool. Respond only by calling the tool.`,
          },
          { role: "user", content: JSON.stringify(backlog) },
        ],
        tools: [PLAN_DAY_TOOL],
        tool_choice: { type: "function", function: { name: "plan_day" } },
      }),
      signal: AbortSignal.timeout(12000),
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
      { error: "Model did not return a structured plan" },
      { status: 502 }
    );
  }

  const validIds = new Set(backlog.map((item) => item.id));
  const taskIds = sanitizePlanDayResponse(toolArguments, validIds);
  return Response.json({ taskIds }, { status: 200 });
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

Run: `npm test -- src/app/api/plan-day/route.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Run the full suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS; build output lists `/api/plan-day` as a route.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/plan-day/route.ts src/app/api/plan-day/route.test.ts
git commit -m "feat: add /api/plan-day Route Handler calling OpenRouter"
```

---

### Task 3: `useTasks().applyDayPlan`

**Files:**
- Modify: `src/hooks/useTasks.tsx`
- Modify: `src/hooks/useTasks.test.tsx`

**Interfaces:**
- Consumes: nothing new (uses the existing `Task` type).
- Produces: `useTasks()` now also returns `applyDayPlan: (orderedIds: string[]) => void`. Task 7 (Today screen) calls this.

- [ ] **Step 1: Write the failing tests**

In `src/hooks/useTasks.test.tsx`, insert these four `it` blocks immediately after the existing `"gives line-split tasks default metadata"` test (before `"persists changes to localStorage"`):

```tsx
  it("moves selected backlog tasks to today, in the given order, on top of existing tasks", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText(
        "купити молоко\nпомити вікна\nзабрати посилку"
      );
    });
    const [milk, windows, parcel] = result.current.tasks;

    act(() => {
      result.current.moveToToday(parcel.id);
    });

    act(() => {
      result.current.applyDayPlan([windows.id, milk.id]);
    });

    expect(result.current.tasks.map((t) => t.id)).toEqual([
      windows.id,
      milk.id,
      parcel.id,
    ]);
    expect(result.current.tasks[0].status).toBe("today");
    expect(result.current.tasks[1].status).toBe("today");
    expect(result.current.tasks[2].status).toBe("today");
  });

  it("ignores ids that are not in the current tasks", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const id = result.current.tasks[0].id;

    act(() => {
      result.current.applyDayPlan(["does-not-exist", id]);
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].status).toBe("today");
  });

  it("ignores ids for tasks that are already in today (no duplication)", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const id = result.current.tasks[0].id;

    act(() => {
      result.current.moveToToday(id);
    });
    act(() => {
      result.current.applyDayPlan([id]);
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].status).toBe("today");
  });

  it("does not change state when applyDayPlan selects nothing", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const before = result.current.tasks;

    act(() => {
      result.current.applyDayPlan([]);
    });

    expect(result.current.tasks).toBe(before);
  });

```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/hooks/useTasks.test.tsx`
Expected: FAIL — `result.current.applyDayPlan is not a function`.

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
  applyDayPlan: (orderedIds: string[]) => void;
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

  function applyDayPlan(orderedIds: string[]) {
    setTasks((prev) => {
      const byId = new Map(prev.map((task) => [task.id, task] as const));
      const selected: Task[] = [];
      const seen = new Set<string>();

      for (const id of orderedIds) {
        if (seen.has(id)) continue;
        const task = byId.get(id);
        if (!task || task.status !== "inbox") continue;
        seen.add(id);
        selected.push({ ...task, status: "today" as const });
      }

      if (selected.length === 0) return prev;

      const rest = prev.filter((task) => !seen.has(task.id));
      return [...selected, ...rest];
    });
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
        applyDayPlan,
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
git commit -m "feat: add applyDayPlan to TasksProvider"
```

---

### Task 4: `OnboardingOverlay` component

**Files:**
- Create: `src/components/OnboardingOverlay.tsx`
- Test: `src/components/OnboardingOverlay.test.tsx`

**Interfaces:**
- Consumes: nothing (presentational only).
- Produces: `OnboardingOverlay({ onStart }: { onStart: () => void })` — React component, named export. Task 5 imports this from `@/components/OnboardingOverlay` and provides `onStart`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/OnboardingOverlay.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/OnboardingOverlay.test.tsx`
Expected: FAIL — `Cannot find module './OnboardingOverlay'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/OnboardingOverlay.tsx`:

```tsx
"use client";

interface OnboardingOverlayProps {
  onStart: () => void;
}

const CARDS = [
  { icon: "✏️", label: "Capture", hint: "Наговори все" },
  { icon: "📥", label: "Inbox", hint: "AI розкладе" },
  { icon: "✅", label: "Today", hint: "Готовий план" },
] as const;

export function OnboardingOverlay({ onStart }: OnboardingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-center gap-8 bg-white p-6 dark:bg-black">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold">Плануй день голосом</h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400">
          Надиктуй усе, що в голові. AI розкладе це на задачі — з
          пріоритетом, часом і дедлайном — і сам складе твій план на
          сьогодні.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {CARDS.map((card) => (
          <div
            key={card.label}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-black/10 p-3 dark:border-white/10"
          >
            <span className="text-3xl" aria-hidden="true">
              {card.icon}
            </span>
            <span className="text-sm font-medium">{card.label}</span>
            <span className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              {card.hint}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onStart}
        className="h-16 rounded-full bg-black text-lg font-medium text-white dark:bg-white dark:text-black"
      >
        Почати
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/OnboardingOverlay.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/OnboardingOverlay.tsx src/components/OnboardingOverlay.test.tsx
git commit -m "feat: add OnboardingOverlay component"
```

---

### Task 5: Onboarding + empty-field hint on Capture screen

**Files:**
- Create: `src/lib/onboarding.ts`
- Test: `src/lib/onboarding.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `OnboardingOverlay` from `@/components/OnboardingOverlay` (Task 4).
- Produces: `hasSeenOnboarding(): boolean`, `markOnboardingSeen(): void` from `@/lib/onboarding` (used only within this task's `page.tsx` change). No new exports for later tasks.

- [ ] **Step 1: Write the failing tests for `src/lib/onboarding.ts`**

Create `src/lib/onboarding.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/onboarding.test.ts`
Expected: FAIL — `Cannot find module './onboarding'`.

- [ ] **Step 3: Write `src/lib/onboarding.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/onboarding.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Write the failing tests for the Capture screen changes**

In `src/app/page.test.tsx`, add `window.localStorage.setItem("ai-day-planner:onboarding-seen", "true");` as the **first line** of the existing top-level `beforeEach` (so the overlay never interferes with the existing tests):

```tsx
  beforeEach(() => {
    window.localStorage.setItem("ai-day-planner:onboarding-seen", "true");
    addTasksFromText.mockClear();
    addParsedTasks.mockClear();
    useAudioRecordingMock.mockReset();
    useAudioRecordingMock.mockReturnValue({
      isSupported: true,
      isRecording: false,
      isTranscribing: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
    });
  });
```

Then, still inside the existing `describe("CapturePage", () => { ... })` block, add these two nested `describe` blocks right before the closing `});` of the file:

```tsx

  describe("onboarding", () => {
    it("shows the onboarding overlay on first visit", async () => {
      window.localStorage.clear();
      render(<CapturePage />);
      await waitFor(() =>
        expect(screen.getByText("Плануй день голосом")).toBeInTheDocument()
      );
    });

    it("does not show the onboarding overlay once it has been seen", async () => {
      render(<CapturePage />);
      await waitFor(() => {
        expect(
          screen.queryByText("Плануй день голосом")
        ).not.toBeInTheDocument();
      });
    });

    it("hides the overlay, remembers the flag, and focuses the textarea when Почати is clicked", async () => {
      window.localStorage.clear();
      const user = userEvent.setup();
      render(<CapturePage />);

      await waitFor(() =>
        expect(screen.getByText("Плануй день голосом")).toBeInTheDocument()
      );
      await user.click(screen.getByRole("button", { name: "Почати" }));

      expect(screen.queryByText("Плануй день голосом")).not.toBeInTheDocument();
      expect(
        window.localStorage.getItem("ai-day-planner:onboarding-seen")
      ).toBe("true");
      expect(screen.getByLabelText("Що в голові?")).toHaveFocus();
    });
  });

  describe("empty-state hint", () => {
    it("shows the hint when the field is empty", () => {
      render(<CapturePage />);
      expect(
        screen.getByText(/Натисни 🎤 і просто проговори все/)
      ).toBeInTheDocument();
    });

    it("hides the hint once text is typed", async () => {
      const user = userEvent.setup();
      render(<CapturePage />);

      await user.type(screen.getByLabelText("Що в голові?"), "купити молоко");

      expect(
        screen.queryByText(/Натисни 🎤 і просто проговори все/)
      ).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- src/app/page.test.tsx`
Expected: FAIL — `page.tsx` doesn't render the overlay or the hint yet.

- [ ] **Step 7: Write the implementation**

Replace the full contents of `src/app/page.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { useAudioRecording } from "@/hooks/useAudioRecording";
import { hasSeenOnboarding, markOnboardingSeen } from "@/lib/onboarding";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import type { ParsedTask } from "@/lib/tasks";

const PARSE_TIMEOUT_MS = 15000;

const ERROR_MESSAGES: Record<string, string> = {
  "mic-permission-denied":
    "Немає доступу до мікрофона. Дозволь доступ у налаштуваннях браузера або введи текст вручну.",
  "transcribe-failed":
    "Не вдалося розпізнати мовлення. Спробуй ще раз або введи текст вручну.",
};

export default function CapturePage() {
  const { addTasksFromText, addParsedTasks } = useTasks();
  const [text, setText] = useState("");
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isSupported, isRecording, isTranscribing, error, start, stop } =
    useAudioRecording((transcript) => {
      setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
    });

  useEffect(() => {
    // Reading localStorage must happen post-mount so the first client render
    // matches the server's render (overlay hidden) and avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasSeenOnboarding()) setShowOnboarding(true);
  }, []);

  function handleOnboardingStart() {
    markOnboardingSeen();
    setShowOnboarding(false);
    textareaRef.current?.focus();
  }

  const statusMessage = isRecording
    ? "Записую…"
    : isTranscribing
      ? "Розпізнаю…"
      : null;

  const displayMessage =
    statusMessage ?? micMessage ?? (error ? ERROR_MESSAGES[error] : null);

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

      if (tasks === null || tasks.length === 0) {
        throw new Error("parse-tasks returned an invalid or empty payload");
      }

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
    if (isRecording) {
      stop();
    } else {
      void start();
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100dvh-5rem)] flex-col gap-4 p-4">
      {showOnboarding && <OnboardingOverlay onStart={handleOnboardingStart} />}
      <h1 className="text-2xl font-semibold">Що в голові?</h1>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Що в голові?"
        aria-label="Що в голові?"
        className="flex-1 w-full resize-none rounded-2xl border border-black/10 bg-white p-4 text-lg leading-relaxed outline-none focus:border-black/30 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
      />
      {displayMessage && (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
          {displayMessage}
        </p>
      )}
      {text.trim().length === 0 && !displayMessage && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Натисни 🎤 і просто проговори все, що треба зробити.
          <br />
          Напр.: «Завтра прибрати квартиру, це важливо, десь година. І
          зібрати валізу.»
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleMicClick}
          disabled={isTranscribing}
          aria-pressed={isRecording}
          aria-label="Диктувати"
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl disabled:opacity-30 ${
            isRecording
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

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -- src/app/page.test.tsx`
Expected: all tests PASS.

- [ ] **Step 9: Run the full suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/onboarding.ts src/lib/onboarding.test.ts src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: add one-time onboarding overlay and empty-field hint to Capture"
```

---

### Task 6: Inbox empty state

**Files:**
- Modify: `src/app/inbox/page.tsx`
- Modify: `src/app/inbox/page.test.tsx`

**Interfaces:**
- Consumes: nothing new (`next/link`'s `Link`, already used in `BottomNav.tsx`).
- Produces: no new exports — last task touching this file in this plan.

- [ ] **Step 1: Write the failing test**

In `src/app/inbox/page.test.tsx`, replace:

```tsx
  it("shows a placeholder when there are no inbox tasks", () => {
    tasksMock.mockReturnValue([todayTask]);
    render(<InboxPage />);
    expect(screen.getByText("Тут з'являться твої задачі")).toBeInTheDocument();
  });
```

with:

```tsx
  it("shows the empty-state message and a link back to Capture when there are no inbox tasks", () => {
    tasksMock.mockReturnValue([todayTask]);
    render(<InboxPage />);
    expect(
      screen.getByText(
        "Inbox поки порожній. Тут з'являться задачі, щойно ти щось надиктуєш."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← У Capture" })).toHaveAttribute(
      "href",
      "/"
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/inbox/page.test.tsx`
Expected: FAIL — current empty-state text doesn't match, no link exists yet.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/app/inbox/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { formatTaskMeta } from "@/lib/tasks";
import { useTasks } from "@/hooks/useTasks";

export default function InboxPage() {
  const { tasks, moveToToday, removeTask } = useTasks();
  const inboxTasks = tasks.filter((task) => task.status === "inbox");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      {inboxTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="text-4xl" aria-hidden="true">
            📥
          </span>
          <p className="text-zinc-500 dark:text-zinc-400">
            Inbox поки порожній. Тут з&apos;являться задачі, щойно ти щось
            надиктуєш.
          </p>
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-full bg-black px-6 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            ← У Capture
          </Link>
        </div>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/inbox/page.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/inbox/page.tsx src/app/inbox/page.test.tsx
git commit -m "feat: richer Inbox empty state with link back to Capture"
```

---

### Task 7: Today screen — "Сформувати день" button + empty states

**Files:**
- Modify: `src/app/today/page.tsx`
- Modify: `src/app/today/page.test.tsx`

**Interfaces:**
- Consumes: `useTasks().applyDayPlan` (Task 3); calls `POST /api/plan-day` (Task 2) expecting `{ taskIds: string[] }` on success.
- Produces: updated `TodayPage` behavior — no new exports for other tasks (last functional task in this plan).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/today/page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "./page";
import type { Task } from "@/lib/tasks";

const { toggleDone, removeTask, applyDayPlan, tasksMock } = vi.hoisted(() => ({
  toggleDone: vi.fn(),
  removeTask: vi.fn(),
  applyDayPlan: vi.fn(),
  tasksMock: vi.fn<() => Task[]>(),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: tasksMock(),
    toggleDone,
    removeTask,
    applyDayPlan,
  }),
}));

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

describe("TodayPage", () => {
  beforeEach(() => {
    toggleDone.mockClear();
    removeTask.mockClear();
    applyDayPlan.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the empty-backlog message when there are no today tasks and no backlog", () => {
    tasksMock.mockReturnValue([]);
    render(<TodayPage />);
    expect(
      screen.getByText("Спершу додай задачі в Inbox — і AI складе твій день.")
    ).toBeInTheDocument();
  });

  it("shows the backlog count when there are no today tasks but the backlog has tasks", () => {
    tasksMock.mockReturnValue([inboxTask]);
    render(<TodayPage />);
    expect(screen.getByText("У беклозі 1 задач.")).toBeInTheDocument();
  });

  it("renders only today tasks", () => {
    tasksMock.mockReturnValue([inboxTask, todayTask]);
    render(<TodayPage />);
    expect(screen.getByText("купити молоко")).toBeInTheDocument();
    expect(screen.queryByText("ще не розкладено")).not.toBeInTheDocument();
  });

  it("renders the priority/time/deadline metadata line", () => {
    tasksMock.mockReturnValue([todayTask]);
    render(<TodayPage />);
    expect(screen.getByText("🟢 · ~15 хв")).toBeInTheDocument();
  });

  it("shows done tasks with a done-styled checkbox", () => {
    tasksMock.mockReturnValue([doneTask]);
    render(<TodayPage />);
    expect(
      screen.getByRole("button", { name: "Позначити незробленою" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles done on click", async () => {
    tasksMock.mockReturnValue([todayTask]);
    const user = userEvent.setup();
    render(<TodayPage />);

    await user.click(
      screen.getByRole("button", { name: "Позначити зробленою" })
    );

    expect(toggleDone).toHaveBeenCalledWith("2");
  });

  it("removes a task on click", async () => {
    tasksMock.mockReturnValue([todayTask]);
    const user = userEvent.setup();
    render(<TodayPage />);

    await user.click(screen.getByRole("button", { name: "Видалити" }));

    expect(removeTask).toHaveBeenCalledWith("2");
  });

  describe("Сформувати день", () => {
    it("does not render the button when the backlog is empty", () => {
      tasksMock.mockReturnValue([todayTask]);
      render(<TodayPage />);
      expect(
        screen.queryByRole("button", { name: "✨ Сформувати день" })
      ).not.toBeInTheDocument();
    });

    it("renders the button when the backlog has tasks, even if Today already has tasks", () => {
      tasksMock.mockReturnValue([inboxTask, todayTask]);
      render(<TodayPage />);
      expect(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      ).toBeInTheDocument();
    });

    it("calls applyDayPlan with the returned taskIds on success", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ taskIds: ["1"] }),
        })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() => expect(applyDayPlan).toHaveBeenCalledWith(["1"]));
    });

    it("sends the backlog in the request body", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ taskIds: [] }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, requestInit] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/plan-day");
      const body = JSON.parse(requestInit.body);
      expect(body.backlog).toEqual([
        {
          id: "1",
          text: "ще не розкладено",
          priority: "medium",
          estimatedMinutes: null,
          deadline: null,
        },
      ]);
    });

    it("shows a loading label while the request is in flight", async () => {
      tasksMock.mockReturnValue([inboxTask]);
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
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      expect(
        screen.getByRole("button", { name: "AI планує твій день…" })
      ).toBeDisabled();

      resolveFetch({ ok: true, json: async () => ({ taskIds: [] }) });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "✨ Сформувати день" })
        ).toBeInTheDocument()
      );
    });

    it("shows an error message and does not call applyDayPlan when the request fails", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down"))
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() =>
        expect(
          screen.getByText("Не вдалося скласти план, спробуй ще раз.")
        ).toBeInTheDocument()
      );
      expect(applyDayPlan).not.toHaveBeenCalled();
    });

    it("shows an error message when the server responds with an error status", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({ ok: false, json: async () => ({ error: "boom" }) })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() =>
        expect(
          screen.getByText("Не вдалося скласти план, спробуй ще раз.")
        ).toBeInTheDocument()
      );
      expect(applyDayPlan).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/today/page.test.tsx`
Expected: FAIL — current `page.tsx` has no plan-day button and the old empty-state text/mock shape (missing `applyDayPlan`) don't match.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `src/app/today/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { formatTaskMeta } from "@/lib/tasks";
import { useTasks } from "@/hooks/useTasks";

const PLAN_DAY_TIMEOUT_MS = 15000;

export default function TodayPage() {
  const { tasks, toggleDone, removeTask, applyDayPlan } = useTasks();
  const todayTasks = tasks.filter((task) => task.status === "today");
  const backlogTasks = tasks.filter((task) => task.status === "inbox");
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  async function handlePlanDay() {
    setIsPlanning(true);
    setPlanError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PLAN_DAY_TIMEOUT_MS);

    try {
      const response = await fetch("/api/plan-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backlog: backlogTasks.map((task) => ({
            id: task.id,
            text: task.text,
            priority: task.priority,
            estimatedMinutes: task.estimatedMinutes,
            deadline: task.deadline,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("plan-day request failed");

      const data: unknown = await response.json();
      const taskIds =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { taskIds?: unknown }).taskIds)
          ? (data as { taskIds: string[] }).taskIds
          : null;

      if (taskIds === null) {
        throw new Error("plan-day returned an invalid payload");
      }

      applyDayPlan(taskIds);
    } catch {
      setPlanError("Не вдалося скласти план, спробуй ще раз.");
    } finally {
      clearTimeout(timeoutId);
      setIsPlanning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Today</h1>
      {backlogTasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handlePlanDay}
            disabled={isPlanning}
            className="h-16 rounded-full bg-black text-lg font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
          >
            {isPlanning ? "AI планує твій день…" : "✨ Сформувати день"}
          </button>
          {planError && (
            <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
              {planError}
            </p>
          )}
        </div>
      )}
      {todayTasks.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          {backlogTasks.length === 0
            ? "Спершу додай задачі в Inbox — і AI складе твій день."
            : `У беклозі ${backlogTasks.length} задач.`}
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

Run: `npm test -- src/app/today/page.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Run the full suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/today/page.tsx src/app/today/page.test.tsx
git commit -m "feat: Today screen forms the day via AI, with backlog-aware empty states"
```

---

### Task 8: Full verification pass

**Files:** none created — this task runs checks across everything built in Tasks 1-7.

**Interfaces:**
- Consumes: the entire feature.
- Produces: confidence that lint, the full test suite, the production build, and a real (non-mocked) OpenRouter call to `/api/plan-day` all work end-to-end, plus a manual mobile walkthrough of all three sub-features.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every test file from Tasks 1-7 PASSes, 0 failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, `/api/plan-day` listed among the routes.

- [ ] **Step 4: Real end-to-end check against OpenRouter (not mocked)**

`OPENROUTER_API_KEY` is already in `.env.local`. Run: `npm run dev`

In a second terminal:

```bash
curl -s -X POST http://localhost:3000/api/plan-day \
  -H "Content-Type: application/json" \
  -d '{"backlog":[
    {"id":"1","text":"Подзвонити в банк","priority":"high","estimatedMinutes":15,"deadline":"2026-07-20"},
    {"id":"2","text":"Помити вікна","priority":"low","estimatedMinutes":90,"deadline":null},
    {"id":"3","text":"Забрати посилку","priority":"medium","estimatedMinutes":30,"deadline":"2026-07-21"}
  ]}' | head -c 2000
```

Expected: HTTP 200 with a JSON body like `{"taskIds":["1","3"]}` — ids drawn only from `1`/`2`/`3`, high-priority/near-deadline task(s) present, plausibly excluding or deprioritizing the low-priority no-deadline one depending on the model's judgement of the time budget.

- [ ] **Step 5: Manual walkthrough in a mobile viewport**

With `npm run dev` still running, clear the browser's `localStorage` for `http://localhost:3000`, then open it in a mobile-width viewport and walk through the design spec's checklist (`docs/superpowers/specs/2026-07-20-phase-b-day-formation-onboarding-design.md` §"Ручний чек-лист перевірки"):

1. First load → onboarding overlay with 3 cards appears; tap "Почати" → overlay hides, cursor is in the Capture field immediately.
2. Reload the page → onboarding does not appear again.
3. With empty Inbox and empty Today: Capture shows the hint with the example; Inbox shows "Inbox поки порожній…" with a working "← У Capture" link; Today shows "Спершу додай задачі в Inbox…".
4. Capture/dictate a few tasks with varying priority → Today shows "У беклозі N задач." and the "✨ Сформувати день" button.
5. Tap "✨ Сформувати день" → see "AI планує твій день…" → tasks appear in Today in a sensible order (priority/deadline), total estimated time not wildly over ~6 hours.
6. Manually move one more task via "→ Сьогодні" in Inbox, then tap "✨ Сформувати день" again → newly AI-selected tasks appear on top, the manually-moved one stays, nothing is lost or duplicated.
7. Turn off networking → tap "✨ Сформувати день" → see the error message, Today's task list is unchanged.

Stop the dev server (`Ctrl+C`) once done.

- [ ] **Step 6: Commit if anything was fixed during the walkthrough**

If Steps 4-5 surfaced no code changes, skip this step. Otherwise:

```bash
git add -A
git commit -m "fix: address issues found in Phase B end-to-end walkthrough"
```

---

## After This Plan

Pushing to `main` and then to `https://github.com/knowely/ai-day-planner-.git` triggers Vercel's existing auto-deploy, which already has `OPENROUTER_API_KEY` configured. Push is a separate, explicit-confirmation step — not part of this plan's tasks.
