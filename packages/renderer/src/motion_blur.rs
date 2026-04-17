//! Sub-frame motion blur — accumulates multiple sub-frames with time offsets.
//!
//! For high-motion frames (climax, fast camera moves), renders N sub-frames
//! per output frame and averages them. This creates physically accurate motion
//! blur that is IMPOSSIBLE in real-time Chrome/WebGL rendering.
//!
//! The number of sub-frames is controlled per-frame via the manifest:
//!   - 0 or 1: no motion blur (default, free)
//!   - 2-4: light blur for medium motion
//!   - 4-8: heavy blur for climax/fast moments (4-8x render cost)
//!
//! Accumulation happens in HDR (Rgba16Float) for correct blending.

use wgpu::util::DeviceExt;
use crate::gpu;

/// Accumulation shader: adds a sub-frame to the accumulation buffer with weight.
const ACCUMULATE_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var sub_frame: texture_2d<f32>;

struct AccumUniforms {
    weight: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}
@group(0) @binding(2) var<uniform> params: AccumUniforms;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(sub_frame, tex_sampler, in.uv);
    return color * params.weight;
}
"#;

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct AccumUniforms {
    weight: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

/// Motion blur accumulation pipeline.
pub struct MotionBlurPipeline {
    /// Accumulation texture (HDR, full-res) — sub-frames are blended here
    pub accum_texture: wgpu::Texture,
    pub accum_view: wgpu::TextureView,

    /// Accumulation pipeline (additive blend with weight)
    accumulate_pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl MotionBlurPipeline {
    pub fn new(
        device: &wgpu::Device,
        vertex_module: &wgpu::ShaderModule,
        width: u32,
        height: u32,
    ) -> Self {
        let accum_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("motion_blur_accum"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: gpu::SCENE_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let accum_view = accum_texture.create_view(&Default::default());

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("motion_blur_bgl"),
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
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let fragment_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("motion_blur_accumulate"),
            source: wgpu::ShaderSource::Wgsl(ACCUMULATE_WGSL.into()),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("motion_blur_layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let vertex_buffers = &[wgpu::VertexBufferLayout {
            array_stride: 16,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x2 },
                wgpu::VertexAttribute { offset: 8, shader_location: 1, format: wgpu::VertexFormat::Float32x2 },
            ],
        }];

        // Use ADDITIVE blend so sub-frames accumulate
        let accumulate_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("motion_blur_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: vertex_module,
                entry_point: Some("vs_main"),
                buffers: vertex_buffers,
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &fragment_module,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: gpu::SCENE_FORMAT,
                    // Additive blending: each sub-frame adds its weighted contribution
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::One,
                            dst_factor: wgpu::BlendFactor::One,
                            operation: wgpu::BlendOperation::Add,
                        },
                        alpha: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::One,
                            dst_factor: wgpu::BlendFactor::One,
                            operation: wgpu::BlendOperation::Add,
                        },
                    }),
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

        Self {
            accum_texture,
            accum_view,
            accumulate_pipeline,
            bind_group_layout,
        }
    }

    /// Add a sub-frame to the accumulation buffer with the given weight.
    /// First sub-frame should use LoadOp::Clear, subsequent use LoadOp::Load (additive).
    pub fn accumulate_sub_frame(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        device: &wgpu::Device,
        sampler: &wgpu::Sampler,
        sub_frame_view: &wgpu::TextureView,
        weight: f32,
        is_first: bool,
        vertex_buffer: &wgpu::Buffer,
        index_buffer: &wgpu::Buffer,
    ) {
        let uniforms = AccumUniforms {
            weight,
            _pad0: 0.0,
            _pad1: 0.0,
            _pad2: 0.0,
        };

        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("accum_uniforms"),
            contents: bytemuck::bytes_of(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("accum_bg"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(sampler) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(sub_frame_view) },
                wgpu::BindGroupEntry { binding: 2, resource: uniform_buffer.as_entire_binding() },
            ],
        });

        let load_op = if is_first {
            wgpu::LoadOp::Clear(wgpu::Color::BLACK)
        } else {
            wgpu::LoadOp::Load
        };

        let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("accumulate_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &self.accum_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: load_op,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });

        rp.set_pipeline(&self.accumulate_pipeline);
        rp.set_bind_group(0, &bind_group, &[]);
        rp.set_vertex_buffer(0, vertex_buffer.slice(..));
        rp.set_index_buffer(index_buffer.slice(..), wgpu::IndexFormat::Uint16);
        rp.draw_indexed(0..6, 0, 0..1);
    }

}
