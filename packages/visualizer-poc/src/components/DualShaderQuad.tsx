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
import { deriveFilmStock, type FilmStockParams } from "../utils/show-film-stock";
import { getVenueProfile, type VenueProfile } from "../utils/venue-profiles";
import { compute3DCamera } from "../utils/camera-3d";
import { dualBlendVert, dualBlendFrag } from "../shaders/dual-blend";

/** Era values — same as FullscreenQuad */
const ERA_SATURATION: Record<string, number> = { primal: 0.70, classic: 0.90, hiatus: 0.75, touch_of_grey: 1.15, revival: 0.95 };
const ERA_BRIGHTNESS: Record<string, number> = { primal: 0.97, classic: 1.0, hiatus: 0.95, touch_of_grey: 1.01, revival: 1.0 };
const ERA_SEPIA: Record<string, number> = { primal: 0.15, classic: 0.0, hiatus: 0.0, touch_of_grey: 0.0, revival: 0.0 };

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

/** Create audio uniforms matching FullscreenQuad (without FFT texture for simplicity) */
function createSceneUniforms(width: number, height: number): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 }, uDynamicTime: { value: 0 },
    uBass: { value: 0 }, uRms: { value: 0 }, uCentroid: { value: 0 },
    uHighs: { value: 0 }, uOnset: { value: 0 }, uBeat: { value: 0 },
    uMids: { value: 0 }, uResolution: { value: new THREE.Vector2(width, height) },
    uEnergy: { value: 0 }, uSectionProgress: { value: 0 }, uSectionIndex: { value: 0 },
    uChromaHue: { value: 0 }, uFlatness: { value: 0 },
    uPalettePrimary: { value: 0 }, uPaletteSecondary: { value: 0 }, uPaletteSaturation: { value: 1 },
    uTempo: { value: 120 }, uOnsetSnap: { value: 0 }, uBeatSnap: { value: 0 },
    uChromaShift: { value: 0 }, uAfterglowHue: { value: 0 },
    uMusicalTime: { value: 0 }, uClimaxPhase: { value: 0 }, uClimaxIntensity: { value: 0 },
    uSlowEnergy: { value: 0 }, uStemBass: { value: 0 },
    uContrast0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uContrast1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma0: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma1: { value: new THREE.Vector4(0, 0, 0, 0) },
    uChroma2: { value: new THREE.Vector4(0, 0, 0, 0) },
    uCamOffset: { value: new THREE.Vector2(0, 0) },
    uJamDensity: { value: 0.5 }, uCoherence: { value: 0 },
    uFastEnergy: { value: 0 }, uFastBass: { value: 0 },
    uDrumOnset: { value: 0 }, uDrumBeat: { value: 0 },
    uSpectralFlux: { value: 0 },
    uVocalEnergy: { value: 0 }, uVocalPresence: { value: 0 },
    uOtherEnergy: { value: 0 }, uOtherCentroid: { value: 0 },
    uSnapToMusicalTime: { value: 0 },
    uEraSaturation: { value: 1.0 }, uEraBrightness: { value: 1.0 }, uEraSepia: { value: 0.0 },
    uBloomThreshold: { value: 0.0 }, uLensDistortion: { value: 0.0 },
    uEnergyAccel: { value: 0 }, uEnergyTrend: { value: 0 }, uLocalTempo: { value: 120 },
    uFFTTexture: { value: new THREE.DataTexture(new Uint8Array(64), 64, 1, THREE.RedFormat) },
    uMelodicPitch: { value: 0 }, uMelodicDirection: { value: 0 },
    uChordIndex: { value: 0 }, uHarmonicTension: { value: 0 },
    uSectionType: { value: 5 }, uEnergyForecast: { value: 0 },
    uPeakApproaching: { value: 0 }, uBeatStability: { value: 0.5 },
    uImprovisationScore: { value: 0 },
    uHeroIconTrigger: { value: 0 }, uHeroIconProgress: { value: 0 },
    uShowWarmth: { value: 0 }, uShowContrast: { value: 1 },
    uShowSaturation: { value: 0 }, uShowGrain: { value: 1 }, uShowBloom: { value: 1 },
    uVenueVignette: { value: 0.5 },
    uCamPos: { value: new THREE.Vector3(0, 0, -3.5) },
    uCamTarget: { value: new THREE.Vector3(0, 0, 0) },
    uCamFov: { value: 50 }, uCamDof: { value: 0 }, uCamFocusDist: { value: 3 },
  };
}

