//! GPU-native transition blending — crossfade between two shader renders entirely on GPU.
//!
//! Both shaders render to separate HDR textures, then a transition shader blends
//! them in a single pass. No CPU readback between shaders = no bottleneck.
//!
//! Blend modes:
//!   - dissolve: linear opacity crossfade (default)
//!   - additive: both contribute light (glow effect)
//!   - luminance_key: bright areas of incoming punch through first
//!   - noise_dissolve: organic noise-based dissolve (GPU-only, new)

use serde::Deserialize;
use wgpu::util::DeviceExt;

#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TransitionBlendMode {
    #[default]
    Dissolve,
    Additive,
    LuminanceKey,
}

const TRANSITION_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var tex_from: texture_2d<f32>;
@group(0) @binding(2) var tex_to: texture_2d<f32>;

struct BlendUniforms {
    progress: f32,
    mode: u32,     // 0=dissolve, 1=additive, 2=luminance_key, 3=noise_dissolve
    _pad0: f32,
    _pad1: f32,
}
@group(0) @binding(3) var<uniform> blend: BlendUniforms;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let from_col = textureSample(tex_from, tex_sampler, in.uv);
    let to_col = textureSample(tex_to, tex_sampler, in.uv);
    let p = blend.progress;
    var result: vec3<f32>;

    switch blend.mode {
        // Dissolve: linear crossfade
        case 0u: {
            result = mix(from_col.rgb, to_col.rgb, p);
        }
        // Additive: both contribute light
        case 1u: {
            result = min(from_col.rgb + to_col.rgb * p, vec3<f32>(1.5));
        }
        // Luminance key: bright areas punch through first
        case 2u: {
            let to_lum = dot(to_col.rgb, vec3<f32>(0.299, 0.587, 0.114));
            let effective_p = clamp(p * 2.0 * to_lum, 0.0, 1.0);
            result = mix(from_col.rgb, to_col.rgb, effective_p);
        }
        // Noise dissolve: organic noise-based transition (GPU-only)
        case 3u: {
            let noise = hash21(in.uv * 200.0);
            let edge = smoothstep(p - 0.1, p + 0.1, noise);
            result = mix(to_col.rgb, from_col.rgb, edge);
        }
        default: {
            result = mix(from_col.rgb, to_col.rgb, p);
        }
    }

    return vec4<f32>(result, 1.0);
}
"#;

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct BlendUniforms {
    progress: f32,
    mode: u32,
    _pad0: f32,
    _pad1: f32,
}

/// GPU transition pipeline — blends two HDR textures on GPU.
pub struct GpuTransitionPipeline {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl GpuTransitionPipeline {
    pub fn new(device: &wgpu::Device, vertex_module: &wgpu::ShaderModule) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("transition_bgl"),
            entries: &[
                // binding 0: sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                // binding 1: from texture
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
                // binding 2: to texture
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
                // binding 3: blend uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
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
            label: Some("transition_shader"),
            source: wgpu::ShaderSource::Wgsl(TRANSITION_WGSL.into()),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("transition_pipeline_layout"),
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

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("transition_pipeline"),
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
                    format: crate::gpu::SCENE_FORMAT,
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

        Self { pipeline, bind_group_layout }
    }

    /// Blend two HDR textures and write to the target view.
    pub fn run_blend(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        device: &wgpu::Device,
        sampler: &wgpu::Sampler,
        from_view: &wgpu::TextureView,
        to_view: &wgpu::TextureView,
        target_view: &wgpu::TextureView,
        progress: f32,
        blend_mode: &str,
        vertex_buffer: &wgpu::Buffer,
        index_buffer: &wgpu::Buffer,
    ) {
        let mode: u32 = match blend_mode {
            "additive" => 1,
            "luminance_key" => 2,
            "noise_dissolve" => 3,
            _ => 0, // dissolve
        };

        let uniforms = BlendUniforms {
            progress: progress.clamp(0.0, 1.0),
            mode,
            _pad0: 0.0,
            _pad1: 0.0,
        };

        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("blend_uniforms"),
            contents: bytemuck::bytes_of(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("transition_bg"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(sampler) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(from_view) },
                wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(to_view) },
                wgpu::BindGroupEntry { binding: 3, resource: uniform_buffer.as_entire_binding() },
            ],
        });

        let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("transition_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target_view,
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

        rp.set_pipeline(&self.pipeline);
        rp.set_bind_group(0, &bind_group, &[]);
        rp.set_vertex_buffer(0, vertex_buffer.slice(..));
        rp.set_index_buffer(index_buffer.slice(..), wgpu::IndexFormat::Uint16);
        rp.draw_indexed(0..6, 0, 0..1);
    }
}

