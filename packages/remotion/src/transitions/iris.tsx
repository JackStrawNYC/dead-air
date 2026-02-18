import React from 'react';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

/**
 * Iris transition — circular reveal/close.
 * Classic cinematic transition: a circle expands from center to reveal
 * the incoming scene (or contracts to close the outgoing scene).
 * Best for chapter openings and dramatic reveals.
 */
export const iris = (): TransitionPresentation<Record<string, never>> => {
  return {
    component: ({
      children,
      presentationDirection,
      presentationProgress,
    }: TransitionPresentationComponentProps<Record<string, never>>) => {
      const isExiting = presentationDirection === 'exiting';

      // Iris circle: exiting scene shrinks, entering scene grows
      // Radius goes from 0% to ~150% (ensures corners are covered)
      const radius = isExiting
        ? 150 * (1 - presentationProgress)
        : 150 * presentationProgress;

      const clipPath = `circle(${radius}% at 50% 50%)`;

      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            clipPath,
            WebkitClipPath: clipPath,
            willChange: 'clip-path',
          }}
        >
          {children}
        </div>
      );
    },
    props: {},
  };
};
