import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/transcribe", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the transcribed text on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "купити молоко" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ audio: "ZmFrZQ==", format: "webm" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe("купити молоко");
  });

  it("maps mp4 to m4a for the OpenRouter request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "текст" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ audio: "ZmFrZQ==", format: "mp4" }));

    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body);
    expect(requestBody.input_audio.format).toBe("m4a");
    expect(requestBody.input_audio.data).toBe("ZmFrZQ==");
    expect(requestBody.model).toBe("openai/whisper-1");
  });

  it("passes webm through unchanged for the OpenRouter request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "текст" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ audio: "ZmFrZQ==", format: "webm" }));

    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body);
    expect(requestBody.input_audio.format).toBe("webm");
  });

  it("returns 400 when audio is missing", async () => {
    const response = await POST(makeRequest({ format: "webm" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when format is missing", async () => {
    const response = await POST(makeRequest({ audio: "ZmFrZQ==" }));
    expect(response.status).toBe(400);
  });

  it("returns 500 when OPENROUTER_API_KEY is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const response = await POST(makeRequest({ audio: "ZmFrZQ==", format: "webm" }));
    expect(response.status).toBe(500);
  });

  it("returns 502 when the upstream request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const response = await POST(makeRequest({ audio: "ZmFrZQ==", format: "webm" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }))
    );
    const response = await POST(makeRequest({ audio: "ZmFrZQ==", format: "webm" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{not json", { status: 200 }))
    );
    const response = await POST(makeRequest({ audio: "ZmFrZQ==", format: "webm" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response has no text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    );
    const response = await POST(makeRequest({ audio: "ZmFrZQ==", format: "webm" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response text is blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: "   " }), { status: 200 })
      )
    );
    const response = await POST(makeRequest({ audio: "ZmFrZQ==", format: "webm" }));
    expect(response.status).toBe(502);
  });
});
