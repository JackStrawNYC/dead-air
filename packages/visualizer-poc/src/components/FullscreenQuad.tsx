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
import { useVideoConfig } from "remotion";
import { useShowContext } from "../data/ShowContext";
import { deriveFilmStock } from "../utils/show-film-stock";
import { getVenueProfile } from "../utils/venue-profiles";
import { compute3DCamera } from "../utils/camera-3d";
import { useSceneConfig } from "../scenes/SceneConfigContext";
import { useEnvelopeValues } from "../data/EnvelopeContext";
import { fxaaVert, fxaaFrag } from "../shaders/shared/fxaa.glsl";

/** Era saturation values — previously in EraGrade CSS, now owned by GLSL */
const ERA_SATURATION: Record<string, number> = {
  primal: 0.85,
  classic: 0.95,
  hiatus: 0.88,
  touch_of_grey: 1.10,
  revival: 0.98,
};

/** Era brightness values — moved from EraGrade CSS to GLSL for unified grading */
const ERA_BRIGHTNESS: Record<string, number> = {
  primal: 0.97,
  classic: 1.0,
  hiatus: 0.95,
  touch_of_grey: 1.01,
  revival: 1.0,
};

/** Era sepia tint strength — moved from EraGrade CSS to GLSL */
const ERA_SEPIA: Record<string, number> = {
  primal: 0.15,
  classic: 0.0,
  hiatus: 0.0,
  touch_of_grey: 0.0,
  revival: 0.0,
};

/** Passthrough vertex shader for output mesh */
const PASSTHROUGH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** Final output shader: samples uInputTexture with minimum luminance floor.
 *  "Music Leads" guarantee: the shader NEVER outputs pure black. */
