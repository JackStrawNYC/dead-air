//! GPU renderer — wgpu device, render pipeline, and frame output.
//!
//! Renders a fullscreen quad with a fragment shader (the visual scene).
//! Scene shaders render to an HDR texture (Rgba16Float), then an output pass
//! converts to SDR (Rgba8Unorm) for readback and encoding.
//!
//! Each frame: bind uniforms → draw quad (HDR) → output pass (SDR) → read pixels.

use wgpu::util::DeviceExt;

/// Fullscreen quad vertex (position + UV)
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct Vertex {
    position: [f32; 2],
    uv: [f32; 2],
}

// Image-convention UV: V=0 at NDC top, V=1 at NDC bottom. Matches the
// stored row order of textures (textureSample uses V=0 at top of data),
// so postprocess + output passes can sample scene_texture without a
// per-call flip. Scene shaders that expect Three.js convention
// (V=1 at top) get a V-flip in their dedicated vertex shader below.
const FULLSCREEN_QUAD: &[Vertex] = &[
    Vertex { position: [-1.0, -1.0], uv: [0.0, 1.0] },
    Vertex { position: [ 1.0, -1.0], uv: [1.0, 1.0] },
    Vertex { position: [-1.0,  1.0], uv: [0.0, 0.0] },
    Vertex { position: [ 1.0,  1.0], uv: [1.0, 0.0] },
];

const QUAD_INDICES: &[u16] = &[0, 1, 2, 2, 1, 3];

/// Vertex shader for postprocess + output passes — passthrough UV (image
/// convention: V=0 at top of frame, matching textureSample orientation).
const VERTEX_SHADER_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = vec4<f32>(in.position, 0.0, 1.0);
    out.uv = in.uv;
    return out;
}
"#;

/// Vertex shader for SCENE shaders only — flips V on the way out so the
/// fragment sees Three.js / R3F convention (V=1 at top of frame). The
/// Dead Air shader catalog assumes screenPos.y > 0 means UP; without
/// this flip every 3D-camera shader renders upside-down (sky at bottom).
/// The fragment writes into a render-attachment texture, and that texture
/// is then sampled by postprocess passes using the regular passthrough
/// vertex shader — which is correct because the texture stores image-Y-down
/// data, and the scene's "Three.js up" content lands in the texture row
/// that corresponds to NDC top (= row 0, image top).
const SCENE_VERTEX_SHADER_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = vec4<f32>(in.position, 0.0, 1.0);
    // Flip V: image-convention input UV → Three.js-convention output UV.
    out.uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
    return out;
}
"#;

/// HDR → SDR output pass shader with soft Reinhard rolloff.
/// GLSL ACES tone mapping already outputs display-referred sRGB values.
/// No additional gamma encoding — just prevent hard clipping.
const OUTPUT_SHADER_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var hdr_input: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var col = textureSample(hdr_input, tex_sampler, in.uv).rgb;
    // Soft Reinhard rolloff: compresses >1.0 gracefully
    let white_point = 1.5;
    col = col * (vec3<f32>(1.0) + col / (white_point * white_point)) / (vec3<f32>(1.0) + col);
    return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
"#;

/// HDR render target format for scene rendering (values can exceed 1.0).
pub const SCENE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

/// SDR output format for final readback and encoding.
pub const OUTPUT_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// One scene-rendering surface bundle at a particular LOD scale. The
/// renderer holds N of these (one per active cost tier) so shaders can
/// render at different resolutions in the same show — e.g. busted shaders
/// at 0.5x, cheap shaders at 1.0x. All textures in a bundle share dims so
/// `copy_texture_to_texture` (scene→feedback) is always legal within a
/// bundle but not across bundles. Switching tiers between frames resets
/// the feedback chain (the new tier's chain starts black).
pub struct SceneTargets {
    /// Diagnostic label, e.g. "full" / "slow" / "busted".
    pub label: &'static str,
    /// Render scale relative to output dims.
    pub scale: f32,
    /// Pixel dims of every texture in this bundle.
    pub width: u32,
    pub height: u32,
    /// Primary scene render target (HDR). Scene fragments draw here.
    pub scene_texture: wgpu::Texture,
    pub scene_view: wgpu::TextureView,
    /// Secondary scene render target (HDR) — transition pipeline draws
    /// shader B here, then blends with scene_texture.
    pub secondary_texture: wgpu::Texture,
    pub secondary_view: wgpu::TextureView,
    /// Ping-pong feedback chain. The render loop tracks an index 0/1 and
    /// uses the *opposite* slot as `uPrevFrame` for the current frame,
    /// then writes the current scene into the active slot.
    pub feedback_a: wgpu::Texture,
    pub feedback_a_view: wgpu::TextureView,
    pub feedback_b: wgpu::Texture,
    pub feedback_b_view: wgpu::TextureView,
}

