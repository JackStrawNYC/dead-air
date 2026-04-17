//! Uniform buffer construction — packs FrameData into the exact byte layout
//! that naga generates from the sharedUniformsGLSL declarations (std140).
//!
//! Layout is 656 bytes (padded). Offsets determined by std140 rules:
//!   float = 4B aligned, 4B size
//!   vec2  = 8B aligned, 8B size
//!   vec3  = 16B aligned, 12B data (+4 pad unless a float follows)
//!   vec4  = 16B aligned, 16B size
//!
//! The GLSL declaration order in uniforms.glsl.ts is the SOLE source of truth.

use crate::manifest::FrameData;

/// Total uniform buffer size in bytes.
/// 125 uniforms, last is uCamOffset (vec2) at offset 640, size 8 → 648.
/// Padded to 16-byte alignment → 656.
const UBO_SIZE: usize = 656;

/// Write a f32 at a specific byte offset in the buffer.
fn write_f32(buf: &mut [u8], offset: usize, val: f32) {
    let bytes = val.to_le_bytes();
    buf[offset..offset + 4].copy_from_slice(&bytes);
}

/// Build the uniform buffer for a single frame.
/// Offsets match the GLSL uniform declaration order exactly (std140 layout).
pub fn build_uniform_buffer(frame: &FrameData, width: u32, height: u32) -> Vec<u8> {
    // Pad to 16-byte alignment (wgpu requirement for uniform buffers)
    let padded_size = (UBO_SIZE + 15) & !15;
    let mut buf = vec![0u8; padded_size];

    // ─── Time ─── (offsets 0-8)
    write_f32(&mut buf, 0, frame.time);           // uTime
    write_f32(&mut buf, 4, frame.dynamic_time);   // uDynamicTime
    write_f32(&mut buf, 8, frame.beat_time);       // uBeatTime

    // ─── Core Audio Features ─── (offsets 12-44)
    write_f32(&mut buf, 12, frame.bass);           // uBass
    write_f32(&mut buf, 16, frame.rms);            // uRms
    write_f32(&mut buf, 20, frame.centroid);       // uCentroid
    write_f32(&mut buf, 24, frame.highs);          // uHighs
    write_f32(&mut buf, 28, frame.onset);          // uOnset
    write_f32(&mut buf, 32, frame.beat);           // uBeat
    write_f32(&mut buf, 36, frame.mids);           // uMids
    write_f32(&mut buf, 40, frame.energy);         // uEnergy
    write_f32(&mut buf, 44, 0.0);                  // uFlatness

    // ─── Smoothed / Derived Audio ─── (offsets 48-76)
    write_f32(&mut buf, 48, frame.slow_energy);    // uSlowEnergy
    write_f32(&mut buf, 52, frame.fast_energy);    // uFastEnergy
    write_f32(&mut buf, 56, frame.fast_bass);      // uFastBass
    write_f32(&mut buf, 60, frame.spectral_flux);  // uSpectralFlux
    write_f32(&mut buf, 64, frame.energy_accel);   // uEnergyAccel
    write_f32(&mut buf, 68, frame.energy_trend);   // uEnergyTrend
    write_f32(&mut buf, 72, 0.0);                  // uLocalTempo
    write_f32(&mut buf, 76, frame.tempo);          // uTempo

    // ─── Beat / Rhythm ─── (offsets 80-92)
    write_f32(&mut buf, 80, frame.onset_snap);     // uOnsetSnap
    write_f32(&mut buf, 84, frame.beat_snap);      // uBeatSnap
    write_f32(&mut buf, 88, frame.musical_time);   // uMusicalTime
    write_f32(&mut buf, 92, 0.0);                  // uSnapToMusicalTime

    // ─── Drum Stem ─── (offsets 96-124)
    write_f32(&mut buf, 96, frame.drum_onset);     // uDrumOnset
    write_f32(&mut buf, 100, frame.drum_beat);     // uDrumBeat
    write_f32(&mut buf, 104, frame.stem_bass);     // uStemBass
    write_f32(&mut buf, 108, frame.stem_drums);    // uStemDrums
    write_f32(&mut buf, 112, frame.drum_onset);    // uStemDrumOnset
    write_f32(&mut buf, 116, frame.vocal_energy);  // uVocalEnergy
    write_f32(&mut buf, 120, frame.vocal_presence);// uVocalPresence
    write_f32(&mut buf, 124, 0.0);                 // uStemVocalRms

    // ─── Vocal / Other Stem ─── (offsets 128-132)
    write_f32(&mut buf, 128, frame.other_energy);  // uOtherEnergy
    write_f32(&mut buf, 132, frame.other_centroid);// uOtherCentroid

    // ─── Chroma / Spectral ─── (offsets 136-236)
    write_f32(&mut buf, 136, frame.chroma_hue);    // uChromaHue
    write_f32(&mut buf, 140, frame.chroma_shift);  // uChromaShift
    write_f32(&mut buf, 144, 0.0);                 // uAfterglowHue
    // padding 148-159 (align vec4 to 16)

    // uContrast0 at 160 (vec4): spectral contrast bands 0-3
    if let Some(ref contrast) = frame.contrast {
        for (i, &v) in contrast.iter().take(4).enumerate() {
            write_f32(&mut buf, 160 + i * 4, v);
        }
        // uContrast1 at 176 (vec4): spectral contrast bands 4-6
        for (i, &v) in contrast.iter().skip(4).take(3).enumerate() {
            write_f32(&mut buf, 176 + i * 4, v);
        }
    } else {
        // Synthesize from audio features
        write_f32(&mut buf, 160, frame.bass);
        write_f32(&mut buf, 164, frame.stem_bass);
        write_f32(&mut buf, 168, frame.mids);
        write_f32(&mut buf, 172, frame.energy);
        write_f32(&mut buf, 176, frame.highs);
        write_f32(&mut buf, 180, frame.timbral_brightness);
        write_f32(&mut buf, 184, frame.spectral_flux);
    }
    // uChroma0-2 at 192/208/224 (vec4 each): 12-band chroma
    let hue = frame.chroma_hue;
    let hue_bin = ((hue / 360.0) * 12.0) as usize;
    for i in 0..12 {
        let offset = 192 + i * 4;
        let val = if i == hue_bin % 12 { 1.0 } else { 0.1 };
        write_f32(&mut buf, offset, val);
    }
    // (uFFTTexture is sampler2D — separate binding, not in UBO)

    // ─── Section / Structure ─── (offsets 240-268)
    write_f32(&mut buf, 240, frame.section_progress); // uSectionProgress
    write_f32(&mut buf, 244, frame.section_index);    // uSectionIndex
    write_f32(&mut buf, 248, frame.climax_phase);     // uClimaxPhase
    write_f32(&mut buf, 252, frame.climax_intensity); // uClimaxIntensity
    write_f32(&mut buf, 256, frame.coherence);          // uCoherence
    write_f32(&mut buf, 260, frame.jam_density);      // uJamDensity
    write_f32(&mut buf, 264, frame.song_progress.unwrap_or(0.0));        // uSongProgress
    write_f32(&mut buf, 268, frame.shader_hold_progress.unwrap_or(0.0)); // uShaderHoldProgress

    // ─── Jam Evolution ─── (offsets 272-276)
    write_f32(&mut buf, 272, frame.jam_phase);        // uJamPhase
    write_f32(&mut buf, 276, frame.jam_progress);     // uJamProgress

    // ─── Palette / Color ─── (offsets 280-288)
    write_f32(&mut buf, 280, frame.palette_primary);   // uPalettePrimary
    write_f32(&mut buf, 284, frame.palette_secondary); // uPaletteSecondary
    write_f32(&mut buf, 288, frame.palette_saturation);// uPaletteSaturation

    // ─── Era ─── (offsets 292-300)
    write_f32(&mut buf, 292, frame.era_saturation);   // uEraSaturation
    write_f32(&mut buf, 296, frame.era_brightness);   // uEraBrightness
    write_f32(&mut buf, 300, frame.era_sepia);        // uEraSepia

    // ─── Post-Process Control ─── (offsets 304-312)
    // Formula from JS: -0.08 - energy * 0.18 (shifts the GLSL threshold calculation)
    write_f32(&mut buf, 304, -0.08 - frame.energy * 0.18); // uBloomThreshold
    // Formula from JS: 0.02 + energy * 0.06
    write_f32(&mut buf, 308, 0.02 + frame.energy * 0.06);  // uLensDistortion
    write_f32(&mut buf, 312, 1.0);                          // uGradingIntensity

    // ─── Melodic / Harmonic ─── (offsets 316-364)
    write_f32(&mut buf, 316, frame.melodic_pitch);     // uMelodicPitch
    write_f32(&mut buf, 320, frame.melodic_direction); // uMelodicDirection
    write_f32(&mut buf, 324, frame.chord_index);       // uChordIndex
    write_f32(&mut buf, 328, frame.harmonic_tension);  // uHarmonicTension
    write_f32(&mut buf, 332, frame.chord_confidence);  // uChordConfidence
    write_f32(&mut buf, 336, frame.section_type);      // uSectionType
    write_f32(&mut buf, 340, frame.energy_forecast);   // uEnergyForecast
    write_f32(&mut buf, 344, frame.peak_approaching);  // uPeakApproaching
    write_f32(&mut buf, 348, frame.beat_stability);    // uBeatStability
    write_f32(&mut buf, 352, frame.downbeat);          // uDownbeat
    write_f32(&mut buf, 356, frame.beat_confidence);   // uBeatConfidence
    write_f32(&mut buf, 360, frame.melodic_confidence);// uMelodicConfidence
    write_f32(&mut buf, 364, frame.improvisation_score);// uImprovisationScore

    // ─── Peak-of-Show ─── (offset 368)
    write_f32(&mut buf, 368, frame.peak_of_show);      // uPeakOfShow

    // ─── Hero Icon ─── (offsets 372-376)
    write_f32(&mut buf, 372, 0.0);                    // uHeroIconTrigger
    write_f32(&mut buf, 376, 0.0);                    // uHeroIconProgress

    // ─── Show Film Stock ─── (offsets 380-396)
    write_f32(&mut buf, 380, frame.show_warmth);      // uShowWarmth
    write_f32(&mut buf, 384, frame.show_contrast);    // uShowContrast
    write_f32(&mut buf, 388, frame.show_saturation);  // uShowSaturation
    write_f32(&mut buf, 392, frame.show_grain);       // uShowGrain
    write_f32(&mut buf, 396, frame.show_bloom);       // uShowBloom

    // ─── Venue Profile ─── (offset 400)
    write_f32(&mut buf, 400, 0.2);                     // uVenueVignette
    // padding 404-415 (align vec3 uCamPos to 16)

    // ─── 3D Camera ─── (offsets 416-452)
    write_f32(&mut buf, 416, 0.0);  // uCamPos.x
    write_f32(&mut buf, 420, 0.0);  // uCamPos.y
    write_f32(&mut buf, 424, 0.0);  // uCamPos.z
    // padding at 428-431 (uCamTarget needs 16-byte alignment)
    write_f32(&mut buf, 432, 0.0);  // uCamTarget.x
    write_f32(&mut buf, 436, 0.0);  // uCamTarget.y
    write_f32(&mut buf, 440, 0.0);  // uCamTarget.z
    write_f32(&mut buf, 444, 60.0); // uCamFov (packs into uCamTarget padding)
    write_f32(&mut buf, 448, 0.0);  // uCamDof
    write_f32(&mut buf, 452, 5.0);  // uCamFocusDist

    // ─── Envelope ─── (offsets 456-464)
    write_f32(&mut buf, 456, frame.envelope_brightness); // uEnvelopeBrightness
    write_f32(&mut buf, 460, frame.envelope_saturation); // uEnvelopeSaturation
    write_f32(&mut buf, 464, frame.envelope_hue);        // uEnvelopeHue

    // ─── Deep Audio (Level 2) ─── (offsets 468-488)
    write_f32(&mut buf, 468, frame.tempo_derivative);     // uTempoDerivative
    write_f32(&mut buf, 472, frame.dynamic_range);        // uDynamicRange
    write_f32(&mut buf, 476, frame.space_score);          // uSpaceScore
    write_f32(&mut buf, 480, frame.timbral_brightness);   // uTimbralBrightness
    write_f32(&mut buf, 484, frame.timbral_flux);         // uTimbralFlux
    write_f32(&mut buf, 488, frame.vocal_pitch);          // uVocalPitch

    // ─── Effects ─── (offset 492)
    write_f32(&mut buf, 492, 0.0);                        // uPhilBombWave

    // ─── Semantic Labels (CLAP) ─── (offsets 496-524)
    write_f32(&mut buf, 496, frame.semantic_psychedelic);  // uSemanticPsychedelic
    write_f32(&mut buf, 500, frame.semantic_cosmic);       // uSemanticCosmic
    write_f32(&mut buf, 504, frame.semantic_chaotic);      // uSemanticChaotic
    write_f32(&mut buf, 508, frame.semantic_aggressive);   // uSemanticAggressive
    write_f32(&mut buf, 512, frame.semantic_tender);       // uSemanticTender
    write_f32(&mut buf, 516, frame.semantic_ambient);      // uSemanticAmbient
    write_f32(&mut buf, 520, frame.semantic_rhythmic);     // uSemanticRhythmic
    write_f32(&mut buf, 524, frame.semantic_triumphant);   // uSemanticTriumphant

    // ─── Per-Song Shader Parameter Modulation ─── (offsets 528-552)
    write_f32(&mut buf, 528, frame.param_bass_scale);      // uParamBassScale
    write_f32(&mut buf, 532, frame.param_energy_scale);    // uParamEnergyScale
    write_f32(&mut buf, 536, frame.param_motion_speed);    // uParamMotionSpeed
    write_f32(&mut buf, 540, frame.param_color_sat_bias);  // uParamColorSatBias
    write_f32(&mut buf, 544, frame.param_complexity);      // uParamComplexity
    write_f32(&mut buf, 548, frame.param_drum_reactivity); // uParamDrumReactivity
    write_f32(&mut buf, 552, frame.param_vocal_weight);    // uParamVocalWeight
    // padding 556-559 (align vec3 uKeyLightDir to 16)

    // ─── Shared Lighting Context ─── (offsets 560-604)
    write_f32(&mut buf, 560, 0.3);  // uKeyLightDir.x
    write_f32(&mut buf, 564, 0.8);  // uKeyLightDir.y
    write_f32(&mut buf, 568, 0.5);  // uKeyLightDir.z
    // padding at 572-575 (uKeyLightColor needs 16-byte alignment)
    write_f32(&mut buf, 576, 1.0);  // uKeyLightColor.x
    write_f32(&mut buf, 580, 0.95); // uKeyLightColor.y
    write_f32(&mut buf, 584, 0.9);  // uKeyLightColor.z
    write_f32(&mut buf, 588, 1.0);  // uKeyLightIntensity (packs into uKeyLightColor padding)
    // uAmbientColor needs 16-byte alignment → 592
    write_f32(&mut buf, 592, 0.1);  // uAmbientColor.x
    write_f32(&mut buf, 596, 0.1);  // uAmbientColor.y
    write_f32(&mut buf, 600, 0.15); // uAmbientColor.z
    write_f32(&mut buf, 604, frame.show_warmth * 0.5);  // uColorTemperature (packs into uAmbientColor padding)

    // ─── Temporal Coherence ─── (offset 608)
    write_f32(&mut buf, 608, 0.0);  // uTemporalBlendStrength

    // ─── Per-Show Visual Identity ─── (offsets 612-624)
    write_f32(&mut buf, 612, frame.show_grain_character.unwrap_or(0.5));       // uShowGrainCharacter
    write_f32(&mut buf, 616, frame.show_bloom_character.unwrap_or(0.0));       // uShowBloomCharacter
    write_f32(&mut buf, 620, frame.show_temperature_character.unwrap_or(0.0)); // uShowTemperatureCharacter
    write_f32(&mut buf, 624, frame.show_contrast_character.unwrap_or(0.5));    // uShowContrastCharacter
    // padding 628-631 (align vec2 uResolution to 8)

    // ─── Spatial ─── (offsets 632-644)
    write_f32(&mut buf, 632, width as f32);  // uResolution.x
    write_f32(&mut buf, 636, height as f32); // uResolution.y
    write_f32(&mut buf, 640, 0.0);  // uCamOffset.x
    write_f32(&mut buf, 644, 0.0);  // uCamOffset.y

    // Total data: 648 bytes, padded to 656 (16-byte alignment)

    buf
}

