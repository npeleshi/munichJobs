// Minimal Claude Messages API client (plain fetch – no SDK dependency).
// Structured output is obtained by forcing a single tool call whose
// input_schema is the JSON shape we want back.
import { logger } from "./logger";

const API = "https://api.anthropic.com/v1/messages";

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not configured – AI features are disabled.");
  }
}

export async function aiStructured<T>(opts: {
  system: string;
  prompt: string;
  toolName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiNotConfiguredError();
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 2000,
        system: opts.system,
        tools: [{ name: opts.toolName, description: "Return the result in this exact structure.", input_schema: opts.schema }],
        tool_choice: { type: "tool", name: opts.toolName },
        messages: [{ role: "user", content: opts.prompt }],
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`Claude API ${res.status}`);
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      logger.error("claude api error", { status: res.status, body: text.slice(0, 500) });
      throw new Error(`Claude API error ${res.status}`);
    }
    const data = (await res.json()) as { content: { type: string; name?: string; input?: unknown }[] };
    const block = data.content.find((b) => b.type === "tool_use" && b.name === opts.toolName);
    if (!block) throw new Error("Claude returned no structured result");
    return block.input as T;
  }
  throw lastErr ?? new Error("Claude API failed");
}
