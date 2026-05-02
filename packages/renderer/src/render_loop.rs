//! The main render loop, extracted from main.rs.
//!
//! `run` drives the per-frame pipeline: GPU shader render → postprocess →
//! readback → CPU composite → FFmpeg/PNG output. Pipelined so frame N's CPU
//! work overlaps frame N+1's GPU submission.
//!
//! Inputs are deliberately passed as a single `RenderResources` bag rather than
//! globals so this module stays callable from tests and future bench harnesses.

use crate::{
    composited_effects, compositor, effects, ffmpeg, gpu, intro, manifest,
    motion_blur, overlay_cache, overlay_pass, postprocess, shader_cache,
    temporal, transition, uniforms,
};
use indicatif::ProgressBar;

/// All GPU/CPU resources the render loop needs. Built once in main, consumed
/// by `run`. Pulled into a struct so the loop fn stays under 20 params.
pub struct RenderResources<'a> {
    pub renderer: &'a mut gpu::GpuRenderer,
    pub manifest: &'a manifest::Manifest,
    pub shader_cache: &'a shader_cache::ShaderCache,
    pub overlay_image_cache: &'a mut overlay_cache::OverlayImageCache,
    pub ffmpeg_pipe: &'a mut Option<ffmpeg::FfmpegPipe>,
    pub png_dir: &'a Option<std::path::PathBuf>,

    pub pp_pipeline: &'a postprocess::PostProcessPipeline,
    pub effect_pipeline: &'a effects::EffectPipeline,
    pub composited_pipeline: &'a composited_effects::CompositedPipeline,
    pub transition_pipeline: &'a transition::GpuTransitionPipeline,
    pub temporal_pipeline: &'a temporal::TemporalBlendPipeline,
    pub motion_blur_pipeline: &'a motion_blur::MotionBlurPipeline,

    /// FFT texture is shared across tiers (it's a 64x1 audio-data texture).
    pub fft_texture: &'a wgpu::Texture,
    pub fft_view: &'a wgpu::TextureView,

    pub lighting_state: &'a mut uniforms::LightingState,
    pub feedback_idx: &'a mut usize,

    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub no_pp: bool,
    pub effect_mode_override: u32,
    pub effect_intensity_override: f32,

    pub start_frame: usize,
    pub end_frame: usize,
    pub progress: &'a ProgressBar,

    /// Optional GPU overlay compositing pipeline (Wave 4.1 phase C).
    /// When `Some`, overlays are composited GPU-side onto output_texture
    /// before readback, and the CPU compositor is skipped for the
    /// schedule (intro/endcard SVG layers still go CPU).
    pub gpu_overlay_pipeline: Option<&'a overlay_pass::OverlayCompositingPipeline>,
    pub gpu_overlay_atlas: Option<&'a crate::overlay_atlas::OverlayAtlas>,
}

