//! End-to-end test: render shader + composite SVG overlay.
//! Proves the full pipeline: GLSL shader → GPU → pixels + SVG → resvg → composite → PNG

#[test]
fn test_render_with_overlay() {
    let glsl_path = "/tmp/dead-air-glsl/protean-clouds.glsl";
    let glsl = match std::fs::read_to_string(glsl_path) {
        Ok(s) => s,
        Err(_) => { eprintln!("Run export-shaders.mts first"); return; }
    };

    let width = 1280u32;
    let height = 720u32;

    // Render shader
    let mut renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(width, height))
        .expect("GPU init failed");

    let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);
    let mut parser = naga::front::glsl::Frontend::default();
    let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
    let module = parser.parse(&options, &desktop).expect("Parse failed");
    let info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    ).validate(&module).expect("Validation failed");
    let wgsl = naga::back::wgsl::write_string(&module, &info, naga::back::wgsl::WriterFlags::empty()).unwrap();
    let frag_mod = renderer.device().create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("protean_clouds"),
        source: wgpu::ShaderSource::Wgsl(wgsl.into()),
    });
    let pipeline = renderer.create_pipeline(&frag_mod);

    // Build frame data
    let frame = dead_air_renderer::manifest::FrameData {
        shader_id: "protean_clouds".into(),
        frame: 0,
        secondary_shader_id: None,
        blend_progress: None,
        blend_mode: None,
        time: 8.0, dynamic_time: 8.0, beat_time: 8.0, musical_time: 0.3, tempo: 120.0,
        energy: 0.50, rms: 0.40, bass: 0.45, mids: 0.35, highs: 0.30,
        onset: 0.1, centroid: 0.45, beat: 0.0,
        slow_energy: 0.45, fast_energy: 0.50, fast_bass: 0.40,
        spectral_flux: 0.12, energy_accel: 0.0, energy_trend: 0.0,
        onset_snap: 0.1, beat_snap: 0.0, beat_confidence: 0.7, beat_stability: 0.7,
        downbeat: 0.0, drum_onset: 0.0, drum_beat: 0.0,
        stem_bass: 0.35, stem_drums: 0.2, vocal_energy: 0.15, vocal_presence: 0.3,
        other_energy: 0.2, other_centroid: 0.5,
        chroma_hue: 30.0, chroma_shift: 0.0,
        chord_index: 0.0, harmonic_tension: 0.2, melodic_pitch: 0.5,
        melodic_direction: 0.0, melodic_confidence: 0.5, chord_confidence: 0.6,
        section_type: 5.0, section_index: 0.0, section_progress: 0.4,
        climax_phase: 0.0, climax_intensity: 0.0, coherence: 0.0,
        jam_density: 0.5, jam_phase: 1.0, jam_progress: 0.4,
        energy_forecast: 0.0, peak_approaching: 0.0,
        tempo_derivative: 0.0, dynamic_range: 0.5, space_score: 0.0,
        timbral_brightness: 0.5, timbral_flux: 0.1,
        vocal_pitch: 0.0, vocal_pitch_confidence: 0.0, improvisation_score: 0.3,
        semantic_psychedelic: 0.3, semantic_cosmic: 0.2, semantic_aggressive: 0.1,
        semantic_tender: 0.2, semantic_rhythmic: 0.3, semantic_ambient: 0.3,
        semantic_chaotic: 0.1, semantic_triumphant: 0.1,
        palette_primary: 0.08, palette_secondary: 0.55, palette_saturation: 0.85,
        envelope_brightness: 0.95, envelope_saturation: 1.1, envelope_hue: 0.0,
        era_saturation: 1.05, era_brightness: 1.0, era_sepia: 0.0,
        show_warmth: 0.0, show_contrast: 1.0, show_saturation: 1.0,
        show_grain: 1.0, show_bloom: 1.0,
        param_bass_scale: 1.0, param_energy_scale: 1.0, param_motion_speed: 1.0,
        param_color_sat_bias: 0.0, param_complexity: 1.0,
        param_drum_reactivity: 1.0, param_vocal_weight: 1.0,
        peak_of_show: 0.0,
    };

    let uniforms = dead_air_renderer::uniforms::build_uniform_buffer(&frame, width, height);
    renderer.render_frame(&pipeline, &uniforms);
    let mut pixels = renderer.read_pixels();
    println!("Shader rendered: {} pixels", pixels.len() / 4);

    // ─── Create overlay SVGs ───
    // Simulating what the Node.js manifest generator would produce

    // Overlay 1: Steal Your Face circle (simplified)
    let cx = width / 2;
    let cy = height / 2;
    let stealie_svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\">\
         <defs><radialGradient id=\"halo\">\
         <stop offset=\"0%\" stop-color=\"rgb(153,68,255)\" stop-opacity=\"0.6\"/>\
         <stop offset=\"100%\" stop-color=\"rgb(102,0,204)\" stop-opacity=\"0\"/>\
         </radialGradient></defs>\
         <circle cx=\"{}\" cy=\"{}\" r=\"280\" fill=\"url(#halo)\"/>\
         <circle cx=\"{}\" cy=\"{}\" r=\"140\" fill=\"none\" stroke=\"rgb(232,216,160)\" stroke-width=\"5\"/>\
         <clipPath id=\"left\"><rect x=\"0\" y=\"0\" width=\"{}\" height=\"{}\"/></clipPath>\
         <circle cx=\"{}\" cy=\"{}\" r=\"130\" fill=\"rgb(204,51,68)\" clip-path=\"url(#left)\"/>\
         <clipPath id=\"right\"><rect x=\"{}\" y=\"0\" width=\"{}\" height=\"{}\"/></clipPath>\
         <circle cx=\"{}\" cy=\"{}\" r=\"130\" fill=\"rgb(51,85,170)\" clip-path=\"url(#right)\"/>\
         <polygon points=\"{},{} {},{} {},{} {},{} {},{} {},{} {},{} {},{} {},{} {},{}\" \
          fill=\"rgb(255,224,64)\" stroke=\"rgb(255,136,0)\" stroke-width=\"2\"/>\
         <line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" stroke=\"rgb(232,216,160)\" stroke-width=\"3\"/>\
         </svg>",
        width, height,
        cx, cy,               // halo
        cx, cy,               // ring
        cx, height,            // left clip
        cx, cy,               // left fill
        cx, cx, height,        // right clip
        cx, cy,               // right fill
        // Bolt points
        cx+5, cy-120, cx-20, cy-20, cx+5, cy-20,
        cx-25, cy+20, cx-5, cy+20, cx-30, cy+120,
        cx+20, cy+10, cx-5, cy+10, cx+25, cy-30, cx+5, cy-30,
        // Divider
        cx-130, cy, cx+130, cy,
    );

    // Overlay 2: Dancing stars
    let mut stars_svg = format!(r#"<svg xmlns="http://www.w3.org/2000/svg" width="{}" height="{}">"#, width, height);
    for i in 0..60 {
        let x = ((i * 73 + 17) % width as usize) as f32;
        let y = ((i * 47 + 31) % height as usize) as f32;
        let r = 1.0 + (i % 5) as f32 * 0.8;
        let opacity = 0.3 + (i % 3) as f32 * 0.2;
        stars_svg.push_str(&format!(
            r#"<circle cx="{:.0}" cy="{:.0}" r="{:.1}" fill="white" opacity="{:.1}"/>"#,
            x, y, r, opacity
        ));
    }
    stars_svg.push_str("</svg>");

    // Composite overlays
    let layers = vec![
        dead_air_renderer::compositor::OverlayLayer {
            svg: stars_svg,
            opacity: 0.6,
            blend_mode: dead_air_renderer::compositor::BlendMode::Screen,
            z_order: 1,
        },
        dead_air_renderer::compositor::OverlayLayer {
            svg: stealie_svg,
            opacity: 0.45,
            blend_mode: dead_air_renderer::compositor::BlendMode::Screen,
            z_order: 2,
        },
    ];

    dead_air_renderer::compositor::composite_layers(&mut pixels, &layers, width, height);
    println!("Overlays composited: {} layers", layers.len());

    // Save
    let output_path = "/tmp/dead-air-shader-plus-overlay.png";
    image::save_buffer(output_path, &pixels, width, height, image::ColorType::Rgba8).unwrap();
    println!("Output: {}", output_path);

    // Open
    let _ = std::process::Command::new("open").arg(output_path).spawn();
}
