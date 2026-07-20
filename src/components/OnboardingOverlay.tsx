"use client";

interface OnboardingOverlayProps {
  onStart: () => void;
}

const CARDS = [
  { icon: "✏️", label: "Capture", hint: "Наговори все" },
  { icon: "📥", label: "Inbox", hint: "AI розкладе" },
  { icon: "✅", label: "Today", hint: "Готовий план" },
] as const;

export function OnboardingOverlay({ onStart }: OnboardingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-center gap-8 bg-white p-6 dark:bg-black">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold">Плануй день голосом</h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400">
          Надиктуй усе, що в голові. AI розкладе це на задачі — з
          пріоритетом, часом і дедлайном — і сам складе твій план на
          сьогодні.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {CARDS.map((card) => (
          <div
            key={card.label}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-black/10 p-3 dark:border-white/10"
          >
            <span className="text-3xl" aria-hidden="true">
              {card.icon}
            </span>
            <span className="text-sm font-medium">{card.label}</span>
            <span className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              {card.hint}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onStart}
        className="h-16 rounded-full bg-black text-lg font-medium text-white dark:bg-white dark:text-black"
      >
        Почати
      </button>
    </div>
  );
}