/// CPU-side transition blending (legacy fallback, kept for non-GPU paths).
pub fn blend_transition(
    from_pixels: &[u8],
    to_pixels: &[u8],
    progress: f32,
    mode: TransitionBlendMode,
) -> Vec<u8> {
    assert_eq!(from_pixels.len(), to_pixels.len());
    let mut output = vec![0u8; from_pixels.len()];
    let p = progress.clamp(0.0, 1.0);

    for i in (0..from_pixels.len()).step_by(4) {
        let fr = from_pixels[i] as f32 / 255.0;
        let fg = from_pixels[i + 1] as f32 / 255.0;
        let fb = from_pixels[i + 2] as f32 / 255.0;

        let tr = to_pixels[i] as f32 / 255.0;
        let tg = to_pixels[i + 1] as f32 / 255.0;
        let tb = to_pixels[i + 2] as f32 / 255.0;

        let (rr, rg, rb) = match mode {
            TransitionBlendMode::Dissolve => {
                (
                    fr * (1.0 - p) + tr * p,
                    fg * (1.0 - p) + tg * p,
                    fb * (1.0 - p) + tb * p,
                )
            }
            TransitionBlendMode::Additive => {
                let cap = 1.5;
                (
                    (fr + tr * p).min(cap),
                    (fg + tg * p).min(cap),
                    (fb + tb * p).min(cap),
                )
            }
            TransitionBlendMode::LuminanceKey => {
                let to_lum = 0.299 * tr + 0.587 * tg + 0.114 * tb;
                let effective_p = (p * 2.0 * to_lum).clamp(0.0, 1.0);
                (
                    fr * (1.0 - effective_p) + tr * effective_p,
                    fg * (1.0 - effective_p) + tg * effective_p,
                    fb * (1.0 - effective_p) + tb * effective_p,
                )
            }
        };

        output[i] = (rr * 255.0).clamp(0.0, 255.0) as u8;
        output[i + 1] = (rg * 255.0).clamp(0.0, 255.0) as u8;
        output[i + 2] = (rb * 255.0).clamp(0.0, 255.0) as u8;
        output[i + 3] = 255;
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dissolve_midpoint() {
        let from = vec![200, 100, 0, 255];
        let to = vec![0, 100, 200, 255];
        let result = blend_transition(&from, &to, 0.5, TransitionBlendMode::Dissolve);
        assert_eq!(result[0], 100);
        assert_eq!(result[1], 100);
        assert_eq!(result[2], 100);
    }

    #[test]
    fn test_dissolve_endpoints() {
        let from = vec![255, 0, 0, 255];
        let to = vec![0, 0, 255, 255];
        let r0 = blend_transition(&from, &to, 0.0, TransitionBlendMode::Dissolve);
        assert_eq!(r0[0], 255);
        assert_eq!(r0[2], 0);
        let r1 = blend_transition(&from, &to, 1.0, TransitionBlendMode::Dissolve);
        assert_eq!(r1[0], 0);
        assert_eq!(r1[2], 255);
    }

    #[test]
    fn test_additive_brightens() {
        let from = vec![128, 128, 128, 255];
        let to = vec![128, 128, 128, 255];
        let result = blend_transition(&from, &to, 1.0, TransitionBlendMode::Additive);
        assert!(result[0] > 200, "Additive should brighten: {}", result[0]);
    }
}
