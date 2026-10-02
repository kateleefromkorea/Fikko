import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shows a friendly reload screen instead of a blank page when something in the
 * app throws while rendering. The most common cause after a new deploy is a
 * stale page asking for a code file that no longer exists, which a reload fixes.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Fikko crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <span className="text-lg font-bold tracking-wide">FIKKO</span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your data is safe. Reloading usually fixes this. If it keeps happening, email us at{" "}
            <a href="mailto:hello@fikko.io" className="underline underline-offset-2">hello@fikko.io</a>.
          </p>
        </div>
        <Button onClick={() => window.location.reload()} className="h-10 px-6">Reload Fikko</Button>
      </div>
    );
  }
}
