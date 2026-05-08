//! Benchmark: render 300 frames of protean-clouds and measure fps.
//! This answers the question: is 60fps rendering feasible?

#[test]
fn test_benchmark_300_frames() {
    let glsl_path = "/tmp/dead-air-glsl/protean-clouds.glsl";
    let glsl = match std::fs::read_to_string(glsl_path) {
        Ok(s) => s,
        Err(_) => { eprintln!("Run export-shaders.mts first"); return; }
    };

    let width = 3840u32;  // 4K
    let height = 2160u32;

    // Init GPU
    let mut renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(width, height))
        .expect("GPU init failed");
    println!("GPU: {}", renderer.adapter_name());

    // Compile shader
    let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);
    let mut parser = naga::front::glsl::Frontend::default();
    let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
    let module = parser.parse(&options, &desktop).expect("Parse failed");
    let info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    ).validate(&module).expect("Validation failed");
    let wgsl = naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty()).unwrap();
    let fragment_module = renderer.device().create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("protean_clouds"),
        source: wgpu::ShaderSource::Wgsl(wgsl.into()),
    });
    let pipeline = renderer.create_pipeline(&fragment_module);
    println!("Shader compiled. Rendering 300 frames at {}x{}...\n", width, height);

    let total_frames = 300u32;
    let fps_target = 60.0f32;

    // Pre-build all frame data (don't count this in render time)
    let frame_datas: Vec<_> = (0..total_frames).map(|i| {
        let t = i as f32 / fps_target;
        let energy = 0.3 + (i as f32 / total_frames as f32) * 0.4; // ramp 0.3 → 0.7
        dead_air_renderer::manifest::FrameData {
            shader_id: "protean_clouds".into(),
            frame: i,
            secondary_shader_id: None,
            blend_progress: None,
            blend_mode: None,
            time: t,
            dynamic_time: t,
            beat_time: t,
            musical_time: (t * 2.0) % 1.0,
            tempo: 120.0,
            energy,
            rms: energy * 0.8,
            bass: energy * 0.85,
            mids: energy * 0.55,
            highs: energy * 0.45,
            onset: if i % 30 == 0 { 0.8 } else { 0.0 },
            centroid: 0.45,
            beat: if i % 30 == 0 { 1.0 } else { 0.0 },
            slow_energy: energy * 0.9,
            fast_energy: energy,
            fast_bass: energy * 0.8,
            spectral_flux: 0.12,
            energy_accel: 0.0,
            energy_trend: 0.01,
            onset_snap: if i % 30 == 0 { 0.6 } else { 0.0 },
            beat_snap: if i % 30 == 0 { 0.5 } else { 0.0 },
            beat_confidence: 0.7,
            beat_stability: 0.7,
            downbeat: 0.0,
            drum_onset: if i % 30 == 0 { 0.5 } else { 0.0 },
            drum_beat: 0.0,
            stem_bass: energy * 0.6,
            stem_drums: 0.2,
            vocal_energy: 0.1,
            vocal_presence: 0.3,
            other_energy: 0.2,
            other_centroid: 0.5,
            chroma_hue: 30.0 + i as f32 * 0.5,
            chroma_shift: 0.0,
            chord_index: 0.0,
            harmonic_tension: 0.2,
            melodic_pitch: 0.5,
            melodic_direction: 0.0,
            melodic_confidence: 0.5,
            chord_confidence: 0.6,
            section_type: 5.0,
            section_index: 0.0,
            section_progress: i as f32 / total_frames as f32,
            climax_phase: 0.0,
            climax_intensity: 0.0,
            coherence: 0.0,
            jam_density: 0.5,
            jam_phase: 1.0,
            jam_progress: i as f32 / total_frames as f32,
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
            semantic_aggressive: 0.1,
            semantic_tender: 0.2,
            semantic_rhythmic: 0.3,
            semantic_ambient: 0.3,
            semantic_chaotic: 0.1,
            semantic_triumphant: 0.1,
            palette_primary: 0.08,
            palette_secondary: 0.55,
            palette_saturation: 0.85,
            envelope_brightness: 0.95,
            envelope_saturation: 1.1,
            envelope_hue: 0.0,
            era_saturation: 1.05,
            era_brightness: 1.0,
            era_sepia: 0.0,
            show_warmth: 0.0,
            show_contrast: 1.0,
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
            show_progress: None, era_black_lift: None, era_contrast_scale: None,
            effect_mode: 0,
            effect_intensity: 0.0,
            composited_mode: 0,
            composited_intensity: 0.0,
            show_position: 0.5,
            camera_behavior: 0,
        }
    }).collect();

    // ═══ BENCHMARK: GPU render only (no disk I/O) ═══
    let start_gpu = std::time::Instant::now();
    for frame in &frame_datas {
        let uniform_data = dead_air_renderer::uniforms::build_uniform_buffer(frame, width, height, &mut dead_air_renderer::uniforms::LightingState::default());
        renderer.render_frame(&pipeline, &uniform_data, None, None, None, None, false);
        // Read pixels back (required to actually execute the GPU work)
        let _pixels = renderer.read_pixels();
    }
    let gpu_elapsed = start_gpu.elapsed();
    let gpu_fps = total_frames as f64 / gpu_elapsed.as_secs_f64();
    let gpu_ms_per_frame = gpu_elapsed.as_secs_f64() * 1000.0 / total_frames as f64;

    // ═══ BENCHMARK: GPU render + PNG save ═══
    let out_dir = "/tmp/dead-air-benchmark";
    std::fs::create_dir_all(out_dir).unwrap();

    let start_full = std::time::Instant::now();
    for (i, frame) in frame_datas.iter().enumerate() {
        let uniform_data = dead_air_renderer::uniforms::build_uniform_buffer(frame, width, height, &mut dead_air_renderer::uniforms::LightingState::default());
        renderer.render_frame(&pipeline, &uniform_data, None, None, None, None, false);
        let pixels = renderer.read_pixels();
        image::save_buffer(
            format!("{}/frame_{:05}.png", out_dir, i),
            &pixels,
            width, height,
            image::ColorType::Rgba8,
        ).unwrap();
    }
    let full_elapsed = start_full.elapsed();
    let full_fps = total_frames as f64 / full_elapsed.as_secs_f64();
    let full_ms_per_frame = full_elapsed.as_secs_f64() * 1000.0 / total_frames as f64;

    // ═══ RESULTS ═══
    println!("============================================================");
    println!("BENCHMARK RESULTS — Protean Clouds @ 4K (3840x2160)");
    println!("============================================================");
    println!("GPU render only:    {:.1} fps ({:.1} ms/frame)", gpu_fps, gpu_ms_per_frame);
    println!("GPU + PNG save:     {:.1} fps ({:.1} ms/frame)", full_fps, full_ms_per_frame);
    println!("");
    println!("Remotion comparison: ~0.4 fps (2500 ms/frame)");
    println!("Speedup (GPU only): {:.0}x", gpu_fps / 0.4);
    println!("Speedup (full):     {:.0}x", full_fps / 0.4);
    println!("");

    // Project to full show
    let show_frames_60fps = 3.0 * 3600.0 * 60.0; // 3 hours at 60fps
    let show_hours_rust = show_frames_60fps / full_fps / 3600.0;
    let show_hours_remotion = show_frames_60fps / 0.4 / 3600.0;
    println!("3-hour show at 60fps ({:.0} frames):", show_frames_60fps);
    println!("  Rust renderer:   {:.1} hours", show_hours_rust);
    println!("  Remotion:        {:.0} hours ({:.0} days)", show_hours_remotion, show_hours_remotion / 24.0);
    println!("============================================================");

    // Clean up
    std::fs::remove_dir_all(out_dir).ok();
}
