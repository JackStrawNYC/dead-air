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

    renderer.render_frame(&pipeline, &uniform_data, None, None, None, None);
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
