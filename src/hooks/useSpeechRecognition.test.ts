import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "./useSpeechRecognition";

type Listener = (event: unknown) => void;

class FakeSpeechRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: Listener | null = null;
  onerror: Listener | null = null;
  onend: Listener | null = null;
  start = vi.fn();
  stop = vi.fn();
}

describe("isSpeechRecognitionSupported", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.SpeechRecognition;
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.webkitSpeechRecognition;
  });

  it("is false when no SpeechRecognition constructor exists", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("is true when window.SpeechRecognition exists", () => {
    // @ts-expect-error assigning a test double to a browser global
    window.SpeechRecognition = FakeSpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it("is true when only window.webkitSpeechRecognition exists", () => {
    // @ts-expect-error assigning a test double to a browser global
    window.webkitSpeechRecognition = FakeSpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });
});

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    // @ts-expect-error assigning a test double to a browser global
    window.SpeechRecognition = FakeSpeechRecognition;
  });

  afterEach(() => {
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.SpeechRecognition;
  });

  it("reports supported when the browser has SpeechRecognition", () => {
    const { result } = renderHook(() => useSpeechRecognition(() => {}));
    expect(result.current.isSupported).toBe(true);
  });

  it("does nothing when start() is called without support", () => {
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.SpeechRecognition;
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(onResult));

    act(() => {
      result.current.start();
    });

    expect(result.current.isListening).toBe(false);
    expect(onResult).not.toHaveBeenCalled();
  });

  it("starts listening and forwards the transcript on result", () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition(onResult));

    let instance!: FakeSpeechRecognition;
    const OriginalCtor = window.SpeechRecognition as unknown as typeof FakeSpeechRecognition;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.SpeechRecognition = class extends OriginalCtor {
      constructor() {
        super();
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
    };

    act(() => {
      result.current.start();
    });

    expect(result.current.isListening).toBe(true);
    expect(instance.start).toHaveBeenCalledTimes(1);

    act(() => {
      instance.onresult?.({
        results: [[{ transcript: "купити молоко" }]],
      });
    });

    expect(onResult).toHaveBeenCalledWith("купити молоко");

    act(() => {
      instance.onend?.(undefined);
    });

    expect(result.current.isListening).toBe(false);
  });

  it("stop() calls the underlying recognition's stop()", () => {
    const { result } = renderHook(() => useSpeechRecognition(() => {}));

    let instance!: FakeSpeechRecognition;
    const OriginalCtor = window.SpeechRecognition as unknown as typeof FakeSpeechRecognition;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.SpeechRecognition = class extends OriginalCtor {
      constructor() {
        super();
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
    };

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.stop();
    });

    expect(instance.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
  });

  it("does not start a second recognition instance while already listening", () => {
    const { result } = renderHook(() => useSpeechRecognition(() => {}));

    let instance!: FakeSpeechRecognition;
    let constructCount = 0;
    const OriginalCtor = window.SpeechRecognition as unknown as typeof FakeSpeechRecognition;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.SpeechRecognition = class extends OriginalCtor {
      constructor() {
        super();
        constructCount += 1;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
    };

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.start();
    });

    expect(constructCount).toBe(1);
    expect(instance.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);
  });

  it("stops the underlying recognition when unmounted while listening", () => {
    const { result, unmount } = renderHook(() => useSpeechRecognition(() => {}));

    let instance!: FakeSpeechRecognition;
    const OriginalCtor = window.SpeechRecognition as unknown as typeof FakeSpeechRecognition;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.SpeechRecognition = class extends OriginalCtor {
      constructor() {
        super();
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
    };

    act(() => {
      result.current.start();
    });

    unmount();

    expect(instance.stop).toHaveBeenCalledTimes(1);
  });
});