/// Run the full render loop. Returns the number of frames written.
pub fn run(mut r: RenderResources<'_>) -> usize {
    let mut last_frame_idx: Option<usize> = None;
    let mut pending_frame_idx: Option<usize> = None;
    let mut frames_written = 0usize;

    for frame_idx in r.start_frame..r.end_frame {
        // Process previous frame's pixels while GPU is idle between submissions.
        if let Some(prev_idx) = pending_frame_idx {
            process_completed_frame(
                r.renderer, prev_idx, r.manifest,
                r.overlay_image_cache, r.ffmpeg_pipe, r.png_dir,
                r.width, r.height,
                r.gpu_overlay_pipeline.is_some(),
            );
            r.progress.inc(1);
            frames_written += 1;
            log_progress_milestone(r.progress);
        }

        let frame = &r.manifest.frames[frame_idx];

        if let Some(last) = last_frame_idx {
            if frame_idx != last + 1 {
                *r.feedback_idx = 0;
            }
        }

        let fft_data = uniforms::build_fft_data(frame);
        r.renderer.update_fft_texture(r.fft_texture, &fft_data);

        let shader_info = r.shader_cache.get_shader_info(&frame.shader_id);
        let pipeline = match shader_info {
            Some(info) => &info.pipeline,
            None => {
                // Shader failed to compile — black frame to keep A/V sync.
                let black = vec![0u8; r.width as usize * r.height as usize * 4];
                if let Some(ref mut pipe) = r.ffmpeg_pipe {
                    pipe.write_frame(&black).expect("FFmpeg write failed");
                } else if let Some(ref dir) = r.png_dir {
                    let path = dir.join(format!("frame_{:07}.png", frame_idx));
                    image::save_buffer(&path, &black, r.width, r.height, image::ColorType::Rgba8)
                        .expect("PNG save failed");
                }
                eprintln!("  WARN: frame {} black (shader {} not compiled)", frame_idx, frame.shader_id);
                pending_frame_idx = None;
                last_frame_idx = Some(frame_idx);
                r.progress.inc(1);
                frames_written += 1;
                continue;
            }
        };

        let needs_textures = shader_info
            .map(|i| i.texture_info.needs_prev_frame || i.texture_info.needs_fft)
            .unwrap_or(false);

        // Per-tier routing: pick the SceneTargets bundle for this shader.
        // Transitions use the smaller-scale of (primary, secondary) so the
        // worst-case shader fits its budget; the cheap one downscales for
        // the brief transition window.
        let primary_tier = crate::shader_tiers::tier_for(&frame.shader_id);
        let has_transition = frame.secondary_shader_id.is_some() && frame.blend_progress.is_some();
        let tier_for_targets = if has_transition {
            // pick_transition_target_idx picks the smaller-scale bundle;
            // we then look up which tier maps to that index by re-applying
            // tier_target_index to both candidates and taking the one whose
            // index won. Cheaper: just hand both tiers to renderer and let
            // it return the chosen index, then derive a "synthetic tier".
            let secondary_tier = crate::shader_tiers::tier_for(
                frame.secondary_shader_id.as_deref().unwrap_or(""),
            );
            let chosen_idx = r.renderer.pick_transition_target_idx(primary_tier, secondary_tier);
            if chosen_idx == r.renderer.tier_target_index(primary_tier) {
                primary_tier
            } else {
                secondary_tier
            }
        } else {
            primary_tier
        };

        // Pull tier-correct feedback handles. `pick_tier_feedback` clones
        // wgpu Texture/TextureView (Arc internally, cheap) so the borrow
        // ends here and the &mut renderer calls below are unblocked.
        let tf = r.renderer.pick_tier_feedback(tier_for_targets, *r.feedback_idx);

        let texture_bind_group = if needs_textures {
            Some(r.renderer.create_texture_bind_group(&tf.prev_frame_view, r.fft_view))
        } else {
            None
        };

        let uniform_data = uniforms::build_uniform_buffer(frame, r.width, r.height, r.lighting_state);

        let pp_uniforms = build_pp_uniforms(frame, r.width, r.height);

        // Temporal blend strength: stronger for quiet/ambient, off during transitions.
        let temporal_strength = if has_transition {
            0.0
        } else {
            0.03 + (1.0 - frame.energy.min(1.0)) * 0.12
        };
        let _temporal_param = if temporal_strength > 0.001 {
            Some((r.temporal_pipeline, &tf.prev_frame_view, temporal_strength))
        } else {
            None
        };

        let skip_fxaa = is_fine_geometry_shader(&frame.shader_id);

        if has_transition {
            let sec_id = frame.secondary_shader_id.as_ref().unwrap();
            let blend_prog = frame.blend_progress.unwrap();
            if let Some(sec_info) = r.shader_cache.get_shader_info(sec_id) {
                let sec_needs_tex = sec_info.texture_info.needs_prev_frame
                    || sec_info.texture_info.needs_fft;
                let sec_tex_bg = if sec_needs_tex {
                    Some(r.renderer.create_texture_bind_group(&tf.prev_frame_view, r.fft_view))
                } else {
                    None
                };
                let blend_mode_str = frame.blend_mode.as_deref().unwrap_or("dissolve");

                r.renderer.render_frame_with_transition_idx(
                    tf.bundle_idx,
                    pipeline,
                    &sec_info.pipeline,
                    &uniform_data,
                    texture_bind_group.as_ref(),
                    sec_tex_bg.as_ref(),
                    blend_prog,
                    blend_mode_str,
                    Some(&tf.feedback_target),
                    if r.no_pp { None } else { Some((r.pp_pipeline, &pp_uniforms)) },
                    r.transition_pipeline,
                    skip_fxaa,
                );
            } else {
                r.renderer.render_frame_idx(
                    tf.bundle_idx,
                    pipeline, &uniform_data,
                    texture_bind_group.as_ref(), Some(&tf.feedback_target),
                    if r.no_pp { None } else { Some((r.pp_pipeline, &pp_uniforms)) },
                    None,
                    skip_fxaa,
                );
            }
        } else if frame.motion_blur_samples > 1 {
            let samples = frame.motion_blur_samples.min(8);
            let weight = 1.0 / samples as f32;
            let time_step = 1.0 / r.fps as f32;

            for s in 0..samples {
                let sub_offset = (s as f32 / samples as f32 - 0.5) * time_step;
                let mut sub_uniform_data = uniform_data.clone();
                sub_uniform_data[0..4].copy_from_slice(&(frame.time + sub_offset).to_le_bytes());
                sub_uniform_data[4..8].copy_from_slice(&(frame.dynamic_time + sub_offset).to_le_bytes());

                r.renderer.render_scene_to_hdr_idx(
                    tf.bundle_idx,
                    pipeline, &sub_uniform_data,
                    texture_bind_group.as_ref(),
                    if s == 0 { Some(&tf.feedback_target) } else { None },
                );

                let mut encoder = r.renderer.device().create_command_encoder(
                    &wgpu::CommandEncoderDescriptor { label: Some("mb_accum") },
                );
                r.motion_blur_pipeline.accumulate_sub_frame(
                    &mut encoder, r.renderer.device(), &r.renderer.texture_sampler,
                    &tf.scene_view, weight, s == 0,
                    r.renderer.vertex_buffer(), r.renderer.index_buffer(),
                );
                r.renderer.queue().submit(std::iter::once(encoder.finish()));
            }

            if r.no_pp {
                r.renderer.scene_to_readback(&r.motion_blur_pipeline.accum_view);
            } else {
                r.renderer.postprocess_and_readback(
                    r.pp_pipeline, &pp_uniforms, &r.motion_blur_pipeline.accum_view, skip_fxaa,
                );
            }
        } else {
            r.renderer.render_scene_to_hdr_idx(
                tf.bundle_idx,
                pipeline, &uniform_data,
                texture_bind_group.as_ref(), Some(&tf.feedback_target),
            );
            if r.no_pp {
                r.renderer.scene_to_readback(&tf.scene_view);
            } else {
                r.renderer.postprocess_and_readback(r.pp_pipeline, &pp_uniforms, &tf.scene_view, skip_fxaa);
            }
        }

        // Visual effect pass (post-processing transform, in-place).
        apply_effect_pass(
            r.renderer, r.effect_pipeline, &tf.prev_frame_view, frame,
            r.effect_mode_override, r.effect_intensity_override,
            r.width, r.height,
        );

        // Composited effect pass (additive overlay).
        apply_composited_pass(
            r.renderer, r.composited_pipeline, frame,
            r.width, r.height,
        );

        // GPU overlay compositing (Wave 4.1 phase C).
        // When the GPU pipeline + atlas are present, paint schedule overlays
        // onto the output texture before readback. The CPU compositor in
        // process_completed_frame will then skip the schedule (intro/endcard
        // SVG layers still go CPU since they're per-frame rasterized).
        if let (Some(pipeline), Some(atlas)) = (r.gpu_overlay_pipeline, r.gpu_overlay_atlas) {
            if let Some(ref schedule) = r.manifest.overlay_schedule {
                if let Some(frame_overlays) = schedule.get(frame_idx) {
                    let gpu_instances: Vec<_> = frame_overlays
                        .iter()
                        .filter_map(|inst| overlay_pass::instance_to_gpu(inst, atlas, r.width, r.height))
                        .collect();
                    if !gpu_instances.is_empty() {
                        let mut encoder = r.renderer.device().create_command_encoder(
                            &wgpu::CommandEncoderDescriptor { label: Some("gpu_overlay_pass") },
                        );
                        let target = r.renderer.output_texture_view();
                        pipeline.encode(&mut encoder, r.renderer.device(), target, &gpu_instances);
                        // Re-trigger readback since we modified output_texture.
                        r.renderer.copy_to_readback(&mut encoder);
                        r.renderer.queue().submit(std::iter::once(encoder.finish()));
                    }
                }
            }
        }

        *r.feedback_idx = 1 - *r.feedback_idx;
        pending_frame_idx = Some(frame_idx);
        last_frame_idx = Some(frame_idx);
    }

    if let Some(prev_idx) = pending_frame_idx {
        process_completed_frame(
            r.renderer, prev_idx, r.manifest,
            r.overlay_image_cache, r.ffmpeg_pipe, r.png_dir,
            r.width, r.height,
            r.gpu_overlay_pipeline.is_some(),
        );
        r.progress.inc(1);
        frames_written += 1;
    }

    frames_written
}

