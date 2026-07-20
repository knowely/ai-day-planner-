const OPENROUTER_TRANSCRIBE_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
const MODEL = "openai/whisper-1";

// OpenRouter's documented format enum uses "m4a", but MediaRecorder on
// iOS/Safari-based browsers reports its mimeType as "audio/mp4" — normalize
// at this trust boundary rather than pushing the mapping onto the client.
function normalizeFormat(format: string): string {
  return format === "mp4" ? "m4a" : format;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const audio =
    body && typeof body === "object" && typeof (body as { audio?: unknown }).audio === "string"
      ? (body as { audio: string }).audio
      : "";
  const format =
    body && typeof body === "object" && typeof (body as { format?: unknown }).format === "string"
      ? (body as { format: string }).format
      : "";

  if (audio.length === 0 || format.length === 0) {
    return Response.json({ error: "audio and format are required" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Server is not configured" }, { status: 500 });
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(OPENROUTER_TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input_audio: { data: audio, format: normalizeFormat(format) },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return Response.json({ error: "Upstream request failed" }, { status: 502 });
  }

  if (!upstreamResponse.ok) {
    return Response.json({ error: "Upstream request failed" }, { status: 502 });
  }

  let upstreamData: unknown;
  try {
    upstreamData = await upstreamResponse.json();
  } catch {
    return Response.json({ error: "Invalid upstream response" }, { status: 502 });
  }

  const text =
    upstreamData &&
    typeof upstreamData === "object" &&
    typeof (upstreamData as { text?: unknown }).text === "string"
      ? (upstreamData as { text: string }).text.trim()
      : "";

  if (text.length === 0) {
    return Response.json({ error: "No speech detected" }, { status: 502 });
  }

  return Response.json({ text }, { status: 200 });
}
