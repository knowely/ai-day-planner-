import { sanitizeParsedTasks } from "@/lib/parseTasksResponse";
import type { ParsedTask } from "@/lib/tasks";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-4.5";

const EXTRACT_TASKS_TOOL = {
  type: "function",
  function: {
    name: "extract_tasks",
    description:
      "Split a stream-of-consciousness text dump into individual, clearly worded tasks, each with a priority, an estimated duration in minutes, and a deadline.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description:
                  "A single, clearly worded task, starting with a capital letter, with filler words and dictation typos cleaned up.",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high"],
                description:
                  "How urgent/important the task sounds. Default to medium if unclear.",
              },
              estimatedMinutes: {
                type: ["number", "null"],
                description:
                  "Estimated minutes to complete the task, or null if it cannot be reasonably estimated.",
              },
              deadline: {
                type: ["string", "null"],
                description:
                  "Deadline in YYYY-MM-DD format, inferred from explicit or implicit urgency in the text, or null if there truly is none.",
              },
            },
            required: ["text", "priority", "estimatedMinutes", "deadline"],
          },
        },
      },
      required: ["tasks"],
    },
  },
} as const;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text =
    body &&
    typeof body === "object" &&
    typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";

  if (text.length === 0) {
    return Response.json({ error: "text is required" }, { status: 400 });
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
            content: `Today's date is ${today}. Extract tasks from the user's message using the extract_tasks tool. Respond only by calling the tool.`,
          },
          { role: "user", content: text },
        ],
        tools: [EXTRACT_TASKS_TOOL],
        tool_choice: { type: "function", function: { name: "extract_tasks" } },
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
      { error: "Model did not return structured tasks" },
      { status: 502 }
    );
  }

  const tasks: ParsedTask[] = sanitizeParsedTasks(toolArguments);
  return Response.json({ tasks }, { status: 200 });
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