fn build_pp_uniforms(
    frame: &manifest::FrameData,
    width: u32,
    height: u32,
) -> postprocess::PostProcessUniforms {
    postprocess::PostProcessUniforms {
        bloom_threshold: 0.10 - frame.energy * 0.08,
        bloom_intensity: 0.8,
        energy: frame.energy,
        time: frame.time,
        grain_amount: 0.02 + frame.energy * 0.05,
        vignette_strength: 1.0,
        resolution: [width as f32, height as f32],
        bass: frame.bass,
        onset_snap: frame.onset_snap,
        era_brightness: frame.era_brightness,
        era_sepia: frame.era_sepia,
        envelope_brightness: frame.envelope_brightness,
        envelope_saturation: frame.envelope_saturation,
        dynamic_time: frame.dynamic_time,
        _pad: 0.0,
    }
}

/// Shaders with fine geometric detail that FXAA destroys.
fn is_fine_geometry_shader(id: &str) -> bool {
    matches!(id,
        "fractal_temple" | "mandala_engine" | "sacred_geometry" | "kaleidoscope" |
        "truchet_tiling" | "diffraction_rings" | "stained_glass" | "neural_web" |
        "voronoi_flow" | "fractal_flames" | "fractal_zoom" | "reaction_diffusion" |
        "morphogenesis" | "feedback_recursion" | "crystalline_growth"
    )
}

