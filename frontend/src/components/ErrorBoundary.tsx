"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <h3 className="text-lg font-semibold text-red-800">Er ging iets mis</h3>
            <p className="mt-1 text-sm text-red-600">
              Probeer de pagina te herladen.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 transition"
            >
              Opnieuw proberen
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
