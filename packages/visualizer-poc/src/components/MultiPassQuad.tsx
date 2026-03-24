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
import { compute3DCamera } from "../utils/camera-3d";
import { useSceneConfig } from "../scenes/SceneConfigContext";
import { useEnvelopeValues } from "../data/EnvelopeContext";
import { fxaaVert, fxaaFrag } from "../shaders/shared/fxaa.glsl";

/** Reusable Color for save/restore clear color */
const _clearColor = new THREE.Color();

/** Era saturation values — same as FullscreenQuad */
const ERA_SATURATION: Record<string, number> = {
  primal: 0.85,
  classic: 0.95,
  hiatus: 0.88,
  touch_of_grey: 1.10,
  revival: 0.98,
};

/** Era brightness values — same as FullscreenQuad */
const ERA_BRIGHTNESS: Record<string, number> = {
  primal: 0.97,
  classic: 1.0,
  hiatus: 0.95,
  touch_of_grey: 1.01,
  revival: 1.0,
};

/** Era sepia tint strength — same as FullscreenQuad */
const ERA_SEPIA: Record<string, number> = {
  primal: 0.15,
  classic: 0.0,
  hiatus: 0.0,
  touch_of_grey: 0.0,
  revival: 0.0,
};

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
  vec4 col = texture2D(uInputTexture, vUv);
  col.rgb = max(col.rgb, vec3(0.06, 0.05, 0.08));
  gl_FragColor = col;
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

/**
 * Creates the base set of audio uniforms (same as FullscreenQuad).
 * Feedback mode adds uPrevFrame.
 */
