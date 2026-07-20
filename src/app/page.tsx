"use client";

import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { ParsedTask } from "@/lib/tasks";

const PARSE_TIMEOUT_MS = 15000;

export default function CapturePage() {
  const { addTasksFromText, addParsedTasks } = useTasks();
  const [text, setText] = useState("");
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isSupported, isListening, error, start, stop } = useSpeechRecognition(
    (transcript) => {
      setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
    }
  );

  const displayMessage =
    micMessage ??
    (error
      ? `Помилка розпізнавання (${error}). Спробуй ще раз або введи текст вручну.`
      : null);

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
      {displayMessage && (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
          {displayMessage}
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
          disabled={text.trim().length === 0 || isSubmitting}
          className="h-16 flex-1 rounded-full bg-black text-lg font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
        >
          {isSubmitting ? "Розбираю…" : "Додати"}
        </button>
      </div>
    </div>
  );
}
