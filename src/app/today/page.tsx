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
