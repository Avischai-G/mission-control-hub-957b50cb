import { ensureSession } from "@/lib/auth-session";
import { useEffect, useState } from "react";

type AuthGateProps = {
  children: React.ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ensureSession()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to establish a Supabase session.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <div className="text-sm font-medium text-foreground">Securing session…</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Establishing an authenticated local session before loading sensitive data.
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <div className="text-sm font-medium text-destructive">Authentication bootstrap failed</div>
          <div className="mt-2 text-xs text-muted-foreground">{error}</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
