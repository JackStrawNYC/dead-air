// AUTO-GENERATED — do not edit by hand.
// Source: packages/renderer/uniforms-schema.json
// Regenerate: npx tsx packages/renderer/scripts/generate-uniform-packer.mts
// Drift gate: cargo test --test uniform_schema_drift

export const UNIFORM_BUFFER_SIZE = 656;

export interface UniformValues {
  // ─── Time ───
  /** offset 0 — frame.time */
  uTime?: number;
  /** offset 4 — frame.dynamic_time */
  uDynamicTime?: number;
  /** offset 8 — frame.beat_time */
  uBeatTime?: number;
  // ─── Core Audio Features ───
  /** offset 12 — frame.bass */
  uBass?: number;
  /** offset 16 — frame.rms */
  uRms?: number;
  /** offset 20 — frame.centroid */
  uCentroid?: number;
  /** offset 24 — frame.highs */
  uHighs?: number;
  /** offset 28 — frame.onset */
  uOnset?: number;
  /** offset 32 — frame.beat */
  uBeat?: number;
  /** offset 36 — frame.mids */
  uMids?: number;
  /** offset 40 — frame.energy */
  uEnergy?: number;
  /** offset 44 — flatness.clamp(0.0, 1.0) */
  uFlatness?: number;
  // ─── Smoothed / Derived Audio ───
  /** offset 48 — frame.slow_energy */
  uSlowEnergy?: number;
  /** offset 52 — frame.fast_energy */
  uFastEnergy?: number;
  /** offset 56 — frame.fast_bass */
  uFastBass?: number;
  /** offset 60 — frame.spectral_flux */
  uSpectralFlux?: number;
  /** offset 64 — frame.energy_accel */
  uEnergyAccel?: number;
  /** offset 68 — frame.energy_trend */
  uEnergyTrend?: number;
  /** offset 72 — (≈ global tempo) */
  uLocalTempo?: number;
  /** offset 76 — frame.tempo */
  uTempo?: number;
  // ─── Beat / Rhythm ───
  /** offset 80 — frame.onset_snap */
  uOnsetSnap?: number;
  /** offset 84 — frame.beat_snap */
  uBeatSnap?: number;
  /** offset 88 — frame.musical_time */
  uMusicalTime?: number;
  /** offset 92 — (≈ musical time) */
  uSnapToMusicalTime?: number;
  // ─── Drum Stem ───
  /** offset 96 — frame.drum_onset */
  uDrumOnset?: number;
  /** offset 100 — frame.drum_beat */
  uDrumBeat?: number;
  /** offset 104 — frame.stem_bass */
  uStemBass?: number;
  /** offset 108 — frame.stem_drums */
  uStemDrums?: number;
  /** offset 112 — frame.drum_onset */
  uStemDrumOnset?: number;
  /** offset 116 — frame.vocal_energy */
  uVocalEnergy?: number;
  /** offset 120 — frame.vocal_presence */
  uVocalPresence?: number;
  /** offset 124 — frame.vocal_energy */
  uStemVocalRms?: number;
  // ─── Vocal / Other Stem ───
  /** offset 128 — frame.other_energy */
  uOtherEnergy?: number;
  /** offset 132 — frame.other_centroid */
  uOtherCentroid?: number;
  // ─── Chroma / Spectral ───
  /** offset 136 — frame.chroma_hue */
  uChromaHue?: number;
  /** offset 140 — frame.chroma_shift */
  uChromaShift?: number;
  /** offset 144 — frame.chroma_hue * frame.energy.min(1.0) * 0.5 */
  uAfterglowHue?: number;
  /** offset 160 — vec4 (4f) */
  uContrast0?: number[];
  /** offset 176 — vec4 (4f) */
  uContrast1?: number[];
  /** offset 192 — vec4 (4f) */
  uChroma0?: number[];
  /** offset 208 — vec4 (4f) */
  uChroma1?: number[];
  /** offset 224 — vec4 (4f) */
  uChroma2?: number[];
  // ─── Section / Structure ───
  /** offset 240 — frame.section_progress */
  uSectionProgress?: number;
  /** offset 244 — frame.section_index */
  uSectionIndex?: number;
  /** offset 248 — frame.climax_phase */
  uClimaxPhase?: number;
  /** offset 252 — frame.climax_intensity */
  uClimaxIntensity?: number;
  /** offset 256 — frame.coherence */
  uCoherence?: number;
  /** offset 260 — frame.jam_density */
  uJamDensity?: number;
  /** offset 264 — frame.song_progress.unwrap_or(0.0) */
  uSongProgress?: number;
  /** offset 268 — frame.shader_hold_progress.unwrap_or(0.0) */
  uShaderHoldProgress?: number;
  // ─── Jam Evolution ───
  /** offset 272 — frame.jam_phase */
  uJamPhase?: number;
  /** offset 276 — frame.jam_progress */
  uJamProgress?: number;
  // ─── Palette / Color ───
  /** offset 280 — frame.palette_primary */
  uPalettePrimary?: number;
  /** offset 284 — frame.palette_secondary */
  uPaletteSecondary?: number;
  /** offset 288 — frame.palette_saturation */
  uPaletteSaturation?: number;
  // ─── Era ───
  /** offset 292 — frame.era_saturation */
  uEraSaturation?: number;
  /** offset 296 — frame.era_brightness */
  uEraBrightness?: number;
  /** offset 300 — frame.era_sepia */
  uEraSepia?: number;
  // ─── Post-Process Control ───
  /** offset 304 — -0.08 - frame.energy * 0.18 */
  uBloomThreshold?: number;
  /** offset 308 — 0.02 + frame.energy * 0.06 */
  uLensDistortion?: number;
  /** offset 312 — 1.0 */
  uGradingIntensity?: number;
  // ─── Melodic / Harmonic ───
  /** offset 316 — frame.melodic_pitch */
  uMelodicPitch?: number;
  /** offset 320 — frame.melodic_direction */
  uMelodicDirection?: number;
  /** offset 324 — frame.chord_index */
  uChordIndex?: number;
  /** offset 328 — frame.harmonic_tension */
  uHarmonicTension?: number;
  /** offset 332 — frame.chord_confidence */
  uChordConfidence?: number;
  /** offset 336 — frame.section_type */
  uSectionType?: number;
  /** offset 340 — frame.energy_forecast */
  uEnergyForecast?: number;
  /** offset 344 — frame.peak_approaching */
  uPeakApproaching?: number;
  /** offset 348 — frame.beat_stability */
  uBeatStability?: number;
  /** offset 352 — frame.downbeat */
  uDownbeat?: number;
  /** offset 356 — frame.beat_confidence */
  uBeatConfidence?: number;
  /** offset 360 — frame.melodic_confidence */
  uMelodicConfidence?: number;
  /** offset 364 — frame.improvisation_score */
  uImprovisationScore?: number;
  // ─── Peak-of-Show ───
  /** offset 368 — frame.peak_of_show */
  uPeakOfShow?: number;
  // ─── Hero Icon ───
  /** offset 372 — 0.0 */
  uHeroIconTrigger?: number;
  /** offset 376 — 0.0 */
  uHeroIconProgress?: number;
  // ─── Show Film Stock ───
  /** offset 380 — frame.show_warmth */
  uShowWarmth?: number;
  /** offset 384 — frame.show_contrast */
  uShowContrast?: number;
  /** offset 388 — frame.show_saturation */
  uShowSaturation?: number;
  /** offset 392 — frame.show_grain */
  uShowGrain?: number;
  /** offset 396 — frame.show_bloom */
  uShowBloom?: number;
  // ─── Venue Profile ───
  /** offset 400 — 0.2 */
  uVenueVignette?: number;
  // ─── 3D Camera (computed from audio) ───
  /** offset 444 — fov */
  uCamFov?: number;
  /** offset 448 — dof */
  uCamDof?: number;
  /** offset 452 — focus_dist */
  uCamFocusDist?: number;
  // ─── Envelope ───
  /** offset 456 — frame.envelope_brightness */
  uEnvelopeBrightness?: number;
  /** offset 460 — frame.envelope_saturation */
  uEnvelopeSaturation?: number;
  /** offset 464 — frame.envelope_hue */
  uEnvelopeHue?: number;
  // ─── Deep Audio (Level 2) ───
  /** offset 468 — frame.tempo_derivative */
  uTempoDerivative?: number;
  /** offset 472 — frame.dynamic_range */
  uDynamicRange?: number;
  /** offset 476 — frame.space_score */
  uSpaceScore?: number;
  /** offset 480 — frame.timbral_brightness */
  uTimbralBrightness?: number;
  /** offset 484 — frame.timbral_flux */
  uTimbralFlux?: number;
  /** offset 488 — frame.vocal_pitch */
  uVocalPitch?: number;
  // ─── Effects ───
  /** offset 492 — 0.0 */
  uPhilBombWave?: number;
  // ─── Semantic Labels (CLAP) ───
  /** offset 496 — frame.semantic_psychedelic */
  uSemanticPsychedelic?: number;
  /** offset 500 — frame.semantic_cosmic */
  uSemanticCosmic?: number;
  /** offset 504 — frame.semantic_chaotic */
  uSemanticChaotic?: number;
  /** offset 508 — frame.semantic_aggressive */
  uSemanticAggressive?: number;
  /** offset 512 — frame.semantic_tender */
  uSemanticTender?: number;
  /** offset 516 — frame.semantic_ambient */
  uSemanticAmbient?: number;
  /** offset 520 — frame.semantic_rhythmic */
  uSemanticRhythmic?: number;
  /** offset 524 — frame.semantic_triumphant */
  uSemanticTriumphant?: number;
  // ─── Per-Song Shader Parameter Modulation ───
  /** offset 528 — frame.param_bass_scale */
  uParamBassScale?: number;
  /** offset 532 — frame.param_energy_scale */
  uParamEnergyScale?: number;
  /** offset 536 — frame.param_motion_speed */
  uParamMotionSpeed?: number;
  /** offset 540 — frame.param_color_sat_bias */
  uParamColorSatBias?: number;
  /** offset 544 — frame.param_complexity */
  uParamComplexity?: number;
  /** offset 548 — frame.param_drum_reactivity */
  uParamDrumReactivity?: number;
  /** offset 552 — frame.param_vocal_weight */
  uParamVocalWeight?: number;
  // ─── Temporal Coherence ───
  /** offset 608 — temporal_blend */
  uTemporalBlendStrength?: number;
  // ─── Per-Show Visual Identity ───
  /** offset 612 — frame.show_grain_character.unwrap_or(0.5) */
  uShowGrainCharacter?: number;
  /** offset 616 — frame.show_bloom_character.unwrap_or(0.0) */
  uShowBloomCharacter?: number;
  /** offset 620 — frame.show_temperature_character.unwrap_or(0.0) */
  uShowTemperatureCharacter?: number;
  /** offset 624 — frame.show_contrast_character.unwrap_or(0.5) */
  uShowContrastCharacter?: number;
}