impl SceneTargets {
    fn new(device: &wgpu::Device, label: &'static str, scale: f32, output_w: u32, output_h: u32) -> Self {
        let width = ((output_w as f32 * scale).round() as u32).max(64);
        let height = ((output_h as f32 * scale).round() as u32).max(64);
        let mk_render_target = |kind: &str| -> (wgpu::Texture, wgpu::TextureView) {
            let t = device.create_texture(&wgpu::TextureDescriptor {
                label: Some(&format!("scene_{}_{}_hdr", label, kind)),
                size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: SCENE_FORMAT,
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_SRC,
                view_formats: &[],
            });
            let v = t.create_view(&wgpu::TextureViewDescriptor::default());
            (t, v)
        };
        let mk_feedback = |kind: &str| -> (wgpu::Texture, wgpu::TextureView) {
            let t = device.create_texture(&wgpu::TextureDescriptor {
                label: Some(&format!("scene_{}_{}_feedback", label, kind)),
                size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: SCENE_FORMAT,
                usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            });
            let v = t.create_view(&wgpu::TextureViewDescriptor::default());
            (t, v)
        };
        let (scene_texture, scene_view) = mk_render_target("scene");
        let (secondary_texture, secondary_view) = mk_render_target("secondary");
        let (feedback_a, feedback_a_view) = mk_feedback("a");
        let (feedback_b, feedback_b_view) = mk_feedback("b");
        Self {
            label, scale, width, height,
            scene_texture, scene_view,
            secondary_texture, secondary_view,
            feedback_a, feedback_a_view,
            feedback_b, feedback_b_view,
        }
    }

    /// Pick (prev_frame_view, target_texture) for ping-pong feedback.
    /// `idx` is the active slot — caller writes here, reads from the other.
    pub fn feedback_pair(&self, idx: usize) -> (&wgpu::TextureView, &wgpu::Texture) {
        if idx == 0 {
            (&self.feedback_b_view, &self.feedback_a)
        } else {
            (&self.feedback_a_view, &self.feedback_b)
        }
    }
}

/// Owned bundle of the per-tier feedback handles render_loop needs to
/// build a tier-correct frame. All four fields are Arc-internal in wgpu
/// so this is cheap to construct.
pub struct TierFeedback {
    /// Index into renderer.targets_pool — pass back to render_*_idx.
    pub bundle_idx: usize,
    /// The bundle's primary scene view, for postprocess input + readback.
    pub scene_view: wgpu::TextureView,
    /// Opposite slot in ping-pong: shader reads this as `uPrevFrame`.
    pub prev_frame_view: wgpu::TextureView,
    /// Active slot in ping-pong: scene→feedback copy writes here.
    pub feedback_target: wgpu::Texture,
}

/// Convert a CostTier to its index in tier_to_targets.
/// Order matches the enum: Ok60, Ok30, Slow, Busted, Unknown.
fn tier_index(tier: crate::shader_tiers::CostTier) -> usize {
    use crate::shader_tiers::CostTier;
    match tier {
        CostTier::Ok60 => 0,
        CostTier::Ok30 => 1,
        CostTier::Slow => 2,
        CostTier::Busted => 3,
        CostTier::Unknown => 4,
    }
}

pub struct GpuRenderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    adapter_name: String,
    /// Output (final / readback) dimensions.
    width: u32,
    height: u32,

    /// Scene-rendering surface bundles indexed by tier. Phase 1 has one
    /// entry; Phase 2 will have one per active cost tier so per-frame LOD
    /// works without per-frame texture allocation.
    targets_pool: Vec<SceneTargets>,
    /// Map CostTier (as u8) → index into `targets_pool`. Phase 1 always
    /// points to 0; Phase 2 routes per-tier.
    tier_to_targets: [usize; 5],

    // SDR output render target (Rgba8Unorm) — output pass writes here
    output_texture: wgpu::Texture,
    output_texture_view: wgpu::TextureView,

    // Double-buffered readback (GPU → CPU). While GPU writes to one buffer,
    // CPU reads from the other. Eliminates the synchronous wait between frames.
    readback_buffers: [wgpu::Buffer; 2],
    readback_idx: usize, // which buffer the GPU writes to next
    has_pending_readback: bool, // is there a frame waiting in the other buffer?

    // Fullscreen quad geometry (shared across all passes)
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,

    // Vertex shader module (shared across all pipelines)
    vertex_module: wgpu::ShaderModule,
    /// Scene-shader vertex module — same as vertex_module but flips V on
    /// output so scene fragments see Three.js-convention vUv (V=1 at frame
    /// top). Used by `create_pipeline` for scene shaders. Postprocess + output
    /// passes keep using `vertex_module` so they sample textures with
    /// image-convention UV (V=0 at frame top).
    scene_vertex_module: wgpu::ShaderModule,

    // Uniform bind group layout (set=0: uniform buffer for scene shaders)
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,

    // Texture bind group layout (set=1: sampler + textures for scene shaders)
    // Used by shaders that need uPrevFrame/uFFTTexture (Phase 2+)
    pub texture_bind_group_layout: wgpu::BindGroupLayout,

    // Shared linear sampler for all texture reads
    pub texture_sampler: wgpu::Sampler,

    // Output pass: HDR → SDR conversion
    output_bind_group_layout: wgpu::BindGroupLayout,
    output_pipeline: wgpu::RenderPipeline,
}

impl GpuRenderer {
    /// Initialise with full output resolution AND a separate scene resolution.
    /// scene_scale=1.0 (default) renders the scene at output size. <1.0 renders
    /// the scene smaller and the postprocess sampler upscales to output size,
    /// trading some sharpness for a major shader-cost reduction.
    pub async fn new(width: u32, height: u32) -> Result<Self, Box<dyn std::error::Error>> {
        Self::new_with_scene_scale(width, height, 1.0).await
    }

    pub async fn new_with_scene_scale(width: u32, height: u32, scene_scale: f32) -> Result<Self, Box<dyn std::error::Error>> {
        let scene_scale = scene_scale.clamp(0.25, 1.0);
        Self::new_with_tier_scales(width, height, &[("full", scene_scale)], &[0; 5]).await
    }

