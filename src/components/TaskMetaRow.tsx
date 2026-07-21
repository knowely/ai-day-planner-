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
