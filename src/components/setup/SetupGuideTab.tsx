import { ExternalLink, Key, Database, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

type Step = { title: string; content: React.ReactNode };
type ProviderGuide = {
  name: string;
  icon: string;
  steps: Step[];
  modelIds: string[];
};

const GUIDES: ProviderGuide[] = [
  {
    name: "OpenAI",
    icon: "🟢",
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
    modelIds: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
  },
  {
    name: "Anthropic (Claude)",
    icon: "🟠",
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
    icon: "🔵",
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
    icon: "⚡",
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
    icon: "🌊",
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
    icon: "🟣",
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
        <span className="text-lg">{guide.icon}</span>
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
