import React from 'react';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

/**
 * Diagonal wipe transition — angled reveal.
 * A diagonal line sweeps from top-left to bottom-right, revealing
 * the incoming scene. Adds geometric variety to the transition palette.
 */
export const diagonalWipe = (): TransitionPresentation<Record<string, never>> => {
  return {
    component: ({
      children,
      presentationDirection,
      presentationProgress,
    }: TransitionPresentationComponentProps<Record<string, never>>) => {
      const isExiting = presentationDirection === 'exiting';

      // Diagonal clip: polygon sweeps from top-left to bottom-right
      // The wipe line is at 45 degrees with some softness via extra width
      const p = presentationProgress * 200 - 50; // range: -50 to 150 (overscan for full coverage)

      let clipPath: string;
      if (isExiting) {
        // Exiting scene: revealed area shrinks (diagonal closes)
        clipPath = `polygon(0% ${p}%, ${p}% 0%, 100% 0%, 100% 100%, 0% 100%)`;
      } else {
        // Entering scene: revealed area grows (diagonal opens)
        clipPath = `polygon(0% 0%, ${p}% 0%, 100% ${200 - p}%, 100% 100%, 0% 100%)`;
      }

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
