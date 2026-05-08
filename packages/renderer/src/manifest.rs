//! Frame manifest — the JSON contract between Node.js pre-pass and Rust renderer.
//!
//! The Node.js pre-pass evaluates all TypeScript routing logic (scene selection,
//! transitions, audio-reactive uniforms) and writes a manifest with per-frame data.
//! This Rust renderer reads the manifest and renders each frame on the GPU.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

/// Top-level manifest: shaders + per-frame data.
#[derive(Debug, Serialize, Deserialize)]
pub struct Manifest {
    /// Map of shader_id → pre-composed GLSL source string.
    pub shaders: HashMap<String, String>,

    /// Per-frame rendering instructions.
    pub frames: Vec<FrameData>,

    /// Per-frame overlay layers (SVG strings with blend mode + opacity).
    /// Indexed by frame number. Optional — omit for shader-only renders.
    pub overlay_layers: Option<Vec<Vec<crate::compositor::OverlayLayer>>>,

    /// Per-frame overlay instances with transforms (preferred over overlay_layers).
    /// Each frame has a list of overlay instances with cached PNG + transform params.
    pub overlay_schedule: Option<Vec<Vec<crate::overlay_cache::OverlayInstance>>>,

    /// Directory containing pre-rendered overlay PNGs.
    pub overlay_png_dir: Option<String>,

    /// Metadata
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    pub show_title: Option<String>,

    /// Song boundaries for chapter card insertion.
    #[serde(default)]
    pub song_boundaries: Option<Vec<SongBoundary>>,
}

/// Song boundary marker for chapter cards.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SongBoundary {
    pub title: String,
    pub set: u32,
    #[serde(rename = "startFrame")]
    pub start_frame: u32,
    #[serde(rename = "endFrame")]
    pub end_frame: u32,
    /// True when this song is the second half of a canonical segue
    /// (the prior song flows directly into this one with no break).
    /// At segue boundaries the chapter card is suppressed and the
    /// shader crossfade is extended for visual continuity.
    #[serde(default, rename = "segueFromPrev")]
    pub segue_from_prev: bool,
}

/// Per-frame data: which shader to use + all uniform values.
#[derive(Debug, Serialize, Deserialize)]
pub struct FrameData {
    /// Which shader to render (key into manifest.shaders)
    pub shader_id: String,

    /// Frame index (0-based)
    pub frame: u32,

    /// Transition blend: if present, blend between shader_id and secondary_shader_id
    pub secondary_shader_id: Option<String>,
    pub blend_progress: Option<f32>,
    pub blend_mode: Option<String>,

    // ─── Audio uniforms (matches sharedUniformsGLSL) ───

    // Core audio
    pub energy: f32,
    pub rms: f32,
    pub bass: f32,
    pub mids: f32,
    pub highs: f32,
    pub onset: f32,
    pub centroid: f32,
    pub beat: f32,

    // Smoothed/derived
    pub slow_energy: f32,
    pub fast_energy: f32,
    pub fast_bass: f32,
    pub spectral_flux: f32,
    pub energy_accel: f32,
    pub energy_trend: f32,

    // Beat/rhythm
    pub tempo: f32,
    pub onset_snap: f32,
    pub beat_snap: f32,
    pub musical_time: f32,
    pub beat_confidence: f32,
    pub beat_stability: f32,
    pub downbeat: f32,

    // Drum stem
    pub drum_onset: f32,
    pub drum_beat: f32,
    pub stem_bass: f32,
    pub stem_drums: f32,

    // Vocal
    pub vocal_energy: f32,
    pub vocal_presence: f32,

    // Other stem
    pub other_energy: f32,
    pub other_centroid: f32,

    // Chroma/harmonic
    pub chroma_hue: f32,
    pub chroma_shift: f32,
    pub chord_index: f32,
    pub harmonic_tension: f32,
    pub melodic_pitch: f32,
    pub melodic_direction: f32,
    pub melodic_confidence: f32,
    pub chord_confidence: f32,

    // Section/structure
    pub section_type: f32,
    pub section_index: f32,
    pub section_progress: f32,
    pub climax_phase: f32,
    pub climax_intensity: f32,
    pub coherence: f32,
    pub jam_density: f32,
    pub jam_phase: f32,
    pub jam_progress: f32,

