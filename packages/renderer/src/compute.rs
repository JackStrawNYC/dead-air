//! Compute shader foundation — GPU-side particle systems and future effects.
//!
//! WebGL has NO compute shaders. This is a fundamental capability that Chrome/Remotion
//! simply cannot match. Compute shaders enable:
//!   - Particle systems with 100K-1M particles (forces, lifetimes, collisions)
//!   - 2D fluid simulation (Navier-Stokes on GPU)
//!   - Real-time FFT on GPU
//!   - Physics-driven visual effects
//!
//! Architecture:
//!   1. Particle state stored in GPU storage buffers
//!   2. Compute shader dispatches update particle positions/velocities
//!   3. Render pass reads particle buffer for visualization (instanced quads)
//!   4. Per-frame: dispatch compute → render particles → composite with scene

use wgpu::util::DeviceExt;
use crate::gpu;

/// Particle render shader — draws particles as point sprites from storage buffer.
const PARTICLE_RENDER_VERT_WGSL: &str = r#"
struct Particle {
    position: vec2<f32>,
    velocity: vec2<f32>,
    color: vec4<f32>,
    life: f32,
    max_life: f32,
    size: f32,
    _pad: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_id: u32, @builtin(instance_index) instance_id: u32) -> VertexOutput {
    let p = particles[instance_id];
    var out: VertexOutput;

    if p.life <= 0.0 {
        // Dead particle — degenerate triangle (invisible)
        out.clip_position = vec4<f32>(0.0, 0.0, -2.0, 1.0);
        out.color = vec4<f32>(0.0);
        out.uv = vec2<f32>(0.0);
        return out;
    }

    // Quad vertices (2 triangles, 6 vertices per particle)
    let quad_verts = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    );
    let v = quad_verts[vertex_id % 6u];

    out.clip_position = vec4<f32>(p.position + v * p.size, 0.0, 1.0);
    out.color = p.color;
    out.uv = v * 0.5 + 0.5;
    return out;
}
"#;

const PARTICLE_RENDER_FRAG_WGSL: &str = r#"
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Soft circle falloff
    let dist = length(in.uv - vec2<f32>(0.5));
    let alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    return vec4<f32>(in.color.rgb * alpha * in.color.a, alpha * in.color.a);
}
"#;

/// Particle state stored in GPU storage buffer.
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Particle {
    pub position: [f32; 2],   // x, y in NDC (-1 to 1)
    pub velocity: [f32; 2],   // dx, dy per second
    pub color: [f32; 4],      // RGBA
    pub life: f32,            // remaining life (0 = dead)
    pub max_life: f32,        // initial life (for alpha fade)
    pub size: f32,            // particle radius
    pub _pad: f32,
}

/// Compute shader uniforms (time, forces, spawn params).
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
pub struct ParticleUniforms {
    pub delta_time: f32,
    pub gravity: f32,         // downward force
    pub drag: f32,            // velocity damping (0.98 typical)
    pub energy: f32,          // audio energy for reactive spawning
    pub bass: f32,            // bass for force modulation
    pub time: f32,            // for noise-based turbulence
    pub spawn_rate: f32,      // particles per second
    pub turbulence: f32,      // noise-based force strength
}

const PARTICLE_UPDATE_WGSL: &str = r#"
struct Particle {
    position: vec2<f32>,
    velocity: vec2<f32>,
    color: vec4<f32>,
    life: f32,
    max_life: f32,
    size: f32,
    _pad: f32,
}

struct Params {
    delta_time: f32,
    gravity: f32,
    drag: f32,
    energy: f32,
    bass: f32,
    time: f32,
    spawn_rate: f32,
    turbulence: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;

fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

@compute @workgroup_size(256)
fn cs_main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if idx >= arrayLength(&particles) {
        return;
    }

    var p = particles[idx];

    if p.life <= 0.0 {
        // Dead particle — respawn if spawn rate allows
        let spawn_hash = hash21(vec2<f32>(f32(idx), params.time));
        if spawn_hash < params.spawn_rate * params.delta_time {
            // Spawn at center with random velocity
            let angle = hash21(vec2<f32>(f32(idx) * 7.13, params.time * 3.7)) * 6.283;
            let speed = 0.5 + hash21(vec2<f32>(f32(idx) * 13.37, params.time)) * params.energy * 2.0;
            p.position = vec2<f32>(0.0, 0.0);
            p.velocity = vec2<f32>(cos(angle), sin(angle)) * speed;
            p.life = 1.0 + hash21(vec2<f32>(f32(idx), params.time * 0.1)) * 3.0;
            p.max_life = p.life;
            p.size = 0.002 + hash21(vec2<f32>(f32(idx) * 0.7, params.time)) * 0.008;
            // Color from energy (warm at high energy, cool at low)
            let hue = hash21(vec2<f32>(f32(idx) * 2.3, params.time * 0.5));
            p.color = vec4<f32>(
                0.5 + 0.5 * cos(hue * 6.283 + 0.0),
                0.5 + 0.5 * cos(hue * 6.283 + 2.094),
                0.5 + 0.5 * cos(hue * 6.283 + 4.189),
                1.0,
            );
        }
    } else {
        // Alive — update physics
        let dt = params.delta_time;

        // Gravity
        p.velocity.y -= params.gravity * dt;

        // Turbulence (noise-based force)
        let turb_x = hash21(p.position * 10.0 + vec2<f32>(params.time, 0.0)) - 0.5;
        let turb_y = hash21(p.position * 10.0 + vec2<f32>(0.0, params.time)) - 0.5;
        p.velocity += vec2<f32>(turb_x, turb_y) * params.turbulence * params.bass * dt;

        // Drag
        p.velocity *= params.drag;

        // Integrate position
        p.position += p.velocity * dt;

        // Age
        p.life -= dt;

        // Alpha fade based on remaining life
        p.color.a = clamp(p.life / p.max_life, 0.0, 1.0);
    }

