"use client";

import { useCallback, useRef, useState } from "react";

const MIME_TYPE_MP4 = "audio/mp4";
const MIME_TYPE_WEBM = "audio/webm";

export function getPreferredMimeType(): string | null {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return null;
  }
  if (window.MediaRecorder.isTypeSupported(MIME_TYPE_MP4)) return MIME_TYPE_MP4;
  if (window.MediaRecorder.isTypeSupported(MIME_TYPE_WEBM)) return MIME_TYPE_WEBM;
  return null;
}

export function isAudioRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.navigator?.mediaDevices?.getUserMedia === "function" &&
    getPreferredMimeType() !== null
  );
}

type RecordingState = "idle" | "recording" | "transcribing";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useAudioRecording(onTranscript: (text: string) => void) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>(MIME_TYPE_WEBM);

  const transcribe = useCallback(
    async (blob: Blob, mimeType: string) => {
      setState("transcribing");
      try {
        const audio = await blobToBase64(blob);
        const format = mimeType.includes("mp4") ? "mp4" : "webm";

        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio, format }),
        });

        if (!response.ok) throw new Error("transcribe request failed");

        const data: unknown = await response.json();
        const text =
          data &&
          typeof data === "object" &&
          typeof (data as { text?: unknown }).text === "string"
            ? (data as { text: string }).text.trim()
            : "";

        if (text.length === 0) {
          throw new Error("transcribe returned an empty result");
        }

        onTranscript(text);
      } catch {
        setError("transcribe-failed");
      } finally {
        setState("idle");
      }
    },
    [onTranscript]
  );

  const start = useCallback(async () => {
    if (mediaRecorderRef.current) return;

    const mimeType = getPreferredMimeType();
    if (!mimeType) return;

    setError(null);

    let stream: MediaStream;
    try {
      stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("mic-permission-denied");
      return;
    }

    if (mediaRecorderRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    mimeTypeRef.current = mimeType;
    chunksRef.current = [];

    const recorder = new window.MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
      void transcribe(blob, mimeTypeRef.current);
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setState("recording");
  }, [transcribe]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  return {
    isSupported: isAudioRecordingSupported(),
    isRecording: state === "recording",
    isTranscribing: state === "transcribing",
    error,
    start,
    stop,
  };
}
