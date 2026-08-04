/**
 * Agent backends for the Librarian.
 *
 * Two different “Grok” products (do not conflate them):
 *
 * 1) **SuperGrok / X Premium** — consumer chat on grok.com / X. OpenClaw can
 *    use that via xAI’s partner OAuth. Helix Library cannot; we have no OAuth client.
 * 2) **xAI developer API** — console.x.ai + XAI_API_KEY, pay-per-token.
 *    This is what powers Grok *inside* Helix Library Ask (tools + streaming).
 *
 * Modes:
 * - local — offline catalog assistant (always works; no LLM)
 * - xai   — Grok via developer API (requires XAI_API_KEY)
 * - auto  — prefer Grok when a key is present, else local
 *
 * Product stance: Grok is the standard for natural-language reasoning when a
 * developer key is available. SuperGrok alone is not enough for that path.
 */
export type AgentMode = "local" | "xai" | "auto";

export type ResolvedAgentMode = "local" | "xai";

export function configuredAgentMode(): AgentMode {
  const raw = (process.env.NON_OS_AGENT_MODE ?? "auto").trim().toLowerCase();
  if (raw === "local" || raw === "xai" || raw === "auto") return raw;
  return "auto";
}

export function hasXaiApiKey(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim());
}

/**
 * Explicit opt-out of cloud Grok even when a key is present.
 * Set NON_OS_USE_XAI=0 to force local despite XAI_API_KEY.
 */
export function xaiCloudAllowed(): boolean {
  const v = process.env.NON_OS_USE_XAI;
  if (v === "0" || v === "false" || v === "no") return false;
  // Default: allow Grok when key exists (Grok-first stance)
  return true;
}

export function resolveAgentMode(): ResolvedAgentMode {
  const mode = configuredAgentMode();
  if (mode === "local") return "local";
  if (mode === "xai") {
    return hasXaiApiKey() && xaiCloudAllowed() ? "xai" : "local";
  }
  // auto: Grok when developer key present and not opted out
  return hasXaiApiKey() && xaiCloudAllowed() ? "xai" : "local";
}

export function agentModeLabel(mode: ResolvedAgentMode): string {
  return mode === "xai" ? "Grok" : "Local";
}

export function agentModeDescription(mode: ResolvedAgentMode): string {
  if (mode === "xai") {
    return "Reasoning via Grok (xAI developer API). SuperGrok chat subscription is separate and is not used here.";
  }
  if (hasXaiApiKey() && !xaiCloudAllowed()) {
    return "Local catalog assistant (cloud Grok disabled with NON_OS_USE_XAI=0).";
  }
  return "Local catalog assistant — no developer API key. SuperGrok alone cannot power in-app Grok; add XAI_API_KEY from console.x.ai, or use OpenClaw for subscription OAuth Grok.";
}

export function grokSubscriptionNote(): string {
  return [
    "SuperGrok / X Premium power grok.com and partner apps (e.g. OpenClaw OAuth).",
    "Helix Library Ask uses the xAI developer API only (XAI_API_KEY from console.x.ai).",
    "They are separate billing tracks — a SuperGrok sub does not include API credits.",
  ].join(" ");
}
