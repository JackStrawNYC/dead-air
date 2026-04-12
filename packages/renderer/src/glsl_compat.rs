//! GLSL compatibility layer — converts WebGL GLSL ES 1.00 to desktop GLSL 450.
//!
//! The Dead Air shaders are written for WebGL (Three.js/Remotion), which uses
//! GLSL ES 1.00 conventions. naga expects desktop GLSL 450. This module
//! transforms the source before compilation.
//!
//! Conversions:
//!   - Remove `precision highp float;` (not needed in desktop GLSL)
//!   - `varying` → `in` (fragment shader inputs)
//!   - `gl_FragColor = ...` → `out vec4 fragColor; ... fragColor = ...`
//!   - `texture2D(...)` → `texture(...)` (GLSL 450 syntax)
//!   - Add `#version 450` header
//!   - Strip `uniform sampler2D uPrevFrame;` if not used (naga strict mode)

/// Convert a WebGL GLSL ES fragment shader to desktop GLSL 450.
pub fn webgl_to_desktop(source: &str) -> String {
    let mut output = String::with_capacity(source.len() + 256);

    // Add version header
    output.push_str("#version 450\n\n");

    // Track if we need the fragColor output declaration
    let needs_frag_color = source.contains("gl_FragColor");

    if needs_frag_color {
        output.push_str("layout(location = 0) out vec4 fragColor;\n\n");
    }

    for line in source.lines() {
        let trimmed = line.trim();

        // Skip precision declarations (not valid in desktop GLSL)
        if trimmed.starts_with("precision ") {
            continue;
        }

        // Skip #version directives (we added our own)
        if trimmed.starts_with("#version") {
            continue;
        }

        let mut transformed = line.to_string();

        // varying → in (for fragment shader)
        if trimmed.starts_with("varying ") {
            transformed = transformed.replacen("varying ", "in ", 1);
        }

        // gl_FragColor → fragColor
        transformed = transformed.replace("gl_FragColor", "fragColor");

        // texture2D → texture
        transformed = transformed.replace("texture2D(", "texture(");

        // textureCube → texture (if any)
        transformed = transformed.replace("textureCube(", "texture(");

        output.push_str(&transformed);
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

void main() {
  vec3 col = vec3(vUv, sin(uTime));
  gl_FragColor = vec4(col, 1.0);
}
"#;

        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("#version 450"));
        assert!(desktop.contains("in vec2 vUv;"));
        assert!(desktop.contains("fragColor = vec4(col, 1.0);"));
        assert!(desktop.contains("layout(location = 0) out vec4 fragColor;"));
        assert!(!desktop.contains("precision highp"));
        assert!(!desktop.contains("gl_FragColor"));
        assert!(!desktop.contains("varying"));
    }

    #[test]
    fn test_texture2d_conversion() {
        let webgl = "vec4 c = texture2D(uTex, uv);";
        let desktop = webgl_to_desktop(webgl);
        assert!(desktop.contains("texture(uTex, uv)"));
        assert!(!desktop.contains("texture2D"));
    }
}