function createBaseUniforms(
  width: number,
  height: number,
  feedback: boolean,
  fftTexture: THREE.DataTexture,
  extraUniforms?: Record<string, THREE.IUniform>,
): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uDynamicTime: { value: 0 },
    uBass: { value: 0 },
    uRms: { value: 0 },
    uCentroid: { value: 0 },
    uHighs: { value: 0 },
    uOnset: { value: 0 },
    uBeat: { value: 0 },
    uMids: { value: 0 },
    uResolution: { value: new THREE.Vector2(width, height) },
    uEnergy: { value: 0 },
    uSectionProgress: { value: 0 },
    uSectionIndex: { value: 0 },
    uChromaHue: { value: 0 },
    uFlatness: { value: 0 },
    uPalettePrimary: { value: 0 },
    uPaletteSecondary: { value: 0 },
    uPaletteSaturation: { value: 1 },
    uTempo: { value: 120 },
    uOnsetSnap: { value: 0 },
    uBeatSnap: { value: 0 },
    uChromaShift: { value: 0 },
    uAfterglowHue: { value: 0 },
    uMusicalTime: { value: 0 },
    uClimaxPhase: { value: 0 },
    uClimaxIntensity: { value: 0 },
    uSlowEnergy: { value: 0 },
    uStemBass: { value: 0 },
    uContrast0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uContrast1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma2: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCamOffset: { value: new THREE.Vector2(0, 0) },
    uJamDensity: { value: 0.5 },
    uJamPhase: { value: -1 },
    uJamProgress: { value: 0 },
    uCoherence: { value: 0 },
    uFastEnergy: { value: 0 },
    uFastBass: { value: 0 },
    uDrumOnset: { value: 0 },
    uDrumBeat: { value: 0 },
    uSpectralFlux: { value: 0 },
    uVocalEnergy: { value: 0 },
    uVocalPresence: { value: 0 },
    uOtherEnergy: { value: 0 },
    uOtherCentroid: { value: 0 },
    uSnapToMusicalTime: { value: 0 },
    uEraSaturation: { value: 1.0 },
    uEraBrightness: { value: 1.0 },
    uEraSepia: { value: 0.0 },
    uBloomThreshold: { value: 0.0 },
    uLensDistortion: { value: 0.0 },
    uGradingIntensity: { value: 1.0 },
    uEnergyAccel: { value: 0 },
    uEnergyTrend: { value: 0 },
    uLocalTempo: { value: 120 },
    uFFTTexture: { value: fftTexture },
    uMelodicPitch: { value: 0 },
    uMelodicDirection: { value: 0 },
    uChordIndex: { value: 0 },
    uHarmonicTension: { value: 0 },
    uChordConfidence: { value: 0.5 },
    uSectionType: { value: 5 },
    uEnergyForecast: { value: 0 },
    uPeakApproaching: { value: 0 },
    uBeatStability: { value: 0.5 },
    uImprovisationScore: { value: 0 },
    uDownbeat: { value: 0 },
    uBeatConfidence: { value: 0.5 },
    uMelodicConfidence: { value: 0.5 },
    uPeakOfShow: { value: 0 },
    uHeroIconTrigger: { value: 0 },
    uHeroIconProgress: { value: 0 },
    uShowWarmth: { value: 0 },
    uShowContrast: { value: 1 },
    uShowSaturation: { value: 0 },
    uShowGrain: { value: 1 },
    uShowBloom: { value: 1 },
    uVenueVignette: { value: 0.5 },
    uCamPos: { value: new THREE.Vector3(0, 0, -3.5) },
    uCamTarget: { value: new THREE.Vector3(0, 0, 0) },
    uCamFov: { value: 50 },
    uCamDof: { value: 0 },
    uCamFocusDist: { value: 3 },
    uEnvelopeBrightness: { value: 1 },
    uEnvelopeSaturation: { value: 1 },
    uEnvelopeHue: { value: 0 },
    ...(feedback ? { uPrevFrame: { value: null as THREE.Texture | null } } : {}),
    ...extraUniforms,
  };
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
  const gl = useThree((state) => state.gl);

  const lastRenderedFrame = useRef(-1);

  // FFT texture
  const fftTextureRef = useRef<THREE.DataTexture | null>(null);
  if (!fftTextureRef.current) {
    const data = new Uint8Array(64);
    fftTextureRef.current = new THREE.DataTexture(data, 64, 1, THREE.RedFormat);
    fftTextureRef.current.needsUpdate = true;
  }

  // Render targets: A + B for ping-pong, optional feedback buffer.
  // Uses useRef + useEffect so old targets dispose BEFORE new ones allocate,
  // preventing ~235MB GPU VRAM spike on resolution changes (e.g. 1080p→4K).
  const targetsRef = useRef<{
    a: THREE.WebGLRenderTarget;
    b: THREE.WebGLRenderTarget;
    feedback: THREE.WebGLRenderTarget | null;
    fxaa: THREE.WebGLRenderTarget;
  } | null>(null);

  useEffect(() => {
    // Dispose old targets first (before allocating new ones)
    if (targetsRef.current) {
      targetsRef.current.a.dispose();
      targetsRef.current.b.dispose();
      targetsRef.current.feedback?.dispose();
      targetsRef.current.fxaa.dispose();
    }
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    };
    targetsRef.current = {
      a: new THREE.WebGLRenderTarget(width, height, opts),
      b: new THREE.WebGLRenderTarget(width, height, opts),
      feedback: feedback
        ? new THREE.WebGLRenderTarget(width, height, opts)
        : null,
      fxaa: new THREE.WebGLRenderTarget(width, height, opts),
    };
    return () => {
      targetsRef.current?.a.dispose();
      targetsRef.current?.b.dispose();
      targetsRef.current?.feedback?.dispose();
      targetsRef.current?.fxaa.dispose();
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
    const uniforms = createBaseUniforms(
      width, height, feedback, fftTextureRef.current!, extraUniforms,
    );
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

  // Output material ref (for the visible mesh)
  const outputMaterialRef = useRef<THREE.ShaderMaterial>(null);
  // Initialize with a 1x1 dark texture to prevent black frame on mount
  const outputUniforms = useMemo(() => {
    const initTex = new THREE.DataTexture(new Uint8Array([5, 3, 8, 255]), 1, 1);
    initTex.needsUpdate = true;
    return { uInputTexture: { value: initTex as THREE.Texture | null } };
  }, []);

  // ── Update all uniforms (mirrors FullscreenQuad) ──
  const u = mainPass.uniforms;
  u.uTime.value = time;
  u.uDynamicTime.value = dynamicTime;
  u.uBass.value = smooth.bass;
  u.uRms.value = smooth.rms;
  u.uCentroid.value = smooth.centroid;
  u.uHighs.value = smooth.highs;
  u.uOnset.value = smooth.onset;
  u.uBeat.value = beatDecay;
  u.uMids.value = smooth.mids;
  u.uResolution.value.set(width, height);
  u.uEnergy.value = smooth.energy;
  u.uSectionProgress.value = smooth.sectionProgress;
  u.uSectionIndex.value = smooth.sectionIndex;
  u.uChromaHue.value = smooth.chromaHue;
  u.uFlatness.value = smooth.flatness;
  u.uPalettePrimary.value = palettePrimary;
  u.uPaletteSecondary.value = paletteSecondary;
  u.uPaletteSaturation.value = paletteSaturation;
  u.uTempo.value = tempo;
  u.uOnsetSnap.value = smooth.onsetSnap;
  u.uBeatSnap.value = smooth.beatSnap;
  u.uChromaShift.value = smooth.chromaShift;
  u.uAfterglowHue.value = smooth.afterglowHue;
  u.uMusicalTime.value = musicalTime;
  u.uClimaxPhase.value = climaxPhase;
  u.uClimaxIntensity.value = climaxIntensity;
  u.uJamDensity.value = jamDensity;
  u.uJamPhase.value = jamPhase;
  u.uJamProgress.value = jamProgress;
  u.uCoherence.value = coherence;
  u.uSlowEnergy.value = smooth.slowEnergy;
  u.uStemBass.value = smooth.stemBass;
  u.uFastEnergy.value = smooth.fastEnergy;
  u.uFastBass.value = smooth.fastBass;
  u.uDrumOnset.value = smooth.drumOnset;
  u.uDrumBeat.value = smooth.drumBeat;
  u.uSpectralFlux.value = smooth.spectralFlux;
  u.uVocalEnergy.value = smooth.vocalEnergy;
  u.uVocalPresence.value = smooth.vocalPresence;
  u.uOtherEnergy.value = smooth.otherEnergy;
  u.uOtherCentroid.value = smooth.otherCentroid;
  u.uSnapToMusicalTime.value = isLocked ? 1.0 : 0.0;
  u.uEraSaturation.value = eraSaturation;
  u.uEraBrightness.value = eraBrightness;
  u.uEraSepia.value = eraSepia;
  u.uBloomThreshold.value = -0.08 - smooth.energy * 0.18;
  u.uLensDistortion.value = 0.02 + smooth.energy * 0.06;
  u.uGradingIntensity.value = sceneConfig.gradingIntensity;
  u.uEnergyAccel.value = smooth.energyAcceleration;
  u.uEnergyTrend.value = smooth.energyTrend;
  u.uLocalTempo.value = smooth.localTempo;
  u.uMelodicPitch.value = smooth.melodicPitch;
  u.uMelodicDirection.value = smooth.melodicDirection;
  u.uChordIndex.value = smooth.chordIndex;
  u.uHarmonicTension.value = smooth.harmonicTension;
  u.uChordConfidence.value = smooth.chordConfidence;
  u.uSectionType.value = smooth.sectionTypeFloat;
  u.uEnergyForecast.value = smooth.energyForecast;
  u.uPeakApproaching.value = smooth.peakApproaching;
  u.uBeatStability.value = smooth.beatStability;
  u.uImprovisationScore.value = smooth.improvisationScore ?? 0;
  u.uDownbeat.value = smooth.downbeat;
  u.uBeatConfidence.value = smooth.beatConfidence;
  u.uMelodicConfidence.value = smooth.melodicConfidence ?? 0.5;
  u.uPeakOfShow.value = peakOfShow;
  u.uHeroIconTrigger.value = heroTrigger;
  u.uHeroIconProgress.value = heroProgress;
  u.uShowWarmth.value = filmStock.warmth + venueProfile.warmth;
  u.uShowContrast.value = filmStock.contrast;
  u.uShowSaturation.value = filmStock.saturation;
  u.uShowGrain.value = filmStock.grain * venueProfile.grainMult;
  u.uShowBloom.value = filmStock.bloom * venueProfile.bloomMult;
  u.uVenueVignette.value = venueProfile.vignette;
  u.uEnvelopeBrightness.value = envelope.brightness;
  u.uEnvelopeSaturation.value = envelope.saturation;
  u.uEnvelopeHue.value = envelope.hue;

  // 3D Camera
  const cam3d = compute3DCamera(
    time, dynamicTime, smooth.energy, smooth.bass,
    smooth.fastEnergy, smooth.vocalPresence, smooth.drumOnset,
    smooth.sectionProgress, smooth.sectionIndex,
    climaxPhase, climaxIntensity,
    smooth.beatStability, smooth.beatSnap,
  );
  u.uCamPos.value.set(cam3d.position[0], cam3d.position[1], cam3d.position[2]);
  u.uCamTarget.value.set(cam3d.target[0], cam3d.target[1], cam3d.target[2]);
  u.uCamFov.value = cam3d.fov;
  u.uCamDof.value = cam3d.dofStrength;
  u.uCamFocusDist.value = cam3d.focusDistance;

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

  // Contrast + chroma vec4s
  const c = smooth.contrast;
  u.uContrast0.value.set(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0);
  u.uContrast1.value.set(c[4] ?? 0, c[5] ?? 0, c[6] ?? 0, 0);

  const ch = smooth.chroma;
  u.uChroma0.value.set(ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0, ch[3] ?? 0);
  u.uChroma1.value.set(ch[4] ?? 0, ch[5] ?? 0, ch[6] ?? 0, ch[7] ?? 0);
  u.uChroma2.value.set(ch[8] ?? 0, ch[9] ?? 0, ch[10] ?? 0, ch[11] ?? 0);

  // Camera offset
  const bassAmp = smooth.bass * 12.0;
  const camOffX = Math.sin(time * 3.7) * bassAmp * 0.5 +
    Math.sin(dynamicTime * 0.03 * Math.PI * 2) * 4;
  const camOffY = Math.cos(time * 2.3) * bassAmp * 0.3 +
    Math.cos(dynamicTime * 0.03 * Math.PI * 2 * 0.7 + 1.3) * 2.4;
  u.uCamOffset.value.set(camOffX, camOffY);

  // ── Multi-pass render orchestration ──
  useFrame(() => {
    // Gap detection: reset feedback on non-sequential frames (Remotion seeking)
    const gap = Math.abs(currentFrame - lastRenderedFrame.current) > 1;
    const targets = targetsRef.current;
    if (!targets) return;

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

    // FXAA anti-aliasing: final quality pass
    fxaaPass.uniforms.uInputTexture.value = preFxaaTarget.texture;
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
