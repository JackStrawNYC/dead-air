//! GPU overlay compositing pass.
//!
//! Wave 4.1 phase B — pairs with `overlay_atlas.rs`. Uploads the packed
//! atlas to GPU once, then for each frame issues a single `draw` call
//! over per-instance vertex data describing transform + UV rect for
//! every active overlay. Replaces the per-pixel CPU compositor in
//! `overlay_cache::composite_instance`.
//!
//! Status: pipeline + WGSL shipped here; the render-loop hot-path swap
//! is phase C. Pixel-equivalence test against the CPU compositor is
//! the gate before flipping the default.

use crate::overlay_atlas::OverlayAtlas;
use bytemuck::{Pod, Zeroable};

/// Per-instance vertex attributes describing one overlay placement.
/// 8 floats (32 bytes) — fits in the GPU instance buffer cleanly.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct OverlayInstanceGPU {
    /// Center position in NDC-ish space (target-relative, [-1, 1]).
    pub center: [f32; 2],
    /// Half-width / half-height of the overlay quad in NDC-ish space.
    pub half_size: [f32; 2],
    /// Atlas UV rectangle: (uv_min.x, uv_min.y, uv_max.x, uv_max.y).
    pub uv_rect: [f32; 4],
    /// Opacity 0..1.
    pub opacity: f32,
    /// Rotation in radians (around center).
    pub rotation_rad: f32,
    /// Blend mode index. 0 = normal, 1 = screen, 2 = multiply.
    pub blend_mode: u32,
    /// Reserved for std430 alignment.
    pub _pad: u32,
}

const COMPOSITING_WGSL: &str = r#"
struct InstanceIn {
    @location(0) center: vec2<f32>,
    @location(1) half_size: vec2<f32>,
    @location(2) uv_rect: vec4<f32>,
    @location(3) opacity: f32,
    @location(4) rotation_rad: f32,
    @location(5) blend_mode: u32,
    @location(6) _pad: u32,
};

struct VsOut {
    @builtin(position) clip_pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) opacity: f32,
    @location(2) @interpolate(flat) blend_mode: u32,
};

// Six-vertex fullscreen quad expanded per instance via gl_VertexID
// (corner_idx in 0..6).
@vertex
fn vs_main(@builtin(vertex_index) vid: u32, inst: InstanceIn) -> VsOut {
    // Two triangles spanning [-1, 1] in instance-local space.
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0),
    );
    let local = corners[vid % 6u];

    // Rotate around instance center.
    let cos_r = cos(inst.rotation_rad);
    let sin_r = sin(inst.rotation_rad);
    let scaled = vec2<f32>(local.x * inst.half_size.x, local.y * inst.half_size.y);
    let rotated = vec2<f32>(
        scaled.x * cos_r - scaled.y * sin_r,
        scaled.x * sin_r + scaled.y * cos_r,
    );
    let pos = inst.center + rotated;

    // Atlas UV from local quad coordinate.
    let t = (local + vec2<f32>(1.0, 1.0)) * 0.5; // 0..1 across the quad
    let uv = mix(inst.uv_rect.xy, inst.uv_rect.zw, t);

    var out: VsOut;
    out.clip_pos = vec4<f32>(pos, 0.0, 1.0);
    out.uv = uv;
    out.opacity = inst.opacity;
    out.blend_mode = inst.blend_mode;
    return out;
}

@group(0) @binding(0) var atlas_tex: texture_2d<f32>;
@group(0) @binding(1) var atlas_samp: sampler;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let src = textureSample(atlas_tex, atlas_samp, in.uv);
    // Match the CPU compositor's luminance gate (overlay_cache.rs:252):
    // overlay PNGs have opaque dark backgrounds; only pixels above ~12%
    // luminance are real content. Without this gate, GPU compositing
    // shows the full sprite quad instead of just the icon.
    let luma = dot(src.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    if (luma < 0.12) {
        discard;
    }
    return vec4<f32>(src.rgb, src.a * in.opacity);
}
"#;

pub struct OverlayCompositingPipeline {
    pub atlas_texture: wgpu::Texture,
    pub atlas_view: wgpu::TextureView,
    pub atlas_sampler: wgpu::Sampler,
    pub bind_group_layout: wgpu::BindGroupLayout,
    pub bind_group: wgpu::BindGroup,
    pub pipeline: wgpu::RenderPipeline,
    pub atlas_width: u32,
    pub atlas_height: u32,
}

