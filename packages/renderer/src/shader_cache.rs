//! Shader cache — compiles GLSL fragment shaders to wgpu render pipelines.
//!
//! Uses naga to parse GLSL → naga IR → SPIR-V, then creates wgpu shader modules.
//! Caches compiled pipelines by shader_id for reuse across frames.

use std::collections::HashMap;

use crate::gpu::GpuRenderer;

pub struct ShaderCache {
    pipelines: HashMap<String, wgpu::RenderPipeline>,
}

impl ShaderCache {
    pub fn new() -> Self {
        Self {
            pipelines: HashMap::new(),
        }
    }

    /// Compile a GLSL fragment shader and create a wgpu render pipeline.
    ///
    /// The GLSL source should be a complete fragment shader (with uniforms, main(), etc.)
    /// as pre-composed by the Node.js manifest generator.
    pub fn compile(
        &mut self,
        renderer: &GpuRenderer,
        shader_id: &str,
        glsl_source: &str,
    ) -> Result<(), String> {
        // Parse GLSL → naga IR
        let mut parser = naga::front::glsl::Frontend::default();
        let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);

        let module = parser
            .parse(&options, glsl_source)
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

        // Generate WGSL (wgpu's native shader language)
        let wgsl = naga::back::wgsl::write_string(
            &module,
            &info,
            naga::back::wgsl::WriterFlags::empty(),
        )
        .map_err(|e| format!("WGSL generation error in {}: {}", shader_id, e))?;

        // Create wgpu shader module from WGSL
        let fragment_module =
            renderer
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some(shader_id),
                    source: wgpu::ShaderSource::Wgsl(wgsl.into()),
                });

        // Create render pipeline
        let pipeline = renderer.create_pipeline(&fragment_module);
        self.pipelines.insert(shader_id.to_string(), pipeline);

        Ok(())
    }

    /// Get a cached render pipeline by shader_id.
    pub fn get_pipeline(&self, shader_id: &str) -> Option<&wgpu::RenderPipeline> {
        self.pipelines.get(shader_id)
    }
}
