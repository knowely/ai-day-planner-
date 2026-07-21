# Design: Energy-ordered planning, capacity warnings, and constraints for /api/plan-day

## Context

`/api/plan-day` already exists and lets the Today screen ask OpenRouter to pick
and order backlog tasks for today. This extends that same route and the Today
screen with three capabilities, without breaking anything currently working:

- **A. Energy-based ordering** — heavier tasks (higher priority / longer
  duration) scheduled toward the morning, lighter ones later.
- **B. Realistic day capacity** — the plan must not overcommit the day; tasks
  that don't fit stay in the backlog, with a clear warning shown to the user.
- **C. "Replan" with constraints** — a free-text field lets the user describe
  time already spoken for (meetings, appointments), and the AI accounts for
  it when building the plan.

No new files for the task data model. Deferred tasks are simply tasks that
stay `status: "inbox"` — the existing behavior when a task isn't selected.

## `/api/plan-day` route changes

- `TIME_BUDGET_MINUTES = 360` is replaced by `DAY_CAPACITY_MIN = 480` (8h).
- New constant `DEFAULT_TASK_MINUTES = 30` — used when a backlog item has
  `estimatedMinutes: null`, so the server can compute a deterministic total
  instead of leaving unestimated tasks out of the capacity math.
- Request body gains an optional `constraints: string` field (free text,
  e.g. "зустрічі 14–16, лікар о 10"). It is trimmed and capped at 300
  characters. It's included in the user message as a clearly separate data
  field (not concatenated into the system prompt), so it's treated as
  planning context, not as instructions to the model.
- The system prompt is updated to:
  - Order tasks by "energy": higher priority and/or longer estimated
    duration earlier in the day, lighter tasks later.
  - Treat `constraints` as time already spoken for — plan the remaining
    tasks around it.
  - Reference `DAY_CAPACITY_MIN` instead of the old 360-minute budget.
- **Tool schema is simplified** to `{ selected: string[], note: string }`.
  The model is not asked to return `deferred`, `totalMinutes`, or
  `overloaded` — those are computed server-side from validated data, per
  the project's established "never trust the AI's raw output for anything
  the server can compute deterministically" pattern (see `formatTaskMeta`,
  `sanitizeDeadline`, and the existing `sanitizePlanDayResponse`).

### Server-side computation (replaces trusting AI arithmetic)

Given the model's `selected` list and the known backlog (id → estimatedMinutes):

1. Filter `selected` to valid backlog ids, dedupe, preserve order (existing
   behavior, unchanged).
2. Walk the filtered list accumulating minutes (using
   `DEFAULT_TASK_MINUTES` for `null` estimates). Stop including further
   items the moment adding the next one would exceed `DAY_CAPACITY_MIN` —
   this guarantees the returned plan never overcommits the day even if the
   model ignores the budget instruction.
3. `deferred` = all valid backlog ids not present in the (possibly
   truncated) `selected` list.
4. `totalMinutes` = the actual summed minutes of the final `selected` list.
5. `overloaded` = `deferred.length > 0`.
6. `note` = the model's string, sanitized (non-string/empty → fallback). If
   `overloaded` is true and no usable note was returned, fall back to
   `"Задач більше, ніж влізе у день. Частину лишили в беклозі."`. If not
   overloaded, default to `""`.

Response shape (unchanged from the spec):

```json
{
  "selected": ["id", "..."],
  "deferred": ["id", "..."],
  "note": "коротке пояснення українською",
  "totalMinutes": 0,
  "overloaded": false
}
```

## `sanitizePlanDayResponse`

Rewritten to accept `(raw: unknown, validIds: Set<string>, minutesById: Map<string, number | null>)`
and return the full object above (all steps described in the previous
section happen inside this pure function, so it stays unit-testable the same
way it is today).

## Today screen changes

- A text input next to the "✨ Сформувати день" button:
  placeholder `«Є обмеження? Напр.: зустрічі 14–16, лікар о 10»`. Its value
  is sent as `constraints` in the request body.
- Button label: `"✨ Сформувати день"` before a plan has been formed this
  session; `"↻ Перепланувати"` once `applyDayPlan` has succeeded at least
  once (local component state, resets on navigation/reload — no need to
  persist this flag).
- Loading label stays `"AI планує твій день…"`.
- On success:
  - Call `applyDayPlan(selected)` (same function, unchanged — it already
    takes an ordered id array).
  - Show a summary line: `"~X год заплановано"` — if `totalMinutes < 60`,
    show `"~N хв заплановано"` instead; otherwise round to the nearest 0.5h
    (e.g. `"~6.5 год заплановано"`).
  - If `overloaded === true`, show a warning banner with the `note` text,
    e.g. `"⚠️ Задач більше, ніж влізе у день. Лишила N на потім (у беклозі)."`
    (N = `deferred.length`, appended by the UI, not required to be baked
    into `note` itself).
- Errors: unchanged behavior (existing `planError` state/message), no
  changes to failure handling.
- The button can be pressed again anytime to replan (e.g. after editing
  constraints), same as today's re-run behavior.

## Known limitation (by design, not a bug)

`constraints` is passed to the model as planning context and reasoned about
by the LLM — it is **not** parsed into structured calendar time ranges by
the server. This matches the complexity level requested; a deterministic
time-range parser is out of scope.

## Testing

- `sanitizePlanDayResponse`: truncation at capacity boundary, `deferred`
  computation, `totalMinutes` computation with mixed null/known estimates,
  `overloaded` true/false, `note` fallback behavior, invalid/malformed raw
  input (existing test shapes extended, not replaced).
- Route handler: `constraints` forwarded correctly, capacity truncation
  end-to-end, response shape.
- Today screen: constraints input renders and is sent, button label swaps
  after a successful plan, summary line formatting (minutes vs hours),
  warning banner shown only when `overloaded`, replan flow.
- Manual verification (per user request) against the live OpenRouter API:
  overloaded backlog, `"зустрічі 14–16"` constraint, energy ordering
  (heavy-first).
