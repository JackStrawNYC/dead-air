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

mod chapter_card;
mod composited_effects;
mod compute;
mod compositor;
mod effects;
mod endcard;
mod ffmpeg;
pub mod glsl_compat;
mod gpu;
pub mod intro;
mod manifest;
mod overlay_atlas;
mod overlay_cache;
mod overlay_pass;
mod motion_blur;
mod postprocess;
mod render_loop;
mod shader_cache;
mod temporal;
mod text_layers;
mod transition;
mod uniforms;

#[path = "../generated/uniforms_layout.rs"]
mod uniforms_layout;

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

    /// Append a 10-second cinematic end card with setlist recap after the show.
    #[arg(long, default_value_t = false)]
    with_endcard: bool,

    /// Song titles for end card setlist (comma-separated). If omitted, derived from manifest.
    #[arg(long)]
    song_titles: Option<String>,

    /// Insert 3-second chapter cards between songs (requires song_boundaries in manifest).
    #[arg(long, default_value_t = false)]
    with_chapter_cards: bool,

    /// Force a visual effect mode (0=none, 1=kaleidoscope, 2=feedback, 3=hypersat, etc.)
    #[arg(long, default_value_t = 0)]
    effect_mode: u32,

    /// Effect intensity (0.0-1.0). Default 0.7.
    #[arg(long, default_value_t = 0.7)]
    effect_intensity: f32,

    /// Override overlay PNG directory (instead of path baked into manifest).
    #[arg(long)]
    overlay_png_dir: Option<String>,

    /// Fail the render if any overlay referenced in the schedule is missing
    /// from the PNG cache. Without this flag, missing overlays render as
    /// nothing (silently — the audit's #7 debt). Recommended for production.
    #[arg(long, default_value_t = false)]
    strict_overlays: bool,

    /// Fail the render if any shader_id referenced by a frame is missing
    /// from the manifest's shaders map. Without this flag, missing shaders
    /// render as black frames in the fallback path.
    #[arg(long, default_value_t = false)]
    strict_shaders: bool,

    /// Run all pre-flight validation (shader refs, overlay schedule) and
    /// exit before the render loop. Combine with --strict-* flags to use as
    /// a CI gate. Exit code 0 if all validations pass, 1 if any fail.
    #[arg(long, default_value_t = false)]
    validate_only: bool,

    /// Scene-render LOD scale (audit Wave 3.3). 1.0 renders the scene at full
    /// output resolution; values < 1.0 render the scene shader at smaller
    /// dimensions and the postprocess sampler upscales. Trades some sharpness
    /// for major shader-cost reduction (0.75 ≈ 1.8x faster shader cost).
    /// Range 0.25..=1.0.
    #[arg(long, default_value_t = 1.0)]
    scene_scale: f32,

    /// Enable GPU overlay compositing (audit Wave 4.1 phase C). Builds an
    /// atlas at startup and paints schedule overlays on the GPU output
    /// texture in a single instanced draw call per frame instead of the
    /// per-pixel CPU path. Falls back to CPU when overlay PNGs aren't loaded.
    #[arg(long, default_value_t = false)]
    gpu_overlays: bool,
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

    // ─── Insert chapter cards between songs if requested ───
    if args.with_chapter_cards {
        if let Some(ref boundaries) = manifest.song_boundaries {
            if boundaries.len() > 1 {
                // Insert chapter cards in reverse order (so frame indices stay valid)
                let mut insertions: Vec<(u32, String, u32, u32)> = Vec::new();
                for (i, boundary) in boundaries.iter().enumerate().skip(1) {
                    // Skip first song (intro handles it)
                    let set_label = format!("Set {}", boundary.set);
                    insertions.push((
                        boundary.start_frame + intro_frame_count as u32,
                        boundary.title.clone(),
                        boundary.set,
                        i as u32 + 1,
                    ));
                }
                insertions.reverse(); // insert from back to front

                for (insert_at, title, _set, track_num) in &insertions {
                    let set_label = format!("Set {}", _set);
                    let (cc_shaders, cc_frames, cc_overlays) =
                        chapter_card::generate_chapter_card(
                            args.fps, args.width, args.height,
                            title, &set_label, *track_num,
                        );

                    let n_cc = cc_frames.len();
                    // Register shaders
                    for (id, glsl) in cc_shaders {
                        manifest.shaders.entry(id).or_insert(glsl);
                    }

                    // Renumber frames after insertion point
                    let offset = n_cc as u32;
                    for f in manifest.frames.iter_mut() {
                        if f.frame >= *insert_at {
                            f.frame += offset;
                        }
                    }

                    // Insert chapter card frames
                    let insert_idx = manifest.frames.iter().position(|f| f.frame >= *insert_at + offset).unwrap_or(manifest.frames.len());
                    let mut cc_numbered = cc_frames;
                    for (j, f) in cc_numbered.iter_mut().enumerate() {
                        f.frame = *insert_at + j as u32;
                    }
                    manifest.frames.splice(insert_idx..insert_idx, cc_numbered);
                }

                println!("Chapter cards: {} inserted ({} songs)", insertions.len(),
                    insertions.len());
            }
        }
    }

    // ─── Append end card sequence if requested ───
    if args.with_endcard {
        let venue = args.show_venue.as_deref().unwrap_or("Unknown Venue");
        let date_display = args.show_date.as_deref().unwrap_or("Unknown Date");

        // Use real song titles if provided, otherwise derive from manifest
        let songs: Vec<String> = if let Some(ref titles) = args.song_titles {
            titles.split(',').map(|s| s.trim().to_string()).collect()
        } else {
            // Fallback: deduplicate shader IDs (not ideal but works for single-song)
            let mut s = Vec::new();
            let mut prev = String::new();
            for f in &manifest.frames {
                if f.shader_id != prev && !f.shader_id.starts_with("__") && s.len() < 25 {
                    s.push(f.shader_id.replace('_', " "));
                }
                prev = f.shader_id.clone();
            }
            s
        };

        let meta = endcard::EndcardMeta {
            venue: venue.to_string(),
            date_display: date_display.to_string(),
            songs,
        };

        let last_shader_id = manifest.frames.last().map(|f| f.shader_id.as_str());
        let (ec_shaders, ec_frames, ec_overlays) =
            endcard::generate_endcard(args.fps, args.width, args.height, &meta, last_shader_id);

        let n_endcard = ec_frames.len();
        println!("End card: {} frames ({:.1}s)", n_endcard, n_endcard as f32 / args.fps as f32);

        // Merge: append endcard shaders
        for (id, glsl) in ec_shaders {
            manifest.shaders.insert(id, glsl);
        }

        // Renumber endcard frames and append
        let offset = manifest.frames.len() as u32;
        let mut ec_frames_numbered = ec_frames;
        for f in &mut ec_frames_numbered {
            f.frame += offset;
        }
        manifest.frames.append(&mut ec_frames_numbered);

        // Merge overlay layers: append endcard overlays
        if let Some(ref mut existing_overlays) = manifest.overlay_layers {
            existing_overlays.extend(ec_overlays);
        } else {
            let show_frame_count = manifest.frames.len() - n_endcard;
            let mut combined: Vec<Vec<_>> = (0..show_frame_count).map(|_| Vec::new()).collect();
            combined.extend(ec_overlays);
            manifest.overlay_layers = Some(combined);
        }
    }

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
    let mut renderer = pollster::block_on(
        gpu::GpuRenderer::new_with_scene_scale(args.width, args.height, args.scene_scale)
    ).expect("Failed to initialize GPU");
    if (args.scene_scale - 1.0).abs() > 1e-3 {
        println!(
            "Scene LOD: rendering at {:.0}% of output ({}x{} scene → {}x{} output)",
            args.scene_scale * 100.0,
            (args.width as f32 * args.scene_scale) as u32,
            (args.height as f32 * args.scene_scale) as u32,
            args.width, args.height,
        );
    }

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
    let mut lighting_state = uniforms::LightingState::default();

    // ─── Create post-processing pipeline ───
    let pp_pipeline = postprocess::PostProcessPipeline::new(
        renderer.device(),
        renderer.vertex_module(),
        args.width,
        args.height,
    );
    println!("Post-processing: bloom ({}x{}) + tonemap + grain", args.width / 2, args.height / 2);

    // ─── Create visual effects pipeline ───
    let effect_pipeline = effects::EffectPipeline::new(
        renderer.device(),
        args.width,
        args.height,
    );
    println!("Effects: 14 post-process + 10 composited modes available");

    // ─── Create composited effects pipeline ───
    let composited_pipeline = composited_effects::CompositedPipeline::new(renderer.device());

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

    // Pre-flight: every shader_id referenced by a frame must be present in
    // the manifest's shaders map. A missing shader silently renders as a
    // black frame in the renderer's fallback path; this validation surfaces
    // those typos / missing exports before render starts.
    let shader_validation = manifest.validate_shader_refs();
    shader_validation.print();
    if !shader_validation.ok() && args.strict_shaders {
        eprintln!("Shaders: --strict-shaders set, aborting before render");
        std::process::exit(2);
    }

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
        if !png_path.exists() {
            eprintln!("  WARN: overlay_png_dir {} does not exist — schedule overlays will render blank", png_dir);
        } else {
            match overlay_image_cache.load_directory(png_path) {
                Ok(count) => println!("Overlays: {} PNGs loaded from {}", count, png_dir),
                Err(e) => eprintln!("  WARN: overlay load failed: {}", e),
            }
        }
    }

    // Pre-flight validation: walk the overlay schedule, verify every referenced
    // overlay PNG is loaded. Without this check, missing overlays render as
    // nothing — the audit's debt #7 silent-failure problem.
    let overlay_validation_ok = if let Some(ref schedule) = manifest.overlay_schedule {
        let report = overlay_image_cache.validate_schedule(schedule);
        report.print();
        let ok = report.ok();
        if !ok && args.strict_overlays {
            eprintln!("Overlays: --strict-overlays set, aborting before render to avoid silent failures");
            std::process::exit(2);
        }
        ok
    } else {
        true
    };

    if args.validate_only {
        let all_ok = shader_validation.ok() && overlay_validation_ok;
        println!(
            "Pre-flight validation complete (--validate-only set). Result: {}",
            if all_ok { "PASS" } else { "FAIL" }
        );
        std::process::exit(if all_ok { 0 } else { 1 });
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

    let _ = particle_system; // currently disabled in the loop; kept for future re-enable

    // GPU overlay compositing setup (Wave 4.1 phase C). Only when --gpu-overlays
    // is set AND we actually have overlays loaded; otherwise fall through to CPU.
    let (gpu_overlay_atlas, gpu_overlay_pipeline) = if args.gpu_overlays && !overlay_image_cache.is_empty() {
        println!("Overlays: building GPU atlas (Wave 4.1)...");
        let atlas = overlay_atlas::build_atlas(overlay_image_cache.entries(), 4096)
            .expect("build atlas");
        println!(
            "Overlays: atlas {}x{} packed ({} entries, {:.1}% utilization)",
            atlas.width, atlas.height,
            atlas.lookup.len(),
            atlas.utilization * 100.0,
        );
        let pipeline = overlay_pass::OverlayCompositingPipeline::new(
            renderer.device(),
            renderer.queue(),
            &atlas,
            gpu::OUTPUT_FORMAT,
        );
        (Some(atlas), Some(pipeline))
    } else {
        if args.gpu_overlays {
            eprintln!("Overlays: --gpu-overlays set but no overlay PNGs loaded — falling back to CPU compositor");
        }
        (None, None)
    };

    let resources = render_loop::RenderResources {
        renderer: &mut renderer,
        manifest: &manifest,
        shader_cache: &shader_cache,
        overlay_image_cache: &mut overlay_image_cache,
        ffmpeg_pipe: &mut ffmpeg_pipe,
        png_dir: &args.png_dir,
        pp_pipeline: &pp_pipeline,
        effect_pipeline: &effect_pipeline,
        composited_pipeline: &composited_pipeline,
        transition_pipeline: &transition_pipeline,
        temporal_pipeline: &temporal_pipeline,
        motion_blur_pipeline: &motion_blur_pipeline,
        feedback_a: &feedback_a,
        feedback_b: &feedback_b,
        feedback_a_view: &feedback_a_view,
        feedback_b_view: &feedback_b_view,
        fft_texture: &fft_texture,
        fft_view: &fft_view,
        lighting_state: &mut lighting_state,
        feedback_idx: &mut feedback_idx,
        width: args.width,
        height: args.height,
        fps: args.fps,
        no_pp: args.no_pp,
        effect_mode_override: args.effect_mode,
        effect_intensity_override: args.effect_intensity,
        start_frame: start_idx,
        end_frame: end_idx,
        progress: &progress,
        gpu_overlay_pipeline: gpu_overlay_pipeline.as_ref(),
        gpu_overlay_atlas: gpu_overlay_atlas.as_ref(),
    };
    let _frames_written = render_loop::run(resources);

    progress.finish_with_message("done");

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

