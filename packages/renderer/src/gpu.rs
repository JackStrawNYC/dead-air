//! GPU renderer — wgpu device, render pipeline, and frame output.
//!
//! Renders a fullscreen quad with a fragment shader (the visual scene).
//! Each frame: bind uniforms → draw quad → read pixels from GPU → return RGBA buffer.

use wgpu::util::DeviceExt;

/// Fullscreen quad vertex (position + UV)
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct Vertex {
    position: [f32; 2],
    uv: [f32; 2],
}

const FULLSCREEN_QUAD: &[Vertex] = &[
    Vertex { position: [-1.0, -1.0], uv: [0.0, 1.0] },
    Vertex { position: [ 1.0, -1.0], uv: [1.0, 1.0] },
    Vertex { position: [-1.0,  1.0], uv: [0.0, 0.0] },
    Vertex { position: [ 1.0,  1.0], uv: [1.0, 0.0] },
];

const QUAD_INDICES: &[u16] = &[0, 1, 2, 2, 1, 3];

/// The vertex shader is constant — just passes through position and UV.
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

pub struct GpuRenderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    adapter_name: String,
    width: u32,
    height: u32,
    // Render target texture
    render_texture: wgpu::Texture,
    render_texture_view: wgpu::TextureView,
    // Readback buffer (GPU → CPU)
    readback_buffer: wgpu::Buffer,
    // Fullscreen quad geometry
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    // Vertex shader module (shared across all pipelines)
    vertex_module: wgpu::ShaderModule,
    // Uniform bind group layout (shared)
    pub uniform_bind_group_layout: wgpu::BindGroupLayout,
}

impl GpuRenderer {
    pub async fn new(width: u32, height: u32) -> Result<Self, Box<dyn std::error::Error>> {
        // Request GPU adapter (prefer high-performance discrete GPU)
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
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

        // Create render target texture (RGBA8, render attachment + copy source)
        let render_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("render_target"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let render_texture_view = render_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Readback buffer: GPU texture → CPU memory
        let bytes_per_row = Self::padded_bytes_per_row(width);
        let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback_buffer"),
            size: (bytes_per_row * height as usize) as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        // Fullscreen quad vertex + index buffers
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

        // Shared vertex shader
        let vertex_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("vertex_shader"),
            source: wgpu::ShaderSource::Wgsl(VERTEX_SHADER_WGSL.into()),
        });

        // Uniform bind group layout: a single uniform buffer at binding 0
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

        Ok(Self {
            device,
            queue,
            adapter_name,
            width,
            height,
            render_texture,
            render_texture_view,
            readback_buffer,
            vertex_buffer,
            index_buffer,
            vertex_module,
            uniform_bind_group_layout,
        })
    }

    pub fn adapter_name(&self) -> &str {
        &self.adapter_name
    }

    pub fn device(&self) -> &wgpu::Device {
        &self.device
    }

    /// Create a render pipeline for a compiled fragment shader module.
    pub fn create_pipeline(&self, fragment_module: &wgpu::ShaderModule) -> wgpu::RenderPipeline {
        let pipeline_layout = self.device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("render_pipeline_layout"),
            bind_group_layouts: &[&self.uniform_bind_group_layout],
            push_constant_ranges: &[],
        });

        self.device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("render_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &self.vertex_module,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as u64,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        // position
                        wgpu::VertexAttribute {
                            offset: 0,
                            shader_location: 0,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                        // uv
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
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
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

    /// Render a single frame: bind pipeline + uniforms, draw fullscreen quad.
    pub fn render_frame(&mut self, pipeline: &wgpu::RenderPipeline, uniform_data: &[u8]) {
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

        // Render pass
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("shader_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.render_texture_view,
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
            render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            render_pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
            render_pass.draw_indexed(0..QUAD_INDICES.len() as u32, 0, 0..1);
        }

        // Copy render texture → readback buffer
        let bytes_per_row = Self::padded_bytes_per_row(self.width);
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &self.render_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &self.readback_buffer,
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

        self.queue.submit(std::iter::once(encoder.finish()));
    }

    /// Read rendered pixels back from GPU. Returns RGBA8 buffer (width * height * 4 bytes).
    pub fn read_pixels(&self) -> Vec<u8> {
        let bytes_per_row = Self::padded_bytes_per_row(self.width);
        let unpadded_bytes_per_row = self.width as usize * 4;

        let buffer_slice = self.readback_buffer.slice(..);
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
        self.readback_buffer.unmap();

        pixels
    }

    /// wgpu requires rows to be aligned to 256 bytes.
    fn padded_bytes_per_row(width: u32) -> usize {
        let unpadded = width as usize * 4;
        let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT as usize;
        (unpadded + align - 1) & !(align - 1)
    }
}
