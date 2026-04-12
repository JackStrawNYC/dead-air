//! GLSL compatibility layer — converts WebGL GLSL ES 1.00 to desktop GLSL 450.
//!
//! The Dead Air shaders are written for WebGL (Three.js/Remotion), which uses
//! GLSL ES 1.00 conventions. naga expects desktop GLSL 450. This module
//! transforms the source before compilation.
//!
//! Conversions:
//!   - Remove `precision highp float;`
//!   - `varying` → `in` (fragment shader inputs)
//!   - `gl_FragColor` → `out vec4 fragColor`
//!   - `texture2D(...)` → `texture(...)`
//!   - Add `#version 450` header
//!   - Convert individual `uniform float/vec2/vec3/vec4` → UBO block
//!   - Strip sampler2D uniforms (textures handled separately)

/// Check if a word appears as a standalone identifier in GLSL source.
/// Returns false for substrings (e.g., "ft" inside "ftMap" or "float").
fn is_word_used_in(source: &str, word: &str) -> bool {
    let bytes = source.as_bytes();
    let word_bytes = word.as_bytes();
    let wlen = word_bytes.len();

    for (i, window) in bytes.windows(wlen).enumerate() {
        if window == word_bytes {
            // Check character before: must be non-alphanumeric/underscore (or start of string)
            let before_ok = if i == 0 {
                true
            } else {
                let c = bytes[i - 1];
                !c.is_ascii_alphanumeric() && c != b'_'
            };

            // Check character after: must be non-alphanumeric/underscore (or end of string)
            let after_idx = i + wlen;
            let after_ok = if after_idx >= bytes.len() {
                true
            } else {
                let c = bytes[after_idx];
                !c.is_ascii_alphanumeric() && c != b'_'
            };

            if before_ok && after_ok {
                return true;
            }
        }
    }

    false
}

