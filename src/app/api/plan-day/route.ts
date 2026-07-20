import { sanitizePlanDayResponse } from "@/lib/planDayResponse";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-4.5";
const TIME_BUDGET_MINUTES = 360;

interface BacklogItem {
  id: string;
  text: string;
  priority: string;
  estimatedMinutes: number | null;
  deadline: string | null;
}

const PLAN_DAY_TOOL = {
  type: "function",
  function: {
    name: "plan_day",
    description:
      "Select and order backlog tasks that should be done today, respecting priority, deadline urgency, and a total time budget.",
    parameters: {
      type: "object",
      properties: {
        taskIds: {
          type: "array",
          items: { type: "string" },
          description:
            "IDs of selected backlog tasks, in the order they should be tackled today.",
        },
      },
      required: ["taskIds"],
    },
  },
} as const;

function parseBacklog(body: unknown): BacklogItem[] | null {
  if (!body || typeof body !== "object") return null;
  const backlog = (body as { backlog?: unknown }).backlog;
  if (!Array.isArray(backlog) || backlog.length === 0) return null;

  const items: BacklogItem[] = [];
  for (const item of backlog) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.text !== "string") {
      return null;
    }
    items.push({
      id: candidate.id,
      text: candidate.text,
      priority: typeof candidate.priority === "string" ? candidate.priority : "medium",
      estimatedMinutes:
        typeof candidate.estimatedMinutes === "number" ? candidate.estimatedMinutes : null,
      deadline: typeof candidate.deadline === "string" ? candidate.deadline : null,
    });
  }
  return items;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const backlog = parseBacklog(body);
  if (backlog === null) {
    return Response.json({ error: "backlog is required" }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Server is not configured" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `Today's date is ${today}. You are planning a realistic today-list from a backlog of tasks (given as JSON in the user message). Prefer higher priority and closer deadlines. Keep the total estimated time roughly under ${TIME_BUDGET_MINUTES} minutes, using judgement for tasks with no time estimate. Select and order the chosen tasks using the plan_day tool. Respond only by calling the tool.`,
          },
          { role: "user", content: JSON.stringify(backlog) },
        ],
        tools: [PLAN_DAY_TOOL],
        tool_choice: { type: "function", function: { name: "plan_day" } },
      }),
      signal: AbortSignal.timeout(12000),
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

  const toolArguments = extractToolArguments(upstreamData);
  if (toolArguments === null) {
    return Response.json(
      { error: "Model did not return a structured plan" },
      { status: 502 }
    );
  }

  const validIds = new Set(backlog.map((item) => item.id));
  const taskIds = sanitizePlanDayResponse(toolArguments, validIds);
  return Response.json({ taskIds }, { status: 200 });
}

function extractToolArguments(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;

  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const message = (choices[0] as { message?: unknown })?.message;
  if (!message || typeof message !== "object") return null;

  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;

  const fn = (toolCalls[0] as { function?: unknown })?.function;
  const args = (fn as { arguments?: unknown })?.arguments;
  if (typeof args !== "string") return null;

  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}
