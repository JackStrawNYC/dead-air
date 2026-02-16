import React from 'react';

interface VintageFilterProps {
  children: React.ReactNode;
  intensity?: number;
  warm?: boolean;
}

export const VintageFilter: React.FC<VintageFilterProps> = ({
  children,
  intensity = 1,
  warm = true,
}) => {
  const sepia = 0.15 * intensity;
  const contrast = 1 + 0.1 * intensity;
  const saturate = 1 - 0.15 * intensity;
  const brightness = 1 + 0.02 * intensity;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        filter: `sepia(${sepia}) contrast(${contrast}) saturate(${saturate}) brightness(${brightness})`,
      }}
    >
      {children}
      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)',
          pointerEvents: 'none',
        }}
      />
      {/* Warm amber tint */}
      {warm && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: `rgba(212, 168, 83, ${0.06 * intensity})`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};
