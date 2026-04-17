//! GPU multi-pass post-processing pipeline.
//!
//! Implements real spatial bloom via separable Gaussian blur — physically impossible
//! in Chrome/WebGL's single-pass fragment shader model. This is where we exceed Remotion.
//!
//! Pipeline:
//!   1. Bloom extract: threshold bright pixels from HDR scene → half-res texture
//!   2. Gaussian blur horizontal: 21-tap separable blur (sigma 8)
//!   3. Gaussian blur vertical: 21-tap separable blur (sigma 8)
//!   4. Bloom combine: additive blend bloom back onto scene
//!   5. Tonemap + grade: ACES filmic tone mapping, vignette, film grain
//!
//! All intermediate textures are at half resolution (1920x1080 for 4K output)
//! for 4x fewer fragment shader invocations with negligible quality loss.

use crate::gpu;
use wgpu::util::DeviceExt;

/// 21-tap Gaussian blur kernel (sigma ≈ 8.0, normalized)
const BLOOM_EXTRACT_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var scene_hdr: texture_2d<f32>;

struct PostProcessUniforms {
    bloom_threshold: f32,
    bloom_intensity: f32,
    energy: f32,
    time: f32,
    grain_amount: f32,
    vignette_strength: f32,
    resolution: vec2<f32>,
    bass: f32,
    onset_snap: f32,
    era_brightness: f32,
    era_sepia: f32,
    envelope_brightness: f32,
    envelope_saturation: f32,
    dynamic_time: f32,
    _pad: f32,
}
@group(0) @binding(2) var<uniform> pp: PostProcessUniforms;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(scene_hdr, tex_sampler, in.uv);
    let luminance = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    // Energy-reactive threshold: bright areas bloom more during high energy
    let threshold = mix(0.58, 0.18, pp.energy) + pp.bloom_threshold;
    let brightness = max(luminance - threshold, 0.0);
    // Soft knee: gradual transition instead of hard cutoff
    let knee = smoothstep(0.0, 0.3, brightness);
    return vec4<f32>(color.rgb * knee, 1.0);
}
"#;

const BLUR_H_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var bloom_tex: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_size = vec2<f32>(textureDimensions(bloom_tex));
    let pixel = 1.0 / tex_size.x;

    // 21-tap Gaussian (sigma ≈ 8.0) — wide enough for visible glow at 4K
    var color = textureSample(bloom_tex, tex_sampler, in.uv) * 0.0614940458401963;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 1.0, 0.0)) * 0.0610154953788405;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 1.0, 0.0)) * 0.0610154953788405;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 2.0, 0.0)) * 0.0596020729507300;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 2.0, 0.0)) * 0.0596020729507300;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 3.0, 0.0)) * 0.0573187533929180;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 3.0, 0.0)) * 0.0573187533929180;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 4.0, 0.0)) * 0.0542683049813684;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 4.0, 0.0)) * 0.0542683049813684;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 5.0, 0.0)) * 0.0505836223292604;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 5.0, 0.0)) * 0.0505836223292604;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 6.0, 0.0)) * 0.0464181410867075;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 6.0, 0.0)) * 0.0464181410867075;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 7.0, 0.0)) * 0.0419352958139972;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 7.0, 0.0)) * 0.0419352958139972;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 8.0, 0.0)) * 0.0372980241918532;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 8.0, 0.0)) * 0.0372980241918532;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 9.0, 0.0)) * 0.0326592412182720;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 9.0, 0.0)) * 0.0326592412182720;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(pixel * 10.0, 0.0)) * 0.0281540257359548;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(pixel * 10.0, 0.0)) * 0.0281540257359548;

    return color;
}
"#;

