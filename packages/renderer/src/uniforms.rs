//! Uniform buffer construction — maps FrameData fields to the GPU uniform layout.
//!
//! The GLSL shaders expect uniforms in a specific order (matching sharedUniformsGLSL).
//! This module packs FrameData into a byte buffer that the GPU reads.

use crate::manifest::FrameData;

/// Build the uniform buffer for a single frame.
/// Layout must match the order of uniforms in sharedUniformsGLSL exactly.
///
/// Each uniform is a single f32 (4 bytes). Packed contiguously.
/// vec2/vec3/vec4 uniforms are split into individual floats.
pub fn build_uniform_buffer(frame: &FrameData, width: u32, height: u32) -> Vec<u8> {
    let mut floats: Vec<f32> = Vec::with_capacity(128);

    // Time uniforms
    floats.push(frame.time);
    floats.push(frame.dynamic_time);
    floats.push(frame.beat_time);
    floats.push(frame.musical_time);
    floats.push(frame.tempo);

    // Resolution (vec2 → 2 floats)
    floats.push(width as f32);
    floats.push(height as f32);

    // Core audio
    floats.push(frame.bass);
    floats.push(frame.rms);
    floats.push(frame.centroid);
    floats.push(frame.highs);
    floats.push(frame.onset);
    floats.push(frame.beat);
    floats.push(frame.mids);
    floats.push(frame.energy);

    // Smoothed/derived
    floats.push(frame.slow_energy);
    floats.push(frame.fast_energy);
    floats.push(frame.fast_bass);
    floats.push(frame.spectral_flux);
    floats.push(frame.energy_accel);
    floats.push(frame.energy_trend);
    floats.push(0.0); // uLocalTempo placeholder

    // Beat/rhythm
    floats.push(frame.onset_snap);
    floats.push(frame.beat_snap);
    floats.push(frame.beat_confidence);
    floats.push(frame.beat_stability);
    floats.push(frame.downbeat);

    // Drum stem
    floats.push(frame.drum_onset);
    floats.push(frame.drum_beat);
    floats.push(frame.stem_bass);
    floats.push(frame.stem_drums);

    // Vocal
    floats.push(frame.vocal_energy);
    floats.push(frame.vocal_presence);

    // Other stem
    floats.push(frame.other_energy);
    floats.push(frame.other_centroid);

    // Chroma/harmonic
    floats.push(frame.chroma_hue);
    floats.push(frame.chroma_shift);
    floats.push(0.0); // uAfterglowHue placeholder
    floats.push(frame.chord_index);
    floats.push(frame.harmonic_tension);
    floats.push(frame.melodic_pitch);
    floats.push(frame.melodic_direction);
    floats.push(frame.melodic_confidence);
    floats.push(frame.chord_confidence);

    // Section/structure
    floats.push(frame.section_type);
    floats.push(frame.section_index);
    floats.push(frame.section_progress);
    floats.push(frame.climax_phase);
    floats.push(frame.climax_intensity);
    floats.push(frame.coherence);
    floats.push(frame.jam_density);
    floats.push(frame.jam_phase);
    floats.push(frame.jam_progress);

    // Forecast
    floats.push(frame.energy_forecast);
    floats.push(frame.peak_approaching);

    // Deep audio
    floats.push(frame.tempo_derivative);
    floats.push(frame.dynamic_range);
    floats.push(frame.space_score);
    floats.push(frame.timbral_brightness);
    floats.push(frame.timbral_flux);
    floats.push(frame.vocal_pitch);
    floats.push(frame.vocal_pitch_confidence);
    floats.push(frame.improvisation_score);

    // CLAP semantic
    floats.push(frame.semantic_psychedelic);
    floats.push(frame.semantic_cosmic);
    floats.push(frame.semantic_aggressive);
    floats.push(frame.semantic_tender);
    floats.push(frame.semantic_rhythmic);
    floats.push(frame.semantic_ambient);
    floats.push(frame.semantic_chaotic);
    floats.push(frame.semantic_triumphant);

    // Palette
    floats.push(frame.palette_primary);
    floats.push(frame.palette_secondary);
    floats.push(frame.palette_saturation);

    // Envelope
    floats.push(frame.envelope_brightness);
    floats.push(frame.envelope_saturation);
    floats.push(frame.envelope_hue);

    // Era grading
    floats.push(frame.era_saturation);
    floats.push(frame.era_brightness);
    floats.push(frame.era_sepia);

    // Show-level
    floats.push(frame.show_warmth);
    floats.push(frame.show_contrast);
    floats.push(frame.show_saturation);
    floats.push(frame.show_grain);
    floats.push(frame.show_bloom);

    // Shader params
    floats.push(frame.param_bass_scale);
    floats.push(frame.param_energy_scale);
    floats.push(frame.param_motion_speed);
    floats.push(frame.param_color_sat_bias);
    floats.push(frame.param_complexity);
    floats.push(frame.param_drum_reactivity);
    floats.push(frame.param_vocal_weight);

    // Camera (placeholders — will be computed by manifest generator)
    floats.push(0.0); // uCamPos.x
    floats.push(0.0); // uCamPos.y
    floats.push(0.0); // uCamPos.z
    floats.push(0.0); // uCamTarget.x
    floats.push(0.0); // uCamTarget.y
    floats.push(0.0); // uCamTarget.z
    floats.push(60.0); // uCamFov
    floats.push(0.0); // uCamDof
    floats.push(5.0); // uCamFocusDist
    floats.push(0.0); // uCamOffset.x
    floats.push(0.0); // uCamOffset.y

    // Rendering controls
    floats.push(0.0); // uBloomThreshold
    floats.push(0.0); // uLensDistortion
    floats.push(1.0); // uGradingIntensity
    floats.push(0.0); // uVenueVignette
    floats.push(0.0); // uColorTemperature
    floats.push(frame.peak_of_show);

    // Pad to 16-byte alignment (wgpu requires uniform buffers to be aligned)
    while floats.len() % 4 != 0 {
        floats.push(0.0);
    }

    // Convert to bytes
    bytemuck::cast_slice(&floats).to_vec()
}
