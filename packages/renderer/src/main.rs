//! Dead Air GPU Renderer — renders GLSL shaders directly on GPU via wgpu.
//!
//! Full pipeline:
//!   1. Load manifest (shader GLSL + per-frame uniforms + overlay SVGs)
//!   2. Compile shaders via naga (GLSL → WGSL → wgpu pipeline)
//!   3. For each frame:
//!      a. Render primary shader on GPU
//!      b. If transition: render secondary shader, blend
//!      c. Composite overlay SVGs via resvg
//!      d. Composite text layers (concert info, now playing, setlist)
//!      e. Pipe raw pixels to FFmpeg (or save PNG)
//!   4. FFmpeg encodes to H.264/H.265 video
//!
//! Usage:
//!   dead-air-renderer --manifest manifest.json -o show.mp4 --width 3840 --height 2160
//!   dead-air-renderer --manifest manifest.json --png-dir ./frames  # PNG mode (slower)

mod compositor;
mod ffmpeg;
pub mod glsl_compat;
mod gpu;
mod manifest;
mod shader_cache;
mod text_layers;
mod transition;
mod uniforms;

use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(name = "dead-air-renderer", about = "GPU-native GLSL shader renderer for Dead Air")]
struct Args {
    /// Path to frame manifest JSON
    #[arg(short, long)]
    manifest: PathBuf,

    /// Output video file (uses FFmpeg pipe). Mutually exclusive with --png-dir.
    #[arg(short, long)]
    output: Option<PathBuf>,

    /// Output directory for PNG frames (fallback, slower). Mutually exclusive with --output.
    #[arg(long)]
    png_dir: Option<PathBuf>,

    /// Render width
    #[arg(long, default_value_t = 3840)]
    width: u32,

    /// Render height
    #[arg(long, default_value_t = 2160)]
    height: u32,

    /// Output framerate
    #[arg(long, default_value_t = 60)]
    fps: u32,

    /// H.264 CRF quality (lower = better, 18 ≈ visually lossless)
    #[arg(long, default_value_t = 18)]
    crf: u32,

    /// Start frame
    #[arg(long, default_value_t = 0)]
    start_frame: u32,

    /// End frame (0 = all)
    #[arg(long, default_value_t = 0)]
    end_frame: u32,
}

