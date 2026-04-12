//! Uniform buffer construction — packs FrameData into the exact byte layout
//! that naga generates from the sharedUniformsGLSL declarations.
//!
//! Layout is 624 bytes with 119 members. Offsets determined by naga's
//! GLSL struct layout rules (vec3 → 16-byte aligned, vec4 → 16-byte aligned).

use crate::manifest::FrameData;

/// Total uniform buffer size in bytes (from naga struct span).
const UBO_SIZE: usize = 624;

/// Write a f32 at a specific byte offset in the buffer.
fn write_f32(buf: &mut [u8], offset: usize, val: f32) {
    let bytes = val.to_le_bytes();
    buf[offset..offset + 4].copy_from_slice(&bytes);
}

/// Build the uniform buffer for a single frame.
/// Offsets match naga's layout of the Uniforms struct exactly.
pub fn build_uniform_buffer(frame: &FrameData, width: u32, height: u32) -> Vec<u8> {
    // Pad to 16-byte alignment (wgpu requirement for uniform buffers)
    let padded_size = (UBO_SIZE + 15) & !15;
    let mut buf = vec![0u8; padded_size];

    // Time
    write_f32(&mut buf, 0, frame.time);           // uTime
    write_f32(&mut buf, 4, frame.dynamic_time);   // uDynamicTime
    write_f32(&mut buf, 8, frame.beat_time);       // uBeatTime

    // Core audio
    write_f32(&mut buf, 12, frame.bass);           // uBass
    write_f32(&mut buf, 16, frame.rms);            // uRms
    write_f32(&mut buf, 20, frame.centroid);       // uCentroid
    write_f32(&mut buf, 24, frame.highs);          // uHighs
    write_f32(&mut buf, 28, frame.onset);          // uOnset
    write_f32(&mut buf, 32, frame.beat);           // uBeat
    write_f32(&mut buf, 36, frame.mids);           // uMids
    write_f32(&mut buf, 40, frame.energy);         // uEnergy
    write_f32(&mut buf, 44, 0.0);                  // uFlatness

    // Smoothed/derived
    write_f32(&mut buf, 48, frame.slow_energy);    // uSlowEnergy
    write_f32(&mut buf, 52, frame.fast_energy);    // uFastEnergy
    write_f32(&mut buf, 56, frame.fast_bass);      // uFastBass
    write_f32(&mut buf, 60, frame.spectral_flux);  // uSpectralFlux
    write_f32(&mut buf, 64, frame.energy_accel);   // uEnergyAccel
    write_f32(&mut buf, 68, frame.energy_trend);   // uEnergyTrend
    write_f32(&mut buf, 72, 0.0);                  // uLocalTempo
    write_f32(&mut buf, 76, frame.tempo);          // uTempo

    // Beat/rhythm
    write_f32(&mut buf, 80, frame.onset_snap);     // uOnsetSnap
    write_f32(&mut buf, 84, frame.beat_snap);      // uBeatSnap
    write_f32(&mut buf, 88, frame.musical_time);   // uMusicalTime
    write_f32(&mut buf, 92, 0.0);                  // uSnapToMusicalTime

    // Drum stem
    write_f32(&mut buf, 96, frame.drum_onset);     // uDrumOnset
    write_f32(&mut buf, 100, frame.drum_beat);     // uDrumBeat
    write_f32(&mut buf, 104, frame.stem_bass);     // uStemBass
    write_f32(&mut buf, 108, frame.stem_drums);    // uStemDrums
    write_f32(&mut buf, 112, frame.drum_onset);    // uStemDrumOnset
    write_f32(&mut buf, 116, frame.vocal_energy);  // uVocalEnergy
    write_f32(&mut buf, 120, frame.vocal_presence);// uVocalPresence
    write_f32(&mut buf, 124, 0.0);                 // uStemVocalRms

    // Other stem
    write_f32(&mut buf, 128, frame.other_energy);  // uOtherEnergy
    write_f32(&mut buf, 132, frame.other_centroid);// uOtherCentroid

    // Chroma
    write_f32(&mut buf, 136, frame.chroma_hue);    // uChromaHue
    write_f32(&mut buf, 140, frame.chroma_shift);  // uChromaShift
    write_f32(&mut buf, 144, 0.0);                 // uAfterglowHue

    // Contrast vectors (vec4 at 16-byte aligned offsets)
    // uContrast0 at 160 (vec4), uContrast1 at 176 (vec4)
    // uChroma0 at 192 (vec4), uChroma1 at 208 (vec4), uChroma2 at 224 (vec4)
    // Leave as zeros for now — FFT/chroma data can be added later

    // Section/structure
    write_f32(&mut buf, 240, frame.section_progress); // uSectionProgress
    write_f32(&mut buf, 244, frame.section_index);    // uSectionIndex
    write_f32(&mut buf, 248, frame.climax_phase);     // uClimaxPhase
    write_f32(&mut buf, 252, frame.climax_intensity); // uClimaxIntensity
    write_f32(&mut buf, 256, 0.0);                    // uCoherence
    write_f32(&mut buf, 260, frame.jam_density);      // uJamDensity
    write_f32(&mut buf, 264, frame.jam_phase);        // uJamPhase
    write_f32(&mut buf, 268, frame.jam_progress);     // uJamProgress

    // Palette
    write_f32(&mut buf, 272, frame.palette_primary);   // uPalettePrimary
    write_f32(&mut buf, 276, frame.palette_secondary); // uPaletteSecondary
    write_f32(&mut buf, 280, frame.palette_saturation);// uPaletteSaturation

    // Era
    write_f32(&mut buf, 284, frame.era_saturation);   // uEraSaturation
    write_f32(&mut buf, 288, frame.era_brightness);   // uEraBrightness
    write_f32(&mut buf, 292, frame.era_sepia);        // uEraSepia

    // Render controls
    write_f32(&mut buf, 296, 0.0);                    // uBloomThreshold
    write_f32(&mut buf, 300, 0.0);                    // uLensDistortion
    write_f32(&mut buf, 304, 1.0);                    // uGradingIntensity

    // Melodic/harmonic
    write_f32(&mut buf, 308, frame.melodic_pitch);     // uMelodicPitch
    write_f32(&mut buf, 312, frame.melodic_direction); // uMelodicDirection
    write_f32(&mut buf, 316, frame.chord_index);       // uChordIndex
    write_f32(&mut buf, 320, frame.harmonic_tension);  // uHarmonicTension
    write_f32(&mut buf, 324, frame.chord_confidence);  // uChordConfidence
    write_f32(&mut buf, 328, frame.section_type);      // uSectionType
    write_f32(&mut buf, 332, frame.energy_forecast);   // uEnergyForecast
    write_f32(&mut buf, 336, frame.peak_approaching);  // uPeakApproaching
    write_f32(&mut buf, 340, frame.beat_stability);    // uBeatStability
    write_f32(&mut buf, 344, frame.downbeat);          // uDownbeat
    write_f32(&mut buf, 348, frame.beat_confidence);   // uBeatConfidence
    write_f32(&mut buf, 352, frame.melodic_confidence);// uMelodicConfidence
    write_f32(&mut buf, 356, frame.improvisation_score);// uImprovisationScore
    write_f32(&mut buf, 360, frame.peak_of_show);      // uPeakOfShow

    // Hero
    write_f32(&mut buf, 364, 0.0);                    // uHeroIconTrigger
    write_f32(&mut buf, 368, 0.0);                    // uHeroIconProgress

    // Show-level
    write_f32(&mut buf, 372, frame.show_warmth);      // uShowWarmth
    write_f32(&mut buf, 376, frame.show_contrast);    // uShowContrast
    write_f32(&mut buf, 380, frame.show_saturation);  // uShowSaturation
    write_f32(&mut buf, 384, frame.show_grain);       // uShowGrain
    write_f32(&mut buf, 388, frame.show_bloom);       // uShowBloom
    write_f32(&mut buf, 392, 0.0);                    // uVenueVignette

    // Camera (vec3 = 12 bytes, but aligned to 16)
    write_f32(&mut buf, 400, 0.0);  // uCamPos.x
    write_f32(&mut buf, 404, 0.0);  // uCamPos.y
    write_f32(&mut buf, 408, 0.0);  // uCamPos.z
    // padding at 412

    write_f32(&mut buf, 416, 0.0);  // uCamTarget.x
    write_f32(&mut buf, 420, 0.0);  // uCamTarget.y
    write_f32(&mut buf, 424, 0.0);  // uCamTarget.z
    write_f32(&mut buf, 428, 60.0); // uCamFov
    write_f32(&mut buf, 432, 0.0);  // uCamDof
    write_f32(&mut buf, 436, 5.0);  // uCamFocusDist

    // Envelope
    write_f32(&mut buf, 440, frame.envelope_brightness); // uEnvelopeBrightness
    write_f32(&mut buf, 444, frame.envelope_saturation); // uEnvelopeSaturation
    write_f32(&mut buf, 448, frame.envelope_hue);        // uEnvelopeHue

    // Deep audio
    write_f32(&mut buf, 452, frame.tempo_derivative);     // uTempoDerivative
    write_f32(&mut buf, 456, frame.dynamic_range);        // uDynamicRange
    write_f32(&mut buf, 460, frame.space_score);          // uSpaceScore
    write_f32(&mut buf, 464, frame.timbral_brightness);   // uTimbralBrightness
    write_f32(&mut buf, 468, frame.timbral_flux);         // uTimbralFlux
    write_f32(&mut buf, 472, frame.vocal_pitch);          // uVocalPitch
    write_f32(&mut buf, 476, 0.0);                        // uPhilBombWave

    // CLAP semantic
    write_f32(&mut buf, 480, frame.semantic_psychedelic);  // uSemanticPsychedelic
    write_f32(&mut buf, 484, frame.semantic_cosmic);       // uSemanticCosmic
    write_f32(&mut buf, 488, frame.semantic_chaotic);      // uSemanticChaotic
    write_f32(&mut buf, 492, frame.semantic_aggressive);   // uSemanticAggressive
    write_f32(&mut buf, 496, frame.semantic_tender);       // uSemanticTender
    write_f32(&mut buf, 500, frame.semantic_ambient);      // uSemanticAmbient
    write_f32(&mut buf, 504, frame.semantic_rhythmic);     // uSemanticRhythmic
    write_f32(&mut buf, 508, frame.semantic_triumphant);   // uSemanticTriumphant

    // Shader params
    write_f32(&mut buf, 512, frame.param_bass_scale);      // uParamBassScale
    write_f32(&mut buf, 516, frame.param_energy_scale);    // uParamEnergyScale
    write_f32(&mut buf, 520, frame.param_motion_speed);    // uParamMotionSpeed
    write_f32(&mut buf, 524, frame.param_color_sat_bias);  // uParamColorSatBias
    write_f32(&mut buf, 528, frame.param_complexity);      // uParamComplexity
    write_f32(&mut buf, 532, frame.param_drum_reactivity); // uParamDrumReactivity
    write_f32(&mut buf, 536, frame.param_vocal_weight);    // uParamVocalWeight

    // Lighting (vec3 = 16-byte aligned)
    write_f32(&mut buf, 544, 0.3);  // uKeyLightDir.x
    write_f32(&mut buf, 548, 0.8);  // uKeyLightDir.y
    write_f32(&mut buf, 552, 0.5);  // uKeyLightDir.z

    write_f32(&mut buf, 560, 1.0);  // uKeyLightColor.x
    write_f32(&mut buf, 564, 0.95); // uKeyLightColor.y
    write_f32(&mut buf, 568, 0.9);  // uKeyLightColor.z
    write_f32(&mut buf, 572, 1.0);  // uKeyLightIntensity

    write_f32(&mut buf, 576, 0.1);  // uAmbientColor.x
    write_f32(&mut buf, 580, 0.1);  // uAmbientColor.y
    write_f32(&mut buf, 584, 0.15); // uAmbientColor.z
    write_f32(&mut buf, 588, 0.0);  // uColorTemperature

    write_f32(&mut buf, 592, 0.0);  // uTemporalBlendStrength

    // Resolution (vec2)
    write_f32(&mut buf, 600, width as f32);  // uResolution.x
    write_f32(&mut buf, 604, height as f32); // uResolution.y

    // Camera offset (vec2)
    write_f32(&mut buf, 608, 0.0);  // uCamOffset.x
    write_f32(&mut buf, 612, 0.0);  // uCamOffset.y

    buf
}
