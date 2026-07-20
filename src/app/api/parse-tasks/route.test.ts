import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/parse-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function toolCallResponse(toolArguments: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: "extract_tasks",
                  arguments: JSON.stringify(toolArguments),
                },
              },
            ],
          },
        },
      ],
    }),
    { status: 200 }
  );
}

describe("POST /api/parse-tasks", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns sanitized tasks on a successful tool call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        toolCallResponse({
          tasks: [
            {
              text: "Купити молоко",
              priority: "high",
              estimatedMinutes: 10,
              deadline: "2026-07-21",
            },
            { text: "  ", priority: "low", estimatedMinutes: 5, deadline: null },
          ],
        })
      )
    );

    const response = await POST(makeRequest({ text: "купити молоко терміново" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tasks).toEqual([
      { text: "Купити молоко", priority: "high", estimatedMinutes: 10, deadline: "2026-07-21" },
    ]);
  });

  it("returns 400 when text is missing", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 400 when text is blank", async () => {
    const response = await POST(makeRequest({ text: "   " }));
    expect(response.status).toBe(400);
  });

  it("returns 500 when OPENROUTER_API_KEY is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(500);
  });

  it("returns 502 when the upstream request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }))
    );
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the model did not call the tool", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "no tool call" } }] }),
          { status: 200 }
        )
      )
    );
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the tool arguments are not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    { function: { name: "extract_tasks", arguments: "{not json" } },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        )
      )
    );
    const response = await POST(makeRequest({ text: "купити молоко" }));
    expect(response.status).toBe(502);
  });
});
