# Design: Dark theme visual redesign (monobank-inspired)

## Context

Purely visual redesign of all four screens (Onboarding, Capture, Inbox, Today)
plus the bottom nav. No business logic, routes, AI parsing, day-formation,
or task storage changes. Ground truth for this design is two artifacts the
user supplied directly:

- A written spec with exact hex values, radii, spacing, and an icon map.
- A working HTML mockup (`day-planner-mockups.html`) rendering all four
  screens with real markup/CSS, which is more precise than the prose in a
  few places (see "Resolving mockup vs. prose" below).

The app currently has no design-token layer — colors are ad hoc Tailwind
utilities (`bg-black`, `text-zinc-500`, `dark:bg-white`, etc.) with a
`prefers-color-scheme: dark` media query in `globals.css`. This redesign
replaces that with a single, fixed dark theme and a real token layer.

## Non-goals (explicitly out of scope)

- No changes to `useTasks.tsx`, any `/api/*` route, `src/lib/planDayResponse.ts`,
  `src/lib/onboarding.ts`, or `src/hooks/useAudioRecording.ts`.
- No changes to when/why the plan-day banner appears, what triggers it, or
  what data it's built from — only how it's styled. The banner's text is
  still composed as `{note} Лишила {deferredCount} на потім (у беклозі).`
  (see "Banner" below) — the mockup's example banner sentence
  ("1 задачу відклала на потім — не влізла у день...") is a stand-in for
  the mockup screenshot, not a literal string to hardcode.
- No new features, no new user-facing behavior beyond one small additive
  text element (the "N задач на сьогодні" subtitle, explicitly requested).

## Design tokens

Fixed dark theme — no `@media (prefers-color-scheme: dark)`, no `dark:`
Tailwind variants anywhere in the app after this change (the dark palette
becomes the only, unprefixed default).

Added to `src/app/globals.css`, following the file's existing pattern
(raw hex in `:root`, mapped through `@theme inline` so Tailwind generates
utilities like `bg-surface`, `text-accent`, `border-surface-border`,
including opacity variants like `bg-priority-high/16` for free):

```css
:root {
  --background: #0E0E11;
  --foreground: #F4F4F6;
  --surface: #1A1A1F;
  --surface-border: #2A2A31;
  --accent: #6E56F7;
  --accent-light: #8F7BFF;      /* active tab icon/text, onboarding icon-tile fg */
  --text-secondary: #9A9AA5;
  --text-placeholder: #6B6B75;
  --priority-high: #FF5A5F;
  --priority-high-text: #FF7A7E;
  --priority-medium: #FFB020;
  --priority-medium-text: #FFC155;
  --priority-low: #2ECC71;
  --priority-low-text: #4ADE80;  /* not in the mockup; lightened from base
                                     the same way medium/high were, for
                                     on-dark-background legibility */
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

  --radius-card: 18px;     /* task-list cards */
  --radius-control: 16px;  /* primary buttons, inputs, textarea, onboarding
                               mini-cards, onboarding CTA */
  --radius-small: 12px;    /* small/secondary buttons: delete ×, "Сьогодні"
                               pill, onboarding icon tile */
  --radius-tag: 9px;       /* priority chip */
  --radius-banner: 14px;   /* overload warning banner */

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
}
```

Radii above resolve the one place the prose and the mockup differ in
granularity: the prose gives three buckets (cards 18px, controls 16px,
small buttons 12px); the mockup additionally uses 9px for the priority chip
and 14px for the warning banner. Both sources agree everywhere they overlap
— the mockup just has two extra specific values the prose didn't call out.
All five are named tokens above.

Spacing: no new tokens — Tailwind's default spacing scale is already
4px-based (`p-2`=8px, `p-3`=12px, `p-4`=16px, `p-6`=24px), so "spacing
multiples of 4" means: keep using Tailwind's stock `p-*`/`gap-*` utilities
from that set, don't reach for arbitrary values.

`src/app/layout.tsx`: add `themeColor: "#0E0E11"` to the existing
`export const viewport: Viewport = { viewportFit: "cover" }` object, so the
mobile browser chrome matches the fixed dark background (reinforces "must
not invert from browser preference").

## Icons

Add `lucide-react` as a dependency. Full replacement map (every emoji in
the app today):

| Where | Old | New |
|---|---|---|
| BottomNav / Onboarding cards — Capture | ✏️ | `SquarePen` |
| BottomNav / Onboarding cards — Inbox | 📥 | `Inbox` |
| BottomNav / Onboarding cards — Today | ✅ | `CheckCircle2` |
| Capture — mic button | 🎤 | `Mic` |
| Capture — Add button | (none, text only) | `Plus` |
| Inbox — empty state | 📥 | `Inbox` |
| Inbox — "Сьогодні" button | → | `ArrowRight` |
| Today/Inbox — delete button | × | `X` |
| Today — "Сформувати день" / "Перепланувати" button | ✨ / ↻ | `Sparkles` (both states) |
| Today/Inbox — time meta | (none) | `Clock` |
| Today/Inbox — deadline meta | (none) | `Calendar` |
| Today — overload banner | ⚠️ | `TriangleAlert` |

One glyph is deliberately **not** touched: the "✓" done-toggle checkmark on
Today. It's a plain monochrome symbol (not a colorful pictograph), and
neither the prose nor the icon map names a replacement for it — it stays
exactly as it renders today (no visual or markup change).

Icon sizing/weight, taken from the mockup: `strokeWidth={2}` as the
default for nav icons (22px) and meta icons (13px); `strokeWidth={2.2}`
for the small action icons (ArrowRight/X, 15px); `strokeWidth={2.4}` for
the Capture screen's `Plus` (20px, the app's single highest-emphasis
icon). All icons render inside their button/label with `aria-hidden="true"`
(they're always paired with visible adjacent text, so they add nothing to
the accessible name — this matters for the test-impact section below).

