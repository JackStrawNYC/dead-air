//! Live-mode frame budget benchmark.
//!
//! Wave 4.2 phase A — answer the feasibility question: at 1080p / 60fps
//! the budget is 16.67ms per frame. Which shaders fit, which bust budget?
//! Without this data, "Live Rust renderer mode" (audit Top #10) is just
//! speculation.
//!
//! Runs ~60 frames per shader so warmup + GC noise averages out, prints
//! a per-shader p50 / p95 / p99 breakdown plus a verdict.
//!
//! Skips silently when /tmp/dead-air-glsl is empty.

use std::time::Instant;

const TARGET_MS_60FPS: f64 = 16.67;

// Marked #[ignore] because a full sweep takes 2-3 minutes on dev hardware.
// Run explicitly: cargo test --release --test live_mode_budget -- --ignored --nocapture
#[test]
#[ignore]
fn live_mode_frame_budget_1080p() {
    let glsl_dir = "/tmp/dead-air-glsl";
    if std::fs::metadata(glsl_dir).is_err() {
        eprintln!("[live-budget] no fixtures at {} — skipping. Run export-shaders.mts.", glsl_dir);
        return;
    }

    // Representative pool spanning shader-cost tiers. Picks shaders we know
    // compile (validate_all_shaders gates 100% pass), so this benchmark
    // measures runtime cost specifically.
    // Shader fixture names use kebab-case per export-shaders.mts convention.
    let pool = [
        ("cheap",      "neon-grid"),
        ("cheap",      "ember-meadow"),
        ("medium",     "aurora"),
        ("medium",     "cosmic-voyage"),
        ("expensive",  "fractal-temple"),
        ("expensive",  "mandala-engine"),
        ("expensive",  "fractal-zoom"),
        ("volumetric", "protean-clouds"),
        ("volumetric", "deep-ocean"),
        ("volumetric", "volumetric-smoke"),
    ];

    let width = 1920u32;
    let height = 1080u32;
    let warmup = 5;
    let measure = 60;

    let mut renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(width, height))
        .expect("GPU init");
    eprintln!("[live-budget] GPU: {}", renderer.adapter_name());
    eprintln!("[live-budget] target: {:.2}ms / frame for 60fps at {}x{}", TARGET_MS_60FPS, width, height);
    eprintln!();

    println!("{:<12} {:<22} {:>10} {:>10} {:>10} {:>10} {:>8}", "tier", "shader", "p50ms", "p95ms", "p99ms", "max ms", "verdict");
    println!("{}", "-".repeat(90));

    let mut results: Vec<(String, String, f64, f64, f64, f64, &'static str)> = Vec::new();

    for (tier, name) in &pool {
        let glsl_path = format!("/tmp/dead-air-glsl/{}.glsl", name);
        let glsl = match std::fs::read_to_string(&glsl_path) {
            Ok(s) => s,
            Err(_) => {
                eprintln!("[live-budget] SKIP {} — no fixture", name);
                continue;
            }
        };
        let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);

        let mut parser = naga::front::glsl::Frontend::default();
        let opts = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
        let module = match parser.parse(&opts, &desktop) {
            Ok(m) => m,
            Err(_) => { eprintln!("[live-budget] SKIP {} — parse failed", name); continue; }
        };
        let info = match naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        ).validate(&module) {
            Ok(i) => i,
            Err(_) => { eprintln!("[live-budget] SKIP {} — validate failed", name); continue; }
        };
        let wgsl = naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty()).unwrap();
        let frag = renderer.device().create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(name),
            source: wgpu::ShaderSource::Wgsl(wgsl.into()),
        });
        let pipeline = renderer.create_pipeline(&frag);

        let frame = make_frame_data();

        // Warmup
        for _ in 0..warmup {
            let mut light = dead_air_renderer::uniforms::LightingState::default();
            let u = dead_air_renderer::uniforms::build_uniform_buffer(&frame, width, height, &mut light);
            renderer.render_frame(&pipeline, &u, None, None, None, None, false);
            let _ = renderer.read_pixels();
        }

        // Measure
        let mut samples_ms: Vec<f64> = Vec::with_capacity(measure);
        for _ in 0..measure {
            let mut light = dead_air_renderer::uniforms::LightingState::default();
            let u = dead_air_renderer::uniforms::build_uniform_buffer(&frame, width, height, &mut light);
            let t0 = Instant::now();
            renderer.render_frame(&pipeline, &u, None, None, None, None, false);
            let _ = renderer.read_pixels();
            samples_ms.push(t0.elapsed().as_secs_f64() * 1000.0);
        }

        samples_ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let p50 = samples_ms[samples_ms.len() / 2];
        let p95 = samples_ms[(samples_ms.len() as f64 * 0.95) as usize];
        let p99 = samples_ms[(samples_ms.len() as f64 * 0.99) as usize];
        let max = *samples_ms.last().unwrap();

        let verdict = if p95 < TARGET_MS_60FPS { "OK60" }
            else if p95 < TARGET_MS_60FPS * 2.0 { "ok30" }
            else { "TOO SLOW" };

        println!(
            "{:<12} {:<22} {:>10.2} {:>10.2} {:>10.2} {:>10.2} {:>8}",
            tier, name, p50, p95, p99, max, verdict,
        );
        results.push((tier.to_string(), name.to_string(), p50, p95, p99, max, verdict));
    }

    println!();
    let live60 = results.iter().filter(|r| r.6 == "OK60").count();
    let live30 = results.iter().filter(|r| r.6 == "ok30").count();
    let too_slow = results.iter().filter(|r| r.6 == "TOO SLOW").count();
    println!("[live-budget] {} live-60fps, {} live-30fps, {} too-slow", live60, live30, too_slow);

    // Diagnostic only — don't fail. This benchmark is for capacity planning,
    // not regression gating.
    if too_slow > 0 {
        println!("[live-budget] {} shader(s) bust the 30fps budget — would need LOD or exclusion in live mode", too_slow);
    }
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
        effect_mode: 0, effect_intensity: 0.0,
        composited_mode: 0, composited_intensity: 0.0,
        show_position: 0.5, camera_behavior: 0,
    }
}
