//! Verify that scene LOD scaling (audit Wave 3.3) produces a valid frame.
//! Renders fractal-temple at scene_scale=0.75 and checks the output is
//! full-resolution + non-black + has reasonable pixel variance.

#[test]
fn scene_scale_lod_renders_valid_frame() {
    let glsl_path = "/tmp/dead-air-glsl/fractal-temple.glsl";
    let glsl = match std::fs::read_to_string(glsl_path) {
        Ok(s) => s,
        Err(_) => {
            eprintln!("[scene-scale-lod] no fixture at {} — skipping. Run export-shaders.mts first.", glsl_path);
            return;
        }
    };

    let output_w = 1280u32;
    let output_h = 720u32;
    let scene_scale = 0.75f32;

    let mut renderer = pollster::block_on(
        dead_air_renderer::gpu::GpuRenderer::new_with_scene_scale(output_w, output_h, scene_scale)
    ).expect("init GPU with LOD");

    let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);
    let mut parser = naga::front::glsl::Frontend::default();
    let opts = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
    let module = parser.parse(&opts, &desktop).expect("parse");
    let info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    ).validate(&module).expect("validate");
    let wgsl = naga::back::wgsl::write_string(
        &module, &info, naga::back::wgsl::WriterFlags::empty(),
    ).expect("wgsl");

    let frag = renderer.device().create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("fractal_temple_lod"),
        source: wgpu::ShaderSource::Wgsl(wgsl.into()),
    });
    let pipeline = renderer.create_pipeline(&frag);

    let frame = sample_frame();
    let mut lighting = dead_air_renderer::uniforms::LightingState::default();
    let uniform_data = dead_air_renderer::uniforms::build_uniform_buffer(
        &frame, output_w, output_h, &mut lighting,
    );

    renderer.render_frame(&pipeline, &uniform_data, None, None, None, None, false);
    let pixels = renderer.read_pixels();

    // Output buffer must still be full-resolution.
    assert_eq!(
        pixels.len(),
        (output_w * output_h * 4) as usize,
        "readback should produce full-output pixel count regardless of scene_scale"
    );

    // Frame should not be all black (the renderer should have actually used the
    // smaller scene texture and upscaled to output dims).
    let mut sum = 0u64;
    let mut min_lum = 255u8;
    let mut max_lum = 0u8;
    for px in pixels.chunks(4) {
        let lum = ((px[0] as u32 + px[1] as u32 + px[2] as u32) / 3) as u8;
        sum += lum as u64;
        if lum < min_lum { min_lum = lum; }
        if lum > max_lum { max_lum = lum; }
    }
    let mean = sum as f64 / (output_w * output_h) as f64;
    let range = max_lum as i32 - min_lum as i32;

    println!("[scene-scale-lod] scale={} mean_lum={:.1} range={}", scene_scale, mean, range);
    assert!(mean > 4.0, "scene-scale render is essentially black (mean lum {:.1})", mean);
    assert!(range > 8, "scene-scale render is solid color (range {})", range);
}

fn sample_frame() -> dead_air_renderer::manifest::FrameData {
    dead_air_renderer::manifest::FrameData {
        shader_id: "fractal_temple".to_string(),
        frame: 0,
        secondary_shader_id: None,
        blend_progress: None,
        blend_mode: None,
        time: 12.0, dynamic_time: 12.0, beat_time: 12.0,
        musical_time: 0.3, tempo: 120.0,
        energy: 0.65, rms: 0.55, bass: 0.50, mids: 0.40, highs: 0.35,
        onset: 0.2, centroid: 0.5, beat: 0.0,
        slow_energy: 0.55, fast_energy: 0.60, fast_bass: 0.45,
        spectral_flux: 0.1, energy_accel: 0.0, energy_trend: 0.0,
        onset_snap: 0.0, beat_snap: 0.0, beat_confidence: 0.6,
        beat_stability: 0.7, downbeat: 0.0,
        drum_onset: 0.0, drum_beat: 0.0, stem_bass: 0.20, stem_drums: 0.15,
        vocal_energy: 0.10, vocal_presence: 0.3,
        other_energy: 0.20, other_centroid: 0.45,
        chroma_hue: 180.0, chroma_shift: 0.0, chord_index: 0.0,
        harmonic_tension: 0.2, melodic_pitch: 0.5, melodic_direction: 0.0,
        melodic_confidence: 0.5, chord_confidence: 0.6,
        section_type: 5.0, section_index: 0.0, section_progress: 0.3,
        climax_phase: 0.0, climax_intensity: 0.0, coherence: 0.0,
        jam_density: 0.5, jam_phase: 0.0, jam_progress: 0.3,
        energy_forecast: 0.0, peak_approaching: 0.0,
        tempo_derivative: 0.0, dynamic_range: 0.5, space_score: 0.0,
        timbral_brightness: 0.5, timbral_flux: 0.1,
        vocal_pitch: 0.0, vocal_pitch_confidence: 0.0, improvisation_score: 0.3,
        semantic_psychedelic: 0.3, semantic_cosmic: 0.4, semantic_aggressive: 0.1,
        semantic_tender: 0.2, semantic_rhythmic: 0.3, semantic_ambient: 0.3,
        semantic_chaotic: 0.1, semantic_triumphant: 0.1,
        palette_primary: 0.7, palette_secondary: 0.3, palette_saturation: 0.75,
        envelope_brightness: 1.05, envelope_saturation: 1.2, envelope_hue: 0.0,
        era_saturation: 1.0, era_brightness: 1.0, era_sepia: 0.0,
        show_warmth: 0.0, show_contrast: 1.0, show_saturation: 1.0,
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