fn main() {
    env_logger::init();
    let args = Args::parse();

    // Determine output mode
    let use_ffmpeg = args.output.is_some();
    if let Some(dir) = &args.png_dir {
        std::fs::create_dir_all(dir).expect("Failed to create PNG directory");
    }

    // Load manifest
    println!("Loading manifest: {}", args.manifest.display());
    let manifest =
        manifest::load_manifest(&args.manifest).expect("Failed to load manifest");

    let total_frames = if args.end_frame > 0 {
        (args.end_frame - args.start_frame) as usize
    } else {
        manifest.frames.len() - args.start_frame as usize
    };

    let output_label = if let Some(ref p) = args.output {
        format!("→ {}", p.display())
    } else if let Some(ref p) = args.png_dir {
        format!("→ {}/", p.display())
    } else {
        "→ (dry run)".into()
    };

    println!(
        "Rendering {} frames at {}x{} @ {}fps {}",
        total_frames, args.width, args.height, args.fps, output_label
    );

    // Initialize GPU
    let start = Instant::now();
    let mut renderer = pollster::block_on(gpu::GpuRenderer::new(args.width, args.height))
        .expect("Failed to initialize GPU");

    println!(
        "GPU: {} ({:.2}s)",
        renderer.adapter_name(),
        start.elapsed().as_secs_f64()
    );

    // Compile all shaders
    let mut shader_cache = shader_cache::ShaderCache::new();

    // Also compile secondary shaders for transitions
    let mut all_shader_ids: std::collections::HashSet<&str> = manifest
        .frames
        .iter()
        .map(|f| f.shader_id.as_str())
        .collect();
    for f in &manifest.frames {
        if let Some(ref sid) = f.secondary_shader_id {
            all_shader_ids.insert(sid.as_str());
        }
    }

    let mut compiled = 0;
    let mut failed = 0;
    for shader_id in &all_shader_ids {
        if let Some(glsl) = manifest.shaders.get(*shader_id) {
            match shader_cache.compile(&renderer, shader_id, glsl) {
                Ok(_) => compiled += 1,
                Err(e) => {
                    eprintln!("  WARN: {} failed: {}", shader_id, &e[..e.len().min(80)]);
                    failed += 1;
                }
            }
        }
    }
    println!("Shaders: {} compiled, {} failed", compiled, failed);

    // Start FFmpeg pipe if video output
    let mut ffmpeg_pipe = if let Some(ref output_path) = args.output {
        Some(
            ffmpeg::FfmpegPipe::new(args.width, args.height, args.fps, &output_path.to_string_lossy())
                .expect("Failed to start FFmpeg"),
        )
    } else {
        None
    };

    // Render loop
    let progress = ProgressBar::new(total_frames as u64);
    progress.set_style(
        ProgressStyle::with_template(
            "{spinner:.green} [{elapsed_precise}] [{bar:50.cyan/blue}] {pos}/{len} ({per_sec}, ETA: {eta})",
        )
        .unwrap()
        .progress_chars("=>-"),
    );

    let start_idx = args.start_frame as usize;
    let end_idx = if args.end_frame > 0 {
        args.end_frame as usize
    } else {
        manifest.frames.len()
    };

    for frame_idx in start_idx..end_idx {
        let frame = &manifest.frames[frame_idx];

        // ─── Step 1: Render primary shader ───
        let pipeline = match shader_cache.get_pipeline(&frame.shader_id) {
            Some(p) => p,
            None => {
                progress.inc(1);
                continue;
            }
        };

        let uniform_data = uniforms::build_uniform_buffer(frame, args.width, args.height);
        renderer.render_frame(pipeline, &uniform_data);
        let mut pixels = renderer.read_pixels();

        // ─── Step 2: Transition blending (if active) ───
        if let (Some(ref sec_id), Some(blend_prog)) =
            (&frame.secondary_shader_id, frame.blend_progress)
        {
            if let Some(sec_pipeline) = shader_cache.get_pipeline(sec_id) {
                renderer.render_frame(sec_pipeline, &uniform_data);
                let sec_pixels = renderer.read_pixels();

                let blend_mode = match frame.blend_mode.as_deref() {
                    Some("additive") => transition::TransitionBlendMode::Additive,
                    Some("luminance_key") => transition::TransitionBlendMode::LuminanceKey,
                    _ => transition::TransitionBlendMode::Dissolve,
                };

                pixels = transition::blend_transition(&pixels, &sec_pixels, blend_prog, blend_mode);
            }
        }

        // ─── Step 3: Composite overlays (from manifest) ───
        if let Some(ref overlay_layers) = manifest.overlay_layers {
            if let Some(frame_overlays) = overlay_layers.get(frame_idx) {
                compositor::composite_layers(&mut pixels, frame_overlays, args.width, args.height);
            }
        }

        // ─── Step 4: Output ───
        if let Some(ref mut pipe) = ffmpeg_pipe {
            pipe.write_frame(&pixels).expect("FFmpeg write failed");
        } else if let Some(ref dir) = args.png_dir {
            let path = dir.join(format!("frame_{:07}.png", frame_idx));
            image::save_buffer(&path, &pixels, args.width, args.height, image::ColorType::Rgba8)
                .expect("PNG save failed");
        }

        progress.inc(1);
    }

    progress.finish_with_message("done");

    // Finish FFmpeg encoding
    if let Some(pipe) = ffmpeg_pipe {
        print!("Encoding video... ");
        let frames_written = pipe.finish().expect("FFmpeg encoding failed");
        println!("done ({} frames)", frames_written);
    }

    let elapsed = start.elapsed();
    let fps_actual = total_frames as f64 / elapsed.as_secs_f64();
    println!(
        "\n{} frames in {:.1}s ({:.1} fps, {:.1}ms/frame)",
        total_frames,
        elapsed.as_secs_f64(),
        fps_actual,
        elapsed.as_secs_f64() * 1000.0 / total_frames as f64,
    );
}
