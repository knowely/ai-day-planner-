# Dark Theme Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen of the AI day planner into a fixed, monobank-inspired dark theme (design tokens, lucide-react icons instead of emoji, restyled cards/buttons/banner) with zero change to app logic, routes, AI parsing, day-formation, or task storage.

**Architecture:** A CSS token layer (`globals.css`, Tailwind v4 `@theme`) plus `lucide-react` icons are added first as pure infrastructure. Two small, independently-testable presentational units are added next (`TaskMetaRow` component, `formatTodayCount` helper) with zero consumers yet. Every screen is then restyled one at a time to consume the tokens/icons/new units, in an order that never leaves a broken intermediate state (in particular, the old `formatTaskMeta`/`PRIORITY_ICON` in `src/lib/tasks.ts` are only deleted in the same task where their last consumer switches away from them).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4 (CSS-first `@theme`, no `tailwind.config.js`), Vitest + React Testing Library, `lucide-react`.

## Global Constraints

- **No logic changes.** `src/hooks/useTasks.tsx`, every file under `src/app/api/`, `src/lib/planDayResponse.ts`, `src/lib/onboarding.ts`, `src/hooks/useAudioRecording.ts` are not touched. Where a task changes `src/lib/tasks.ts`, it only removes now-unused display-formatting code or adds a new pure display-formatting helper — never touches `parseCaptureText`, `createTask`, `createTaskFromParsed`, `loadTasks`, `saveTasks`, or `normalizeTask`'s actual behavior.
- **No functional regressions.** Every interactive control that exists today (mic toggle, Add, move-to-today, delete, done-toggle, plan-day, constraints input) keeps working exactly as before — only its visual styling and icon changes. Confirmed explicitly with the user: the Today screen's done-toggle checkbox and delete button are **kept and restyled**, not removed, despite the mockup showing bare cards.
- **Fixed dark theme.** No `@media (prefers-color-scheme: dark)`, no `dark:` Tailwind variant anywhere in the app after this change.
- Exact color tokens (hex): background `#0E0E11`, surface `#1A1A1F`, surface border `#2A2A31`, accent `#6E56F7`, accent-light `#8F7BFF`, text secondary `#9A9AA5`, text placeholder `#6B6B75`, priority-high `#FF5A5F`/text `#FF7A7E`, priority-medium `#FFB020`/text `#FFC155`, priority-low `#2ECC71`/text `#4ADE80`.
- Exact radii: card 18px, control 16px, small 12px, tag (priority chip) 9px, banner 14px.
- Icon map (emoji → lucide, exact names): Capture `SquarePen`, Inbox `Inbox`, Today `CheckCircle2`, mic `Mic`, add `Plus`, time `Clock`, deadline `Calendar`, "Сьогодні" `ArrowRight`, delete `X`, plan/replan `Sparkles`, overload banner `TriangleAlert`. The "✓" done-toggle checkmark is the one glyph left untouched (no replacement named).
- Exact copy changes: onboarding subheading becomes "Запиши або надиктуй усе, що в голові. AI розкладе це на задачі — з пріоритетом, часом і дедлайном — і сам складе твій план на сьогодні."; Capture's hint paragraph becomes "Запиши або натисни мікрофон і проговори все, що треба зробити." (example line below it is unchanged).
- Removing emoji from button text changes those buttons' **accessible names** (test impact is expected and enumerated per-task below — not a regression).

---

### Task 1: Design tokens + lucide-react dependency

**Files:**
- Modify: `src/app/globals.css` (full replacement)
- Modify: `src/app/layout.tsx:22`
- `package.json` / `package-lock.json` (via `npm install`, not hand-edited)

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utility classes available to every later task —
  `bg-background`, `text-foreground`, `bg-surface`, `border-surface-border`,
  `bg-accent`, `text-accent`, `text-accent-light`, `text-text-secondary`,
  `text-text-placeholder`, `bg-priority-high`/`text-priority-high-text`
  (and `-medium`/`-low` equivalents, each with working `/NN` opacity
  suffixes), `rounded-card`, `rounded-control`, `rounded-small`,
  `rounded-tag`, `rounded-banner`. The `lucide-react` package, importable
  by name (e.g. `import { Mic } from "lucide-react"`).

- [ ] **Step 1: Install the icon library**

Run: `npm install lucide-react`
Expected: command succeeds; `package.json` gains `"lucide-react"` under
`dependencies`.

