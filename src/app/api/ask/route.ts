import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { createXai } from "@ai-sdk/xai";
import { tryHandleConfirmOrCancel } from "@/lib/agent/actions";
import { localLibrarianReply } from "@/lib/agent/local";
import {
  agentModeLabel,
  hasXaiApiKey,
  resolveAgentMode,
} from "@/lib/agent/mode";
import { LIBRARIAN_SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { librarianTools } from "@/lib/agent/tools";
import {
  appendMessage,
  createThread,
  getThread,
  listMessages,
  titleFromMessage,
  touchThread,
} from "@/lib/agent/threads";
import { ensureLocationsSynced } from "@/lib/locations/manage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function extractText(message: UIMessage): string {
  if (!message.parts?.length) return "";
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function lastAssistantFromThread(threadId: number): string | null {
  const msgs = listMessages(threadId);
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant" && msgs[i].content.trim()) {
      return msgs[i].content;
    }
  }
  return null;
}

function prepareThread(
  messages: UIMessage[],
  requestedThreadId: number | null | undefined,
): { threadId: number; userText: string } {
  let threadId = requestedThreadId ?? null;
  if (threadId != null) {
    const existing = getThread(threadId);
    if (!existing) threadId = null;
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUser ? extractText(lastUser) : "";

  if (threadId == null) {
    threadId = createThread(
      userText ? titleFromMessage(userText) : "New conversation",
    );
  } else if (userText) {
    const thread = getThread(threadId);
    if (thread && thread.title === "New conversation") {
      touchThread(threadId, titleFromMessage(userText));
    }
  }

  if (userText) {
    appendMessage({ threadId, role: "user", content: userText });
  }

  return { threadId, userText };
}

function streamLocalReply(text: string, threadId: number) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "local-1";
      writer.write({ type: "text-start", id });
      // Chunk for smoother UI
      const chunkSize = 48;
      for (let i = 0; i < text.length; i += chunkSize) {
        writer.write({
          type: "text-delta",
          id,
          delta: text.slice(i, i + chunkSize),
        });
      }
      writer.write({ type: "text-end", id });
    },
    onFinish: async ({ responseMessage }) => {
      const content =
        responseMessage.parts
          ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("") ?? text;
      if (content.trim()) {
        appendMessage({
          threadId,
          role: "assistant",
          content: content.trim(),
        });
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "X-Thread-Id": String(threadId),
      "X-Agent-Mode": "local",
    },
  });
}

async function streamXaiReply(
  messages: UIMessage[],
  threadId: number,
): Promise<Response> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "XAI_API_KEY is not set. Use local mode (default) or create a developer key at https://console.x.ai — a Grok chat subscription is not an API key.",
    );
  }

  const xai = createXai({ apiKey });
  // Prefer a widely available id; grok-4.5 is not enabled for every team.
  // Chat Completions path (xai(model)) is more reliable than responses() for tool use.
  const model = process.env.NON_OS_MODEL?.trim() || "grok-4.3";

  const result = streamText({
    model: xai(model),
    system: LIBRARIAN_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: librarianTools,
    stopWhen: stepCountIs(8),
    temperature: 0.3,
    onFinish: async ({ text, steps }) => {
      let content = text?.trim() ?? "";
      // If the model called propose_actions but forgot to paste tokens,
      // append them so Approve / chat "yes" can actually execute.
      const missingTokens: string[] = [];
      for (const step of steps ?? []) {
        for (const tr of step.toolResults ?? []) {
          const out = tr.output as
            | { tokens?: string[]; ok?: boolean }
            | undefined;
          if (!out?.tokens?.length) continue;
          for (const token of out.tokens) {
            if (token && !content.includes(token)) {
              missingTokens.push(token);
            }
          }
        }
      }
      if (missingTokens.length) {
        content = [content, "", ...missingTokens].filter(Boolean).join("\n");
      }
      if (content.trim()) {
        appendMessage({
          threadId,
          role: "assistant",
          content: content.trim(),
        });
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "X-Thread-Id": String(threadId),
      "X-Agent-Mode": "xai",
    },
    onError: (error) => {
      if (error instanceof Error) return error.message;
      return String(error);
    },
  });
}

export async function GET() {
  const mode = resolveAgentMode();
  return Response.json({
    mode,
    label: agentModeLabel(mode),
    hasXaiApiKey: hasXaiApiKey(),
    configuredMode: process.env.NON_OS_AGENT_MODE ?? "auto",
    note:
      "Grok (developer API) is preferred when XAI_API_KEY is set. SuperGrok chat subscription is separate and does not provide that key — see console.x.ai or OpenClaw OAuth for subscription Grok.",
  });
}

export async function POST(req: Request) {
  try {
    ensureLocationsSynced();

    const body = (await req.json()) as {
      messages: UIMessage[];
      threadId?: number | null;
    };

    const messages = body.messages ?? [];
    if (!messages.length) {
      return Response.json({ error: "messages required" }, { status: 400 });
    }

    const { threadId, userText } = prepareThread(messages, body.threadId);
    const mode = resolveAgentMode();

    // Approve / cancel never go to the LLM. xAI previously hallucinated
    // “collection created” without writing — confirm is server-side only.
    if (userText) {
      const lastAssistant = lastAssistantFromThread(threadId);
      const handled = tryHandleConfirmOrCancel(userText, lastAssistant);
      if (handled != null) {
        return streamLocalReply(handled, threadId);
      }
    }

    if (mode === "local") {
      const reply = localLibrarianReply(userText, { threadId });
      return streamLocalReply(reply, threadId);
    }

    return await streamXaiReply(messages, threadId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
