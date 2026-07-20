import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/plan-day", {
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
                  name: "plan_day",
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

const sampleBacklog = [
  {
    id: "1",
    text: "Купити молоко",
    priority: "high",
    estimatedMinutes: 15,
    deadline: "2026-07-20",
  },
  {
    id: "2",
    text: "Помити вікна",
    priority: "low",
    estimatedMinutes: 60,
    deadline: null,
  },
];

describe("POST /api/plan-day", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns sanitized taskIds on a successful tool call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(toolCallResponse({ taskIds: ["1", "999", "1"] }))
    );

    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.taskIds).toEqual(["1"]);
  });

  it("returns 400 when backlog is missing", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 400 when backlog is an empty array", async () => {
    const response = await POST(makeRequest({ backlog: [] }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when backlog items are malformed", async () => {
    const response = await POST(makeRequest({ backlog: [{ oops: true }] }));
    expect(response.status).toBe(400);
  });

  it("returns 500 when OPENROUTER_API_KEY is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    expect(response.status).toBe(500);
  });

  it("returns 502 when the upstream request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }))
    );
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    expect(response.status).toBe(502);
  });

  it("returns 502 when the upstream response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{not json", { status: 200 }))
    );
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
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
    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    expect(response.status).toBe(502);
  });
});
