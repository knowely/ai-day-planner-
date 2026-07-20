import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPreferredMimeType,
  isAudioRecordingSupported,
  useAudioRecording,
} from "./useAudioRecording";

class FakeMediaRecorder {
  static isTypeSupportedResult: Record<string, boolean> = {};
  static isTypeSupported = vi.fn(
    (type: string) => FakeMediaRecorder.isTypeSupportedResult[type] ?? false
  );

  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType: string;
  start = vi.fn();
  stop = vi.fn();

  constructor(
    public stream: MediaStream,
    options: { mimeType: string }
  ) {
    this.mimeType = options.mimeType;
  }
}

function stubMediaRecorder(support: Record<string, boolean>) {
  FakeMediaRecorder.isTypeSupportedResult = support;
  // @ts-expect-error assigning a test double to a browser global
  window.MediaRecorder = FakeMediaRecorder;
}

function stubGetUserMedia(
  impl: () => Promise<MediaStream>
): ReturnType<typeof vi.fn> {
  const getUserMedia = vi.fn(impl);
  Object.defineProperty(window.navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
  return getUserMedia;
}

function fakeStream(): MediaStream {
  const track = { stop: vi.fn() };
  return {
    getTracks: () => [track],
  } as unknown as MediaStream;
}

describe("getPreferredMimeType / isAudioRecordingSupported", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.MediaRecorder;
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.navigator.mediaDevices;
  });

  it("prefers audio/mp4 when supported", () => {
    stubMediaRecorder({ "audio/mp4": true, "audio/webm": true });
    expect(getPreferredMimeType()).toBe("audio/mp4");
  });

  it("falls back to audio/webm when mp4 is unsupported", () => {
    stubMediaRecorder({ "audio/mp4": false, "audio/webm": true });
    expect(getPreferredMimeType()).toBe("audio/webm");
  });

  it("returns null when neither format is supported", () => {
    stubMediaRecorder({ "audio/mp4": false, "audio/webm": false });
    expect(getPreferredMimeType()).toBeNull();
  });

  it("returns null when MediaRecorder does not exist", () => {
    expect(getPreferredMimeType()).toBeNull();
  });

  it("is unsupported without getUserMedia even if a mime type is supported", () => {
    stubMediaRecorder({ "audio/mp4": true });
    expect(isAudioRecordingSupported()).toBe(false);
  });

  it("is supported when both getUserMedia and a mime type are available", () => {
    stubMediaRecorder({ "audio/mp4": true });
    stubGetUserMedia(() => Promise.resolve(fakeStream()));
    expect(isAudioRecordingSupported()).toBe(true);
  });
});

describe("useAudioRecording", () => {
  beforeEach(() => {
    stubMediaRecorder({ "audio/mp4": true, "audio/webm": true });
  });

  afterEach(() => {
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.MediaRecorder;
    // @ts-expect-error test cleanup of a browser global that doesn't exist in the type lib
    delete window.navigator.mediaDevices;
    vi.unstubAllGlobals();
  });

  it("starts idle", () => {
    stubGetUserMedia(() => Promise.resolve(fakeStream()));
    const { result } = renderHook(() => useAudioRecording(() => {}));
    expect(result.current.isRecording).toBe(false);
    expect(result.current.isTranscribing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("requests the microphone and starts recording with the preferred mime type", async () => {
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(fakeStream()));
    const { result } = renderHook(() => useAudioRecording(() => {}));

    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.isRecording).toBe(true);
  });

  it("sets a permission error when getUserMedia is denied", async () => {
    stubGetUserMedia(() => Promise.reject(new Error("Permission denied")));
    const { result } = renderHook(() => useAudioRecording(() => {}));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBe("mic-permission-denied");
    expect(result.current.isRecording).toBe(false);
  });

  it("does not start a second recording while already recording", async () => {
    const getUserMedia = stubGetUserMedia(() => Promise.resolve(fakeStream()));
    const { result } = renderHook(() => useAudioRecording(() => {}));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("transcribes the recording and forwards the text on stop", async () => {
    stubGetUserMedia(() => Promise.resolve(fakeStream()));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: "купити молоко" }),
      })
    );
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useAudioRecording(onTranscript));

    let instance!: FakeMediaRecorder;
    const OriginalCtor = window.MediaRecorder as unknown as typeof FakeMediaRecorder;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.MediaRecorder = class extends OriginalCtor {
      constructor(stream: MediaStream, options: { mimeType: string }) {
        super(stream, options);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
    };

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isRecording).toBe(true);

    act(() => {
      instance.ondataavailable?.({ data: new Blob(["fake-audio"]) });
    });
    act(() => {
      instance.onstop?.();
    });

    await waitFor(() => expect(result.current.isTranscribing).toBe(false));

    expect(onTranscript).toHaveBeenCalledWith("купити молоко");
    expect(result.current.isRecording).toBe(false);

    const fetchMock = window.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transcribe",
      expect.objectContaining({ method: "POST" })
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.format).toBe("mp4");
    expect(typeof requestBody.audio).toBe("string");
    expect(requestBody.audio.length).toBeGreaterThan(0);
  });

  it("sets a transcribe error when the transcription request fails", async () => {
    stubGetUserMedia(() => Promise.resolve(fakeStream()));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useAudioRecording(onTranscript));

    let instance!: FakeMediaRecorder;
    const OriginalCtor = window.MediaRecorder as unknown as typeof FakeMediaRecorder;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.MediaRecorder = class extends OriginalCtor {
      constructor(stream: MediaStream, options: { mimeType: string }) {
        super(stream, options);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
    };

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      instance.ondataavailable?.({ data: new Blob(["fake-audio"]) });
    });
    act(() => {
      instance.onstop?.();
    });

    await waitFor(() => expect(result.current.error).toBe("transcribe-failed"));
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.isTranscribing).toBe(false);
  });

  it("stops the microphone stream tracks when recording stops", async () => {
    const stream = fakeStream();
    stubGetUserMedia(() => Promise.resolve(stream));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "текст" }) })
    );
    const { result } = renderHook(() => useAudioRecording(() => {}));

    let instance!: FakeMediaRecorder;
    const OriginalCtor = window.MediaRecorder as unknown as typeof FakeMediaRecorder;
    // @ts-expect-error wrapping the test double to capture the created instance
    window.MediaRecorder = class extends OriginalCtor {
      constructor(s: MediaStream, options: { mimeType: string }) {
        super(s, options);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        instance = this;
      }
    };

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.stop();
    });
    expect(instance.stop).toHaveBeenCalledTimes(1);

    act(() => {
      instance.onstop?.();
    });

    await waitFor(() => expect(result.current.isTranscribing).toBe(false));
    expect(stream.getTracks()[0].stop).toHaveBeenCalledTimes(1);
  });
});
