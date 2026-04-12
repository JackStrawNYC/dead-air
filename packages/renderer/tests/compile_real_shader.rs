//! Integration test: compile a real Dead Air shader through the full pipeline.
//!
//! This test loads a minimal but representative GLSL fragment shader
//! (simulating what the manifest generator would produce after resolving
//! all template literals) and verifies it compiles through:
//!   WebGL GLSL → glsl_compat → naga parse → naga validate → WGSL output

#[test]
fn test_compile_minimal_shader() {
    // A minimal fragment shader that exercises the patterns used by Dead Air shaders:
    // - Individual uniform declarations (will be converted to UBO)
    // - precision highp float (will be stripped)
    // - varying (will become `in`)
    // - gl_FragColor (will become fragColor)
    // - Standard math functions (sin, cos, smoothstep, mix, clamp)
    // - FBM-style noise (simplified)
    let webgl_glsl = r#"
precision highp float;

uniform float uTime;
uniform float uEnergy;
uniform float uBass;
uniform float uSlowEnergy;
uniform vec2 uResolution;

varying vec2 vUv;

float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
        f.z
    );
}

void main() {
    vec2 uv = vUv;
    vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

    float energy = clamp(uEnergy, 0.0, 1.0);
    float bass = clamp(uBass, 0.0, 1.0);

    // Raymarching-style distance calculation
    float t = uTime * (0.03 + uSlowEnergy * 0.09);
    vec3 ro = vec3(sin(t) * 0.2, cos(t) * 0.1, t * 3.0);
    vec3 rd = normalize(vec3(p, 0.85));

    float td = 0.0;
    vec3 col = vec3(0.0);

    for (int i = 0; i < 64; i++) {
        vec3 pos = ro + rd * td;
        float n = noise(pos * 2.0 + vec3(0.0, 0.0, t));
        float d = length(pos.xy) - (1.0 + bass * 0.35) + n * 0.3;

        if (abs(d) < 0.003) {
            col = vec3(0.5 + energy * 0.5, 0.3, 0.2) * (0.7 + energy * 0.6);
            break;
        }

        td += d * 0.7;
        if (td > 12.0) break;
    }

    // Simple post-processing
    float vig = 1.0 - dot(p * 0.9, p * 0.9);
    col *= smoothstep(0.0, 1.0, vig);
    col = clamp(col, vec3(0.0), vec3(2.0));

    gl_FragColor = vec4(col, 1.0);
}
"#;

    // Step 1: Convert WebGL GLSL → desktop GLSL 450
    let desktop_glsl = dead_air_renderer::glsl_compat::webgl_to_desktop(webgl_glsl);

    // Verify conversion happened
    assert!(desktop_glsl.contains("#version 450"), "Missing version header");
    assert!(desktop_glsl.contains("layout(set = 0, binding = 0) uniform Uniforms {"), "Missing UBO block");
    assert!(desktop_glsl.contains("  float uTime;"), "Missing uTime in UBO");
    assert!(desktop_glsl.contains("  vec2 uResolution;"), "Missing uResolution in UBO");
    assert!(!desktop_glsl.contains("precision highp"), "precision not stripped");
    assert!(!desktop_glsl.contains("gl_FragColor"), "gl_FragColor not converted");

    // Step 2: Parse through naga
    let mut parser = naga::front::glsl::Frontend::default();
    let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);

    let module = parser.parse(&options, &desktop_glsl).unwrap_or_else(|e| {
        eprintln!("=== GLSL that failed to parse ===");
        for (i, line) in desktop_glsl.lines().enumerate() {
            eprintln!("{:4}: {}", i + 1, line);
        }
        eprintln!("=== Parse errors ===");
        for err in &e.errors {
            eprintln!("  {}", err);
        }
        panic!("naga GLSL parse failed");
    });

    // Step 3: Validate
    let info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    )
    .validate(&module)
    .unwrap_or_else(|e| {
        panic!("naga validation failed: {}", e);
    });

    // Step 4: Generate WGSL
    let wgsl = naga::back::wgsl::write_string(
        &module,
        &info,
        naga::back::wgsl::WriterFlags::empty(),
    )
    .unwrap_or_else(|e| {
        panic!("WGSL generation failed: {}", e);
    });

    // Verify WGSL output has expected structure
    assert!(wgsl.contains("fn main"), "Missing main function in WGSL");
    assert!(!wgsl.is_empty(), "Empty WGSL output");

    println!("=== Compilation successful! ===");
    println!("WGSL output: {} bytes", wgsl.len());
}
