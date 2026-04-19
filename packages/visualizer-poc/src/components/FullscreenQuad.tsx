/**
 * FullscreenQuad — renders a PlaneGeometry(2,2) with a custom ShaderMaterial.
 * Designed for fullscreen fragment shaders (Liquid Light, Concert Beams).
 * Sets uniforms from audio data each frame via useAudioData().
 *
 * Includes automatic FXAA post-pass: renders to offscreen target,
 * applies FXAA anti-aliasing, then displays the final result.
 */

import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useAudioData } from "./AudioReactiveCanvas";
import { useVideoConfig, useCurrentFrame } from "remotion";
import { useShowContext } from "../data/ShowContext";
import { deriveFilmStock } from "../utils/show-film-stock";
import { getVenueProfile } from "../utils/venue-profiles";
import { useSceneConfig } from "../scenes/SceneConfigContext";
import { useEnvelopeValues } from "../data/EnvelopeContext";
import { fxaaVert, fxaaFrag } from "../shaders/shared/fxaa.glsl";
import { dofVert, dofFrag } from "../shaders/shared/dof-postpass.glsl";
import { temporalBlendVert, temporalBlendFrag } from "../shaders/shared/temporal-blend.glsl";
import { effectPostProcessVert, effectPostProcessFrag } from "../shaders/shared/effect-postprocess.glsl";
import { gpuMonitor } from "../utils/gpu-monitor";
import { DEFAULT_LIGHTING, type LightingState } from "../utils/lighting-context";
import { createBaseUniforms, syncBaseUniforms, ERA_SATURATION, ERA_BRIGHTNESS, ERA_SEPIA } from "../utils/shader-uniforms";
import { useShowVisualSeed } from "../data/ShowVisualSeedContext";
import { useEffectSchedule } from "../data/EffectScheduleContext";

