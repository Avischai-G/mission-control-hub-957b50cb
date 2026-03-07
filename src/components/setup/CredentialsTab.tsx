import { ShieldCheck, Plus } from "lucide-react";

export function CredentialsTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">Credentials Vault</h3>
          <p className="text-sm text-muted-foreground mt-1">
            API keys and secrets stored server-side in encrypted storage. Never exposed to frontend.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Credential
        </button>
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 p-8 flex flex-col items-center justify-center text-center">
        <ShieldCheck className="h-10 w-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No credentials stored.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Credentials are encrypted at rest and only accessible by the privileged core.
        </p>
      </div>
    </div>
  );
}
