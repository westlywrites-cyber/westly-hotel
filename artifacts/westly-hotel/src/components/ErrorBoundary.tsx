import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional label shown in the error message, e.g. "Facilities Management" */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors in its subtree.
 *
 * Without this, an uncaught error anywhere in the tree unmounts the ENTIRE
 * React app and leaves a blank white screen with no on-screen indication of
 * what happened — the exact failure mode this project had no protection
 * against. This boundary confines the damage to the page that crashed and
 * shows a recoverable error message with the underlying error visible for
 * debugging.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {this.props.label ? `${this.props.label} ran into a problem` : "Something went wrong"}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                This section crashed while loading. Your data is safe — this
                is just a display error.
              </p>
            </div>
            <pre className="text-left text-xs bg-muted rounded-lg p-3 overflow-auto max-h-40 text-muted-foreground">
              {this.state.error.message}
            </pre>
            <Button onClick={() => this.setState({ error: null })} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Try Again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
