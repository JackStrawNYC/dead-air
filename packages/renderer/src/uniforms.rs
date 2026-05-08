//! Uniform buffer construction — packs FrameData into the exact byte layout
//! that naga generates from the sharedUniformsGLSL declarations (std140).
//!
//! Layout is 656 bytes (padded). Offsets determined by std140 rules:
//!   float = 4B aligned, 4B size
//!   vec2  = 8B aligned, 8B size
//!   vec3  = 16B aligned, 12B data (+4 pad unless a float follows)
//!   vec4  = 16B aligned, 16B size
//!
//! The GLSL declaration order in uniforms.glsl.ts is the SOLE source of truth.

use crate::manifest::FrameData;

/// Total uniform buffer size in bytes.
/// 125 uniforms, last is uCamOffset (vec2) at offset 640, size 8 → 648.
/// Padded to 16-byte alignment → 672 (was 656; bumped by Tier 0 audit fixes
/// adding uShowProgress / uEraBlackLift / uEraContrastScale at offsets
/// 648 / 652 / 656).
const UBO_SIZE: usize = 672;

/// EMA smoothing alpha for lighting transitions.
/// At 30fps: alpha=0.03 → ~2s transition. At 60fps: alpha=0.015 → ~2s.
const LIGHTING_EMA_ALPHA: f32 = 0.03;

/// Persistent lighting state for EMA smoothing across frames.
#[derive(Clone, Copy)]
pub struct LightingState {
    pub dir: [f32; 3],
    pub color: [f32; 3],
    pub intensity: f32,
    pub ambient: [f32; 3],
    pub temperature: f32,
}

