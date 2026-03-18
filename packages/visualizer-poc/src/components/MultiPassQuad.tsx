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

/** Era saturation values — same as FullscreenQuad */
const ERA_SATURATION: Record<string, number> = {
  primal: 0.70,
  classic: 0.90,
  hiatus: 0.75,
  touch_of_grey: 1.15,
  revival: 0.95,
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
    uEnergyAccel: { value: 0 },
    uEnergyTrend: { value: 0 },
    uLocalTempo: { value: 120 },
    uFFTTexture: { value: fftTexture },
    uMelodicPitch: { value: 0 },
    uMelodicDirection: { value: 0 },
    uChordIndex: { value: 0 },
    uHarmonicTension: { value: 0 },
    uSectionType: { value: 5 },
    uEnergyForecast: { value: 0 },
    uPeakApproaching: { value: 0 },
    uBeatStability: { value: 0.5 },
    uImprovisationScore: { value: 0 },
    uHeroIconTrigger: { value: 0 },
    uHeroIconProgress: { value: 0 },
    uShowWarmth: { value: 0 },
    uShowContrast: { value: 1 },
    uShowSaturation: { value: 0 },
    uShowGrain: { value: 1 },
    uShowBloom: { value: 1 },
    uVenueVignette: { value: 0.5 },
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
    heroTrigger, heroProgress, jamDensity, coherence, dynamicTime, isLocked,
  } = useAudioData();
  const { width, height } = useVideoConfig();
  const currentFrame = useCurrentFrame();
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

  // Render targets: A + B for ping-pong, optional feedback buffer
  const targets = useMemo(() => {
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    };
    return {
      a: new THREE.WebGLRenderTarget(width, height, opts),
      b: new THREE.WebGLRenderTarget(width, height, opts),
      feedback: feedback
        ? new THREE.WebGLRenderTarget(width, height, opts)
        : null,
    };
  }, [width, height, feedback]);

  // Cleanup render targets
  useEffect(() => {
    return () => {
      targets.a.dispose();
      targets.b.dispose();
      targets.feedback?.dispose();
    };
  }, [targets]);

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

  // Output material ref (for the visible mesh)
  const outputMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const outputUniforms = useMemo(
    () => ({ uInputTexture: { value: null as THREE.Texture | null } }),
    [],
  );

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
  u.uEnergyAccel.value = smooth.energyAcceleration;
  u.uEnergyTrend.value = smooth.energyTrend;
  u.uLocalTempo.value = smooth.localTempo;
  u.uMelodicPitch.value = smooth.melodicPitch;
  u.uMelodicDirection.value = smooth.melodicDirection;
  u.uChordIndex.value = smooth.chordIndex;
  u.uHarmonicTension.value = smooth.harmonicTension;
  u.uSectionType.value = smooth.sectionTypeFloat;
  u.uEnergyForecast.value = smooth.energyForecast;
  u.uPeakApproaching.value = smooth.peakApproaching;
  u.uBeatStability.value = smooth.beatStability;
  u.uImprovisationScore.value = smooth.improvisationScore ?? 0;
  u.uHeroIconTrigger.value = heroTrigger;
  u.uHeroIconProgress.value = heroProgress;
  u.uShowWarmth.value = filmStock.warmth + venueProfile.warmth;
  u.uShowContrast.value = filmStock.contrast;
  u.uShowSaturation.value = filmStock.saturation;
  u.uShowGrain.value = filmStock.grain * venueProfile.grainMult;
  u.uShowBloom.value = filmStock.bloom * venueProfile.bloomMult;
  u.uVenueVignette.value = venueProfile.vignette;

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
    if (feedback && gap && targets.feedback) {
      gl.setRenderTarget(targets.feedback);
      gl.clear();
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

    // Determine which target has the final output
    const finalTarget =
      postPassObjects.length > 0 ? readTarget : targets.a;

    // Copy final output to feedback buffer
    if (feedback && targets.feedback) {
      // Use a blit copy
      const currentRT = gl.getRenderTarget();
      gl.setRenderTarget(targets.feedback);
      // Render the final target's texture to feedback
      // Reuse the last post pass scene or create a simple copy
      if (postPassObjects.length > 0) {
        const lastPass = postPassObjects[postPassObjects.length - 1];
        lastPass.uniforms.uInputTexture.value = finalTarget.texture;
        gl.render(lastPass.scene, camera);
      } else {
        // No post passes: copy main output to feedback
        // We need a copy scene for this
        mainPass.uniforms.uPrevFrame && (mainPass.uniforms.uPrevFrame.value = null);
        gl.render(mainPass.scene, camera);
      }
      gl.setRenderTarget(currentRT);
    }

    // Set final texture on the visible output mesh
    outputUniforms.uInputTexture.value = finalTarget.texture;

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
