//! Dead Air GPU Renderer — renders GLSL shaders directly on GPU via wgpu.
//!
//! Full pipeline:
//!   1. Load manifest (shader GLSL + per-frame uniforms + overlay SVGs)
//!   2. Compile shaders via naga (GLSL → WGSL → wgpu pipeline)
//!   3. For each frame:
//!      a. Render primary shader on GPU (HDR)
//!      b. If transition: render secondary shader, blend
//!      c. Copy scene to feedback buffer (for next frame's uPrevFrame)
//!      d. Output pass (HDR → SDR)
//!      e. Composite overlay SVGs/PNGs
//!      f. Pipe raw pixels to FFmpeg (or save PNG)
//!   4. FFmpeg encodes to H.264/H.265 video
//!
//! Usage:
//!   dead-air-renderer --manifest manifest.json -o show.mp4 --width 3840 --height 2160
//!   dead-air-renderer --manifest manifest.json --png-dir ./frames  # PNG mode (slower)

mod compute;
mod compositor;
mod ffmpeg;
pub mod glsl_compat;
mod gpu;
mod manifest;
mod overlay_cache;
mod motion_blur;
mod postprocess;
mod shader_cache;
mod temporal;
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

    /// Skip Rust-side post-processing (GLSL shaders already include bloom/grain/halation).
    /// Removes 5 redundant GPU passes per frame for ~3-5x speedup.
    #[arg(long, default_value_t = false)]
    no_pp: bool,

    /// End frame (0 = all)
    #[arg(long, default_value_t = 0)]
    end_frame: u32,
}

