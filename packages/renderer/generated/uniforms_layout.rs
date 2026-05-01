//! AUTO-GENERATED — do not edit by hand.
//! Source: packages/renderer/uniforms-schema.json
//! Regenerate: npx tsx packages/renderer/scripts/generate-rust-uniforms.mts

/// Total std140 uniform buffer size in bytes (matches uniforms.rs UBO_SIZE).
pub const UBO_SIZE: usize = 656;

/// Schema-declared offset of every uniform, by GLSL name.
/// Use `OFFSETS::U_TIME` etc — naming follows SCREAMING_SNAKE convention.
pub mod offsets {
    pub const U_TIME: usize = 0;
    pub const U_DYNAMIC_TIME: usize = 4;
    pub const U_BEAT_TIME: usize = 8;
    pub const U_BASS: usize = 12;
    pub const U_RMS: usize = 16;
    pub const U_CENTROID: usize = 20;
    pub const U_HIGHS: usize = 24;
    pub const U_ONSET: usize = 28;
    pub const U_BEAT: usize = 32;
    pub const U_MIDS: usize = 36;
    pub const U_ENERGY: usize = 40;
    pub const U_FLATNESS: usize = 44;
    pub const U_SLOW_ENERGY: usize = 48;
    pub const U_FAST_ENERGY: usize = 52;
    pub const U_FAST_BASS: usize = 56;
    pub const U_SPECTRAL_FLUX: usize = 60;
    pub const U_ENERGY_ACCEL: usize = 64;
    pub const U_ENERGY_TREND: usize = 68;
    pub const U_LOCAL_TEMPO: usize = 72;
    pub const U_TEMPO: usize = 76;
    pub const U_ONSET_SNAP: usize = 80;
    pub const U_BEAT_SNAP: usize = 84;
    pub const U_MUSICAL_TIME: usize = 88;
    pub const U_SNAP_TO_MUSICAL_TIME: usize = 92;
    pub const U_DRUM_ONSET: usize = 96;
    pub const U_DRUM_BEAT: usize = 100;
    pub const U_STEM_BASS: usize = 104;
    pub const U_STEM_DRUMS: usize = 108;
    pub const U_STEM_DRUM_ONSET: usize = 112;
    pub const U_VOCAL_ENERGY: usize = 116;
    pub const U_VOCAL_PRESENCE: usize = 120;
    pub const U_STEM_VOCAL_RMS: usize = 124;
    pub const U_OTHER_ENERGY: usize = 128;
    pub const U_OTHER_CENTROID: usize = 132;
    pub const U_CHROMA_HUE: usize = 136;
    pub const U_CHROMA_SHIFT: usize = 140;
    pub const U_AFTERGLOW_HUE: usize = 144;
    pub const U_CONTRAST0: usize = 160;
    pub const U_CONTRAST1: usize = 176;
    pub const U_CHROMA0: usize = 192;
    pub const U_CHROMA1: usize = 208;
    pub const U_CHROMA2: usize = 224;
    pub const U_SECTION_PROGRESS: usize = 240;
    pub const U_SECTION_INDEX: usize = 244;
    pub const U_CLIMAX_PHASE: usize = 248;
    pub const U_CLIMAX_INTENSITY: usize = 252;
    pub const U_COHERENCE: usize = 256;
    pub const U_JAM_DENSITY: usize = 260;
    pub const U_SONG_PROGRESS: usize = 264;
    pub const U_SHADER_HOLD_PROGRESS: usize = 268;
    pub const U_JAM_PHASE: usize = 272;
    pub const U_JAM_PROGRESS: usize = 276;
    pub const U_PALETTE_PRIMARY: usize = 280;
    pub const U_PALETTE_SECONDARY: usize = 284;
    pub const U_PALETTE_SATURATION: usize = 288;
    pub const U_ERA_SATURATION: usize = 292;
    pub const U_ERA_BRIGHTNESS: usize = 296;
    pub const U_ERA_SEPIA: usize = 300;
    pub const U_BLOOM_THRESHOLD: usize = 304;
    pub const U_LENS_DISTORTION: usize = 308;
    pub const U_GRADING_INTENSITY: usize = 312;
    pub const U_MELODIC_PITCH: usize = 316;
    pub const U_MELODIC_DIRECTION: usize = 320;
    pub const U_CHORD_INDEX: usize = 324;
    pub const U_HARMONIC_TENSION: usize = 328;
    pub const U_CHORD_CONFIDENCE: usize = 332;
    pub const U_SECTION_TYPE: usize = 336;
    pub const U_ENERGY_FORECAST: usize = 340;
    pub const U_PEAK_APPROACHING: usize = 344;
    pub const U_BEAT_STABILITY: usize = 348;
    pub const U_DOWNBEAT: usize = 352;
    pub const U_BEAT_CONFIDENCE: usize = 356;
    pub const U_MELODIC_CONFIDENCE: usize = 360;
    pub const U_IMPROVISATION_SCORE: usize = 364;
    pub const U_PEAK_OF_SHOW: usize = 368;
    pub const U_HERO_ICON_TRIGGER: usize = 372;
    pub const U_HERO_ICON_PROGRESS: usize = 376;
    pub const U_SHOW_WARMTH: usize = 380;
    pub const U_SHOW_CONTRAST: usize = 384;
    pub const U_SHOW_SATURATION: usize = 388;
    pub const U_SHOW_GRAIN: usize = 392;
    pub const U_SHOW_BLOOM: usize = 396;
    pub const U_VENUE_VIGNETTE: usize = 400;
    pub const U_CAM_FOV: usize = 444;
    pub const U_CAM_DOF: usize = 448;
    pub const U_CAM_FOCUS_DIST: usize = 452;
    pub const U_ENVELOPE_BRIGHTNESS: usize = 456;
    pub const U_ENVELOPE_SATURATION: usize = 460;
    pub const U_ENVELOPE_HUE: usize = 464;
    pub const U_TEMPO_DERIVATIVE: usize = 468;
    pub const U_DYNAMIC_RANGE: usize = 472;
    pub const U_SPACE_SCORE: usize = 476;
    pub const U_TIMBRAL_BRIGHTNESS: usize = 480;
    pub const U_TIMBRAL_FLUX: usize = 484;
    pub const U_VOCAL_PITCH: usize = 488;
    pub const U_PHIL_BOMB_WAVE: usize = 492;
    pub const U_SEMANTIC_PSYCHEDELIC: usize = 496;
    pub const U_SEMANTIC_COSMIC: usize = 500;
    pub const U_SEMANTIC_CHAOTIC: usize = 504;
    pub const U_SEMANTIC_AGGRESSIVE: usize = 508;
    pub const U_SEMANTIC_TENDER: usize = 512;
    pub const U_SEMANTIC_AMBIENT: usize = 516;
    pub const U_SEMANTIC_RHYTHMIC: usize = 520;
    pub const U_SEMANTIC_TRIUMPHANT: usize = 524;
    pub const U_PARAM_BASS_SCALE: usize = 528;
    pub const U_PARAM_ENERGY_SCALE: usize = 532;
    pub const U_PARAM_MOTION_SPEED: usize = 536;
    pub const U_PARAM_COLOR_SAT_BIAS: usize = 540;
    pub const U_PARAM_COMPLEXITY: usize = 544;
    pub const U_PARAM_DRUM_REACTIVITY: usize = 548;
    pub const U_PARAM_VOCAL_WEIGHT: usize = 552;
    pub const U_TEMPORAL_BLEND_STRENGTH: usize = 608;
    pub const U_SHOW_GRAIN_CHARACTER: usize = 612;
    pub const U_SHOW_BLOOM_CHARACTER: usize = 616;
    pub const U_SHOW_TEMPERATURE_CHARACTER: usize = 620;
    pub const U_SHOW_CONTRAST_CHARACTER: usize = 624;
}

