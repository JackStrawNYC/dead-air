//! CPU vs GPU overlay compositing performance comparison.
//!
//! Wave 4.1 phase E — answers "how much do we actually win by going GPU?"
//! Times the same workload (10 overlays, 1080p target, 100 iterations) on
//! both paths and prints the ratio.
//!
//! `#[ignore]` because it's a benchmark, not a regression gate. Run with:
//!   cargo test --release --test overlay_cpu_gpu_perf -- --ignored --nocapture

use dead_air_renderer::{
    overlay_atlas::build_atlas,
    overlay_cache::{CachedOverlay, OverlayImageCache, OverlayInstance, OverlayTransform},
    overlay_pass::{instance_to_gpu, OverlayCompositingPipeline},
    compositor::BlendMode,
};
use std::collections::HashMap;
use std::time::Instant;

const WIDTH: u32 = 1920;
const HEIGHT: u32 = 1080;
const ITERATIONS: usize = 50;
const N_OVERLAYS: usize = 10;

fn make_overlay(seed: u8) -> CachedOverlay {
    let mut pixels = vec![0u8; 128 * 128 * 4];
    for chunk in pixels.chunks_exact_mut(4) {
        chunk[0] = 200u8.wrapping_add(seed.wrapping_mul(13));
        chunk[1] = 200u8.wrapping_add(seed.wrapping_mul(31));
        chunk[2] = 200u8.wrapping_add(seed.wrapping_mul(47));
        chunk[3] = 255;
    }
    CachedOverlay { pixels, width: 128, height: 128 }
}

#[test]
#[ignore]
fn cpu_vs_gpu_overlay_performance() {
    let renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(WIDTH, HEIGHT))
        .expect("GPU init");
    let device = renderer.device();
    let queue = renderer.queue();
    eprintln!("[perf] GPU: {}", renderer.adapter_name());
    eprintln!("[perf] target: {}x{}, {} overlays/frame, {} iterations", WIDTH, HEIGHT, N_OVERLAYS, ITERATIONS);

    // Build N overlays.
    let mut overlay_map = HashMap::new();
    for i in 0..N_OVERLAYS {
        overlay_map.insert(format!("ov{}", i), make_overlay(i as u8));
    }

    // CPU side: load via temp PNGs (matches production path).
    let mut cpu_cache = OverlayImageCache::new();
    let tmp_dir = std::env::temp_dir().join("overlay_perf_pngs");
    std::fs::create_dir_all(&tmp_dir).ok();
    for (id, ov) in &overlay_map {
        let p = tmp_dir.join(format!("{}.png", id));
        image::save_buffer(&p, &ov.pixels, ov.width, ov.height, image::ColorType::Rgba8).unwrap();
        cpu_cache.load_png(id, &p).unwrap();
    }

    // GPU side: atlas + pipeline.
    let atlas = build_atlas(&overlay_map, 1024).expect("atlas");
    let gpu_pipeline = OverlayCompositingPipeline::new(
        device, queue, &atlas, wgpu::TextureFormat::Rgba8Unorm,
    );

    // Build instance list — 10 overlays at varying positions/sizes.
    let instances: Vec<OverlayInstance> = (0..N_OVERLAYS).map(|i| {
        let t = i as f32 / N_OVERLAYS as f32;
        OverlayInstance {
            overlay_id: format!("ov{}", i),
            transform: OverlayTransform {
                opacity: 0.6 + t * 0.3,
                scale: 1.5 + t * 0.5,
                rotation_deg: t * 45.0,
                offset_x: -0.4 + t * 0.8,
                offset_y: (t - 0.5) * 0.5,
            },
            blend_mode: BlendMode::Screen,
            keyframe_svg: None,
            variant: None,
        }
    }).collect();

    // ─── CPU benchmark ───
    eprintln!("[perf] running CPU compositor...");
    let mut cpu_canvas = vec![20u8; (WIDTH * HEIGHT * 4) as usize];
    // Warmup
    for _ in 0..3 {
        for inst in &instances {
            cpu_cache.composite_instance(&mut cpu_canvas, WIDTH, HEIGHT, inst);
        }
    }
    let t0 = Instant::now();
    for _ in 0..ITERATIONS {
        cpu_canvas.fill(20);
        for inst in &instances {
            cpu_cache.composite_instance(&mut cpu_canvas, WIDTH, HEIGHT, inst);
        }
    }
    let cpu_elapsed = t0.elapsed();
    let cpu_ms_per_frame = cpu_elapsed.as_secs_f64() * 1000.0 / ITERATIONS as f64;

    // ─── GPU benchmark ───
    eprintln!("[perf] running GPU compositor...");
    let target = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("perf_target"),
        size: wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 },
        mip_level_count: 1, sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
    let gpu_instances: Vec<_> = instances.iter()
        .filter_map(|i| instance_to_gpu(i, &atlas, WIDTH, HEIGHT))
        .collect();

    // Warmup
    for _ in 0..3 {
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        gpu_pipeline.encode(&mut encoder, device, &target_view, &gpu_instances);
        queue.submit(std::iter::once(encoder.finish()));
        let _ = device.poll(wgpu::Maintain::Wait);
    }
    let t0 = Instant::now();
    for _ in 0..ITERATIONS {
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        gpu_pipeline.encode(&mut encoder, device, &target_view, &gpu_instances);
        queue.submit(std::iter::once(encoder.finish()));
        let _ = device.poll(wgpu::Maintain::Wait);
    }
    let gpu_elapsed = t0.elapsed();
    let gpu_ms_per_frame = gpu_elapsed.as_secs_f64() * 1000.0 / ITERATIONS as f64;

    eprintln!();
    eprintln!("[perf] ════════════════════════════════════════════════");
    eprintln!("[perf] CPU compositor:  {:8.2} ms/frame", cpu_ms_per_frame);
    eprintln!("[perf] GPU compositor:  {:8.2} ms/frame", gpu_ms_per_frame);
    eprintln!("[perf] Speedup:         {:8.1}x", cpu_ms_per_frame / gpu_ms_per_frame);
    eprintln!("[perf] ════════════════════════════════════════════════");

    std::fs::remove_dir_all(&tmp_dir).ok();
}
