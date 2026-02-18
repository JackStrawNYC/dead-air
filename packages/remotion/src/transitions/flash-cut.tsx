import React from 'react';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

/**
 * Flash cut transition — bright white flash at the cut point.
 * The flash peaks mid-transition, briefly washing out both scenes.
 * Best for electric/psychedelic moments and dramatic reveals.
 */
export const flashCut = (): TransitionPresentation<Record<string, never>> => {
  return {
    component: ({
      children,
      presentationDirection,
      presentationProgress,
    }: TransitionPresentationComponentProps<Record<string, never>>) => {
      const isExiting = presentationDirection === 'exiting';

      // Sharp crossfade
      const opacity = isExiting
        ? 1 - presentationProgress
        : presentationProgress;

      // Flash peaks at mid-transition (sin curve)
      const flashIntensity = Math.sin(presentationProgress * Math.PI);
      const flashAlpha = flashIntensity * 0.85;

      return (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity }}>
            {children}
          </div>
          {/* White flash overlay */}
          {flashIntensity > 0.1 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: `rgba(255, 255, 255, ${flashAlpha})`,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      );
    },
    props: {},
  };
};