const OUTPUT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uInputTexture;
varying vec2 vUv;
void main() {
  vec4 col = texture2D(uInputTexture, vUv);
  // Minimum luminance floor: dark purple ambient glow, never pure black
  col.rgb = max(col.rgb, vec3(0.06, 0.05, 0.08));
  gl_FragColor = col;
}
`;

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
  const { time, beatDecay, smooth, palettePrimary, paletteSecondary, paletteSaturation, tempo, musicalTime, climaxPhase, climaxIntensity, heroTrigger, heroProgress, jamDensity, coherence, dynamicTime, isLocked, jamPhase, jamProgress, peakOfShow } = useAudioData();
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
  const gl = useThree((state) => state.gl);

  // FFT texture: 64-bin DataTexture from 7-band contrast (padded)
  const fftTextureRef = useRef<THREE.DataTexture | null>(null);
  if (!fftTextureRef.current) {
    const data = new Uint8Array(64);
    fftTextureRef.current = new THREE.DataTexture(data, 64, 1, THREE.RedFormat);
    fftTextureRef.current.needsUpdate = true;
  }

  // Render targets for FXAA post-pass
  const targetsRef = useRef<{
    main: THREE.WebGLRenderTarget;
    fxaa: THREE.WebGLRenderTarget;
  } | null>(null);

  useEffect(() => {
    if (targetsRef.current) {
      targetsRef.current.main.dispose();
      targetsRef.current.fxaa.dispose();
    }
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    };
    targetsRef.current = {
      main: new THREE.WebGLRenderTarget(width, height, opts),
      fxaa: new THREE.WebGLRenderTarget(width, height, opts),
    };
    return () => {
      targetsRef.current?.main.dispose();
      targetsRef.current?.fxaa.dispose();
      targetsRef.current = null;
    };
  }, [width, height]);

  // Camera for offscreen rendering
  const camera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );

  const uniforms = useMemo(() => {
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
      uFFTTexture: { value: fftTextureRef.current },
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
      uTempoDerivative: { value: 0 },
      uDynamicRange: { value: 0.5 },
      uSpaceScore: { value: 0 },
      uTimbralBrightness: { value: 0.5 },
      uTimbralFlux: { value: 0 },
      uVocalPitch: { value: 0 },
      uSemanticPsychedelic: { value: 0 },
      uSemanticCosmic: { value: 0 },
      uSemanticChaotic: { value: 0 },
      uSemanticAggressive: { value: 0 },
      uSemanticTender: { value: 0 },
      uSemanticAmbient: { value: 0 },
      uSemanticRhythmic: { value: 0 },
      uSemanticTriumphant: { value: 0 },
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

  // Initialize with a 1x1 dark texture to prevent black frame on mount
  const outputUniforms = useMemo(() => {
    const initTex = new THREE.DataTexture(new Uint8Array([26, 20, 40, 255]), 1, 1);
    initTex.needsUpdate = true;
    return { uInputTexture: { value: initTex as THREE.Texture | null } };
  }, []);

  uniforms.uTime.value = time;
  uniforms.uDynamicTime.value = dynamicTime;
  uniforms.uBass.value = smooth.bass;
  uniforms.uRms.value = smooth.rms;
  uniforms.uCentroid.value = smooth.centroid;
  uniforms.uHighs.value = smooth.highs;
  uniforms.uOnset.value = smooth.onset;
  uniforms.uBeat.value = beatDecay;
  uniforms.uMids.value = smooth.mids;
  uniforms.uResolution.value.set(width, height);
  uniforms.uEnergy.value = smooth.energy;
  uniforms.uSectionProgress.value = smooth.sectionProgress;
  uniforms.uSectionIndex.value = smooth.sectionIndex;
  uniforms.uChromaHue.value = smooth.chromaHue;
  uniforms.uFlatness.value = smooth.flatness;
  uniforms.uPalettePrimary.value = palettePrimary;
  uniforms.uPaletteSecondary.value = paletteSecondary;
  uniforms.uPaletteSaturation.value = paletteSaturation;
  uniforms.uTempo.value = tempo;
  uniforms.uOnsetSnap.value = smooth.onsetSnap;
  uniforms.uBeatSnap.value = smooth.beatSnap;
  uniforms.uChromaShift.value = smooth.chromaShift;
  uniforms.uAfterglowHue.value = smooth.afterglowHue;
  uniforms.uMusicalTime.value = musicalTime;
  uniforms.uClimaxPhase.value = climaxPhase;
  uniforms.uClimaxIntensity.value = climaxIntensity;
  uniforms.uJamDensity.value = jamDensity;
  uniforms.uJamPhase.value = jamPhase;
  uniforms.uJamProgress.value = jamProgress;
  uniforms.uCoherence.value = coherence;
  uniforms.uSlowEnergy.value = smooth.slowEnergy;
  uniforms.uStemBass.value = smooth.stemBass;
  uniforms.uFastEnergy.value = smooth.fastEnergy;
  uniforms.uFastBass.value = smooth.fastBass;
  uniforms.uDrumOnset.value = smooth.drumOnset;
  uniforms.uDrumBeat.value = smooth.drumBeat;
  uniforms.uSpectralFlux.value = smooth.spectralFlux;
  uniforms.uVocalEnergy.value = smooth.vocalEnergy;
  uniforms.uVocalPresence.value = smooth.vocalPresence;
  uniforms.uOtherEnergy.value = smooth.otherEnergy;
  uniforms.uOtherCentroid.value = smooth.otherCentroid;
  uniforms.uSnapToMusicalTime.value = isLocked ? 1.0 : 0.0;
  uniforms.uEraSaturation.value = eraSaturation;
  uniforms.uEraBrightness.value = eraBrightness;
  uniforms.uEraSepia.value = eraSepia;
  uniforms.uBloomThreshold.value = -0.08 - smooth.energy * 0.18;
  uniforms.uLensDistortion.value = 0.02 + smooth.energy * 0.06;
  uniforms.uGradingIntensity.value = sceneConfig.gradingIntensity;
  uniforms.uEnergyAccel.value = smooth.energyAcceleration;
  uniforms.uEnergyTrend.value = smooth.energyTrend;
  uniforms.uLocalTempo.value = smooth.localTempo;
  uniforms.uMelodicPitch.value = smooth.melodicPitch;
  uniforms.uMelodicDirection.value = smooth.melodicDirection;
  uniforms.uChordIndex.value = smooth.chordIndex;
  uniforms.uHarmonicTension.value = smooth.harmonicTension;
  uniforms.uChordConfidence.value = smooth.chordConfidence;
  uniforms.uSectionType.value = smooth.sectionTypeFloat;
  uniforms.uEnergyForecast.value = smooth.energyForecast;
  uniforms.uPeakApproaching.value = smooth.peakApproaching;
  uniforms.uBeatStability.value = smooth.beatStability;
  uniforms.uImprovisationScore.value = smooth.improvisationScore ?? 0;
  uniforms.uDownbeat.value = smooth.downbeat;
  uniforms.uBeatConfidence.value = smooth.beatConfidence;
  uniforms.uMelodicConfidence.value = smooth.melodicConfidence ?? 0.5;
  uniforms.uPeakOfShow.value = peakOfShow;
  uniforms.uHeroIconTrigger.value = heroTrigger;
  uniforms.uHeroIconProgress.value = heroProgress;
  uniforms.uShowWarmth.value = filmStock.warmth + venueProfile.warmth;
  uniforms.uShowContrast.value = filmStock.contrast;
  uniforms.uShowSaturation.value = filmStock.saturation;
  uniforms.uShowGrain.value = filmStock.grain * venueProfile.grainMult;
  uniforms.uShowBloom.value = filmStock.bloom * venueProfile.bloomMult;
  uniforms.uVenueVignette.value = venueProfile.vignette;
  uniforms.uEnvelopeBrightness.value = envelope.brightness;
  uniforms.uEnvelopeSaturation.value = envelope.saturation;
  uniforms.uEnvelopeHue.value = envelope.hue;
  uniforms.uTempoDerivative.value = smooth.tempoDerivative ?? 0;
  uniforms.uDynamicRange.value = smooth.dynamicRange ?? 0.5;
  uniforms.uSpaceScore.value = smooth.spaceScore ?? 0;
  uniforms.uTimbralBrightness.value = smooth.timbralBrightness ?? 0.5;
  uniforms.uTimbralFlux.value = smooth.timbralFlux ?? 0;
  uniforms.uVocalPitch.value = smooth.vocalPitch ?? 0;
  uniforms.uSemanticPsychedelic.value = smooth.semanticPsychedelic ?? 0;
  uniforms.uSemanticCosmic.value = smooth.semanticCosmic ?? 0;
  uniforms.uSemanticChaotic.value = smooth.semanticChaotic ?? 0;
  uniforms.uSemanticAggressive.value = smooth.semanticAggressive ?? 0;
  uniforms.uSemanticTender.value = smooth.semanticTender ?? 0;
  uniforms.uSemanticAmbient.value = smooth.semanticAmbient ?? 0;
  uniforms.uSemanticRhythmic.value = smooth.semanticRhythmic ?? 0;
  uniforms.uSemanticTriumphant.value = smooth.semanticTriumphant ?? 0;

  // 3D Camera
  const cam3d = compute3DCamera(
    time, dynamicTime, smooth.energy, smooth.bass,
    smooth.fastEnergy, smooth.vocalPresence, smooth.drumOnset,
    smooth.sectionProgress, smooth.sectionIndex,
    climaxPhase, climaxIntensity,
    smooth.beatStability, smooth.beatSnap,
  );
  uniforms.uCamPos.value.set(cam3d.position[0], cam3d.position[1], cam3d.position[2]);
  uniforms.uCamTarget.value.set(cam3d.target[0], cam3d.target[1], cam3d.target[2]);
  uniforms.uCamFov.value = cam3d.fov;
  uniforms.uCamDof.value = cam3d.dofStrength;
  uniforms.uCamFocusDist.value = cam3d.focusDistance;

  const c = smooth.contrast;

  // Update FFT texture from 7-band contrast (padded to 64 bins)
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

  uniforms.uContrast0.value.set(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0);
  uniforms.uContrast1.value.set(c[4] ?? 0, c[5] ?? 0, c[6] ?? 0, 0);

  const ch = smooth.chroma;
  uniforms.uChroma0.value.set(ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0, ch[3] ?? 0);
  uniforms.uChroma1.value.set(ch[4] ?? 0, ch[5] ?? 0, ch[6] ?? 0, ch[7] ?? 0);
  uniforms.uChroma2.value.set(ch[8] ?? 0, ch[9] ?? 0, ch[10] ?? 0, ch[11] ?? 0);

  // Camera offset: approximate CameraMotion's drift for parallax
  const bassAmp = smooth.bass * 12.0;
  const camOffX = Math.sin(time * 3.7) * bassAmp * 0.5 + Math.sin(dynamicTime * 0.03 * Math.PI * 2) * 4;
  const camOffY = Math.cos(time * 2.3) * bassAmp * 0.3 + Math.cos(dynamicTime * 0.03 * Math.PI * 2 * 0.7 + 1.3) * 2.4;
  uniforms.uCamOffset.value.set(camOffX, camOffY);

  // ── Render pipeline: main shader → FXAA → output ──
  useFrame(() => {
    const targets = targetsRef.current;
    if (!targets) return;

    // Pass 0: Main shader → render target
    gl.setRenderTarget(targets.main);
    gl.clear();
    gl.render(mainPass.scene, camera);

    // Pass 1: FXAA anti-aliasing
    fxaaPass.uniforms.uInputTexture.value = targets.main.texture;
    fxaaPass.uniforms.uResolution.value.set(width, height);
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
