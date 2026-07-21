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