    // Forecast
    pub energy_forecast: f32,
    pub peak_approaching: f32,

    // Deep audio
    pub tempo_derivative: f32,
    pub dynamic_range: f32,
    pub space_score: f32,
    pub timbral_brightness: f32,
    pub timbral_flux: f32,
    pub vocal_pitch: f32,
    pub vocal_pitch_confidence: f32,
    pub improvisation_score: f32,

    // CLAP semantic
    pub semantic_psychedelic: f32,
    pub semantic_cosmic: f32,
    pub semantic_aggressive: f32,
    pub semantic_tender: f32,
    pub semantic_rhythmic: f32,
    pub semantic_ambient: f32,
    pub semantic_chaotic: f32,
    pub semantic_triumphant: f32,

    // Palette
    pub palette_primary: f32,
    pub palette_secondary: f32,
    pub palette_saturation: f32,

    // Time
    pub time: f32,
    pub dynamic_time: f32,
    pub beat_time: f32,

    // Envelope (from EnergyEnvelope)
    pub envelope_brightness: f32,
    pub envelope_saturation: f32,
    pub envelope_hue: f32,

    // Era grading
    pub era_saturation: f32,
    pub era_brightness: f32,
    pub era_sepia: f32,

    // Show-level
    pub show_warmth: f32,
    pub show_contrast: f32,
    pub show_saturation: f32,
    pub show_grain: f32,
    pub show_bloom: f32,

    // Shader params
    pub param_bass_scale: f32,
    pub param_energy_scale: f32,
    pub param_motion_speed: f32,
    pub param_color_sat_bias: f32,
    pub param_complexity: f32,
    pub param_drum_reactivity: f32,
    pub param_vocal_weight: f32,

    // Peak of show
    pub peak_of_show: f32,

    // Song/shader progress (Phase 2C)
    #[serde(default)]
    pub song_progress: Option<f32>,
    #[serde(default)]
    pub shader_hold_progress: Option<f32>,

    // Per-show visual character (Phase 4C)
    #[serde(default)]
    pub show_grain_character: Option<f32>,
    #[serde(default)]
    pub show_bloom_character: Option<f32>,
    #[serde(default)]
    pub show_temperature_character: Option<f32>,
    #[serde(default)]
    pub show_contrast_character: Option<f32>,

    // Tier 0 audit fixes (May 2026): plumbed UBO uniforms at offsets 648-656
    /// 0..1 across the whole show — drives the time-of-day color arc in
    /// postprocess.glsl (afternoon → golden hour → twilight).
    #[serde(default)]
    pub show_progress: Option<f32>,
    /// Per-era lifted-blacks floor (older film stocks can't hit pure black).
    /// Set per-era from ERA_BLACK_LIFT in the TypeScript pipeline.
    #[serde(default)]
    pub era_black_lift: Option<f32>,
    /// Per-era S-curve contrast scale (< 1 softer for older film, > 1
    /// harder for digital). Set per-era from ERA_CONTRAST_SCALE.
    #[serde(default)]
    pub era_contrast_scale: Option<f32>,

    // FFT contrast data (7-band spectral contrast for FFT texture)
    // Optional — if missing, synthesized from bass/mids/highs/energy
    #[serde(default)]
    pub contrast: Option<Vec<f32>>,

    // Motion blur sub-frame count (1 = no blur, 2-8 = blur intensity)
    // Adaptive: quiet=1 (free), medium=2, climax=4
    #[serde(default = "default_motion_blur")]
    pub motion_blur_samples: u32,

    // Visual effect mode (0=none, 1-14=post-processing, 15+=composited)
    #[serde(default)]
    pub effect_mode: u32,

    // Effect intensity (0.0-1.0)
    #[serde(default)]
    pub effect_intensity: f32,

    // Composited visual layer mode (0=none, 1-10=composited effects)
    // Runs independently of effect_mode — can have both at once.
    #[serde(default)]
    pub composited_mode: u32,

    // Composited effect intensity (0.0-1.0)
    #[serde(default)]
    pub composited_intensity: f32,

