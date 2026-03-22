/**
 * Shared GLSL uniform declarations — the full superset used by all shaders.
 * FullscreenQuad.tsx sends all 51 uniforms to every shader; unused ones are
 * silently ignored by GLSL. This replaces the per-shader ~50-line uniform block.
 */

export const sharedUniformsGLSL = /* glsl */ `
// ─── Time ───
uniform float uTime;
uniform float uDynamicTime;

// ─── Core Audio Features ───
uniform float uBass;
uniform float uRms;
uniform float uCentroid;
uniform float uHighs;
uniform float uOnset;
uniform float uBeat;
uniform float uMids;
uniform float uEnergy;
uniform float uFlatness;

// ─── Smoothed / Derived Audio ───
uniform float uSlowEnergy;
uniform float uFastEnergy;
uniform float uFastBass;
uniform float uSpectralFlux;
uniform float uEnergyAccel;
uniform float uEnergyTrend;
uniform float uLocalTempo;

// ─── Beat / Rhythm ───
uniform float uTempo;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uSnapToMusicalTime;

// ─── Drum Stem ───
uniform float uDrumOnset;
uniform float uDrumBeat;
uniform float uStemBass;

// ─── Vocal / Other Stem ───
uniform float uVocalEnergy;
uniform float uVocalPresence;
uniform float uOtherEnergy;
uniform float uOtherCentroid;

// ─── Chroma / Spectral ───
uniform float uChromaHue;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform vec4 uContrast0;
uniform vec4 uContrast1;
uniform vec4 uChroma0;
uniform vec4 uChroma1;
uniform vec4 uChroma2;
uniform sampler2D uFFTTexture;

// ─── Section / Structure ───
uniform float uSectionProgress;
uniform float uSectionIndex;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform float uCoherence;
uniform float uJamDensity;

// ─── Jam Evolution ───
uniform float uJamPhase;    // 0=exploration, 1=building, 2=peak_space, 3=resolution (-1=not a jam)
uniform float uJamProgress; // 0-1 progress within current jam phase

// ─── Palette / Color ───
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uEraSaturation;
uniform float uEraBrightness;
uniform float uEraSepia;

// ─── Post-Process Control ───
uniform float uBloomThreshold;
uniform float uLensDistortion;
uniform float uGradingIntensity;

// ─── Melodic / Harmonic ───
uniform float uMelodicPitch;
uniform float uMelodicDirection;
uniform float uChordIndex;
uniform float uHarmonicTension;
uniform float uChordConfidence;
uniform float uSectionType;
uniform float uEnergyForecast;
uniform float uPeakApproaching;
uniform float uBeatStability;
uniform float uDownbeat;
uniform float uBeatConfidence;
uniform float uMelodicConfidence;
uniform float uImprovisationScore;

// ─── Peak-of-Show ───
uniform float uPeakOfShow;

// ─── Hero Icon ───
uniform float uHeroIconTrigger;
uniform float uHeroIconProgress;

// ─── Show Film Stock ───
uniform float uShowWarmth;
uniform float uShowContrast;
uniform float uShowSaturation;
uniform float uShowGrain;
uniform float uShowBloom;

// ─── Venue Profile ───
uniform float uVenueVignette;

// ─── 3D Camera ───
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uCamFov;
uniform float uCamDof;
uniform float uCamFocusDist;

// ─── Envelope (from EnergyEnvelope — moved from CSS to GLSL) ───
uniform float uEnvelopeBrightness; // energy-reactive brightness (0.02–1.55)
uniform float uEnvelopeSaturation; // combined saturation multiplier
uniform float uEnvelopeHue;        // total hue shift in radians

// ─── Spatial ───
uniform vec2 uResolution;
uniform vec2 uCamOffset;
`;
