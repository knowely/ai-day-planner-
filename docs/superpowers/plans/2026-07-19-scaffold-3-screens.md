# AI-планер дня — каркас 3 екранів Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first, client-only Next.js scaffold with 3 screens (Capture / Inbox / Today) and bottom tab navigation, backed by React Context + localStorage, no AI parsing yet.

**Architecture:** Task data lives in a single `TasksProvider` React Context (`useTasks` hook), persisted to `localStorage` on every change and loaded on mount inside a `try/catch`. Pure parsing/storage logic is factored into `src/lib/tasks.ts` so it can be unit-tested without rendering React. Each screen is a route under `src/app/`, reading/writing tasks only through `useTasks()`. A `useSpeechRecognition` hook wraps the browser's native Web Speech API with a supported/unsupported branch — no AI/backend involved.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Vitest + React Testing Library for unit tests.

## Global Constraints

- Client-only: no backend, no database, no accounts — from `docs/superpowers/specs/2026-07-19-scaffold-3-screens-design.md` §4.
- Task shape exactly: `{ id, text, status: 'inbox' | 'today', done, createdAt }` — design §3.
- Empty (post-trim) lines never become tasks — design §5.
- `localStorage` read errors/unavailability must not crash the app — must start with an empty list — design §5.
- Mic button must use real Web Speech API where supported, and show fallback message `"Диктування не підтримується в цьому браузері, введи текст вручну"` where unsupported (confirmed by user 2026-07-19, overrides earlier "no AI" framing — this is browser-native speech-to-text, not AI parsing) — design §2 (Capture), §5.
- Bottom nav: 3 tabs, touch target ≥52px — design §2.
- No AI-based task parsing/sorting in this phase — design §1.

---

## File Structure

```
ai-day-planner/
├── vitest.config.ts                     # new — test runner config
├── vitest.setup.ts                      # new — jest-dom matchers
├── src/
│   ├── lib/
│   │   ├── tasks.ts                     # new — Task type, parseCaptureText, createTask, loadTasks, saveTasks
│   │   └── tasks.test.ts                # new
│   ├── hooks/
│   │   ├── useTasks.tsx                 # new — TasksProvider + useTasks()
│   │   ├── useTasks.test.tsx            # new
│   │   ├── useSpeechRecognition.ts      # new — mic hook, browser support detection
│   │   └── useSpeechRecognition.test.ts # new
│   ├── components/
│   │   ├── BottomNav.tsx                # new — 3-tab fixed bottom nav
│   │   └── BottomNav.test.tsx           # new
│   └── app/
│       ├── layout.tsx                   # modify — wrap with TasksProvider + BottomNav, update metadata
│       ├── page.tsx                     # modify — Capture screen (replaces default template)
│       ├── page.test.tsx                # new
│       ├── inbox/
│       │   ├── page.tsx                 # new — Inbox screen
│       │   └── page.test.tsx            # new
│       └── today/
│           ├── page.tsx                 # new — Today screen
│           └── page.test.tsx            # new
```

---