- [ ] **Step 2: Replace `src/app/globals.css`**

```css
@import "tailwindcss";

:root {
  --background: #0E0E11;
  --foreground: #F4F4F6;
  --surface: #1A1A1F;
  --surface-border: #2A2A31;
  --accent: #6E56F7;
  --accent-light: #8F7BFF;
  --text-secondary: #9A9AA5;
  --text-placeholder: #6B6B75;
  --priority-high: #FF5A5F;
  --priority-high-text: #FF7A7E;
  --priority-medium: #FFB020;
  --priority-medium-text: #FFC155;
  --priority-low: #2ECC71;
  --priority-low-text: #4ADE80;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-surface-border: var(--surface-border);
  --color-accent: var(--accent);
  --color-accent-light: var(--accent-light);
  --color-text-secondary: var(--text-secondary);
  --color-text-placeholder: var(--text-placeholder);
  --color-priority-high: var(--priority-high);
  --color-priority-high-text: var(--priority-high-text);
  --color-priority-medium: var(--priority-medium);
  --color-priority-medium-text: var(--priority-medium-text);
  --color-priority-low: var(--priority-low);
  --color-priority-low-text: var(--priority-low-text);

  --radius-card: 18px;
  --radius-control: 16px;
  --radius-small: 12px;
  --radius-tag: 9px;
  --radius-banner: 14px;

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
}
```

- [ ] **Step 3: Add a matching mobile browser theme-color**

In `src/app/layout.tsx`, change line 22 from:

```ts
export const viewport: Viewport = { viewportFit: "cover" };
```

to:

```ts
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0E0E11" };
```

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: all 163 tests still pass — this task changes no component
markup or logic, only CSS custom properties and a metadata field.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: compiles successfully, same routes listed as before.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx package.json package-lock.json
git commit -m "feat: add dark theme design tokens and lucide-react"
```

---

### Task 2: `TaskMetaRow` component

**Files:**
- Create: `src/components/TaskMetaRow.tsx`
- Test: `src/components/TaskMetaRow.test.tsx`

**Interfaces:**
- Consumes: `TaskPriority` type from `@/lib/tasks` (unchanged), tokens/icons
  from Task 1.
- Produces: `export function TaskMetaRow(props: { priority: TaskPriority;
  estimatedMinutes: number | null; deadline: string | null }): JSX.Element`
  — used by Task 7 (Inbox) and Task 8 (Today) as
  `<TaskMetaRow priority={task.priority} estimatedMinutes={task.estimatedMinutes} deadline={task.deadline} />`.

- [ ] **Step 1: Write the failing test**

Create `src/components/TaskMetaRow.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskMetaRow } from "./TaskMetaRow";

