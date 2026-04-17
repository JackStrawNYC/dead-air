//! End card sequence — 10-second cinematic ending after the last song.
//!
//! Structure (at 30fps = 300 frames):
//!   0-2s   (0-60):    FADE OUT — last shader dissolves to black
//!   2-7s   (60-210):  SETLIST RECAP — show setlist with "DEAD AIR" branding
//!   7-10s  (210-300):  FADE TO BLACK — gentle fadeout
//!
//! Uses the intro shader with inverted energy (decaying instead of building).
//! Text overlays show the setlist and Dead Air branding.

use crate::compositor::{BlendMode, OverlayLayer};
use crate::manifest::FrameData;
use crate::text_layers::SongInfo;
use std::collections::HashMap;

/// End card timing (seconds).
const ENDCARD_DURATION: f32 = 10.0;
const FADE_OUT_END: f32 = 2.0;
const SETLIST_START: f32 = 2.0;
const SETLIST_END: f32 = 7.0;
const FINAL_FADE_START: f32 = 7.0;

pub const ENDCARD_SHADER_ID: &str = "__endcard__";

/// Show metadata for the end card.
pub struct EndcardMeta {
    pub venue: String,
    pub date_display: String,
    pub songs: Vec<String>,
}

/// Generate the end card GLSL shader — a gentle fog/ember fade-out.
fn endcard_shader_glsl() -> String {
    // Reuse a minimal atmospheric shader — deep indigo fog with fading embers
    format!(r#"
precision highp float;
uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uBass;
uniform float uRms;
uniform vec2 uResolution;
uniform float uEnvelopeBrightness;
uniform float uEnvelopeSaturation;

// Simple fbm noise
float hash(vec2 p) {{ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }}
float noise(vec2 p) {{
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}}
float fbm(vec2 p) {{
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {{
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
    }}
    return v;
}}

void main() {{
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= uResolution.x / uResolution.y;

    float t = uDynamicTime * 0.3;

    // Deep indigo fog with slowly drifting embers
    float fog = fbm(p * 1.5 + vec2(t * 0.1, t * 0.05));
    float embers = fbm(p * 4.0 + vec2(t * 0.3, -t * 0.2));
    embers = smoothstep(0.6, 0.8, embers) * uEnergy * 3.0;

    vec3 col = vec3(0.02, 0.01, 0.04) * (0.5 + fog * 0.5);
    col += vec3(0.8, 0.3, 0.1) * embers * 0.3;

    // Apply envelope for fade control
    col *= uEnvelopeBrightness;

    // Vignette
    float vig = 1.0 - dot(p * 0.5, p * 0.5);
    col *= smoothstep(0.0, 0.8, vig);

    gl_FragColor = vec4(col, 1.0);
}}
"#)
}

/// Generate end card SVG overlay — "DEAD AIR" branding + setlist.
fn endcard_overlay_svg(
    meta: &EndcardMeta,
    width: u32,
    height: u32,
    opacity: f32,
) -> String {
    let op = format!("{:.2}", opacity.clamp(0.0, 1.0));
    let cx = width / 2;
    let cy_brand = (height as f32 * 0.35) as u32;
    let brand_size = (width as f32 * 0.04).max(32.0) as u32;
    let info_size = (width as f32 * 0.012).max(12.0) as u32;
    let song_size = (width as f32 * 0.010).max(10.0) as u32;

    let mut songs_text = String::new();
    let song_start_y = (height as f32 * 0.50) as u32;
    let line_h = (height as f32 * 0.025).max(14.0) as u32;

    for (i, title) in meta.songs.iter().enumerate() {
        let y = song_start_y + (i as u32) * line_h;
        if y > height - 50 { break; } // don't overflow
        songs_text.push_str(&format!(
            "<text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"400\" \
             fill=\"rgba(255,255,255,0.6)\" text-anchor=\"middle\" \
             font-family=\"Helvetica Neue, Arial, sans-serif\">{}</text>",
            cx, y, song_size, xml_escape(title),
        ));
    }

    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\">\
         <g opacity=\"{}\">\
         <text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"300\" \
          fill=\"white\" text-anchor=\"middle\" letter-spacing=\"12\" \
          font-family=\"Cormorant Garamond, Georgia, serif\" \
          filter=\"drop-shadow(0 2px 8px rgba(0,0,0,0.7))\">DEAD AIR</text>\
         <text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"400\" \
          fill=\"rgba(255,255,255,0.7)\" text-anchor=\"middle\" \
          font-family=\"Helvetica Neue, Arial, sans-serif\">{} — {}</text>\
         {}\
         </g></svg>",
        width, height, op,
        cx, cy_brand, brand_size,
        cx, cy_brand + (brand_size as f32 * 1.2) as u32, info_size,
        xml_escape(&meta.venue), xml_escape(&meta.date_display),
        songs_text,
    )
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Generate end card frames + overlay layers.
pub fn generate_endcard(
    fps: u32,
    width: u32,
    height: u32,
    meta: &EndcardMeta,
    last_song_shader_id: Option<&str>,
) -> (HashMap<String, String>, Vec<FrameData>, Vec<Vec<OverlayLayer>>) {
    let total_frames = (ENDCARD_DURATION * fps as f32) as usize;

    let mut shaders = HashMap::new();
    shaders.insert(ENDCARD_SHADER_ID.to_string(), endcard_shader_glsl());

    let mut frames = Vec::with_capacity(total_frames);
    let mut overlays = Vec::with_capacity(total_frames);

    for i in 0..total_frames {
        let t = i as f32 / fps as f32;

        // Energy decays from 0.15 → 0
        let decay = 1.0 - (t / ENDCARD_DURATION);
        let energy = decay * 0.15;

        // Brightness: starts at 0.8, fades to 0 by end
        let brightness = if t < FADE_OUT_END {
            // Fade from last shader brightness to endcard
            0.8 * (t / FADE_OUT_END)
        } else if t > FINAL_FADE_START {
            // Final fade to black
            let fade_progress = (t - FINAL_FADE_START) / (ENDCARD_DURATION - FINAL_FADE_START);
            0.8 * (1.0 - fade_progress)
        } else {
            0.8
        };

        // Use last song's shader for first 2s dissolve, then endcard shader
        let shader_id = if t < FADE_OUT_END {
            last_song_shader_id.unwrap_or(ENDCARD_SHADER_ID)
        } else {
            ENDCARD_SHADER_ID
        };

        let frame_num = i as u32;
        frames.push(FrameData {
            shader_id: shader_id.to_string(),
            frame: frame_num,
            secondary_shader_id: if t < FADE_OUT_END { Some(ENDCARD_SHADER_ID.to_string()) } else { None },
            blend_progress: if t < FADE_OUT_END { Some(t / FADE_OUT_END) } else { None },
            blend_mode: if t < FADE_OUT_END { Some("dissolve".to_string()) } else { None },
            time: t,
            dynamic_time: t * 0.5, // slow drift
            beat_time: t * 0.5,
            energy,
            rms: energy,
            bass: energy * 0.5,
            mids: energy * 0.3,
            highs: energy * 0.2,
            onset: 0.0,
            centroid: 0.3,
            beat: 0.0,
            slow_energy: energy,
            fast_energy: energy,
            fast_bass: energy * 0.3,
            spectral_flux: 0.0,
            energy_accel: 0.0,
            energy_trend: -0.01,
            tempo: 60.0,
            onset_snap: 0.0,
            beat_snap: 0.0,
            musical_time: 0.0,
            beat_confidence: 0.0,
            beat_stability: 0.5,
            downbeat: 0.0,
            drum_onset: 0.0,
            drum_beat: 0.0,
            stem_bass: 0.0,
            stem_drums: 0.0,
            vocal_energy: 0.0,
            vocal_presence: 0.0,
            other_energy: 0.0,
            other_centroid: 0.3,
            chroma_hue: 240.0, // blue/indigo
            chroma_shift: 0.0,
            chord_index: 0.0,
            harmonic_tension: 0.0,
            melodic_pitch: 0.5,
            melodic_direction: 0.0,
            melodic_confidence: 0.0,
            chord_confidence: 0.0,
            section_type: 4.0, // outro
            section_index: 0.0,
            section_progress: t / ENDCARD_DURATION,
            climax_phase: 4.0, // release
            climax_intensity: decay,
            coherence: 0.0,
            jam_density: 0.3,
            jam_phase: 0.0,
            jam_progress: 0.0,
            energy_forecast: 0.0,
            peak_approaching: 0.0,
            tempo_derivative: 0.0,
            dynamic_range: 0.3,
            space_score: 0.5,
            timbral_brightness: 0.3,
            timbral_flux: 0.0,
            vocal_pitch: 0.0,
            vocal_pitch_confidence: 0.0,
            improvisation_score: 0.0,
            semantic_psychedelic: 0.0,
            semantic_cosmic: 0.2,
            semantic_aggressive: 0.0,
            semantic_tender: 0.3,
            semantic_rhythmic: 0.0,
            semantic_ambient: 0.6,
            semantic_chaotic: 0.0,
            semantic_triumphant: 0.0,
            palette_primary: 240.0 / 360.0,
            palette_secondary: 270.0 / 360.0,
            palette_saturation: 0.6,
            envelope_brightness: brightness,
            envelope_saturation: 0.6 + decay * 0.2,
            envelope_hue: 0.0,
            era_saturation: 1.0,
            era_brightness: 1.0,
            era_sepia: 0.0,
            show_warmth: 0.0,
            show_contrast: 1.0,
            show_saturation: 1.0,
            show_grain: 1.0,
            show_bloom: 1.0,
            param_bass_scale: 0.3,
            param_energy_scale: 0.3,
            param_motion_speed: 0.2,
            param_color_sat_bias: 0.0,
            param_complexity: 0.4,
            param_drum_reactivity: 0.0,
            param_vocal_weight: 0.0,
            peak_of_show: 0.0,
            song_progress: Some(1.0),
            shader_hold_progress: Some(t / ENDCARD_DURATION),
            show_grain_character: Some(0.5),
            show_bloom_character: Some(0.0),
            show_temperature_character: Some(0.0),
            show_contrast_character: Some(0.5),
            contrast: Some(vec![0.0; 7]),
            motion_blur_samples: 1,
        });

        // Overlay: setlist + branding during 2-7s
        let mut frame_overlays = Vec::new();
        if t >= SETLIST_START && t <= SETLIST_END {
            let setlist_fade = if t < SETLIST_START + 1.0 {
                (t - SETLIST_START) / 1.0
            } else if t > SETLIST_END - 1.0 {
                (SETLIST_END - t) / 1.0
            } else {
                1.0
            };

            let svg = endcard_overlay_svg(meta, width, height, setlist_fade);
            frame_overlays.push(OverlayLayer {
                svg: svg,
                opacity: setlist_fade,
                blend_mode: BlendMode::Screen,
                z_order: 10,
            });
        }
        overlays.push(frame_overlays);
    }

    (shaders, frames, overlays)
}
