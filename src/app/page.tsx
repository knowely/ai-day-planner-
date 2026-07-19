"use client";

import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export default function CapturePage() {
  const { addTasksFromText } = useTasks();
  const [text, setText] = useState("");
  const [micMessage, setMicMessage] = useState<string | null>(null);

  const { isSupported, isListening, start, stop } = useSpeechRecognition(
    (transcript) => {
      setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
    }
  );

  function handleAdd() {
    addTasksFromText(text);
    setText("");
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
      {micMessage && (
        <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">
          {micMessage}
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
          disabled={text.trim().length === 0}
          className="h-16 flex-1 rounded-full bg-black text-lg font-medium text-white disabled:opacity-30 dark:bg-white dark:text-black"
        >
          Додати
        </button>
      </div>
    </div>
  );
}
