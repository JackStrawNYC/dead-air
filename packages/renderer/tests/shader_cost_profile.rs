//! Per-shader GPU cost profile across the entire fixture set.
//!
//! Audit Debt #12 ("No GPU profiling — can't identify slow shaders, blind
//! optimization"). Walks every .glsl in /tmp/dead-air-glsl, renders a
//! handful of frames at the configured resolution, and prints a per-shader
//! p50/p95 sorted by cost. Output is the optimization triage list.
//!
//! Why wall-clock instead of wgpu TIMESTAMP_QUERY: `read_pixels()` blocks
//! until the GPU finishes the frame, so wall-clock around `render_frame +
//! read_pixels` measures real GPU time without needing the timestamp
//! feature plumbed through every encoder. Trade-off: we lose per-pass
//! split (scene vs postprocess); we'd need TIMESTAMP_QUERY for that.
//!
//! Resolution: defaults to 640x360 (production res / 9x faster). At 1080p
//! one bad shader can stall the GPU for minutes; at 360p the relative
//! ranking is preserved while keeping the sweep < 60 seconds. To re-profile
//! at 1080p set `DEAD_AIR_PROFILE_RES=1080p` in the env.
//!
//! Skips silently if /tmp/dead-air-glsl is empty. #[ignore]'d so it doesn't
//! run on every `cargo test`.
//!
//! Run: cargo test --release --test shader_cost_profile -- --ignored --nocapture

use std::io::Write;
use std::time::Instant;

const TARGET_30_MS: f64 = 33.33;
const TARGET_60_MS: f64 = 16.67;

#[test]
#[ignore]
fn shader_cost_profile_1080p() {
    let glsl_dir = "/tmp/dead-air-glsl";
    let entries = match std::fs::read_dir(glsl_dir) {
        Ok(d) => d,
        Err(_) => {
            eprintln!("[shader-profile] no fixtures at {} — skipping. Run export-shaders.mts.", glsl_dir);
            return;
        }
    };

    let mut shader_paths: Vec<(String, String)> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("glsl"))
        .map(|e| {
            let name = e.path().file_stem().unwrap().to_string_lossy().to_string();
            (name, e.path().to_string_lossy().to_string())
        })
        .collect();
    shader_paths.sort_by(|a, b| a.0.cmp(&b.0));

    if shader_paths.is_empty() {
        eprintln!("[shader-profile] no .glsl files in {} — skipping", glsl_dir);
        return;
    }

    let (width, height) = match std::env::var("DEAD_AIR_PROFILE_RES").as_deref() {
        Ok("1080p") => (1920u32, 1080u32),
        Ok("720p")  => (1280u32, 720u32),
        Ok("4k")    => (3840u32, 2160u32),
        _           => (640u32, 360u32),
    };
    let warmup = 1;
    let measure = 10;

    let mut renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(width, height))
        .expect("GPU init");
    eprintln!("[shader-profile] GPU: {}", renderer.adapter_name());
    eprintln!(
        "[shader-profile] sweeping {} shaders at {}x{}, {} warmup + {} measure each",
        shader_paths.len(), width, height, warmup, measure,
    );
    eprintln!("[shader-profile] override resolution with DEAD_AIR_PROFILE_RES=720p|1080p|4k");
    eprintln!();
    let _ = std::io::stderr().flush();

    let frame = make_frame_data();

    let mut results: Vec<(String, f64, f64, f64)> = Vec::new();
    let mut compile_failed: Vec<String> = Vec::new();

    for (i, (name, path)) in shader_paths.iter().enumerate() {
        eprint!("[{:>3}/{}] {:<28} ", i + 1, shader_paths.len(), name);
        let _ = std::io::stderr().flush();

        let glsl = match std::fs::read_to_string(path) {
            Ok(s) => s,
            Err(_) => { eprintln!("read err"); continue; },
        };
        let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);

        // Compile via naga so we surface failures distinctly from runtime cost.
        let mut parser = naga::front::glsl::Frontend::default();
        let opts = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
        let module = match parser.parse(&opts, &desktop) {
            Ok(m) => m,
            Err(_) => { eprintln!("parse fail"); compile_failed.push(name.clone()); continue; }
        };
        let info = match naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        ).validate(&module) {
            Ok(i) => i,
            Err(_) => { eprintln!("validate fail"); compile_failed.push(name.clone()); continue; }
        };
        let wgsl = match naga::back::wgsl::write_string(
            &module, &info, naga::back::wgsl::WriterFlags::empty(),
        ) {
            Ok(s) => s,
            Err(_) => { eprintln!("wgsl emit fail"); compile_failed.push(name.clone()); continue; }
        };
        let frag = renderer.device().create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(name),
            source: wgpu::ShaderSource::Wgsl(wgsl.into()),
        });
        let pipeline = renderer.create_pipeline(&frag);

        for _ in 0..warmup {
            let mut light = dead_air_renderer::uniforms::LightingState::default();
            let u = dead_air_renderer::uniforms::build_uniform_buffer(&frame, width, height, &mut light);
            renderer.render_frame(&pipeline, &u, None, None, None, None, false);
            let _ = renderer.read_pixels();
        }

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
        let max = *samples_ms.last().unwrap();
        eprintln!("p50={:>6.2}ms  p95={:>6.2}ms  max={:>6.2}ms", p50, p95, max);
        let _ = std::io::stderr().flush();
        results.push((name.clone(), p50, p95, max));
    }

    // Sort by p95 desc — biggest cost on top is what the user wants to see.
    results.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap());

    println!();
    println!("Per-shader cost profile @ {}x{} (sorted by p95 desc):", width, height);
    println!("{:<28} {:>10} {:>10} {:>10} {:>8}", "shader", "p50ms", "p95ms", "max ms", "tier");
    println!("{}", "-".repeat(72));
    for (name, p50, p95, max) in &results {
        let tier = if *p95 < TARGET_60_MS { "OK60" }
            else if *p95 < TARGET_30_MS { "OK30" }
            else if *p95 < TARGET_30_MS * 2.0 { "SLOW" }
            else { "BUSTED" };
        println!("{:<28} {:>10.2} {:>10.2} {:>10.2} {:>8}", name, p50, p95, max, tier);
    }

    println!();
    let ok60 = results.iter().filter(|r| r.2 < TARGET_60_MS).count();
    let ok30 = results.iter().filter(|r| r.2 >= TARGET_60_MS && r.2 < TARGET_30_MS).count();
    let slow = results.iter().filter(|r| r.2 >= TARGET_30_MS && r.2 < TARGET_30_MS * 2.0).count();
    let busted = results.iter().filter(|r| r.2 >= TARGET_30_MS * 2.0).count();
    println!(
        "[shader-profile] {} measured: {} OK60, {} OK30, {} SLOW, {} BUSTED",
        results.len(), ok60, ok30, slow, busted,
    );
    if !compile_failed.is_empty() {
        println!(
            "[shader-profile] {} shader(s) didn't compile: {:?}",
            compile_failed.len(),
            &compile_failed[..compile_failed.len().min(5)],
        );
    }

    // Diagnostic only — capacity-planning data, not a regression gate.
    // (validate_all_shaders covers correctness; this answers "is it fast?")
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
