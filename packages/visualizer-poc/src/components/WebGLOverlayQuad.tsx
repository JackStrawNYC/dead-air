/**
 * WebGLOverlayQuad — renders a single overlay as a textured WebGL quad
 * positioned at a configurable depth in the 3D scene.
 *
 * Replaces flat CSS overlay compositing with depth-integrated rendering:
 * overlays at deeper layers pick up atmospheric fog, creating natural
 * separation between the shader background and foreground iconography.
 *
 * Designed to be placed inside a Three.js Canvas (react-three-fiber).
 * Uniforms are updated every frame via useFrame for smooth animation.
 *
 * Usage:
 *   <WebGLOverlayQuad
 *     texture={loadedTexture}
 *     opacity={0.7}
 *     depth={0.5}
 *     atmosphericBlend={0.15}
 *     blendMode="screen"
 *   />
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { overlayDepthVert, overlayDepthFrag } from "../shaders/shared/overlay-depth.glsl";

export interface WebGLOverlayQuadProps {
  /** Pre-loaded Three.js texture for the overlay image */
  texture: THREE.Texture;
  /** Opacity (0-1), typically driven by the overlay rotation engine */
  opacity: number;
  /** Depth position in the scene (0 = near camera, 1 = far back) */
  depth: number;
  /** Atmospheric fog blend amount (0 = no fog, 1 = fully fogged) */
  atmosphericBlend: number;
  /** WebGL blend mode for compositing. Default: "normal" */
  blendMode?: "normal" | "screen" | "additive";
  /** Fog color — typically the ambient lighting color from the scene. Default: dark warm gray */
  fogColor?: [number, number, number];
  /** Size scale (1.0 = full screen). Default: 1.0 */
  scale?: number;
}

/** Map blend mode names to Three.js blending constants */
const BLEND_MAP: Record<string, THREE.Blending> = {
  normal: THREE.NormalBlending,
  screen: THREE.CustomBlending,
  additive: THREE.AdditiveBlending,
};

export const WebGLOverlayQuad: React.FC<WebGLOverlayQuadProps> = ({
  texture,
  opacity,
  depth,
  atmosphericBlend,
  blendMode = "normal",
  fogColor = [0.02, 0.02, 0.04],
  scale = 1.0,
}) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Create shader material with overlay depth uniforms
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: overlayDepthVert,
      fragmentShader: overlayDepthFrag,
      uniforms: {
        uOverlayTexture: { value: texture },
        uOpacity: { value: opacity },
        uDepth: { value: depth },
        uAtmosphericBlend: { value: atmosphericBlend },
        uFogColor: { value: new THREE.Vector3(...fogColor) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    // Apply blend mode
    const threeBlend = BLEND_MAP[blendMode] ?? THREE.NormalBlending;
    mat.blending = threeBlend;

    // Screen blend requires custom blend equation + factors
    if (blendMode === "screen") {
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneMinusSrcColorFactor;
    }

    return mat;
  }, [texture, blendMode]); // Only recreate on texture/blend change

  // Update dynamic uniforms every frame (cheap uniform writes, no allocation)
  useFrame(() => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.uniforms.uOpacity.value = opacity;
    mat.uniforms.uDepth.value = depth;
    mat.uniforms.uAtmosphericBlend.value = atmosphericBlend;
    mat.uniforms.uFogColor.value.set(...fogColor);
    mat.uniforms.uOverlayTexture.value = texture;
  });

  return (
    <mesh scale={[scale, scale, 1]}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
};