/** Sync uniform values from audio data (mirrors FullscreenQuad per-frame updates) */
function syncUniforms(
  u: Record<string, THREE.IUniform>,
  time: number, dynamicTime: number, beatDecay: number,
  smooth: Record<string, number | number[]>,
  palettePrimary: number, paletteSecondary: number, paletteSaturation: number,
  tempo: number, musicalTime: number,
  climaxPhase: number, climaxIntensity: number,
  heroTrigger: number, heroProgress: number,
  jamDensity: number, coherence: number, isLocked: boolean,
  eraSaturation: number, eraBrightness: number, eraSepia: number,
  filmStock: FilmStockParams, venueProfile: VenueProfile,
  width: number, height: number,
) {
  u.uTime.value = time;
  u.uDynamicTime.value = dynamicTime;
  u.uBass.value = smooth.bass;
  u.uRms.value = smooth.rms;
  u.uCentroid.value = smooth.centroid;
  u.uHighs.value = smooth.highs;
  u.uOnset.value = smooth.onset;
  u.uBeat.value = beatDecay;
  u.uMids.value = smooth.mids;
  (u.uResolution.value as THREE.Vector2).set(width, height);
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
  u.uBloomThreshold.value = -0.08 - (smooth.energy as number) * 0.18;
  u.uLensDistortion.value = 0.02 + (smooth.energy as number) * 0.06;
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

  // 3D Camera
  const cam3d = compute3DCamera(
    time, dynamicTime, smooth.energy as number, smooth.bass as number,
    smooth.fastEnergy as number, smooth.vocalPresence as number, smooth.drumOnset as number,
    smooth.sectionProgress as number, smooth.sectionIndex as number,
    climaxPhase, climaxIntensity,
    smooth.beatStability as number, smooth.beatSnap as number,
  );
  (u.uCamPos.value as THREE.Vector3).set(cam3d.position[0], cam3d.position[1], cam3d.position[2]);
  (u.uCamTarget.value as THREE.Vector3).set(cam3d.target[0], cam3d.target[1], cam3d.target[2]);
  u.uCamFov.value = cam3d.fov;
  u.uCamDof.value = cam3d.dofStrength;
  u.uCamFocusDist.value = cam3d.focusDistance;

  // Chroma / contrast
  const ch = smooth.chroma as number[];
  if (ch) {
    (u.uChroma0.value as THREE.Vector4).set(ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0, ch[3] ?? 0);
    (u.uChroma1.value as THREE.Vector4).set(ch[4] ?? 0, ch[5] ?? 0, ch[6] ?? 0, ch[7] ?? 0);
    (u.uChroma2.value as THREE.Vector4).set(ch[8] ?? 0, ch[9] ?? 0, ch[10] ?? 0, ch[11] ?? 0);
  }
  const cst = smooth.contrast as number[];
  if (cst) {
    (u.uContrast0.value as THREE.Vector4).set(cst[0] ?? 0, cst[1] ?? 0, cst[2] ?? 0, cst[3] ?? 0);
    (u.uContrast1.value as THREE.Vector4).set(cst[4] ?? 0, cst[5] ?? 0, cst[6] ?? 0, 0);
  }
}

export const DualShaderQuad: React.FC<Props> = ({
  vertexShaderA, fragmentShaderA,
  vertexShaderB, fragmentShaderB,
  blendMode, blendProgress,
}) => {
  const {
    time, beatDecay, smooth, palettePrimary, paletteSecondary,
    paletteSaturation, tempo, musicalTime, climaxPhase, climaxIntensity,
    heroTrigger, heroProgress, jamDensity, coherence, dynamicTime, isLocked,
  } = useAudioData();
  const { width, height } = useVideoConfig();
  const showCtx = useShowContext();
  const eraKey = showCtx?.era ?? "";
  const eraSaturation = ERA_SATURATION[eraKey] ?? 1.0;
  const eraBrightness = ERA_BRIGHTNESS[eraKey] ?? 1.0;
  const eraSepia = ERA_SEPIA[eraKey] ?? 0.0;
  const filmStock = deriveFilmStock(showCtx?.showSeed ?? 0);
  const venueProfile = getVenueProfile(showCtx?.venueType ?? "");
  const gl = useThree((state) => state.gl);

  // Render targets (HalfFloat for HDR)
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
    };
  }, [width, height]);

  useEffect(() => {
    return () => { targets.a.dispose(); targets.b.dispose(); };
  }, [targets]);

  const camera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  // Scene A
  const sceneA = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const uniforms = createSceneUniforms(width, height);
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
    const uniforms = createSceneUniforms(width, height);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertexShaderB, fragmentShader: fragmentShaderB,
      uniforms, depthWrite: false, depthTest: false,
    });
    scene.add(new THREE.Mesh(geo, mat));
    return { scene, uniforms };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Composite material
  const outputUniforms = useMemo(() => ({
    uInputTexture: { value: null as THREE.Texture | null },
  }), []);

  const compositePass = useMemo(() => {
    const scene = new THREE.Scene();
    const geo = new THREE.PlaneGeometry(2, 2);
    const uniforms: Record<string, THREE.IUniform> = {
      ...createSceneUniforms(width, height),
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

  // Per-frame render pipeline
  const syncArgs = [
    time, dynamicTime, beatDecay, smooth,
    palettePrimary, paletteSecondary, paletteSaturation,
    tempo, musicalTime, climaxPhase, climaxIntensity,
    heroTrigger, heroProgress, jamDensity, coherence, isLocked,
    eraSaturation, eraBrightness, eraSepia,
    filmStock, venueProfile, width, height,
  ] as const;

  // Update uniforms for both scenes
  syncUniforms(sceneA.uniforms, ...syncArgs);
  syncUniforms(sceneB.uniforms, ...syncArgs);
  syncUniforms(compositePass.uniforms, ...syncArgs);

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

    // Render composite to a temporary target, then blit to output
    gl.setRenderTarget(targets.a); // reuse target A for final composite
    gl.clear();
    gl.render(compositePass.scene, camera);

    outputUniforms.uInputTexture.value = targets.a.texture;
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