impl OverlayCompositingPipeline {
    /// Upload an atlas to GPU and build the rendering pipeline that targets
    /// `target_format`. Use `crate::gpu::OUTPUT_FORMAT` to composite onto the
    /// final SDR output texture.
    pub fn new(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        atlas: &OverlayAtlas,
        target_format: wgpu::TextureFormat,
    ) -> Self {
        let atlas_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("overlay_atlas"),
            size: wgpu::Extent3d {
                width: atlas.width,
                height: atlas.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &atlas_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &atlas.pixels,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(atlas.width * 4),
                rows_per_image: Some(atlas.height),
            },
            wgpu::Extent3d {
                width: atlas.width,
                height: atlas.height,
                depth_or_array_layers: 1,
            },
        );
        let atlas_view = atlas_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let atlas_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("overlay_atlas_sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            ..Default::default()
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("overlay_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        multisampled: false,
                        view_dimension: wgpu::TextureViewDimension::D2,
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("overlay_bg"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&atlas_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&atlas_sampler),
                },
            ],
        });

        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("overlay_composit_wgsl"),
            source: wgpu::ShaderSource::Wgsl(COMPOSITING_WGSL.into()),
        });

        let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("overlay_pipeline_layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("overlay_pipeline"),
            layout: Some(&layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<OverlayInstanceGPU>() as u64,
                    step_mode: wgpu::VertexStepMode::Instance,
                    attributes: &[
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x2, offset: 0,  shader_location: 0 },
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x2, offset: 8,  shader_location: 1 },
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x4, offset: 16, shader_location: 2 },
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32,   offset: 32, shader_location: 3 },
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32,   offset: 36, shader_location: 4 },
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Uint32,    offset: 40, shader_location: 5 },
                        wgpu::VertexAttribute { format: wgpu::VertexFormat::Uint32,    offset: 44, shader_location: 6 },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: target_format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        Self {
            atlas_texture,
            atlas_view,
            atlas_sampler,
            bind_group_layout,
            bind_group,
            pipeline,
            atlas_width: atlas.width,
            atlas_height: atlas.height,
        }
    }

    /// Encode a single composite-overlays pass that draws all `instances`
    /// into `target` using the prebuilt pipeline. Caller owns the encoder
    /// (keeps it transparent how this fits into the wider render loop).
    pub fn encode(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        device: &wgpu::Device,
        target: &wgpu::TextureView,
        instances: &[OverlayInstanceGPU],
    ) {
        if instances.is_empty() {
            return;
        }
        // Per-frame: upload instance data to a small VBO. Re-create each call
        // for simplicity; phase C optimization will reuse a pool.
        let instance_buffer = wgpu::util::DeviceExt::create_buffer_init(
            device,
            &wgpu::util::BufferInitDescriptor {
                label: Some("overlay_instances"),
                contents: bytemuck::cast_slice(instances),
                usage: wgpu::BufferUsages::VERTEX,
            },
        );

        let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("overlay_composite_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load,        // composite ON TOP — keep existing frame
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });
        rp.set_pipeline(&self.pipeline);
        rp.set_bind_group(0, &self.bind_group, &[]);
        rp.set_vertex_buffer(0, instance_buffer.slice(..));
        rp.draw(0..6, 0..instances.len() as u32);
    }
}

/// Convert one schedule overlay instance into a GPU instance, given the atlas
/// lookup and the target render dimensions. Returns None when the overlay
/// isn't in the atlas or when its keyframe SVG would fall back to the CPU
/// rasterizer.
///
/// Scale semantics match `overlay_cache::composite_transformed`:
/// `scale = 1.0` means the source PNG is mapped 1:1 onto the target (so the
/// overlay covers `src_size` target pixels). The NDC half-extent is therefore
/// `(src_size * scale) / target_dim`.
pub fn instance_to_gpu(
    inst: &crate::overlay_cache::OverlayInstance,
    atlas: &crate::overlay_atlas::OverlayAtlas,
    target_width: u32,
    target_height: u32,
) -> Option<OverlayInstanceGPU> {
    if inst.keyframe_svg.is_some() {
        return None;
    }
    let entry = atlas.lookup.get(&inst.overlay_id)?;
    let center = [inst.transform.offset_x * 2.0, inst.transform.offset_y * 2.0];
    // Convert source pixel size → NDC half-extent at the requested scale.
    let half_w_ndc = (entry.src_size[0] as f32 * inst.transform.scale) / target_width as f32;
    let half_h_ndc = (entry.src_size[1] as f32 * inst.transform.scale) / target_height as f32;
    let blend_mode = match inst.blend_mode {
        crate::compositor::BlendMode::Normal => 0u32,
        crate::compositor::BlendMode::Screen => 1,
        crate::compositor::BlendMode::Multiply => 2,
        _ => 1,
    };
    Some(OverlayInstanceGPU {
        center,
        half_size: [half_w_ndc, half_h_ndc],
        uv_rect: [entry.uv_min[0], entry.uv_min[1], entry.uv_max[0], entry.uv_max[1]],
        opacity: inst.transform.opacity,
        rotation_rad: inst.transform.rotation_deg.to_radians(),
        blend_mode,
        _pad: 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_layout_size_is_48_bytes() {
        // 7 attributes (2+2+4+1+1+1+1 floats) — total 12 floats × 4 bytes = 48
        assert_eq!(std::mem::size_of::<OverlayInstanceGPU>(), 48);
    }

    #[test]
    fn instance_is_pod() {
        // Sanity that bytemuck zeroable+pod traits work; this catches accidental
        // padding insertions when fields are added.
        let zero: OverlayInstanceGPU = bytemuck::Zeroable::zeroed();
        let bytes: &[u8] = bytemuck::bytes_of(&zero);
        assert_eq!(bytes.len(), 48);
        assert!(bytes.iter().all(|b| *b == 0));
    }
}
