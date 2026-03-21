import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

type BoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type BoundaryState = {
  hasError: boolean;
};

class RouteErrorBoundaryInner extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Route render failed", error, errorInfo);
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[calc(100vh-44px)] items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-3xl border border-border/70 bg-card/90 p-8 shadow-[0_20px_80px_-40px_hsl(var(--foreground)/0.35)]">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground">This page failed to load</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The app shell is still running. You can switch to another page or reload this route after the failing component is fixed.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/chat">Back to Chat</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              <RefreshCcw className="h-4 w-4" />
              Reload App
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();

  return <RouteErrorBoundaryInner resetKey={location.pathname} children={children} />;
}
