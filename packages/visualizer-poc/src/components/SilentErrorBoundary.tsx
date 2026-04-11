/**
 * SilentErrorBoundary — catches render errors in individual overlay components
 * and renders nothing instead of crashing the entire composition.
 *
 * Used to isolate overlay failures so one bad overlay doesn't black out the frame.
 *
 * Supports a `resetKey` prop: when this value changes (e.g., on a new frame range
 * or section), the error state resets so the child gets another chance to render.
 * This prevents a single transient GPU error (WebGL context loss) from producing
 * permanent black frames for the rest of the render.
 */

import React from "react";

interface State {
  hasError: boolean;
  /** Track the resetKey that was active when the error occurred */
  errorResetKey?: string | number;
}

interface Props {
  children: React.ReactNode;
  /** Optional name for console warning */
  name?: string;
  /** When this value changes after an error, error state resets */
  resetKey?: string | number;
}

export class SilentErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    // If we're in error state and the resetKey has changed since the error,
    // give the child another chance to render.
    if (
      state.hasError &&
      props.resetKey !== undefined &&
      props.resetKey !== state.errorResetKey
    ) {
      return { hasError: false, errorResetKey: undefined };
    }
    return null;
  }

  componentDidCatch(error: Error) {
    console.error(`[SilentErrorBoundary] ${this.props.name ?? "unknown"} crashed: ${error.message}`);
    // Record which resetKey was active when the error happened
    this.setState({ errorResetKey: this.props.resetKey });
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
