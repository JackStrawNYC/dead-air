import React from 'react';
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions';

/**
 * Film burn transition — organic warm burn wipe.
 * Simulates film stock catching and burning at the gate.
 * A warm amber gradient sweeps across with overexposed bloom.
 * Best for warm/earthy transitions.
 */
export const filmBurn = (): TransitionPresentation<Record<string, never>> => {
  return {
    component: ({
      children,
      presentationDirection,
      presentationProgress,
    }: TransitionPresentationComponentProps<Record<string, never>>) => {
      const isExiting = presentationDirection === 'exiting';

      const opacity = isExiting
        ? 1 - presentationProgress
        : presentationProgress;

      // Burn sweeps from left to right
      const burnX = presentationProgress * 140 - 20;
      const burnIntensity = Math.sin(presentationProgress * Math.PI);

      // Warm color shift during burn
      const warmShift = burnIntensity * 0.15;

      return (
        <div style={{ position: 'absolute', inset: 0 }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity,
              filter: burnIntensity > 0.3
                ? `brightness(${1 + warmShift}) saturate(${1.2 + warmShift})`
                : undefined,
            }}
          >
            {children}
          </div>
          {/* Film burn overlay */}
          {burnIntensity > 0.05 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(
                  ellipse 35% 120% at ${burnX}% 50%,
                  rgba(255, 180, 60, ${burnIntensity * 0.7}) 0%,
                  rgba(255, 120, 20, ${burnIntensity * 0.4}) 30%,
                  rgba(200, 80, 0, ${burnIntensity * 0.15}) 50%,
                  transparent 70%
                )`,
                mixBlendMode: 'screen',
                pointerEvents: 'none',
              }}
            />
          )}
          {/* Overexposed bloom at peak */}
          {burnIntensity > 0.6 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: `rgba(255, 240, 200, ${(burnIntensity - 0.6) * 0.4})`,
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