fn main() {
    env_logger::init();
    let args = Args::parse();

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

    // ─── Create feedback + FFT textures ───
    let (feedback_a, feedback_a_view) = renderer.create_feedback_texture("feedback_a");
    let (feedback_b, feedback_b_view) = renderer.create_feedback_texture("feedback_b");
    let (fft_texture, fft_view) = renderer.create_fft_texture();
    let mut feedback_idx: usize = 0; // 0 = write to A, read from B; 1 = write to B, read from A

    // ─── Create post-processing pipeline ───
    let pp_pipeline = postprocess::PostProcessPipeline::new(
        renderer.device(),
        renderer.vertex_module(),
        args.width,
        args.height,
    );
    println!("Post-processing: bloom ({}x{}) + tonemap + grain", args.width / 2, args.height / 2);

    // ─── Create GPU transition pipeline ───
    let transition_pipeline = transition::GpuTransitionPipeline::new(
        renderer.device(),
        renderer.vertex_module(),
    );

    // ─── Create temporal blend pipeline ───
    let temporal_pipeline = temporal::TemporalBlendPipeline::new(
        renderer.device(),
        renderer.vertex_module(),
    );

    // ─── Create particle system (10K particles) ───
    let particle_system = compute::ParticleSystem::new(
        renderer.device(),
        10_000,
        renderer.vertex_module(),
    );

    // ─── Create motion blur pipeline ───
    let motion_blur_pipeline = motion_blur::MotionBlurPipeline::new(
        renderer.device(),
        renderer.vertex_module(),
        args.width,
        args.height,
    );

    // Compile all shaders
    let mut shader_cache = shader_cache::ShaderCache::new();

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
                    eprintln!("  WARN: {} failed: {}", shader_id, &e[..e.len().min(120)]);
                    failed += 1;
                }
            }
        }
    }
    println!("Shaders: {} compiled, {} failed", compiled, failed);

    // Load overlay cache if overlay PNG directory exists
    let mut overlay_image_cache = overlay_cache::OverlayImageCache::new();
    if let Some(ref png_dir) = manifest.overlay_png_dir {
        let png_path = std::path::Path::new(png_dir);
        if png_path.exists() {
            match overlay_image_cache.load_directory(png_path) {
                Ok(count) => println!("Overlays: {} PNGs loaded from {}", count, png_dir),
                Err(e) => eprintln!("  WARN: overlay load failed: {}", e),
            }
        }
    }

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

    let mut last_frame_idx: Option<usize> = None;

    // Pipelined rendering: while frame N renders on GPU, we process frame N-1's
    // pixels on CPU (overlays + FFmpeg). This overlaps GPU and CPU work.
    //
    // Flow:
    //   Frame 0: submit GPU work → no previous frame to process
    //   Frame 1: read frame 0 pixels + process + output, submit frame 1 GPU work
    //   Frame 2: read frame 1 pixels + process + output, submit frame 2 GPU work
    //   ...
    //   After loop: read + process + output the final frame

    // State for deferred output of the previous frame
    let mut pending_frame_idx: Option<usize> = None;

    /// Process a completed frame: read pixels, composite overlays, write to output.
    fn process_completed_frame(
        renderer: &mut gpu::GpuRenderer,
        frame_idx: usize,
        manifest: &manifest::Manifest,
        overlay_image_cache: &mut overlay_cache::OverlayImageCache,
        ffmpeg_pipe: &mut Option<ffmpeg::FfmpegPipe>,
        png_dir: &Option<std::path::PathBuf>,
        width: u32,
        height: u32,
    ) {
        let mut pixels = renderer.read_pixels();

        // Composite overlays
        if let Some(ref schedule) = manifest.overlay_schedule {
            if let Some(frame_overlays) = schedule.get(frame_idx) {
                for instance in frame_overlays {
                    overlay_image_cache.composite_instance(
                        &mut pixels, width, height, instance,
                    );
                }
            }
        } else if let Some(ref overlay_layers) = manifest.overlay_layers {
            if let Some(frame_overlays) = overlay_layers.get(frame_idx) {
                compositor::composite_layers(&mut pixels, frame_overlays, width, height);
            }
        }

        // Output
        if let Some(ref mut pipe) = ffmpeg_pipe {
            pipe.write_frame(&pixels).expect("FFmpeg write failed");
        } else if let Some(ref dir) = png_dir {
            let path = dir.join(format!("frame_{:07}.png", frame_idx));
            image::save_buffer(&path, &pixels, width, height, image::ColorType::Rgba8)
                .expect("PNG save failed");
        }
    }

    for frame_idx in start_idx..end_idx {
        // ─── Process previous frame's pixels while GPU is idle between submissions ───
        if let Some(prev_idx) = pending_frame_idx {
            process_completed_frame(
                &mut renderer, prev_idx, &manifest,
                &mut overlay_image_cache, &mut ffmpeg_pipe, &args.png_dir,
                args.width, args.height,
            );
            progress.inc(1);

            // Log progress every 5% for non-TTY environments (piped output, log files)
            let done = progress.position();
            let total = progress.length().unwrap_or(1);
            let interval = total / 20; // every 5%
            if interval > 0 && done % interval == 0 && done > 0 {
                let elapsed = progress.elapsed().as_secs_f64();
                let fps_actual = done as f64 / elapsed;
                let eta_sec = if fps_actual > 0.0 { (total - done) as f64 / fps_actual } else { 0.0 };
                eprintln!(
                    "[progress] {}/{} frames ({:.0}%) | {:.1} fps | ETA: {:.0}m{:.0}s",
                    done, total, done as f64 / total as f64 * 100.0,
                    fps_actual, eta_sec / 60.0, eta_sec % 60.0,
                );
            }
        }

        let frame = &manifest.frames[frame_idx];

        // ─── Seek detection ───
        if let Some(last) = last_frame_idx {
            if frame_idx != last + 1 {
                feedback_idx = 0;
            }
        }

        // ─── Update FFT texture ───
        let fft_data = uniforms::build_fft_data(frame);
        renderer.update_fft_texture(&fft_texture, &fft_data);

        // ─── Particles disabled: they obscure shader output ───
        // Particles were distracting colored dots that masked the actual shader visuals.
        // The shaders themselves have their own visual effects (volumetric light, caustics, etc.)
        // that are more interesting than generic particle overlays.

        // ─── Submit GPU work for current frame ───
        let shader_info = shader_cache.get_shader_info(&frame.shader_id);
        let pipeline = match shader_info {
            Some(info) => &info.pipeline,
            None => {
                pending_frame_idx = None;
                last_frame_idx = Some(frame_idx);
                continue;
            }
        };
        let needs_textures = shader_info
            .map(|i| i.texture_info.needs_prev_frame || i.texture_info.needs_fft)
            .unwrap_or(false);

        let prev_frame_view = if feedback_idx == 0 { &feedback_b_view } else { &feedback_a_view };
        let texture_bind_group = if needs_textures {
            Some(renderer.create_texture_bind_group(prev_frame_view, &fft_view))
        } else {
            None
        };
        let feedback_target = if feedback_idx == 0 { &feedback_a } else { &feedback_b };

        let uniform_data = uniforms::build_uniform_buffer(frame, args.width, args.height);
        let pp_uniforms = postprocess::PostProcessUniforms {
            bloom_threshold: -0.08 - frame.energy * 0.18,
            bloom_intensity: 1.0,
            energy: frame.energy,
            time: frame.time,
            grain_amount: 0.02 + frame.energy * 0.05,
            vignette_strength: 1.0,
            resolution: [args.width as f32, args.height as f32],
            bass: frame.bass,
            onset_snap: frame.onset_snap,
            era_brightness: frame.era_brightness,
            era_sepia: frame.era_sepia,
            envelope_brightness: frame.envelope_brightness,
            envelope_saturation: frame.envelope_saturation,
            dynamic_time: frame.dynamic_time,
            _pad: 0.0,
        };

        // Temporal blend: use previous feedback buffer for noise reduction.
        // Higher blend for quiet/ambient, zero during transitions.
        let has_transition = frame.secondary_shader_id.is_some() && frame.blend_progress.is_some();
        let temporal_strength = if has_transition {
            0.0 // disable during transitions to prevent ghosting
        } else {
            // Quiet sections: stronger blend (0.15), loud: weaker (0.03)
            0.03 + (1.0 - frame.energy.min(1.0)) * 0.12
        };
        let temporal_prev_view = if feedback_idx == 0 { &feedback_b_view } else { &feedback_a_view };
        let temporal_param = if temporal_strength > 0.001 {
            Some((&temporal_pipeline, temporal_prev_view as &wgpu::TextureView, temporal_strength))
        } else {
            None
        };

        if has_transition {
            let sec_id = frame.secondary_shader_id.as_ref().unwrap();
            let blend_prog = frame.blend_progress.unwrap();
            if let Some(sec_info) = shader_cache.get_shader_info(sec_id) {
                let sec_needs_tex = sec_info.texture_info.needs_prev_frame
                    || sec_info.texture_info.needs_fft;
                let sec_tex_bg = if sec_needs_tex {
                    let pf_view = if feedback_idx == 0 { &feedback_a_view } else { &feedback_b_view };
                    Some(renderer.create_texture_bind_group(pf_view, &fft_view))
                } else {
                    None
                };
                let blend_mode_str = frame.blend_mode.as_deref().unwrap_or("dissolve");

                renderer.render_frame_with_transition(
                    pipeline,
                    &sec_info.pipeline,
                    &uniform_data,
                    texture_bind_group.as_ref(),
                    sec_tex_bg.as_ref(),
                    blend_prog,
                    blend_mode_str,
                    Some(feedback_target),
                    if args.no_pp { None } else { Some((&pp_pipeline, &pp_uniforms)) },
                    &transition_pipeline,
                );
            } else {
                // Secondary shader not found — render primary only
                renderer.render_frame(
                    pipeline, &uniform_data,
                    texture_bind_group.as_ref(), Some(feedback_target),
                    if args.no_pp { None } else { Some((&pp_pipeline, &pp_uniforms)) },
                    None, // no temporal during transitions
                );
            }
        } else if frame.motion_blur_samples > 1 {
            // ─── Motion blur: render N sub-frames, accumulate, then post-process ───
            let samples = frame.motion_blur_samples.min(8);
            let weight = 1.0 / samples as f32;
            let time_step = 1.0 / args.fps as f32;

            for s in 0..samples {
                // Offset time for this sub-frame (spread across one frame period)
                let sub_offset = (s as f32 / samples as f32 - 0.5) * time_step;
                let mut sub_uniform_data = uniform_data.clone();
                // Patch uTime (offset 0) and uDynamicTime (offset 4)
                sub_uniform_data[0..4].copy_from_slice(&(frame.time + sub_offset).to_le_bytes());
                sub_uniform_data[4..8].copy_from_slice(&(frame.dynamic_time + sub_offset).to_le_bytes());

                // Render sub-frame to scene_texture (no pp, no readback)
                renderer.render_scene_to_hdr(
                    pipeline, &sub_uniform_data,
                    texture_bind_group.as_ref(),
                    if s == 0 { Some(feedback_target) } else { None },
                );

                // Accumulate into motion blur buffer
                let mut encoder = renderer.device().create_command_encoder(
                    &wgpu::CommandEncoderDescriptor { label: Some("mb_accum") },
                );
                motion_blur_pipeline.accumulate_sub_frame(
                    &mut encoder, renderer.device(), &renderer.texture_sampler,
                    renderer.scene_texture_view(), weight, s == 0,
                    renderer.vertex_buffer(), renderer.index_buffer(),
                );
                renderer.queue().submit(std::iter::once(encoder.finish()));
            }

            // Post-process the accumulated result + readback
            if args.no_pp {
                renderer.scene_to_readback(&motion_blur_pipeline.accum_view);
            } else {
                renderer.postprocess_and_readback(
                    &pp_pipeline, &pp_uniforms, &motion_blur_pipeline.accum_view,
                );
            }
        } else {
            // Standard path: scene → particles → post-process → readback
            renderer.render_scene_to_hdr(
                pipeline, &uniform_data,
                texture_bind_group.as_ref(), Some(feedback_target),
            );

            // Post-process + readback
            if args.no_pp {
                let scene_view = renderer.create_scene_view();
                renderer.scene_to_readback(&scene_view);
            } else {
                let scene_view = renderer.create_scene_view();
                renderer.postprocess_and_readback(&pp_pipeline, &pp_uniforms, &scene_view);
            }
        }

        // GPU work submitted — mark this frame as pending readback
        feedback_idx = 1 - feedback_idx;
        pending_frame_idx = Some(frame_idx);
        last_frame_idx = Some(frame_idx);
    }

    // ─── Process the final frame ───
    if let Some(prev_idx) = pending_frame_idx {
        process_completed_frame(
            &mut renderer, prev_idx, &manifest,
            &mut overlay_image_cache, &mut ffmpeg_pipe, &args.png_dir,
            args.width, args.height,
        );
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
