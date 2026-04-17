//! Shader cache — compiles GLSL fragment shaders to wgpu render pipelines.
//!
//! Uses naga to parse GLSL → naga IR → WGSL, then creates wgpu shader modules.
//! For shaders that need textures (uPrevFrame, uFFTTexture), injects real texture
//! sampling into the generated WGSL and creates pipelines with texture bind groups.

use std::collections::HashMap;

use crate::glsl_compat;
use crate::gpu::GpuRenderer;

/// Compiled shader with metadata about its texture requirements.
pub struct ShaderInfo {
    pub pipeline: wgpu::RenderPipeline,
    pub texture_info: glsl_compat::ShaderTextureInfo,
}

pub struct ShaderCache {
    shaders: HashMap<String, ShaderInfo>,
}

impl ShaderCache {
    pub fn new() -> Self {
        Self {
            shaders: HashMap::new(),
        }
    }

    /// Compile a GLSL fragment shader and create a wgpu render pipeline.
    ///
    /// For shaders using uPrevFrame or uFFTTexture, injects real texture sampling
    /// into the WGSL output and creates a pipeline with texture bind group support.
    pub fn compile(
        &mut self,
        renderer: &GpuRenderer,
        shader_id: &str,
        glsl_source: &str,
    ) -> Result<(), String> {
        // Detect texture requirements BEFORE conversion (stubs replace the names)
        let texture_info = glsl_compat::extract_sampler_names(glsl_source);
        let needs_textures = texture_info.needs_prev_frame || texture_info.needs_fft;

        // Convert WebGL GLSL ES → desktop GLSL 450
        let desktop_glsl = glsl_compat::webgl_to_desktop(glsl_source);

        // Parse GLSL → naga IR
        let mut parser = naga::front::glsl::Frontend::default();
        let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);

        let module = parser
            .parse(&options, &desktop_glsl)
            .map_err(|errors| {
                let msgs: Vec<String> = errors.errors.iter().map(|e| format!("{}", e)).collect();
                format!("GLSL parse error in {}: {}", shader_id, msgs.join("; "))
            })?;

        // Validate
        let info = naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        )
        .validate(&module)
        .map_err(|e| format!("Validation error in {}: {}", shader_id, e))?;

        // Generate WGSL
        let mut wgsl = naga::back::wgsl::write_string(
            &module,
            &info,
            naga::back::wgsl::WriterFlags::empty(),
        )
        .map_err(|e| format!("WGSL generation error in {}: {}", shader_id, e))?;

        // For texture-using shaders: inject real texture bindings into WGSL
        if needs_textures {
            wgsl = inject_texture_bindings(
                &wgsl,
                texture_info.needs_prev_frame,
                texture_info.needs_fft,
            );
        }

        // Create wgpu shader module from WGSL
        let fragment_module =
            renderer
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some(shader_id),
                    source: wgpu::ShaderSource::Wgsl(wgsl.into()),
                });

        // Create render pipeline with appropriate bind group layout
        let pipeline = if needs_textures {
            renderer.create_pipeline_with_textures(&fragment_module)
        } else {
            renderer.create_pipeline(&fragment_module)
        };

        self.shaders.insert(shader_id.to_string(), ShaderInfo {
            pipeline,
            texture_info,
        });

        Ok(())
    }

    /// Get full shader info (pipeline + texture requirements) by shader_id.
    pub fn get_shader_info(&self, shader_id: &str) -> Option<&ShaderInfo> {
        self.shaders.get(shader_id)
    }
}

/// Inject real texture/sampler declarations and replace stub function bodies
/// in the naga-generated WGSL output.
///
/// The GLSL compat layer creates stub functions like:
///   fn _deadair_sample_prev(uv: vec2<f32>) -> vec4<f32> { return vec4(0.05, ...); }
///
/// This function replaces them with real texture sampling:
///   fn _deadair_sample_prev(uv: vec2<f32>) -> vec4<f32> {
///       return textureSample(u_prev_frame, u_tex_sampler, uv);
///   }
///
/// And adds the required texture/sampler global declarations.
fn inject_texture_bindings(wgsl: &str, needs_prev: bool, needs_fft: bool) -> String {
    let mut result = String::with_capacity(wgsl.len() + 512);

    // Inject texture/sampler declarations at the very top of the WGSL
    result.push_str("// [injected] Texture bindings for feedback/FFT\n");
    result.push_str("@group(1) @binding(0) var u_tex_sampler: sampler;\n");
    if needs_prev {
        result.push_str("@group(1) @binding(1) var u_prev_frame: texture_2d<f32>;\n");
    }
    if needs_fft {
        result.push_str("@group(1) @binding(2) var u_fft_texture: texture_2d<f32>;\n");
    }
    result.push('\n');

    // Append original WGSL with stub function bodies replaced
    let mut remaining = wgsl;

    if needs_prev {
        remaining = &remaining; // just to satisfy borrow checker pattern
        let replaced = replace_stub_function(
            remaining,
            "_deadair_sample_prev",
            "return textureSample(u_prev_frame, u_tex_sampler, PARAM);",
        );
        result.push_str(&replaced);
    } else {
        result.push_str(remaining);
    }

    // Handle FFT in a second pass on the accumulated result
    if needs_fft {
        let current = result.clone();
        result.clear();
        let replaced = replace_stub_function(
            &current,
            "_deadair_sample_fft",
            "return textureSample(u_fft_texture, u_tex_sampler, PARAM);",
        );
        result.push_str(&replaced);
    }

    result
}

/// Find a stub function in WGSL by name and replace its body with real texture sampling.
/// The `new_body_template` should contain `PARAM` which gets replaced with the actual
/// parameter name from the function signature.
fn replace_stub_function(wgsl: &str, func_name: &str, new_body_template: &str) -> String {
    let search = format!("fn {}(", func_name);
    let Some(func_start) = wgsl.find(&search) else {
        return wgsl.to_string();
    };

    // Extract parameter name from signature: fn name(PARAM: vec2<f32>) -> ...
    let sig_start = func_start + search.len();
    let param_name = if let Some(colon_offset) = wgsl[sig_start..].find(':') {
        wgsl[sig_start..sig_start + colon_offset].trim().to_string()
    } else {
        "uv".to_string()
    };

    // Find the opening brace of the function body
    let Some(brace_rel) = wgsl[func_start..].find('{') else {
        return wgsl.to_string();
    };
    let body_start = func_start + brace_rel;

    // Find the matching closing brace
    let mut depth = 0;
    let mut body_end = body_start;
    for (i, c) in wgsl[body_start..].char_indices() {
        if c == '{' { depth += 1; }
        if c == '}' { depth -= 1; }
        if depth == 0 {
            body_end = body_start + i;
            break;
        }
    }

    // Build the replacement body
    let new_body = new_body_template.replace("PARAM", &param_name);

    let mut result = String::with_capacity(wgsl.len() + 128);
    result.push_str(&wgsl[..body_start]);
    result.push_str("{\n    ");
    result.push_str(&new_body);
    result.push_str("\n}");
    result.push_str(&wgsl[body_end + 1..]);

    result
}
