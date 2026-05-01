//! End-to-end smoke for the GPU overlay compositing pipeline (Wave 4.1 phase B).
//!
//! Builds a tiny 2-overlay atlas, uploads it to GPU, encodes a single
//! composite pass over a black target, and asserts the target now has
//! non-zero pixels where the overlays were drawn.

use dead_air_renderer::{
    overlay_atlas::build_atlas,
    overlay_cache::CachedOverlay,
    overlay_pass::{OverlayCompositingPipeline, OverlayInstanceGPU},
};
use std::collections::HashMap;

#[test]
fn gpu_compositing_renders_at_least_one_pixel() {
    let renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(256, 256))
        .expect("GPU init");
    let device = renderer.device();
    let queue = renderer.queue();

    // Two solid-color sprites
    let mut overlays = HashMap::new();
    overlays.insert(
        "red".to_string(),
        CachedOverlay {
            pixels: vec![255u8; 64 * 64 * 4]
                .chunks_exact(4)
                .enumerate()
                .flat_map(|(_, _)| [255u8, 0, 0, 255])
                .collect(),
            width: 64,
            height: 64,
        },
    );
    overlays.insert(
        "blue".to_string(),
        CachedOverlay {
            pixels: vec![0u8; 64 * 64 * 4]
                .chunks_exact(4)
                .enumerate()
                .flat_map(|(_, _)| [0u8, 0, 255, 255])
                .collect(),
            width: 64,
            height: 64,
        },
    );
    let atlas = build_atlas(&overlays, 256).expect("build atlas");
    assert_eq!(atlas.lookup.len(), 2);

    let pipeline = OverlayCompositingPipeline::new(
        device,
        queue,
        &atlas,
        wgpu::TextureFormat::Rgba8UnormSrgb,
    );

    // Target texture, cleared to black before the pass.
    let target = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("overlay_smoke_target"),
        size: wgpu::Extent3d { width: 256, height: 256, depth_or_array_layers: 1 },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("overlay_smoke_encoder"),
    });
    // Clear pass.
    {
        let _rp = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("clear"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &target_view,
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
    }

    // Two centered overlays at slightly different positions and sizes.
    let red = atlas.lookup["red"];
    let blue = atlas.lookup["blue"];
    let instances = vec![
        OverlayInstanceGPU {
            center: [-0.4, 0.0],
            half_size: [0.3, 0.3],
            uv_rect: [red.uv_min[0], red.uv_min[1], red.uv_max[0], red.uv_max[1]],
            opacity: 1.0,
            rotation_rad: 0.0,
            blend_mode: 0,
            _pad: 0,
        },
        OverlayInstanceGPU {
            center: [0.4, 0.0],
            half_size: [0.3, 0.3],
            uv_rect: [blue.uv_min[0], blue.uv_min[1], blue.uv_max[0], blue.uv_max[1]],
            opacity: 1.0,
            rotation_rad: 0.0,
            blend_mode: 0,
            _pad: 0,
        },
    ];
    pipeline.encode(&mut encoder, device, &target_view, &instances);

    // Read pixels back via a staging buffer.
    let bpr_unpadded = 256 * 4;
    let bpr = ((bpr_unpadded + 255) / 256) * 256;
    let staging = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("overlay_smoke_staging"),
        size: (bpr * 256) as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &target,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &staging,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(bpr as u32),
                rows_per_image: Some(256),
            },
        },
        wgpu::Extent3d { width: 256, height: 256, depth_or_array_layers: 1 },
    );
    queue.submit(std::iter::once(encoder.finish()));

    let slice = staging.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |r| { tx.send(r).ok(); });
    let _ = device.poll(wgpu::Maintain::Wait);
    rx.recv().expect("receive").expect("map ok");
    let data = slice.get_mapped_range();

    // Count non-black pixels (anything with sum > 0).
    let mut non_black = 0usize;
    for row in 0..256usize {
        for col in 0..256usize {
            let i = row * bpr + col * 4;
            if data[i] > 5 || data[i + 1] > 5 || data[i + 2] > 5 {
                non_black += 1;
            }
        }
    }
    eprintln!("[overlay_pass_smoke] non-black pixels: {} of {}", non_black, 256 * 256);
    assert!(
        non_black > 1000,
        "GPU compositing produced only {} non-black pixels — pipeline broken",
        non_black,
    );
}