    /// Create a renderer with multiple SceneTargets, one per (label, scale)
    /// in `tiers`, and a `tier_to_targets` map indexed by `CostTier as u8`
    /// pointing into that list. Phase 2 of adaptive scale uses this to
    /// allocate a "full" + "slow" + "busted" trio at startup.
    pub async fn new_with_tier_scales(
        width: u32,
        height: u32,
        tiers: &[(&'static str, f32)],
        tier_to_targets: &[usize; 5],
    ) -> Result<Self, Box<dyn std::error::Error>> {
        assert!(!tiers.is_empty(), "at least one (label, scale) tier required");
        for (i, idx) in tier_to_targets.iter().enumerate() {
            assert!(*idx < tiers.len(), "tier_to_targets[{}] = {} out of range (tiers.len() = {})", i, idx, tiers.len());
        }
        Self::new_inner(width, height, tiers, *tier_to_targets).await
    }

    async fn new_inner(
        width: u32,
        height: u32,
        tier_scales: &[(&'static str, f32)],
        tier_to_targets: [usize; 5],
    ) -> Result<Self, Box<dyn std::error::Error>> {
        // ─── GPU adapter + device ───
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::PRIMARY,
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: None,
            })
            .await
            .ok_or("No suitable GPU adapter found")?;

        let adapter_name = adapter.get_info().name.clone();

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("dead-air-renderer"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits {
                    max_texture_dimension_2d: 4096.max(width).max(height),
                    ..wgpu::Limits::default()
                },
                memory_hints: wgpu::MemoryHints::Performance,
            }, None)
            .await?;

        // ─── Textures ───
        // One SceneTargets bundle per requested tier. Each bundle holds its
        // own scene/secondary/feedback textures so per-tier LOD doesn't
        // require per-frame texture allocation.
        let targets_pool: Vec<SceneTargets> = tier_scales.iter()
            .map(|(label, scale)| SceneTargets::new(&device, label, *scale, width, height))
            .collect();

        // SDR output texture — output pass writes here, then copied to readback buffer
        let output_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("output_texture_sdr"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: OUTPUT_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC | wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let output_texture_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // ─── Double-buffered readback ───
        let bytes_per_row = Self::padded_bytes_per_row(width);
        let readback_size = (bytes_per_row * height as usize) as u64;
        let readback_buffers = [
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("readback_buffer_0"),
                size: readback_size,
                usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                mapped_at_creation: false,
            }),
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("readback_buffer_1"),
                size: readback_size,
                usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                mapped_at_creation: false,
            }),
        ];

        // ─── Fullscreen quad geometry ───
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("quad_vertices"),
            contents: bytemuck::cast_slice(FULLSCREEN_QUAD),
            usage: wgpu::BufferUsages::VERTEX,
        });

        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("quad_indices"),
            contents: bytemuck::cast_slice(QUAD_INDICES),
            usage: wgpu::BufferUsages::INDEX,
        });

        // ─── Shared vertex shaders ───
        let vertex_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("vertex_shader"),
            source: wgpu::ShaderSource::Wgsl(VERTEX_SHADER_WGSL.into()),
        });
        let scene_vertex_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("scene_vertex_shader"),
            source: wgpu::ShaderSource::Wgsl(SCENE_VERTEX_SHADER_WGSL.into()),
        });

        // ─── Shared linear sampler ───
        let texture_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("texture_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        // ─── Bind group layouts ───

        // Set 0: Uniform buffer (used by all scene shaders)
        let uniform_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("uniform_bind_group_layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });

        // Set 1: Textures for scene shaders (uPrevFrame, uFFTTexture)
        // Phase 2+ will bind actual textures here; Phase 1 creates the layout only.
        let texture_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("texture_bind_group_layout"),
                entries: &[
                    // binding 0: shared sampler
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    // binding 1: uPrevFrame (feedback texture)
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    // binding 2: uFFTTexture (frequency data)
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                ],
            });

        // Output pass bind group layout: sampler + HDR input texture
        let output_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("output_bind_group_layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                ],
            });

        // ─── Output pipeline (HDR → SDR) ───
        let output_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("output_shader"),
            source: wgpu::ShaderSource::Wgsl(OUTPUT_SHADER_WGSL.into()),
        });

        let output_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("output_pipeline_layout"),
            bind_group_layouts: &[&output_bind_group_layout],
            push_constant_ranges: &[],
        });

        let output_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("output_pipeline"),
            layout: Some(&output_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &vertex_module,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            offset: 0,
                            shader_location: 0,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                        wgpu::VertexAttribute {
                            offset: 8,
                            shader_location: 1,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &output_module,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: OUTPUT_FORMAT,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        // The output_bind_group binds whichever scene texture the current
        // frame rendered into. Since we now have one per tier, the bind
        // group is built per-call; the small allocation cost is < 1µs.

        Ok(Self {
            device,
            queue,
            adapter_name,
            width,
            height,
            targets_pool,
            tier_to_targets,
            output_texture,
            output_texture_view,
            readback_buffers,
            readback_idx: 0,
            has_pending_readback: false,
            vertex_buffer,
            index_buffer,
            vertex_module,
            scene_vertex_module,
            uniform_bind_group_layout,
            texture_bind_group_layout,
            texture_sampler,
            output_bind_group_layout,
            output_pipeline,
        })
    }

    pub fn adapter_name(&self) -> &str {
        &self.adapter_name
    }

    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    pub fn queue(&self) -> &wgpu::Queue {
        &self.queue
    }

    /// Default scene targets (the first allocated bundle). Equivalent to
    /// `targets_for_tier(CostTier::Ok60)` for renderers built with
    /// `new()` / `new_with_scene_scale()` (single bundle).
    pub fn primary_targets(&self) -> &SceneTargets {
        &self.targets_pool[0]
    }

    /// All allocated scene-target bundles in declaration order. Useful for
    /// per-tier diagnostics + tests. Phase 1: always length 1.
    pub fn targets_pool(&self) -> &[SceneTargets] {
        &self.targets_pool
    }

    /// Look up the SceneTargets bundle assigned to a cost tier.
    pub fn targets_for_tier(&self, tier: crate::shader_tiers::CostTier) -> &SceneTargets {
        let idx = self.tier_to_targets[tier_index(tier)].min(self.targets_pool.len() - 1);
        &self.targets_pool[idx]
    }

    /// Convenience: return the *index* into `targets_pool` for a tier.
    /// render_loop uses this to detect tier transitions (resets feedback).
    pub fn tier_target_index(&self, tier: crate::shader_tiers::CostTier) -> usize {
        self.tier_to_targets[tier_index(tier)].min(self.targets_pool.len() - 1)
    }

    /// Pick the right feedback handles for a tier, given the active write
    /// slot in the ping-pong chain. Returns clone-cheap (Arc internally)
    /// owned handles so render_loop can hand them to a `&mut self`
    /// `render_frame_idx` call without a borrow conflict against
    /// targets_pool.
    pub fn pick_tier_feedback(
        &self,
        tier: crate::shader_tiers::CostTier,
        feedback_write_slot: usize,
    ) -> TierFeedback {
        let bundle_idx = self.tier_target_index(tier);
        let b = &self.targets_pool[bundle_idx];
        let (prev_view, write_tex) = if feedback_write_slot == 0 {
            (b.feedback_b_view.clone(), b.feedback_a.clone())
        } else {
            (b.feedback_a_view.clone(), b.feedback_b.clone())
        };
        TierFeedback {
            bundle_idx,
            scene_view: b.scene_view.clone(),
            prev_frame_view: prev_view,
            feedback_target: write_tex,
        }
    }

    /// Pick the larger-LOD bundle (smaller scale) for a transition, since
    /// both shaders must render through the same SceneTargets. The returned
    /// bundle index satisfies "fits the busted shader's budget"; the
    /// cheap shader briefly downscales for the transition window.
    pub fn pick_transition_target_idx(
        &self,
        primary: crate::shader_tiers::CostTier,
        secondary: crate::shader_tiers::CostTier,
    ) -> usize {
        let i_p = self.tier_target_index(primary);
        let i_s = self.tier_target_index(secondary);
        if self.targets_pool[i_p].scale <= self.targets_pool[i_s].scale {
            i_p
        } else {
            i_s
        }
    }

    /// Build a fresh output_pipeline bind group for the given scene view.
    /// The output pass samples one of N tier-specific scene textures, so
    /// the bind group must be built per call rather than stored on Self.
    fn output_bind_group_for(&self, scene_view: &wgpu::TextureView) -> wgpu::BindGroup {
        self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("output_bind_group"),
            layout: &self.output_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(&self.texture_sampler) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(scene_view) },
            ],
        })
    }

    /// Back-compat shim — returns the primary scene view. Existing tests
    /// and render-loop sites that don't yet thread per-tier targets call
    /// this. New code should call `primary_targets().scene_view`.
    pub fn scene_texture_view(&self) -> &wgpu::TextureView {
        &self.targets_pool[0].scene_view
    }

    /// Back-compat shim — owned scene view from the primary bundle.
    pub fn create_scene_view(&self) -> wgpu::TextureView {
        self.targets_pool[0].scene_texture.create_view(&wgpu::TextureViewDescriptor::default())
    }

    pub fn vertex_buffer(&self) -> &wgpu::Buffer {
        &self.vertex_buffer
    }

    pub fn index_buffer(&self) -> &wgpu::Buffer {
        &self.index_buffer
    }

    pub fn output_texture(&self) -> &wgpu::Texture {
        &self.output_texture
    }

    pub fn output_texture_view(&self) -> &wgpu::TextureView {
        &self.output_texture_view
    }

    pub fn vertex_module(&self) -> &wgpu::ShaderModule {
        &self.vertex_module
    }

    /// Create a render pipeline for a scene shader (uniforms only, no texture bindings).
    /// The pipeline targets SCENE_FORMAT (Rgba16Float HDR).
    pub fn create_pipeline(&self, fragment_module: &wgpu::ShaderModule) -> wgpu::RenderPipeline {
        let pipeline_layout = self.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("scene_pipeline_layout"),
            bind_group_layouts: &[&self.uniform_bind_group_layout],
            push_constant_ranges: &[],
        });

        self.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("scene_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                // Scene shaders see Three.js-convention vUv (V=1 at frame top).
                module: &self.scene_vertex_module,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            offset: 0,
                            shader_location: 0,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                        wgpu::VertexAttribute {
                            offset: 8,
                            shader_location: 1,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: fragment_module,
                entry_point: Some("main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: SCENE_FORMAT,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
    }

    /// Create a render pipeline for a scene shader that uses texture bindings (set=1).
    /// Pipeline layout includes both uniform (set=0) and texture (set=1) bind groups.
    /// Used by shaders that reference uPrevFrame or uFFTTexture (Phase 2+).
    pub fn create_pipeline_with_textures(
        &self,
        fragment_module: &wgpu::ShaderModule,
    ) -> wgpu::RenderPipeline {
        let pipeline_layout = self.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("scene_pipeline_with_textures_layout"),
            bind_group_layouts: &[&self.uniform_bind_group_layout, &self.texture_bind_group_layout],
            push_constant_ranges: &[],
        });

        let _ = &self.scene_vertex_module; // also used below

        self.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("scene_pipeline_with_textures"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                // Scene shaders see Three.js-convention vUv (V=1 at frame top).
                module: &self.scene_vertex_module,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            offset: 0,
                            shader_location: 0,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                        wgpu::VertexAttribute {
                            offset: 8,
                            shader_location: 1,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: fragment_module,
                entry_point: Some("main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: SCENE_FORMAT,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        })
    }

    /// Create a feedback texture sized to the **primary** scene targets.
    /// Kept for tests + back-compat with single-tier callers; multi-tier
    /// callers should use `targets_for_tier(tier).feedback_a/b` instead
    /// (the bundle owns its own feedback chain).
    pub fn create_feedback_texture(&self, label: &str) -> (wgpu::Texture, wgpu::TextureView) {
        let primary = &self.targets_pool[0];
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some(label),
            size: wgpu::Extent3d {
                width: primary.width,
                height: primary.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: SCENE_FORMAT,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        (texture, view)
    }

    /// Create a 1D FFT texture (64x1 Rgba8Unorm) for frequency data.
    pub fn create_fft_texture(&self) -> (wgpu::Texture, wgpu::TextureView) {
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("fft_texture"),
            size: wgpu::Extent3d { width: 64, height: 1, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        (texture, view)
    }

    /// Create a texture bind group (set=1) with sampler + feedback + FFT textures.
    pub fn create_texture_bind_group(
        &self,
        prev_frame_view: &wgpu::TextureView,
        fft_view: &wgpu::TextureView,
    ) -> wgpu::BindGroup {
        self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("texture_bind_group"),
            layout: &self.texture_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Sampler(&self.texture_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(prev_frame_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(fft_view),
                },
            ],
        })
    }

    /// Write FFT data to the FFT texture. Data should be 64 RGBA8 pixels (256 bytes).
    pub fn update_fft_texture(&self, fft_texture: &wgpu::Texture, data: &[u8; 256]) {
        self.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: fft_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(64 * 4),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d { width: 64, height: 1, depth_or_array_layers: 1 },
        );
    }

    /// Render ONLY the scene shader to the HDR scene texture. No post-processing, no readback.
    /// Used for motion blur sub-frames that get accumulated before post-processing.
    /// Single-tier convenience — uses `targets_pool[0]`. Multi-tier callers should
    /// use `render_scene_to_hdr_idx` and route by tier.
    pub fn render_scene_to_hdr(
        &mut self,
        pipeline: &wgpu::RenderPipeline,
        uniform_data: &[u8],
        texture_bind_group: Option<&wgpu::BindGroup>,
        feedback_target: Option<&wgpu::Texture>,
    ) {
        self.render_scene_to_hdr_idx(0, pipeline, uniform_data, texture_bind_group, feedback_target);
    }

    /// Multi-tier variant of `render_scene_to_hdr`. `targets_idx` selects
    /// which `SceneTargets` bundle (and thus which LOD scale) to render into.
    pub fn render_scene_to_hdr_idx(
        &mut self,
        targets_idx: usize,
        pipeline: &wgpu::RenderPipeline,
        uniform_data: &[u8],
        texture_bind_group: Option<&wgpu::BindGroup>,
        feedback_target: Option<&wgpu::Texture>,
    ) {
        let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("scene_uniforms"),
            contents: uniform_data,
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("scene_bind_group"),
            layout: &self.uniform_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("scene_only_encoder"),
        });

        {
            let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("scene_only_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.targets_pool[targets_idx].scene_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            rp.set_pipeline(pipeline);
            rp.set_bind_group(0, &bind_group, &[]);
            if let Some(tex_bg) = texture_bind_group {
                rp.set_bind_group(1, tex_bg, &[]);
            }
            rp.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            rp.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            rp.draw_indexed(0..6, 0, 0..1);
        }

        if let Some(fb_tex) = feedback_target {
            encoder.copy_texture_to_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.targets_pool[targets_idx].scene_texture,
                    mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyTextureInfo {
                    texture: fb_tex,
                    mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d { width: self.targets_pool[targets_idx].width, height: self.targets_pool[targets_idx].height, depth_or_array_layers: 1 },
            );
        }

        self.queue.submit(std::iter::once(encoder.finish()));
    }

    /// Run post-processing on an HDR source and copy result to readback buffer.
    /// Used after motion blur accumulation to finalize the frame.
    pub fn postprocess_and_readback(
        &mut self,
        pp: &crate::postprocess::PostProcessPipeline,
        pp_uniforms: &crate::postprocess::PostProcessUniforms,
        hdr_source: &wgpu::TextureView,
        skip_fxaa: bool,
    ) {
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("pp_readback_encoder"),
        });

        pp.run(
            &mut encoder,
            &self.device,
            &self.texture_sampler,
            hdr_source,
            &self.output_texture_view,
            pp_uniforms,
            &self.vertex_buffer,
            &self.index_buffer,
            skip_fxaa,
        );

        self.copy_to_readback(&mut encoder);
        self.queue.submit(std::iter::once(encoder.finish()));
    }

    /// Render a single frame: scene shader (HDR) → temporal blend → post-processing (SDR) → readback.
    /// Optionally binds texture group (set=1) and copies scene to feedback buffer.
    /// If `pp` is provided, runs multi-pass post-processing. Otherwise uses simple clamp.
    /// If `temporal` is provided, blends with previous frame before post-processing.
    pub fn render_frame(
        &mut self,
        pipeline: &wgpu::RenderPipeline,
        uniform_data: &[u8],
        texture_bind_group: Option<&wgpu::BindGroup>,
        feedback_target: Option<&wgpu::Texture>,
        pp: Option<(&crate::postprocess::PostProcessPipeline, &crate::postprocess::PostProcessUniforms)>,
        temporal: Option<(&crate::temporal::TemporalBlendPipeline, &wgpu::TextureView, f32)>,
        skip_fxaa: bool,
    ) {
        self.render_frame_idx(
            0, pipeline, uniform_data, texture_bind_group,
            feedback_target, pp, temporal, skip_fxaa,
        );
    }

    /// Multi-tier `render_frame` — `targets_idx` selects which SceneTargets
    /// bundle (and LOD scale) to render into. The feedback_target texture
    /// passed in MUST match the chosen bundle's dimensions (caller is
    /// expected to source it from `targets_for_tier(tier).feedback_a/b`).
    pub fn render_frame_idx(
        &mut self,
        targets_idx: usize,
        pipeline: &wgpu::RenderPipeline,
        uniform_data: &[u8],
        texture_bind_group: Option<&wgpu::BindGroup>,
        feedback_target: Option<&wgpu::Texture>,
        pp: Option<(&crate::postprocess::PostProcessPipeline, &crate::postprocess::PostProcessUniforms)>,
        temporal: Option<(&crate::temporal::TemporalBlendPipeline, &wgpu::TextureView, f32)>,
        skip_fxaa: bool,
    ) {
        // Create uniform buffer for this frame
        let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("frame_uniforms"),
            contents: uniform_data,
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("frame_bind_group"),
            layout: &self.uniform_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("frame_encoder"),
        });

        // ─── Pass 1: Scene shader → HDR texture ───
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("scene_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.targets_pool[targets_idx].scene_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            render_pass.set_pipeline(pipeline);
            render_pass.set_bind_group(0, &bind_group, &[]);
            if let Some(tex_bg) = texture_bind_group {
                render_pass.set_bind_group(1, tex_bg, &[]);
            }
            render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            render_pass.draw_indexed(0..QUAD_INDICES.len() as u32, 0, 0..1);
        }

        // ─── Copy scene to feedback buffer (for next frame's uPrevFrame) ───
        if let Some(fb_tex) = feedback_target {
            encoder.copy_texture_to_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.targets_pool[targets_idx].scene_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyTextureInfo {
                    texture: fb_tex,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d {
                    width: self.width,
                    height: self.height,
                    depth_or_array_layers: 1,
                },
            );
        }

        // ─── Temporal blend (optional): scene + previous → secondary texture ───
        // If temporal blending is active, blend scene with previous frame.
        // Post-processing then reads from secondary_texture instead of scene_texture.
        let pp_input_view = if let Some((temporal_pipeline, prev_view, blend_strength)) = temporal {
            if blend_strength > 0.001 {
                temporal_pipeline.run_blend(
                    &mut encoder,
                    &self.device,
                    &self.texture_sampler,
                    &self.targets_pool[targets_idx].scene_view,
                    prev_view,
                    &self.targets_pool[targets_idx].secondary_view,
                    blend_strength,
                    &self.vertex_buffer,
                    &self.index_buffer,
                );
                &self.targets_pool[targets_idx].secondary_view
            } else {
                &self.targets_pool[targets_idx].scene_view
            }
        } else {
            &self.targets_pool[targets_idx].scene_view
        };

        // ─── Pass 2: Post-processing — HDR → SDR ───
        if let Some((pp_pipeline, pp_uniforms)) = pp {
            // Full multi-pass post-processing: bloom + tonemap + grade
            pp_pipeline.run(
                &mut encoder,
                &self.device,
                &self.texture_sampler,
                pp_input_view,
                &self.output_texture_view,
                pp_uniforms,
                &self.vertex_buffer,
                &self.index_buffer,
                skip_fxaa,
            );
        } else {
            // Simple clamp pass (fallback when post-processing not initialized)
            let bg = self.output_bind_group_for(&self.targets_pool[targets_idx].scene_view);
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("output_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.output_texture_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            render_pass.set_pipeline(&self.output_pipeline);
            render_pass.set_bind_group(0, &bg, &[]);
            render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            render_pass.draw_indexed(0..QUAD_INDICES.len() as u32, 0, 0..1);
        }

        // ─── Copy output texture → current readback buffer ───
        self.copy_to_readback(&mut encoder);
        self.queue.submit(std::iter::once(encoder.finish()));
    }

    /// Copy output texture to the current readback buffer and swap indices.
    /// Skip post-processing: copy HDR scene directly to output + readback.
    /// The GLSL shader already includes bloom/grain/halation/vignette.
    pub fn scene_to_readback(&mut self, hdr_source: &wgpu::TextureView) {
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("no_pp_readback"),
        });
        // Blit HDR source to SDR output via a render pass (handles Rgba16Float → Rgba8Unorm)
        let source_bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("no_pp_blit_bind_group"),
            layout: &self.output_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::Sampler(&self.texture_sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(hdr_source),
                },
            ],
        });
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("no_pp_blit_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.output_texture_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            render_pass.set_pipeline(&self.output_pipeline);
            render_pass.set_bind_group(0, &source_bind_group, &[]);
            render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            render_pass.draw_indexed(0..QUAD_INDICES.len() as u32, 0, 0..1);
        }
        self.copy_to_readback(&mut encoder);
        self.queue.submit(std::iter::once(encoder.finish()));
    }

    pub fn copy_to_readback(&mut self, encoder: &mut wgpu::CommandEncoder) {
        let bytes_per_row = Self::padded_bytes_per_row(self.width);
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &self.output_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &self.readback_buffers[self.readback_idx],
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(bytes_per_row as u32),
                    rows_per_image: Some(self.height),
                },
            },
            wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );
        // Swap: next frame writes to the other buffer
        self.readback_idx = 1 - self.readback_idx;
        self.has_pending_readback = true;
    }

    /// Render a frame with GPU-native transition blending.
    /// Both shaders render to HDR textures, then a transition shader blends them on GPU.
    /// Single-tier convenience — use `render_frame_with_transition_idx` to
    /// route the whole transition through a specific bundle (recommended:
    /// the smaller of the two shaders' tiers, since both must share dims).
    pub fn render_frame_with_transition(
        &mut self,
        primary_pipeline: &wgpu::RenderPipeline,
        secondary_pipeline: &wgpu::RenderPipeline,
        uniform_data: &[u8],
        primary_tex_bg: Option<&wgpu::BindGroup>,
        secondary_tex_bg: Option<&wgpu::BindGroup>,
        blend_progress: f32,
        blend_mode: &str,
        feedback_target: Option<&wgpu::Texture>,
        pp: Option<(&crate::postprocess::PostProcessPipeline, &crate::postprocess::PostProcessUniforms)>,
        transition_pipeline: &crate::transition::GpuTransitionPipeline,
        skip_fxaa: bool,
    ) {
        self.render_frame_with_transition_idx(
            0, primary_pipeline, secondary_pipeline, uniform_data,
            primary_tex_bg, secondary_tex_bg, blend_progress, blend_mode,
            feedback_target, pp, transition_pipeline, skip_fxaa,
        );
    }

    /// Multi-tier transition variant — renders both shaders into the
    /// `targets_idx` bundle's scene + secondary slots, blends them, and
    /// (optionally) post-processes. Both primary and secondary will run at
    /// the chosen bundle's LOD scale; pick the smaller of the two shaders'
    /// tiers to keep the busted shader within budget.
    pub fn render_frame_with_transition_idx(
        &mut self,
        targets_idx: usize,
        primary_pipeline: &wgpu::RenderPipeline,
        secondary_pipeline: &wgpu::RenderPipeline,
        uniform_data: &[u8],
        primary_tex_bg: Option<&wgpu::BindGroup>,
        secondary_tex_bg: Option<&wgpu::BindGroup>,
        blend_progress: f32,
        blend_mode: &str,
        feedback_target: Option<&wgpu::Texture>,
        pp: Option<(&crate::postprocess::PostProcessPipeline, &crate::postprocess::PostProcessUniforms)>,
        transition_pipeline: &crate::transition::GpuTransitionPipeline,
        skip_fxaa: bool,
    ) {
        let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("frame_uniforms"),
            contents: uniform_data,
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("frame_bind_group"),
            layout: &self.uniform_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("transition_encoder"),
        });

        // ─── Render primary shader → scene_texture ───
        {
            let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("primary_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.targets_pool[targets_idx].scene_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            rp.set_pipeline(primary_pipeline);
            rp.set_bind_group(0, &bind_group, &[]);
            if let Some(tex_bg) = primary_tex_bg {
                rp.set_bind_group(1, tex_bg, &[]);
            }
            rp.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            rp.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            rp.draw_indexed(0..6, 0, 0..1);
        }

        // ─── Render secondary shader → secondary_texture ───
        {
            let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("secondary_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.targets_pool[targets_idx].secondary_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            rp.set_pipeline(secondary_pipeline);
            rp.set_bind_group(0, &bind_group, &[]);
            if let Some(tex_bg) = secondary_tex_bg {
                rp.set_bind_group(1, tex_bg, &[]);
            }
            rp.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            rp.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            rp.draw_indexed(0..6, 0, 0..1);
        }

        // ─── GPU transition blend → back to scene_texture ───
        // We need a third texture to write the blend result. Reuse output_texture
        // as temporary HDR storage? No — it's Rgba8Unorm. Instead, write the blend
        // result back to scene_texture by reading from both inputs.
        // Wait — we can't read and write scene_texture simultaneously.
        // Solution: blend into secondary_texture (reading from scene + secondary),
        // then copy secondary back to scene. But that's also a read-write conflict.
        // Better: use a dedicated transition pass that reads both textures and writes
        // to scene_texture. We rendered primary→scene, secondary→secondary.
        // The transition reads from scene (primary) and secondary (secondary),
        // blending into... we need scene_texture for the post-processing pipeline.
        // Let's render the transition result into scene_texture using a copy trick:
        // 1. Copy scene_texture → feedback (as the primary source)
        // 2. Render transition reading feedback + secondary → scene_texture
        // Actually simplest: use the transition pipeline to write directly to output,
        // bypassing the separate post-processing pass.
        //
        // Cleanest approach: transition shader writes to scene_texture, but we need
        // to read scene_texture as input. This requires a copy first.
        // Copy scene_texture → a temp. But we don't have a temp texture.
        //
        // PRAGMATIC: The scene_texture already has the primary result. The secondary
        // texture has the secondary result. We can read both in the transition shader
        // and write to a different target. The post-processing pipeline reads from
        // scene_texture_view. So we need the blended result IN scene_texture.
        //
        // Solution: The transition shader reads scene + secondary, writes to output.
        // Then the post-processing reads from... output? No, it expects scene_texture.
        //
        // SIMPLEST: Skip the scene_texture for blended result. Have the transition
        // shader write directly to the post-process input. Since post-processing
        // accepts any texture view, we can parameterize it.
        //
        // OR: just copy primary to feedback first (which we're doing anyway for
        // feedback), then render transition from feedback + secondary → scene_texture.

        // Copy primary result to feedback (serves double duty: feedback + transition source)
        if let Some(fb_tex) = feedback_target {
            encoder.copy_texture_to_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.targets_pool[targets_idx].scene_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyTextureInfo {
                    texture: fb_tex,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d { width: self.targets_pool[targets_idx].width, height: self.targets_pool[targets_idx].height, depth_or_array_layers: 1 },
            );
        }

        // Render transition: reads scene_texture (primary) + secondary_texture → scene_texture
        // We need to copy scene to a temp first since we can't read and write same texture.
        // Use the feedback texture we just wrote as the primary input.
        if let Some(fb_tex) = feedback_target {
            let fb_view = fb_tex.create_view(&wgpu::TextureViewDescriptor::default());
            transition_pipeline.run_blend(
                &mut encoder,
                &self.device,
                &self.texture_sampler,
                &fb_view,               // primary (copied from scene)
                &self.targets_pool[targets_idx].secondary_view,  // secondary
                &self.targets_pool[targets_idx].scene_view,      // output (scene_texture)
                blend_progress,
                blend_mode,
                &self.vertex_buffer,
                &self.index_buffer,
            );

            // Update feedback with the post-transition blended result so next
            // frame's uPrevFrame sees the actual output, not the pre-blend primary.
            encoder.copy_texture_to_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.targets_pool[targets_idx].scene_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyTextureInfo {
                    texture: fb_tex,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d { width: self.targets_pool[targets_idx].width, height: self.targets_pool[targets_idx].height, depth_or_array_layers: 1 },
            );
        }

        // ─── Post-processing ───
        if let Some((pp_pipeline, pp_uniforms)) = pp {
            pp_pipeline.run(
                &mut encoder,
                &self.device,
                &self.texture_sampler,
                &self.targets_pool[targets_idx].scene_view,
                &self.output_texture_view,
                pp_uniforms,
                &self.vertex_buffer,
                &self.index_buffer,
                skip_fxaa,
            );
        } else {
            let bg = self.output_bind_group_for(&self.targets_pool[targets_idx].scene_view);
            let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("output_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.output_texture_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            rp.set_pipeline(&self.output_pipeline);
            rp.set_bind_group(0, &bg, &[]);
            rp.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            rp.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            rp.draw_indexed(0..6, 0, 0..1);
        }

        // ─── Copy to readback ───
        self.copy_to_readback(&mut encoder);
        self.queue.submit(std::iter::once(encoder.finish()));
    }

    /// Read rendered pixels back from GPU. Returns RGBA8 buffer (width * height * 4 bytes).
    /// Reads from the buffer that was LAST written to (1 - readback_idx, since we swap after copy).
    pub fn read_pixels(&self) -> Vec<u8> {
        let read_idx = 1 - self.readback_idx; // the buffer we just wrote to
        let bytes_per_row = Self::padded_bytes_per_row(self.width);
        let unpadded_bytes_per_row = self.width as usize * 4;

        let buffer_slice = self.readback_buffers[read_idx].slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            sender.send(result).unwrap();
        });
        self.device.poll(wgpu::Maintain::Wait);
        receiver.recv().unwrap().unwrap();

        let data = buffer_slice.get_mapped_range();

        // Remove row padding (wgpu requires 256-byte aligned rows)
        let mut pixels = Vec::with_capacity(unpadded_bytes_per_row * self.height as usize);
        for row in 0..self.height as usize {
            let start = row * bytes_per_row;
            let end = start + unpadded_bytes_per_row;
            pixels.extend_from_slice(&data[start..end]);
        }

        drop(data);
        self.readback_buffers[read_idx].unmap();

        pixels
    }

    /// Read the previous frame's pixels while current frame renders on GPU.
    /// Returns None if no previous frame is available (first frame).
    /// This is the pipelined version — call BEFORE render_frame() for the current frame
    /// to overlap GPU rendering with CPU readback.
    pub fn read_previous_pixels(&mut self) -> Option<Vec<u8>> {
        if !self.has_pending_readback {
            return None;
        }

        // The pending frame is in the buffer at (1 - readback_idx)
        // because render_frame already swapped the index
        let read_idx = 1 - self.readback_idx;
        let bytes_per_row = Self::padded_bytes_per_row(self.width);
        let unpadded_bytes_per_row = self.width as usize * 4;

        let buffer_slice = self.readback_buffers[read_idx].slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            sender.send(result).unwrap();
        });
        self.device.poll(wgpu::Maintain::Wait);
        receiver.recv().unwrap().unwrap();

        let data = buffer_slice.get_mapped_range();
        let mut pixels = Vec::with_capacity(unpadded_bytes_per_row * self.height as usize);
        for row in 0..self.height as usize {
            let start = row * bytes_per_row;
            let end = start + unpadded_bytes_per_row;
            pixels.extend_from_slice(&data[start..end]);
        }
        drop(data);
        self.readback_buffers[read_idx].unmap();

        Some(pixels)
    }

    /// wgpu requires rows to be aligned to 256 bytes.
    fn padded_bytes_per_row(width: u32) -> usize {
        let unpadded = width as usize * 4;
        let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT as usize;
        (unpadded + align - 1) & !(align - 1)
    }
}
