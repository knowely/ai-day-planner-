# Plan-day: Energy Ordering, Capacity, Constraints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `/api/plan-day` route and the Today screen so the AI orders today's plan by energy (heavy tasks first), never overcommits the day (a hard 480-minute capacity, computed server-side, not trusted from the model), and can account for a free-text list of time constraints the user types in.

**Architecture:** No new files for the task data model — a task that isn't selected simply stays `status: "inbox"` (existing behavior). `sanitizePlanDayResponse` is rewritten to take the model's raw tool output plus the server's own knowledge of `estimatedMinutes` per task, and deterministically compute `selected`, `deferred`, `totalMinutes`, and `overloaded` — never trusting arithmetic from the model. The route forwards a new `constraints` string to the model as data (not as an instruction). The Today screen adds a constraints input and renders the plan summary/warning banner using a new pure formatting helper.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Vitest + React Testing Library, OpenRouter (`anthropic/claude-haiku-4.5`, tool/function calling).

## Global Constraints

- `DAY_CAPACITY_MIN = 480` (8 hours) — replaces the old `TIME_BUDGET_MINUTES = 360`.
- `DEFAULT_TASK_MINUTES = 30` — used when a task's `estimatedMinutes` is `null`, so the server can always compute a deterministic total.
- The server never trusts AI-computed numbers or booleans (`totalMinutes`, `overloaded`, `deferred`) — it computes them itself from validated `selected` ids and the backlog's own known `estimatedMinutes`. This matches the project's established pattern (see `sanitizeDeadline`, `formatTaskMeta`, the existing `sanitizePlanDayResponse`).
- `constraints` free text is capped at 300 characters server-side and sent to the model as a separate JSON data field, never concatenated into the system prompt.
- All UI copy is Ukrainian, exact strings as specified in each task below.
- Existing behavior must not regress: Capture, Inbox, onboarding, empty states, and the general shape of the plan-day flow (button, loading state, error state) stay working.

---

### Task 1: Rewrite `sanitizePlanDayResponse` for the new response shape

**Files:**
- Modify: `src/lib/planDayResponse.ts` (full rewrite)
- Test: `src/lib/planDayResponse.test.ts` (full rewrite)

**Interfaces:**
- Produces: `export const DAY_CAPACITY_MIN = 480`, `export const DEFAULT_TASK_MINUTES = 30`, `export interface PlanDayResult { selected: string[]; deferred: string[]; note: string; totalMinutes: number; overloaded: boolean }`, `export function sanitizePlanDayResponse(raw: unknown, validIds: Set<string>, minutesById: Map<string, number | null>): PlanDayResult`.
- Consumes: nothing (pure function, no imports from the rest of the app).

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/lib/planDayResponse.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  DAY_CAPACITY_MIN,
  DEFAULT_TASK_MINUTES,
  sanitizePlanDayResponse,
} from "./planDayResponse";

const noMinutes = new Map<string, number | null>();

