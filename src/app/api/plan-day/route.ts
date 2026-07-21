import { DAY_CAPACITY_MIN, sanitizePlanDayResponse } from "@/lib/planDayResponse";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-4.5";
const MAX_CONSTRAINTS_LENGTH = 300;

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
      "Select and order backlog tasks that should be done today, respecting priority, deadline urgency, energy level (heavier tasks earlier), a total time budget, and any stated constraints.",
    parameters: {
      type: "object",
      properties: {
        selected: {
          type: "array",
          items: { type: "string" },
          description:
            "IDs of selected backlog tasks, in the order they should be tackled today (highest-energy/heaviest tasks first, lighter tasks later).",
        },
        note: {
          type: "string",
          description:
            "A short note in Ukrainian explaining the plan, especially if not everything fit today.",
        },
      },
      required: ["selected"],
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

function parseConstraints(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const raw = (body as { constraints?: unknown }).constraints;
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_CONSTRAINTS_LENGTH);
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
  const constraints = parseConstraints(body);

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
            content: `Today's date is ${today}. You are planning a realistic today-list from a backlog of tasks (given as JSON in the user message, alongside any stated constraints). Order tasks by energy: schedule higher-priority and/or longer-duration tasks earlier in the day, and lighter tasks later, so the morning carries the heaviest load. If constraints describes time already spoken for (e.g. meetings, appointments), plan the remaining tasks around it. Keep the total estimated time under ${DAY_CAPACITY_MIN} minutes, using judgement for tasks with no time estimate. Select and order the chosen tasks using the plan_day tool, and include a short Ukrainian note explaining the plan, especially if not everything fits today. Respond only by calling the tool.`,
          },
          { role: "user", content: JSON.stringify({ backlog, constraints }) },
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
  const minutesById = new Map(
    backlog.map((item) => [item.id, item.estimatedMinutes] as const)
  );
  const result = sanitizePlanDayResponse(toolArguments, validIds, minutesById);
  return Response.json(result, { status: 200 });
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