/** Passthrough vertex shader for output mesh */
const PASSTHROUGH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** Final output shader: samples uInputTexture */
const OUTPUT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uInputTexture;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uInputTexture, vUv);
}
`;

/** Icon overlay composite shader — screen blends an image icon over the shader output.
 *  Self-contained GLSL: only snoise, beatPulse, hsv2rgb inlined.
 *  Does NOT use noiseGLSL (which pulls in cinematicGrade/harmonicPaletteCycle
 *  that reference sharedUniformsGLSL uniforms not present in this pass). */
interface Props {
  vertexShader: string;
  fragmentShader: string;
  extraUniforms?: Record<string, THREE.IUniform>;
}

export const FullscreenQuad: React.FC<Props> = ({
  vertexShader,
  fragmentShader,
  extraUniforms,
}) => {
  const { time, beatDecay, smooth, palettePrimary, paletteSecondary, paletteSaturation, tempo, musicalTime, climaxPhase, climaxIntensity, heroTrigger, heroProgress, jamDensity, coherence, dynamicTime, isLocked, jamPhase, jamProgress, peakOfShow, songProgress, shaderHoldProgress } = useAudioData();
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
  const currentFrame = useCurrentFrame();

  // Shared lighting state (EMA-smoothed across frames)
  const lightingRef = useRef<LightingState>({ ...DEFAULT_LIGHTING });

  // Track last rendered frame for temporal blend seek detection
  const lastRenderedFrameRef = useRef(-1);

  // FFT texture: 64-bin DataTexture from 7-band contrast (padded)
  const fftTextureRef = useRef<THREE.DataTexture | null>(null);
  if (!fftTextureRef.current) {
    const data = new Uint8Array(64);
    fftTextureRef.current = new THREE.DataTexture(data, 64, 1, THREE.RedFormat);
    fftTextureRef.current.needsUpdate = true;
  }
  // Dispose FFT texture on unmount (prevents GPU memory leak across chunks)
  useEffect(() => {
    return () => { fftTextureRef.current?.dispose(); };
  }, []);

  // Render targets for FXAA post-pass + icon overlay.
  //
  // PERF: Render the heavy fragment shader at a lower internal resolution and
  // upscale via linear-sampled output mesh. The shader cost scales with pixel
  // count, so a 0.5x downscale = 4x speedup of the shader pass. Output is still
  // emitted at full (width × height) so overlays/text/song art stay sharp at
  // full 1080p — only the shader interior is softened.
  //
  // SHADER_DOWNSCALE: 1 = full output res, 2 = half (4x faster), 3 = third (9x faster).
  // Hardcoded to 2 — gives us a reliable 4x shader speedup without per-bundle env-var
  // fragility. Bump to 3 if you need an even faster render at the cost of more
  // shader softness.
  const SHADER_DOWNSCALE = 1;
  const shaderWidth = Math.max(1, Math.round(width / SHADER_DOWNSCALE));
  const shaderHeight = Math.max(1, Math.round(height / SHADER_DOWNSCALE));

  // Effect schedule: per-frame effect mode/intensity from manifest
  const effectState = useEffectSchedule();

  const targetsRef = useRef<{
    main: THREE.WebGLRenderTarget;
    dof: THREE.WebGLRenderTarget;
    temporalCurrent: THREE.WebGLRenderTarget;
    temporalPrev: THREE.WebGLRenderTarget;
    effect: THREE.WebGLRenderTarget;
    effectFeedback: THREE.WebGLRenderTarget;
    fxaa: THREE.WebGLRenderTarget;
  } | null>(null);

  useEffect(() => {
    if (targetsRef.current) {
      gpuMonitor.untrackRenderTarget(targetsRef.current.main);
      gpuMonitor.untrackRenderTarget(targetsRef.current.dof);
      gpuMonitor.untrackRenderTarget(targetsRef.current.temporalCurrent);
      gpuMonitor.untrackRenderTarget(targetsRef.current.temporalPrev);
      gpuMonitor.untrackRenderTarget(targetsRef.current.effect);
      gpuMonitor.untrackRenderTarget(targetsRef.current.effectFeedback);
      gpuMonitor.untrackRenderTarget(targetsRef.current.fxaa);
      targetsRef.current.main.dispose();
      targetsRef.current.dof.dispose();
      targetsRef.current.temporalCurrent.dispose();
      targetsRef.current.temporalPrev.dispose();
      targetsRef.current.effect.dispose();
      targetsRef.current.effectFeedback.dispose();
      targetsRef.current.fxaa.dispose();
    }
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    };
    targetsRef.current = {
      main: new THREE.WebGLRenderTarget(shaderWidth, shaderHeight, opts),
      dof: new THREE.WebGLRenderTarget(shaderWidth, shaderHeight, opts),
      temporalCurrent: new THREE.WebGLRenderTarget(shaderWidth, shaderHeight, opts),
      temporalPrev: new THREE.WebGLRenderTarget(shaderWidth, shaderHeight, opts),
      effect: new THREE.WebGLRenderTarget(shaderWidth, shaderHeight, opts),
      effectFeedback: new THREE.WebGLRenderTarget(shaderWidth, shaderHeight, opts),
      fxaa: new THREE.WebGLRenderTarget(shaderWidth, shaderHeight, opts),
    };
    gpuMonitor.trackRenderTarget(targetsRef.current.main, "FullscreenQuad:main");
    gpuMonitor.trackRenderTarget(targetsRef.current.dof, "FullscreenQuad:dof");
    gpuMonitor.trackRenderTarget(targetsRef.current.temporalCurrent, "FullscreenQuad:temporalCurrent");
    gpuMonitor.trackRenderTarget(targetsRef.current.temporalPrev, "FullscreenQuad:temporalPrev");
    gpuMonitor.trackRenderTarget(targetsRef.current.effect, "FullscreenQuad:effect");
    gpuMonitor.trackRenderTarget(targetsRef.current.effectFeedback, "FullscreenQuad:effectFeedback");
    gpuMonitor.trackRenderTarget(targetsRef.current.fxaa, "FullscreenQuad:fxaa");
    return () => {
      if (targetsRef.current) {
        gpuMonitor.untrackRenderTarget(targetsRef.current.main);
        gpuMonitor.untrackRenderTarget(targetsRef.current.dof);
        gpuMonitor.untrackRenderTarget(targetsRef.current.temporalCurrent);
        gpuMonitor.untrackRenderTarget(targetsRef.current.temporalPrev);
        gpuMonitor.untrackRenderTarget(targetsRef.current.effect);
        gpuMonitor.untrackRenderTarget(targetsRef.current.effectFeedback);
        gpuMonitor.untrackRenderTarget(targetsRef.current.fxaa);
        targetsRef.current.main.dispose();
        targetsRef.current.dof.dispose();
        targetsRef.current.temporalCurrent.dispose();
        targetsRef.current.temporalPrev.dispose();
        targetsRef.current.effect.dispose();
        targetsRef.current.effectFeedback.dispose();
        targetsRef.current.fxaa.dispose();
      }
      targetsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shaderWidth, shaderHeight]);

  // Camera for offscreen rendering
  const camera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );

  const uniforms = useMemo(() => {
    return {
      ...createBaseUniforms(fftTextureRef.current),
      ...extraUniforms,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main pass scene (offscreen)
  const mainPass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, mesh, material: mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DOF pass
  const dofPass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const dofUniforms = {
      uInputTexture: { value: null as THREE.Texture | null },
      uResolution: { value: new THREE.Vector2(width, height) },
      uCamDof: { value: 0 },
      uCamFocusDist: { value: 3 },
      uMaxDist: { value: 30.0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: dofVert,
      fragmentShader: dofFrag,
      uniforms: dofUniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, uniforms: dofUniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Temporal blend pass
  const temporalPass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const temporalUniforms = {
      uInputTexture: { value: null as THREE.Texture | null },
      uPrevFrame: { value: null as THREE.Texture | null },
      uTemporalBlendStrength: { value: 0.0 },
      uEnergy: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: temporalBlendVert,
      fragmentShader: temporalBlendFrag,
      uniforms: temporalUniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, uniforms: temporalUniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Copy pass: trivial passthrough for copying textures to feedback buffers
  const copyPass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const copyUniforms = {
      uInputTexture: { value: null as THREE.Texture | null },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: OUTPUT_FRAG,
      uniforms: copyUniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, uniforms: copyUniforms };
  }, []);

  // Effect post-process pass (manifest-driven, between temporal blend and FXAA)
  const effectPass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const effectUniforms = {
      uInputTexture: { value: null as THREE.Texture | null },
      uEffectPrevFrame: { value: null as THREE.Texture | null },
      uEffectMode: { value: 0 },
      uEffectIntensity: { value: 0 },
      uEffectTime: { value: 0 },
      uEffectEnergy: { value: 0 },
      uEffectBass: { value: 0 },
      uEffectBeatSnap: { value: 0 },
      uCompositedMode: { value: 0 },
      uCompositedIntensity: { value: 0 },
      uEffectResolution: { value: new THREE.Vector2(width, height) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: effectPostProcessVert,
      fragmentShader: effectPostProcessFrag,
      uniforms: effectUniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, uniforms: effectUniforms };
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
      vertexShader: fxaaVert,
      fragmentShader: fxaaFrag,
      uniforms: fxaaUniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, uniforms: fxaaUniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispose GPU resources (compiled shader programs, geometry buffers) on unmount
  // to prevent GPU memory leaks across scene transitions.
  useEffect(() => {
    return () => {
      mainPass.mesh.geometry.dispose();
      mainPass.material.dispose();
      for (const pass of [dofPass, temporalPass, copyPass, effectPass, fxaaPass]) {
        pass.scene.children.forEach((c) => {
          if (c instanceof THREE.Mesh) {
            c.geometry.dispose();
            (c.material as THREE.ShaderMaterial).dispose();
          }
        });
      }
    };
  }, [mainPass, dofPass, temporalPass, effectPass, fxaaPass]);

  // Initialize with a 1x1 dark texture to prevent black frame on mount
  const outputUniforms = useMemo(() => {
    const initTex = new THREE.DataTexture(new Uint8Array([5, 3, 8, 255]), 1, 1);
    initTex.needsUpdate = true;
    return { uInputTexture: { value: initTex as THREE.Texture | null } };
  }, []);

  // ── Sync all shared uniforms from audio/show data ──
  syncBaseUniforms(uniforms, {
    time, dynamicTime, beatDecay, smooth,
    palettePrimary, paletteSecondary, paletteSaturation,
    tempo, musicalTime, climaxPhase, climaxIntensity,
    heroTrigger, heroProgress, jamDensity, jamPhase, jamProgress,
    coherence, isLocked, peakOfShow,
    songProgress, shaderHoldProgress,
    eraSaturation, eraBrightness, eraSepia,
    filmStock, venueProfile,
    shaderWidth, shaderHeight,
    sceneConfig, envelope, lightingRef,
    showVisualSeed,
  });

  // Update FFT texture from 7-band contrast (padded to 64 bins)
  const c = smooth.contrast;
  if (fftTextureRef.current) {
    const texData = fftTextureRef.current.image.data as Uint8Array;
    const binsPerBand = Math.floor(64 / 7);
    for (let band = 0; band < 7; band++) {
      const val = Math.round((c[band] ?? 0) * 255);
      const start = band * binsPerBand;
      const end = band === 6 ? 64 : (band + 1) * binsPerBand;
      for (let j = start; j < end; j++) {
        texData[j] = val;
      }
    }
    fftTextureRef.current.needsUpdate = true;
  }

  // ── Render pipeline: main shader → DOF → temporal blend → FXAA → output ──
  useFrame(() => {
    const targets = targetsRef.current;
    if (!targets) return;

    // Seek detection: non-sequential frames mean Remotion is seeking
    const isSeek = lastRenderedFrameRef.current !== -1 &&
      Math.abs(currentFrame - lastRenderedFrameRef.current) > 1;
    lastRenderedFrameRef.current = currentFrame;

    // If seeking, clear temporal + effect feedback to prevent ghosting from distant frames
    if (isSeek) {
      gl.setRenderTarget(targets.temporalPrev);
      gl.clear();
      gl.setRenderTarget(targets.effectFeedback);
      gl.clear();
    }

    // Pass 0: Main shader → render target
    gl.setRenderTarget(targets.main);
    gl.clear();
    gl.render(mainPass.scene, camera);

    // Pass 1: DOF post-pass (skip if DOF strength is negligible)
    const dofStrength = uniforms.uCamDof.value as number;
    const dofActive = dofStrength > 0.001;
    if (dofActive) {
      dofPass.uniforms.uInputTexture.value = targets.main.texture;
      dofPass.uniforms.uCamDof.value = dofStrength;
      dofPass.uniforms.uCamFocusDist.value = uniforms.uCamFocusDist.value;
      dofPass.uniforms.uResolution.value.set(shaderWidth, shaderHeight);

      gl.setRenderTarget(targets.dof);
      gl.clear();
      gl.render(dofPass.scene, camera);
    }

    // Source texture after main + optional DOF
    const postDofTexture = dofActive ? targets.dof.texture : targets.main.texture;

    // Pass 2: Temporal blend (skip if strength is negligible)
    // Compute blend strength: base 0.12, dampened at high energy to preserve transient snap
    const baseTemporalStrength = 0.12;
    const energyDampen = 1.0 - Math.min(smooth.energy, 1.0) * 0.5;
    const temporalStrength = baseTemporalStrength * energyDampen;

    let fxaaInputTexture: THREE.Texture;
    if (temporalStrength > 0.001) {
      temporalPass.uniforms.uInputTexture.value = postDofTexture;
      temporalPass.uniforms.uPrevFrame.value = targets.temporalPrev.texture;
      temporalPass.uniforms.uTemporalBlendStrength.value = temporalStrength;
      temporalPass.uniforms.uEnergy.value = smooth.energy;
      temporalPass.uniforms.uResolution.value.set(shaderWidth, shaderHeight);

      gl.setRenderTarget(targets.temporalCurrent);
      gl.clear();
      gl.render(temporalPass.scene, camera);

      // FXAA reads from temporal output
      fxaaInputTexture = targets.temporalCurrent.texture;

      // Swap ping-pong targets so current becomes prev for next frame
      const tmp = targets.temporalPrev;
      targets.temporalPrev = targets.temporalCurrent;
      targets.temporalCurrent = tmp;
    } else {
      // No temporal blend — FXAA reads from post-DOF directly
      fxaaInputTexture = postDofTexture;
    }

    // Pass 3: Effect post-process + composited (manifest-driven)
    // Bind effect feedback (previous frame's effect output) for stateful effects
    effectPass.uniforms.uEffectPrevFrame.value = targets.effectFeedback.texture;
    const effectActive = effectState.effectMode > 0 || effectState.compositedMode > 0;
    let effectOutputTexture = fxaaInputTexture;
    if (effectActive) {
      effectPass.uniforms.uInputTexture.value = fxaaInputTexture;
      effectPass.uniforms.uEffectMode.value = effectState.effectMode;
      effectPass.uniforms.uEffectIntensity.value = effectState.effectIntensity;
      effectPass.uniforms.uCompositedMode.value = effectState.compositedMode;
      effectPass.uniforms.uCompositedIntensity.value = effectState.compositedIntensity;
      effectPass.uniforms.uEffectTime.value = time;
      effectPass.uniforms.uEffectEnergy.value = smooth.energy;
      effectPass.uniforms.uEffectBass.value = smooth.bass;
      effectPass.uniforms.uEffectBeatSnap.value = smooth.beatSnap ?? 0;
      effectPass.uniforms.uEffectResolution.value.set(shaderWidth, shaderHeight);

      gl.setRenderTarget(targets.effect);
      gl.clear();
      gl.render(effectPass.scene, camera);

      effectOutputTexture = targets.effect.texture;

      // Copy effect output to feedback buffer for next frame (stateful effects)
      copyPass.uniforms.uInputTexture.value = targets.effect.texture;
      gl.setRenderTarget(targets.effectFeedback);
      gl.clear();
      gl.render(copyPass.scene, camera);
    }

    // Pass 4: FXAA anti-aliasing — runs at the downscaled shader resolution
    fxaaPass.uniforms.uInputTexture.value = effectOutputTexture;
    fxaaPass.uniforms.uResolution.value.set(shaderWidth, shaderHeight);
    gl.setRenderTarget(targets.fxaa);
    gl.clear();
    gl.render(fxaaPass.scene, camera);

    // Set final texture on the visible output mesh
    outputUniforms.uInputTexture.value = targets.fxaa.texture;
    gl.setRenderTarget(null);
  }, -1);

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={PASSTHROUGH_VERT}
        fragmentShader={OUTPUT_FRAG}
        uniforms={outputUniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
};
