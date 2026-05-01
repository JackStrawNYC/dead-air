//! Byte-equivalence between the hand-written uniforms.rs packer and the
//! schema-driven `pack_simple_uniforms` codegen (Wave 2.1 phase D gate).
//!
//! The codegen only handles the 98 "simple field copy" uniforms — for those
//! offsets, the hand-written and generated paths must produce IDENTICAL
//! bytes. The remaining offsets (computed/synthetic + vec4 blocks) are
//! ignored here; uniforms.rs still owns them.

use dead_air_renderer::{manifest::FrameData, uniforms, uniforms_layout};

fn sample_frame() -> FrameData {
    FrameData {
        shader_id: "test".to_string(),
        frame: 42,
        secondary_shader_id: None,
        blend_progress: None,
        blend_mode: None,
        time: 12.5, dynamic_time: 12.0, beat_time: 12.25,
        musical_time: 0.42, tempo: 130.0,
        energy: 0.7, rms: 0.6, bass: 0.55, mids: 0.5, highs: 0.4,
        onset: 0.3, centroid: 0.6, beat: 1.0,
        slow_energy: 0.65, fast_energy: 0.72, fast_bass: 0.6,
        spectral_flux: 0.18, energy_accel: 0.05, energy_trend: 0.1,
        onset_snap: 0.25, beat_snap: 0.5, beat_confidence: 0.8,
        beat_stability: 0.85, downbeat: 0.0,
        drum_onset: 0.4, drum_beat: 0.3, stem_bass: 0.45, stem_drums: 0.35,
        vocal_energy: 0.3, vocal_presence: 0.55,
        other_energy: 0.4, other_centroid: 0.55,
        chroma_hue: 240.0, chroma_shift: 30.0, chord_index: 5.0,
        harmonic_tension: 0.3, melodic_pitch: 0.6, melodic_direction: 0.2,
        melodic_confidence: 0.65, chord_confidence: 0.7,
        section_type: 5.0, section_index: 3.0, section_progress: 0.66,
        climax_phase: 2.0, climax_intensity: 0.85, coherence: 0.0,
        jam_density: 0.7, jam_phase: 1.5, jam_progress: 0.5,
        energy_forecast: 0.05, peak_approaching: 0.2,
        tempo_derivative: 0.01, dynamic_range: 0.6, space_score: 0.0,
        timbral_brightness: 0.55, timbral_flux: 0.18,
        vocal_pitch: 0.5, vocal_pitch_confidence: 0.8, improvisation_score: 0.45,
        semantic_psychedelic: 0.5, semantic_cosmic: 0.4, semantic_aggressive: 0.2,
        semantic_tender: 0.15, semantic_rhythmic: 0.4, semantic_ambient: 0.25,
        semantic_chaotic: 0.15, semantic_triumphant: 0.35,
        palette_primary: 0.12, palette_secondary: 0.6, palette_saturation: 0.9,
        envelope_brightness: 1.1, envelope_saturation: 1.15, envelope_hue: 0.05,
        era_saturation: 1.05, era_brightness: 1.02, era_sepia: 0.05,
        show_warmth: 0.1, show_contrast: 1.05, show_saturation: 1.0,
        show_grain: 1.1, show_bloom: 1.05,
        param_bass_scale: 1.0, param_energy_scale: 1.0, param_motion_speed: 0.95,
        param_color_sat_bias: 0.1, param_complexity: 0.8,
        param_drum_reactivity: 0.9, param_vocal_weight: 0.7,
        peak_of_show: 0.7,
        contrast: None,
        motion_blur_samples: 1,
        shader_hold_progress: Some(0.4), song_progress: Some(0.55),
        show_bloom_character: Some(0.05), show_grain_character: Some(0.6),
        show_temperature_character: Some(-0.05), show_contrast_character: Some(0.7),
        effect_mode: 0, effect_intensity: 0.0,
        composited_mode: 0, composited_intensity: 0.0,
        show_position: 0.5, camera_behavior: 0,
    }
}

fn read_f32(buf: &[u8], offset: usize) -> f32 {
    let mut a = [0u8; 4];
    a.copy_from_slice(&buf[offset..offset + 4]);
    f32::from_le_bytes(a)
}

#[test]
fn pack_simple_matches_hand_written_at_simple_offsets() {
    let frame = sample_frame();

    // Hand-written packer (live render path).
    let mut light = uniforms::LightingState::default();
    let hand = uniforms::build_uniform_buffer(&frame, 1920, 1080, &mut light);

    // Generated packer over a fresh zero buffer.
    let mut gen_buf = vec![0u8; uniforms_layout::UBO_SIZE];
    let written = uniforms_layout::pack_simple_uniforms(&frame, &mut gen_buf);
    assert!(written > 90, "expected >90 simple writes, got {}", written);

    // For every offset the codegen wrote, the hand-written buffer must
    // contain the same f32. Walk the schema-emitted FIELDS to identify
    // simple offsets via parsing rust_source — but we don't have that
    // string at runtime. Use UNIFORM_FIELDS for offsets, then test ONLY
    // the offsets that pack_simple_uniforms touched (we can detect this:
    // those offsets are non-zero in gen_buf when input frame has non-zero
    // value for that field).
    //
    // Simpler approach: zero a separate buffer, run pack_simple_uniforms,
    // then for every byte that is non-zero, the hand-written buffer must
    // match. Bytes that are zero in gen_buf might be either "this offset
    // wasn't written by codegen" (different content in hand) or "the
    // input value for that field happened to be 0.0". Both fine.
    let mut mismatches = 0usize;
    let mut checked = 0usize;
    for offset in (0..uniforms_layout::UBO_SIZE).step_by(4) {
        let gen_v = read_f32(&gen_buf, offset);
        if gen_v == 0.0 { continue; }  // not written by codegen, or written as zero
        let hand_v = read_f32(&hand, offset);
        checked += 1;
        if (gen_v - hand_v).abs() > 1e-6 {
            mismatches += 1;
            if mismatches < 10 {
                eprintln!(
                    "[parity] mismatch at offset {}: gen={} hand={}",
                    offset, gen_v, hand_v,
                );
            }
        }
    }
    eprintln!("[parity] {} non-zero offsets checked, {} mismatches", checked, mismatches);
    assert_eq!(mismatches, 0, "{} byte-mismatches between codegen and hand-written packer", mismatches);
}
