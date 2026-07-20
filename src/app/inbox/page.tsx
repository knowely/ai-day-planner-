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
