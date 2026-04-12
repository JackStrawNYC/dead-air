//! Test that WGSL texture injection works end-to-end.
//! Verifies that shaders using uPrevFrame get real textureSample calls
//! in the generated WGSL, not stub constants.

#[test]
fn test_stub_function_in_glsl_output() {
    // Simulate a simple shader that reads from uPrevFrame
    let webgl_glsl = r#"
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uEnergy;
uniform sampler2D uPrevFrame;

void main() {
    vec4 prev = texture(uPrevFrame, vUv);
    vec3 col = prev.rgb * uEnergy + vec3(vUv, sin(uTime));
    gl_FragColor = vec4(col, 1.0);
}
"#;

    // Step 1: Detect texture needs
    let info = dead_air_renderer::glsl_compat::extract_sampler_names(webgl_glsl);
    assert!(info.needs_prev_frame, "Should detect uPrevFrame usage");
    assert!(!info.needs_fft, "Should not detect uFFTTexture");

    // Step 2: Convert to desktop GLSL
    let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(webgl_glsl);

    // Verify stub function was injected
    assert!(
        desktop.contains("_deadair_sample_prev"),
        "Should contain stub function call. Got:\n{}",
        &desktop[..desktop.len().min(500)]
    );

    // Verify sampler declaration was stripped
    assert!(
        !desktop.contains("sampler2D"),
        "sampler2D should be stripped from GLSL output"
    );

    // Verify stub function definition exists
    assert!(
        desktop.contains("vec4 _deadair_sample_prev(vec2 uv)"),
        "Stub function definition should be injected"
    );

    // Step 3: Compile through naga
    let mut parser = naga::front::glsl::Frontend::default();
    let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
    let module = parser.parse(&options, &desktop).unwrap_or_else(|e| {
        panic!("GLSL parse failed: {:?}", e.errors.iter().map(|e| format!("{}", e)).collect::<Vec<_>>());
    });

    let naga_info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    ).validate(&module).expect("Validation failed");

    let wgsl = naga::back::wgsl::write_string(
        &module,
        &naga_info,
        naga::back::wgsl::WriterFlags::empty(),
    ).expect("WGSL generation failed");

    // Step 4: Verify stub function survived naga compilation
    assert!(
        wgsl.contains("_deadair_sample_prev"),
        "Stub function should survive naga compilation. WGSL:\n{}",
        &wgsl[..wgsl.len().min(800)]
    );

    // Step 5: Simulate the WGSL injection that shader_cache.rs would do
    // (We can't call shader_cache directly without a GPU, but we can test the injection logic)
    let injected = inject_test_bindings(&wgsl);

    assert!(
        injected.contains("@group(1) @binding(1) var u_prev_frame"),
        "Should inject texture binding declaration"
    );
    assert!(
        injected.contains("textureSample(u_prev_frame"),
        "Should replace stub body with real textureSample. Injected:\n{}",
        &injected[..injected.len().min(1000)]
    );
}

/// Replicate the injection logic from shader_cache.rs for testing
fn inject_test_bindings(wgsl: &str) -> String {
    let mut result = String::with_capacity(wgsl.len() + 512);

    // Inject declarations
    result.push_str("@group(1) @binding(0) var u_tex_sampler: sampler;\n");
    result.push_str("@group(1) @binding(1) var u_prev_frame: texture_2d<f32>;\n\n");

    // Find and replace the stub function body
    let func_name = "_deadair_sample_prev";
    let search = format!("fn {}(", func_name);

    if let Some(func_start) = wgsl.find(&search) {
        // Extract parameter name
        let sig_start = func_start + search.len();
        let param_name = if let Some(colon_offset) = wgsl[sig_start..].find(':') {
            wgsl[sig_start..sig_start + colon_offset].trim()
        } else {
            "uv"
        };

        // Find function body braces
        if let Some(brace_rel) = wgsl[func_start..].find('{') {
            let body_start = func_start + brace_rel;
            let mut depth = 0;
            let mut body_end = body_start;
            for (i, c) in wgsl[body_start..].char_indices() {
                if c == '{' { depth += 1; }
                if c == '}' { depth -= 1; }
                if depth == 0 { body_end = body_start + i; break; }
            }

            result.push_str(&wgsl[..body_start]);
            result.push_str(&format!("{{\n    return textureSample(u_prev_frame, u_tex_sampler, {});\n}}", param_name));
            result.push_str(&wgsl[body_end + 1..]);
        } else {
            result.push_str(wgsl);
        }
    } else {
        result.push_str(wgsl);
    }

    result
}
