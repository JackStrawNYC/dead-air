import React from 'react';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

/**
 * Dip to black transition — fade through black.
 * The outgoing scene fades to black, then the incoming scene fades up.
 * Creates a clean editorial break. Best for set breaks and chapter boundaries.
 */
export const dipToBlack = (): TransitionPresentation<Record<string, never>> => {
  return {
    component: ({
      children,
      presentationDirection,
      presentationProgress,
    }: TransitionPresentationComponentProps<Record<string, never>>) => {
      const isExiting = presentationDirection === 'exiting';

      // Exiting: fade out in first half. Entering: fade in during second half.
      // This creates the dip-through-black effect.
      let opacity: number;
      if (isExiting) {
        // Fade to black over first 60% of transition
        opacity = presentationProgress < 0.6
          ? 1 - (presentationProgress / 0.6)
          : 0;
      } else {
        // Fade up from black over last 60% of transition
        opacity = presentationProgress > 0.4
          ? (presentationProgress - 0.4) / 0.6
          : 0;
      }

      // Smoothstep the opacity
      opacity = opacity * opacity * (3 - 2 * opacity);

      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity,
          }}
        >
          {children}
        </div>
      );
    },
    props: {},
  };
};
