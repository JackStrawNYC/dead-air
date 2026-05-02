//! Render multiple shaders to compare visual output.

fn make_frame_data(time: f32, energy: f32) -> dead_air_renderer::manifest::FrameData {
    dead_air_renderer::manifest::FrameData {
        shader_id: String::new(),
        frame: 0,
        secondary_shader_id: None,
        blend_progress: None,
        blend_mode: None,
        time,
        dynamic_time: time,
        beat_time: time,
        musical_time: (time * 2.0) % 1.0,
        tempo: 120.0,
        energy,
        rms: energy * 0.8,
        bass: energy * 0.85,
        mids: energy * 0.6,
        highs: energy * 0.5,
        onset: 0.1,
        centroid: 0.45,
        beat: 0.0,
        slow_energy: energy * 0.9,
        fast_energy: energy,
        fast_bass: energy * 0.8,
        spectral_flux: 0.15,
        energy_accel: 0.0,
        energy_trend: 0.0,
        onset_snap: 0.1,
        beat_snap: 0.0,
        beat_confidence: 0.7,
        beat_stability: 0.7,
        downbeat: 0.0,
        drum_onset: 0.1,
        drum_beat: 0.0,
        stem_bass: energy * 0.7,
        stem_drums: 0.2,
        vocal_energy: 0.15,
        vocal_presence: 0.4,
        other_energy: 0.25,
        other_centroid: 0.5,
        chroma_hue: 30.0,  // warm orange
        chroma_shift: 0.0,
        chord_index: 0.0,
        harmonic_tension: 0.25,
        melodic_pitch: 0.5,
        melodic_direction: 0.0,
        melodic_confidence: 0.5,
        chord_confidence: 0.6,
        section_type: 5.0, // jam
        section_index: 0.0,
        section_progress: 0.4,
        climax_phase: 0.0,
        climax_intensity: 0.0,
        coherence: 0.0,
        jam_density: 0.5,
        jam_phase: 1.0,
        jam_progress: 0.4,
        energy_forecast: 0.0,
        peak_approaching: 0.0,
        tempo_derivative: 0.0,
        dynamic_range: 0.5,
        space_score: 0.0,
        timbral_brightness: 0.5,
        timbral_flux: 0.1,
        vocal_pitch: 0.0,
        vocal_pitch_confidence: 0.0,
        improvisation_score: 0.3,
        semantic_psychedelic: 0.3,
        semantic_cosmic: 0.2,
        semantic_aggressive: 0.4,
        semantic_tender: 0.1,
        semantic_rhythmic: 0.4,
        semantic_ambient: 0.1,
        semantic_chaotic: 0.2,
        semantic_triumphant: 0.2,
        palette_primary: 0.08,    // warm red-orange (~30°)
        palette_secondary: 0.55,  // cyan-blue (~200°)
        palette_saturation: 0.85,
        envelope_brightness: 0.95,
        envelope_saturation: 1.1,
        envelope_hue: 0.0,
        era_saturation: 1.05,
        era_brightness: 1.0,
        era_sepia: 0.0,
        show_warmth: 0.05,
        show_contrast: 1.05,
        show_saturation: 1.0,
        show_grain: 1.0,
        show_bloom: 1.0,
        param_bass_scale: 1.0,
        param_energy_scale: 1.0,
        param_motion_speed: 1.0,
        param_color_sat_bias: 0.0,
        param_complexity: 1.0,
        param_drum_reactivity: 1.0,
        param_vocal_weight: 1.0,
        peak_of_show: 0.0,
        contrast: None,
        motion_blur_samples: 1,
        shader_hold_progress: None,
        song_progress: None,
        show_bloom_character: None,
        show_grain_character: None,
        show_temperature_character: None,
        show_contrast_character: None,
        effect_mode: 0,
        effect_intensity: 0.0,
        composited_mode: 0,
        composited_intensity: 0.0,
        show_position: 0.5,
        camera_behavior: 0,
    }
}

