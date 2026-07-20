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
