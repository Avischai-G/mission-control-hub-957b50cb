import { Cpu, Brain, Sparkles, Zap, Waves, Wind, Search, Route } from "lucide-react";
import React from "react";

export type ProviderModel = {
  id: string;
  name: string;
  inputPer1M: number;
  outputPer1M: number;
  bestFor?: string;
};

export type ProviderDef = {
  key: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  apiKeyUrl: string;
  apiKeyInstructions: string;
  keyPrefix: string;
  keyNameDefault: string;
  models: ProviderModel[];
};

export const PROVIDERS: ProviderDef[] = [
  {
    key: "openai",
    name: "OpenAI",
    icon: <Cpu className="h-5 w-5" style={{ color: "hsl(var(--success))" }} />,
    color: "hsl(var(--success))",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyInstructions: "Click \"Create new secret key\", give it a name, and copy the key.",
    keyPrefix: "sk-",
    keyNameDefault: "OpenAI Key",
    models: [
      { id: "gpt-5.4", name: "GPT-5.4", inputPer1M: 2.50, outputPer1M: 15.00 },
      { id: "gpt-5.2", name: "GPT-5.2", inputPer1M: 1.75, outputPer1M: 14.00 },
      { id: "gpt-5-mini", name: "GPT-5 Mini", inputPer1M: 0.25, outputPer1M: 2.00 },
      { id: "o1-pro", name: "o1 Pro", inputPer1M: 150.00, outputPer1M: 600.00 },
      { id: "o3", name: "o3", inputPer1M: 2.00, outputPer1M: 0.50 },
      { id: "gpt-4o", name: "GPT-4o (Legacy)", inputPer1M: 2.50, outputPer1M: 10.00 },
    ],
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    icon: <Route className="h-5 w-5" style={{ color: "hsl(196 78% 44%)" }} />,
    color: "hsl(196 78% 44%)",
    apiKeyUrl: "https://openrouter.ai/settings/keys",
    apiKeyInstructions: "Create an API key in OpenRouter and copy the token.",
    keyPrefix: "sk-or-v1-",
    keyNameDefault: "OpenRouter Key",
    models: [
      { id: "x-ai/grok-4.1-fast:online", name: "Grok 4.1 Fast Online", inputPer1M: 0.20, outputPer1M: 0.50, bestFor: "Live research with web and X search through OpenRouter" },
      { id: "x-ai/grok-4.20-beta:online", name: "Grok 4.20 Beta Online", inputPer1M: 2.00, outputPer1M: 6.00, bestFor: "Higher-end live research with web and X grounding" },
      { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast", inputPer1M: 0.20, outputPer1M: 0.50, bestFor: "Fast agentic research and tool use" },
      { id: "x-ai/grok-4.20-beta", name: "Grok 4.20 Beta", inputPer1M: 2.00, outputPer1M: 6.00, bestFor: "Flagship Grok model for deep research and reasoning" },
      { id: "x-ai/grok-code-fast-1", name: "Grok Code Fast 1", inputPer1M: 0.20, outputPer1M: 1.50, bestFor: "Agentic coding and repo work via OpenRouter" },
      { id: "x-ai/grok-4", name: "Grok 4", inputPer1M: 3.00, outputPer1M: 15.00, bestFor: "Highest-capability reasoning when cost matters less" },
      { id: "x-ai/grok-3", name: "Grok 3", inputPer1M: 3.00, outputPer1M: 15.00, bestFor: "Strong general-purpose Grok fallback" },
      { id: "openrouter/free", name: "Free Models Router", inputPer1M: 0, outputPer1M: 0, bestFor: "Automatic rotating zero cost routing" },
      { id: "openrouter/hunter-alpha", name: "Hunter Alpha", inputPer1M: 0, outputPer1M: 0, bestFor: "Long horizon agents and planning" },
      { id: "openrouter/healer-alpha", name: "Healer Alpha", inputPer1M: 0, outputPer1M: 0, bestFor: "Multimodal agents with audio vision" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super 120B", inputPer1M: 0, outputPer1M: 0, bestFor: "Complex agents planning and tooluse" },
      { id: "stepfun/step-3.5-flash:free", name: "Step 3.5 Flash", inputPer1M: 0, outputPer1M: 0, bestFor: "Fast general chat with reasoning" },
      { id: "arcee-ai/trinity-large-preview:free", name: "Trinity Large Preview", inputPer1M: 0, outputPer1M: 0, bestFor: "Long context reasoning and agents" },
      { id: "liquid/lfm-2.5-1.2b-thinking:free", name: "LFM 2.5 1.2B Thinking", inputPer1M: 0, outputPer1M: 0, bestFor: "Lightweight reasoning extraction and rag" },
      { id: "liquid/lfm-2.5-1.2b-instruct:free", name: "LFM 2.5 1.2B Instruct", inputPer1M: 0, outputPer1M: 0, bestFor: "Fast lightweight on device chat" },
      { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 3 Nano 30B", inputPer1M: 0, outputPer1M: 0, bestFor: "Efficient agents with long context" },
      { id: "arcee-ai/trinity-mini:free", name: "Trinity Mini", inputPer1M: 0, outputPer1M: 0, bestFor: "Efficient long context reasoning tasks" },
      { id: "nvidia/nemotron-nano-12b-v2-vl:free", name: "Nemotron Nano 12B V2 VL", inputPer1M: 0, outputPer1M: 0, bestFor: "Vision documents video and reasoning" },
      { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 Next 80B A3B", inputPer1M: 0, outputPer1M: 0, bestFor: "Fast stable chat for agents" },
      { id: "nvidia/nemotron-nano-9b-v2:free", name: "Nemotron Nano 9B V2", inputPer1M: 0, outputPer1M: 0, bestFor: "Balanced reasoning and everyday chat" },
      { id: "openai/gpt-oss-120b:free", name: "GPT OSS 120B", inputPer1M: 0, outputPer1M: 0, bestFor: "High reasoning agents and workflows" },
      { id: "openai/gpt-oss-20b:free", name: "GPT OSS 20B", inputPer1M: 0, outputPer1M: 0, bestFor: "Affordable general tasks and reasoning" },
      { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 Air", inputPer1M: 0, outputPer1M: 0, bestFor: "Agentic tasks with lower latency" },
      { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder 480B", inputPer1M: 0, outputPer1M: 0, bestFor: "Agentic coding and repo edits" },
      { id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", name: "Venice Uncensored 24B", inputPer1M: 0, outputPer1M: 0, bestFor: "Uncensored roleplay and creative writing" },
      { id: "google/gemma-3n-e2b-it:free", name: "Gemma 3n 2B", inputPer1M: 0, outputPer1M: 0, bestFor: "Mobile multimodal tasks with efficiency" },
      { id: "google/gemma-3n-e4b-it:free", name: "Gemma 3n 4B", inputPer1M: 0, outputPer1M: 0, bestFor: "Stronger mobile multimodal everyday tasks" },
      { id: "qwen/qwen3-4b:free", name: "Qwen3 4B", inputPer1M: 0, outputPer1M: 0, bestFor: "Cheap reasoning and general chat" },
      { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 24B", inputPer1M: 0, outputPer1M: 0, bestFor: "Multimodal chat with solid coding" },
      { id: "google/gemma-3-4b-it:free", name: "Gemma 3 4B", inputPer1M: 0, outputPer1M: 0, bestFor: "Small multimodal chat and translation" },
      { id: "google/gemma-3-12b-it:free", name: "Gemma 3 12B", inputPer1M: 0, outputPer1M: 0, bestFor: "Midrange multimodal reasoning and translation" },
      { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B", inputPer1M: 0, outputPer1M: 0, bestFor: "Best free gemma for vision" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B Instruct", inputPer1M: 0, outputPer1M: 0, bestFor: "Strong multilingual instruction following chat" },
      { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B Instruct", inputPer1M: 0, outputPer1M: 0, bestFor: "Tiny multilingual chat on budget" },
      { id: "nousresearch/hermes-3-llama-3.1-405b:free", name: "Hermes 3 405B", inputPer1M: 0, outputPer1M: 0, bestFor: "Agents roleplay reasoning and tools" },
    ],
  },
  {
    key: "anthropic",
    name: "Anthropic",
    icon: <Brain className="h-5 w-5" style={{ color: "hsl(var(--accent))" }} />,
    color: "hsl(var(--accent))",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    apiKeyInstructions: "Click \"Create Key\", name it, and copy the key.",
    keyPrefix: "sk-ant-",
    keyNameDefault: "Anthropic Key",
    models: [
      { id: "claude-4-6-opus-20260205", name: "Claude 4.6 Opus", inputPer1M: 5.00, outputPer1M: 25.00 },
      { id: "claude-4-6-sonnet-20260217", name: "Claude 4.6 Sonnet", inputPer1M: 3.00, outputPer1M: 15.00 },
      { id: "claude-4-5-haiku-20251015", name: "Claude 4.5 Haiku", inputPer1M: 1.00, outputPer1M: 5.00 },
    ],
  },
  {
    key: "google",
    name: "Google Gemini",
    icon: <Sparkles className="h-5 w-5" style={{ color: "hsl(var(--info))" }} />,
    color: "hsl(var(--info))",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    apiKeyInstructions: "Click \"Create API key\", select a project, and copy the key.",
    keyPrefix: "AIza",
    keyNameDefault: "Gemini Key",
    models: [
      { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", inputPer1M: 2.00, outputPer1M: 12.00 },
      { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash", inputPer1M: 0.50, outputPer1M: 3.00 },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", inputPer1M: 0.25, outputPer1M: 1.50 },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", inputPer1M: 1.25, outputPer1M: 10.00 },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", inputPer1M: 0.30, outputPer1M: 2.50 },
    ],
  },
  {
    key: "groq",
    name: "Groq",
    icon: <Zap className="h-5 w-5" style={{ color: "hsl(var(--warning))" }} />,
    color: "hsl(var(--warning))",
    apiKeyUrl: "https://console.groq.com/keys",
    apiKeyInstructions: "Click \"Create API Key\", name it, and copy the key.",
    keyPrefix: "gsk_",
    keyNameDefault: "Groq Key",
    models: [
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", inputPer1M: 0.59, outputPer1M: 0.79 },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", inputPer1M: 0.05, outputPer1M: 0.08 },
      { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", inputPer1M: 0.24, outputPer1M: 0.24 },
    ],
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    icon: <Waves className="h-5 w-5" style={{ color: "hsl(185 72% 48%)" }} />,
    color: "hsl(185 72% 48%)",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    apiKeyInstructions: "Click \"Create new API key\", name it, and copy the key.",
    keyPrefix: "sk-",
    keyNameDefault: "DeepSeek Key",
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3.2 Chat", inputPer1M: 0.28, outputPer1M: 0.42 },
      { id: "deepseek-reasoner", name: "DeepSeek R1 Reasoner", inputPer1M: 0.55, outputPer1M: 2.19 },
    ],
  },
  {
    key: "mistral",
    name: "Mistral",
    icon: <Wind className="h-5 w-5" style={{ color: "hsl(280 60% 55%)" }} />,
    color: "hsl(280 60% 55%)",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    apiKeyInstructions: "Click \"Create new key\", name it, and copy the key.",
    keyPrefix: "",
    keyNameDefault: "Mistral Key",
    models: [
      { id: "mistral-large-latest", name: "Mistral Large 3", inputPer1M: 2.00, outputPer1M: 6.00 },
      { id: "mistral-small-latest", name: "Mistral Small 3.2", inputPer1M: 0.06, outputPer1M: 0.18 },
      { id: "ministral-8b-latest", name: "Ministral 8B", inputPer1M: 0.10, outputPer1M: 0.10 },
    ],
  },
  {
    key: "perplexity",
    name: "Perplexity",
    icon: <Search className="h-5 w-5" style={{ color: "hsl(210 70% 55%)" }} />,
    color: "hsl(210 70% 55%)",
    apiKeyUrl: "https://www.perplexity.ai/settings/api",
    apiKeyInstructions: "Go to Settings → API and create an API key.",
    keyPrefix: "pplx-",
    keyNameDefault: "Perplexity Key",
    models: [
      { id: "sonar", name: "Sonar", inputPer1M: 1.00, outputPer1M: 1.00 },
      { id: "sonar-pro", name: "Sonar Pro", inputPer1M: 3.00, outputPer1M: 15.00 },
      { id: "sonar-reasoning", name: "Sonar Reasoning", inputPer1M: 1.00, outputPer1M: 5.00 },
    ],
  },
];

export function getProvider(key: string): ProviderDef | undefined {
  return PROVIDERS.find(p => p.key === key);
}

export function buildProviderModelDisplayName(
  providerKey: string,
  modelId: string,
  fallbackName?: string | null,
) {
  const label = fallbackName?.trim() || modelId.trim();
  if (providerKey !== "openrouter") return label;
  return label.toLowerCase().startsWith("openrouter ") ? label : `OpenRouter ${label}`;
}