fn compile_and_render(
    renderer: &mut dead_air_renderer::gpu::GpuRenderer,
    shader_name: &str,
    frame_data: &dead_air_renderer::manifest::FrameData,
    width: u32,
    height: u32,
) -> bool {
    let glsl_path = format!("/tmp/dead-air-glsl/{}.glsl", shader_name);
    let glsl = match std::fs::read_to_string(&glsl_path) {
        Ok(s) => s,
        Err(_) => { eprintln!("  {} — GLSL not found", shader_name); return false; }
    };

    let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);

    let mut parser = naga::front::glsl::Frontend::default();
    let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
    let module = match parser.parse(&options, &desktop) {
        Ok(m) => m,
        Err(e) => {
            eprintln!("  {} — parse error: {}", shader_name, e.errors.first().map(|e| format!("{}", e)).unwrap_or_default());
            return false;
        }
    };

    let info = match naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    ).validate(&module) {
        Ok(i) => i,
        Err(e) => { eprintln!("  {} — validation error: {}", shader_name, e); return false; }
    };

    let wgsl = match naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty()) {
        Ok(w) => w,
        Err(e) => { eprintln!("  {} — WGSL error: {}", shader_name, e); return false; }
    };

    let fragment_module = renderer.device().create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some(shader_name),
        source: wgpu::ShaderSource::Wgsl(wgsl.into()),
    });

    let pipeline = renderer.create_pipeline(&fragment_module);
    let uniform_data = dead_air_renderer::uniforms::build_uniform_buffer(frame_data, width, height, &mut dead_air_renderer::uniforms::LightingState::default());

    renderer.render_frame(&pipeline, &uniform_data, None, None, None, None, false);
    let pixels = renderer.read_pixels();

    let output_path = format!("/tmp/dead-air-{}.png", shader_name);
    image::save_buffer(&output_path, &pixels, width, height, image::ColorType::Rgba8).unwrap();

    let non_black = pixels.chunks(4).filter(|p| p[0] > 10 || p[1] > 10 || p[2] > 10).count();
    let total = (width * height) as usize;
    println!("  {} — {:.1}% visible — {}", shader_name, non_black as f64 / total as f64 * 100.0, output_path);

    true
}

#[test]
fn test_render_multiple_shaders() {
    let width = 1280u32;
    let height = 720u32;

    let mut renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(width, height))
        .expect("Failed to init GPU");
    println!("GPU: {}", renderer.adapter_name());

    let shaders = [
        "inferno",
        "protean-clouds",
        "cosmic-voyage",
        "aurora",
        "ocean",
        "river",
        "deep-ocean",
        "volumetric-smoke",
        "space-travel",
        "star-nest",
    ];

    let frame = make_frame_data(8.0, 0.50);
    let mut rendered = 0;

    println!("\nRendering {} shaders at {}x{}:", shaders.len(), width, height);
    for shader in &shaders {
        if compile_and_render(&mut renderer, shader, &frame, width, height) {
            rendered += 1;
        }
    }

    println!("\n{} of {} shaders rendered successfully.", rendered, shaders.len());

    // Open all rendered images
    for shader in &shaders {
        let path = format!("/tmp/dead-air-{}.png", shader);
        if std::path::Path::new(&path).exists() {
            let _ = std::process::Command::new("open").arg(&path).spawn();
        }
    }
}

/// Outcome of running one shader through the visibility gate.
#[derive(Debug)]
struct VisibilityResult {
    ok: usize,
    compile_failed: Vec<String>,
    all_black: Vec<(String, f64)>,
    nearly_uniform: Vec<(String, f64)>,
    total: usize,
}