const BLUR_V_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var bloom_tex: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_size = vec2<f32>(textureDimensions(bloom_tex));
    let pixel = 1.0 / tex_size.y;

    // 21-tap Gaussian (same kernel as horizontal)
    var color = textureSample(bloom_tex, tex_sampler, in.uv) * 0.0614940458401963;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 1.0)) * 0.0610154953788405;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 1.0)) * 0.0610154953788405;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 2.0)) * 0.0596020729507300;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 2.0)) * 0.0596020729507300;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 3.0)) * 0.0573187533929180;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 3.0)) * 0.0573187533929180;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 4.0)) * 0.0542683049813684;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 4.0)) * 0.0542683049813684;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 5.0)) * 0.0505836223292604;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 5.0)) * 0.0505836223292604;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 6.0)) * 0.0464181410867075;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 6.0)) * 0.0464181410867075;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 7.0)) * 0.0419352958139972;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 7.0)) * 0.0419352958139972;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 8.0)) * 0.0372980241918532;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 8.0)) * 0.0372980241918532;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 9.0)) * 0.0326592412182720;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 9.0)) * 0.0326592412182720;
    color += textureSample(bloom_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel * 10.0)) * 0.0281540257359548;
    color += textureSample(bloom_tex, tex_sampler, in.uv - vec2<f32>(0.0, pixel * 10.0)) * 0.0281540257359548;

    return color;
}
"#;

/// FXAA anti-aliasing (Nvidia's Fast Approximate Anti-Aliasing).
/// Eliminates jagged edges on geometric shaders — impossible in Chrome's single-pass model
/// because FXAA requires sampling neighboring pixels from a completed frame.
const FXAA_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var input_tex: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn luminance(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let tex_size = vec2<f32>(textureDimensions(input_tex));
    let pixel = 1.0 / tex_size;

    // Sample center and 4 neighbors
    let center = textureSample(input_tex, tex_sampler, in.uv);
    let n = textureSample(input_tex, tex_sampler, in.uv + vec2<f32>(0.0, -pixel.y));
    let s = textureSample(input_tex, tex_sampler, in.uv + vec2<f32>(0.0, pixel.y));
    let e = textureSample(input_tex, tex_sampler, in.uv + vec2<f32>(pixel.x, 0.0));
    let w = textureSample(input_tex, tex_sampler, in.uv + vec2<f32>(-pixel.x, 0.0));

    // Luminance of center and neighbors
    let lum_c = luminance(center.rgb);
    let lum_n = luminance(n.rgb);
    let lum_s = luminance(s.rgb);
    let lum_e = luminance(e.rgb);
    let lum_w = luminance(w.rgb);

    let lum_min = min(lum_c, min(min(lum_n, lum_s), min(lum_e, lum_w)));
    let lum_max = max(lum_c, max(max(lum_n, lum_s), max(lum_e, lum_w)));
    let lum_range = lum_max - lum_min;

    // Skip FXAA for low-contrast areas
    if lum_range < max(0.0312, lum_max * 0.125) {
        return center;
    }

    // Compute edge direction
    let dir_x = -((lum_n + lum_s) - 2.0 * lum_c);
    let dir_y = (lum_e + lum_w) - 2.0 * lum_c;
    let dir_reduce = max((lum_n + lum_s + lum_e + lum_w) * 0.25 * 0.25, 1.0 / 128.0);
    let rcp_dir_min = 1.0 / (min(abs(dir_x), abs(dir_y)) + dir_reduce);

    let dir = clamp(
        vec2<f32>(dir_x, dir_y) * rcp_dir_min,
        vec2<f32>(-8.0),
        vec2<f32>(8.0),
    ) * pixel;

    // Two-tap filter along edge
    let result_a = 0.5 * (
        textureSample(input_tex, tex_sampler, in.uv + dir * (1.0 / 3.0 - 0.5)).rgb +
        textureSample(input_tex, tex_sampler, in.uv + dir * (2.0 / 3.0 - 0.5)).rgb
    );

    // Four-tap filter for wider edges
    let result_b = result_a * 0.5 + 0.25 * (
        textureSample(input_tex, tex_sampler, in.uv + dir * -0.5).rgb +
        textureSample(input_tex, tex_sampler, in.uv + dir * 0.5).rgb
    );

    let lum_b = luminance(result_b);

    // Use wider filter if it stays within luminance range
    if lum_b < lum_min || lum_b > lum_max {
        return vec4<f32>(result_a, 1.0);
    } else {
        return vec4<f32>(result_b, 1.0);
    }
}
"#;