/// Catch Y-flip regressions: build a sprite that has a clear top/bottom
/// difference (red top half, blue bottom half) and render it. If the
/// pipeline flips V, the rendered colors swap. This is the bug that
/// shipped in Wave 4.1 and showed up as upside-down overlays in the field;
/// pin its absence here.
#[test]
fn gpu_compositing_does_not_y_flip() {
    use dead_air_renderer::{
        overlay_atlas::build_atlas,
        overlay_cache::CachedOverlay,
        overlay_pass::{OverlayCompositingPipeline, OverlayInstanceGPU},
    };
    use std::collections::HashMap;

    let renderer = pollster::block_on(dead_air_renderer::gpu::GpuRenderer::new(256, 256))
        .expect("GPU init");
    let device = renderer.device();
    let queue = renderer.queue();

    // 32x32 sprite: top half red, bottom half blue. Image-Y convention:
    // row 0 is the top.
    // Bright enough that both halves pass the luminance > 0.12 gate
    // in the GPU shader (otherwise the colored region is `discard`-ed
    // and we read black).
    let mut pixels = vec![0u8; 32 * 32 * 4];
    for row in 0..32 {
        for col in 0..32 {
            let i = (row * 32 + col) * 4;
            if row < 16 {
                pixels[i]     = 255; pixels[i+1] = 200; pixels[i+2] = 200; pixels[i+3] = 255;
            } else {
                pixels[i]     = 200; pixels[i+1] = 200; pixels[i+2] = 255; pixels[i+3] = 255;
            }
        }
    }
    let mut overlays = HashMap::new();
    overlays.insert("striped".to_string(), CachedOverlay { pixels, width: 32, height: 32 });
    let atlas = build_atlas(&overlays, 64).expect("atlas");
    let pipeline = OverlayCompositingPipeline::new(
        device, queue, &atlas, wgpu::TextureFormat::Rgba8UnormSrgb,
    );
    let entry = atlas.lookup["striped"];

    // Render at center, half_size 0.5 so it covers most of the target.
    let target = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("y_flip_target"),
        size: wgpu::Extent3d { width: 256, height: 256, depth_or_array_layers: 1 },
        mip_level_count: 1, sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let target_view = target.create_view(&wgpu::TextureViewDescriptor::default());
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("y_flip_encoder"),
    });
    {
        let _ = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("clear"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &target_view, resolve_target: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color::BLACK), store: wgpu::StoreOp::Store },
            })],
            depth_stencil_attachment: None, timestamp_writes: None, occlusion_query_set: None,
        });
    }
    let inst = OverlayInstanceGPU {
        center: [0.0, 0.0],
        half_size: [0.5, 0.5],
        uv_rect: [entry.uv_min[0], entry.uv_min[1], entry.uv_max[0], entry.uv_max[1]],
        opacity: 1.0,
        rotation_rad: 0.0,
        blend_mode: 0,
        _pad: 0,
    };
    pipeline.encode(&mut encoder, device, &target_view, &[inst]);

    // Readback
    let bpr = ((256 * 4 + 255) / 256) * 256;
    let staging = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("y_flip_stage"),
        size: (bpr * 256) as u64,
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
                bytes_per_row: Some(bpr as u32),
                rows_per_image: Some(256),
            },
        },
        wgpu::Extent3d { width: 256, height: 256, depth_or_array_layers: 1 },
    );
    queue.submit(std::iter::once(encoder.finish()));

    let slice = staging.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |r| { tx.send(r).ok(); });
    let _ = device.poll(wgpu::Maintain::Wait);
    rx.recv().unwrap().unwrap();
    let data = slice.get_mapped_range();

    // Sample row 96 (top half of target) — should be RED (the top half of
    // the sprite). Sample row 160 (bottom half) — should be BLUE.
    let sample = |row: usize, col: usize| -> [u8; 3] {
        let i = row * bpr as usize + col * 4;
        [data[i], data[i + 1], data[i + 2]]
    };
    let top = sample(96, 128);
    let bot = sample(160, 128);
    eprintln!("[y_flip] top sample: {:?}, bottom sample: {:?}", top, bot);

    // Top should be red-dominant.
    assert!(
        top[0] > top[2],
        "top of sprite shows blue ({:?}) — Y is flipped",
        top,
    );
    // Bottom should be blue-dominant.
    assert!(
        bot[2] > bot[0],
        "bottom of sprite shows red ({:?}) — Y is flipped",
        bot,
    );
}
