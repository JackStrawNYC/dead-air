/**
 * VJFeedbackQuad — ping-pong buffer renderer for VJ mode feedback shaders.
 *
 * Port of MultiPassQuad.tsx's feedback architecture for real-time VJ use.
 * Two WebGLRenderTargets (A/B) swap each frame: renders main shader to A
 * with uPrevFrame=B, then swaps and blits to screen.
 *
 * No Remotion dependencies — VJ mode is always sequential, no gap detection needed.
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { useVJAudio } from "./VJAudioContext";
import { createVJUniforms, mapToUniforms } from "./VJUniformBridge";

interface Props {
  vertexShader: string;
  fragmentShader: string;
  /** Feedback decay rate per frame (0-1, higher = more persistence). Default 0.97 */
  decay?: number;
}

export const VJFeedbackQuad: React.FC<Props> = ({
  vertexShader,
  fragmentShader,
  decay = 0.97,
}) => {
  const state = useVJAudio();
  const { gl, size } = useThree();
  const swapRef = useRef(0); // 0 = render to A read B, 1 = render to B read A

  // Create two render targets for ping-pong
  const targets = useMemo(() => {
    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    };
    return [
      new THREE.WebGLRenderTarget(size.width, size.height, opts),
      new THREE.WebGLRenderTarget(size.width, size.height, opts),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize targets when canvas resizes
  const prevSize = useRef({ w: size.width, h: size.height });
  if (prevSize.current.w !== size.width || prevSize.current.h !== size.height) {
    targets[0].setSize(size.width, size.height);
    targets[1].setSize(size.width, size.height);
    prevSize.current = { w: size.width, h: size.height };
  }

  // Create uniforms with uPrevFrame
  const uniforms = useMemo(() => {
    return {
      ...createVJUniforms(size.width, size.height),
      uPrevFrame: { value: targets[1].texture as THREE.Texture },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthWrite: false,
      depthTest: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen blit material (renders final target to screen)
  const blitMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(uTexture, vUv);
        }
      `,
      uniforms: {
        uTexture: { value: null as THREE.Texture | null },
      },
      depthWrite: false,
      depthTest: false,
    });
  }, []);

  // Shared geometry for blit
  const geom = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  const blitMesh = useMemo(() => new THREE.Mesh(geom, blitMaterial), [geom, blitMaterial]);
  const blitScene = useMemo(() => {
    const s = new THREE.Scene();
    s.add(blitMesh);
    return s;
  }, [blitMesh]);
  const blitCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  useFrame(() => {
    // Update audio uniforms
    mapToUniforms(state, uniforms as ReturnType<typeof createVJUniforms>);
    uniforms.uResolution.value.set(size.width, size.height);

    const writeIdx = swapRef.current;
    const readIdx = 1 - writeIdx;

    // Set uPrevFrame to the previous frame's output
    uniforms.uPrevFrame.value = targets[readIdx].texture;

    // Render main shader to write target
    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(targets[writeIdx]);
    gl.render(blitScene, blitCamera); // clear first
    // We need a scene with our main material — reuse blit mesh temporarily
    blitMesh.material = material;
    gl.render(blitScene, blitCamera);
    gl.setRenderTarget(prevTarget);

    // Blit the result to screen
    blitMesh.material = blitMaterial;
    blitMaterial.uniforms.uTexture.value = targets[writeIdx].texture;

    // Swap for next frame
    swapRef.current = readIdx;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <primitive object={blitMaterial} attach="material" />
    </mesh>
  );
};
