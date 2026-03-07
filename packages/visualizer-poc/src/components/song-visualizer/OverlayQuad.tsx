/**
 * OverlayQuad — renders a GLSL fragment shader on a fullscreen 2×2 plane.
 * Used for GLSL-based overlays that need to run inside the Three.js canvas
 * instead of DOM-based rendering.
 *
 * Pattern: identical to FullscreenQuad but simplified for overlay rendering.
 */

import React, { useMemo } from "react";
import * as THREE from "three";

interface OverlayQuadProps {
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  opacity?: number;
  blendMode?: THREE.Blending;
}

export const OverlayQuad: React.FC<OverlayQuadProps> = ({
  fragmentShader,
  uniforms,
  opacity = 1,
  blendMode = THREE.AdditiveBlending,
}) => {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader,
      uniforms: {
        ...uniforms,
        uOpacity: { value: opacity },
      },
      transparent: true,
      blending: blendMode,
      depthTest: false,
      depthWrite: false,
    });
  }, [fragmentShader]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update uniforms each frame
  useMemo(() => {
    if (material) {
      for (const [key, uniform] of Object.entries(uniforms)) {
        if (material.uniforms[key]) {
          material.uniforms[key].value = uniform.value;
        } else {
          material.uniforms[key] = { value: uniform.value };
        }
      }
      material.uniforms.uOpacity.value = opacity;
    }
  }, [material, uniforms, opacity]);

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};
