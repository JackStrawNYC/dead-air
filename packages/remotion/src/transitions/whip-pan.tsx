import React from 'react';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

interface WhipPanProps {
  direction?: 'left' | 'right';
}

/**
 * Whip pan transition — fast horizontal slide with motion blur.
 * The blur peaks mid-transition for a natural camera-whip feel.
 * Best used between high-energy concert segments.
 */
export const whipPan = (
  options?: WhipPanProps,
): TransitionPresentation<Record<string, never>> => {
  const dir = options?.direction ?? 'left';
  const sign = dir === 'left' ? -1 : 1;

  return {
    component: ({
      children,
      presentationDirection,
      presentationProgress,
    }: TransitionPresentationComponentProps<Record<string, never>>) => {
      const isExiting = presentationDirection === 'exiting';

      // Motion blur peaks mid-transition (sin curve)
      const blur = Math.sin(presentationProgress * Math.PI) * 20;

      // Slide: exiting moves out, entering moves in
      const translateX = isExiting
        ? sign * presentationProgress * 100
        : sign * (presentationProgress - 1) * 100;

      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            filter: `blur(${blur}px)`,
            transform: `translateX(${translateX}%)`,
            willChange: 'transform, filter',
          }}
        >
          {children}
        </div>
      );
    },
    props: {},
  };
};
