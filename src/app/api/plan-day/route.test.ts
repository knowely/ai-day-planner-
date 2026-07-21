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

  it("returns a sanitized plan on a successful tool call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        toolCallResponse({ selected: ["1", "999", "1"], note: "Почни з молока." })
      )
    );

    const response = await POST(makeRequest({ backlog: sampleBacklog }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.selected).toEqual(["1"]);
    expect(data.deferred).toEqual(["2"]);
    expect(data.note).toBe("Почни з молока.");
    expect(data.totalMinutes).toBe(15);
    expect(data.overloaded).toBe(true);
  });

  it("forwards constraints to the upstream request as separate data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(toolCallResponse({ selected: ["1"] }));
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      makeRequest({ backlog: sampleBacklog, constraints: "зустрічі 14–16" })
    );

    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body);
    const userMessage = JSON.parse(requestBody.messages[1].content);
    expect(userMessage.constraints).toBe("зустрічі 14–16");
    expect(userMessage.backlog).toEqual(sampleBacklog);
  });

  it("sends an empty constraints string when none is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(toolCallResponse({ selected: ["1"] }));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ backlog: sampleBacklog }));

    const [, requestInit] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(requestInit.body);
    const userMessage = JSON.parse(requestBody.messages[1].content);
    expect(userMessage.constraints).toBe("");
  });

  it("truncates the plan when the backlog exceeds DAY_CAPACITY_MIN", async () => {
    const heavyBacklog = [
      { id: "1", text: "A", priority: "high", estimatedMinutes: 300, deadline: null },
      { id: "2", text: "B", priority: "high", estimatedMinutes: 300, deadline: null },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(toolCallResponse({ selected: ["1", "2"] }))
    );

    const response = await POST(makeRequest({ backlog: heavyBacklog }));
    const data = await response.json();

    expect(data.selected).toEqual(["1"]);
    expect(data.deferred).toEqual(["2"]);
    expect(data.overloaded).toBe(true);
    expect(data.totalMinutes).toBe(300);
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