describe("TaskMetaRow", () => {
  it("shows the high-priority chip", () => {
    render(<TaskMetaRow priority="high" estimatedMinutes={null} deadline={null} />);
    expect(screen.getByText("● Високий")).toBeInTheDocument();
  });

  it("shows the medium-priority chip", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={null} deadline={null} />);
    expect(screen.getByText("● Середній")).toBeInTheDocument();
  });

  it("shows the low-priority chip", () => {
    render(<TaskMetaRow priority="low" estimatedMinutes={null} deadline={null} />);
    expect(screen.getByText("● Низький")).toBeInTheDocument();
  });

  it("shows estimated minutes when present", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={45} deadline={null} />);
    expect(screen.getByText("~45 хв")).toBeInTheDocument();
  });

  it("does not show a time element when estimatedMinutes is null", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={null} deadline={null} />);
    expect(screen.queryByText(/хв/)).not.toBeInTheDocument();
  });

  it("shows a formatted deadline when present", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={null} deadline="2026-07-25" />);
    expect(screen.getByText("25.07")).toBeInTheDocument();
  });

  it("does not show a deadline element when deadline is null", () => {
    render(<TaskMetaRow priority="medium" estimatedMinutes={null} deadline={null} />);
    expect(screen.queryByText(/^\d{2}\.\d{2}$/)).not.toBeInTheDocument();
  });

  it("shows both minutes and deadline together", () => {
    render(<TaskMetaRow priority="high" estimatedMinutes={30} deadline="2026-12-01" />);
    expect(screen.getByText("~30 хв")).toBeInTheDocument();
    expect(screen.getByText("01.12")).toBeInTheDocument();
  });

  it("falls back to the medium chip for an unrecognized priority value", () => {
    const legacyProps = {
      priority: "urgent" as unknown as "high",
      estimatedMinutes: null,
      deadline: null,
    };
    render(<TaskMetaRow {...legacyProps} />);
    expect(screen.getByText("● Середній")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/TaskMetaRow.test.tsx`
Expected: FAIL — `./TaskMetaRow` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/components/TaskMetaRow.tsx`:

```tsx
import { Calendar, Clock } from "lucide-react";
import type { TaskPriority } from "@/lib/tasks";

interface TaskMetaRowProps {
  priority: TaskPriority;
  estimatedMinutes: number | null;
  deadline: string | null;
}

const PRIORITY_CHIP: Record<
  TaskPriority,
  { label: string; text: string; bg: string }
> = {
  high: { label: "Високий", text: "text-priority-high-text", bg: "bg-priority-high/16" },
  medium: { label: "Середній", text: "text-priority-medium-text", bg: "bg-priority-medium/16" },
  low: { label: "Низький", text: "text-priority-low-text", bg: "bg-priority-low/16" },
};

export function TaskMetaRow({ priority, estimatedMinutes, deadline }: TaskMetaRowProps) {
  const chip = PRIORITY_CHIP[priority] ?? PRIORITY_CHIP.medium;
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-xs text-text-secondary">
      <span className={`rounded-tag px-2.5 py-1 font-semibold ${chip.bg} ${chip.text}`}>
        ● {chip.label}
      </span>
      {typeof estimatedMinutes === "number" && (
        <span className="inline-flex items-center gap-1">
          <Clock size={13} strokeWidth={2} aria-hidden="true" />~{estimatedMinutes} хв
        </span>
      )}
      {typeof deadline === "string" && (
        <span className="inline-flex items-center gap-1">
          <Calendar size={13} strokeWidth={2} aria-hidden="true" />
          {deadline.split("-")[2]}.{deadline.split("-")[1]}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/TaskMetaRow.test.tsx`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/TaskMetaRow.tsx src/components/TaskMetaRow.test.tsx
git commit -m "feat: add TaskMetaRow component for priority/time/deadline display"
```

---

### Task 3: `formatTodayCount` helper

**Files:**
- Modify: `src/lib/tasks.ts`
- Modify: `src/lib/tasks.test.ts`

**Interfaces:**
- Consumes: the existing private `pluralizeZadacha(n: number): string` in
  `src/lib/tasks.ts` (already used by `formatBacklogCount`).
- Produces: `export function formatTodayCount(count: number): string` —
  used by Task 8 (Today) as `formatTodayCount(todayTasks.length)`.

- [ ] **Step 1: Write the failing test**

In `src/lib/tasks.test.ts`, add `formatTodayCount` to the existing import
list from `./tasks` (alphabetically, next to `formatTaskMeta`), then add
this `describe` block immediately after the existing
`describe("formatPlanSummary", ...)` block (before `describe("loadTasks / saveTasks", ...)`):

```ts
describe("formatTodayCount", () => {
  it("uses the singular form for 1", () => {
    expect(formatTodayCount(1)).toBe("1 задача на сьогодні");
  });

  it("uses the few form for 2-4", () => {
    expect(formatTodayCount(2)).toBe("2 задачі на сьогодні");
    expect(formatTodayCount(4)).toBe("4 задачі на сьогодні");
  });

  it("uses the many form for 5-20 and for 0", () => {
    expect(formatTodayCount(5)).toBe("5 задач на сьогодні");
    expect(formatTodayCount(11)).toBe("11 задач на сьогодні");
    expect(formatTodayCount(0)).toBe("0 задач на сьогодні");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/tasks.test.ts`
Expected: FAIL — `formatTodayCount` is not exported from `./tasks`.

- [ ] **Step 3: Write the implementation**

In `src/lib/tasks.ts`, add this function directly after
`formatPlanSummary` (which currently ends right before the
`// Tasks saved before priority/estimatedMinutes/deadline existed...`
comment):

```ts
export function formatTodayCount(count: number): string {
  return `${count} ${pluralizeZadacha(count)} на сьогодні`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/tasks.test.ts`
Expected: PASS, all tests green (existing tests plus the 3 new ones).
`formatTaskMeta` and its tests are untouched in this task — they're still
in use by `inbox/page.tsx` and `today/page.tsx` until Tasks 7 and 8.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks.ts src/lib/tasks.test.ts
git commit -m "feat: add formatTodayCount helper for the Today screen subtitle"
```

---

### Task 4: BottomNav redesign

**Files:**
- Modify: `src/components/BottomNav.tsx` (full replacement)

**Interfaces:**
- Consumes: tokens/icons from Task 1.
- Produces: nothing consumed by later tasks.

No test changes in this task — `src/components/BottomNav.test.tsx`
already asserts only on the link's accessible name via case-insensitive
regex (`/capture/i` etc.), which is unaffected by swapping the icon
(icons are `aria-hidden`).

- [ ] **Step 1: Replace `src/components/BottomNav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Inbox, SquarePen } from "lucide-react";

const TABS = [
  { href: "/", label: "Capture", Icon: SquarePen },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/today", label: "Today", Icon: CheckCircle2 },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-surface-border bg-background pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 py-2 text-sm font-medium ${
                  isActive ? "text-accent-light" : "text-[#8B8B95]"
                }`}
              >
                <tab.Icon size={22} strokeWidth={2} aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Run the component's test to confirm no regression**

Run: `npm test -- src/components/BottomNav.test.tsx`
Expected: PASS, both existing tests green, unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "feat: restyle BottomNav with dark theme tokens and lucide icons"
```

---

### Task 5: OnboardingOverlay redesign

**Files:**
- Modify: `src/components/OnboardingOverlay.tsx` (full replacement)
- Modify: `src/components/OnboardingOverlay.test.tsx:12-15`

**Interfaces:**
- Consumes: tokens/icons from Task 1.
- Produces: nothing consumed by later tasks (still `export function
  OnboardingOverlay({ onStart }: { onStart: () => void })`, unchanged
  signature — Task 6 renders it exactly as it does today).

- [ ] **Step 1: Update the subheading assertion first (RED)**

In `src/components/OnboardingOverlay.test.tsx`, change the string literal
on lines 12-14 from:

```ts
      screen.getByText(
        "Надиктуй усе, що в голові. AI розкладе це на задачі — з пріоритетом, часом і дедлайном — і сам складе твій план на сьогодні."
      )
```

to:

```ts
      screen.getByText(
        "Запиши або надиктуй усе, що в голові. AI розкладе це на задачі — з пріоритетом, часом і дедлайном — і сам складе твій план на сьогодні."
      )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/OnboardingOverlay.test.tsx`
Expected: FAIL — the component still renders the old subheading text.

- [ ] **Step 3: Replace `src/components/OnboardingOverlay.tsx`**

```tsx
"use client";

import { CheckCircle2, Inbox, SquarePen, type LucideIcon } from "lucide-react";

interface OnboardingOverlayProps {
  onStart: () => void;
}

const CARDS: { Icon: LucideIcon; label: string; hint: string }[] = [
  { Icon: SquarePen, label: "Capture", hint: "Наговори все" },
  { Icon: Inbox, label: "Inbox", hint: "AI розкладе" },
  { Icon: CheckCircle2, label: "Today", hint: "Готовий план" },
];

export function OnboardingOverlay({ onStart }: OnboardingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-center gap-8 bg-background p-6">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold">Плануй день голосом</h1>
        <p className="text-lg text-text-secondary">
          Запиши або надиктуй усе, що в голові. AI розкладе це на задачі — з
          пріоритетом, часом і дедлайном — і сам складе твій план на
          сьогодні.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {CARDS.map((card) => (
          <div
            key={card.label}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-control border border-surface-border bg-surface p-3"
          >
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-small bg-accent/15 text-accent-light">
              <card.Icon size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="text-sm font-medium">{card.label}</span>
            <span className="text-center text-xs text-text-secondary">
              {card.hint}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onStart}
        className="h-16 rounded-control bg-accent text-lg font-medium text-white shadow-[0_8px_22px_rgba(110,86,247,0.4)]"
      >
        Почати
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/OnboardingOverlay.test.tsx`
Expected: PASS, both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/OnboardingOverlay.tsx src/components/OnboardingOverlay.test.tsx
git commit -m "feat: restyle OnboardingOverlay with dark theme and update subheading copy"
```

---

### Task 6: Capture screen redesign

**Files:**
- Modify: `src/app/page.tsx` (full replacement)
- Modify: `src/app/page.test.tsx:355` and `:366`

**Interfaces:**
- Consumes: tokens/icons from Task 1; `OnboardingOverlay` unchanged from
  Task 5.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the hint-text assertions first (RED)**

In `src/app/page.test.tsx`, change both occurrences (lines 355 and 366) of:

```ts
        screen.getByText(/Натисни 🎤 і просто проговори все/)
```

and

```ts
        screen.queryByText(/Натисни 🎤 і просто проговори все/)
```

to:

```ts
        screen.getByText(/Запиши або натисни мікрофон і проговори все/)
```

and

```ts
        screen.queryByText(/Запиши або натисни мікрофон і проговори все/)
```

respectively (keep `getByText` on line 355's test and `queryByText` on
line 366's test — only the regex text changes, not which query function is
used).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/page.test.tsx`
Expected: FAIL — 2 of the tests in the "empty-state hint" describe block
fail, since the component still renders the old hint copy with 🎤. All
other tests in the file still pass (they don't touch this text).

- [ ] **Step 3: Replace `src/app/page.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Plus } from "lucide-react";
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
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Що в голові?"
        aria-label="Що в голові?"
        className="flex-1 w-full resize-none rounded-control border border-surface-border bg-surface p-4 text-lg leading-relaxed text-foreground placeholder:text-text-placeholder outline-none focus:border-accent"
      />
      {displayMessage && (
        <p role="status" className="text-sm text-text-secondary">
          {displayMessage}
        </p>
      )}
      {text.trim().length === 0 && !displayMessage && (
        <p className="text-sm text-text-secondary">
          Запиши або натисни мікрофон і проговори все, що треба зробити.
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
          className={`flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-small disabled:opacity-30 ${
            isRecording ? "bg-priority-high text-white" : "bg-surface text-text-secondary"
          }`}
        >
          <Mic size={22} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={text.trim().length === 0 || isSubmitting}
          className="flex h-16 flex-1 items-center justify-center gap-2 rounded-control bg-accent text-lg font-medium text-white shadow-[0_8px_22px_rgba(110,86,247,0.4)] disabled:opacity-30 disabled:shadow-none"
        >
          {isSubmitting ? (
            "Розбираю…"
          ) : (
            <>
              <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
              Додати
            </>
          )}
        </button>
      </div>
    </div>
  );
}
```

Note: the `<h1>Що в голові?</h1>` element from the previous version is
gone — the textarea's `placeholder`/`aria-label` (both still exactly
`"Що в голові?"`) already carry that copy, so `getByLabelText("Що в
голові?")` in the tests keeps working unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/page.test.tsx`
Expected: PASS, all 20 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: restyle Capture screen with dark theme and update hint copy"
```

---

### Task 7: Inbox screen redesign

**Files:**
- Modify: `src/app/inbox/page.tsx` (full replacement)
- Modify: `src/app/inbox/page.test.tsx` (full replacement)

**Interfaces:**
- Consumes: `TaskMetaRow` from Task 2, tokens/icons from Task 1.
- Produces: nothing consumed by later tasks. `formatTaskMeta` is no longer
  imported here after this task (its last remaining consumer becomes
  `today/page.tsx`, handled in Task 8).

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `src/app/inbox/page.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "./page";
import type { Task } from "@/lib/tasks";

const { moveToToday, removeTask, tasksMock } = vi.hoisted(() => ({
  moveToToday: vi.fn(),
  removeTask: vi.fn(),
  tasksMock: vi.fn<() => Task[]>(),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: tasksMock(),
    moveToToday,
    removeTask,
  }),
}));

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

describe("InboxPage", () => {
  beforeEach(() => {
    moveToToday.mockClear();
    removeTask.mockClear();
  });

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

  it("renders only inbox tasks", () => {
    tasksMock.mockReturnValue([inboxTask, todayTask]);
    render(<InboxPage />);
    expect(screen.getByText("купити молоко")).toBeInTheDocument();
    expect(screen.queryByText("вже розкладено")).not.toBeInTheDocument();
  });

  it("renders the priority/time/deadline metadata line", () => {
    tasksMock.mockReturnValue([inboxTask]);
    render(<InboxPage />);
    expect(screen.getByText("● Високий")).toBeInTheDocument();
    expect(screen.getByText("~15 хв")).toBeInTheDocument();
    expect(screen.getByText("25.07")).toBeInTheDocument();
  });

  it("moves a task to today on click", async () => {
    tasksMock.mockReturnValue([inboxTask]);
    const user = userEvent.setup();
    render(<InboxPage />);

    await user.click(screen.getByRole("button", { name: "Сьогодні" }));

    expect(moveToToday).toHaveBeenCalledWith("1");
  });

  it("removes a task on click", async () => {
    tasksMock.mockReturnValue([inboxTask]);
    const user = userEvent.setup();
    render(<InboxPage />);

    await user.click(screen.getByRole("button", { name: "Видалити" }));

    expect(removeTask).toHaveBeenCalledWith("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/inbox/page.test.tsx`
Expected: FAIL — the "Сьогодні" button test fails (current button's
accessible name is still `"→ Сьогодні"`), and the metadata-line test fails
(current markup renders `formatTaskMeta`'s joined string, not the three
separate chip/time/deadline pieces).

- [ ] **Step 3: Replace `src/app/inbox/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ArrowRight, Inbox as InboxIcon, X } from "lucide-react";
import { TaskMetaRow } from "@/components/TaskMetaRow";
import { useTasks } from "@/hooks/useTasks";

export default function InboxPage() {
  const { tasks, moveToToday, removeTask } = useTasks();
  const inboxTasks = tasks.filter((task) => task.status === "inbox");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      {inboxTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <InboxIcon
            size={40}
            strokeWidth={2}
            className="text-text-secondary"
            aria-hidden="true"
          />
          <p className="text-text-secondary">
            Inbox поки порожній. Тут з&apos;являться задачі, щойно ти щось
            надиктуєш.
          </p>
          <Link
            href="/"
            className="flex h-12 items-center justify-center rounded-control bg-accent px-6 text-sm font-medium text-white"
          >
            ← У Capture
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {inboxTasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-3 rounded-card border border-surface-border bg-surface p-4"
            >
              <div>
                <span className="block text-lg font-bold">{task.text}</span>
                <div className="mt-2">
                  <TaskMetaRow
                    priority={task.priority}
                    estimatedMinutes={task.estimatedMinutes}
                    deadline={task.deadline}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveToToday(task.id)}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-small bg-accent text-sm font-medium text-white"
                >
                  Сьогодні
                  <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  aria-label="Видалити"
                  className="flex h-12 w-12 items-center justify-center rounded-small bg-[#1F1F25] text-text-secondary"
                >
                  <X size={15} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
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
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/inbox/page.tsx src/app/inbox/page.test.tsx
git commit -m "feat: restyle Inbox screen with dark theme and TaskMetaRow"
```

---

### Task 8: Today screen redesign + remove dead formatting code

**Files:**
- Modify: `src/app/today/page.tsx` (full replacement)
- Modify: `src/app/today/page.test.tsx` (full replacement)
- Modify: `src/lib/tasks.ts` (remove `formatTaskMeta` and `PRIORITY_ICON`)
- Modify: `src/lib/tasks.test.ts` (remove the `formatTaskMeta` describe
  block and its import)

**Interfaces:**
- Consumes: `TaskMetaRow` from Task 2, `formatTodayCount` from Task 3,
  tokens/icons from Task 1.
- Produces: nothing consumed by later tasks. After this task,
  `formatTaskMeta`/`PRIORITY_ICON` have no remaining call sites anywhere in
  the app (verified: Task 7 already removed the Inbox call site; this task
  removes the last one), so they're deleted in the same task, leaving no
  broken intermediate state at any commit boundary.

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
    expect(screen.getByText("● Низький")).toBeInTheDocument();
    expect(screen.getByText("~15 хв")).toBeInTheDocument();
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
        screen.queryByRole("button", { name: "Сформувати день" })
      ).not.toBeInTheDocument();
    });

    it("renders the button when the backlog has tasks, even if Today already has tasks", () => {
      tasksMock.mockReturnValue([inboxTask, todayTask]);
      render(<TodayPage />);
      expect(
        screen.getByRole("button", { name: "Сформувати день" })
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

      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

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
      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

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

      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

      expect(
        screen.getByRole("button", { name: "AI планує твій день…" })
      ).toBeDisabled();

      resolveFetch({ ok: true, json: async () => planResponse() });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Перепланувати" })
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

      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

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

      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

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

      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Перепланувати" })
        ).toBeInTheDocument()
      );
    });

    it("shows the time summary and today-count subtitle after a successful plan", async () => {
      // tasksMock is static (mockReturnValue, not mockReturnValueOnce), and
      // applyDayPlan is a no-op mock — it never actually moves inboxTask to
      // "today". Including todayTask alongside inboxTask here means
      // todayTasks.length is 1 both before and after the click, so the
      // subtitle assertion reflects the mocked tasks list, independent of
      // whatever the mocked applyDayPlan does or doesn't do.
      tasksMock.mockReturnValue([inboxTask, todayTask]);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => planResponse({ selected: ["1"], totalMinutes: 120 }),
        })
      );
      const user = userEvent.setup();
      render(<TodayPage />);

      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

      await waitFor(() =>
        expect(screen.getByText("~2 год заплановано")).toBeInTheDocument()
      );
      expect(screen.getByText("1 задача на сьогодні")).toBeInTheDocument();
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

      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

      await waitFor(() =>
        expect(
          screen.getByText(
            "Задач більше, ніж влізе у день. Лишила 2 на потім (у беклозі)."
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

      await user.click(screen.getByRole("button", { name: "Сформувати день" }));

      await waitFor(() =>
        expect(screen.getByText("~15 хв заплановано")).toBeInTheDocument()
      );
      expect(screen.queryByText(/Лишила/)).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/today/page.test.tsx`
Expected: FAIL — button-name assertions fail (component still renders
`"✨ Сформувати день"`/`"↻ Перепланувати"`), the metadata-line test fails
(still uses `formatTaskMeta`'s joined string), the today-count subtitle
test fails (subtitle doesn't exist yet), and the banner text assertion
fails (still has the leading `"⚠️ "`).

- [ ] **Step 3: Replace `src/app/today/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sparkles, TriangleAlert, X } from "lucide-react";
import { formatBacklogCount, formatPlanSummary, formatTodayCount } from "@/lib/tasks";
import { TaskMetaRow } from "@/components/TaskMetaRow";
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
            className="h-12 rounded-control border border-surface-border bg-surface px-4 text-base text-foreground placeholder:text-text-placeholder outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handlePlanDay}
            disabled={isPlanning}
            className="flex h-16 items-center justify-center gap-2 rounded-control bg-accent text-lg font-medium text-white shadow-[0_8px_22px_rgba(110,86,247,0.4)] disabled:opacity-30 disabled:shadow-none"
          >
            {isPlanning ? (
              "AI планує твій день…"
            ) : (
              <>
                <Sparkles size={18} strokeWidth={2} aria-hidden="true" />
                {hasPlanned ? "Перепланувати" : "Сформувати день"}
              </>
            )}
          </button>
          {planError && (
            <p role="status" className="text-sm text-text-secondary">
              {planError}
            </p>
          )}
        </div>
      )}
      {planSummary && (
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-[28px] font-extrabold">
              {formatPlanSummary(planSummary.totalMinutes)}
            </p>
            <p className="text-sm text-text-secondary">
              {formatTodayCount(todayTasks.length)}
            </p>
          </div>
          {planSummary.overloaded && (
            <p className="flex items-start gap-2 rounded-banner border border-[rgba(255,176,32,0.28)] bg-[rgba(255,176,32,0.1)] p-3 text-sm text-priority-medium-text">
              <TriangleAlert
                size={16}
                strokeWidth={2}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                {planSummary.note} Лишила {planSummary.deferredCount} на потім
                (у беклозі).
              </span>
            </p>
          )}
        </div>
      )}
      {todayTasks.length === 0 ? (
        <p className="text-text-secondary">
          {backlogTasks.length === 0
            ? "Спершу додай задачі в Inbox — і AI складе твій день."
            : formatBacklogCount(backlogTasks.length)}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {todayTasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-card border border-surface-border bg-surface p-4"
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
                    ? "border-accent bg-accent text-white"
                    : "border-surface-border"
                }`}
              >
                {task.done ? "✓" : ""}
              </button>
              <div className="flex-1">
                <span
                  className={`block text-lg font-bold ${
                    task.done ? "text-text-secondary line-through" : ""
                  }`}
                >
                  {task.text}
                </span>
                <div className="mt-2">
                  <TaskMetaRow
                    priority={task.priority}
                    estimatedMinutes={task.estimatedMinutes}
                    deadline={task.deadline}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeTask(task.id)}
                aria-label="Видалити"
                className="flex h-12 w-12 items-center justify-center rounded-small bg-[#1F1F25] text-text-secondary"
              >
                <X size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Remove now-unused `formatTaskMeta`/`PRIORITY_ICON`**

In `src/lib/tasks.ts`, delete the `PRIORITY_ICON` constant (lines 24-28)
and the `formatTaskMeta` function (lines 63-76) entirely — nothing in the
app imports either anymore. Also update the comment directly above
`normalizeTask` (currently: `// ... doesn't crash formatTaskMeta.`) since
it names a function that no longer exists:

Change:

```ts
// Tasks saved before priority/estimatedMinutes/deadline existed are missing
// those fields entirely — backfill safe defaults so old localStorage data
// (from before this feature shipped) doesn't crash formatTaskMeta.
function normalizeTask(raw: Task): Task {
```

to:

```ts
// Tasks saved before priority/estimatedMinutes/deadline existed are missing
// those fields entirely — backfill safe defaults so old localStorage data
// (from before this feature shipped) doesn't crash when rendered.
function normalizeTask(raw: Task): Task {
```

In `src/lib/tasks.test.ts`, remove `formatTaskMeta` from the import list
(the `import { ... } from "./tasks";` block near the top) and delete the
entire `describe("formatTaskMeta", ...)` block (its 5 tests).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/app/today/page.test.tsx src/lib/tasks.test.ts`
Expected: PASS — today's 18 tests green, tasks.ts tests green (5 fewer
than before, the deleted `formatTaskMeta` tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/today/page.tsx src/app/today/page.test.tsx src/lib/tasks.ts src/lib/tasks.test.ts
git commit -m "feat: restyle Today screen with dark theme; remove unused formatTaskMeta"
```

---

### Task 9: Full verification pass

**Files:** none (verification only; fix-forward if issues are found, then
re-run this task's steps).

**Interfaces:** none.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 2: Lint and build**

Run: `npm run lint`
Expected: no errors/warnings.

Run: `npm run build`
Expected: compiles successfully, same routes listed as before, no
TypeScript errors.

- [ ] **Step 3: Manual visual + functional walkthrough**

Start the dev server and, using the Browser tool at a mobile viewport,
walk through every screen and confirm both look (against the mockup) and
behavior (nothing broken):

- **Onboarding**: fresh localStorage → overlay shows the new subheading
  copy, 3 dark cards with lucide icons in indigo tiles, accent "Почати"
  button; clicking it hides the overlay and focuses the textarea.
- **Capture**: no `Що в голові?` heading above the field (placeholder
  only); dark card textarea; hint text below (no 🎤 emoji) when empty;
  mic button is the small secondary square, turns to
  red/accent + `Mic` icon while recording; "Додати" is the wide accent
  button with a `Plus` icon; typing and submitting still adds a task and
  clears the field.
  - **Inbox**: empty state shows the `Inbox` icon (not 📥) and the link
  back to Capture works; with tasks, each renders as a dark rounded card
  with a colored priority chip + `Clock`/`Calendar` meta, an accent
  "Сьогодні" button (moves the task — verify it disappears from Inbox and
  appears on Today), and an `X` delete button (verify it removes the
  task).
  - **Today**: empty/backlog-only states render correctly; typing a
  constraint and clicking "Сформувати день" (real click, not just visual)
  actually calls the real flow — either exercise it against a seeded
  backlog to confirm `applyDayPlan` still moves tasks and the summary
  line + `N задач на сьогодні` subtitle render, or confirm via the
  automated tests already covering this if live-API verification isn't
  necessary for a styling-only change (no prompt/route logic changed in
  this plan, so a full live-OpenRouter re-verification is not required —
  confirm this reasoning holds, and if anything about the request/response
  shape looks different in the Network tab, stop and investigate before
  proceeding); confirm the done-toggle checkbox and delete `X` button on
  Today's cards still work exactly as before.
- **Bottom nav**: on every screen, the active tab is indigo
  (`text-accent-light`) with its label, inactive tabs are muted gray;
  icons are lucide, not emoji.

- [ ] **Step 4: Fix forward if needed**

If any step in Step 3 surfaces a bug or visual mismatch against the
mockup/spec, fix it in the relevant file, re-run `npm test`, and commit
the fix with a message describing what was wrong (e.g. `fix: <specific
issue>`). Re-run the affected part of Step 3 after fixing.

- [ ] **Step 5: Report**

Summarize what was verified (automated test counts, lint/build status,
and the outcome of the manual walkthrough for each screen) so the branch
is ready for final review.