    // Show position (0.0=start, 1.0=end) for macro-pacing
    #[serde(default)]
    pub show_position: f32,

    // Camera behavior override (0=auto, 1=pull-back, 2=push-in, 3=rotate, 4=static, 5=zoom-punch)
    #[serde(default)]
    pub camera_behavior: u32,
}

fn default_motion_blur() -> u32 { 1 }

/// Load a manifest from disk. Supports both JSON (.json) and MessagePack (.msgpack) formats.
/// MessagePack is ~5-10x faster for large manifests (648K frames at 60fps = ~500MB JSON).
pub fn load_manifest(path: &Path) -> Result<Manifest, Box<dyn std::error::Error>> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("json");

    if ext == "msgpack" || ext == "mp" {
        let data = std::fs::read(path)?;
        let manifest: Manifest = rmp_serde::from_slice(&data)?;
        Ok(manifest)
    } else {
        let content = std::fs::read_to_string(path)?;
        let manifest: Manifest = serde_json::from_str(&content)?;
        Ok(manifest)
    }
}

/// Pre-flight report on shader_ids referenced by frames vs available in the
/// shaders map. Each entry in `missing` is `(shader_id, count_of_frames)`.
/// A missing shader silently renders as a black frame in the renderer's
/// fallback path — this lets `main` warn or abort before that happens.
///
/// Also includes a frame-count distribution across all referenced shaders,
/// which doubles as a "what does this show actually render" summary —
/// useful when a render finishes and the user wants to know whether one
/// shader dominated the frame count.
#[derive(Debug)]
pub struct ShaderValidationReport {
    /// Sorted by frame-count desc.
    pub missing: Vec<(String, usize)>,
    /// All referenced shader_ids with their frame counts, sorted by count desc.
    pub distribution: Vec<(String, usize)>,
    pub total_referenced: usize,
    pub frames_affected: usize,
    pub unique_shader_ids: usize,
    pub available_shaders: usize,
}

impl ShaderValidationReport {
    pub fn ok(&self) -> bool {
        self.missing.is_empty()
    }

    pub fn print(&self) {
        if self.ok() {
            println!(
                "Shaders: validation OK — {} unique shader_ids referenced, all present in {} loaded",
                self.unique_shader_ids, self.available_shaders,
            );
            return;
        }
        eprintln!(
            "Shaders: VALIDATION FAILED — {} unique shader_ids missing, {} frames will render as black",
            self.missing.len(), self.frames_affected,
        );
        eprintln!(
            "Shaders: {} unique referenced, {} loaded, {} total frame references",
            self.unique_shader_ids, self.available_shaders, self.total_referenced,
        );
        let limit = self.missing.len().min(20);
        for (id, count) in &self.missing[..limit] {
            eprintln!("  MISSING: {} ({} frames)", id, count);
        }
        if self.missing.len() > limit {
            eprintln!("  ... +{} more missing shader_ids", self.missing.len() - limit);
        }
    }

    /// Print the top N shaders by frame count, with their share of total
    /// frames. Run alongside `print()` to surface the show's shader mix —
    /// catches both intentional dominance and routing bugs that pin one
    /// shader for an entire show.
    pub fn print_distribution(&self, top_n: usize) {
        if self.distribution.is_empty() {
            return;
        }
        let total = self.total_referenced.max(1) as f64;
        let limit = self.distribution.len().min(top_n);
        println!(
            "Shaders: top {} by frame count (of {} unique, {} total refs):",
            limit, self.distribution.len(), self.total_referenced,
        );
        for (id, count) in &self.distribution[..limit] {
            let pct = 100.0 * (*count as f64) / total;
            println!("  {:>5} ({:>5.1}%)  {}", count, pct, id);
        }
        if self.distribution.len() > limit {
            let tail: usize = self.distribution[limit..].iter().map(|(_, c)| c).sum();
            let tail_pct = 100.0 * (tail as f64) / total;
            println!(
                "  {:>5} ({:>5.1}%)  +{} other shader_ids",
                tail, tail_pct, self.distribution.len() - limit,
            );
        }
    }

