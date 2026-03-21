import { ExternalLink, Key, Database, CheckCircle2, ChevronDown, ChevronRight, Cpu, Brain, Sparkles, Zap, Waves, Wind, Search, Route } from "lucide-react";
import { useState } from "react";

type Step = { title: string; content: React.ReactNode };
type ProviderGuide = {
  name: string;
  icon: React.ReactNode;
  steps: Step[];
  modelIds: string[];
};

const GUIDES: ProviderGuide[] = [
  {
    name: "OpenAI",
    icon: <Cpu className="h-5 w-5" style={{ color: "hsl(var(--success))" }} />,
    steps: [
      {
        title: "Create an OpenAI account",
        content: (
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <a href="https://platform.openai.com/signup" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
              platform.openai.com <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and sign up or log in.
          </p>
        ),
      },
      {
        title: "Generate an API key",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Navigate to{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                API Keys <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p>Click <span className="font-medium text-foreground">"Create new secret key"</span>, give it a name, and copy the key (starts with <code className="bg-secondary px-1 rounded text-xs">sk-...</code>).</p>
          </div>
        ),
      },
      {
        title: "Add credential in Credentials tab",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Go to the <span className="font-medium text-foreground">Credentials</span> tab → <span className="font-medium text-foreground">Add Credential</span>.</p>
            <p>Select provider <span className="font-medium text-foreground">OpenAI</span>, name it (e.g. <code className="bg-secondary px-1 rounded text-xs">MY_OPENAI_KEY</code>), paste the key.</p>
          </div>
        ),
      },
      {
        title: "Register a model in Models tab",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Go to the <span className="font-medium text-foreground">Models</span> tab → <span className="font-medium text-foreground">Add Model</span>.</p>
            <p>Select your OpenAI credential, enter a model ID (see below), verify, and save.</p>
          </div>
        ),
      },
    ],
    modelIds: ["gpt-5.4", "gpt-5.2", "gpt-5-mini", "o1-pro", "o3", "gpt-4o"],
  },
  {
    name: "OpenRouter",
    icon: <Route className="h-5 w-5" style={{ color: "hsl(196 78% 44%)" }} />,
    steps: [
      {
        title: "Create or open your OpenRouter account",
        content: (
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
              openrouter.ai <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and sign in.
          </p>
        ),
      },
      {
        title: "Generate an OpenRouter API key",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Navigate to{" "}
              <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                API Keys <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p>Click <span className="font-medium text-foreground">"Create Key"</span> and copy the token (starts with <code className="bg-secondary px-1 rounded text-xs">sk-or-v1-...</code>).</p>
          </div>
        ),
      },
      {
        title: "Add credential in Credentials tab",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Go to <span className="font-medium text-foreground">Credentials</span> → <span className="font-medium text-foreground">Add Credential</span>.</p>
            <p>Select provider <span className="font-medium text-foreground">OpenRouter</span>, name it, and paste the key.</p>
          </div>
        ),
      },
      {
        title: "Register an OpenRouter model",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Go to <span className="font-medium text-foreground">Models</span> → <span className="font-medium text-foreground">Add Model</span>.</p>
            <p>Use the OpenRouter credential and enter either a free-model ID like <code className="bg-secondary px-1 rounded text-xs">openai/gpt-oss-120b:free</code> or a Grok research ID like <code className="bg-secondary px-1 rounded text-xs">x-ai/grok-4.1-fast:online</code>.</p>
          </div>
        ),
      },
    ],
    modelIds: ["x-ai/grok-4.1-fast:online", "x-ai/grok-4.20-beta:online", "x-ai/grok-code-fast-1", "openai/gpt-oss-120b:free", "qwen/qwen3-coder:free"],
  },
  {
    name: "Anthropic (Claude)",
    icon: <Brain className="h-5 w-5" style={{ color: "hsl(var(--accent))" }} />,
    steps: [
      {
        title: "Create an Anthropic account",
        content: (
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
              console.anthropic.com <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and sign up or log in.
          </p>
        ),
      },
      {
        title: "Generate an API key",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Navigate to{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                API Keys <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <p>Click <span className="font-medium text-foreground">"Create Key"</span> and copy it (starts with <code className="bg-secondary px-1 rounded text-xs">sk-ant-...</code>).</p>
          </div>
        ),
      },
      {
        title: "Add credential in Credentials tab",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Go to <span className="font-medium text-foreground">Credentials</span> → <span className="font-medium text-foreground">Add Credential</span>.</p>
            <p>Select provider <span className="font-medium text-foreground">Anthropic</span>, name it, paste the key.</p>
          </div>
        ),
      },
      {
        title: "Register a model in Models tab",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Go to <span className="font-medium text-foreground">Models</span> → <span className="font-medium text-foreground">Add Model</span>.</p>
            <p>Select your Anthropic credential, enter a model ID (see below), verify, and save.</p>
          </div>
        ),
      },
    ],
    modelIds: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
  },
  {
    name: "Google (Gemini)",
    icon: <Sparkles className="h-5 w-5" style={{ color: "hsl(var(--info))" }} />,
    steps: [
      {
        title: "Get a Google AI API key",
        content: (
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
              Google AI Studio <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and create an API key. It starts with <code className="bg-secondary px-1 rounded text-xs">AIza...</code>.
          </p>
        ),
      },
      {
        title: "Add credential in Credentials tab",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Go to <span className="font-medium text-foreground">Credentials</span> → <span className="font-medium text-foreground">Add Credential</span>.</p>
            <p>Select provider <span className="font-medium text-foreground">Google / Gemini</span>, name it, paste the key.</p>
          </div>
        ),
      },
      {
        title: "Register a model in Models tab",
        content: (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Go to <span className="font-medium text-foreground">Models</span> → <span className="font-medium text-foreground">Add Model</span>.</p>
            <p>Select your Google credential, enter a model ID (see below), verify, and save.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Note: Newer models like <code className="bg-secondary px-1 rounded text-xs">gemini-3.1-pro-preview</code> use the v1beta API and are fully supported.</p>
          </div>
        ),
      },
    ],
    modelIds: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.0-flash", "gemini-1.5-pro"],
  },
  {
    name: "Groq",
    icon: <Zap className="h-5 w-5" style={{ color: "hsl(var(--warning))" }} />,
    steps: [
      {
        title: "Create a Groq account",
        content: (
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
              console.groq.com <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and sign up.
          </p>
        ),
      },
      {
        title: "Generate an API key",
        content: (
          <p className="text-sm text-muted-foreground">
            Go to API Keys → Create API Key. Copy the key (starts with <code className="bg-secondary px-1 rounded text-xs">gsk_...</code>).
          </p>
        ),
      },
      {
        title: "Add credential & register model",
        content: (
          <p className="text-sm text-muted-foreground">
            Same flow: <span className="font-medium text-foreground">Credentials</span> → Add with provider <span className="font-medium text-foreground">Groq</span>, then <span className="font-medium text-foreground">Models</span> → Add Model.
          </p>
        ),
      },
    ],
    modelIds: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  },
  {
    name: "DeepSeek",
    icon: <Waves className="h-5 w-5" style={{ color: "hsl(185 72% 48%)" }} />,
    steps: [
      {
        title: "Create a DeepSeek account",
        content: (
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
              platform.deepseek.com <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        ),
      },
      {
        title: "Generate an API key & add credential",
        content: (
          <p className="text-sm text-muted-foreground">
            Create an API key, then add it in the <span className="font-medium text-foreground">Credentials</span> tab with provider <span className="font-medium text-foreground">DeepSeek</span>.
          </p>
        ),
      },
    ],
    modelIds: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    name: "Mistral",
    icon: <Wind className="h-5 w-5" style={{ color: "hsl(280 60% 55%)" }} />,
    steps: [
      {
        title: "Create a Mistral account",
        content: (
          <p className="text-sm text-muted-foreground">
            Go to{" "}
            <a href="https://console.mistral.ai/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
              console.mistral.ai <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        ),
      },
      {
        title: "Generate an API key & add credential",
        content: (
          <p className="text-sm text-muted-foreground">
            Create an API key, then add it in the <span className="font-medium text-foreground">Credentials</span> tab with provider <span className="font-medium text-foreground">Mistral</span>.
          </p>
        ),
      },
    ],
    modelIds: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest", "codestral-latest"],
  },
];

function ProviderSection({ guide }: { guide: ProviderGuide }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-secondary/20 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary/30 border border-border/50">
          {guide.icon}
        </div>
        <span className="font-medium text-sm text-foreground flex-1">{guide.name}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Steps */}
          <div className="space-y-3">
            {guide.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground mb-1">{step.title}</p>
                  {step.content}
                </div>
              </div>
            ))}
          </div>

          {/* Model IDs */}
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Available Model IDs</p>
            <div className="flex flex-wrap gap-1.5">
              {guide.modelIds.map(id => (
                <code key={id} className="bg-secondary px-2 py-0.5 rounded text-xs font-mono text-foreground">
                  {id}
                </code>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SetupGuideTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-medium text-foreground">Provider Setup Guide</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Step-by-step instructions to connect AI providers. The general flow is:
        </p>
        <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5 text-primary" />
            <span>1. Get API key from provider</span>
          </span>
          <span className="text-muted-foreground/40">→</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span>2. Add credential</span>
          </span>
          <span className="text-muted-foreground/40">→</span>
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span>3. Register & verify model</span>
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {GUIDES.map(g => (
          <ProviderSection key={g.name} guide={g} />
        ))}
      </div>
    </div>
  );
}
