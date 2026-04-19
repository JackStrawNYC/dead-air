/**
 * MultiPassQuad — multi-pass fullscreen shader renderer with ping-pong buffers.
 *
 * Renders a main scene to an offscreen target, then chains N post-processing
 * passes (each reading the previous output), and displays the final result.
 *
 * Supports optional feedback mode: the previous frame's final output is
 * available as `uPrevFrame` in the main shader (e.g., for fluid simulation).
 * Gap detection resets feedback when frames are non-sequential (Remotion seeking).
 *
 * Usage:
 *   <MultiPassQuad
 *     vertexShader={vert}
 *     fragmentShader={frag}
 *     postPasses={[{ fragmentShader: blurFrag }]}
 *     feedback
 *   />
 */

import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useVideoConfig, useCurrentFrame } from "remotion";
import { useAudioData } from "./AudioReactiveCanvas";
import { useShowContext } from "../data/ShowContext";
import { deriveFilmStock } from "../utils/show-film-stock";
import { getVenueProfile } from "../utils/venue-profiles";
import { useSceneConfig } from "../scenes/SceneConfigContext";
import { useEnvelopeValues } from "../data/EnvelopeContext";
import { fxaaVert, fxaaFrag } from "../shaders/shared/fxaa.glsl";
import { effectPostProcessVert, effectPostProcessFrag } from "../shaders/shared/effect-postprocess.glsl";
import { gpuMonitor } from "../utils/gpu-monitor";
import { DEFAULT_LIGHTING, type LightingState } from "../utils/lighting-context";
import { createBaseUniforms as createSharedBaseUniforms, syncBaseUniforms, ERA_SATURATION, ERA_BRIGHTNESS, ERA_SEPIA } from "../utils/shader-uniforms";
import { useEffectSchedule } from "../data/EffectScheduleContext";
import { useShowVisualSeed } from "../data/ShowVisualSeedContext";

/** Reusable Color for save/restore clear color */
const _clearColor = new THREE.Color();

/** Simple passthrough vertex shader */
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

export interface PostPass {
  /** Fragment shader for this pass (receives uInputTexture from previous pass) */
  fragmentShader: string;
  /** Additional uniforms for this pass */
  extraUniforms?: Record<string, THREE.IUniform>;
}

interface Props {
  vertexShader: string;
  fragmentShader: string;
  extraUniforms?: Record<string, THREE.IUniform>;
  /** Post-processing passes chained after the main render */
  postPasses?: PostPass[];
  /** Enable feedback mode: previous frame's output as uPrevFrame uniform */
  feedback?: boolean;
}

