/**
 * ShaderOverlayQuad — renders a PNG/image overlay through GLSL.
 *
 * Instead of CSS-composited images that float on top of shaders,
 * this renders the image as a textured quad in the Three.js scene
 * with audio-reactive UV domain warping, noise-based dissolve,
 * and screen-blend compositing — all at the GPU level.
 *
 * The image emerges from and dissolves back into the shader field,
 * warps with the music, and gets the same post-processing as everything else.
 */

import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useAudioData } from "./AudioReactiveCanvas";
import { useVideoConfig } from "remotion";
import { staticFile } from "remotion";
import { noiseGLSL } from "../shaders/noise";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

${noiseGLSL}

uniform sampler2D uIconTexture;
uniform sampler2D uBackgroundTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uBass;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uSlowEnergy;
uniform float uFastEnergy;
uniform float uMusicalTime;
uniform float uBeatConfidence;
uniform float uSpectralFlux;
uniform float uOpacity;        // from overlay scoring (0-1)
uniform float uPalettePrimary;
uniform float uPaletteSecondary;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // ─── Audio-reactive UV domain warp ───
  // Quiet: clean, recognizable image. Loud: psychedelic warping.
  // The warp intensity scales with energy so the image breathes with the music.
  float warpIntensity = uSlowEnergy * 0.06 + uFastEnergy * 0.03;

  // FBM domain warp: organic, flowing distortion
  float warpX = snoise(vec3(p * 2.0, uDynamicTime * 0.15)) * warpIntensity;
  float warpY = snoise(vec3(p * 2.0 + 100.0, uDynamicTime * 0.15)) * warpIntensity;

  // Beat pulse: micro-expansion on beats (scale from center)
  float bp = beatPulse(uMusicalTime) * smoothstep(0.3, 0.6, uBeatConfidence);
  float beatScale = 1.0 - bp * 0.015; // tiny zoom on beats
  vec2 beatUV = (uv - 0.5) * beatScale + 0.5;

  // Onset jolt: brief UV displacement on transients
  float jolt = uOnsetSnap * 0.008;
  vec2 joltOffset = vec2(
    sin(uTime * 7.3) * jolt,
    cos(uTime * 5.1) * jolt
  );

  // Slow drift: gentle continuous movement so the image feels alive
  vec2 drift = vec2(
    sin(uDynamicTime * 0.04) * 0.01,
    cos(uDynamicTime * 0.03) * 0.008
  );

  // Combined warped UV
  vec2 warpedUV = beatUV + vec2(warpX, warpY) + joltOffset + drift;

  // Sample the icon texture
  vec4 iconColor = texture2D(uIconTexture, clamp(warpedUV, 0.0, 1.0));

  // ─── Noise dissolve (emergence/disappearance) ───
  // Instead of opacity fade, the image dissolves via noise threshold.
  // At low opacity, only the brightest noise-regions show the image.
  // At full opacity, the entire image is visible.
  float dissolveNoise = snoise(vec3(p * 3.0, uDynamicTime * 0.1)) * 0.5 + 0.5;
  // Map uOpacity 0-1 to dissolve threshold: 0 = fully dissolved, 1 = fully visible
  // Use a wider range so the dissolve is gradual, not binary
  float dissolveThreshold = smoothstep(0.0, 1.0, uOpacity * 1.3 - dissolveNoise * 0.4);

  // Icon luminance (for screen blending — black = transparent)
  float iconLuma = dot(iconColor.rgb, vec3(0.299, 0.587, 0.114));

  // ─── Screen blend with background ───
  // Sample the background (previous render pass)
  vec3 bg = texture2D(uBackgroundTexture, uv).rgb;

  // Screen blend: result = 1 - (1-bg) * (1-icon)
  // Only apply where icon has luminance (black bg = no effect)
  vec3 screenBlend = 1.0 - (1.0 - bg) * (1.0 - iconColor.rgb);

  // Mix based on dissolve threshold and icon luminance
  float blendFactor = dissolveThreshold * iconLuma;

  // Subtle energy-reactive color tinting from palette
  float palHue = uPalettePrimary * 6.28318;
  vec3 tint = hsv2rgb(vec3(palHue / 6.28318, 0.15, 1.0));
  vec3 tintedIcon = mix(screenBlend, screenBlend * tint, 0.08 * uEnergy);

  vec3 finalColor = mix(bg, tintedIcon, blendFactor);

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

interface Props {
  /** Path to icon image (use staticFile() in Remotion) */
  iconPath: string;
  /** Background texture from the main shader pass */
  backgroundTexture: THREE.Texture | null;
  /** Overlay opacity from scoring engine (0-1) */
  opacity: number;
}