    particles[idx] = p;
}
"#;

/// GPU particle system with compute shader updates and instanced rendering.
pub struct ParticleSystem {
    /// Storage buffer holding all particle state
    pub particle_buffer: wgpu::Buffer,
    pub particle_count: u32,

    /// Compute pipeline for particle updates
    compute_pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,

    /// Render pipeline for drawing particles as additive point sprites
    render_pipeline: wgpu::RenderPipeline,
    render_bind_group_layout: wgpu::BindGroupLayout,
}

impl ParticleSystem {
    pub fn new(device: &wgpu::Device, max_particles: u32, _vertex_module: &wgpu::ShaderModule) -> Self {
        let particle_size = std::mem::size_of::<Particle>() as u64;
        let buffer_size = particle_size * max_particles as u64;

        // Initialize all particles as dead (life = 0)
        let initial_data = vec![0u8; buffer_size as usize];
        let particle_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("particle_buffer"),
            contents: &initial_data,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::VERTEX,
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("particle_compute_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let compute_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("particle_compute"),
            source: wgpu::ShaderSource::Wgsl(PARTICLE_UPDATE_WGSL.into()),
        });

        let compute_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("particle_compute_layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("particle_compute_pipeline"),
            layout: Some(&compute_pipeline_layout),
            module: &compute_module,
            entry_point: Some("cs_main"),
            compilation_options: Default::default(),
            cache: None,
        });

        // ─── Render pipeline (instanced point sprites with additive blend) ───
        let render_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("particle_render_bgl"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let vert_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("particle_vert"),
            source: wgpu::ShaderSource::Wgsl(PARTICLE_RENDER_VERT_WGSL.into()),
        });
        let frag_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("particle_frag"),
            source: wgpu::ShaderSource::Wgsl(PARTICLE_RENDER_FRAG_WGSL.into()),
        });

        let render_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("particle_render_layout"),
            bind_group_layouts: &[&render_bind_group_layout],
            push_constant_ranges: &[],
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("particle_render_pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &vert_module,
                entry_point: Some("vs_main"),
                buffers: &[], // no vertex buffers — positions from storage buffer
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &frag_module,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: gpu::SCENE_FORMAT,
                    // Additive blend: particles glow on top of scene
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::SrcAlpha,
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
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        Self {
            particle_buffer,
            particle_count: max_particles,
            compute_pipeline,
            bind_group_layout,
            render_pipeline,
            render_bind_group_layout,
        }
    }

    /// Render particles as additive point sprites onto an HDR target.
    /// Call AFTER update() and AFTER the scene shader pass (particles overlay the scene).
    pub fn render(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        device: &wgpu::Device,
        target_view: &wgpu::TextureView,
    ) {
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("particle_render_bg"),
            layout: &self.render_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.particle_buffer.as_entire_binding(),
                },
            ],
        });

        // Render with LoadOp::Load to preserve the existing scene content
        let mut rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("particle_render_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: target_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load, // preserve scene underneath
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });

        rp.set_pipeline(&self.render_pipeline);
        rp.set_bind_group(0, &bind_group, &[]);
        // 6 vertices per particle (quad), instanced across all particles
        rp.draw(0..6, 0..self.particle_count);
    }

    /// Dispatch compute shader to update all particles.
    pub fn update(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        device: &wgpu::Device,
        uniforms: &ParticleUniforms,
    ) {
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("particle_uniforms"),
            contents: bytemuck::bytes_of(uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("particle_compute_bg"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.particle_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: uniform_buffer.as_entire_binding(),
                },
            ],
        });

        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("particle_update"),
            timestamp_writes: None,
        });

        pass.set_pipeline(&self.compute_pipeline);
        pass.set_bind_group(0, &bind_group, &[]);

        // Dispatch enough workgroups for all particles (256 per workgroup)
        let workgroups = (self.particle_count + 255) / 256;
        pass.dispatch_workgroups(workgroups, 1, 1);
    }
}