/// Final compositing: add spatial bloom only, pass through everything else.
/// All tone mapping, grain, era grading, vignette, halation, CA, etc. are
/// already applied by the GLSL applyPostProcess() inside each shader.
/// The only thing Rust adds is real multi-pass spatial bloom (impossible in
/// single-pass WebGL) — this is the one advantage over the Remotion pipeline.
const COMPOSITE_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var scene_hdr: texture_2d<f32>;

struct PostProcessUniforms {
    bloom_threshold: f32,
    bloom_intensity: f32,
    energy: f32,
    time: f32,
    grain_amount: f32,
    vignette_strength: f32,
    resolution: vec2<f32>,
    bass: f32,
    onset_snap: f32,
    era_brightness: f32,
    era_sepia: f32,
    envelope_brightness: f32,
    envelope_saturation: f32,
    dynamic_time: f32,
    _pad: f32,
}
@group(0) @binding(2) var<uniform> pp: PostProcessUniforms;
@group(0) @binding(3) var bloom_tex: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var col = textureSample(scene_hdr, tex_sampler, in.uv).rgb;
    let bloom = textureSample(bloom_tex, tex_sampler, in.uv).rgb;

    // Ambient brightness floor: prevents pure black frames.
    let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
    let ambient_floor = vec3<f32>(0.015, 0.010, 0.025);
    let floor_strength = smoothstep(0.05, 0.0, luma);
    col = col + ambient_floor * floor_strength;

    // Subtle spatial bloom: 12% screen blend. GLSL handles per-pixel bloom;
    // this adds the SPATIAL spread that single-pass GLSL can't do.
    // Screen blend: col + bloom * (1 - col) — naturally can't exceed 1.0.
    let bloom_amount = 0.12;
    col = col + bloom * bloom_amount * (vec3<f32>(1.0) - col);

    // Soft Reinhard rolloff for HDR overshoot
    let white_point = 2.0;
    col = col * (vec3<f32>(1.0) + col / (white_point * white_point)) / (vec3<f32>(1.0) + col);
    col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

    return vec4<f32>(col, 1.0);
}
"#;

/// Uniform buffer for post-processing parameters.
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
pub struct PostProcessUniforms {
    pub bloom_threshold: f32,
    pub bloom_intensity: f32,
    pub energy: f32,
    pub time: f32,
    pub grain_amount: f32,
    pub vignette_strength: f32,
    pub resolution: [f32; 2],
    pub bass: f32,
    pub onset_snap: f32,
    pub era_brightness: f32,
    pub era_sepia: f32,
    pub envelope_brightness: f32,
    pub envelope_saturation: f32,
    pub dynamic_time: f32,
    pub _pad: f32,
}

/// GPU post-processing pipeline with bloom, tone mapping, film grain, and FXAA.
pub struct PostProcessPipeline {
    // Half-res bloom textures
    bloom_extract_texture: wgpu::Texture,
    bloom_extract_view: wgpu::TextureView,
    bloom_blur_texture: wgpu::Texture,
    bloom_blur_view: wgpu::TextureView,

    // Intermediate SDR texture (composite writes here, FXAA reads from it)
    pre_fxaa_texture: wgpu::Texture,
    pre_fxaa_view: wgpu::TextureView,

    // Pipelines
    bloom_extract_pipeline: wgpu::RenderPipeline,
    blur_h_pipeline: wgpu::RenderPipeline,
    blur_v_pipeline: wgpu::RenderPipeline,
    composite_pipeline: wgpu::RenderPipeline,
    fxaa_pipeline: wgpu::RenderPipeline,

    // Bind group layouts
    extract_bind_group_layout: wgpu::BindGroupLayout,
    blur_bind_group_layout: wgpu::BindGroupLayout,
    composite_bind_group_layout: wgpu::BindGroupLayout,

    // Half resolution
    half_width: u32,
    half_height: u32,
}

