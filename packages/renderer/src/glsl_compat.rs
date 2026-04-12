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

/// Convert a WebGL GLSL ES fragment shader to desktop GLSL 450 with UBO.
pub fn webgl_to_desktop(source: &str) -> String {
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
