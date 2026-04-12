//! Frame manifest — the JSON contract between Node.js pre-pass and Rust renderer.
//!
//! The Node.js pre-pass evaluates all TypeScript routing logic (scene selection,
//! transitions, audio-reactive uniforms) and writes a manifest with per-frame data.
//! This Rust renderer reads the manifest and renders each frame on the GPU.

use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

/// Top-level manifest: shaders + per-frame data.
#[derive(Debug, Deserialize)]
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
}

/// Per-frame data: which shader to use + all uniform values.
#[derive(Debug, Deserialize)]
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
}

pub fn load_manifest(path: &Path) -> Result<Manifest, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    let manifest: Manifest = serde_json::from_str(&content)?;
    Ok(manifest)
}