### Task 1: Testing infrastructure (Vitest + React Testing Library)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/lib/smoke.test.ts` (deleted at the end of this task once real tests exist elsewhere — used only to prove the runner works)

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` command; `vitest.config.ts` resolves the `@/*` alias to `src/*` for all later test files.

- [ ] **Step 1: Install test dependencies**

```bash
cd /Users/galynastefura/Documents/Claude/PROJECTS/ai-day-planner
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Add the test script**

Edit `package.json`, inside `"scripts"` add:

```json
    "test": "vitest run"
```

(Full `scripts` block becomes:)

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Write `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Write a smoke test to prove the runner works**

Create `src/lib/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("vitest smoke test", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run it**

```bash
npm test
```

Expected: `1 passed` (the smoke test), no config errors.

- [ ] **Step 7: Delete the smoke test**

```bash
rm src/lib/smoke.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts
git commit -m "test: add Vitest + React Testing Library infrastructure"
```

---

### Task 2: Task data model and pure storage functions

**Files:**
- Create: `src/lib/tasks.ts`
- Test: `src/lib/tasks.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type TaskStatus = "inbox" | "today"`
  - `interface Task { id: string; text: string; status: TaskStatus; done: boolean; createdAt: number }`
  - `parseCaptureText(text: string): string[]`
  - `createTask(text: string): Task`
  - `loadTasks(): Task[]`
  - `saveTasks(tasks: Task[]): void`
  - Later tasks (`useTasks.tsx`, all screens) import these from `@/lib/tasks`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tasks.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createTask, loadTasks, parseCaptureText, saveTasks } from "./tasks";

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
  it("creates an inbox task with the given text", () => {
    const task = createTask("купити молоко");
    expect(task.text).toBe("купити молоко");
    expect(task.status).toBe("inbox");
    expect(task.done).toBe(false);
    expect(typeof task.id).toBe("string");
    expect(task.id.length).toBeGreaterThan(0);
    expect(typeof task.createdAt).toBe("number");
  });

  it("gives distinct ids to two tasks", () => {
    const a = createTask("a");
    const b = createTask("b");
    expect(a.id).not.toBe(b.id);
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

```bash
npm test -- src/lib/tasks.test.ts
```

Expected: FAIL — `Cannot find module './tasks'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/tasks.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/tasks.test.ts
```

Expected: all tests in this file PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tasks.ts src/lib/tasks.test.ts
git commit -m "feat: add task model and localStorage-backed pure functions"
```

---

### Task 3: `useTasks` hook and `TasksProvider` context

**Files:**
- Create: `src/hooks/useTasks.tsx`
- Test: `src/hooks/useTasks.test.tsx`

**Interfaces:**
- Consumes: `Task`, `createTask`, `loadTasks`, `parseCaptureText`, `saveTasks` from `@/lib/tasks` (Task 2).
- Produces:
  - `TasksProvider({ children }: { children: ReactNode })` — React component.
  - `useTasks(): { tasks: Task[]; addTasksFromText: (text: string) => void; moveToToday: (id: string) => void; toggleDone: (id: string) => void; removeTask: (id: string) => void }`
  - Later tasks (`layout.tsx`, all screens) import `TasksProvider` and `useTasks` from `@/hooks/useTasks`.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useTasks.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TasksProvider, useTasks } from "./useTasks";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <TasksProvider>{children}</TasksProvider>;
}

describe("useTasks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with an empty task list", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));
  });

  it("adds one inbox task per non-empty line", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко\nподзвонити мамі");
    });

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks[0]).toMatchObject({
      text: "купити молоко",
      status: "inbox",
      done: false,
    });
    expect(result.current.tasks[1]).toMatchObject({
      text: "подзвонити мамі",
      status: "inbox",
      done: false,
    });
  });

  it("does not add anything for blank text", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("   \n  ");
    });

    expect(result.current.tasks).toEqual([]);
  });

  it("moves a task from inbox to today", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const id = result.current.tasks[0].id;

    act(() => {
      result.current.moveToToday(id);
    });

    expect(result.current.tasks[0].status).toBe("today");
  });

  it("toggles done on a task", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const id = result.current.tasks[0].id;

    act(() => {
      result.current.toggleDone(id);
    });
    expect(result.current.tasks[0].done).toBe(true);

    act(() => {
      result.current.toggleDone(id);
    });
    expect(result.current.tasks[0].done).toBe(false);
  });

  it("removes a task", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });
    const id = result.current.tasks[0].id;

    act(() => {
      result.current.removeTask(id);
    });

    expect(result.current.tasks).toEqual([]);
  });

  it("persists changes to localStorage", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper });
    await waitFor(() => expect(result.current.tasks).toEqual([]));

    act(() => {
      result.current.addTasksFromText("купити молоко");
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem("ai-day-planner:tasks");
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].text).toBe("купити молоко");
    });
  });

  it("throws when useTasks is called outside a TasksProvider", () => {
    const { result } = renderHook(() => useTasks());
    expect(result.error).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/hooks/useTasks.test.tsx
```

Expected: FAIL — `Cannot find module './useTasks'`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useTasks.tsx`:

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
  loadTasks,
  parseCaptureText,
  saveTasks,
  type Task,
} from "@/lib/tasks";

interface TasksContextValue {
  tasks: Task[];
  addTasksFromText: (text: string) => void;
  moveToToday: (id: string) => void;
  toggleDone: (id: string) => void;
  removeTask: (id: string) => void;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
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
      value={{ tasks, addTasksFromText, moveToToday, toggleDone, removeTask }}
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

```bash
npm test -- src/hooks/useTasks.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTasks.tsx src/hooks/useTasks.test.tsx
git commit -m "feat: add TasksProvider context with localStorage persistence"
```

---

### Task 4: `useSpeechRecognition` hook

**Files:**
- Create: `src/hooks/useSpeechRecognition.ts`
- Test: `src/hooks/useSpeechRecognition.test.ts`

**Interfaces:**
- Consumes: nothing (reads `window.SpeechRecognition` / `window.webkitSpeechRecognition` directly).
- Produces:
  - `isSpeechRecognitionSupported(): boolean`
  - `useSpeechRecognition(onResult: (text: string) => void): { isSupported: boolean; isListening: boolean; start: () => void; stop: () => void }`
  - Task 7 (Capture screen) imports `useSpeechRecognition` from `@/hooks/useSpeechRecognition`.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useSpeechRecognition.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "./useSpeechRecognition";

type Listener = (event: unknown) => void;

class FakeSpeechRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: Listener | null = null;
  onerror: Listener | null = null;
  onend: Listener | null = null;
  start = vi.fn();
  stop = vi.fn();
}

describe("isSpeechRecognitionSupported", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.SpeechRecognition;
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.webkitSpeechRecognition;
  });

  it("is false when no SpeechRecognition constructor exists", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("is true when window.SpeechRecognition exists", () => {
    // @ts-expect-error assigning a test double to a browser global
    window.SpeechRecognition = FakeSpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it("is true when only window.webkitSpeechRecognition exists", () => {
    // @ts-expect-error assigning a test double to a browser global
    window.webkitSpeechRecognition = FakeSpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });
});

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    // @ts-expect-error assigning a test double to a browser global
    window.SpeechRecognition = FakeSpeechRecognition;
  });

  afterEach(() => {
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.SpeechRecognition;
  });

  it("reports supported when the browser has SpeechRecognition", () => {
    const { result } = renderHook(() => useSpeechRecognition(() => {}));
    expect(result.current.isSupported).toBe(true);
  });

  it("does nothing when start() is called without support", () => {
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.SpeechRecognition;
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(onResult));

    act(() => {
      result.current.start();
    });

    expect(result.current.isListening).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
  });

  it("starts listening and forwards the transcript on result", () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(onResult));

    let instance!: FakeSpeechRecognition;
    const OriginalCtor = window.SpeechRecognition as unknown as typeof FakeSpeechRecognition;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.SpeechRecognition = class extends OriginalCtor {
      constructor() {
        super();
        instance = this;
      }
    };

    act(() => {
      result.current.start();
    });

    expect(result.current.isListening).toBe(true);
    expect(instance.start).toHaveBeenCalledTimes(1);

    act(() => {
      instance.onresult?.({
        results: [[{ transcript: "купити молоко" }]],
      });
    });

    expect(onResult).toHaveBeenCalledWith("купити молоко");

    act(() => {
      instance.onend?.(undefined);
    });

    expect(result.current.isListening).toBe(false);
  });

  it("stop() calls the underlying recognition's stop()", () => {
    const { result } = renderHook(() => useSpeechRecognition(() => {}));

    let instance!: FakeSpeechRecognition;
    const OriginalCtor = window.SpeechRecognition as unknown as typeof FakeSpeechRecognition;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.SpeechRecognition = class extends OriginalCtor {
      constructor() {
        super();
        instance = this;
      }
    };

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.stop();
    });

    expect(instance.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/hooks/useSpeechRecognition.test.ts
```

Expected: FAIL — `Cannot find module './useSpeechRecognition'`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useSpeechRecognition.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";

interface SpeechRecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: ((event: unknown) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function useSpeechRecognition(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "uk-UA";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) onResult(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [onResult]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return {
    isSupported: isSpeechRecognitionSupported(),
    isListening,
    start,
    stop,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/hooks/useSpeechRecognition.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSpeechRecognition.ts src/hooks/useSpeechRecognition.test.ts
git commit -m "feat: add Web Speech API hook with support detection"
```

---

### Task 5: `BottomNav` component

**Files:**
- Create: `src/components/BottomNav.tsx`
- Test: `src/components/BottomNav.test.tsx`

**Interfaces:**
- Consumes: `usePathname` from `next/navigation`.
- Produces: `BottomNav()` — React component, default export not used (named export). Task 6 (`layout.tsx`) imports `{ BottomNav }` from `@/components/BottomNav`.

- [ ] **Step 1: Write the failing test**

Create `src/components/BottomNav.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

describe("BottomNav", () => {
  it("renders all three tabs with correct links", () => {
    usePathname.mockReturnValue("/");
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: /capture/i })).toHaveAttribute(
      "href",
      "/"
    );
    expect(screen.getByRole("link", { name: /inbox/i })).toHaveAttribute(
      "href",
      "/inbox"
    );
    expect(screen.getByRole("link", { name: /today/i })).toHaveAttribute(
      "href",
      "/today"
    );
  });

  it("marks the current route as active", () => {
    usePathname.mockReturnValue("/inbox");
    render(<BottomNav />);

    expect(screen.getByRole("link", { name: /inbox/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      screen.getByRole("link", { name: /capture/i })
    ).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/components/BottomNav.test.tsx
```

Expected: FAIL — `Cannot find module './BottomNav'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/BottomNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Capture", icon: "✏️" },
  { href: "/inbox", label: "Inbox", icon: "📥" },
  { href: "/today", label: "Today", icon: "✅" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:bg-black">
      <ul className="flex">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 py-2 text-sm font-medium ${
                  isActive
                    ? "text-black dark:text-white"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                <span className="text-2xl" aria-hidden="true">
                  {tab.icon}
                </span>
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

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/components/BottomNav.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomNav.tsx src/components/BottomNav.test.tsx
git commit -m "feat: add fixed bottom tab navigation"
```

---

### Task 6: Wire up the root layout

**Files:**
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `TasksProvider` from `@/hooks/useTasks` (Task 3), `BottomNav` from `@/components/BottomNav` (Task 5).
- Produces: every route rendered inside `<TasksProvider>` with `<BottomNav>` fixed at the bottom; a `pb-20` wrapper div so page content never sits under the fixed nav.

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TasksProvider } from "@/hooks/useTasks";
import { BottomNav } from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI-планер дня",
  description: "Скинь усе, що в голові, — розклади по Inbox і Today.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TasksProvider>
          <div className="flex-1 pb-20">{children}</div>
          <BottomNav />
        </TasksProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify the project still builds**

```bash
npm run build
```

Expected: `✓ Compiled successfully` — `page.tsx` hasn't changed yet in this task, so this just confirms the new layout composes cleanly with the existing default page.

(This task has no new automated test — layout composition is covered by Task 7-9's screen tests rendering through `TasksProvider`, and by the manual checklist in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: wire TasksProvider and BottomNav into the root layout"
```

---

### Task 7: Capture screen

**Files:**
- Modify: `src/app/page.tsx`
- Test: `src/app/page.test.tsx`

**Interfaces:**
- Consumes: `useTasks` from `@/hooks/useTasks` (Task 3) — uses `addTasksFromText`. `useSpeechRecognition` from `@/hooks/useSpeechRecognition` (Task 4).
- Produces: default-exported `CapturePage` route component at `/`.

- [ ] **Step 1: Write the failing test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CapturePage from "./page";

const { addTasksFromText, useSpeechRecognitionMock } = vi.hoisted(() => ({
  addTasksFromText: vi.fn(),
  useSpeechRecognitionMock: vi.fn(),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({ addTasksFromText }),
}));

vi.mock("@/hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: (onResult: (text: string) => void) =>
    useSpeechRecognitionMock(onResult),
}));

describe("CapturePage", () => {
  beforeEach(() => {
    addTasksFromText.mockClear();
    useSpeechRecognitionMock.mockReset();
  });

  it("adds the typed text and clears the field", async () => {
    useSpeechRecognitionMock.mockReturnValue({
      isSupported: true,
      isListening: false,
      start: vi.fn(),
      stop: vi.fn(),
    });
    const user = userEvent.setup();
    render(<CapturePage />);

    const textarea = screen.getByLabelText("Що в голові?");
    await user.type(textarea, "купити молоко");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    expect(addTasksFromText).toHaveBeenCalledWith("купити молоко");
    expect(textarea).toHaveValue("");
  });

  it("disables Додати while the field is empty", () => {
    useSpeechRecognitionMock.mockReturnValue({
      isSupported: true,
      isListening: false,
      start: vi.fn(),
      stop: vi.fn(),
    });
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

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/app/page.test.tsx
```

Expected: FAIL — current `page.tsx` renders the default Next.js template, so `getByLabelText("Що в голові?")` is not found.

- [ ] **Step 3: Replace the implementation**

Replace the full contents of `src/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export default function CapturePage() {
  const { addTasksFromText } = useTasks();
  const [text, setText] = useState("");
  const [micMessage, setMicMessage] = useState<string | null>(null);

  const { isSupported, isListening, start, stop } = useSpeechRecognition(
    (transcript) => {
      setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
    }
  );

  function handleAdd() {
    addTasksFromText(text);
    setText("");
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
          disabled={text.trim().length === 0}
          className="h-16 flex-1 rounded-full bg-black text-lg font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
        >
          Додати
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- src/app/page.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx
git commit -m "feat: build Capture screen with textarea and mic dictation"
```

---

### Task 8: Inbox screen

**Files:**
- Create: `src/app/inbox/page.tsx`
- Test: `src/app/inbox/page.test.tsx`

**Interfaces:**
- Consumes: `useTasks` from `@/hooks/useTasks` (Task 3) — uses `tasks`, `moveToToday`, `removeTask`.
- Produces: default-exported `InboxPage` route component at `/inbox`.

- [ ] **Step 1: Write the failing test**

Create `src/app/inbox/page.test.tsx`:

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
};
const todayTask: Task = {
  id: "2",
  text: "вже розкладено",
  status: "today",
  done: false,
  createdAt: 2,
};

describe("InboxPage", () => {
  beforeEach(() => {
    moveToToday.mockClear();
    removeTask.mockClear();
  });

  it("shows a placeholder when there are no inbox tasks", () => {
    tasksMock.mockReturnValue([todayTask]);
    render(<InboxPage />);
    expect(screen.getByText("Тут з'являться твої задачі")).toBeInTheDocument();
  });

  it("renders only inbox tasks", () => {
    tasksMock.mockReturnValue([inboxTask, todayTask]);
    render(<InboxPage />);
    expect(screen.getByText("купити молоко")).toBeInTheDocument();
    expect(screen.queryByText("вже розкладено")).not.toBeInTheDocument();
  });

  it("moves a task to today on click", async () => {
    tasksMock.mockReturnValue([inboxTask]);
    const user = userEvent.setup();
    render(<InboxPage />);

    await user.click(screen.getByRole("button", { name: "→ Сьогодні" }));

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

```bash
npm test -- src/app/inbox/page.test.tsx
```

Expected: FAIL — `Cannot find module './page'` (no `src/app/inbox/` directory yet).

- [ ] **Step 3: Write the implementation**

Create `src/app/inbox/page.tsx`:

```tsx
"use client";

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
              <span className="flex-1 text-lg">{task.text}</span>
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

```bash
npm test -- src/app/inbox/page.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/inbox/page.tsx src/app/inbox/page.test.tsx
git commit -m "feat: build Inbox screen"
```

---

### Task 9: Today screen

**Files:**
- Create: `src/app/today/page.tsx`
- Test: `src/app/today/page.test.tsx`

**Interfaces:**
- Consumes: `useTasks` from `@/hooks/useTasks` (Task 3) — uses `tasks`, `toggleDone`, `removeTask`.
- Produces: default-exported `TodayPage` route component at `/today`.

- [ ] **Step 1: Write the failing test**

Create `src/app/today/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TodayPage from "./page";
import type { Task } from "@/lib/tasks";

const { toggleDone, removeTask, tasksMock } = vi.hoisted(() => ({
  toggleDone: vi.fn(),
  removeTask: vi.fn(),
  tasksMock: vi.fn<() => Task[]>(),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: tasksMock(),
    toggleDone,
    removeTask,
  }),
}));

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

describe("TodayPage", () => {
  beforeEach(() => {
    toggleDone.mockClear();
    removeTask.mockClear();
  });

  it("shows a placeholder when there are no today tasks", () => {
    tasksMock.mockReturnValue([inboxTask]);
    render(<TodayPage />);
    expect(
      screen.getByText("Тут з'являться задачі на сьогодні")
    ).toBeInTheDocument();
  });

  it("renders only today tasks", () => {
    tasksMock.mockReturnValue([inboxTask, todayTask]);
    render(<TodayPage />);
    expect(screen.getByText("купити молоко")).toBeInTheDocument();
    expect(screen.queryByText("ще не розкладено")).not.toBeInTheDocument();
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- src/app/today/page.test.tsx
```

Expected: FAIL — `Cannot find module './page'` (no `src/app/today/` directory yet).

- [ ] **Step 3: Write the implementation**

Create `src/app/today/page.tsx`:

```tsx
"use client";

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
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                  task.done
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/30 dark:border-white/30"
                }`}
              >
                {task.done ? "✓" : ""}
              </button>
              <span
                className={`flex-1 text-lg ${
                  task.done ? "text-zinc-400 line-through" : ""
                }`}
              >
                {task.text}
              </span>
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

```bash
npm test -- src/app/today/page.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/today/page.tsx src/app/today/page.test.tsx
git commit -m "feat: build Today screen"
```

---

### Task 10: Full verification pass

**Files:** none created — this task runs checks across everything built in Tasks 1-9.

**Interfaces:**
- Consumes: the entire app.
- Produces: confidence that lint, the full test suite, and the production build all pass, plus a manual mobile-viewport walkthrough matching the design spec's checklist.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: every test file from Tasks 2, 3, 4, 5, 7, 8, 9 PASSes, 0 failures.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: `✓ Compiled successfully`, routes `/`, `/inbox`, `/today` listed in the output.

- [ ] **Step 4: Manual walkthrough in a mobile viewport**

```bash
npm run dev
```

Open `http://localhost:3000` in a browser with a mobile-width viewport (e.g. Chrome DevTools device toolbar, ~390px wide) and walk through the design spec's checklist (`docs/superpowers/specs/2026-07-19-scaffold-3-screens-design.md` §6):

1. Type multiple lines on Capture, tap "Додати" → each line appears as a separate task in Inbox.
2. In Inbox, tap "→ Сьогодні" on a task → it disappears from Inbox and appears in Today.
3. In Today, tap the checkbox → text gets struck through.
4. Tap × (in Inbox or Today) → task disappears.
5. Reload the page → all tasks and their states are still there.
6. Tap the mic button in Chrome → recognition starts (may need mic permission); in a browser without support, the fallback message appears and nothing crashes.
7. Everything is comfortably tappable one-handed at mobile width.

Stop the dev server (`Ctrl+C`) once done.

- [ ] **Step 5: Commit if anything was fixed during the walkthrough**

If Step 4 surfaced no code changes, skip this step. Otherwise:

```bash
git add -A
git commit -m "fix: address issues found in manual mobile walkthrough"
```

---

## After This Plan

Pushing `main` to `https://github.com/knowely/ai-day-planner-.git` triggers Vercel's existing auto-deploy (already connected). Push is a separate, explicit-confirmation step — not part of this plan's tasks.