fn apply_effect_pass(
    renderer: &mut gpu::GpuRenderer,
    effect_pipeline: &effects::EffectPipeline,
    prev_view: &wgpu::TextureView,
    frame: &manifest::FrameData,
    mode_override: u32,
    intensity_override: f32,
    width: u32,
    height: u32,
) {
    let effect_mode = if mode_override > 0 { mode_override } else { frame.effect_mode };
    let effect_intensity = if mode_override > 0 { intensity_override } else { frame.effect_intensity };

    if effect_mode == 0 || effect_intensity <= 0.01 {
        return;
    }

    let fx_uniforms = effects::EffectUniforms {
        mode: effect_mode,
        intensity: effect_intensity,
        time: frame.time,
        energy: frame.energy,
        bass: frame.bass,
        beat_snap: frame.beat_snap,
        width: width as f32,
        height: height as f32,
    };
    let output_view = renderer.output_texture_view();
    let mut encoder = renderer.device().create_command_encoder(
        &wgpu::CommandEncoderDescriptor { label: Some("effect_pass") },
    );
    let applied = effect_pipeline.apply(
        &mut encoder, renderer.device(), &renderer.texture_sampler,
        output_view, prev_view, &fx_uniforms,
        renderer.vertex_buffer(), renderer.index_buffer(),
    );
    renderer.queue().submit(std::iter::once(encoder.finish()));

    if applied {
        let mut copy_encoder = renderer.device().create_command_encoder(
            &wgpu::CommandEncoderDescriptor { label: Some("effect_copy") },
        );
        copy_encoder.copy_texture_to_texture(
            wgpu::TexelCopyTextureInfo {
                texture: effect_pipeline.output_texture(),
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyTextureInfo {
                texture: renderer.output_texture(),
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        renderer.copy_to_readback(&mut copy_encoder);
        renderer.queue().submit(std::iter::once(copy_encoder.finish()));
    }
}

fn apply_composited_pass(
    renderer: &mut gpu::GpuRenderer,
    composited_pipeline: &composited_effects::CompositedPipeline,
    frame: &manifest::FrameData,
    width: u32,
    height: u32,
) {
    if frame.composited_mode == 0 || frame.composited_intensity <= 0.01 {
        return;
    }

    let comp_uniforms = composited_effects::CompositedUniforms {
        mode: frame.composited_mode,
        intensity: frame.composited_intensity,
        time: frame.time,
        energy: frame.energy,
        bass: frame.bass,
        beat_snap: frame.beat_snap,
        width: width as f32,
        height: height as f32,
    };
    let output_view = renderer.output_texture_view();
    let mut encoder = renderer.device().create_command_encoder(
        &wgpu::CommandEncoderDescriptor { label: Some("composited_pass") },
    );
    let applied = composited_pipeline.apply(
        &mut encoder, renderer.device(),
        output_view, &comp_uniforms,
        renderer.vertex_buffer(), renderer.index_buffer(),
    );
    if applied {
        renderer.copy_to_readback(&mut encoder);
    }
    renderer.queue().submit(std::iter::once(encoder.finish()));
}

/// Read GPU pixels, composite CPU overlays, write to output sink.
/// When `schedule_handled_by_gpu` is true, the schedule overlays were
/// already painted on output_texture by `overlay_pass` and are skipped here;
/// the SVG layer compositing path (intro/endcard) is unaffected either way.
pub fn process_completed_frame(
    renderer: &mut gpu::GpuRenderer,
    frame_idx: usize,
    manifest: &manifest::Manifest,
    overlay_image_cache: &mut overlay_cache::OverlayImageCache,
    ffmpeg_pipe: &mut Option<ffmpeg::FfmpegPipe>,
    png_dir: &Option<std::path::PathBuf>,
    width: u32,
    height: u32,
    schedule_handled_by_gpu: bool,
) {
    let mut pixels = renderer.read_pixels();

    if let Some(ref overlay_layers) = manifest.overlay_layers {
        if let Some(frame_overlays) = overlay_layers.get(frame_idx) {
            compositor::composite_layers(&mut pixels, frame_overlays, width, height);
        }
    }
    if !schedule_handled_by_gpu {
        if let Some(ref schedule) = manifest.overlay_schedule {
            if let Some(frame_overlays) = schedule.get(frame_idx) {
                for instance in frame_overlays {
                    overlay_image_cache.composite_instance(&mut pixels, width, height, instance);
                }
            }
        }
    }

    if let Some(ref mut pipe) = ffmpeg_pipe {
        pipe.write_frame(&pixels).expect("FFmpeg write failed");
    } else if let Some(ref dir) = png_dir {
        let path = dir.join(format!("frame_{:07}.png", frame_idx));
        image::save_buffer(&path, &pixels, width, height, image::ColorType::Rgba8)
            .expect("PNG save failed");
    }
}

fn log_progress_milestone(progress: &ProgressBar) {
    let done = progress.position();
    let total = progress.length().unwrap_or(1);
    let interval = total / 20;
    if interval == 0 || done % interval != 0 || done == 0 {
        return;
    }
    let elapsed = progress.elapsed().as_secs_f64();
    let fps_actual = done as f64 / elapsed;
    let eta_sec = if fps_actual > 0.0 { (total - done) as f64 / fps_actual } else { 0.0 };
    eprintln!(
        "[progress] {}/{} frames ({:.0}%) | {:.1} fps | ETA: {:.0}m{:.0}s",
        done, total, done as f64 / total as f64 * 100.0,
        fps_actual, eta_sec / 60.0, eta_sec % 60.0,
    );
}
