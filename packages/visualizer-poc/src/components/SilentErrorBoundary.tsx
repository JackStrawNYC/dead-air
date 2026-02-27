/**
 * SilentErrorBoundary — catches render errors in individual overlay components
 * and renders nothing instead of crashing the entire composition.
 *
 * Used to isolate overlay failures so one bad overlay doesn't black out the frame.
 */

import React from "react";

interface State {
  hasError: boolean;
}

interface Props {
  children: React.ReactNode;
  /** Optional name for console warning */
  name?: string;
}

export class SilentErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (this.props.name) {
      console.warn(`[SilentErrorBoundary] ${this.props.name} crashed:`, error.message);
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