export const MultiPassQuad: React.FC<Props> = ({
  vertexShader,
  fragmentShader,
  extraUniforms,
  postPasses = [],
  feedback = false,
}) => {
  const {
    time, beatDecay, smooth, palettePrimary, paletteSecondary,
    paletteSaturation, tempo, musicalTime, climaxPhase, climaxIntensity,
    heroTrigger, heroProgress, jamDensity, jamPhase, jamProgress, coherence, dynamicTime, isLocked, peakOfShow,
    songProgress, shaderHoldProgress,
  } = useAudioData();
  const { width, height } = useVideoConfig();
  const currentFrame = useCurrentFrame();
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
  const effectState = useEffectSchedule();

  const lastRenderedFrame = useRef(-1);

  // Shared lighting state (EMA-smoothed across frames)
  const lightingRef = useRef<LightingState>({ ...DEFAULT_LIGHTING });

  // FFT texture
  const fftTextureRef = useRef<THREE.DataTexture | null>(null);
  if (!fftTextureRef.current) {
    const data = new Uint8Array(64);
    fftTextureRef.current = new THREE.DataTexture(data, 64, 1, THREE.RedFormat);
    fftTextureRef.current.needsUpdate = true;
  }

  // Dispose FFT texture on unmount to prevent GPU memory leak across scene transitions
  useEffect(() => {
    return () => { fftTextureRef.current?.dispose(); };
  }, []);

  // Render targets: A + B for ping-pong, optional feedback buffer.
  // Uses useRef + useEffect so old targets dispose BEFORE new ones allocate,
  // preventing ~235MB GPU VRAM spike on resolution changes (e.g. 1080p→4K).
  const targetsRef = useRef<{
    a: THREE.WebGLRenderTarget;
    b: THREE.WebGLRenderTarget;
    feedback: THREE.WebGLRenderTarget | null;
    effect: THREE.WebGLRenderTarget;
    effectFeedback: THREE.WebGLRenderTarget;
    fxaa: THREE.WebGLRenderTarget;
  } | null>(null);

  useEffect(() => {
    // Dispose old targets first (before allocating new ones)
    if (targetsRef.current) {
      gpuMonitor.untrackRenderTarget(targetsRef.current.a);
      gpuMonitor.untrackRenderTarget(targetsRef.current.b);
      if (targetsRef.current.feedback) gpuMonitor.untrackRenderTarget(targetsRef.current.feedback);
      gpuMonitor.untrackRenderTarget(targetsRef.current.effect);
      gpuMonitor.untrackRenderTarget(targetsRef.current.effectFeedback);
      gpuMonitor.untrackRenderTarget(targetsRef.current.fxaa);
      targetsRef.current.a.dispose();
      targetsRef.current.b.dispose();
      targetsRef.current.feedback?.dispose();
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
    const fb = feedback
      ? new THREE.WebGLRenderTarget(width, height, opts)
      : null;
    targetsRef.current = {
      a: new THREE.WebGLRenderTarget(width, height, opts),
      b: new THREE.WebGLRenderTarget(width, height, opts),
      feedback: fb,
      effect: new THREE.WebGLRenderTarget(width, height, opts),
      effectFeedback: new THREE.WebGLRenderTarget(width, height, opts),
      fxaa: new THREE.WebGLRenderTarget(width, height, opts),
    };
    gpuMonitor.trackRenderTarget(targetsRef.current.a, "MultiPassQuad:a");
    gpuMonitor.trackRenderTarget(targetsRef.current.b, "MultiPassQuad:b");
    if (fb) gpuMonitor.trackRenderTarget(fb, "MultiPassQuad:feedback");
    gpuMonitor.trackRenderTarget(targetsRef.current.effect, "MultiPassQuad:effect");
    gpuMonitor.trackRenderTarget(targetsRef.current.effectFeedback, "MultiPassQuad:effectFeedback");
    gpuMonitor.trackRenderTarget(targetsRef.current.fxaa, "MultiPassQuad:fxaa");
    return () => {
      if (targetsRef.current) {
        gpuMonitor.untrackRenderTarget(targetsRef.current.a);
        gpuMonitor.untrackRenderTarget(targetsRef.current.b);
        if (targetsRef.current.feedback) gpuMonitor.untrackRenderTarget(targetsRef.current.feedback);
        gpuMonitor.untrackRenderTarget(targetsRef.current.effect);
        gpuMonitor.untrackRenderTarget(targetsRef.current.effectFeedback);
        gpuMonitor.untrackRenderTarget(targetsRef.current.fxaa);
        targetsRef.current.a.dispose();
        targetsRef.current.b.dispose();
        targetsRef.current.feedback?.dispose();
        targetsRef.current.effect.dispose();
        targetsRef.current.effectFeedback.dispose();
        targetsRef.current.fxaa.dispose();
      }
      targetsRef.current = null;
    };
  }, [width, height, feedback]);

  // Camera for offscreen rendering
  const camera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );

  // Main pass: scene + mesh + material
  const mainPass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const uniforms: Record<string, THREE.IUniform> = {
      ...createSharedBaseUniforms(fftTextureRef.current!),
      ...(feedback ? { uPrevFrame: { value: null as THREE.Texture | null } } : {}),
      ...extraUniforms,
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, mesh, material: mat, uniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Post-processing passes: each reads uInputTexture from previous output
  const postPassObjects = useMemo(() => {
    return postPasses.map((pass) => {
      const scene = new THREE.Scene();
      const geo = new THREE.PlaneGeometry(2, 2);
      const uniforms: Record<string, THREE.IUniform> = {
        uInputTexture: { value: null as THREE.Texture | null },
        uResolution: { value: new THREE.Vector2(width, height) },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        ...pass.extraUniforms,
      };
      const mat = new THREE.ShaderMaterial({
        vertexShader: PASSTHROUGH_VERT,
        fragmentShader: pass.fragmentShader,
        uniforms,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      return { scene, mesh, material: mat, uniforms };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dedicated copy pass: trivial passthrough shader for feedback buffer copy.
  // Replaces the previous approach of re-rendering the last post-pass (~10x cheaper).
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

  // Effect post-process pass (manifest-driven, between post-passes and FXAA)
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

  // FXAA anti-aliasing pass (runs after all post-passes, before feedback copy)
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
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return { scene, uniforms: fxaaUniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispose GPU resources on unmount to prevent shader program leaks
  useEffect(() => {
    return () => {
      mainPass.mesh.geometry.dispose();
      mainPass.material.dispose();
      for (const pp of postPassObjects) {
        pp.mesh.geometry.dispose();
        pp.material.dispose();
      }
      for (const pass of [copyPass, effectPass, fxaaPass]) {
        pass.scene.children.forEach((c) => {
          if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.ShaderMaterial).dispose(); }
        });
      }
    };
  }, [mainPass, postPassObjects, copyPass, effectPass, fxaaPass]);

  // Output material ref (for the visible mesh)
  const outputMaterialRef = useRef<THREE.ShaderMaterial>(null);
  // Initialize with a 1x1 dark texture to prevent black frame on mount
  const outputUniforms = useMemo(() => {
    const initTex = new THREE.DataTexture(new Uint8Array([5, 3, 8, 255]), 1, 1);
    initTex.needsUpdate = true;
    return { uInputTexture: { value: initTex as THREE.Texture | null } };
  }, []);

  // ── Sync all shared uniforms from audio/show data ──
  const u = mainPass.uniforms;
  syncBaseUniforms(u, {
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
  });

  // Update FFT texture
  if (fftTextureRef.current) {
    const c = smooth.contrast;
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

  // ── Multi-pass render orchestration ──
  useFrame(() => {
    // Gap detection: reset feedback on non-sequential frames (Remotion seeking)
    const gap = Math.abs(currentFrame - lastRenderedFrame.current) > 1;
    const targets = targetsRef.current;
    if (!targets) return;

    if (gap) {
      // Clear effect feedback on seek to prevent ghosting from distant frames
      gl.setRenderTarget(targets.effectFeedback);
      gl.clear();
      gl.setRenderTarget(null);
    }

    if (feedback && gap && targets.feedback) {
      // Clear with very dark (not pure black) to prevent black-flash on seek
      gl.getClearColor(_clearColor);
      const prevAlpha = gl.getClearAlpha();
      gl.setClearColor(0x050308, 1);
      gl.setRenderTarget(targets.feedback);
      gl.clear();
      gl.setClearColor(_clearColor, prevAlpha);
      gl.setRenderTarget(null);
    }

    // Bind feedback texture
    if (feedback && targets.feedback && u.uPrevFrame) {
      u.uPrevFrame.value = targets.feedback.texture;
    }

    // Pass 0: Main scene → target A
    gl.setRenderTarget(targets.a);
    gl.clear();
    gl.render(mainPass.scene, camera);

    // Post-processing passes: ping-pong between A and B
    let readTarget = targets.a;
    let writeTarget = targets.b;

    for (let i = 0; i < postPassObjects.length; i++) {
      const pass = postPassObjects[i];
      pass.uniforms.uInputTexture.value = readTarget.texture;
      pass.uniforms.uTime.value = time;
      pass.uniforms.uEnergy.value = smooth.energy;

      const isLast = i === postPassObjects.length - 1;

      if (isLast && !feedback) {
        // Last pass with no feedback: render directly to screen via output mesh
        gl.setRenderTarget(writeTarget);
      } else {
        gl.setRenderTarget(writeTarget);
      }
      gl.clear();
      gl.render(pass.scene, camera);

      // Swap targets for next pass
      const tmp = readTarget;
      readTarget = writeTarget;
      writeTarget = tmp;
    }

    // Determine which target has the pre-FXAA final output
    const preFxaaTarget =
      postPassObjects.length > 0 ? readTarget : targets.a;

    // Copy pre-FXAA output to feedback buffer (feedback sees unaliased content)
    if (feedback && targets.feedback) {
      copyPass.uniforms.uInputTexture.value = preFxaaTarget.texture;
      gl.setRenderTarget(targets.feedback);
      gl.clear();
      gl.render(copyPass.scene, camera);
    }

    // Effect post-process + composited (manifest-driven)
    effectPass.uniforms.uEffectPrevFrame.value = targets.effectFeedback.texture;
    const effectActive = effectState.effectMode > 0 || effectState.compositedMode > 0;
    let effectOutputTexture = preFxaaTarget.texture;
    if (effectActive) {
      effectPass.uniforms.uInputTexture.value = preFxaaTarget.texture;
      effectPass.uniforms.uEffectMode.value = effectState.effectMode;
      effectPass.uniforms.uEffectIntensity.value = effectState.effectIntensity;
      effectPass.uniforms.uCompositedMode.value = effectState.compositedMode;
      effectPass.uniforms.uCompositedIntensity.value = effectState.compositedIntensity;
      effectPass.uniforms.uEffectTime.value = time;
      effectPass.uniforms.uEffectEnergy.value = smooth.energy;
      effectPass.uniforms.uEffectBass.value = smooth.bass;
      effectPass.uniforms.uEffectBeatSnap.value = smooth.beatSnap ?? 0;
      effectPass.uniforms.uEffectResolution.value.set(width, height);

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

    // FXAA anti-aliasing: final quality pass
    fxaaPass.uniforms.uInputTexture.value = effectOutputTexture;
    fxaaPass.uniforms.uResolution.value.set(width, height);
    gl.setRenderTarget(targets.fxaa);
    gl.clear();
    gl.render(fxaaPass.scene, camera);

    // Set final texture on the visible output mesh
    outputUniforms.uInputTexture.value = targets.fxaa.texture;

    gl.setRenderTarget(null);
    lastRenderedFrame.current = currentFrame;
  }, -1); // Run before R3F's default render (priority -1)

  // Visible output mesh: displays the final render target
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={outputMaterialRef}
        vertexShader={PASSTHROUGH_VERT}
        fragmentShader={OUTPUT_FRAG}
        uniforms={outputUniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
};