/// Build FFT texture data from frame's audio features.
/// Produces 64 RGBA8 pixels (256 bytes) for a 64x1 texture.
/// Matches the JS engine's FullscreenQuad.tsx contrast → FFT texture pipeline.
pub fn build_fft_data(frame: &FrameData) -> [u8; 256] {
    let mut data = [0u8; 256];

    // Get 7-band contrast data (or synthesize from audio features)
    let bands: [f32; 7] = if let Some(ref contrast) = frame.contrast {
        let mut b = [0.0f32; 7];
        for (i, val) in contrast.iter().take(7).enumerate() {
            b[i] = *val;
        }
        b
    } else {
        // Synthesize from available audio features
        [
            frame.bass,
            frame.stem_bass,
            frame.mids,
            frame.energy,
            frame.highs,
            frame.other_centroid.min(1.0),
            frame.timbral_brightness,
        ]
    };

    // Pack 7 bands into 64 bins (each band fills floor(64/7) = 9 bins, last fills remainder)
    let bins_per_band = 64 / 7; // 9
    for (band_idx, &value) in bands.iter().enumerate() {
        let start = band_idx * bins_per_band;
        let end = if band_idx == 6 { 64 } else { start + bins_per_band };
        let byte_val = (value.clamp(0.0, 1.0) * 255.0) as u8;
        for bin in start..end {
            // RGBA8: store value in R channel, zero G/B, full A
            let offset = bin * 4;
            data[offset] = byte_val;     // R
            data[offset + 1] = 0;        // G
            data[offset + 2] = 0;        // B
            data[offset + 3] = 255;      // A
        }
    }

    data
}