    /// Print a per-cost-tier rollup of frame counts. Combined with the
    /// top-N distribution this answers "is my show heavy?" at a glance:
    /// SLOW + BUSTED frame count tells you exactly how much LOD will
    /// help. Unique-id counts within each tier point at the actual
    /// optimization candidates.
    pub fn print_tier_distribution(&self) {
        use crate::shader_tiers::{tier_for, CostTier};
        if self.distribution.is_empty() {
            return;
        }
        let mut buckets: [(usize, usize); 5] = [(0, 0); 5]; // (frames, unique)
        for (id, count) in &self.distribution {
            let i = match tier_for(id) {
                CostTier::Ok60 => 0,
                CostTier::Ok30 => 1,
                CostTier::Slow => 2,
                CostTier::Busted => 3,
                CostTier::Unknown => 4,
            };
            buckets[i].0 += count;
            buckets[i].1 += 1;
        }
        let labels = ["OK60", "OK30", "SLOW", "BUSTED", "UNKNOWN"];
        let total = self.total_referenced.max(1) as f64;
        println!("Shaders: tier rollup (cost-baseline 360p, see SHADER-COST-PROFILE-2026-05-02.md):");
        for (i, label) in labels.iter().enumerate() {
            let (frames, unique) = buckets[i];
            if frames == 0 { continue; }
            let pct = 100.0 * (frames as f64) / total;
            println!("  {:<8} {:>6} ({:>5.1}%)  {} unique shader_id(s)", label, frames, pct, unique);
        }
        // Hint when many UNKNOWN — baseline data is stale, re-run profile.
        if buckets[4].1 > 0 {
            let unk_share = buckets[4].0 as f64 / total;
            if unk_share > 0.20 {
                println!(
                    "  HINT: {:.0}% of refs hit UNKNOWN tier — cost baseline may be stale; re-run shader_cost_profile",
                    unk_share * 100.0,
                );
            }
        }
    }
}

