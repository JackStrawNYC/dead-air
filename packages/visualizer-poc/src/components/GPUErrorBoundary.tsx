/**
 * GPUErrorBoundary — catches render errors in the shader subtree,
 * disposes all tracked GPU resources to prevent VRAM leaks,
 * and renders a black fallback instead of crashing the entire render.
 */

import React from "react";
import { gpuMonitor } from "../utils/gpu-monitor";

interface Props {
  /** Optional label for log context (e.g., the shader/scene name) */
  label?: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GPUErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const label = this.props.label ?? "unknown";
    console.error(
      `[GPUErrorBoundary] Shader subtree error (${label}):`,
      error,
    );
    if (info.componentStack) {
      console.error(
        `[GPUErrorBoundary] Component stack:`,
        info.componentStack,
      );
    }

    // Emergency GPU cleanup: dispose all tracked render targets
    const count = gpuMonitor.getActiveCount();
    if (count > 0) {
      console.warn(
        `[GPUErrorBoundary] Disposing ${count} tracked render target(s)`,
      );
      gpuMonitor.disposeAll();
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Render a black fallback frame — keeps the video stream alive
      // without crashing the entire Remotion render.
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#000",
          }}
        />
      );
    }

    return this.props.children;
  }
}