/** Pack a partial UniformValues into the std140 buffer. Missing fields stay 0. */
export function packUniforms(values: UniformValues, target?: Uint8Array): Uint8Array {
  const buf = target ?? new Uint8Array(UNIFORM_BUFFER_SIZE);
  if (buf.length < UNIFORM_BUFFER_SIZE) {
    throw new Error(`packUniforms: target buffer is ${buf.length} bytes, need ${UNIFORM_BUFFER_SIZE}`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (values.uTime !== undefined) view.setFloat32(0, values.uTime, true);
  if (values.uDynamicTime !== undefined) view.setFloat32(4, values.uDynamicTime, true);
  if (values.uBeatTime !== undefined) view.setFloat32(8, values.uBeatTime, true);
  if (values.uBass !== undefined) view.setFloat32(12, values.uBass, true);
  if (values.uRms !== undefined) view.setFloat32(16, values.uRms, true);
  if (values.uCentroid !== undefined) view.setFloat32(20, values.uCentroid, true);
  if (values.uHighs !== undefined) view.setFloat32(24, values.uHighs, true);
  if (values.uOnset !== undefined) view.setFloat32(28, values.uOnset, true);
  if (values.uBeat !== undefined) view.setFloat32(32, values.uBeat, true);
  if (values.uMids !== undefined) view.setFloat32(36, values.uMids, true);
  if (values.uEnergy !== undefined) view.setFloat32(40, values.uEnergy, true);
  if (values.uFlatness !== undefined) view.setFloat32(44, values.uFlatness, true);
  if (values.uSlowEnergy !== undefined) view.setFloat32(48, values.uSlowEnergy, true);
  if (values.uFastEnergy !== undefined) view.setFloat32(52, values.uFastEnergy, true);
  if (values.uFastBass !== undefined) view.setFloat32(56, values.uFastBass, true);
  if (values.uSpectralFlux !== undefined) view.setFloat32(60, values.uSpectralFlux, true);
  if (values.uEnergyAccel !== undefined) view.setFloat32(64, values.uEnergyAccel, true);
  if (values.uEnergyTrend !== undefined) view.setFloat32(68, values.uEnergyTrend, true);
  if (values.uLocalTempo !== undefined) view.setFloat32(72, values.uLocalTempo, true);
  if (values.uTempo !== undefined) view.setFloat32(76, values.uTempo, true);
  if (values.uOnsetSnap !== undefined) view.setFloat32(80, values.uOnsetSnap, true);
  if (values.uBeatSnap !== undefined) view.setFloat32(84, values.uBeatSnap, true);
  if (values.uMusicalTime !== undefined) view.setFloat32(88, values.uMusicalTime, true);
  if (values.uSnapToMusicalTime !== undefined) view.setFloat32(92, values.uSnapToMusicalTime, true);
  if (values.uDrumOnset !== undefined) view.setFloat32(96, values.uDrumOnset, true);
  if (values.uDrumBeat !== undefined) view.setFloat32(100, values.uDrumBeat, true);
  if (values.uStemBass !== undefined) view.setFloat32(104, values.uStemBass, true);
  if (values.uStemDrums !== undefined) view.setFloat32(108, values.uStemDrums, true);
  if (values.uStemDrumOnset !== undefined) view.setFloat32(112, values.uStemDrumOnset, true);
  if (values.uVocalEnergy !== undefined) view.setFloat32(116, values.uVocalEnergy, true);
  if (values.uVocalPresence !== undefined) view.setFloat32(120, values.uVocalPresence, true);
  if (values.uStemVocalRms !== undefined) view.setFloat32(124, values.uStemVocalRms, true);
  if (values.uOtherEnergy !== undefined) view.setFloat32(128, values.uOtherEnergy, true);
  if (values.uOtherCentroid !== undefined) view.setFloat32(132, values.uOtherCentroid, true);
  if (values.uChromaHue !== undefined) view.setFloat32(136, values.uChromaHue, true);
  if (values.uChromaShift !== undefined) view.setFloat32(140, values.uChromaShift, true);
  if (values.uAfterglowHue !== undefined) view.setFloat32(144, values.uAfterglowHue, true);
  if (values.uContrast0) {
    view.setFloat32(160, values.uContrast0[0] ?? 0, true);
    view.setFloat32(164, values.uContrast0[1] ?? 0, true);
    view.setFloat32(168, values.uContrast0[2] ?? 0, true);
    view.setFloat32(172, values.uContrast0[3] ?? 0, true);
  }
  if (values.uContrast1) {
    view.setFloat32(176, values.uContrast1[0] ?? 0, true);
    view.setFloat32(180, values.uContrast1[1] ?? 0, true);
    view.setFloat32(184, values.uContrast1[2] ?? 0, true);
    view.setFloat32(188, values.uContrast1[3] ?? 0, true);
  }
  if (values.uChroma0) {
    view.setFloat32(192, values.uChroma0[0] ?? 0, true);
    view.setFloat32(196, values.uChroma0[1] ?? 0, true);
    view.setFloat32(200, values.uChroma0[2] ?? 0, true);
    view.setFloat32(204, values.uChroma0[3] ?? 0, true);
  }
  if (values.uChroma1) {
    view.setFloat32(208, values.uChroma1[0] ?? 0, true);
    view.setFloat32(212, values.uChroma1[1] ?? 0, true);
    view.setFloat32(216, values.uChroma1[2] ?? 0, true);
    view.setFloat32(220, values.uChroma1[3] ?? 0, true);
  }
  if (values.uChroma2) {
    view.setFloat32(224, values.uChroma2[0] ?? 0, true);
    view.setFloat32(228, values.uChroma2[1] ?? 0, true);
    view.setFloat32(232, values.uChroma2[2] ?? 0, true);
    view.setFloat32(236, values.uChroma2[3] ?? 0, true);
  }
  if (values.uSectionProgress !== undefined) view.setFloat32(240, values.uSectionProgress, true);
  if (values.uSectionIndex !== undefined) view.setFloat32(244, values.uSectionIndex, true);
  if (values.uClimaxPhase !== undefined) view.setFloat32(248, values.uClimaxPhase, true);
  if (values.uClimaxIntensity !== undefined) view.setFloat32(252, values.uClimaxIntensity, true);
  if (values.uCoherence !== undefined) view.setFloat32(256, values.uCoherence, true);
  if (values.uJamDensity !== undefined) view.setFloat32(260, values.uJamDensity, true);
  if (values.uSongProgress !== undefined) view.setFloat32(264, values.uSongProgress, true);
  if (values.uShaderHoldProgress !== undefined) view.setFloat32(268, values.uShaderHoldProgress, true);
  if (values.uJamPhase !== undefined) view.setFloat32(272, values.uJamPhase, true);
  if (values.uJamProgress !== undefined) view.setFloat32(276, values.uJamProgress, true);
  if (values.uPalettePrimary !== undefined) view.setFloat32(280, values.uPalettePrimary, true);
  if (values.uPaletteSecondary !== undefined) view.setFloat32(284, values.uPaletteSecondary, true);
  if (values.uPaletteSaturation !== undefined) view.setFloat32(288, values.uPaletteSaturation, true);
  if (values.uEraSaturation !== undefined) view.setFloat32(292, values.uEraSaturation, true);
  if (values.uEraBrightness !== undefined) view.setFloat32(296, values.uEraBrightness, true);
  if (values.uEraSepia !== undefined) view.setFloat32(300, values.uEraSepia, true);
  if (values.uBloomThreshold !== undefined) view.setFloat32(304, values.uBloomThreshold, true);
  if (values.uLensDistortion !== undefined) view.setFloat32(308, values.uLensDistortion, true);
  if (values.uGradingIntensity !== undefined) view.setFloat32(312, values.uGradingIntensity, true);
  if (values.uMelodicPitch !== undefined) view.setFloat32(316, values.uMelodicPitch, true);
  if (values.uMelodicDirection !== undefined) view.setFloat32(320, values.uMelodicDirection, true);
  if (values.uChordIndex !== undefined) view.setFloat32(324, values.uChordIndex, true);
  if (values.uHarmonicTension !== undefined) view.setFloat32(328, values.uHarmonicTension, true);
  if (values.uChordConfidence !== undefined) view.setFloat32(332, values.uChordConfidence, true);
  if (values.uSectionType !== undefined) view.setFloat32(336, values.uSectionType, true);
  if (values.uEnergyForecast !== undefined) view.setFloat32(340, values.uEnergyForecast, true);
  if (values.uPeakApproaching !== undefined) view.setFloat32(344, values.uPeakApproaching, true);
  if (values.uBeatStability !== undefined) view.setFloat32(348, values.uBeatStability, true);
  if (values.uDownbeat !== undefined) view.setFloat32(352, values.uDownbeat, true);
  if (values.uBeatConfidence !== undefined) view.setFloat32(356, values.uBeatConfidence, true);
  if (values.uMelodicConfidence !== undefined) view.setFloat32(360, values.uMelodicConfidence, true);
  if (values.uImprovisationScore !== undefined) view.setFloat32(364, values.uImprovisationScore, true);
  if (values.uPeakOfShow !== undefined) view.setFloat32(368, values.uPeakOfShow, true);
  if (values.uHeroIconTrigger !== undefined) view.setFloat32(372, values.uHeroIconTrigger, true);
  if (values.uHeroIconProgress !== undefined) view.setFloat32(376, values.uHeroIconProgress, true);
  if (values.uShowWarmth !== undefined) view.setFloat32(380, values.uShowWarmth, true);
  if (values.uShowContrast !== undefined) view.setFloat32(384, values.uShowContrast, true);
  if (values.uShowSaturation !== undefined) view.setFloat32(388, values.uShowSaturation, true);
  if (values.uShowGrain !== undefined) view.setFloat32(392, values.uShowGrain, true);
  if (values.uShowBloom !== undefined) view.setFloat32(396, values.uShowBloom, true);
  if (values.uVenueVignette !== undefined) view.setFloat32(400, values.uVenueVignette, true);
  if (values.uCamFov !== undefined) view.setFloat32(444, values.uCamFov, true);
  if (values.uCamDof !== undefined) view.setFloat32(448, values.uCamDof, true);
  if (values.uCamFocusDist !== undefined) view.setFloat32(452, values.uCamFocusDist, true);
  if (values.uEnvelopeBrightness !== undefined) view.setFloat32(456, values.uEnvelopeBrightness, true);
  if (values.uEnvelopeSaturation !== undefined) view.setFloat32(460, values.uEnvelopeSaturation, true);
  if (values.uEnvelopeHue !== undefined) view.setFloat32(464, values.uEnvelopeHue, true);
  if (values.uTempoDerivative !== undefined) view.setFloat32(468, values.uTempoDerivative, true);
  if (values.uDynamicRange !== undefined) view.setFloat32(472, values.uDynamicRange, true);
  if (values.uSpaceScore !== undefined) view.setFloat32(476, values.uSpaceScore, true);
  if (values.uTimbralBrightness !== undefined) view.setFloat32(480, values.uTimbralBrightness, true);
  if (values.uTimbralFlux !== undefined) view.setFloat32(484, values.uTimbralFlux, true);
  if (values.uVocalPitch !== undefined) view.setFloat32(488, values.uVocalPitch, true);
  if (values.uPhilBombWave !== undefined) view.setFloat32(492, values.uPhilBombWave, true);
  if (values.uSemanticPsychedelic !== undefined) view.setFloat32(496, values.uSemanticPsychedelic, true);
  if (values.uSemanticCosmic !== undefined) view.setFloat32(500, values.uSemanticCosmic, true);
  if (values.uSemanticChaotic !== undefined) view.setFloat32(504, values.uSemanticChaotic, true);
  if (values.uSemanticAggressive !== undefined) view.setFloat32(508, values.uSemanticAggressive, true);
  if (values.uSemanticTender !== undefined) view.setFloat32(512, values.uSemanticTender, true);
  if (values.uSemanticAmbient !== undefined) view.setFloat32(516, values.uSemanticAmbient, true);
  if (values.uSemanticRhythmic !== undefined) view.setFloat32(520, values.uSemanticRhythmic, true);
  if (values.uSemanticTriumphant !== undefined) view.setFloat32(524, values.uSemanticTriumphant, true);
  if (values.uParamBassScale !== undefined) view.setFloat32(528, values.uParamBassScale, true);
  if (values.uParamEnergyScale !== undefined) view.setFloat32(532, values.uParamEnergyScale, true);
  if (values.uParamMotionSpeed !== undefined) view.setFloat32(536, values.uParamMotionSpeed, true);
  if (values.uParamColorSatBias !== undefined) view.setFloat32(540, values.uParamColorSatBias, true);
  if (values.uParamComplexity !== undefined) view.setFloat32(544, values.uParamComplexity, true);
  if (values.uParamDrumReactivity !== undefined) view.setFloat32(548, values.uParamDrumReactivity, true);
  if (values.uParamVocalWeight !== undefined) view.setFloat32(552, values.uParamVocalWeight, true);
  if (values.uTemporalBlendStrength !== undefined) view.setFloat32(608, values.uTemporalBlendStrength, true);
  if (values.uShowGrainCharacter !== undefined) view.setFloat32(612, values.uShowGrainCharacter, true);
  if (values.uShowBloomCharacter !== undefined) view.setFloat32(616, values.uShowBloomCharacter, true);
  if (values.uShowTemperatureCharacter !== undefined) view.setFloat32(620, values.uShowTemperatureCharacter, true);
  if (values.uShowContrastCharacter !== undefined) view.setFloat32(624, values.uShowContrastCharacter, true);

  return buf;
}

export const UNIFORM_FIELDS: ReadonlyArray<{ name: string; offset: number; type: string }> = [
  { name: "uTime", offset: 0, type: "float" },
  { name: "uDynamicTime", offset: 4, type: "float" },
  { name: "uBeatTime", offset: 8, type: "float" },
  { name: "uBass", offset: 12, type: "float" },
  { name: "uRms", offset: 16, type: "float" },
  { name: "uCentroid", offset: 20, type: "float" },
  { name: "uHighs", offset: 24, type: "float" },
  { name: "uOnset", offset: 28, type: "float" },
  { name: "uBeat", offset: 32, type: "float" },
  { name: "uMids", offset: 36, type: "float" },
  { name: "uEnergy", offset: 40, type: "float" },
  { name: "uFlatness", offset: 44, type: "float" },
  { name: "uSlowEnergy", offset: 48, type: "float" },
  { name: "uFastEnergy", offset: 52, type: "float" },
  { name: "uFastBass", offset: 56, type: "float" },
  { name: "uSpectralFlux", offset: 60, type: "float" },
  { name: "uEnergyAccel", offset: 64, type: "float" },
  { name: "uEnergyTrend", offset: 68, type: "float" },
  { name: "uLocalTempo", offset: 72, type: "float" },
  { name: "uTempo", offset: 76, type: "float" },
  { name: "uOnsetSnap", offset: 80, type: "float" },
  { name: "uBeatSnap", offset: 84, type: "float" },
  { name: "uMusicalTime", offset: 88, type: "float" },
  { name: "uSnapToMusicalTime", offset: 92, type: "float" },
  { name: "uDrumOnset", offset: 96, type: "float" },
  { name: "uDrumBeat", offset: 100, type: "float" },
  { name: "uStemBass", offset: 104, type: "float" },
  { name: "uStemDrums", offset: 108, type: "float" },
  { name: "uStemDrumOnset", offset: 112, type: "float" },
  { name: "uVocalEnergy", offset: 116, type: "float" },
  { name: "uVocalPresence", offset: 120, type: "float" },
  { name: "uStemVocalRms", offset: 124, type: "float" },
  { name: "uOtherEnergy", offset: 128, type: "float" },
  { name: "uOtherCentroid", offset: 132, type: "float" },
  { name: "uChromaHue", offset: 136, type: "float" },
  { name: "uChromaShift", offset: 140, type: "float" },
  { name: "uAfterglowHue", offset: 144, type: "float" },
  { name: "uContrast0", offset: 160, type: "vec4" },
  { name: "uContrast1", offset: 176, type: "vec4" },
  { name: "uChroma0", offset: 192, type: "vec4" },
  { name: "uChroma1", offset: 208, type: "vec4" },
  { name: "uChroma2", offset: 224, type: "vec4" },
  { name: "uSectionProgress", offset: 240, type: "float" },
  { name: "uSectionIndex", offset: 244, type: "float" },
  { name: "uClimaxPhase", offset: 248, type: "float" },
  { name: "uClimaxIntensity", offset: 252, type: "float" },
  { name: "uCoherence", offset: 256, type: "float" },
  { name: "uJamDensity", offset: 260, type: "float" },
  { name: "uSongProgress", offset: 264, type: "float" },
  { name: "uShaderHoldProgress", offset: 268, type: "float" },
  { name: "uJamPhase", offset: 272, type: "float" },
  { name: "uJamProgress", offset: 276, type: "float" },
  { name: "uPalettePrimary", offset: 280, type: "float" },
  { name: "uPaletteSecondary", offset: 284, type: "float" },
  { name: "uPaletteSaturation", offset: 288, type: "float" },
  { name: "uEraSaturation", offset: 292, type: "float" },
  { name: "uEraBrightness", offset: 296, type: "float" },
  { name: "uEraSepia", offset: 300, type: "float" },
  { name: "uBloomThreshold", offset: 304, type: "float" },
  { name: "uLensDistortion", offset: 308, type: "float" },
  { name: "uGradingIntensity", offset: 312, type: "float" },
  { name: "uMelodicPitch", offset: 316, type: "float" },
  { name: "uMelodicDirection", offset: 320, type: "float" },
  { name: "uChordIndex", offset: 324, type: "float" },
  { name: "uHarmonicTension", offset: 328, type: "float" },
  { name: "uChordConfidence", offset: 332, type: "float" },
  { name: "uSectionType", offset: 336, type: "float" },
  { name: "uEnergyForecast", offset: 340, type: "float" },
  { name: "uPeakApproaching", offset: 344, type: "float" },
  { name: "uBeatStability", offset: 348, type: "float" },
  { name: "uDownbeat", offset: 352, type: "float" },
  { name: "uBeatConfidence", offset: 356, type: "float" },
  { name: "uMelodicConfidence", offset: 360, type: "float" },
  { name: "uImprovisationScore", offset: 364, type: "float" },
  { name: "uPeakOfShow", offset: 368, type: "float" },
  { name: "uHeroIconTrigger", offset: 372, type: "float" },
  { name: "uHeroIconProgress", offset: 376, type: "float" },
  { name: "uShowWarmth", offset: 380, type: "float" },
  { name: "uShowContrast", offset: 384, type: "float" },
  { name: "uShowSaturation", offset: 388, type: "float" },
  { name: "uShowGrain", offset: 392, type: "float" },
  { name: "uShowBloom", offset: 396, type: "float" },
  { name: "uVenueVignette", offset: 400, type: "float" },
  { name: "uCamFov", offset: 444, type: "float" },
  { name: "uCamDof", offset: 448, type: "float" },
  { name: "uCamFocusDist", offset: 452, type: "float" },
  { name: "uEnvelopeBrightness", offset: 456, type: "float" },
  { name: "uEnvelopeSaturation", offset: 460, type: "float" },
  { name: "uEnvelopeHue", offset: 464, type: "float" },
  { name: "uTempoDerivative", offset: 468, type: "float" },
  { name: "uDynamicRange", offset: 472, type: "float" },
  { name: "uSpaceScore", offset: 476, type: "float" },
  { name: "uTimbralBrightness", offset: 480, type: "float" },
  { name: "uTimbralFlux", offset: 484, type: "float" },
  { name: "uVocalPitch", offset: 488, type: "float" },
  { name: "uPhilBombWave", offset: 492, type: "float" },
  { name: "uSemanticPsychedelic", offset: 496, type: "float" },
  { name: "uSemanticCosmic", offset: 500, type: "float" },
  { name: "uSemanticChaotic", offset: 504, type: "float" },
  { name: "uSemanticAggressive", offset: 508, type: "float" },
  { name: "uSemanticTender", offset: 512, type: "float" },
  { name: "uSemanticAmbient", offset: 516, type: "float" },
  { name: "uSemanticRhythmic", offset: 520, type: "float" },
  { name: "uSemanticTriumphant", offset: 524, type: "float" },
  { name: "uParamBassScale", offset: 528, type: "float" },
  { name: "uParamEnergyScale", offset: 532, type: "float" },
  { name: "uParamMotionSpeed", offset: 536, type: "float" },
  { name: "uParamColorSatBias", offset: 540, type: "float" },
  { name: "uParamComplexity", offset: 544, type: "float" },
  { name: "uParamDrumReactivity", offset: 548, type: "float" },
  { name: "uParamVocalWeight", offset: 552, type: "float" },
  { name: "uTemporalBlendStrength", offset: 608, type: "float" },
  { name: "uShowGrainCharacter", offset: 612, type: "float" },
  { name: "uShowBloomCharacter", offset: 616, type: "float" },
  { name: "uShowTemperatureCharacter", offset: 620, type: "float" },
  { name: "uShowContrastCharacter", offset: 624, type: "float" },
];
