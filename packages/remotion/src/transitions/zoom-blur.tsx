import React from 'react';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

/**
 * Zoom blur transition — radial zoom + blur.
 * High-energy punch: the outgoing scene zooms into blur while
 * the incoming scene zooms out from blur. Best for concert→concert
 * transitions in electric/psychedelic moods.
 */
export const zoomBlur = (): TransitionPresentation<Record<string, never>> => {
  return {
    component: ({
      children,
      presentationDirection,
      presentationProgress,
    }: TransitionPresentationComponentProps<Record<string, never>>) => {
      const isExiting = presentationDirection === 'exiting';

      // Smoothstep the progress for more natural feel
      const t = presentationProgress;
      const smooth = t * t * (3 - 2 * t);

      // Exiting: zoom in + blur out. Entering: zoom out from center + deblur.
      const scale = isExiting
        ? 1.0 + smooth * 0.3 // zoom to 1.3x
        : 1.3 - smooth * 0.3; // zoom from 1.3x to 1.0

      const blur = Math.sin(presentationProgress * Math.PI) * 12;

      const opacity = isExiting
        ? 1 - smooth
        : smooth;

      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            filter: `blur(${blur}px)`,
            transform: `scale(${scale})`,
            opacity,
            willChange: 'transform, filter, opacity',
          }}
        >
          {children}
        </div>
      );
    },
    props: {},
  };
};