impl PostProcessPipeline {
    pub fn new(
        device: &wgpu::Device,
        vertex_module: &wgpu::ShaderModule,
        width: u32,
        height: u32,
    ) -> Self {
        let half_width = width / 2;
        let half_height = height / 2;

        // ─── Bloom textures (half-res, HDR) ───
        let bloom_extract_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("bloom_extract"),
            size: wgpu::Extent3d { width: half_width, height: half_height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: gpu::SCENE_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let bloom_extract_view = bloom_extract_texture.create_view(&Default::default());

        let bloom_blur_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("bloom_blur"),
            size: wgpu::Extent3d { width: half_width, height: half_height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: gpu::SCENE_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let bloom_blur_view = bloom_blur_texture.create_view(&Default::default());

        // ─── Bind group layouts ───

        // Extract: sampler + scene_hdr + uniforms
        let extract_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pp_extract_bgl"),
            entries: &[
                bgl_sampler(0),
                bgl_texture(1),
                bgl_uniform(2),
            ],
        });

        // Blur: sampler + bloom_tex (no uniforms needed)
        let blur_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pp_blur_bgl"),
            entries: &[
                bgl_sampler(0),
                bgl_texture(1),
            ],
        });

        // Composite: sampler + scene_hdr + uniforms + bloom_tex
        let composite_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pp_composite_bgl"),
            entries: &[
                bgl_sampler(0),
                bgl_texture(1),
                bgl_uniform(2),
                bgl_texture_at(3),
            ],
        });

        let vertex_buffers = &[wgpu::VertexBufferLayout {
            array_stride: 16,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute { offset: 0, shader_location: 0, format: wgpu::VertexFormat::Float32x2 },
                wgpu::VertexAttribute { offset: 8, shader_location: 1, format: wgpu::VertexFormat::Float32x2 },
            ],
        }];

        // ─── Pipelines ───
        let bloom_extract_pipeline = create_pp_pipeline(
            device, vertex_module, BLOOM_EXTRACT_WGSL, "bloom_extract",
            &extract_bind_group_layout, gpu::SCENE_FORMAT, vertex_buffers,
        );

        let blur_h_pipeline = create_pp_pipeline(
            device, vertex_module, BLUR_H_WGSL, "blur_h",
            &blur_bind_group_layout, gpu::SCENE_FORMAT, vertex_buffers,
        );

        let blur_v_pipeline = create_pp_pipeline(
            device, vertex_module, BLUR_V_WGSL, "blur_v",
            &blur_bind_group_layout, gpu::SCENE_FORMAT, vertex_buffers,
        );

        let composite_pipeline = create_pp_pipeline(
            device, vertex_module, COMPOSITE_WGSL, "composite",
            &composite_bind_group_layout, gpu::OUTPUT_FORMAT, vertex_buffers,
        );

        // ─── FXAA (uses blur_bind_group_layout: sampler + texture) ───
        let pre_fxaa_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("pre_fxaa"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: gpu::OUTPUT_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let pre_fxaa_view = pre_fxaa_texture.create_view(&Default::default());

        let fxaa_pipeline = create_pp_pipeline(
            device, vertex_module, FXAA_WGSL, "fxaa",
            &blur_bind_group_layout, gpu::OUTPUT_FORMAT, vertex_buffers,
        );

        Self {
            bloom_extract_texture,
            bloom_extract_view,
            bloom_blur_texture,
            bloom_blur_view,
            pre_fxaa_texture,
            pre_fxaa_view,
            bloom_extract_pipeline,
            blur_h_pipeline,
            blur_v_pipeline,
            composite_pipeline,
            fxaa_pipeline,
            extract_bind_group_layout,
            blur_bind_group_layout,
            composite_bind_group_layout,
            half_width,
            half_height,
        }
    }

    /// Run the full post-processing pipeline.
    /// Reads from scene_texture (HDR), writes to output_texture (SDR).
    /// If `skip_fxaa` is true, writes composite directly to output (preserves fractal detail).
    pub fn run(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        device: &wgpu::Device,
        sampler: &wgpu::Sampler,
        scene_view: &wgpu::TextureView,
        output_view: &wgpu::TextureView,
        uniforms: &PostProcessUniforms,
        vertex_buffer: &wgpu::Buffer,
        index_buffer: &wgpu::Buffer,
        skip_fxaa: bool,
    ) {
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("pp_uniforms"),
            contents: bytemuck::bytes_of(uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        // ─── Pass 1: Bloom extract (full-res → half-res bright pixels) ───
        let extract_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pp_extract_bg"),
            layout: &self.extract_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(sampler) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(scene_view) },
                wgpu::BindGroupEntry { binding: 2, resource: uniform_buffer.as_entire_binding() },
            ],
        });
        self.run_pass(encoder, &self.bloom_extract_pipeline, &extract_bg,
            &self.bloom_extract_view, vertex_buffer, index_buffer);

        // ─── Pass 2: Horizontal Gaussian blur ───
        let blur_h_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pp_blur_h_bg"),
            layout: &self.blur_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(sampler) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&self.bloom_extract_view) },
            ],
        });
        self.run_pass(encoder, &self.blur_h_pipeline, &blur_h_bg,
            &self.bloom_blur_view, vertex_buffer, index_buffer);

        // ─── Pass 3: Vertical Gaussian blur ───
        let blur_v_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pp_blur_v_bg"),
            layout: &self.blur_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(sampler) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&self.bloom_blur_view) },
            ],
        });
        self.run_pass(encoder, &self.blur_v_pipeline, &blur_v_bg,
            &self.bloom_extract_view, vertex_buffer, index_buffer);

        // ─── Pass 4: Composite (scene + subtle spatial bloom → pre-FXAA) ───
        let composite_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("pp_composite_bg"),
            layout: &self.composite_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(sampler) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(scene_view) },
                wgpu::BindGroupEntry { binding: 2, resource: uniform_buffer.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 3, resource: wgpu::BindingResource::TextureView(&self.bloom_extract_view) },
            ],
        });

        if skip_fxaa {
            // Write composite directly to output — preserves fine geometric detail
            // (fractal edges, mandala lines, sacred geometry patterns)
            self.run_pass(encoder, &self.composite_pipeline, &composite_bg,
                output_view, vertex_buffer, index_buffer);
        } else {
            // Composite → pre-FXAA buffer → FXAA → output
            self.run_pass(encoder, &self.composite_pipeline, &composite_bg,
                &self.pre_fxaa_view, vertex_buffer, index_buffer);

            let fxaa_bg = device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("pp_fxaa_bg"),
                layout: &self.blur_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(sampler) },
                    wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(&self.pre_fxaa_view) },
                ],
            });
            self.run_pass(encoder, &self.fxaa_pipeline, &fxaa_bg,
                output_view, vertex_buffer, index_buffer);
        }
    }

    fn run_pass(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        pipeline: &wgpu::RenderPipeline,
        bind_group: &wgpu::BindGroup,
        target: &wgpu::TextureView,
        vertex_buffer: &wgpu::Buffer,
        index_buffer: &wgpu::Buffer,
    ) {
        let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: None,
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target,
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
        rp.set_bind_group(0, bind_group, &[]);
        rp.set_vertex_buffer(0, vertex_buffer.slice(..));
        rp.set_index_buffer(index_buffer.slice(..), wgpu::IndexFormat::Uint16);
        rp.draw_indexed(0..6, 0, 0..1);
    }
}

// ─── Helper functions ───

fn bgl_sampler(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
        count: None,
    }
}

fn bgl_texture(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}

fn bgl_texture_at(binding: u32) -> wgpu::BindGroupLayoutEntry {
    bgl_texture(binding)
}

fn bgl_uniform(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

fn create_pp_pipeline(
    device: &wgpu::Device,
    vertex_module: &wgpu::ShaderModule,
    fragment_wgsl: &str,
    label: &str,
    bind_group_layout: &wgpu::BindGroupLayout,
    target_format: wgpu::TextureFormat,
    vertex_buffers: &[wgpu::VertexBufferLayout],
) -> wgpu::RenderPipeline {
    let fragment_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some(label),
        source: wgpu::ShaderSource::Wgsl(fragment_wgsl.into()),
    });

    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some(label),
        bind_group_layouts: &[bind_group_layout],
        push_constant_ranges: &[],
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
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
                format: target_format,
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