/// Fix captured locals in generated raymarching functions.
///
/// buildRaymarchNormal/AO/Shadow generate functions like:
///   vec3 ftCalcNormal(vec3 _rmp) { ... ftMap(_rmp, energy, bass, ft, psyche) ... }
/// where energy/bass/ft/psyche are locals in main() — valid in WebGL, invalid in GLSL 450.
///
/// Fix: declare these common locals as globals (float, initialized to 0.0).
/// In main(), the shader reassigns them before calling the generated functions,
/// so the globals act as "pass-through" values.
fn inject_global_captures(source: &str) -> String {
    // Variables commonly captured by generated raymarch functions
    let capture_candidates = [
        "energy", "bass", "ft", "psyche", "flowTime", "floodLevel",
        "melodicPitch", "eruptionScale", "geyserTime", "tension",
        "drumOnset", "slowE", "vocalP", "sJam", "sSpace",
        "sChorus", "sSolo", "climB", "spaceScore", "aggressive",
        "stability", "onset", "highs", "mids", "timbral",
        "timeVal", "energyVal", "bassVal", "midsVal", "vocalPresence",
        "drumOn", "climaxBoost", "coherence",
    ];

    // Detect which of these are used by a generated function (has _rmp param)
    // but defined as local in main()
    let lines: Vec<&str> = source.lines().collect();
    let mut in_generated_func = false;
    let mut generated_func_body = String::new();
    let mut depth = 0;

    for line in &lines {
        let trimmed = line.trim();
        if (trimmed.starts_with("vec3 ") || trimmed.starts_with("float "))
            && trimmed.contains("(vec3 _rmp")
            && trimmed.contains('{')
        {
            in_generated_func = true;
            depth = 1;
            generated_func_body.push_str(trimmed);
            continue;
        }
        if in_generated_func {
            for ch in trimmed.chars() {
                if ch == '{' { depth += 1; }
                if ch == '}' { depth -= 1; }
            }
            generated_func_body.push_str(trimmed);
            generated_func_body.push(' ');
            if depth <= 0 {
                in_generated_func = false;
            }
        }
    }

    if generated_func_body.is_empty() {
        return source.to_string();
    }

    // Find which candidates are actually used in the generated function body
    let mut needed_globals: Vec<&str> = Vec::new();
    for var in &capture_candidates {
        // Check if used in generated function body with word-boundary awareness.
        // A variable like "ft" must not match inside "ftMap" or "float".
        // Use patterns that ensure the char AFTER the variable is non-alphanumeric.
        let is_used = is_word_used_in(&generated_func_body, var);

        if is_used {
            // Only inject if it's NOT already a uniform (would conflict)
            let uniform_decl = format!("uniform float {};", var);
            if !source.contains(&uniform_decl) {
                needed_globals.push(var);
            }
        }
    }

    if needed_globals.is_empty() {
        return source.to_string();
    }

    // Inject global declarations BEFORE the generated functions.
    // We also need to convert `float energy = ...` in main() to `energy = ...` (assignment, not declaration)
    // for the variables we've made global.
    let mut output = String::with_capacity(source.len() + 512);
    let mut globals_injected = false;
    let mut in_main = false;
    let mut main_depth = 0;

    for line in &lines {
        let trimmed = line.trim();

        // Inject globals right before the first generated function
        if !globals_injected
            && (trimmed.starts_with("vec3 ") || trimmed.starts_with("float "))
            && trimmed.contains("(vec3 _rmp")
        {
            output.push_str("// [compat] globals for generated function captures\n");
            for var in &needed_globals {
                output.push_str(&format!("float {} = 0.0;\n", var));
            }
            output.push('\n');
            globals_injected = true;
        }

        // Track when we're inside main()
        if trimmed == "void main() {" || trimmed.starts_with("void main()") {
            in_main = true;
            main_depth = 0;
        }
        if in_main {
            for ch in trimmed.chars() {
                if ch == '{' { main_depth += 1; }
                if ch == '}' { main_depth -= 1; }
            }
            if main_depth <= 0 && trimmed.contains('}') {
                in_main = false;
            }
        }

        // Convert local declarations to assignments ONLY inside main()
        let mut modified = line.to_string();
        if in_main {
            for var in &needed_globals {
                let local_decl = format!("float {} = ", var);
                let assignment = format!("{} = ", var);
                if trimmed.starts_with(&local_decl) {
                    modified = modified.replace(&local_decl, &assignment);
                    break;
                }
            }
        }

        output.push_str(&modified);
        output.push('\n');
    }

    output
}

/// Convert a WebGL GLSL ES fragment shader to desktop GLSL 450 with UBO.
pub fn webgl_to_desktop(source: &str) -> String {
    // First pass: fix captured locals in generated raymarching functions
    let source = inject_global_captures(source);
    let mut uniform_lines: Vec<String> = Vec::new();
    let mut body_lines: Vec<String> = Vec::new();
    let needs_frag_color = source.contains("gl_FragColor");

    for line in source.lines() {
        let trimmed = line.trim();

        // Skip precision declarations
        if trimmed.starts_with("precision ") {
            continue;
        }

        // Skip existing #version directives
        if trimmed.starts_with("#version") {
            continue;
        }

        // Collect uniform declarations (non-sampler) into UBO
        if trimmed.starts_with("uniform ") && !trimmed.contains("sampler") {
            // Extract the type and name: "uniform float uBass;" → "  float uBass;"
            let decl = trimmed
                .strip_prefix("uniform ")
                .unwrap_or(trimmed)
                .to_string();
            uniform_lines.push(format!("  {}", decl));
            continue;
        }

        // Skip sampler uniforms entirely (textures not supported in basic renderer)
        if trimmed.starts_with("uniform ") && trimmed.contains("sampler") {
            continue;
        }

        let mut transformed = line.to_string();

        // varying → in (fragment shader)
        if trimmed.starts_with("varying ") {
            transformed = transformed.replacen("varying ", "in ", 1);
        }

        // gl_FragColor → fragColor
        transformed = transformed.replace("gl_FragColor", "fragColor");

        // texture2D → texture
        transformed = transformed.replace("texture2D(", "texture(");

        // textureCube → texture
        transformed = transformed.replace("textureCube(", "texture(");

        body_lines.push(transformed);
    }

    // Build output
    let mut output = String::with_capacity(source.len() + 1024);

    output.push_str("#version 450\n\n");

    if needs_frag_color {
        output.push_str("layout(location = 0) out vec4 fragColor;\n\n");
    }

    // Emit UBO block if we have uniforms
    if !uniform_lines.is_empty() {
        output.push_str("layout(set = 0, binding = 0) uniform Uniforms {\n");
        for u in &uniform_lines {
            output.push_str(u);
            output.push('\n');
        }
        output.push_str("};\n\n");
    }

    // Emit rest of shader
    for line in &body_lines {
        output.push_str(line);
        output.push('\n');
    }

    output
}