describe("sanitizePlanDayResponse", () => {
  it("returns everything deferred when raw is not an object", () => {
    const validIds = new Set(["1"]);
    const minutesById = new Map<string, number | null>([["1", 30]]);
    const expected = {
      selected: [],
      deferred: ["1"],
      note: "Задач більше, ніж влізе у день.",
      totalMinutes: 0,
      overloaded: true,
    };
    expect(sanitizePlanDayResponse(null, validIds, minutesById)).toEqual(expected);
    expect(sanitizePlanDayResponse("oops", validIds, minutesById)).toEqual(expected);
  });

  it("returns everything deferred when selected is missing or not an array", () => {
    const validIds = new Set(["1"]);
    const minutesById = new Map<string, number | null>([["1", 30]]);
    expect(sanitizePlanDayResponse({}, validIds, minutesById).selected).toEqual([]);
    expect(
      sanitizePlanDayResponse({ selected: "oops" }, validIds, minutesById).selected
    ).toEqual([]);
  });

  it("keeps only ids present in validIds, preserving order, and defers the rest", () => {
    const validIds = new Set(["a", "b", "c"]);
    const minutesById = new Map<string, number | null>([
      ["a", 30],
      ["b", 30],
      ["c", 30],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["b", "a", "z"] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["b", "a"]);
    expect(result.deferred).toEqual(["c"]);
  });

  it("drops non-string entries", () => {
    const validIds = new Set(["a"]);
    const minutesById = new Map<string, number | null>([["a", 30]]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", 5, null] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["a"]);
  });

  it("dedupes, keeping the first occurrence", () => {
    const validIds = new Set(["a", "b"]);
    const minutesById = new Map<string, number | null>([
      ["a", 30],
      ["b", 30],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b", "a"] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["a", "b"]);
  });

  it("defers nothing and selects nothing when validIds is empty", () => {
    const result = sanitizePlanDayResponse({ selected: ["a"] }, new Set(), noMinutes);
    expect(result).toEqual({
      selected: [],
      deferred: [],
      note: "",
      totalMinutes: 0,
      overloaded: false,
    });
  });

  it("sums estimatedMinutes for selected tasks", () => {
    const validIds = new Set(["a", "b"]);
    const minutesById = new Map<string, number | null>([
      ["a", 60],
      ["b", 45],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b"] },
      validIds,
      minutesById
    );
    expect(result.totalMinutes).toBe(105);
    expect(result.overloaded).toBe(false);
  });

  it("uses DEFAULT_TASK_MINUTES for tasks with a null estimate", () => {
    const validIds = new Set(["a"]);
    const minutesById = new Map<string, number | null>([["a", null]]);
    const result = sanitizePlanDayResponse(
      { selected: ["a"] },
      validIds,
      minutesById
    );
    expect(result.totalMinutes).toBe(DEFAULT_TASK_MINUTES);
  });

  it("stops selecting once the next task would exceed DAY_CAPACITY_MIN, deferring the rest", () => {
    const validIds = new Set(["a", "b", "c"]);
    const minutesById = new Map<string, number | null>([
      ["a", 300],
      ["b", 200],
      ["c", 30],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b", "c"] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["a"]);
    expect(result.totalMinutes).toBe(300);
    expect(result.deferred).toEqual(["b", "c"]);
    expect(result.overloaded).toBe(true);
  });

  it("fits selected tasks exactly at DAY_CAPACITY_MIN", () => {
    const validIds = new Set(["a", "b"]);
    const minutesById = new Map<string, number | null>([
      ["a", DAY_CAPACITY_MIN - 60],
      ["b", 60],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b"] },
      validIds,
      minutesById
    );
    expect(result.selected).toEqual(["a", "b"]);
    expect(result.totalMinutes).toBe(DAY_CAPACITY_MIN);
    expect(result.overloaded).toBe(false);
  });

  it("uses the model's note when provided and non-empty", () => {
    const validIds = new Set(["a"]);
    const minutesById = new Map<string, number | null>([["a", 30]]);
    const result = sanitizePlanDayResponse(
      { selected: ["a"], note: "Ранок для важкого." },
      validIds,
      minutesById
    );
    expect(result.note).toBe("Ранок для важкого.");
  });

  it("falls back to a default note when overloaded and the model's note is missing", () => {
    const validIds = new Set(["a", "b"]);
    const minutesById = new Map<string, number | null>([
      ["a", DAY_CAPACITY_MIN],
      ["b", 30],
    ]);
    const result = sanitizePlanDayResponse(
      { selected: ["a", "b"] },
      validIds,
      minutesById
    );
    expect(result.overloaded).toBe(true);
    expect(result.note).toBe("Задач більше, ніж влізе у день.");
  });

  it("defaults note to an empty string when not overloaded and the model returned none", () => {
    const validIds = new Set(["a"]);
    const minutesById = new Map<string, number | null>([["a", 30]]);
    const result = sanitizePlanDayResponse({ selected: ["a"] }, validIds, minutesById);
    expect(result.note).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/planDayResponse.test.ts`
Expected: FAIL — `DAY_CAPACITY_MIN`/`DEFAULT_TASK_MINUTES` not exported, `sanitizePlanDayResponse` has the wrong signature/shape (old code still returns a bare `string[]` keyed off `taskIds`).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/lib/planDayResponse.ts` with:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/planDayResponse.test.ts`
Expected: PASS, all 13 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planDayResponse.ts src/lib/planDayResponse.test.ts
git commit -m "feat: compute plan-day selection/capacity server-side instead of trusting the model"
```

---

### Task 2: Add `formatPlanSummary` helper

**Files:**
- Modify: `src/lib/tasks.ts` (add one function, no other changes)
- Test: `src/lib/tasks.test.ts` (add one describe block)

**Interfaces:**
- Produces: `export function formatPlanSummary(totalMinutes: number): string`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

In `src/lib/tasks.test.ts`, add `formatPlanSummary` to the existing import list at the top of the file (it currently imports `createTask, createTaskFromParsed, formatBacklogCount, formatTaskMeta, loadTasks, parseCaptureText, saveTasks` from `"./tasks"` — add `formatPlanSummary` alphabetically to that list), then add this new `describe` block right after the closing `});` of the existing `describe("formatBacklogCount", ...)` block (before `describe("loadTasks / saveTasks", ...)`):

```ts
describe("formatPlanSummary", () => {
  it("shows minutes when under an hour", () => {
    expect(formatPlanSummary(45)).toBe("~45 хв заплановано");
  });

  it("shows whole hours", () => {
    expect(formatPlanSummary(120)).toBe("~2 год заплановано");
  });

  it("rounds to the nearest half hour", () => {
    expect(formatPlanSummary(100)).toBe("~1.5 год заплановано");
    expect(formatPlanSummary(370)).toBe("~6 год заплановано");
    expect(formatPlanSummary(390)).toBe("~6.5 год заплановано");
  });

  it("handles zero minutes", () => {
    expect(formatPlanSummary(0)).toBe("~0 хв заплановано");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/tasks.test.ts`
Expected: FAIL — `formatPlanSummary` is not exported from `./tasks`.

- [ ] **Step 3: Write the implementation**

In `src/lib/tasks.ts`, add this function directly after `formatBacklogCount` (which currently ends the block right before the `pluralizeZadacha`/`normalizeTask` comment area — add this new export right after the closing brace of `formatBacklogCount`):

```ts
export function formatPlanSummary(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `~${totalMinutes} хв заплановано`;
  }
  const hours = Math.round((totalMinutes / 60) * 2) / 2;
  const hoursLabel = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `~${hoursLabel} год заплановано`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/tasks.test.ts`
Expected: PASS, all tests green (existing tests plus the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks.ts src/lib/tasks.test.ts
git commit -m "feat: add formatPlanSummary helper for the plan-day time summary"
```

---

### Task 3: Update `/api/plan-day` — energy ordering, capacity, constraints

**Files:**
- Modify: `src/app/api/plan-day/route.ts` (full rewrite)
- Test: `src/app/api/plan-day/route.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `DAY_CAPACITY_MIN`, `sanitizePlanDayResponse`, `PlanDayResult` from `@/lib/planDayResponse` (Task 1).
- Produces: `POST(request: Request): Promise<Response>` — response body is now `PlanDayResult` (`{ selected, deferred, note, totalMinutes, overloaded }`) instead of `{ taskIds }`. Request body now accepts an optional `constraints: string` field alongside the existing `backlog` array.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/app/api/plan-day/route.test.ts` with:

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

  it("returns a sanitized plan on a successful tool call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        toolCallResponse({ selected: ["1", "999", "1"], note: "Почни з молока." })
      )
    );

    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.selected).toEqual(["1"]);
    expect(data.deferred).toEqual(["2"]);
    expect(data.note).toBe("Почни з молока.");
    expect(data.totalMinutes).toBe(15);
    expect(data.overloaded).toBe(true);
  });

  it("forwards constraints to the upstream request as separate data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(toolCallResponse({ selected: ["1"] }));
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      makeRequest({ backlog: sampleBacklog, constraints: "зустрічі 14–16" })
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body);
    const userMessage = JSON.parse(requestBody.messages[1].content);
    expect(userMessage.constraints).toBe("зустрічі 14–16");
    expect(userMessage.backlog).toEqual(sampleBacklog);
  });

  it("sends an empty constraints string when none is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(toolCallResponse({ selected: ["1"] }));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ backlog: sampleBacklog }));

    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body);
    const userMessage = JSON.parse(requestBody.messages[1].content);
    expect(userMessage.constraints).toBe("");
  });

  it("truncates the plan when the backlog exceeds DAY_CAPACITY_MIN", async () => {
    const heavyBacklog = [
      { id: "1", text: "A", priority: "high", estimatedMinutes: 300, deadline: null },
      { id: "2", text: "B", priority: "high", estimatedMinutes: 300, deadline: null },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(toolCallResponse({ selected: ["1", "2"] }))
    );

    const response = await POST(makeRequest({ backlog: heavyBacklog }));
    const data = await response.json();

    expect(data.selected).toEqual(["1"]);
    expect(data.deferred).toEqual(["2"]);
    expect(data.overloaded).toBe(true);
    expect(data.totalMinutes).toBe(300);
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/plan-day/route.test.ts`
Expected: FAIL — route still uses `taskIds`/`backlog`-only prompt shape; `data.selected`/`data.deferred` etc. are `undefined`, `userMessage.constraints` doesn't exist.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/app/api/plan-day/route.ts` with:

```ts
import { DAY_CAPACITY_MIN, sanitizePlanDayResponse } from "@/lib/planDayResponse";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-4.5";
const MAX_CONSTRAINTS_LENGTH = 300;

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
      "Select and order backlog tasks that should be done today, respecting priority, deadline urgency, energy level (heavier tasks earlier), a total time budget, and any stated constraints.",
    parameters: {
      type: "object",
      properties: {
        selected: {
          type: "array",
          items: { type: "string" },
          description:
            "IDs of selected backlog tasks, in the order they should be tackled today (highest-energy/heaviest tasks first, lighter tasks later).",
        },
        note: {
          type: "string",
          description:
            "A short note in Ukrainian explaining the plan, especially if not everything fit today.",
        },
      },
      required: ["selected"],
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

function parseConstraints(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const raw = (body as { constraints?: unknown }).constraints;
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_CONSTRAINTS_LENGTH);
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
  const constraints = parseConstraints(body);

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
            content: `Today's date is ${today}. You are planning a realistic today-list from a backlog of tasks (given as JSON in the user message, alongside any stated constraints). Order tasks by energy: schedule higher-priority and/or longer-duration tasks earlier in the day, and lighter tasks later, so the morning carries the heaviest load. If constraints describes time already spoken for (e.g. meetings, appointments), plan the remaining tasks around it. Keep the total estimated time under ${DAY_CAPACITY_MIN} minutes, using judgement for tasks with no time estimate. Select and order the chosen tasks using the plan_day tool, and include a short Ukrainian note explaining the plan, especially if not everything fits today. Respond only by calling the tool.`,
          },
          { role: "user", content: JSON.stringify({ backlog, constraints }) },
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
  const minutesById = new Map(
    backlog.map((item) => [item.id, item.estimatedMinutes] as const)
  );
  const result = sanitizePlanDayResponse(toolArguments, validIds, minutesById);
  return Response.json(result, { status: 200 });
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/plan-day/route.test.ts`
Expected: PASS, all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/plan-day/route.ts src/app/api/plan-day/route.test.ts
git commit -m "feat: energy-ordered plan-day prompt with capacity and constraints"
```

---

### Task 4: Today screen — constraints input, plan summary, warning banner

**Files:**
- Modify: `src/app/today/page.tsx` (full rewrite)
- Test: `src/app/today/page.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `formatBacklogCount`, `formatPlanSummary`, `formatTaskMeta` from `@/lib/tasks` (Task 2 adds `formatPlanSummary`); `useTasks()` (unchanged — `applyDayPlan(orderedIds: string[])` still takes a plain ordered id array, so it's called with `parsed.selected`).
- Produces: nothing consumed by later tasks (this is the last UI task).

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/app/today/page.test.tsx` with:

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

function planResponse(
  overrides: Partial<{
    selected: string[];
    deferred: string[];
    note: string;
    totalMinutes: number;
    overloaded: boolean;
  }> = {}
) {
  return {
    selected: [],
    deferred: [],
    note: "",
    totalMinutes: 0,
    overloaded: false,
    ...overrides,
  };
}

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
    expect(screen.getByText("У беклозі 1 задача.")).toBeInTheDocument();
  });

  it("uses the correct plural form for a backlog of several tasks", () => {
    const secondInboxTask: Task = { ...inboxTask, id: "4" };
    tasksMock.mockReturnValue([inboxTask, secondInboxTask]);
    render(<TodayPage />);
    expect(screen.getByText("У беклозі 2 задачі.")).toBeInTheDocument();
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

    it("calls applyDayPlan with the returned selected ids on success", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => planResponse({ selected: ["1"], totalMinutes: 15 }),
        })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() => expect(applyDayPlan).toHaveBeenCalledWith(["1"]));
    });

    it("sends the backlog and trimmed constraints in the request body", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => planResponse(),
      });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.type(
        screen.getByPlaceholderText("Є обмеження? Напр.: зустрічі 14–16, лікар о 10"),
        "  зустрічі 14–16  "
      );
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
      expect(body.constraints).toBe("зустрічі 14–16");
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

      resolveFetch({ ok: true, json: async () => planResponse() });
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

    it("switches the button label to Перепланувати after a successful plan", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => planResponse({ selected: ["1"], totalMinutes: 15 }),
        })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "↻ Перепланувати" })
        ).toBeInTheDocument()
      );
    });

    it("shows the time summary after a successful plan", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => planResponse({ selected: ["1"], totalMinutes: 120 }),
        })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() =>
        expect(screen.getByText("~2 год заплановано")).toBeInTheDocument()
      );
    });

    it("shows a warning banner with the note and deferred count when overloaded", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () =>
            planResponse({
              selected: ["1"],
              deferred: ["5", "6"],
              note: "Задач більше, ніж влізе у день.",
              totalMinutes: 480,
              overloaded: true,
            }),
        })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() =>
        expect(
          screen.getByText(
            "⚠️ Задач більше, ніж влізе у день. Лишила 2 на потім (у беклозі)."
          )
        ).toBeInTheDocument()
      );
    });

    it("does not show a warning banner when the plan is not overloaded", async () => {
      tasksMock.mockReturnValue([inboxTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () =>
            planResponse({ selected: ["1"], totalMinutes: 15, overloaded: false }),
        })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(
        screen.getByRole("button", { name: "✨ Сформувати день" })
      );

      await waitFor(() =>
        expect(screen.getByText("~15 хв заплановано")).toBeInTheDocument()
      );
      expect(screen.queryByText(/⚠️/)).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/today/page.test.tsx`
Expected: FAIL — no constraints input exists yet, button label never changes, no summary/banner text is rendered, mocked responses use the new shape the current component doesn't parse.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/app/today/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { formatBacklogCount, formatPlanSummary, formatTaskMeta } from "@/lib/tasks";
import { useTasks } from "@/hooks/useTasks";

const PLAN_DAY_TIMEOUT_MS = 15000;

interface PlanDayResponse {
  selected: string[];
  deferred: string[];
  note: string;
  totalMinutes: number;
  overloaded: boolean;
}

interface PlanSummary {
  totalMinutes: number;
  overloaded: boolean;
  note: string;
  deferredCount: number;
}

function parsePlanResponse(data: unknown): PlanDayResponse | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Record<string, unknown>;
  if (!Array.isArray(candidate.selected) || !Array.isArray(candidate.deferred)) {
    return null;
  }
  if (
    typeof candidate.note !== "string" ||
    typeof candidate.totalMinutes !== "number" ||
    typeof candidate.overloaded !== "boolean"
  ) {
    return null;
  }
  return {
    selected: candidate.selected as string[],
    deferred: candidate.deferred as string[],
    note: candidate.note,
    totalMinutes: candidate.totalMinutes,
    overloaded: candidate.overloaded,
  };
}

export default function TodayPage() {
  const { tasks, toggleDone, removeTask, applyDayPlan } = useTasks();
  const todayTasks = tasks.filter((task) => task.status === "today");
  const backlogTasks = tasks.filter((task) => task.status === "inbox");
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [constraints, setConstraints] = useState("");
  const [hasPlanned, setHasPlanned] = useState(false);
  const [planSummary, setPlanSummary] = useState<PlanSummary | null>(null);

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
          constraints: constraints.trim(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("plan-day request failed");

      const data: unknown = await response.json();
      const parsed = parsePlanResponse(data);
      if (parsed === null) {
        throw new Error("plan-day returned an invalid payload");
      }

      applyDayPlan(parsed.selected);
      setPlanSummary({
        totalMinutes: parsed.totalMinutes,
        overloaded: parsed.overloaded,
        note: parsed.note,
        deferredCount: parsed.deferred.length,
      });
      setHasPlanned(true);
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
          <input
            type="text"
            value={constraints}
            onChange={(event) => setConstraints(event.target.value)}
            placeholder="Є обмеження? Напр.: зустрічі 14–16, лікар о 10"
            className="h-12 rounded-full border border-black/10 px-4 text-base dark:border-white/10"
          />
          <button
            type="button"
            onClick={handlePlanDay}
            disabled={isPlanning}
            className="h-16 rounded-full bg-black text-lg font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
          >
            {isPlanning
              ? "AI планує твій день…"
              : hasPlanned
                ? "↻ Перепланувати"
                : "✨ Сформувати день"}
          </button>
          {planError && (
            <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
              {planError}
            </p>
          )}
        </div>
      )}
      {planSummary && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {formatPlanSummary(planSummary.totalMinutes)}
          </p>
          {planSummary.overloaded && (
            <p className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              ⚠️ {planSummary.note} Лишила {planSummary.deferredCount} на потім (у
              беклозі).
            </p>
          )}
        </div>
      )}
      {todayTasks.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          {backlogTasks.length === 0
            ? "Спершу додай задачі в Inbox — і AI складе твій день."
            : formatBacklogCount(backlogTasks.length)}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/today/page.test.tsx`
Expected: PASS, all tests green (existing tests plus the new constraints/summary/banner/replan tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/today/page.tsx src/app/today/page.test.tsx
git commit -m "feat: add constraints input, plan summary, and overload banner to Today"
```

---

### Task 5: Full verification pass

**Files:** none (verification only; fix-forward if issues are found, then re-run this task's steps).

**Interfaces:** none.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all test files pass (existing suite + the new/updated tests from Tasks 1–4).

- [ ] **Step 2: Lint and build**

Run: `npm run lint`
Expected: no errors/warnings.

Run: `npm run build`
Expected: compiles successfully, `/api/plan-day` still listed as a dynamic route, no TypeScript errors.

- [ ] **Step 3: Real end-to-end verification against live OpenRouter — energy ordering**

Start the dev server (`npm run dev`), open the Today screen in a browser with a backlog containing a mix of high-priority/long tasks and low-priority/short tasks, click "✨ Сформувати день" with no constraints, and confirm heavier tasks land first in the resulting Today order.

- [ ] **Step 4: Real end-to-end verification — overloaded backlog**

With a backlog whose total estimated time clearly exceeds 480 minutes, click "✨ Сформувати день" and confirm: only a realistic subset moves to Today, the remaining tasks stay in Inbox, the warning banner appears with the deferred count, and the time summary shows a sensible total (not exceeding ~8h).

- [ ] **Step 5: Real end-to-end verification — constraints**

Type `"зустрічі 14–16, лікар о 10"` into the constraints field and replan (button should now read "↻ Перепланувати"); confirm the request includes the constraint text and the resulting plan/note is sensible given it (task selection/ordering shows judgement about the busy window, even though it isn't calendar-parsed).

- [ ] **Step 6: Manual mobile walkthrough**

Using the Browser tool at a mobile viewport, walk through: typing in the constraints field, clicking the button, seeing the loading label, seeing the summary line and (if applicable) the warning banner, and clicking "↻ Перепланувати" again to confirm the flow repeats cleanly.

- [ ] **Step 7: Fix forward if needed**

If any step in 3–6 surfaces a bug, fix it in the relevant file, re-run `npm test`, and commit the fix with a message describing what was wrong (e.g. `fix: <specific bug>`). Re-run steps 3–6 for the affected scenario after fixing.

- [ ] **Step 8: Report**

Summarize what was verified (automated test counts, lint/build status, and the outcome of each of the three manual scenarios) so the branch is ready for final review.
