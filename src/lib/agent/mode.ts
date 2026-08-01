/**
 * Agent backends for the Librarian.
 *
 * Important: a Grok / SuperGrok / X Premium *consumer subscription* is not an
 * API key. Those products do not expose a key you can put in NON-OS. The xAI
 * developer API (console.x.ai + XAI_API_KEY) is a separate, pay-per-token track.
 *
 * Modes:
 * - local  — default; no network LLM; catalog/machine tools + template answers
 * - xai    — SpaceXAI / xAI Responses API (requires XAI_API_KEY; opt-in)
 * - auto   — same as local unless XAI_API_KEY is set *and* NON_OS_USE_XAI=1
 *
 * We default to local so a leftover or exhausted developer key never blocks Ask.
 */
export type AgentMode = "local" | "xai" | "auto";

export type ResolvedAgentMode = "local" | "xai";

export function configuredAgentMode(): AgentMode {
  const raw = (process.env.NON_OS_AGENT_MODE ?? "local").trim().toLowerCase();
  if (raw === "local" || raw === "xai" || raw === "auto") return raw;
  return "local";
}

export function hasXaiApiKey(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

export function resolveAgentMode(): ResolvedAgentMode {
  const mode = configuredAgentMode();
  if (mode === "local") return "local";
  if (mode === "xai") {
    if (!hasXaiApiKey()) {
      // Fall back rather than hard-fail the UI
      return "local";
    }
    return "xai";
  }
  // auto: only use cloud when key exists and user opts in
  const useXai =
    process.env.NON_OS_USE_XAI === "1" ||
    process.env.NON_OS_USE_XAI === "true";
  return hasXaiApiKey() && useXai ? "xai" : "local";
}

export function agentModeLabel(mode: ResolvedAgentMode): string {
  return mode === "xai" ? "Grok API (xAI)" : "Local catalog assistant";
}

export function agentModeDescription(mode: ResolvedAgentMode): string {
  if (mode === "xai") {
    return "Natural-language agent powered by the xAI developer API (XAI_API_KEY). Not your Grok chat subscription.";
  }
  return "Works offline with no API key. Understands find/locate questions and runs the same catalog tools. Add XAI_API_KEY later for full Grok phrasing.";
}
