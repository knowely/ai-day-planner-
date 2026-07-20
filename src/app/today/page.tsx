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
