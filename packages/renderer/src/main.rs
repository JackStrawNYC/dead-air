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
pub mod intro;
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

    /// Prepend a 15-second cinematic intro sequence before the show.
    #[arg(long, default_value_t = false)]
    with_intro: bool,

    /// Show venue name (for intro card). Required with --with-intro.
    #[arg(long)]
    show_venue: Option<String>,

    /// Show city (for intro card). Required with --with-intro.
    #[arg(long)]
    show_city: Option<String>,

    /// Show date display string (for intro card, e.g. "August 27, 1972").
    #[arg(long)]
    show_date: Option<String>,

    /// Show era for visual grading: primal, classic, hiatus, touch_of_grey, revival.
    #[arg(long, default_value = "classic")]
    show_era: String,

    /// Show seed (0.0-1.0) for deterministic variation. Derived from date if omitted.
    #[arg(long)]
    show_seed: Option<f32>,

    /// Path to brand logo PNG for intro sequence (e.g., dead-air-brand.png).
    #[arg(long)]
    brand_image: Option<String>,

    /// Override overlay PNG directory (instead of path baked into manifest).
    #[arg(long)]
    overlay_png_dir: Option<String>,
}

fn main() {
    env_logger::init();
    let args = Args::parse();

    if let Some(dir) = &args.png_dir {
        std::fs::create_dir_all(dir).expect("Failed to create PNG directory");
    }

    // Load manifest
    println!("Loading manifest: {}", args.manifest.display());
    let mut manifest =
        manifest::load_manifest(&args.manifest).expect("Failed to load manifest");

    // ─── Prepend intro sequence if requested ───
    let intro_frame_count = if args.with_intro {
        let venue = args.show_venue.as_deref().unwrap_or("Unknown Venue");
        let city = args.show_city.as_deref().unwrap_or("");
        let date_display = args.show_date.as_deref().unwrap_or("Unknown Date");
        let seed = args.show_seed.unwrap_or_else(|| {
            // Derive seed from date string hash
            let hash: u32 = date_display.bytes().fold(5381u32, |h, b| h.wrapping_mul(33).wrapping_add(b as u32));
            (hash % 1000) as f32 / 1000.0
        });

        let style = intro::style_for_era(&args.show_era, seed);
        let show_meta = intro::ShowMeta {
            venue: venue.to_string(),
            city: city.to_string(),
            date_display: date_display.to_string(),
            brand_image_path: args.brand_image.clone(),
        };

        // Get first song's shader for the dissolve transition
        let first_shader_id = manifest.frames.first().map(|f| f.shader_id.as_str());

        let (intro_shaders, intro_frames, intro_overlays) =
            intro::generate_intro(args.fps, args.width, args.height, &style, &show_meta, first_shader_id);

        let n_intro = intro_frames.len();
        println!("Intro: {} frames ({:.1}s) — era={}, seed={:.3}", n_intro, n_intro as f32 / args.fps as f32, args.show_era, seed);

        // Merge: prepend intro shaders
        for (id, glsl) in intro_shaders {
            manifest.shaders.insert(id, glsl);
        }

        // Renumber existing frames and prepend intro frames
        let offset = n_intro as u32;
        for f in &mut manifest.frames {
            f.frame += offset;
        }
        let mut combined_frames = intro_frames;
        combined_frames.append(&mut manifest.frames);
        manifest.frames = combined_frames;

        // Merge overlay layers: prepend intro overlays
        if let Some(ref mut existing_overlays) = manifest.overlay_layers {
            let mut combined = intro_overlays;
            combined.append(existing_overlays);
            *existing_overlays = combined;
        } else {
            // Create overlay_layers with intro overlays + empty vecs for show frames
            let show_frame_count = manifest.frames.len() - n_intro;
            let mut combined = intro_overlays;
            combined.extend((0..show_frame_count).map(|_| Vec::new()));
            manifest.overlay_layers = Some(combined);
        }

        n_intro
    } else {
        0
    };

    let total_frames = if args.end_frame > 0 {
        (args.end_frame - args.start_frame) as usize
    } else {
        manifest.frames.len() - args.start_frame as usize
    };

    let _ = intro_frame_count; // suppress unused warning when not printing

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

    // Override overlay PNG directory from CLI if provided
    if let Some(ref cli_png_dir) = args.overlay_png_dir {
        manifest.overlay_png_dir = Some(cli_png_dir.clone());
    }

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
        let codec = std::env::var("FFMPEG_CODEC").unwrap_or_else(|_| "libx264".to_string());
        let preset = std::env::var("FFMPEG_PRESET").unwrap_or_else(|_| "medium".to_string());
        Some(
            ffmpeg::FfmpegPipe::new_with_codec(
                args.width, args.height, args.fps,
                &output_path.to_string_lossy(),
                &codec, &preset, args.crf,
            )
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
                // Shader failed to compile — write a black frame to maintain A/V sync
                let black_frame = vec![0u8; args.width as usize * args.height as usize * 4];
                if let Some(ref mut pipe) = ffmpeg_pipe {
                    pipe.write_frame(&black_frame).expect("FFmpeg write failed");
                } else if let Some(ref dir) = args.png_dir {
                    let path = dir.join(format!("frame_{:07}.png", frame_idx));
                    image::save_buffer(&path, &black_frame, args.width, args.height, image::ColorType::Rgba8)
                        .expect("PNG save failed");
                }
                eprintln!("  WARN: frame {} black (shader {} not compiled)", frame_idx, frame.shader_id);
                pending_frame_idx = None;
                last_frame_idx = Some(frame_idx);
                progress.inc(1);
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
        let is_intro = frame.shader_id == intro::INTRO_SHADER_ID;
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
                    let pf_view = if feedback_idx == 0 { &feedback_b_view } else { &feedback_a_view };
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
