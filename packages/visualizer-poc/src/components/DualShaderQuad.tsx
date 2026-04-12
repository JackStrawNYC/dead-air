/**
 * DualShaderQuad — renders two GLSL shaders to separate render targets
 * and composites them with a configurable blend shader.
 *
 * Modeled on MultiPassQuad: single GL context, HalfFloat render targets.
 * Used for GPU-level crossfades and persistent dual-shader rendering.
 */

import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useVideoConfig } from "remotion";
import { useAudioData } from "./AudioReactiveCanvas";
import { useShowContext } from "../data/ShowContext";
import { deriveFilmStock } from "../utils/show-film-stock";
import { getVenueProfile } from "../utils/venue-profiles";
import { useSceneConfig } from "../scenes/SceneConfigContext";
import { dualBlendVert, dualBlendFrag } from "../shaders/dual-blend";
import { useEnvelopeValues } from "../data/EnvelopeContext";
import { fxaaFrag } from "../shaders/shared/fxaa.glsl";
import { gpuMonitor } from "../utils/gpu-monitor";
import { DEFAULT_LIGHTING, type LightingState } from "../utils/lighting-context";
import { createBaseUniforms, syncBaseUniforms, ERA_SATURATION, ERA_BRIGHTNESS, ERA_SEPIA } from "../utils/shader-uniforms";
import { useShowVisualSeed } from "../data/ShowVisualSeedContext";

export type DualBlendMode =
  | "luminance_key"
  | "noise_dissolve"
  | "additive"
  | "multiplicative"
  | "depth_aware";

const BLEND_MODE_INT: Record<DualBlendMode, number> = {
  luminance_key: 0,
  noise_dissolve: 1,
  additive: 2,
  multiplicative: 3,
  depth_aware: 4,
};

interface Props {
  vertexShaderA: string;
  fragmentShaderA: string;
  vertexShaderB: string;
  fragmentShaderB: string;
  blendMode: DualBlendMode;
  /** 0 = all A, 1 = all B */
  blendProgress: number;
}

/** Passthrough vertex shader for composite pass */
const PASSTHROUGH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** Create scene uniforms using shared module */
function createSceneUniforms(): Record<string, THREE.IUniform> {
  return createBaseUniforms();
}

