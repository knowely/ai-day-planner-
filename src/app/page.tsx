"use client";

import { useEffect, useRef, useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { useAudioRecording } from "@/hooks/useAudioRecording";
import { hasSeenOnboarding, markOnboardingSeen } from "@/lib/onboarding";
import { OnboardingOverlay } from "@/components/OnboardingOverlay";
import type { ParsedTask } from "@/lib/tasks";

const PARSE_TIMEOUT_MS = 15000;

const ERROR_MESSAGES: Record<string, string> = {
  "mic-permission-denied":
    "Немає доступу до мікрофона. Дозволь доступ у налаштуваннях браузера або введи текст вручну.",
  "transcribe-failed":
    "Не вдалося розпізнати мовлення. Спробуй ще раз або введи текст вручну.",
};

export default function CapturePage() {
  const { addTasksFromText, addParsedTasks } = useTasks();
  const [text, setText] = useState("");
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isSupported, isRecording, isTranscribing, error, start, stop } =
    useAudioRecording((transcript) => {
      setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
    });

  useEffect(() => {
    // Reading localStorage must happen post-mount so the first client render
    // matches the server's render (overlay hidden) and avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasSeenOnboarding()) setShowOnboarding(true);
  }, []);

  function handleOnboardingStart() {
    markOnboardingSeen();
    setShowOnboarding(false);
    textareaRef.current?.focus();
  }

  const statusMessage = isRecording
    ? "Записую…"
    : isTranscribing
      ? "Розпізнаю…"
      : null;

  const displayMessage =
    statusMessage ?? micMessage ?? (error ? ERROR_MESSAGES[error] : null);

  async function handleAdd() {
    const currentText = text;
    if (currentText.trim().length === 0) return;

    setIsSubmitting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);

    try {
      const response = await fetch("/api/parse-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentText }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("parse-tasks request failed");

      const data: unknown = await response.json();
      const tasks =
        data &&
        typeof data === "object" &&
        Array.isArray((data as { tasks?: unknown }).tasks)
          ? ((data as { tasks: ParsedTask[] }).tasks)
          : null;

      if (tasks === null || tasks.length === 0) {
        throw new Error("parse-tasks returned an invalid or empty payload");
      }

      addParsedTasks(tasks);
    } catch {
      addTasksFromText(currentText);
    } finally {
      clearTimeout(timeoutId);
      setIsSubmitting(false);
      setText("");
    }
  }

  function handleMicClick() {
    if (!isSupported) {
      setMicMessage(
        "Диктування не підтримується в цьому браузері, введи текст вручну"
      );
      return;
    }
    setMicMessage(null);
    if (isRecording) {
      stop();
    } else {
      void start();
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100dvh-5rem)] flex-col gap-4 p-4">
      {showOnboarding && <OnboardingOverlay onStart={handleOnboardingStart} />}
      <h1 className="text-2xl font-semibold">Що в голові?</h1>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Що в голові?"
        aria-label="Що в голові?"
        className="flex-1 w-full resize-none rounded-2xl border border-black/10 bg-white p-4 text-lg leading-relaxed outline-none focus:border-black/30 dark:border-white/10 dark:bg-black dark:focus:border-white/30"
      />
      {displayMessage && (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
          {displayMessage}
        </p>
      )}
      {text.trim().length === 0 && !displayMessage && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Натисни 🎤 і просто проговори все, що треба зробити.
          <br />
          Напр.: «Завтра прибрати квартиру, це важливо, десь година. І
          зібрати валізу.»
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleMicClick}
          disabled={isTranscribing}
          aria-pressed={isRecording}
          aria-label="Диктувати"
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl disabled:opacity-30 ${
            isRecording
              ? "bg-red-500 text-white"
              : "bg-zinc-100 text-black dark:bg-zinc-800 dark:text-white"
          }`}
        >
          🎤
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={text.trim().length === 0 || isSubmitting}
          className="h-16 flex-1 rounded-full bg-black text-lg font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
        >
          {isSubmitting ? "Розбираю…" : "Додати"}
        </button>
      </div>
    </div>
  );
}
