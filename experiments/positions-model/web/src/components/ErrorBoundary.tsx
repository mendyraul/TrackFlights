"use client";

import { Component, type ReactNode } from "react";
import { logger } from "@/lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render-time errors in the subtree so one broken component (e.g. the
 * Leaflet map) doesn't blank the whole app. Logs via the structured logger.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logger.error("React render error", {
      error: error.message,
      componentStack: info.componentStack ?? null,
    });
  }

  handleReset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 p-8 text-center text-gray-300"
        >
          <p className="text-lg font-semibold">Something went wrong.</p>
          <p className="text-sm text-gray-400">
            The view failed to render. You can retry without reloading the page.
          </p>
          <button
            onClick={this.handleReset}
            className="rounded bg-mia-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
