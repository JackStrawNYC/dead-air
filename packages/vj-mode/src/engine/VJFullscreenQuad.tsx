/**
 * VJFullscreenQuad — renders a PlaneGeometry(2,2) with a custom ShaderMaterial.
 * Port of FullscreenQuad.tsx: useVJAudio() replaces useAudioData(),
 * useThree() replaces useVideoConfig().
 */

import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useVJAudio } from "./VJAudioContext";
import { createVJUniforms, mapToUniforms } from "./VJUniformBridge";

interface Props {
  vertexShader: string;
  fragmentShader: string;
  extraUniforms?: Record<string, THREE.IUniform>;
}

export const VJFullscreenQuad: React.FC<Props> = ({
  vertexShader,
  fragmentShader,
  extraUniforms,
}) => {
  const state = useVJAudio();
  const { size } = useThree();

  const uniforms = useMemo(() => {
    return {
      ...createVJUniforms(size.width, size.height),
      ...extraUniforms,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update all uniforms from audio state
  mapToUniforms(state, uniforms);
  uniforms.uResolution.value.set(size.width, size.height);

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
};
