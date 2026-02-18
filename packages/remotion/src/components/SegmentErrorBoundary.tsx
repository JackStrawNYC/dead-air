import React from 'react';
import { AbsoluteFill } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';

interface SegmentErrorBoundaryProps {
  segmentName: string;
  children: React.ReactNode;
}

interface SegmentErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that catches render errors in individual segments.
 * Shows a fallback UI with the segment name instead of crashing
 * the entire composition.
 */
export class SegmentErrorBoundary extends React.Component<
  SegmentErrorBoundaryProps,
  SegmentErrorBoundaryState
> {
  constructor(props: SegmentErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SegmentErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <AbsoluteFill
          style={{
            backgroundColor: COLORS.bg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 18,
              color: COLORS.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 4,
            }}
          >
            Segment Error
          </span>
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 14,
              color: COLORS.accent,
            }}
          >
            {this.props.segmentName}
          </span>
          {this.state.error && (
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 12,
                color: COLORS.textMuted,
                opacity: 0.5,
                maxWidth: '80%',
                textAlign: 'center',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </span>
          )}
        </AbsoluteFill>
      );
    }

    return this.props.children;
  }
}
