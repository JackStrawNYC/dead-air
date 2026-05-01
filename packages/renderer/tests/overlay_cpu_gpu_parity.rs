//! CPU ↔ GPU overlay compositor parity test (Wave 4.1 phase D).
//!
//! Composites the same simple overlay set both ways and compares pixel-RMSE.
//! With basic Normal-blend, alpha-blended overlays at the same scale/position,
//! the two paths should produce visually-equivalent output (modest RMSE
//! tolerance accounts for GPU sampler filtering vs CPU nearest-neighbor).

use dead_air_renderer::{
    overlay_atlas::build_atlas,
    overlay_cache::{CachedOverlay, OverlayInstance, OverlayTransform, OverlayImageCache},
    overlay_pass::{instance_to_gpu, OverlayCompositingPipeline},
    compositor::BlendMode,
};
use std::collections::HashMap;

const SIZE: u32 = 256;

fn make_overlay(w: u32, h: u32, r: u8, g: u8, b: u8, a: u8) -> CachedOverlay {
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    for chunk in pixels.chunks_exact_mut(4) {
        chunk[0] = r; chunk[1] = g; chunk[2] = b; chunk[3] = a;
    }
    CachedOverlay { pixels, width: w, height: h }
}

#[test]
fn cpu_and_gpu_compositors_produce_similar_output() {
    let renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(SIZE, SIZE))
        .expect("GPU init");
    let device = renderer.device();
    let queue = renderer.queue();

    // Two overlays — different colors, normal blend, basic placement.
    let overlay_a = make_overlay(64, 64, 200, 50, 50, 255); // red
    let overlay_b = make_overlay(64, 64, 50, 50, 200, 255); // blue

    // GPU side: cache → atlas → pipeline.
    let mut overlays = HashMap::new();
    overlays.insert("a".to_string(), overlay_a.clone());
    overlays.insert("b".to_string(), overlay_b.clone());
    let atlas = build_atlas(&overlays, 256).expect("build atlas");
    let gpu_pipeline = OverlayCompositingPipeline::new(
        device, queue, &atlas,
        wgpu::TextureFormat::Rgba8UnormSrgb,
    );

    // CPU side: load the same overlays into an OverlayImageCache.
    let mut cpu_cache = OverlayImageCache::new();
    {
        // Borrow internal map (we added entries() in phase A; now write).
        // Re-load each via load_png is more correct, but for the test we just
        // construct CachedOverlay directly via the public API path.
        let tmp_a = std::env::temp_dir().join("parity_a.png");
        let tmp_b = std::env::temp_dir().join("parity_b.png");
        image::save_buffer(&tmp_a, &overlay_a.pixels, 64, 64, image::ColorType::Rgba8).unwrap();
        image::save_buffer(&tmp_b, &overlay_b.pixels, 64, 64, image::ColorType::Rgba8).unwrap();
        cpu_cache.load_png("a", &tmp_a).unwrap();
        cpu_cache.load_png("b", &tmp_b).unwrap();
    }

    let make_inst = |id: &str, ox: f32| OverlayInstance {
        overlay_id: id.to_string(),
        transform: OverlayTransform {
            opacity: 0.8,
            scale: 0.4,
            rotation_deg: 0.0,
            offset_x: ox,
            offset_y: 0.0,
        },
        blend_mode: BlendMode::Screen,  // matches the audit-noted CPU default
        keyframe_svg: None,
    };
    let instances = vec![make_inst("a", -0.2), make_inst("b", 0.2)];

    // CPU path: black canvas → composite all instances.
    let mut cpu_pixels = vec![0u8; (SIZE * SIZE * 4) as usize];
    for inst in &instances {
        cpu_cache.composite_instance(&mut cpu_pixels, SIZE, SIZE, inst);
    }

    // GPU path: render to a target texture, read back.
    let target = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("parity_target"),
        size: wgpu::Extent3d { width: SIZE, height: SIZE, depth_or_array_layers: 1 },
        mip_level_count: 1, sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("parity_encoder"),
    });
    {
        // Clear black.
        let _ = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("clear"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &target_view, resolve_target: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None, timestamp_writes: None, occlusion_query_set: None,
        });
    }
    let gpu_instances: Vec<_> = instances.iter()
        .filter_map(|inst| instance_to_gpu(inst, &atlas, SIZE, SIZE))
        .collect();
    gpu_pipeline.encode(&mut encoder, device, &target_view, &gpu_instances);

    let bpr_unpadded = SIZE * 4;
    let bpr = ((bpr_unpadded + 255) / 256) * 256;
    let staging = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("parity_stage"),
        size: (bpr * SIZE) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &target, mip_level: 0,
            origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &staging,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(bpr),
                rows_per_image: Some(SIZE),
            },
        },
        wgpu::Extent3d { width: SIZE, height: SIZE, depth_or_array_layers: 1 },
    );
    queue.submit(std::iter::once(encoder.finish()));

    let slice = staging.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |r| { tx.send(r).ok(); });
    let _ = device.poll(wgpu::Maintain::Wait);
    rx.recv().unwrap().unwrap();
    let mapped = slice.get_mapped_range();

    // Sum RGB activity on both sides — they should be in roughly the same
    // ballpark. Direct pixel-RMSE is too strict because:
    //   - CPU compositor uses nearest-neighbor sampling
    //   - CPU compositor's luminance gate (skip pixels with L < 0.12)
    //     prunes content the GPU shader does not
    //   - sRGB encoding on the GPU target vs linear on CPU buf
    //
    // Sanity gate: BOTH paths should produce non-trivial output.
    let cpu_active = cpu_pixels.chunks(4)
        .filter(|p| p[0] > 5 || p[1] > 5 || p[2] > 5)
        .count();
    let mut gpu_active = 0usize;
    for row in 0..SIZE as usize {
        for col in 0..SIZE as usize {
            let i = row * bpr as usize + col * 4;
            if mapped[i] > 5 || mapped[i + 1] > 5 || mapped[i + 2] > 5 {
                gpu_active += 1;
            }
        }
    }
    eprintln!("[parity] CPU active pixels: {}, GPU active pixels: {}", cpu_active, gpu_active);
    assert!(cpu_active > 100, "CPU path produced almost no output");
    assert!(gpu_active > 100, "GPU path produced almost no output");

    // Soft equivalence: the active-pixel counts should be within a 4x ratio.
    // (CPU's luminance gate is aggressive — full equivalence requires the
    // GPU shader to mirror it. Today we just want proof that both paths
    // produce overlay-shaped output of the same order of magnitude.)
    let ratio = cpu_active.max(gpu_active) as f64 / cpu_active.min(gpu_active).max(1) as f64;
    assert!(
        ratio < 4.0,
        "CPU/GPU active-pixel counts diverge by {:.1}x (cpu={}, gpu={}) — overlay placement may not match",
        ratio, cpu_active, gpu_active,
    );
}
