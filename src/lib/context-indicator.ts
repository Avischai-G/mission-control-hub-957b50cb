export type ContextEstimateInput = {
  promptContent?: string | null;
  sharedContextContent?: string | null;
  agentContextContent?: string | null;
  chatHistoryBudgetTokens?: number;
  contextWindowTokens?: number | null;
  defaultOutputTokens?: number | null;
  modelId?: string | null;
};

export function estimateTokens(value?: string | null) {
  if (!value) return 0;
  return Math.ceil(value.length / 4);
}

export function inferContextWindow(modelId?: string | null) {
  const normalized = (modelId || "").toLowerCase();
  if (normalized.includes("gemini")) return 1_000_000;
  if (normalized.includes("claude")) return 200_000;
  if (normalized.includes("deepseek")) return 128_000;
  return 128_000;
}

export function inferDefaultOutput(modelId?: string | null) {
  const normalized = (modelId || "").toLowerCase();
  if (normalized.includes("gemini")) return 8_192;
  if (normalized.includes("sonnet")) return 8_192;
  return 4_096;
}

export function buildContextEstimate(input: ContextEstimateInput) {
  const promptTokens = estimateTokens(input.promptContent);
  const sharedTokens = estimateTokens(input.sharedContextContent);
  const agentTokens = estimateTokens(input.agentContextContent);
  const chatHistoryBudgetTokens = input.chatHistoryBudgetTokens ?? 3_000;
  const defaultOutputTokens = input.defaultOutputTokens ?? inferDefaultOutput(input.modelId);
  const contextWindowTokens = input.contextWindowTokens ?? inferContextWindow(input.modelId);
  const estimatedUsedTokens = promptTokens + sharedTokens + agentTokens + chatHistoryBudgetTokens + defaultOutputTokens;
  const ratio = contextWindowTokens > 0 ? estimatedUsedTokens / contextWindowTokens : 0;

  return {
    promptTokens,
    sharedTokens,
    agentTokens,
    chatHistoryBudgetTokens,
    defaultOutputTokens,
    contextWindowTokens,
    estimatedUsedTokens,
    ratio,
  };
}

export function contextIndicatorTone(ratio: number) {
  if (ratio >= 0.85) return "warning";
  if (ratio >= 0.6) return "warm";
  return "neutral";
}