/// Per-uniform metadata for runtime introspection.
#[derive(Debug, Clone, Copy)]
pub struct UniformField {
    pub name: &'static str,
    pub offset: usize,
    pub size: usize,
    pub kind: UniformKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UniformKind { Float, Vec2, Vec3, Vec4 }

pub const FIELDS: &[UniformField] = &[
    UniformField { name: "uTime", offset: 0, size: 4, kind: UniformKind::Float },
    UniformField { name: "uDynamicTime", offset: 4, size: 4, kind: UniformKind::Float },
    UniformField { name: "uBeatTime", offset: 8, size: 4, kind: UniformKind::Float },
    UniformField { name: "uBass", offset: 12, size: 4, kind: UniformKind::Float },
    UniformField { name: "uRms", offset: 16, size: 4, kind: UniformKind::Float },
    UniformField { name: "uCentroid", offset: 20, size: 4, kind: UniformKind::Float },
    UniformField { name: "uHighs", offset: 24, size: 4, kind: UniformKind::Float },
    UniformField { name: "uOnset", offset: 28, size: 4, kind: UniformKind::Float },
    UniformField { name: "uBeat", offset: 32, size: 4, kind: UniformKind::Float },
    UniformField { name: "uMids", offset: 36, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEnergy", offset: 40, size: 4, kind: UniformKind::Float },
    UniformField { name: "uFlatness", offset: 44, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSlowEnergy", offset: 48, size: 4, kind: UniformKind::Float },
    UniformField { name: "uFastEnergy", offset: 52, size: 4, kind: UniformKind::Float },
    UniformField { name: "uFastBass", offset: 56, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSpectralFlux", offset: 60, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEnergyAccel", offset: 64, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEnergyTrend", offset: 68, size: 4, kind: UniformKind::Float },
    UniformField { name: "uLocalTempo", offset: 72, size: 4, kind: UniformKind::Float },
    UniformField { name: "uTempo", offset: 76, size: 4, kind: UniformKind::Float },
    UniformField { name: "uOnsetSnap", offset: 80, size: 4, kind: UniformKind::Float },
    UniformField { name: "uBeatSnap", offset: 84, size: 4, kind: UniformKind::Float },
    UniformField { name: "uMusicalTime", offset: 88, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSnapToMusicalTime", offset: 92, size: 4, kind: UniformKind::Float },
    UniformField { name: "uDrumOnset", offset: 96, size: 4, kind: UniformKind::Float },
    UniformField { name: "uDrumBeat", offset: 100, size: 4, kind: UniformKind::Float },
    UniformField { name: "uStemBass", offset: 104, size: 4, kind: UniformKind::Float },
    UniformField { name: "uStemDrums", offset: 108, size: 4, kind: UniformKind::Float },
    UniformField { name: "uStemDrumOnset", offset: 112, size: 4, kind: UniformKind::Float },
    UniformField { name: "uVocalEnergy", offset: 116, size: 4, kind: UniformKind::Float },
    UniformField { name: "uVocalPresence", offset: 120, size: 4, kind: UniformKind::Float },
    UniformField { name: "uStemVocalRms", offset: 124, size: 4, kind: UniformKind::Float },
    UniformField { name: "uOtherEnergy", offset: 128, size: 4, kind: UniformKind::Float },
    UniformField { name: "uOtherCentroid", offset: 132, size: 4, kind: UniformKind::Float },
    UniformField { name: "uChromaHue", offset: 136, size: 4, kind: UniformKind::Float },
    UniformField { name: "uChromaShift", offset: 140, size: 4, kind: UniformKind::Float },
    UniformField { name: "uAfterglowHue", offset: 144, size: 4, kind: UniformKind::Float },
    UniformField { name: "uContrast0", offset: 160, size: 16, kind: UniformKind::Vec4 },
    UniformField { name: "uContrast1", offset: 176, size: 16, kind: UniformKind::Vec4 },
    UniformField { name: "uChroma0", offset: 192, size: 16, kind: UniformKind::Vec4 },
    UniformField { name: "uChroma1", offset: 208, size: 16, kind: UniformKind::Vec4 },
    UniformField { name: "uChroma2", offset: 224, size: 16, kind: UniformKind::Vec4 },
    UniformField { name: "uSectionProgress", offset: 240, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSectionIndex", offset: 244, size: 4, kind: UniformKind::Float },
    UniformField { name: "uClimaxPhase", offset: 248, size: 4, kind: UniformKind::Float },
    UniformField { name: "uClimaxIntensity", offset: 252, size: 4, kind: UniformKind::Float },
    UniformField { name: "uCoherence", offset: 256, size: 4, kind: UniformKind::Float },
    UniformField { name: "uJamDensity", offset: 260, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSongProgress", offset: 264, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShaderHoldProgress", offset: 268, size: 4, kind: UniformKind::Float },
    UniformField { name: "uJamPhase", offset: 272, size: 4, kind: UniformKind::Float },
    UniformField { name: "uJamProgress", offset: 276, size: 4, kind: UniformKind::Float },
    UniformField { name: "uPalettePrimary", offset: 280, size: 4, kind: UniformKind::Float },
    UniformField { name: "uPaletteSecondary", offset: 284, size: 4, kind: UniformKind::Float },
    UniformField { name: "uPaletteSaturation", offset: 288, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEraSaturation", offset: 292, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEraBrightness", offset: 296, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEraSepia", offset: 300, size: 4, kind: UniformKind::Float },
    UniformField { name: "uBloomThreshold", offset: 304, size: 4, kind: UniformKind::Float },
    UniformField { name: "uLensDistortion", offset: 308, size: 4, kind: UniformKind::Float },
    UniformField { name: "uGradingIntensity", offset: 312, size: 4, kind: UniformKind::Float },
    UniformField { name: "uMelodicPitch", offset: 316, size: 4, kind: UniformKind::Float },
    UniformField { name: "uMelodicDirection", offset: 320, size: 4, kind: UniformKind::Float },
    UniformField { name: "uChordIndex", offset: 324, size: 4, kind: UniformKind::Float },
    UniformField { name: "uHarmonicTension", offset: 328, size: 4, kind: UniformKind::Float },
    UniformField { name: "uChordConfidence", offset: 332, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSectionType", offset: 336, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEnergyForecast", offset: 340, size: 4, kind: UniformKind::Float },
    UniformField { name: "uPeakApproaching", offset: 344, size: 4, kind: UniformKind::Float },
    UniformField { name: "uBeatStability", offset: 348, size: 4, kind: UniformKind::Float },
    UniformField { name: "uDownbeat", offset: 352, size: 4, kind: UniformKind::Float },
    UniformField { name: "uBeatConfidence", offset: 356, size: 4, kind: UniformKind::Float },
    UniformField { name: "uMelodicConfidence", offset: 360, size: 4, kind: UniformKind::Float },
    UniformField { name: "uImprovisationScore", offset: 364, size: 4, kind: UniformKind::Float },
    UniformField { name: "uPeakOfShow", offset: 368, size: 4, kind: UniformKind::Float },
    UniformField { name: "uHeroIconTrigger", offset: 372, size: 4, kind: UniformKind::Float },
    UniformField { name: "uHeroIconProgress", offset: 376, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowWarmth", offset: 380, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowContrast", offset: 384, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowSaturation", offset: 388, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowGrain", offset: 392, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowBloom", offset: 396, size: 4, kind: UniformKind::Float },
    UniformField { name: "uVenueVignette", offset: 400, size: 4, kind: UniformKind::Float },
    UniformField { name: "uCamFov", offset: 444, size: 4, kind: UniformKind::Float },
    UniformField { name: "uCamDof", offset: 448, size: 4, kind: UniformKind::Float },
    UniformField { name: "uCamFocusDist", offset: 452, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEnvelopeBrightness", offset: 456, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEnvelopeSaturation", offset: 460, size: 4, kind: UniformKind::Float },
    UniformField { name: "uEnvelopeHue", offset: 464, size: 4, kind: UniformKind::Float },
    UniformField { name: "uTempoDerivative", offset: 468, size: 4, kind: UniformKind::Float },
    UniformField { name: "uDynamicRange", offset: 472, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSpaceScore", offset: 476, size: 4, kind: UniformKind::Float },
    UniformField { name: "uTimbralBrightness", offset: 480, size: 4, kind: UniformKind::Float },
    UniformField { name: "uTimbralFlux", offset: 484, size: 4, kind: UniformKind::Float },
    UniformField { name: "uVocalPitch", offset: 488, size: 4, kind: UniformKind::Float },
    UniformField { name: "uPhilBombWave", offset: 492, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSemanticPsychedelic", offset: 496, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSemanticCosmic", offset: 500, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSemanticChaotic", offset: 504, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSemanticAggressive", offset: 508, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSemanticTender", offset: 512, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSemanticAmbient", offset: 516, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSemanticRhythmic", offset: 520, size: 4, kind: UniformKind::Float },
    UniformField { name: "uSemanticTriumphant", offset: 524, size: 4, kind: UniformKind::Float },
    UniformField { name: "uParamBassScale", offset: 528, size: 4, kind: UniformKind::Float },
    UniformField { name: "uParamEnergyScale", offset: 532, size: 4, kind: UniformKind::Float },
    UniformField { name: "uParamMotionSpeed", offset: 536, size: 4, kind: UniformKind::Float },
    UniformField { name: "uParamColorSatBias", offset: 540, size: 4, kind: UniformKind::Float },
    UniformField { name: "uParamComplexity", offset: 544, size: 4, kind: UniformKind::Float },
    UniformField { name: "uParamDrumReactivity", offset: 548, size: 4, kind: UniformKind::Float },
    UniformField { name: "uParamVocalWeight", offset: 552, size: 4, kind: UniformKind::Float },
    UniformField { name: "uTemporalBlendStrength", offset: 608, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowGrainCharacter", offset: 612, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowBloomCharacter", offset: 616, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowTemperatureCharacter", offset: 620, size: 4, kind: UniformKind::Float },
    UniformField { name: "uShowContrastCharacter", offset: 624, size: 4, kind: UniformKind::Float },
];

/// Pack the schema-declared simple field copies into the std140 buffer.
/// Auto-generated from schema entries whose rust_source is `frame.X` or
/// `frame.X.unwrap_or(default)`. Computed uniforms (camera, lighting,
/// derived formulas) are still owned by `crate::uniforms::build_uniform_buffer`.
/// Returns the count of fields written for diagnostics.
pub fn pack_simple_uniforms(frame: &crate::manifest::FrameData, buf: &mut [u8]) -> usize {
    use crate::manifest::FrameData;
    let _ = std::any::type_name::<FrameData>();  // ensure import survives unused-warning lints
    fn w(buf: &mut [u8], offset: usize, val: f32) {
        buf[offset..offset + 4].copy_from_slice(&val.to_le_bytes());
    }
    let mut written = 0usize;
    w(buf, 0, frame.time); written += 1;
    w(buf, 4, frame.dynamic_time); written += 1;
    w(buf, 8, frame.beat_time); written += 1;
    w(buf, 12, frame.bass); written += 1;
    w(buf, 16, frame.rms); written += 1;
    w(buf, 20, frame.centroid); written += 1;
    w(buf, 24, frame.highs); written += 1;
    w(buf, 28, frame.onset); written += 1;
    w(buf, 32, frame.beat); written += 1;
    w(buf, 36, frame.mids); written += 1;
    w(buf, 40, frame.energy); written += 1;
    w(buf, 48, frame.slow_energy); written += 1;
    w(buf, 52, frame.fast_energy); written += 1;
    w(buf, 56, frame.fast_bass); written += 1;
    w(buf, 60, frame.spectral_flux); written += 1;
    w(buf, 64, frame.energy_accel); written += 1;
    w(buf, 68, frame.energy_trend); written += 1;
    w(buf, 72, frame.tempo); written += 1;
    w(buf, 76, frame.tempo); written += 1;
    w(buf, 80, frame.onset_snap); written += 1;
    w(buf, 84, frame.beat_snap); written += 1;
    w(buf, 88, frame.musical_time); written += 1;
    w(buf, 92, frame.musical_time); written += 1;
    w(buf, 96, frame.drum_onset); written += 1;
    w(buf, 100, frame.drum_beat); written += 1;
    w(buf, 104, frame.stem_bass); written += 1;
    w(buf, 108, frame.stem_drums); written += 1;
    w(buf, 112, frame.drum_onset); written += 1;
    w(buf, 116, frame.vocal_energy); written += 1;
    w(buf, 120, frame.vocal_presence); written += 1;
    w(buf, 124, frame.vocal_energy); written += 1;
    w(buf, 128, frame.other_energy); written += 1;
    w(buf, 132, frame.other_centroid); written += 1;
    w(buf, 136, frame.chroma_hue); written += 1;
    w(buf, 140, frame.chroma_shift); written += 1;
    w(buf, 240, frame.section_progress); written += 1;
    w(buf, 244, frame.section_index); written += 1;
    w(buf, 248, frame.climax_phase); written += 1;
    w(buf, 252, frame.climax_intensity); written += 1;
    w(buf, 256, frame.coherence); written += 1;
    w(buf, 260, frame.jam_density); written += 1;
    w(buf, 264, frame.song_progress.unwrap_or(0.0)); written += 1;
    w(buf, 268, frame.shader_hold_progress.unwrap_or(0.0)); written += 1;
    w(buf, 272, frame.jam_phase); written += 1;
    w(buf, 276, frame.jam_progress); written += 1;
    w(buf, 280, frame.palette_primary); written += 1;
    w(buf, 284, frame.palette_secondary); written += 1;
    w(buf, 288, frame.palette_saturation); written += 1;
    w(buf, 292, frame.era_saturation); written += 1;
    w(buf, 296, frame.era_brightness); written += 1;
    w(buf, 300, frame.era_sepia); written += 1;
    w(buf, 316, frame.melodic_pitch); written += 1;
    w(buf, 320, frame.melodic_direction); written += 1;
    w(buf, 324, frame.chord_index); written += 1;
    w(buf, 328, frame.harmonic_tension); written += 1;
    w(buf, 332, frame.chord_confidence); written += 1;
    w(buf, 336, frame.section_type); written += 1;
    w(buf, 340, frame.energy_forecast); written += 1;
    w(buf, 344, frame.peak_approaching); written += 1;
    w(buf, 348, frame.beat_stability); written += 1;
    w(buf, 352, frame.downbeat); written += 1;
    w(buf, 356, frame.beat_confidence); written += 1;
    w(buf, 360, frame.melodic_confidence); written += 1;
    w(buf, 364, frame.improvisation_score); written += 1;
    w(buf, 368, frame.peak_of_show); written += 1;
    w(buf, 380, frame.show_warmth); written += 1;
    w(buf, 384, frame.show_contrast); written += 1;
    w(buf, 388, frame.show_saturation); written += 1;
    w(buf, 392, frame.show_grain); written += 1;
    w(buf, 396, frame.show_bloom); written += 1;
    w(buf, 456, frame.envelope_brightness); written += 1;
    w(buf, 460, frame.envelope_saturation); written += 1;
    w(buf, 464, frame.envelope_hue); written += 1;
    w(buf, 468, frame.tempo_derivative); written += 1;
    w(buf, 472, frame.dynamic_range); written += 1;
    w(buf, 476, frame.space_score); written += 1;
    w(buf, 480, frame.timbral_brightness); written += 1;
    w(buf, 484, frame.timbral_flux); written += 1;
    w(buf, 488, frame.vocal_pitch); written += 1;
    w(buf, 496, frame.semantic_psychedelic); written += 1;
    w(buf, 500, frame.semantic_cosmic); written += 1;
    w(buf, 504, frame.semantic_chaotic); written += 1;
    w(buf, 508, frame.semantic_aggressive); written += 1;
    w(buf, 512, frame.semantic_tender); written += 1;
    w(buf, 516, frame.semantic_ambient); written += 1;
    w(buf, 520, frame.semantic_rhythmic); written += 1;
    w(buf, 524, frame.semantic_triumphant); written += 1;
    w(buf, 528, frame.param_bass_scale); written += 1;
    w(buf, 532, frame.param_energy_scale); written += 1;
    w(buf, 536, frame.param_motion_speed); written += 1;
    w(buf, 540, frame.param_color_sat_bias); written += 1;
    w(buf, 544, frame.param_complexity); written += 1;
    w(buf, 548, frame.param_drum_reactivity); written += 1;
    w(buf, 552, frame.param_vocal_weight); written += 1;
    w(buf, 612, frame.show_grain_character.unwrap_or(0.5)); written += 1;
    w(buf, 616, frame.show_bloom_character.unwrap_or(0.0)); written += 1;
    w(buf, 620, frame.show_temperature_character.unwrap_or(0.0)); written += 1;
    w(buf, 624, frame.show_contrast_character.unwrap_or(0.5)); written += 1;
    written
}