impl Manifest {
    /// Walk every frame's shader_id (and secondary_shader_id) and verify each
    /// is present in `self.shaders`. The renderer's missing-shader fallback
    /// writes a black frame; this report makes that silent failure visible
    /// before render starts.
    pub fn validate_shader_refs(&self) -> ShaderValidationReport {
        use std::collections::HashMap;
        let mut counts: HashMap<&str, usize> = HashMap::new();
        let mut total = 0usize;
        let mut missing_counts: HashMap<String, usize> = HashMap::new();
        let mut affected = 0usize;
        for f in &self.frames {
            *counts.entry(&f.shader_id).or_insert(0) += 1;
            total += 1;
            if !self.shaders.contains_key(&f.shader_id) {
                *missing_counts.entry(f.shader_id.clone()).or_insert(0) += 1;
                affected += 1;
            }
            if let Some(ref sid) = f.secondary_shader_id {
                *counts.entry(sid.as_str()).or_insert(0) += 1;
                total += 1;
                if !self.shaders.contains_key(sid) {
                    *missing_counts.entry(sid.clone()).or_insert(0) += 1;
                    affected += 1;
                }
            }
        }
        let mut missing: Vec<(String, usize)> = missing_counts.into_iter().collect();
        missing.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        let unique = counts.len();
        let mut distribution: Vec<(String, usize)> = counts
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect();
        distribution.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        ShaderValidationReport {
            missing,
            distribution,
            total_referenced: total,
            frames_affected: affected,
            unique_shader_ids: unique,
            available_shaders: self.shaders.len(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_frame(idx: u32) -> FrameData {
        FrameData {
            shader_id: "test_shader".to_string(),
            frame: idx,
            secondary_shader_id: None,
            blend_progress: None,
            blend_mode: None,
            energy: 0.5, rms: 0.4, bass: 0.3, mids: 0.6, highs: 0.7,
            onset: 0.1, centroid: 0.5, beat: 0.0,
            slow_energy: 0.45, fast_energy: 0.55, fast_bass: 0.35,
            spectral_flux: 0.2, energy_accel: 0.0, energy_trend: 0.1,
            tempo: 120.0, onset_snap: 0.0, beat_snap: 0.0, musical_time: 0.0,
            beat_confidence: 0.8, beat_stability: 0.9, downbeat: 0.0,
            drum_onset: 0.0, drum_beat: 0.0, stem_bass: 0.0, stem_drums: 0.0,
            vocal_energy: 0.0, vocal_presence: 0.0,
            other_energy: 0.0, other_centroid: 0.5,
            chroma_hue: 0.0, chroma_shift: 0.0, chord_index: 0.0,
            harmonic_tension: 0.0, melodic_pitch: 0.0, melodic_direction: 0.0,
            melodic_confidence: 0.0, chord_confidence: 0.0,
            section_type: 0.0, section_index: 0.0, section_progress: 0.0,
            climax_phase: 0.0, climax_intensity: 0.0, coherence: 0.0,
            jam_density: 0.0, jam_phase: 0.0, jam_progress: 0.0,
            energy_forecast: 0.0, peak_approaching: 0.0,
            tempo_derivative: 0.0, dynamic_range: 0.5, space_score: 0.0,
            timbral_brightness: 0.5, timbral_flux: 0.0, vocal_pitch: 0.0,
            vocal_pitch_confidence: 0.0, improvisation_score: 0.0,
            semantic_psychedelic: 0.0, semantic_cosmic: 0.0,
            semantic_aggressive: 0.0, semantic_tender: 0.0,
            semantic_rhythmic: 0.0, semantic_ambient: 0.0,
            semantic_chaotic: 0.0, semantic_triumphant: 0.0,
            palette_primary: 0.5, palette_secondary: 0.5, palette_saturation: 1.0,
            time: idx as f32 / 60.0, dynamic_time: 0.0, beat_time: 0.0,
            envelope_brightness: 1.0, envelope_saturation: 1.0, envelope_hue: 0.0,
            era_saturation: 1.0, era_brightness: 1.0, era_sepia: 0.0,
            show_warmth: 0.0, show_contrast: 1.0, show_saturation: 1.0,
            show_grain: 0.0, show_bloom: 1.0,
            param_bass_scale: 1.0, param_energy_scale: 1.0, param_motion_speed: 1.0,
            param_color_sat_bias: 0.0, param_complexity: 1.0,
            param_drum_reactivity: 1.0, param_vocal_weight: 1.0,
            peak_of_show: 0.0,
            song_progress: Some(0.5), shader_hold_progress: None,
            show_grain_character: None, show_bloom_character: None,
            show_temperature_character: None, show_contrast_character: None,
            show_progress: None, era_black_lift: None, era_contrast_scale: None,
            contrast: None,
            motion_blur_samples: 1,
            effect_mode: 0, effect_intensity: 0.0,
            composited_mode: 0, composited_intensity: 0.0,
            show_position: 0.0, camera_behavior: 0,
        }
    }

    fn sample_manifest() -> Manifest {
        let mut shaders = HashMap::new();
        shaders.insert("test_shader".to_string(), "void main() {}".to_string());
        Manifest {
            shaders,
            frames: vec![sample_frame(0), sample_frame(1), sample_frame(2)],
            overlay_layers: None,
            overlay_schedule: None,
            overlay_png_dir: None,
            width: Some(1920),
            height: Some(1080),
            fps: Some(60),
            show_title: Some("Test Show".to_string()),
            song_boundaries: None,
        }
    }

    #[test]
    fn manifest_roundtrip_msgpack() {
        let m = sample_manifest();
        let bytes = rmp_serde::to_vec_named(&m).expect("encode msgpack");
        let decoded: Manifest = rmp_serde::from_slice(&bytes).expect("decode msgpack");
        assert_eq!(decoded.frames.len(), 3);
        assert_eq!(decoded.frames[0].shader_id, "test_shader");
        assert_eq!(decoded.frames[2].frame, 2);
        assert_eq!(decoded.width, Some(1920));
        assert!((decoded.frames[1].energy - 0.5).abs() < 1e-5);
    }

    #[test]
    fn manifest_roundtrip_json() {
        let m = sample_manifest();
        let s = serde_json::to_string(&m).expect("encode json");
        let decoded: Manifest = serde_json::from_str(&s).expect("decode json");
        assert_eq!(decoded.frames.len(), 3);
        assert_eq!(decoded.frames[0].shader_id, "test_shader");
    }

    #[test]
    fn validate_shader_refs_passes_when_all_present() {
        let m = sample_manifest();  // shaders has "test_shader", all 3 frames use it
        let r = m.validate_shader_refs();
        assert!(r.ok());
        assert_eq!(r.unique_shader_ids, 1);
        assert_eq!(r.frames_affected, 0);
        assert_eq!(r.total_referenced, 3);
    }

    #[test]
    fn validate_shader_refs_flags_missing() {
        let mut m = sample_manifest();
        // Add a frame referencing a non-existent shader.
        let mut bad = sample_frame(99);
        bad.shader_id = "nonexistent".to_string();
        m.frames.push(bad);
        // And another with a missing secondary.
        let mut bad2 = sample_frame(100);
        bad2.secondary_shader_id = Some("also_missing".to_string());
        m.frames.push(bad2);

        let r = m.validate_shader_refs();
        assert!(!r.ok());
        assert_eq!(r.missing.len(), 2);
        // Sorted by frame count desc then id asc — both have count 1 so alpha order: also_missing < nonexistent
        assert_eq!(r.missing[0].0, "also_missing");
        assert_eq!(r.missing[1].0, "nonexistent");
        assert_eq!(r.frames_affected, 2);
    }

    #[test]
    fn validate_shader_refs_tier_distribution_buckets_correctly() {
        let mut m = sample_manifest();
        // Add a couple of known BUSTED + SLOW shader hits so the rollup
        // has something interesting to bucket.
        m.shaders.insert("voronoi-flow".to_string(), "// glsl".to_string());
        m.shaders.insert("river".to_string(), "// glsl".to_string());
        for i in 50..52 {
            let mut f = sample_frame(i);
            f.shader_id = "voronoi-flow".to_string();
            m.frames.push(f);
        }
        let mut river_frame = sample_frame(60);
        river_frame.shader_id = "river".to_string();
        m.frames.push(river_frame);

        let r = m.validate_shader_refs();
        // The distribution + tier_distribution helpers should have populated.
        assert!(r.distribution.iter().any(|(id, _)| id == "voronoi-flow"));
        assert!(r.distribution.iter().any(|(id, _)| id == "river"));
        // No assertion failure = print_tier_distribution doesn't panic.
        r.print_tier_distribution();
    }

    #[test]
    fn validate_shader_refs_distribution_sorted_desc() {
        let mut m = sample_manifest();
        // sample_manifest already has 3 frames using "test_shader".
        // Add 5 more frames using "popular" and 1 using "rare".
        m.shaders.insert("popular".to_string(), "// glsl".to_string());
        m.shaders.insert("rare".to_string(), "// glsl".to_string());
        for i in 10..15 {
            let mut f = sample_frame(i);
            f.shader_id = "popular".to_string();
            m.frames.push(f);
        }
        let mut rare = sample_frame(20);
        rare.shader_id = "rare".to_string();
        m.frames.push(rare);

        let r = m.validate_shader_refs();
        assert!(r.ok());
        assert_eq!(r.distribution.len(), 3);
        // Sorted by count desc: popular(5), test_shader(3), rare(1)
        assert_eq!(r.distribution[0], ("popular".to_string(), 5));
        assert_eq!(r.distribution[1], ("test_shader".to_string(), 3));
        assert_eq!(r.distribution[2], ("rare".to_string(), 1));
        assert_eq!(r.total_referenced, 9);
    }

    /// Cross-format equivalence: msgpack and json must produce equivalent manifests.
    #[test]
    fn manifest_msgpack_json_equivalent() {
        let m = sample_manifest();
        let json: Manifest =
            serde_json::from_str(&serde_json::to_string(&m).unwrap()).unwrap();
        let msgpack: Manifest =
            rmp_serde::from_slice(&rmp_serde::to_vec_named(&m).unwrap()).unwrap();
        assert_eq!(json.frames.len(), msgpack.frames.len());
        assert_eq!(json.frames[0].shader_id, msgpack.frames[0].shader_id);
        assert_eq!(json.frames[1].frame, msgpack.frames[1].frame);
        assert!((json.frames[2].energy - msgpack.frames[2].energy).abs() < 1e-5);
    }
}

