export type ProviderModel = {
  id: string;
  name: string;
  inputPer1M: number;
  outputPer1M: number;
};

export type ProviderDef = {
  key: string;
  name: string;
  icon: string;
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
    icon: "🟢",
    color: "hsl(var(--success))",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyInstructions: "Click \"Create new secret key\", give it a name, and copy the key.",
    keyPrefix: "sk-",
    keyNameDefault: "OpenAI Key",
    models: [
      { id: "gpt-4o", name: "GPT-4o", inputPer1M: 2.50, outputPer1M: 10.00 },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", inputPer1M: 0.15, outputPer1M: 0.60 },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", inputPer1M: 10.00, outputPer1M: 30.00 },
      { id: "o1-preview", name: "o1 Preview", inputPer1M: 15.00, outputPer1M: 60.00 },
      { id: "o1-mini", name: "o1 Mini", inputPer1M: 3.00, outputPer1M: 12.00 },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", inputPer1M: 0.50, outputPer1M: 1.50 },
    ],
  },
  {
    key: "anthropic",
    name: "Anthropic",
    icon: "🟠",
    color: "hsl(var(--accent))",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    apiKeyInstructions: "Click \"Create Key\", name it, and copy the key.",
    keyPrefix: "sk-ant-",
    keyNameDefault: "Anthropic Key",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", inputPer1M: 3.00, outputPer1M: 15.00 },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", inputPer1M: 3.00, outputPer1M: 15.00 },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", inputPer1M: 0.80, outputPer1M: 4.00 },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", inputPer1M: 15.00, outputPer1M: 75.00 },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", inputPer1M: 0.25, outputPer1M: 1.25 },
    ],
  },
  {
    key: "google",
    name: "Google Gemini",
    icon: "🔵",
    color: "hsl(var(--info))",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    apiKeyInstructions: "Click \"Create API key\", select a project, and copy the key.",
    keyPrefix: "AIza",
    keyNameDefault: "Gemini Key",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", inputPer1M: 1.25, outputPer1M: 10.00 },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", inputPer1M: 0.15, outputPer1M: 0.60 },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", inputPer1M: 2.50, outputPer1M: 15.00 },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", inputPer1M: 0.10, outputPer1M: 0.40 },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", inputPer1M: 0.10, outputPer1M: 0.40 },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", inputPer1M: 1.25, outputPer1M: 5.00 },
    ],
  },
  {
    key: "groq",
    name: "Groq",
    icon: "⚡",
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
    icon: "🌊",
    color: "hsl(185 72% 48%)",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    apiKeyInstructions: "Click \"Create new API key\", name it, and copy the key.",
    keyPrefix: "sk-",
    keyNameDefault: "DeepSeek Key",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat", inputPer1M: 0.14, outputPer1M: 0.28 },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner", inputPer1M: 0.55, outputPer1M: 2.19 },
    ],
  },
  {
    key: "mistral",
    name: "Mistral",
    icon: "🟣",
    color: "hsl(280 60% 55%)",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
    apiKeyInstructions: "Click \"Create new key\", name it, and copy the key.",
    keyPrefix: "",
    keyNameDefault: "Mistral Key",
    models: [
      { id: "mistral-large-latest", name: "Mistral Large", inputPer1M: 2.00, outputPer1M: 6.00 },
      { id: "mistral-medium-latest", name: "Mistral Medium", inputPer1M: 2.70, outputPer1M: 8.10 },
      { id: "mistral-small-latest", name: "Mistral Small", inputPer1M: 0.20, outputPer1M: 0.60 },
      { id: "codestral-latest", name: "Codestral", inputPer1M: 0.30, outputPer1M: 0.90 },
    ],
  },
  {
    key: "perplexity",
    name: "Perplexity",
    icon: "🔎",
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