## Screen-by-screen

**Onboarding** (`src/components/OnboardingOverlay.tsx`): overlay background
→ `bg-background`. Subheading copy changes to (exact, per user's request):
"Запиши або надиктуй усе, що в голові. AI розкладе це на задачі — з
пріоритетом, часом і дедлайном — і сам складе твій план на сьогодні." Each
of the 3 cards → `bg-surface`, `border-surface-border`, `rounded-control`;
icon sits in a 38×38 `rounded-small` tile with `bg-accent/15` and
`text-accent-light`. CTA button → `bg-accent`, `text-white`,
`rounded-control`, soft shadow: `shadow-[0_8px_22px_rgba(110,86,247,0.4)]`,
matching the mockup's `.start`/`.add`/`.gen` shadow exactly. This same
arbitrary Tailwind value is repeated on every accent CTA button (onboarding
CTA, Capture's Add button, Today's Сформувати/Перепланувати button) — no
shared class extracted for it, matching this codebase's existing convention
of inline utility classes over custom component classes.

**Capture** (`src/app/page.tsx`): remove the `<h1>Що в голові?</h1>`
element entirely — the textarea's existing `placeholder="Що в голові?"`
and `aria-label="Що в голові?"` already carry that copy, unchanged.
Textarea → `bg-surface`, `border-surface-border`, `rounded-control`,
`text-placeholder` for the placeholder state (this is the default
placeholder color behavior, nothing to wire up manually). Hint paragraph
copy changes to: "Запиши або натисни мікрофон і проговори все, що треба
зробити." (drop the literal 🎤 character — no icon substitute inline in
that sentence, per the mockup) followed by the existing example line
unchanged. Mic button → 54×54, `rounded-small`, secondary style
(`bg-surface`, `text-text-secondary` idle); when `isRecording` is true,
switch to `bg-priority-high` with white icon (same on/off logic as today,
new colors). Add button unchanged in behavior/position, now `bg-accent`,
`text-white`, `rounded-control`, with a `Plus` icon before the label.