impl Default for LightingState {
    fn default() -> Self {
        Self {
            dir: [0.3, 0.8, 0.5],
            color: [1.0, 0.95, 0.9],
            intensity: 0.7,
            ambient: [0.08, 0.07, 0.09],
            temperature: 0.0,
        }
    }
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// Write a f32 at a specific byte offset in the buffer.
fn write_f32(buf: &mut [u8], offset: usize, val: f32) {
    let bytes = val.to_le_bytes();
    buf[offset..offset + 4].copy_from_slice(&bytes);
}

/// Build the uniform buffer for a single frame.
/// Offsets match the GLSL uniform declaration order exactly (std140 layout).
/// `lighting` is mutated in-place with EMA-smoothed lighting transitions.
pub fn build_uniform_buffer(frame: &FrameData, width: u32, height: u32, lighting: &mut LightingState) -> Vec<u8> {
    // Pad to 16-byte alignment (wgpu requirement for uniform buffers)
    let padded_size = (UBO_SIZE + 15) & !15;
    let mut buf = vec![0u8; padded_size];

    // Schema-driven simple field copies (Wave 2.1 phase D). Writes the 98
    // uniforms whose schema rust_source is `frame.X` or
    // `frame.X.unwrap_or(default)` directly from `uniforms-schema.json`.
    // The hand-written write_f32 calls below remain (belt-and-suspenders);
    // they overwrite simple offsets with the same values and own the
    // computed/synthetic uniforms (camera, lighting, formulas, vec blocks).
    // Byte-equivalence is gated by tests/uniform_packer_parity.rs.
    let _ = crate::uniforms_layout::pack_simple_uniforms(frame, &mut buf);

    // ─── Time ─── (offsets 0-8)

    // ─── Core Audio Features ─── (offsets 12-44)
    // uFlatness: spectral flatness (0=tonal, 1=noise-like). Approximate from
    // available features: high centroid + low harmonic tension ≈ flat/noisy.
    let flatness = frame.centroid * 0.5 + (1.0 - frame.harmonic_tension.min(1.0)) * 0.3;
    write_f32(&mut buf, 44, flatness.clamp(0.0, 1.0)); // uFlatness

    // ─── Smoothed / Derived Audio ─── (offsets 48-76)

    // ─── Beat / Rhythm ─── (offsets 80-92)

    // ─── Drum Stem ─── (offsets 96-124)

    // ─── Vocal / Other Stem ─── (offsets 128-132)

    // ─── Chroma / Spectral ─── (offsets 136-236)
    // uAfterglowHue: hue carryover from high-energy moments. Approximate
    // from chroma_hue weighted by energy — lingers when energy was high.
    write_f32(&mut buf, 144, frame.chroma_hue * frame.energy.min(1.0) * 0.5); // uAfterglowHue
    // padding 148-159 (align vec4 to 16)

    // uContrast0 at 160 (vec4): spectral contrast bands 0-3
    if let Some(ref contrast) = frame.contrast {
        for (i, &v) in contrast.iter().take(4).enumerate() {
            write_f32(&mut buf, 160 + i * 4, v);
        }
        // uContrast1 at 176 (vec4): spectral contrast bands 4-6
        for (i, &v) in contrast.iter().skip(4).take(3).enumerate() {
            write_f32(&mut buf, 176 + i * 4, v);
        }
    } else {
        // Synthesize from audio features
    }
    // uChroma0-2 at 192/208/224 (vec4 each): 12-band chroma
    let hue = frame.chroma_hue;
    let hue_bin = ((hue / 360.0) * 12.0) as usize;
    for i in 0..12 {
        let offset = 192 + i * 4;
        let val = if i == hue_bin % 12 { 1.0 } else { 0.1 };
        write_f32(&mut buf, offset, val);
    }
    // (uFFTTexture is sampler2D — separate binding, not in UBO)

    // ─── Section / Structure ─── (offsets 240-268)

    // ─── Jam Evolution ─── (offsets 272-276)

    // ─── Palette / Color ─── (offsets 280-288)

    // ─── Era ─── (offsets 292-300)

    // ─── Post-Process Control ─── (offsets 304-312)
    // Formula from JS: -0.08 - energy * 0.18 (shifts the GLSL threshold calculation)
    write_f32(&mut buf, 304, -0.08 - frame.energy * 0.18); // uBloomThreshold
    // Formula from JS: 0.02 + energy * 0.06
    write_f32(&mut buf, 308, 0.02 + frame.energy * 0.06);  // uLensDistortion
    write_f32(&mut buf, 312, 1.0);                          // uGradingIntensity

    // ─── Melodic / Harmonic ─── (offsets 316-364)

    // ─── Peak-of-Show ─── (offset 368)

    // ─── Hero Icon ─── (offsets 372-376)
    write_f32(&mut buf, 372, 0.0);                    // uHeroIconTrigger
    write_f32(&mut buf, 376, 0.0);                    // uHeroIconProgress

    // ─── Show Film Stock ─── (offsets 380-396)

    // ─── Venue Profile ─── (offset 400)
    write_f32(&mut buf, 400, 0.2);                     // uVenueVignette
    // padding 404-415 (align vec3 uCamPos to 16)

    // ─── 3D Camera (computed from audio) ─── (offsets 416-452)
    {
        let energy = frame.energy.clamp(0.0, 1.0);
        let bass = frame.bass.clamp(0.0, 1.0);
        let time = frame.time;
        let dyn_time = frame.dynamic_time;
        let vocal_p = frame.vocal_presence.clamp(0.0, 1.0);
        let drum_on = frame.drum_onset.clamp(0.0, 1.0);
        let beat_stab = frame.beat_stability.clamp(0.0, 1.0);
        let climax_int = frame.climax_intensity.clamp(0.0, 1.0);

        // Camera behavior: section-type driven storytelling
        // 0=auto, 1=pull-back (vast), 2=push-in (intimate), 3=rotate (disorienting),
        // 4=static (grounded), 5=zoom-punch (climax)
        let cam_behavior = frame.camera_behavior;
        let behavior_mod = match cam_behavior {
            1 => (1.5_f32, 0.005_f32),  // pull-back: wider radius, slower orbit
            2 => (0.6, 0.03),            // push-in: tighter radius, faster orbit
            3 => (1.0, 0.04),            // rotate: normal radius, fast spin
            4 => (1.0, 0.002),           // static: normal radius, nearly still
            5 => (0.8, 0.01),            // zoom-punch: tight, moderate
            _ => (1.0, 0.02),            // auto: default orbital
        };

        let base_radius = (3.5 - energy * 0.5) * behavior_mod.0;
        let vocal_mod = if vocal_p > 0.3 { 0.9 } else { 1.0 };
        let radius = base_radius * vocal_mod;
        let orbit_angle = dyn_time * behavior_mod.1;
        let orbit_height = (dyn_time * 0.015).sin() * 0.3;

        let cam_x = orbit_angle.sin() * radius;
        let cam_y = orbit_height;
        let cam_z = orbit_angle.cos() * radius;

        // Bass shake (dampened by steadiness + vocals)
        let shake_damp = 1.0 - beat_stab * 0.8;
        let vocal_shake_damp = if vocal_p > 0.3 { 0.8 } else { 1.0 };
        let sd = shake_damp * vocal_shake_damp;
        let shake_x = (time * 3.7).sin() * bass * 0.06 * sd;
        let shake_y = (time * 2.3).cos() * bass * 0.04 * sd;
        let shake_z = (time * 4.1).sin() * bass * 0.03 * sd;

        // Drum jolt
        let jolt_thresh = 0.5;
        let jolt_x = if drum_on > jolt_thresh { (drum_on - jolt_thresh) * 0.08 * (time * 7.3).sin() } else { 0.0 };
        let jolt_y = if drum_on > jolt_thresh { (drum_on - jolt_thresh) * 0.06 * (time * 5.1).cos() } else { 0.0 };
        let jolt_z = if drum_on > jolt_thresh { (drum_on - jolt_thresh) * 0.04 * (time * 6.7).sin() } else { 0.0 };

        write_f32(&mut buf, 416, cam_x + shake_x + jolt_x); // uCamPos.x
        write_f32(&mut buf, 420, cam_y + shake_y + jolt_y); // uCamPos.y
        write_f32(&mut buf, 424, cam_z + shake_z + jolt_z); // uCamPos.z
        // padding at 428-431 (uCamTarget needs 16-byte alignment)

        // Target: 3D sway (not locked to Z=0 plane)
        let tgt_x = (dyn_time * 0.01).sin() * 0.1;
        let tgt_y = (dyn_time * 0.008).cos() * 0.05;
        let tgt_z = (dyn_time * 0.006).sin() * 0.03 * energy; // subtle Z drift, energy-gated
        write_f32(&mut buf, 432, tgt_x); // uCamTarget.x
        write_f32(&mut buf, 436, tgt_y); // uCamTarget.y
        write_f32(&mut buf, 440, tgt_z); // uCamTarget.z

        // FOV: wider at peaks (50 base, +10 at full energy)
        let fov = (50.0 + energy * 10.0).clamp(45.0, 65.0);
        write_f32(&mut buf, 444, fov);    // uCamFov

        // DOF: energy + climax driven
        let dof = (energy * 0.4 + climax_int * 0.3).clamp(0.0, 1.0);
        let focus_dist = (3.0 - energy * 1.0).clamp(2.0, 5.0);
        write_f32(&mut buf, 448, dof);          // uCamDof
        write_f32(&mut buf, 452, focus_dist);   // uCamFocusDist
    }

    // ─── Envelope ─── (offsets 456-464)

    // ─── Deep Audio (Level 2) ─── (offsets 468-488)

    // ─── Effects ─── (offset 492)
    write_f32(&mut buf, 492, 0.0);                        // uPhilBombWave

    // ─── Semantic Labels (CLAP) ─── (offsets 496-524)

    // ─── Per-Song Shader Parameter Modulation ─── (offsets 528-552)
    // padding 556-559 (align vec3 uKeyLightDir to 16)

    // ─── Shared Lighting Context (EMA-smoothed, section-aware) ─── (offsets 560-604)
    {
        let section = frame.section_type as i32;
        let energy = frame.energy.clamp(0.0, 1.0);

        // Section lighting presets: [dir_x, dir_y, dir_z, col_r, col_g, col_b, intensity, amb_r, amb_g, amb_b, temp]
        let presets: [[f32; 11]; 8] = [
            [0.2, 0.6, 0.8, 1.0, 0.93, 0.85, 0.6, 0.10, 0.08, 0.06, 0.3],  // verse
            [0.0, 1.0, 0.3, 1.0, 1.0, 1.0, 0.9, 0.12, 0.11, 0.12, 0.0],    // chorus
            [0.3, 0.7, 0.5, 0.95, 0.93, 0.95, 0.55, 0.08, 0.08, 0.09, 0.0], // bridge
            [0.2, 0.5, 0.7, 0.9, 0.88, 0.85, 0.45, 0.06, 0.05, 0.07, 0.1],  // intro
            [0.1, 0.7, 0.4, 0.9, 0.85, 0.8, 0.4, 0.06, 0.05, 0.06, 0.15],   // outro
            [0.7, 0.4, -0.3, 0.85, 0.9, 1.0, 0.7, 0.06, 0.07, 0.12, -0.3],  // jam
            [0.1, 0.9, 0.2, 1.0, 0.92, 0.75, 0.85, 0.09, 0.07, 0.05, 0.4],  // solo
            [0.0, 1.0, 0.0, 0.8, 0.75, 0.9, 0.3, 0.05, 0.03, 0.08, -0.5],   // space
        ];
        let idx = (section as usize).min(7);
        let p = presets[idx];

        // Compute TARGET lighting for this section + energy
        let energy_boost = energy * 0.15;
        let ambient_boost = energy * 0.04;
        let len = (p[0]*p[0] + p[1]*p[1] + p[2]*p[2]).sqrt().max(0.001);
        let target = LightingState {
            dir: [p[0] / len, p[1] / len, p[2] / len],
            color: [p[3], p[4], p[5]],
            intensity: (p[6] + energy_boost).clamp(0.0, 1.0),
            ambient: [
                (p[7] + ambient_boost).clamp(0.0, 1.0),
                (p[8] + ambient_boost).clamp(0.0, 1.0),
                (p[9] + ambient_boost).clamp(0.0, 1.0),
            ],
            temperature: (p[10] * 0.6 + frame.show_warmth * 0.4).clamp(-1.0, 1.0),
        };

        // EMA smooth: ~2s transition between section lighting states
        let a = LIGHTING_EMA_ALPHA;
        lighting.dir[0] = lerp(lighting.dir[0], target.dir[0], a);
        lighting.dir[1] = lerp(lighting.dir[1], target.dir[1], a);
        lighting.dir[2] = lerp(lighting.dir[2], target.dir[2], a);
        lighting.color[0] = lerp(lighting.color[0], target.color[0], a);
        lighting.color[1] = lerp(lighting.color[1], target.color[1], a);
        lighting.color[2] = lerp(lighting.color[2], target.color[2], a);
        lighting.intensity = lerp(lighting.intensity, target.intensity, a);
        lighting.ambient[0] = lerp(lighting.ambient[0], target.ambient[0], a);
        lighting.ambient[1] = lerp(lighting.ambient[1], target.ambient[1], a);
        lighting.ambient[2] = lerp(lighting.ambient[2], target.ambient[2], a);
        lighting.temperature = lerp(lighting.temperature, target.temperature, a);

        // Re-normalize direction after interpolation
        let dl = (lighting.dir[0]*lighting.dir[0] + lighting.dir[1]*lighting.dir[1] + lighting.dir[2]*lighting.dir[2]).sqrt().max(0.001);
        write_f32(&mut buf, 560, lighting.dir[0] / dl);
        write_f32(&mut buf, 564, lighting.dir[1] / dl);
        write_f32(&mut buf, 568, lighting.dir[2] / dl);
        write_f32(&mut buf, 576, lighting.color[0]);
        write_f32(&mut buf, 580, lighting.color[1]);
        write_f32(&mut buf, 584, lighting.color[2]);
        write_f32(&mut buf, 588, lighting.intensity);
        write_f32(&mut buf, 592, lighting.ambient[0]);
        write_f32(&mut buf, 596, lighting.ambient[1]);
        write_f32(&mut buf, 600, lighting.ambient[2]);
        write_f32(&mut buf, 604, lighting.temperature);
    }

    // ─── Temporal Coherence ─── (offset 608)
    // Energy-responsive: quiet sections get more temporal blending (smooth motion),
    // loud sections get less (crisp transients). Matches Remotion EnergyEnvelope.
    let temporal_blend = 0.12 * (1.0 - frame.energy.min(1.0) * 0.5);
    write_f32(&mut buf, 608, temporal_blend);  // uTemporalBlendStrength

    // ─── Per-Show Visual Identity ─── (offsets 612-624)
    // padding 628-631 (align vec2 uResolution to 8)

    // ─── Spatial ─── (offsets 632-644)
    write_f32(&mut buf, 632, width as f32);  // uResolution.x
    write_f32(&mut buf, 636, height as f32); // uResolution.y
    // ─── Camera Offset (parallax drift) ─── (offsets 640-644)
    {
        let bass_amp = frame.bass.clamp(0.0, 1.0) * 12.0;
        let time = frame.time;
        let dyn_time = frame.dynamic_time;
        let cam_off_x = (time * 3.7).sin() * bass_amp * 0.5
            + (dyn_time * 0.03 * std::f32::consts::PI * 2.0).sin() * 4.0;
        let cam_off_y = (time * 2.3).cos() * bass_amp * 0.3
            + (dyn_time * 0.03 * std::f32::consts::PI * 2.0 * 0.7 + 1.3).cos() * 2.4;
        write_f32(&mut buf, 640, cam_off_x); // uCamOffset.x
        write_f32(&mut buf, 644, cam_off_y); // uCamOffset.y
    }

    // ─── Per-Show Visual Identity (extended) ─── (offsets 648-659)
    // Three uniforms added by the post-Veneta audit Tier 0 fixes:
    //   648: uShowProgress     — 0..1 across whole show, drives time-of-day arc
    //   652: uEraBlackLift     — film-stock lifted-blacks floor per era
    //   656: uEraContrastScale — film-stock S-curve scale per era
    write_f32(&mut buf, 648, frame.show_progress.unwrap_or(0.0));
    write_f32(&mut buf, 652, frame.era_black_lift.unwrap_or(0.0));
    write_f32(&mut buf, 656, frame.era_contrast_scale.unwrap_or(1.0));

    // Total data: 660 bytes, padded to 672 (16-byte alignment)

    buf
}

/// Build FFT texture data from frame's audio features.
/// Produces 64 RGBA8 pixels (256 bytes) for a 64x1 texture.
/// Matches the JS engine's FullscreenQuad.tsx contrast → FFT texture pipeline.
pub fn build_fft_data(frame: &FrameData) -> [u8; 256] {
    let mut data = [0u8; 256];

    // Get 7-band contrast data (or synthesize from audio features)
    let bands: [f32; 7] = if let Some(ref contrast) = frame.contrast {
        let mut b = [0.0f32; 7];
        for (i, val) in contrast.iter().take(7).enumerate() {
            b[i] = *val;
        }
        b
    } else {
        // Synthesize from available audio features
        [
            frame.bass,
            frame.stem_bass,
            frame.mids,
            frame.energy,
            frame.highs,
            frame.other_centroid.min(1.0),
            frame.timbral_brightness,
        ]
    };

    // Pack 7 bands into 64 bins (each band fills floor(64/7) = 9 bins, last fills remainder)
    let bins_per_band = 64 / 7; // 9
    for (band_idx, &value) in bands.iter().enumerate() {
        let start = band_idx * bins_per_band;
        let end = if band_idx == 6 { 64 } else { start + bins_per_band };
        let byte_val = (value.clamp(0.0, 1.0) * 255.0) as u8;
        for bin in start..end {
            // RGBA8: store value in R channel, zero G/B, full A
            let offset = bin * 4;
            data[offset] = byte_val;     // R
            data[offset + 1] = 0;        // G
            data[offset + 2] = 0;        // B
            data[offset + 3] = 255;      // A
        }
    }

    data
}