/// Convert a WebGL GLSL ES vertex shader to desktop GLSL 450.
pub fn webgl_vertex_to_desktop(source: &str) -> String {
    let mut output = String::with_capacity(source.len() + 256);

    output.push_str("#version 450\n\n");

    for line in source.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("precision ") {
            continue;
        }

        if trimmed.starts_with("#version") {
            continue;
        }

        let mut transformed = line.to_string();

        // attribute → in
        if trimmed.starts_with("attribute ") {
            transformed = transformed.replacen("attribute ", "in ", 1);
        }

        // varying → out (for vertex shader)
        if trimmed.starts_with("varying ") {
            transformed = transformed.replacen("varying ", "out ", 1);
        }

        output.push_str(&transformed);
        output.push('\n');
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_conversion() {
        let webgl = r#"
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uEnergy;

void main() {
  vec3 col = vec3(vUv, sin(uTime) * uEnergy);
  gl_FragColor = vec4(col, 1.0);
}
"#;

        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("#version 450"));
        assert!(desktop.contains("in vec2 vUv;"));
        assert!(desktop.contains("fragColor = vec4(col, 1.0);"));
        assert!(desktop.contains("layout(location = 0) out vec4 fragColor;"));
        assert!(desktop.contains("layout(set = 0, binding = 0) uniform Uniforms {"));
        assert!(desktop.contains("  float uTime;"));
        assert!(desktop.contains("  float uEnergy;"));
        assert!(!desktop.contains("precision highp"));
        assert!(!desktop.contains("gl_FragColor"));
        assert!(!desktop.contains("varying"));
        // Uniforms should NOT appear as individual declarations
        assert!(!desktop.contains("uniform float"));
    }

    #[test]
    fn test_texture2d_conversion() {
        let webgl = "vec4 c = texture2D(uTex, uv);";
        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("texture(uTex, uv)"));
        assert!(!desktop.contains("texture2D"));
    }

    #[test]
    fn test_sampler_stripped() {
        let webgl = r#"
uniform float uTime;
uniform sampler2D uPrevFrame;
uniform float uEnergy;
void main() { fragColor = vec4(uTime); }
"#;

        let desktop = webgl_to_desktop(webgl);
        // Sampler should be stripped
        assert!(!desktop.contains("sampler2D"));
        assert!(!desktop.contains("uPrevFrame"));
        // Value uniforms should be in UBO
        assert!(desktop.contains("  float uTime;"));
        assert!(desktop.contains("  float uEnergy;"));
    }

    #[test]
    fn test_ubo_block_structure() {
        let webgl = r#"
uniform float uBass;
uniform vec2 uResolution;
uniform vec3 uCamPos;
void main() {}
"#;

        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("layout(set = 0, binding = 0) uniform Uniforms {"));
        assert!(desktop.contains("  float uBass;"));
        assert!(desktop.contains("  vec2 uResolution;"));
        assert!(desktop.contains("  vec3 uCamPos;"));
        assert!(desktop.contains("};"));
    }
}
