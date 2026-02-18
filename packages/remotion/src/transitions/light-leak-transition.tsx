import React from 'react';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

/**
 * Light leak transition — warm amber bloom wipes across the frame.
 * The leak brightens to near-white at mid-transition, then fades to
 * reveal the incoming scene. Creates a nostalgic, filmic feel.
 */
export const lightLeakTransition = (): TransitionPresentation<Record<string, never>> => {
  return {
    component: ({
      children,
      presentationDirection,
      presentationProgress,
    }: TransitionPresentationComponentProps<Record<string, never>>) => {
      const isExiting = presentationDirection === 'exiting';

      // The exiting scene fades out, entering scene fades in
      const sceneOpacity = isExiting
        ? 1 - presentationProgress
        : presentationProgress;

      // Light leak overlay peaks at mid-transition
      const leakIntensity = Math.sin(presentationProgress * Math.PI);
      const leakAlpha = leakIntensity * 0.6;

      // Leak sweeps from left to right
      const leakX = presentationProgress * 120 - 10;

      return (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: sceneOpacity }}>
            {children}
          </div>
          {/* Warm amber leak */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(
                ellipse 40% 100% at ${leakX}% 50%,
                rgba(255, 220, 150, ${leakAlpha}) 0%,
                rgba(212, 168, 83, ${leakAlpha * 0.5}) 30%,
                transparent 70%
              )`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
          {/* White flash at peak */}
          {leakIntensity > 0.7 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: `rgba(255, 255, 255, ${(leakIntensity - 0.7) * 0.3})`,
                mixBlendMode: 'overlay',
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
