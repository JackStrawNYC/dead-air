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

/// Per-song line in the end-card setlist. Set + duration data lets the
/// outro group songs by set with running times — the difference between
/// "Netflix doc credits" and "tape-trader's setlist sheet."
pub struct EndcardSongEntry {
    pub title: String,
    pub set: u32,         // 1, 2, or 3 (encore)
    pub duration_sec: u32, // 0 if unknown — just title shown
}

/// Show metadata for the end card.
pub struct EndcardMeta {
    pub venue: String,
    pub date_display: String,
    /// Legacy plain title list — used as fallback when entries is empty.
    pub songs: Vec<String>,
    /// Rich entries grouped by set, with per-song durations. Preferred over
    /// `songs` when populated.
    pub entries: Vec<EndcardSongEntry>,
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

    // Setlist rendering: prefer rich entries (set headers + durations) when
    // provided; fall back to plain title list for back-compat. Two-column
    // layout for shows with many songs (Veneta has 23) so all fit on screen.
    let mut songs_text = String::new();
    let song_start_y = (height as f32 * 0.50) as u32;
    let line_h = (height as f32 * 0.025).max(14.0) as u32;
    let header_h = (height as f32 * 0.034).max(20.0) as u32;
    let header_size = (width as f32 * 0.013).max(12.0) as u32;
    let bottom_limit = height - 50;

