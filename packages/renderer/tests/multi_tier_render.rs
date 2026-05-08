//! End-to-end multi-tier scene-target test.
//!
//! Allocates a renderer with three bundles ("full" 1.0, "slow" 0.75,
//! "busted" 0.5), then exercises render_frame_idx, render_scene_to_hdr_idx,
//! and pick_tier_feedback to verify:
//! - Each bundle's textures have the expected dimensions.
//! - Rendering into a non-zero bundle index doesn't crash.
//! - tier_target_index respects the tier_to_targets map.
//! - pick_transition_target_idx picks the smaller-scale bundle.
//!
//! No fixture dependency — uses an inline trivial fragment shader so the
//! test runs from `cargo test --test multi_tier_render` without /tmp setup.

use dead_air_renderer::{gpu, shader_tiers::CostTier, uniforms};

const TRIVIAL_FRAG_WGSL: &str = r#"
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn main(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(in.uv.x, in.uv.y, 0.5, 1.0);
}
"#;

#[test]
fn multi_tier_renderer_allocates_distinct_bundles() {
    // [Ok60→0(full), Ok30→0(full), Slow→1(slow), Busted→2(busted), Unknown→0]
    let tiers: &[(&'static str, f32)] = &[("full", 1.0), ("slow", 0.75), ("busted", 0.5)];
    let tier_to_targets = [0, 0, 1, 2, 0];
    let renderer = pollster::block_on(gpu::GpuRenderer::new_with_tier_scales(
        640, 360, tiers, &tier_to_targets,
    )).expect("GPU init");

    assert_eq!(renderer.targets_pool().len(), 3);
    assert_eq!(renderer.targets_pool()[0].label, "full");
    assert_eq!(renderer.targets_pool()[0].width, 640);
    assert_eq!(renderer.targets_pool()[0].height, 360);
    assert_eq!(renderer.targets_pool()[1].label, "slow");
    assert_eq!(renderer.targets_pool()[1].width, 480);
    assert_eq!(renderer.targets_pool()[1].height, 270);
    assert_eq!(renderer.targets_pool()[2].label, "busted");
    assert_eq!(renderer.targets_pool()[2].width, 320);
    assert_eq!(renderer.targets_pool()[2].height, 180);

    // tier_to_targets routing
    assert_eq!(renderer.tier_target_index(CostTier::Ok60), 0);
    assert_eq!(renderer.tier_target_index(CostTier::Ok30), 0);
    assert_eq!(renderer.tier_target_index(CostTier::Slow), 1);
    assert_eq!(renderer.tier_target_index(CostTier::Busted), 2);
    assert_eq!(renderer.tier_target_index(CostTier::Unknown), 0);

    // Transition target picks the smaller-scale bundle.
    assert_eq!(renderer.pick_transition_target_idx(CostTier::Busted, CostTier::Ok60), 2);
    assert_eq!(renderer.pick_transition_target_idx(CostTier::Ok60, CostTier::Slow), 1);
    assert_eq!(renderer.pick_transition_target_idx(CostTier::Slow, CostTier::Slow), 1);
}

#[test]
fn render_frame_idx_runs_into_busted_bundle_without_crash() {
    let tiers: &[(&'static str, f32)] = &[("full", 1.0), ("busted", 0.5)];
    let tier_to_targets = [0, 0, 0, 1, 0];
    let mut renderer = pollster::block_on(gpu::GpuRenderer::new_with_tier_scales(
        640, 360, tiers, &tier_to_targets,
    )).expect("GPU init");

    let frag = renderer.device().create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("trivial_frag"),
        source: wgpu::ShaderSource::Wgsl(TRIVIAL_FRAG_WGSL.into()),
    });
    let pipeline = renderer.create_pipeline(&frag);

    let frame = make_frame_data();
    let mut light = uniforms::LightingState::default();
    let u = uniforms::build_uniform_buffer(&frame, 640, 360, &mut light);

    // Render into the BUSTED bundle (idx 1, 320x180).
    renderer.render_frame_idx(1, &pipeline, &u, None, None, None, None, false);
    let pixels = renderer.read_pixels();
    // Output texture is at 640x360 (full output dims regardless of bundle scale).
    assert_eq!(pixels.len(), 640 * 360 * 4);
    // Sanity: first row should not be all zeros (the trivial shader
    // gradient produces non-zero red/green from the UVs).
    let mut nonzero = 0usize;
    for chunk in pixels.chunks(4).take(640) {
        if chunk[0] > 0 || chunk[1] > 0 { nonzero += 1; }
    }
    assert!(nonzero > 100, "busted bundle render produced an all-black row");
}

#[test]
fn pick_tier_feedback_returns_correct_bundle() {
    let tiers: &[(&'static str, f32)] = &[("full", 1.0), ("busted", 0.5)];
    let tier_to_targets = [0, 0, 0, 1, 0];
    let renderer = pollster::block_on(gpu::GpuRenderer::new_with_tier_scales(
        640, 360, tiers, &tier_to_targets,
    )).expect("GPU init");

    // For Busted tier, feedback handles must come from bundle 1 (320x180).
    let tf = renderer.pick_tier_feedback(CostTier::Busted, 0);
    assert_eq!(tf.bundle_idx, 1);
    // For Ok60, must come from bundle 0 (640x360).
    let tf = renderer.pick_tier_feedback(CostTier::Ok60, 0);
    assert_eq!(tf.bundle_idx, 0);
}

fn make_frame_data() -> dead_air_renderer::manifest::FrameData {
    dead_air_renderer::manifest::FrameData {
        shader_id: "bench".to_string(),
        frame: 0,
        secondary_shader_id: None,
        blend_progress: None,
        blend_mode: None,
        time: 8.0, dynamic_time: 8.0, beat_time: 8.0,
        musical_time: 0.5, tempo: 120.0,
        energy: 0.65, rms: 0.55, bass: 0.55, mids: 0.40, highs: 0.30,
        onset: 0.2, centroid: 0.5, beat: 0.0,
        slow_energy: 0.55, fast_energy: 0.6, fast_bass: 0.6,
        spectral_flux: 0.15, energy_accel: 0.0, energy_trend: 0.0,
        onset_snap: 0.1, beat_snap: 0.0, beat_confidence: 0.7,
        beat_stability: 0.7, downbeat: 0.0,
        drum_onset: 0.2, drum_beat: 0.0, stem_bass: 0.5, stem_drums: 0.4,
        vocal_energy: 0.2, vocal_presence: 0.4,
        other_energy: 0.3, other_centroid: 0.5,
        chroma_hue: 30.0, chroma_shift: 0.0, chord_index: 0.0,
        harmonic_tension: 0.2, melodic_pitch: 0.5, melodic_direction: 0.0,
        melodic_confidence: 0.5, chord_confidence: 0.6,
        section_type: 5.0, section_index: 0.0, section_progress: 0.4,
        climax_phase: 1.5, climax_intensity: 0.5, coherence: 0.0,
        jam_density: 0.6, jam_phase: 1.0, jam_progress: 0.5,
        energy_forecast: 0.0, peak_approaching: 0.0,
        tempo_derivative: 0.0, dynamic_range: 0.5, space_score: 0.0,
        timbral_brightness: 0.5, timbral_flux: 0.1,
        vocal_pitch: 0.0, vocal_pitch_confidence: 0.0, improvisation_score: 0.4,
        semantic_psychedelic: 0.4, semantic_cosmic: 0.3, semantic_aggressive: 0.3,
        semantic_tender: 0.1, semantic_rhythmic: 0.4, semantic_ambient: 0.2,
        semantic_chaotic: 0.2, semantic_triumphant: 0.3,
        palette_primary: 0.08, palette_secondary: 0.55, palette_saturation: 0.85,
        envelope_brightness: 1.0, envelope_saturation: 1.1, envelope_hue: 0.0,
        era_saturation: 1.05, era_brightness: 1.0, era_sepia: 0.0,
        show_warmth: 0.05, show_contrast: 1.05, show_saturation: 1.0,
        show_grain: 1.0, show_bloom: 1.0,
        param_bass_scale: 1.0, param_energy_scale: 1.0, param_motion_speed: 1.0,
        param_color_sat_bias: 0.0, param_complexity: 1.0,
        param_drum_reactivity: 1.0, param_vocal_weight: 1.0,
        peak_of_show: 0.0,
        contrast: None,
        motion_blur_samples: 1,
        shader_hold_progress: None, song_progress: None,
        show_bloom_character: None, show_grain_character: None,
        show_temperature_character: None, show_contrast_character: None,
        show_progress: None, era_black_lift: None, era_contrast_scale: None,
        effect_mode: 0, effect_intensity: 0.0,
        composited_mode: 0, composited_intensity: 0.0,
        show_position: 0.5, camera_behavior: 0,
    }
}
