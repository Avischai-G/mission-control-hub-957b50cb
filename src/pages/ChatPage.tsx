import { useState } from "react";
import { Send } from "lucide-react";

export default function ChatPage() {
  const [input, setInput] = useState("");

  return (
    <div className="flex flex-col h-[calc(100vh-44px)]">
      {/* Messages area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
              <span className="text-2xl">◆</span>
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground mb-2">
              Secretary Ready
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              I'm your conversational interface to Mission Control. I'll route your requests through the orchestrator, track task status, and return results.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {["What's my task status?", "Run a knowledge search", "Show agent roster"].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card/50 p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the Secretary..."
            className="flex-1 rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow"
          />
          <button
            disabled={!input.trim()}
            className="rounded-lg bg-primary px-4 py-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