export const DualShaderQuad: React.FC<Props> = ({
  vertexShaderA, fragmentShaderA,
  vertexShaderB, fragmentShaderB,
  blendMode, blendProgress,
}) => {
  const {
    time, beatDecay, smooth, palettePrimary, paletteSecondary,
    paletteSaturation, tempo, musicalTime, climaxPhase, climaxIntensity,
    heroTrigger, heroProgress, jamDensity, jamPhase, jamProgress, coherence, dynamicTime, isLocked, peakOfShow,
    songProgress, shaderHoldProgress,
  } = useAudioData();
  const { width, height } = useVideoConfig();
  const sceneConfig = useSceneConfig();
  const envelope = useEnvelopeValues();
  const showCtx = useShowContext();
  const eraKey = showCtx?.era ?? "";
  const eraSaturation = ERA_SATURATION[eraKey] ?? 1.0;
  const eraBrightness = ERA_BRIGHTNESS[eraKey] ?? 1.0;
  const eraSepia = ERA_SEPIA[eraKey] ?? 0.0;
  const filmStock = deriveFilmStock(showCtx?.showSeed ?? 0);
  const venueProfile = getVenueProfile(showCtx?.venueType ?? "");
  const showVisualSeed = useShowVisualSeed();
  const gl = useThree((state) => state.gl);

  // Shared lighting state (EMA-smoothed across frames)
  const lightingRef = useRef<LightingState>({ ...DEFAULT_LIGHTING });

  // Render targets (HalfFloat for HDR)
  const targets = useMemo(() => {
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    };
    const t = {
      a: new THREE.WebGLRenderTarget(width, height, opts),
      b: new THREE.WebGLRenderTarget(width, height, opts),
      fxaa: new THREE.WebGLRenderTarget(width, height, opts),
    };
    gpuMonitor.trackRenderTarget(t.a, "DualShaderQuad:a");
    gpuMonitor.trackRenderTarget(t.b, "DualShaderQuad:b");
    gpuMonitor.trackRenderTarget(t.fxaa, "DualShaderQuad:fxaa");
    return t;
  }, [width, height]);

  useEffect(() => {
    return () => {
      gpuMonitor.untrackRenderTarget(targets.a);
      gpuMonitor.untrackRenderTarget(targets.b);
      gpuMonitor.untrackRenderTarget(targets.fxaa);
      targets.a.dispose();
      targets.b.dispose();
      targets.fxaa.dispose();
    };
  }, [targets]);

  const camera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  // Scene A
  const sceneA = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const uniforms = createSceneUniforms();
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertexShaderA, fragmentShader: fragmentShaderA,
      uniforms, depthWrite: false, depthTest: false,
    });
    scene.add(new THREE.Mesh(geo, mat));
    return { scene, uniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scene B
  const sceneB = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const uniforms = createSceneUniforms();
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertexShaderB, fragmentShader: fragmentShaderB,
      uniforms, depthWrite: false, depthTest: false,
    });
    scene.add(new THREE.Mesh(geo, mat));
    return { scene, uniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize with 1x1 dark texture to prevent black frame on mount
  const outputUniforms = useMemo(() => {
    const initTex = new THREE.DataTexture(new Uint8Array([5, 3, 8, 255]), 1, 1);
    initTex.needsUpdate = true;
    return { uInputTexture: { value: initTex as THREE.Texture | null } };
  }, []);

  const compositePass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const uniforms: Record<string, THREE.IUniform> = {
      ...createSceneUniforms(),
      uSceneA: { value: null as THREE.Texture | null },
      uSceneB: { value: null as THREE.Texture | null },
      uBlendMode: { value: 0 },
      uBlendProgress: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: dualBlendVert, fragmentShader: dualBlendFrag,
      uniforms, depthWrite: false, depthTest: false,
    });
    scene.add(new THREE.Mesh(geo, mat));
    return { scene, uniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FXAA pass
  const fxaaPass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const fxaaUniforms = {
      uInputTexture: { value: null as THREE.Texture | null },
      uResolution: { value: new THREE.Vector2(width, height) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: fxaaFrag,
      uniforms: fxaaUniforms,
      depthWrite: false,
      depthTest: false,
    });
    scene.add(new THREE.Mesh(geo, mat));
    return { scene, uniforms: fxaaUniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync all shared uniforms for both scenes + composite ──
  const syncData = {
    time, dynamicTime, beatDecay, smooth,
    palettePrimary, paletteSecondary, paletteSaturation,
    tempo, musicalTime, climaxPhase, climaxIntensity,
    heroTrigger, heroProgress, jamDensity, jamPhase, jamProgress,
    coherence, isLocked, peakOfShow,
    songProgress, shaderHoldProgress,
    eraSaturation, eraBrightness, eraSepia,
    filmStock, venueProfile,
    shaderWidth: width, shaderHeight: height,
    sceneConfig, envelope, lightingRef,
    showVisualSeed,
  };
  syncBaseUniforms(sceneA.uniforms, syncData);
  syncBaseUniforms(sceneB.uniforms, syncData);
  syncBaseUniforms(compositePass.uniforms, syncData);

  compositePass.uniforms.uBlendMode.value = BLEND_MODE_INT[blendMode];
  compositePass.uniforms.uBlendProgress.value = blendProgress;

  useFrame(() => {
    // Render scene A → target A
    gl.setRenderTarget(targets.a);
    gl.clear();
    gl.render(sceneA.scene, camera);

    // Render scene B → target B
    gl.setRenderTarget(targets.b);
    gl.clear();
    gl.render(sceneB.scene, camera);

    // Composite
    compositePass.uniforms.uSceneA.value = targets.a.texture;
    compositePass.uniforms.uSceneB.value = targets.b.texture;

    // Render composite to target A (reuse after scenes read)
    gl.setRenderTarget(targets.a);
    gl.clear();
    gl.render(compositePass.scene, camera);

    // FXAA anti-aliasing
    fxaaPass.uniforms.uInputTexture.value = targets.a.texture;
    fxaaPass.uniforms.uResolution.value.set(width, height);
    gl.setRenderTarget(targets.fxaa);
    gl.clear();
    gl.render(fxaaPass.scene, camera);

    outputUniforms.uInputTexture.value = targets.fxaa.texture;
    gl.setRenderTarget(null);
  }, -1);

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={PASSTHROUGH_VERT}
        fragmentShader={/* glsl */ `
          precision highp float;
          uniform sampler2D uInputTexture;
          varying vec2 vUv;
          void main() { gl_FragColor = texture2D(uInputTexture, vUv); }
        `}
        uniforms={outputUniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
};