export const ShaderOverlayQuad: React.FC<Props> = ({
  iconPath,
  backgroundTexture,
  opacity,
}) => {
  const { time, smooth, dynamicTime, musicalTime, palettePrimary, paletteSecondary } = useAudioData();
  const { width, height } = useVideoConfig();
  const gl = useThree((state) => state.gl);

  // Load icon texture
  const textureRef = useRef<THREE.Texture | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(iconPath, (tex) => {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      textureRef.current = tex;
    });
    return () => {
      textureRef.current?.dispose();
      textureRef.current = null;
    };
  }, [iconPath]);

  const camera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );

  const uniforms = useMemo(() => ({
    uIconTexture: { value: null as THREE.Texture | null },
    uBackgroundTexture: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(width, height) },
    uTime: { value: 0 },
    uDynamicTime: { value: 0 },
    uEnergy: { value: 0 },
    uBass: { value: 0 },
    uOnsetSnap: { value: 0 },
    uBeatSnap: { value: 0 },
    uSlowEnergy: { value: 0 },
    uFastEnergy: { value: 0 },
    uMusicalTime: { value: 0 },
    uBeatConfidence: { value: 0.5 },
    uSpectralFlux: { value: 0 },
    uOpacity: { value: 0 },
    uPalettePrimary: { value: 0 },
    uPaletteSecondary: { value: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const pass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, material: mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render target for this overlay pass
  const targetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  useEffect(() => {
    targetRef.current?.dispose();
    targetRef.current = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    return () => {
      targetRef.current?.dispose();
      targetRef.current = null;
    };
  }, [width, height]);

  // Update uniforms each frame
  uniforms.uTime.value = time;
  uniforms.uDynamicTime.value = dynamicTime;
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uBass.value = smooth.bass;
  uniforms.uOnsetSnap.value = smooth.onsetSnap;
  uniforms.uBeatSnap.value = smooth.beatSnap;
  uniforms.uSlowEnergy.value = smooth.slowEnergy;
  uniforms.uFastEnergy.value = smooth.fastEnergy;
  uniforms.uMusicalTime.value = musicalTime;
  uniforms.uBeatConfidence.value = smooth.beatConfidence;
  uniforms.uSpectralFlux.value = smooth.spectralFlux;
  uniforms.uOpacity.value = opacity;
  uniforms.uPalettePrimary.value = palettePrimary;
  uniforms.uPaletteSecondary.value = paletteSecondary;
  uniforms.uResolution.value.set(width, height);
  uniforms.uIconTexture.value = textureRef.current;
  uniforms.uBackgroundTexture.value = backgroundTexture;

  // Don't render if no texture loaded or zero opacity
  if (!textureRef.current || opacity < 0.01 || !backgroundTexture) {
    return null;
  }

  return null; // Rendering handled by parent via getOverlayPass()
};

/**
 * Standalone export: renders the icon overlay into a render target,
 * compositing over the provided background texture.
 *
 * Usage in FullscreenQuad render pipeline:
 *   After main shader pass, call renderShaderOverlay() to composite
 *   the icon into the frame before FXAA.
 */
export function createShaderOverlayPass(gl: THREE.WebGLRenderer, width: number, height: number) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  const geo = new THREE.PlaneGeometry(2, 2);
  const uniforms = {
    uIconTexture: { value: null as THREE.Texture | null },
    uBackgroundTexture: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(width, height) },
    uTime: { value: 0 },
    uDynamicTime: { value: 0 },
    uEnergy: { value: 0 },
    uBass: { value: 0 },
    uOnsetSnap: { value: 0 },
    uBeatSnap: { value: 0 },
    uSlowEnergy: { value: 0 },
    uFastEnergy: { value: 0 },
    uMusicalTime: { value: 0 },
    uBeatConfidence: { value: 0.5 },
    uSpectralFlux: { value: 0 },
    uOpacity: { value: 0 },
    uPalettePrimary: { value: 0 },
    uPaletteSecondary: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    depthWrite: false,
    depthTest: false,
  });
  scene.add(new THREE.Mesh(geo, mat));

  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  return {
    uniforms,
    render(
      iconTexture: THREE.Texture,
      backgroundTexture: THREE.Texture,
      opacity: number,
    ): THREE.Texture {
      uniforms.uIconTexture.value = iconTexture;
      uniforms.uBackgroundTexture.value = backgroundTexture;
      uniforms.uOpacity.value = opacity;
      gl.setRenderTarget(target);
      gl.clear();
      gl.render(scene, camera);
      return target.texture;
    },
    resize(w: number, h: number) {
      target.setSize(w, h);
      uniforms.uResolution.value.set(w, h);
    },
    dispose() {
      target.dispose();
      mat.dispose();
      geo.dispose();
    },
  };
}
