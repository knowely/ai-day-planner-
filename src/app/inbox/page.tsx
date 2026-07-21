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