    if !meta.entries.is_empty() {
        // Determine column layout: songs per col so it fits vertically.
        let total_lines: u32 = {
            let mut last_set = 0u32;
            let mut n = 0u32;
            for e in &meta.entries {
                if e.set != last_set { n += 1; last_set = e.set; } // header line
                n += 1; // song line
            }
            n
        };
        let avail_h = bottom_limit.saturating_sub(song_start_y);
        let max_per_col = (avail_h / line_h).max(1);
        let two_col = total_lines > max_per_col;
        let col_count = if two_col { 2 } else { 1 };
        let col_x_offset = if two_col { (width as f32 * 0.18) as u32 } else { 0 };
        let col_max_lines = (total_lines + col_count - 1) / col_count;

        let mut last_set = 0u32;
        let mut line_idx_in_col = 0u32;
        let mut col = 0u32;
        for entry in &meta.entries {
            if entry.set != last_set {
                last_set = entry.set;
                if line_idx_in_col >= col_max_lines && col + 1 < col_count {
                    col += 1;
                    line_idx_in_col = 0;
                }
                let y = song_start_y + line_idx_in_col * line_h + (header_h - line_h);
                let label = match entry.set {
                    1 => "SET ONE",
                    2 => "SET TWO",
                    3 => "ENCORE",
                    _ => "",
                };
                let x = if col == 0 { cx - col_x_offset } else { cx + col_x_offset };
                if y < bottom_limit {
                    songs_text.push_str(&format!(
                        "<text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"500\" \
                         fill=\"rgba(255,230,200,0.85)\" text-anchor=\"middle\" \
                         letter-spacing=\"4\" \
                         font-family=\"Helvetica Neue, Arial, sans-serif\">{}</text>",
                        x, y, header_size, label,
                    ));
                }
                line_idx_in_col += 1;
            }
            if line_idx_in_col >= col_max_lines && col + 1 < col_count {
                col += 1;
                line_idx_in_col = 0;
            }
            let y = song_start_y + line_idx_in_col * line_h;
            let x = if col == 0 { cx - col_x_offset } else { cx + col_x_offset };
            if y < bottom_limit {
                let dur = if entry.duration_sec > 0 {
                    let m = entry.duration_sec / 60;
                    let s = entry.duration_sec % 60;
                    format!("  {}:{:02}", m, s)
                } else { String::new() };
                songs_text.push_str(&format!(
                    "<text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"400\" \
                     fill=\"rgba(255,255,255,0.65)\" text-anchor=\"middle\" \
                     font-family=\"Georgia, 'Palatino Linotype', serif\" font-style=\"italic\">{}{}</text>",
                    x, y, song_size, xml_escape(&entry.title), xml_escape(&dur),
                ));
            }
            line_idx_in_col += 1;
        }
    } else {
        // Legacy fallback — single-column plain list (no sets, no durations)
        for (i, title) in meta.songs.iter().enumerate() {
            let y = song_start_y + (i as u32) * line_h;
            if y > bottom_limit { break; }
            songs_text.push_str(&format!(
                "<text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"400\" \
                 fill=\"rgba(255,255,255,0.6)\" text-anchor=\"middle\" \
                 font-family=\"Helvetica Neue, Arial, sans-serif\">{}</text>",
                cx, y, song_size, xml_escape(title),
            ));
        }
    }

    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\">\
         <g opacity=\"{}\">\
         <g transform=\"translate({},{}) scale({})\" filter=\"drop-shadow(0 2px 12px rgba(200,120,40,0.5))\">\
          <g fill=\"rgba(255,242,220,0.85)\" stroke=\"none\">\
           <path d=\"M0,5 L0,130 Q0,138 8,138 L45,138 Q95,135 110,100 Q120,70 110,40 Q95,5 45,2 L8,2 Q0,2 0,5 Z M22,22 L42,22 Q78,24 88,50 Q95,70 88,92 Q78,118 42,118 L22,118 Z\"/>\
           <path d=\"M135,2 L135,138 L230,138 L230,118 Q228,115 225,115 L157,115 L157,78 L210,78 Q213,78 213,75 L213,62 Q213,59 210,59 L157,59 L157,22 L225,22 Q228,22 230,19 L230,2 Z\"/>\
           <path d=\"M255,138 L290,2 Q292,-1 296,2 L335,138 L312,138 L303,105 L275,105 L266,138 Z M280,85 L298,85 L289,42 Z\"/>\
           <path d=\"M360,5 L360,130 Q360,138 368,138 L405,138 Q455,135 470,100 Q480,70 470,40 Q455,5 405,2 L368,2 Q360,2 360,5 Z M382,22 L402,22 Q438,24 448,50 Q455,70 448,92 Q438,118 402,118 L382,118 Z\"/>\
           <path d=\"M530,138 L565,2 Q567,-1 571,2 L610,138 L587,138 L578,105 L550,105 L541,138 Z M555,85 L573,85 L564,42 Z\"/>\
           <path d=\"M635,2 L635,138 L657,138 L657,2 Z\"/>\
           <path d=\"M685,2 L685,138 L707,138 L707,82 L730,82 L755,138 L780,138 L752,78 Q775,70 778,48 Q780,22 755,10 Q745,5 730,2 Z M707,22 L728,22 Q748,24 752,42 Q755,58 740,64 L707,64 Z\"/>\
          </g>\
         </g>\
         <text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"300\" \
          fill=\"rgba(255,230,200,0.6)\" text-anchor=\"middle\" letter-spacing=\"3\" \
          font-family=\"Georgia, 'Palatino Linotype', serif\" font-style=\"italic\">{} — {}</text>\
         {}\
         </g></svg>",
        width, height, op,
        // SVG logo: center horizontally, position at cy_brand
        cx - (brand_size as f32 * 2.8) as u32, // logo left edge (paths are 800 wide, scale ~0.7)
        cy_brand - (brand_size as f32 * 0.5) as u32, // logo top
        format!("{:.3}", brand_size as f32 / 140.0), // scale (paths are 140 tall)
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
            show_progress: Some(1.0),  // endcard plays after show ends
            era_black_lift: None,
            era_contrast_scale: None,
            contrast: Some(vec![0.0; 7]),
            motion_blur_samples: 1, effect_mode: 0, effect_intensity: 0.0, composited_mode: 0, composited_intensity: 0.0, show_position: 0.0, camera_behavior: 0,
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