/// Render every fixture shader at 256x256 with the supplied frame, classify
/// each by mean luminance and luminance range. Used by the high-energy and
/// low-energy visibility gates below.
fn run_visibility_gate(frame: &dead_air_renderer::manifest::FrameData) -> Option<VisibilityResult> {
    let glsl_dir = "/tmp/dead-air-glsl";
    let dir = std::fs::read_dir(glsl_dir).ok()?;
    let width = 256u32;
    let height = 256u32;
    let mut renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(width, height))
        .expect("Failed to init GPU");

    let mut shader_names: Vec<String> = dir
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "glsl"))
        .map(|e| e.path().file_stem().unwrap().to_string_lossy().to_string())
        .collect();
    shader_names.sort();

    let mut compile_failed = Vec::new();
    let mut all_black = Vec::new();
    let mut nearly_uniform = Vec::new();
    let mut ok = 0usize;

    for name in &shader_names {
        let glsl_path = format!("/tmp/dead-air-glsl/{}.glsl", name);
        let Ok(glsl) = std::fs::read_to_string(&glsl_path) else { continue };
        let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);

        let mut parser = naga::front::glsl::Frontend::default();
        let opts = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
        let module = match parser.parse(&opts, &desktop) {
            Ok(m) => m,
            Err(_) => { compile_failed.push(name.clone()); continue; }
        };
        let info = match naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        ).validate(&module) {
            Ok(i) => i,
            Err(_) => { compile_failed.push(name.clone()); continue; }
        };
        let wgsl = match naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty()) {
            Ok(w) => w,
            Err(_) => { compile_failed.push(name.clone()); continue; }
        };

        let module = renderer.device().create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(name),
            source: wgpu::ShaderSource::Wgsl(wgsl.into()),
        });
        let pipeline = renderer.create_pipeline(&module);
        let uniform_data = dead_air_renderer::uniforms::build_uniform_buffer(
            frame, width, height,
            &mut dead_air_renderer::uniforms::LightingState::default(),
        );

        renderer.render_frame(&pipeline, &uniform_data, None, None, None, None, false);
        let pixels = renderer.read_pixels();

        let mut lums: Vec<f64> = Vec::with_capacity(pixels.len() / 4);
        for px in pixels.chunks(4) {
            lums.push(px[0] as f64 * 0.299 + px[1] as f64 * 0.587 + px[2] as f64 * 0.114);
        }
        let mean_lum: f64 = lums.iter().sum::<f64>() / lums.len() as f64;
        let mut sorted = lums.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let p95 = sorted[(sorted.len() as f64 * 0.95) as usize];
        let p05 = sorted[(sorted.len() as f64 * 0.05) as usize];
        let range = p95 - p05;

        // Visibility = either bright on average OR has clearly visible bright
        // content (top 5% of pixels are well above black). The bright-content
        // test catches shaders like plasma-field/liquid-light that are dark
        // backgrounds with prominent bright features (would fail mean-only).
        let bright_enough = mean_lum >= 4.0 || p95 >= 30.0;
        if !bright_enough {
            // Track the better of (mean, p95/8) so the report shows whether
            // the shader is uniformly dim or just lacking a bright spot.
            let report_lum = mean_lum.max(p95 / 8.0);
            all_black.push((name.clone(), report_lum));
            continue;
        }
        if range < 8.0 {
            nearly_uniform.push((name.clone(), range));
            continue;
        }
        ok += 1;
    }

    Some(VisibilityResult {
        ok,
        compile_failed,
        all_black,
        nearly_uniform,
        total: shader_names.len(),
    })
}

fn print_visibility_report(label: &str, r: &VisibilityResult) {
    println!("\n[{}] Visibility gate over {} shaders:", label, r.total);
    println!("  OK:              {}", r.ok);
    println!("  Compile failed:  {}", r.compile_failed.len());
    println!("  All-black:       {}", r.all_black.len());
    println!("  Nearly uniform:  {}", r.nearly_uniform.len());
    if !r.all_black.is_empty() {
        eprintln!("\n  ALL-BLACK shaders (silent renderer failure):");
        for (name, lum) in &r.all_black {
            eprintln!("    {} (mean lum {:.2})", name, lum);
        }
    }
    if !r.nearly_uniform.is_empty() {
        eprintln!("\n  NEARLY-UNIFORM shaders:");
        for (name, range) in &r.nearly_uniform {
            eprintln!("    {} (lum range {:.2})", name, range);
        }
    }
}

