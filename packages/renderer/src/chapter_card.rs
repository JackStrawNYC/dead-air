//! Chapter card sequence — 3-second interstitial between songs showing the
//! upcoming song title, artist, and set position.
//!
//! Structure (at 30fps = 90 frames):
//!   0-0.5s  (0-15):   FADE IN — text emerges over fog background
//!   0.5-2.5s (15-75): HOLD — song title displayed at full opacity
//!   2.5-3.0s (75-90): FADE OUT — text dissolves, fog darkens
//!
//! Background: reuses the endcard fog shader (deep indigo with drifting embers).
//! Text overlays (song title, artist, set label) are composited as SVG layers.

use crate::compositor::{BlendMode, OverlayLayer};
use crate::manifest::FrameData;
use std::collections::HashMap;

/// Chapter card timing (seconds).
const CHAPTER_DURATION: f32 = 3.0;
const FADE_IN_END: f32 = 0.5;
const FADE_OUT_START: f32 = 2.5;

pub const CHAPTER_CARD_SHADER_ID: &str = "__chapter_card__";

/// Generate the chapter card GLSL shader — deep indigo fog with fading embers.
/// Same visual language as the endcard fog shader.
fn chapter_card_shader_glsl() -> String {
    format!(
        r#"
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
"#
    )
}

