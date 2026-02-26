/**
 * VisualizerErrorBoundary — catches render errors in overlay/scene components
 * and displays a graceful fallback instead of white-screening.
 */

import React from "react";

interface State {
  hasError: boolean;
  error?: Error;
}

interface Props {
  children: React.ReactNode;
}

export class VisualizerErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#0a0a0f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#444",
            fontFamily: "monospace",
            fontSize: 14,
            padding: 40,
            textAlign: "center",
          }}
        >
          Render error: {this.state.error?.message ?? "unknown"}
        </div>
      );
    }

    return this.props.children;
  }
}