**Inbox / Today task cards**: replace every `formatTaskMeta(task)` call
site with a new shared component (see "New component" below). Cards
→ `bg-surface`, `border-surface-border`, `rounded-card`, `p-4` (≈15px,
nearest 4px-scale value). Task title stays plain text, now `font-bold`
per the mockup's `.tname`. Inbox's "Сьогодні" button → `bg-accent`,
`text-white`, `rounded-small`, `ArrowRight` icon after the label. Delete
button → `bg-[#1F1F25]` (the mockup's specific slightly-lighter-than-
surface tone for this one muted button; distinct enough from `--surface`
that it's worth using as-is rather than reusing the surface token),
`rounded-small`, `X` icon replacing the "×" text glyph (the button already
has `aria-label="Видалити"` in both Inbox and Today, so its accessible
name is unaffected by this swap — no test changes needed for it).

**Today summary/banner**: the `~X год заплановано` line → large/bold
(`text-[28px] font-extrabold`, matching the mockup's `.sum`). New sibling
line under it: `{count} {pluralizeZadacha(count)} на сьогодні` where
`count = todayTasks.length` — small, `text-text-secondary` (this is the one
new bit of display logic in this redesign, see "New helper" below).
Banner (only rendered when `planSummary.overloaded`) → `bg-[rgba(255,176,32,0.1)]`,
`border border-[rgba(255,176,32,0.28)]`, `text-priority-medium-text`,
`rounded-banner`, with a `TriangleAlert` icon before the text. The text
itself is unchanged in composition: `{note} Лишила {deferredCount} на потім
(у беклозі).` — only the leading `⚠️ ` literal is removed from the JSX
(replaced by the icon) and the container gets the new classes.

**Bottom nav**: icons swap per the table above; active tab →
`text-accent-light` for both icon and label (icon un-hidden weight change
is unnecessary — lucide icons don't have a "filled" variant by default, so
"залита/яскравіша" is achieved via the color change alone, from
`text-text-secondary`-equivalent muted gray to `text-accent-light`, which
is the same mechanism the mockup uses — `.tab.on{color:#8f7bff}` colors
both icon and text via `currentColor`, no separate fill toggle). Inactive
→ a muted gray token; the mockup's inactive tab color (`#8b8b95`) is close
to but not identical to `--text-secondary` (`#9A9AA5`) — use `#8B8B95`
as-is for this one spot (mockup is the more specific source here), most
simply as an arbitrary Tailwind value `text-[#8B8B95]` rather than adding
a sixth barely-different gray token.

## New component: `TaskMetaRow`

`formatTaskMeta` (in `src/lib/tasks.ts`) returns one pre-joined string
(`"🔴 · ~30 хв · 01.12"`). The new design needs three independently styled
pieces (colored priority chip, `Clock`+time, `Calendar`+deadline), which a
single string can't drive. Since `formatTaskMeta` becomes unused everywhere
once both call sites switch to the new component, it — and its
now-orphaned `PRIORITY_ICON` constant — are deleted from `src/lib/tasks.ts`,
along with their tests in `src/lib/tasks.test.ts`. This is the one place
this redesign touches `src/lib/tasks.ts`; nothing else in that file
changes, and no other module imports `formatTaskMeta` (verified — only
`inbox/page.tsx` and `today/page.tsx` did).

New file `src/components/TaskMetaRow.tsx`:

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
          <Clock size={13} aria-hidden="true" />~{estimatedMinutes} хв
        </span>
      )}
      {typeof deadline === "string" && (
        <span className="inline-flex items-center gap-1">
          <Calendar size={13} aria-hidden="true" />
          {deadline.split("-")[2]}.{deadline.split("-")[1]}
        </span>
      )}
    </div>
  );
}
```

The `?? PRIORITY_CHIP.medium` fallback preserves the same defensive
behavior `formatTaskMeta` had for malformed/legacy data (its own test
covered a value with `priority` missing entirely). Used as
`<TaskMetaRow priority={task.priority} estimatedMinutes={task.estimatedMinutes} deadline={task.deadline} />`
in both `inbox/page.tsx` and `today/page.tsx`, replacing
`{formatTaskMeta(task)}`.

## New helper: `formatTodayCount`

`src/lib/tasks.ts` already has a private `pluralizeZadacha(n)` used by
`formatBacklogCount`. Add one more exported function reusing it, for the
Today screen's new subtitle:

```ts
export function formatTodayCount(count: number): string {
  return `${count} ${pluralizeZadacha(count)} на сьогодні`;
}
```

## Test impact (expected, not a regression)

Removing emoji from clickable elements changes their **accessible name**
wherever the emoji was inline text with no `aria-label` override (buttons
with an explicit `aria-label`, like the mic button and delete button, are
unaffected — the label already won). This is a necessary, deliberate
consequence of the redesign, not a functional break, and the implementation
plan must update these test files in lockstep with the component changes:

- `src/app/today/page.test.tsx`: every `{ name: "✨ Сформувати день" }` →
  `{ name: "Сформувати день" }`; every `{ name: "↻ Перепланувати" }` →
  `{ name: "Перепланувати" }` (~13 occurrences total). The banner text
  assertion `"⚠️ Задач більше, ніж влізе у день. Лишила 2 на потім (у
  беклозі)."` → drop the leading `"⚠️ "`. The banner-absence check
  `screen.queryByText(/⚠️/)` → `screen.queryByText(/Лишила/)` (the word
  "Лишила" only ever appears inside the banner sentence). The metadata-line
  test (`"🟢 · ~15 хв"`) → two separate assertions,
  `getByText("● Низький")` and `getByText("~15 хв")` (no deadline on that
  fixture, so no third assertion).
- `src/app/inbox/page.test.tsx`: `{ name: "→ Сьогодні" }` → `{ name:
  "Сьогодні" }`. The metadata-line test (`"🔴 · ~15 хв · 25.07"`) → three
  separate assertions: `getByText("● Високий")`, `getByText("~15 хв")`,
  `getByText("25.07")`.
- `src/app/page.test.tsx`: the two hint-text assertions matching
  `/Натисни 🎤 і просто проговори все/` → match the new copy instead
  (`/Запиши або натисни мікрофон і проговори все/`).
- `src/components/OnboardingOverlay.test.tsx`: the subheading string
  literal → the new copy (see "Onboarding" above).
- `src/lib/tasks.test.ts`: remove the whole `describe("formatTaskMeta", ...)`
  block and its import, since the function is deleted.
- `src/components/BottomNav.test.tsx`: no change needed — its assertions
  already use case-insensitive regex on the label text only (`/capture/i`
  etc.), unaffected by the icon swap.

New tests: `src/components/TaskMetaRow.test.tsx` (chip label per priority,
time/deadline rendering, both-absent case, the medium-fallback for an
unrecognized priority value) and a `formatTodayCount` case added to
`src/lib/tasks.test.ts`'s existing pluralization-style tests (1/2-4/5+,
mirroring the existing `formatBacklogCount` tests).

## Verification

Same bar as every other feature in this project: `npm test`, `npm run
lint`, `npm run build`, then a manual walkthrough of all five states
(onboarding, Capture with empty/non-empty field and mic idle/recording,
Inbox empty and with tasks, Today empty/with-plan/overloaded) in the
Browser tool, confirming visually against the mockup and confirming no
functional regression (adding a task, moving to Today, deleting, toggling
done, forming/re-forming a plan all still work) before commit + push.