/// Generate the chapter card SVG overlay — song title (large, centered),
/// artist name, set position label, venue + date, and a Dead-style
/// ornamental flourish. Audit flagged generic Netflix-doc design; this
/// upgrade adds concert-poster typography (uppercase serif title with
/// letter spacing), venue/date stamps for documentary context, and
/// double-line + diamond flourish in place of the bare middle rule.
fn chapter_card_overlay_svg(
    song_title: &str,
    set_label: &str,
    track_number: u32,
    venue: Option<&str>,
    date: Option<&str>,
    width: u32,
    height: u32,
    opacity: f32,
) -> String {
    let op = format!("{:.2}", opacity.clamp(0.0, 1.0));
    let cx = width / 2;

    // Song title — UPPERCASE for concert-poster feel, with generous letter spacing
    let title_upper = song_title.to_uppercase();
    let title_y = (height as f32 * 0.45) as u32;
    let title_size = (width as f32 * 0.042).max(36.0) as u32;

    // Set + track label
    let label_y = title_y + (title_size as f32 * 1.4) as u32;
    let label_size = (width as f32 * 0.014).max(12.0) as u32;

    // Venue + date — below set/track for documentary context
    let venue_y = label_y + (label_size as f32 * 1.8) as u32;
    let venue_size = (width as f32 * 0.013).max(11.0) as u32;

    // Artist: above the title, subtle
    let artist_y = title_y - (title_size as f32 * 1.2) as u32;
    let artist_size = (width as f32 * 0.012).max(10.0) as u32;

    // Ornamental flourish — double line with center diamond, between artist and title
    let line_y = title_y - (title_size as f32 * 0.55) as u32;
    let line_half_w = (width as f32 * 0.08) as u32;
    let diamond_cy = line_y;
    let diamond_r = (label_size as f32 * 0.35) as u32;
    let venue_text = venue.unwrap_or("");
    let date_text = date.unwrap_or("");
    let venue_date = if !venue_text.is_empty() && !date_text.is_empty() {
        format!("{} \u{2022} {}", venue_text.to_uppercase(), date_text)
    } else if !venue_text.is_empty() {
        venue_text.to_uppercase()
    } else if !date_text.is_empty() {
        date_text.to_string()
    } else {
        String::new()
    };

    let venue_block = if venue_date.is_empty() {
        String::new()
    } else {
        format!(
            "<text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"300\" \
             fill=\"rgba(255,255,255,0.40)\" text-anchor=\"middle\" \
             letter-spacing=\"3\" \
             font-family=\"Helvetica Neue, Arial, sans-serif\">{}</text>",
            cx, venue_y, venue_size, venue_date,
        )
    };

    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\">\
         <g opacity=\"{}\">\
         <text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"300\" \
          fill=\"rgba(255,255,255,0.5)\" text-anchor=\"middle\" \
          letter-spacing=\"4\" \
          font-family=\"Helvetica Neue, Arial, sans-serif\">GRATEFUL DEAD</text>\
         <line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" \
          stroke=\"rgba(255,255,255,0.30)\" stroke-width=\"1\" />\
         <line x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\" \
          stroke=\"rgba(255,255,255,0.30)\" stroke-width=\"1\" />\
         <polygon points=\"{},{} {},{} {},{} {},{}\" \
          fill=\"rgba(255,255,255,0.55)\" />\
         <text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"400\" \
          fill=\"white\" text-anchor=\"middle\" \
          letter-spacing=\"6\" \
          font-family=\"Georgia, 'Palatino Linotype', serif\" \
          filter=\"drop-shadow(0 2px 10px rgba(0,0,0,0.85))\">{}</text>\
         <text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"400\" \
          fill=\"rgba(255,255,255,0.55)\" text-anchor=\"middle\" \
          letter-spacing=\"3\" \
          font-family=\"Helvetica Neue, Arial, sans-serif\">{} \u{00B7} TRACK {}</text>\
         {}\
         </g></svg>",
        width,
        height,
        op,
        // Artist
        cx,
        artist_y,
        artist_size,
        // Left half of double line (split by diamond)
        cx - line_half_w,
        line_y,
        cx - diamond_r * 2,
        line_y,
        // Right half of double line
        cx + diamond_r * 2,
        line_y,
        cx + line_half_w,
        line_y,
        // Diamond at center: top, right, bottom, left
        cx, diamond_cy - diamond_r,
        cx + diamond_r, diamond_cy,
        cx, diamond_cy + diamond_r,
        cx - diamond_r, diamond_cy,
        // Song title (UPPERCASE)
        cx,
        title_y,
        title_size,
        xml_escape(&title_upper),
        // Set label + track
        cx,
        label_y,
        label_size,
        xml_escape(set_label).to_uppercase(),
        track_number,
        // Venue + date block (may be empty)
        venue_block,
    )
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Generate chapter card frames + overlay layers.
///
/// Returns (shaders, frames, overlays) matching the intro/endcard pattern:
/// - `shaders`: map of shader_id -> GLSL source (one entry for the fog shader)
/// - `frames`: synthetic FrameData for each frame (90 at 30fps)
/// - `overlays`: per-frame OverlayLayer vectors with the text SVG
pub fn generate_chapter_card(
    fps: u32,
    width: u32,
    height: u32,
    song_title: &str,
    set_label: &str,
    track_number: u32,
    venue: Option<&str>,
    date: Option<&str>,
) -> (HashMap<String, String>, Vec<FrameData>, Vec<Vec<OverlayLayer>>) {
    let total_frames = (CHAPTER_DURATION * fps as f32) as usize;

    let mut shaders = HashMap::new();
    shaders.insert(
        CHAPTER_CARD_SHADER_ID.to_string(),
        chapter_card_shader_glsl(),
    );

    let mut frames = Vec::with_capacity(total_frames);
    let mut overlays = Vec::with_capacity(total_frames);

    for i in 0..total_frames {
        let t = i as f32 / fps as f32;
        let progress = t / CHAPTER_DURATION;

        // Text opacity: fade in 0-0.5s, hold 0.5-2.5s, fade out 2.5-3.0s
        let text_opacity = if t < FADE_IN_END {
            t / FADE_IN_END
        } else if t > FADE_OUT_START {
            (CHAPTER_DURATION - t) / (CHAPTER_DURATION - FADE_OUT_START)
        } else {
            1.0
        };

        // Background brightness: gentle arc, peaks mid-card
        let brightness = {
            let fade_in = (t / FADE_IN_END).min(1.0);
            let fade_out = ((CHAPTER_DURATION - t) / (CHAPTER_DURATION - FADE_OUT_START)).min(1.0);
            0.7 * fade_in * fade_out
        };

        // Very low energy — near-silent interstitial
        let energy = 0.05 * (0.8 + 0.2 * (t * 0.5).sin());

        let frame_num = i as u32;
        frames.push(FrameData {
            shader_id: CHAPTER_CARD_SHADER_ID.to_string(),
            frame: frame_num,
            secondary_shader_id: None,
            blend_progress: None,
            blend_mode: None,
            time: t,
            dynamic_time: t * 0.4, // slow drift
            beat_time: t * 0.4,
            energy,
            rms: energy,
            bass: energy * 0.4,
            mids: energy * 0.3,
            highs: energy * 0.2,
            onset: 0.0,
            centroid: 0.3,
            beat: 0.0,
            slow_energy: energy,
            fast_energy: energy,
            fast_bass: energy * 0.2,
            spectral_flux: 0.0,
            energy_accel: 0.0,
            energy_trend: 0.0,
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
            chroma_hue: 240.0, // indigo — match fog shader
            chroma_shift: 0.0,
            chord_index: 0.0,
            harmonic_tension: 0.0,
            melodic_pitch: 0.5,
            melodic_direction: 0.0,
            melodic_confidence: 0.0,
            chord_confidence: 0.0,
            section_type: 0.0, // intro-like
            section_index: 0.0,
            section_progress: progress,
            climax_phase: 0.0,
            climax_intensity: 0.0,
            coherence: 0.0,
            jam_density: 0.0,
            jam_phase: 0.0,
            jam_progress: 0.0,
            energy_forecast: 0.0,
            peak_approaching: 0.0,
            tempo_derivative: 0.0,
            dynamic_range: 0.3,
            space_score: 0.8, // very spacious — interstitial silence
            timbral_brightness: 0.3,
            timbral_flux: 0.0,
            vocal_pitch: 0.0,
            vocal_pitch_confidence: 0.0,
            improvisation_score: 0.0,
            semantic_psychedelic: 0.0,
            semantic_cosmic: 0.2,
            semantic_aggressive: 0.0,
            semantic_tender: 0.2,
            semantic_rhythmic: 0.0,
            semantic_ambient: 0.7,
            semantic_chaotic: 0.0,
            semantic_triumphant: 0.0,
            palette_primary: 240.0 / 360.0,
            palette_secondary: 270.0 / 360.0,
            palette_saturation: 0.5,
            envelope_brightness: brightness,
            envelope_saturation: 0.5,
            envelope_hue: 0.0,
            era_saturation: 1.0,
            era_brightness: 1.0,
            era_sepia: 0.0,
            show_warmth: 0.0,
            show_contrast: 1.0,
            show_saturation: 1.0,
            show_grain: 1.0,
            show_bloom: 1.0,
            param_bass_scale: 0.2,
            param_energy_scale: 0.2,
            param_motion_speed: 0.2,
            param_color_sat_bias: 0.0,
            param_complexity: 0.3,
            param_drum_reactivity: 0.0,
            param_vocal_weight: 0.0,
            peak_of_show: 0.0,
            song_progress: Some(progress),
            shader_hold_progress: Some(progress),
            show_grain_character: Some(0.5),
            show_bloom_character: Some(0.0),
            show_temperature_character: Some(0.0),
            show_contrast_character: Some(0.5),
            contrast: Some(vec![0.0; 7]),
            motion_blur_samples: 1, effect_mode: 0, effect_intensity: 0.0, composited_mode: 0, composited_intensity: 0.0, show_position: 0.0, camera_behavior: 0,
        });

        // SVG text overlay
        let svg = chapter_card_overlay_svg(
            song_title,
            set_label,
            track_number,
            venue,
            date,
            width,
            height,
            text_opacity,
        );
        overlays.push(vec![OverlayLayer {
            svg,
            opacity: text_opacity,
            blend_mode: BlendMode::Screen,
            z_order: 10,
        }]);
    }

    (shaders, frames, overlays)
}