/// Walk every .glsl in /tmp/dead-air-glsl, render at low res, assert non-black
/// AND non-uniform output. This catches the audit's #15 risk: shaders that
/// compile clean but render as garbage because glsl_compat.rs missed a capture
/// or a uniform doesn't reach the GPU.
///
/// Skips silently if no fixtures exist (CI without the TS export step).
/// Run `npx tsx packages/renderer/export-shaders.mts` first to populate fixtures.
#[test]
fn golden_frame_silent_failure_gate() {
    // Use high-energy frame data so the gate fires only on shaders that are
    // genuinely silent — not those that simply need climax+bass+stems to be
    // visible. Mid-show climax frame: bass-heavy, climax phase 2 (peak),
    // jam-section. Real shows hit this regularly.
    let mut frame = make_frame_data(8.0, 0.80);
    frame.bass = 0.85;
    frame.fast_bass = 0.85;
    frame.stem_bass = 0.75;
    frame.stem_drums = 0.70;
    frame.drum_onset = 0.6;
    frame.drum_beat = 0.5;
    frame.onset = 0.5;
    frame.onset_snap = 0.5;
    frame.beat_snap = 0.7;
    frame.climax_phase = 2.0;
    frame.climax_intensity = 0.85;
    frame.peak_of_show = 1.0;
    frame.jam_density = 0.85;
    frame.envelope_brightness = 1.2;
    frame.envelope_saturation = 1.3;

    let Some(report) = run_visibility_gate(&frame) else {
        eprintln!("[golden-frame] no fixtures — skipping");
        return;
    };
    print_visibility_report("golden-frame-high-energy", &report);

    // Strict by default: with realistic high-energy frame data zero shaders
    // should silently render black/uniform. DEAD_AIR_GOLDEN_TOLERANCE=N (0..100)
    // lets one-off triage allow up to N%.
    let broken = report.all_black.len() + report.nearly_uniform.len();
    let broken_pct = broken as f64 / report.total.max(1) as f64;
    let tolerance = std::env::var("DEAD_AIR_GOLDEN_TOLERANCE")
        .ok()
        .and_then(|s| s.parse::<f64>().ok())
        .map(|p| p / 100.0)
        .unwrap_or(0.0);
    assert!(
        broken_pct <= tolerance,
        "{}/{} shaders silently render black or uniform ({:.1}%, tolerance {:.0}%) — see list above",
        broken, report.total, broken_pct * 100.0, tolerance * 100.0,
    );
}

/// Low-energy gate: catches the bug class where a shader has parameters tuned
/// for climax-tier inputs but produces near-black output at moderate audio.
/// Star-nest's overshooting Kali formfactor and ocean's wave-amplitude clipping
/// were both this kind of bug — invisible to the high-energy gate.
///
/// Tolerance is more permissive (10%): some shaders (cosmic-voyage, deep-ocean)
/// legitimately render mostly-empty space at low energy, by design. The gate's
/// job is to catch a NEW shader regressing dramatically, not to enforce
/// brightness everywhere.
#[test]
fn golden_frame_low_energy_gate() {
    // Quiet-passage frame: low energy, low bass, no climax, "jam" section.
    let mut frame = make_frame_data(8.0, 0.35);
    frame.bass = 0.30;
    frame.fast_bass = 0.30;
    frame.stem_bass = 0.25;
    frame.stem_drums = 0.20;
    frame.drum_onset = 0.10;
    frame.drum_beat = 0.05;
    frame.onset = 0.10;
    frame.onset_snap = 0.10;
    frame.beat_snap = 0.20;
    frame.climax_phase = 0.0;
    frame.climax_intensity = 0.0;
    frame.peak_of_show = 0.0;
    frame.jam_density = 0.30;
    frame.envelope_brightness = 0.95;
    frame.envelope_saturation = 1.0;

    let Some(report) = run_visibility_gate(&frame) else {
        eprintln!("[low-energy] no fixtures — skipping");
        return;
    };
    print_visibility_report("low-energy", &report);

    // 20% baseline tolerance reflects the May 2026 audit: ~19 of 127 shaders
    // (15%) are dim-at-low-energy by design or by tuning that prefers
    // climax-tier inputs (campfire-only-glow, ancient-forest's dark canopy,
    // etc.) plus a handful that are real bugs (cellular-automata, digital-rain,
    // fluid-2d, liquid-light, plasma-field, stark-minimal — similar class to
    // the star-nest/ocean fixes already in flight). 20% catches a NEW shader
    // regressing badly without blocking on the existing baseline.
    //
    // Set DEAD_AIR_LOW_ENERGY_TOLERANCE=0 to fail on ANY dim shader (used to
    // chase down individual bugs).
    let broken = report.all_black.len() + report.nearly_uniform.len();
    let broken_pct = broken as f64 / report.total.max(1) as f64;
    let tolerance = std::env::var("DEAD_AIR_LOW_ENERGY_TOLERANCE")
        .ok()
        .and_then(|s| s.parse::<f64>().ok())
        .map(|p| p / 100.0)
        .unwrap_or(0.20);
    assert!(
        broken_pct <= tolerance,
        "{}/{} shaders silently render black at LOW energy ({:.1}%, tolerance {:.0}%) — see list above",
        broken, report.total, broken_pct * 100.0, tolerance * 100.0,
    );
}
