//! Smoke test for the GPU particle system.
//!
//! Audit Debt #15: compute.rs was fully implemented but never called from
//! the render loop. Before wiring it in, verify it actually constructs +
//! dispatches without errors on this hardware.

use dead_air_renderer::{compute, gpu};

#[test]
fn particle_system_constructs_and_dispatches() {
    let mut renderer = pollster::block_on(gpu::GpuRenderer::new(640, 360))
        .expect("GPU init");

    let particle_system = compute::ParticleSystem::new(
        renderer.device(),
        1024,
        renderer.vertex_module(),
    );

    // Dispatch one update tick.
    let uniforms = compute::ParticleUniforms {
        delta_time: 1.0 / 60.0,
        gravity: 0.5,
        drag: 0.98,
        energy: 0.7,
        bass: 0.5,
        time: 0.0,
        spawn_rate: 100.0,  // particles/sec
        turbulence: 0.3,
    };

    let mut encoder = renderer.device().create_command_encoder(
        &wgpu::CommandEncoderDescriptor { label: Some("particle_smoke") }
    );
    particle_system.update(&mut encoder, renderer.device(), &uniforms);
    let scene_view = renderer.create_scene_view();
    particle_system.render(&mut encoder, renderer.device(), &scene_view);
    renderer.queue().submit(std::iter::once(encoder.finish()));
    renderer.device().poll(wgpu::Maintain::Wait);
    // If we got here without panicking, the pipelines compiled and
    // dispatched cleanly.
    assert_eq!(particle_system.particle_count, 1024);
}

#[test]
fn particle_system_handles_zero_spawn_rate() {
    let mut renderer = pollster::block_on(gpu::GpuRenderer::new(640, 360))
        .expect("GPU init");

    let particle_system = compute::ParticleSystem::new(
        renderer.device(),
        256,
        renderer.vertex_module(),
    );

    // Zero spawn rate — all particles stay dead, render is degenerate
    // triangles. Should not crash.
    let uniforms = compute::ParticleUniforms {
        delta_time: 1.0 / 60.0,
        gravity: 0.0,
        drag: 1.0,
        energy: 0.0,
        bass: 0.0,
        time: 0.0,
        spawn_rate: 0.0,
        turbulence: 0.0,
    };

    let mut encoder = renderer.device().create_command_encoder(
        &wgpu::CommandEncoderDescriptor { label: Some("particle_zero_smoke") }
    );
    particle_system.update(&mut encoder, renderer.device(), &uniforms);
    let scene_view = renderer.create_scene_view();
    particle_system.render(&mut encoder, renderer.device(), &scene_view);
    renderer.queue().submit(std::iter::once(encoder.finish()));
    renderer.device().poll(wgpu::Maintain::Wait);
}
