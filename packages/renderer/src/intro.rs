//! Show intro sequence — cinematic 15-second prelude before every concert.
//!
//! Structure (at 60fps = 900 frames):
//!   0-5s   (0-300):   BLACK → EMERGENCE — amber point blooms, volumetric fog catches light
//!   5-10s  (300-600): THE LOGO — "DEAD AIR" emerges from liquid light, colors deepen
//!   10-14s (600-840): THE SHOW CARD — venue, date fade in, full cinematic treatment
//!   14-15s (840-900): TRANSITION — dissolve into first song's shader
//!
//! The intro shader is self-contained GLSL — the Rust renderer generates
//! FrameData with synthetic uniforms (ramping energy, era grading, palette).
//! Text overlays ("DEAD AIR", venue/date) are composited as SVG layers.

use crate::compositor::{BlendMode, OverlayLayer};
use crate::manifest::FrameData;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::collections::HashMap;

/// Intro timing constants (in seconds).
const INTRO_DURATION: f32 = 15.0;
const LOGO_START: f32 = 5.0;
const LOGO_END: f32 = 10.0;
const CARD_START: f32 = 10.0;
const CARD_END: f32 = 14.0;
const TRANSITION_START: f32 = 14.0;

/// Era-derived color and grading parameters.
#[derive(Debug, Clone)]
pub struct IntroStyle {
    /// Show era: "primal", "classic", "hiatus", "touch_of_grey", "revival"
    pub era: String,
    /// Primary palette hue (0-360, from show's opening track)
    pub palette_primary: f32,
    /// Secondary palette hue (0-360)
    pub palette_secondary: f32,
    /// Era grading
    pub era_saturation: f32,
    pub era_brightness: f32,
    pub era_sepia: f32,
    /// Show seed for deterministic variation (0.0-1.0)
    pub show_seed: f32,
    /// Show film stock
    pub show_warmth: f32,
    pub show_contrast: f32,
    pub show_grain: f32,
    pub show_bloom: f32,
}

impl Default for IntroStyle {
    fn default() -> Self {
        Self {
            era: "classic".into(),
            palette_primary: 30.0,   // warm amber
            palette_secondary: 270.0, // indigo
            era_saturation: 1.0,
            era_brightness: 1.0,
            era_sepia: 0.06,
            show_seed: 0.5,
            show_warmth: 0.0,
            show_contrast: 0.0,
            show_grain: 0.0,
            show_bloom: 0.0,
        }
    }
}

/// Compute intro style from era string.
pub fn style_for_era(era: &str, show_seed: f32) -> IntroStyle {
    match era {
        "primal" => IntroStyle {
            era: era.into(),
            palette_primary: 25.0,     // deep amber
            palette_secondary: 275.0,  // dusty violet — contrasts amber for color depth
            era_saturation: 1.05,      // slightly boosted to fight sepia desaturation
            era_brightness: 0.97,
            era_sepia: 0.06,           // much less sepia — let the actual colors breathe
            show_seed,
            show_warmth: 0.2,          // gentler warmth
            show_contrast: 0.1,
            show_grain: 1.6,           // heavy 16mm/super-8 feel — triggers film stock treatment (gate >0.8)
            show_bloom: 0.1,
        },
        "classic" => IntroStyle {
            era: era.into(),
            palette_primary: 30.0,     // amber
            palette_secondary: 260.0,  // blue-violet
            era_saturation: 1.05,
            era_brightness: 1.0,
            era_sepia: 0.06,
            show_seed,
            show_warmth: 0.1,
            show_contrast: 0.0,
            show_grain: 1.4,           // strong 35mm period feel
            show_bloom: 0.0,
        },
        "hiatus" => IntroStyle {
            era: era.into(),
            palette_primary: 200.0,    // cool blue
            palette_secondary: 280.0,  // purple
            era_saturation: 0.88,
            era_brightness: 0.95,
            era_sepia: 0.0,
            show_seed,
            show_warmth: -0.1,
            show_contrast: 0.1,
            show_grain: 1.2,           // medium film grain — Egypt/Closing of Winterland feel
            show_bloom: -0.05,
        },
        "touch_of_grey" => IntroStyle {
            era: era.into(),
            palette_primary: 40.0,     // warm gold
            palette_secondary: 180.0,  // teal
            era_saturation: 1.10,
            era_brightness: 1.01,
            era_sepia: 0.0,
            show_seed,
            show_warmth: 0.0,
            show_contrast: -0.05,
            show_grain: 1.0,           // light video-era texture — late-80s SVHS
            show_bloom: 0.05,
        },
        "revival" => IntroStyle {
            era: era.into(),
            palette_primary: 20.0,     // warm red-amber
            palette_secondary: 300.0,  // magenta
            era_saturation: 0.98,
            era_brightness: 1.0,
            era_sepia: 0.0,
            show_seed,
            show_warmth: 0.05,
            show_contrast: 0.0,
            show_grain: 0.9,           // subtle film texture — modern but not pristine digital
            show_bloom: 0.0,
        },
        _ => IntroStyle { era: era.into(), show_seed, ..IntroStyle::default() },
    }
}

/// Show metadata for text overlays.
#[derive(Debug, Clone)]
pub struct ShowMeta {
    pub venue: String,
    pub city: String,
    pub date_display: String,
    /// Path to brand logo PNG (e.g., dead-air-brand.png). Composited during logo phase.
    pub brand_image_path: Option<String>,
}

/// The intro GLSL shader source.
/// Liquid light emergence from darkness — raymarched volumetric fog
/// with a central point light that blooms outward.
pub const INTRO_SHADER_ID: &str = "__intro_emergence__";

fn intro_shader_glsl() -> String {
    // The FULL shared uniforms block — must match uniforms.glsl.ts exactly
    // so the UBO layout aligns with what uniforms.rs packs.
    r#"
precision highp float;

// ─── Time ───
uniform float uTime;
uniform float uDynamicTime;
uniform float uBeatTime;
// ─── Core Audio Features ───
uniform float uBass;
uniform float uRms;
uniform float uCentroid;
uniform float uHighs;
uniform float uOnset;
uniform float uBeat;
uniform float uMids;
uniform float uEnergy;
uniform float uFlatness;
// ─── Smoothed / Derived Audio ───
uniform float uSlowEnergy;
uniform float uFastEnergy;
uniform float uFastBass;
uniform float uSpectralFlux;
uniform float uEnergyAccel;
uniform float uEnergyTrend;
uniform float uLocalTempo;
// ─── Beat / Rhythm ───
uniform float uTempo;
uniform float uOnsetSnap;
uniform float uBeatSnap;
uniform float uMusicalTime;
uniform float uSnapToMusicalTime;
// ─── Drum Stem ───
uniform float uDrumOnset;
uniform float uDrumBeat;
uniform float uStemBass;
uniform float uStemDrums;
uniform float uStemDrumOnset;
// ─── Vocal / Other Stem ───
uniform float uVocalEnergy;
uniform float uVocalPresence;
uniform float uStemVocalRms;
uniform float uOtherEnergy;
uniform float uOtherCentroid;
// ─── Chroma / Spectral ───
uniform float uChromaHue;
uniform float uChromaShift;
uniform float uAfterglowHue;
uniform vec4 uContrast0;
uniform vec4 uContrast1;
uniform vec4 uChroma0;
uniform vec4 uChroma1;
uniform vec4 uChroma2;
// ─── Section / Structure ───
uniform float uSectionProgress;
uniform float uSectionIndex;
uniform float uClimaxPhase;
uniform float uClimaxIntensity;
uniform float uCoherence;
uniform float uJamDensity;
uniform float uSongProgress;
uniform float uShaderHoldProgress;
// ─── Jam Evolution ───
uniform float uJamPhase;
uniform float uJamProgress;
// ─── Palette / Color ───
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;
uniform float uEraSaturation;
uniform float uEraBrightness;
uniform float uEraSepia;
// ─── Post-Process Control ───
uniform float uBloomThreshold;
uniform float uLensDistortion;
uniform float uGradingIntensity;
// ─── Melodic / Harmonic ───
uniform float uMelodicPitch;
uniform float uMelodicDirection;
uniform float uChordIndex;
uniform float uHarmonicTension;
uniform float uChordConfidence;
uniform float uSectionType;
uniform float uEnergyForecast;
uniform float uPeakApproaching;
uniform float uBeatStability;
uniform float uDownbeat;
uniform float uBeatConfidence;
uniform float uMelodicConfidence;
uniform float uImprovisationScore;
// ─── Peak-of-Show ───
uniform float uPeakOfShow;
// ─── Hero Icon ───
uniform float uHeroIconTrigger;
uniform float uHeroIconProgress;
// ─── Show Film Stock ───
uniform float uShowWarmth;
uniform float uShowContrast;
uniform float uShowSaturation;
uniform float uShowGrain;
uniform float uShowBloom;
// ─── Venue Profile ───
uniform float uVenueVignette;
// ─── 3D Camera ───
uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uCamFov;
uniform float uCamDof;
uniform float uCamFocusDist;
// ─── Envelope ───
uniform float uEnvelopeBrightness;
uniform float uEnvelopeSaturation;
uniform float uEnvelopeHue;
// ─── Deep Audio ───
uniform float uTempoDerivative;
uniform float uDynamicRange;
uniform float uSpaceScore;
uniform float uTimbralBrightness;
uniform float uTimbralFlux;
uniform float uVocalPitch;
// ─── Effects ───
uniform float uPhilBombWave;
// ─── Semantic Labels (CLAP) ───
uniform float uSemanticPsychedelic;
uniform float uSemanticCosmic;
uniform float uSemanticChaotic;
uniform float uSemanticAggressive;
uniform float uSemanticTender;
uniform float uSemanticAmbient;
uniform float uSemanticRhythmic;
uniform float uSemanticTriumphant;
// ─── Per-Song Shader Parameter Modulation ───
uniform float uParamBassScale;
uniform float uParamEnergyScale;
uniform float uParamMotionSpeed;
uniform float uParamColorSatBias;
uniform float uParamComplexity;
uniform float uParamDrumReactivity;
uniform float uParamVocalWeight;
// ─── Shared Lighting Context ───
uniform vec3 uKeyLightDir;
uniform vec3 uKeyLightColor;
uniform float uKeyLightIntensity;
uniform vec3 uAmbientColor;
uniform float uColorTemperature;
// ─── Temporal Coherence ───
uniform float uTemporalBlendStrength;
// ─── Per-Show Visual Identity ───
uniform float uShowGrainCharacter;
uniform float uShowBloomCharacter;
uniform float uShowTemperatureCharacter;
uniform float uShowContrastCharacter;
// ─── Spatial ───
uniform vec2 uResolution;
uniform vec2 uCamOffset;

// ═══════════════════════════════════════════════════════════════════
// LIQUID LIGHT PROJECTOR — oil on glass, light through colored dye
//
// The look: overhead projector with a glass plate. Hot light below.
// Oil and water with dye sit on the glass. The oil moves, merges,
// splits. Light passes through, casting organic colored caustics
// onto a surface. Dark frame, bright flowing patches.
// ═══════════════════════════════════════════════════════════════════

// ─── Noise primitives ───
float _ih(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float _in(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(_ih(i), _ih(i + vec3(1,0,0)), f.x),
            mix(_ih(i + vec3(0,1,0)), _ih(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(_ih(i + vec3(0,0,1)), _ih(i + vec3(1,0,1)), f.x),
            mix(_ih(i + vec3(0,1,1)), _ih(i + vec3(1,1,1)), f.x), f.y),
        f.z
    );
}

float _ifbm(vec3 p, int oct) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 7; i++) {
        if (i >= oct) break;
        v += a * _in(p);
        p = p * 2.03 + vec3(1.7, 9.2, 3.1);
        a *= 0.49;
    }
    return v;
}

vec3 _ihsv(float h, float s, float v) {
    vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0,4,2), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return v * mix(vec3(1.0), rgb, s);
}

// ─── Domain warp — the soul of liquid light ───
// Double-warp: noise displaces the coordinate, then noise of THAT
// creates organic blob shapes with natural boundaries.
vec2 _iwarp(vec2 p, float t, float strength) {
    float n1 = _ifbm(vec3(p * 1.8, t * 0.12), 5);
    float n2 = _ifbm(vec3(p * 1.8 + 5.2, t * 0.12 + 1.3), 5);
    vec2 w1 = vec2(n1, n2) * strength;

    float n3 = _ifbm(vec3((p + w1) * 2.0, t * 0.08 + 7.1), 4);
    float n4 = _ifbm(vec3((p + w1) * 2.0 + 3.7, t * 0.08 + 4.4), 4);
    return w1 + vec2(n3, n4) * strength * 0.5;
}

// ─── Oil blob field ───
// Returns 0-1: low=between blobs (dim), 1=center of blob (bright light)
// Never returns pure zero — there's always ambient light transmission through oil.
float _iblobs(vec2 p, float t, float scale) {
    vec2 warped = p + _iwarp(p * scale, t, 0.6);
    float field = _ifbm(vec3(warped * 2.5, t * 0.1), 6);
    // Softer blob shapes — keep a floor so dark channels still have some light
    float blobs = smoothstep(0.30, 0.65, field);
    // Floor: even between blobs, 10% light gets through
    return 0.10 + blobs * 0.90;
}

// ─── Caustic shimmer (light interference through oil) ───
float _icaustic(vec2 p, float t) {
    float c = 0.0;
    // Two overlapping wave patterns at different scales
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float scale = 3.0 + fi * 2.5;
        float speed = 0.05 + fi * 0.02;
        vec2 q = p * scale + vec2(t * speed, t * speed * 0.7);
        q += _iwarp(p, t + fi * 2.0, 0.2) * scale * 0.3;
        c += (sin(q.x + sin(q.y * 1.3 + t * 0.1)) * 0.5 + 0.5) * (0.5 / (1.0 + fi));
    }
    return c * 0.5;
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float aspect = uResolution.x / uResolution.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float t = uTime;

    // ─── Phase progression ───
    // No reveal gate — light is at full output from frame 1.
    // Visual development comes from the radial mask and blob emergence.
    float emergence = smoothstep(0.0, 3.5, t);             // blobs grow outward from start
    float colorShift = smoothstep(3.5, 9.0, t);         // amber → psychedelic
    float fullBloom = smoothstep(8.0, 11.0, t);         // peak richness
    float fadeOut = 1.0 - smoothstep(13.5, 15.0, t);    // dissolve to black

    float dist = length(p);

    // ─── Radial mask — concentrates light toward center ───
    // Starts with visible warmth, expands into full frame.
    float maskRadius = 0.15 + emergence * 0.65 + fullBloom * 0.4;
    float radialMask = exp(-dist * dist / (maskRadius * maskRadius));
    // Soften the edge with noise so it's not a perfect circle
    float edgeNoise = _ifbm(vec3(p * 3.0, t * 0.1), 4) * 0.3;
    radialMask = smoothstep(0.0, 0.5 + edgeNoise, radialMask);

    // ─── Oil blob layer 1 (large, slow shapes) ───
    float blobs1 = _iblobs(p, t, 1.0);

    // ─── Oil blob layer 2 (smaller, faster, fills gaps) ───
    float blobs2 = _iblobs(p + vec2(3.7, 1.2), t * 1.3, 1.6) * 0.6;

    // ─── Combine blob layers ───
    float liquidLight = max(blobs1, blobs2);
    // Apply radial mask — light only where the projector illuminates
    liquidLight *= radialMask;

    // ─── Caustic shimmer on top ───
    float caustic = _icaustic(p, t) * emergence * 0.3;
    liquidLight += caustic * radialMask * 0.5;

    // ─── Bright core (the bulb) — always the brightest point ───
    float coreSize = 0.04 + emergence * 0.03;
    float coreGlow = exp(-dist * dist / coreSize);
    coreGlow *= (1.0 - emergence * 0.3); // softens as oil fills frame
    liquidLight += coreGlow * 0.8;

    // ─── Breathing pulse ───
    float breath = 1.0 + sin(t * 0.7) * 0.06 + uBass * 0.1 * colorShift;
    liquidLight *= breath;

    // ─── Fog haze (catches scattered light in dark areas) ───
    float haze = _ifbm(vec3(p * 1.5 + vec2(t * 0.02, t * 0.015), t * 0.06), 4);
    haze = haze * 0.12 * emergence * radialMask;

    // ─── Color palette — PSYCHEDELIC liquid light ───
    // Real liquid light shows have 4-6 dye colors flowing through oil.
    // Each blob region maps to a different hue. High saturation throughout.
    vec3 amber    = _ihsv(0.07, 0.95, 1.0);
    vec3 hotRed   = _ihsv(0.00, 0.90, 0.95);
    vec3 magenta  = _ihsv(0.88, 0.85, 0.95);
    vec3 violet   = _ihsv(0.75, 0.80, 0.90);
    vec3 electric = _ihsv(0.55, 0.85, 0.85);   // electric blue-green
    vec3 gold     = _ihsv(0.12, 0.90, 1.0);

    // Era-derived accent colors
    float hue1 = uPalettePrimary / 360.0;
    float hue2 = uPaletteSecondary / 360.0;
    vec3 eraCol1 = _ihsv(hue1, 0.90, 0.95);
    vec3 eraCol2 = _ihsv(hue2, 0.85, 0.90);

    // ─── Color mapping — spatial noise assigns hues to regions ───
    float ci1 = _ifbm(vec3(p * 1.5, t * 0.04 + 20.0), 4);
    float ci2 = _ifbm(vec3(p * 2.0 + 7.0, t * 0.03 + 50.0), 4);
    float ci3 = _ifbm(vec3(p * 1.2 - 3.0, t * 0.05 + 80.0), 3);

    // Phase 1: warm amber/gold (first 5 seconds)
    vec3 warmBase = mix(amber, gold, ci1);

    // Phase 2: psychedelic rainbow bleeds in
    // Map noise field to a full spectrum of colors
    // ci1 controls warm→cool, ci2 controls red→violet, ci3 controls accents
    vec3 psyche1 = mix(hotRed, magenta, smoothstep(0.3, 0.7, ci1));
    vec3 psyche2 = mix(violet, electric, smoothstep(0.3, 0.7, ci2));
    vec3 psyche3 = mix(eraCol1, eraCol2, ci3);

    // Blend zones: each region of the blob field gets a dominant color
    vec3 psycheColor = psyche1;
    psycheColor = mix(psycheColor, psyche2, smoothstep(0.4, 0.6, ci2));
    psycheColor = mix(psycheColor, psyche3, smoothstep(0.5, 0.7, ci3) * 0.5);
    // Gold/amber highlights at blob edges
    psycheColor = mix(psycheColor, gold, smoothstep(0.55, 0.65, ci1) * 0.4);

    // Evolve: amber base → full psychedelic spectrum
    vec3 blobColor = mix(warmBase, psycheColor, colorShift);

    // Push saturation hard — this should GLOW
    float grey = dot(blobColor, vec3(0.299, 0.587, 0.114));
    blobColor = mix(vec3(grey), blobColor, 1.3 + fullBloom * 0.3);
    // Brightness boost so colors pop against the dark
    blobColor *= 1.4;

    // Fog/haze picks up complementary colors for depth
    vec3 hazeColor = mix(amber * 0.5, mix(violet, electric, 0.5), colorShift * 0.7);

    // ─── Base ambient glow — the projector bulb warming up ───
    // Centered warm light that's ALWAYS present. The blobs emerge on top.
    // This ensures no dark hole in the center ever.
    float ambientSpread = 0.25 + emergence * 0.5;
    float ambientGlow = exp(-dist * dist / ambientSpread);
    vec3 ambientColor = mix(amber, mix(gold, eraCol1, 0.3), colorShift * 0.4);
    // Ambient dims as blobs take over — but never fully, keeps the center lit
    float ambientMix = 0.5 + 0.5 * (1.0 - emergence * 0.7);

    // ─── Compose ───
    // Layer 1: ambient base warmth (always visible, centered)
    vec3 col = ambientColor * ambientGlow * ambientMix;
    // Layer 2: liquid light blobs add on top (never subtract)
    col += blobColor * liquidLight * 0.8;
    col += hazeColor * haze;            // Atmospheric haze
    // Edge glow: faint warm light at blob boundaries
    float edgeGlow = smoothstep(0.3, 0.5, liquidLight) - smoothstep(0.5, 0.8, liquidLight);
    col += amber * edgeGlow * 0.15 * emergence;

    // ─── Vignette ───
    float vig = 1.0 - dot(p * 0.8, p * 0.8);
    vig = smoothstep(0.0, 0.7, vig);
    col *= vig;

    // ─── Film grain ───
    float grain = (_ih(vec3(gl_FragCoord.xy, t * 137.0)) - 0.5) * 0.02 * emergence;
    col += grain;

    // ─── Contrast boost — keep dark channels dark ───
    col = pow(col, vec3(1.1));

    // ─── Era toning — very subtle, don't kill the color ───
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 sepiaCol = vec3(luma * 1.05, luma * 0.98, luma * 0.88);
    col = mix(col, sepiaCol, uEraSepia * 0.15);

    // ─── Warmth shift — minimal ───
    col.r += uShowWarmth * 0.02 * luma;
    col.b -= uShowWarmth * 0.01 * luma;

    // ─── Fade out at end ───
    col *= fadeOut;

    // ─── sRGB gamma — the postprocess pipeline doesn't apply gamma, ───
    // so linear shader output looks too dark without this.
    col = pow(max(col, vec3(0.0)), vec3(0.45));

    gl_FragColor = vec4(col, 1.0);
}
"#.to_string()
}

/// Generate the intro manifest segment: frames, shader, and overlay layers.
///
/// Returns (shader_id → GLSL source, frames, overlay_layers).
/// The caller prepends these to the show manifest.
pub fn generate_intro(
    fps: u32,
    width: u32,
    height: u32,
    style: &IntroStyle,
    show: &ShowMeta,
    first_song_shader_id: Option<&str>,
) -> (HashMap<String, String>, Vec<FrameData>, Vec<Vec<OverlayLayer>>) {
    let total_frames = (INTRO_DURATION * fps as f32) as usize;

    let mut shaders = HashMap::new();
    shaders.insert(INTRO_SHADER_ID.to_string(), intro_shader_glsl());

    let mut frames = Vec::with_capacity(total_frames);
    let mut overlays = Vec::with_capacity(total_frames);

    // Load brand image if provided
    let brand_b64 = show.brand_image_path.as_ref().and_then(|path| {
        let data = std::fs::read(path).ok()?;
        Some(BASE64.encode(&data))
    });

    // Seed-derived variation (subtle timing offsets)
    let seed = style.show_seed;
    let emergence_speed = 1.0 + (seed - 0.5) * 0.3; // ±15% speed variation

    for i in 0..total_frames {
        let t = i as f32 / fps as f32;
        let t_adjusted = t * emergence_speed.max(0.85).min(1.15); // clamp variation

        // ─── Synthetic audio ramp ───
        // Energy ramp for breathing / bloom reactivity — starts immediately
        let ramp = (t / INTRO_DURATION).min(1.0);
        let energy = ramp * 0.3;

        // Gentle bass pulse (simulates a low hum building)
        let bass_phase = t * 0.7 + seed * 6.28;
        let bass = (bass_phase.sin() * 0.5 + 0.5) * 0.15 * (t / 6.0).min(1.0);

        // ─── Transition to first song in last second ───
        let (secondary_id, blend_progress, blend_mode) = if t >= TRANSITION_START {
            if let Some(first_id) = first_song_shader_id {
                let prog = ((t - TRANSITION_START) / (INTRO_DURATION - TRANSITION_START)).min(1.0);
                (
                    Some(first_id.to_string()),
                    Some(prog),
                    Some("noise_dissolve".to_string()),
                )
            } else {
                (None, None, None)
            }
        } else {
            (None, None, None)
        };

        let frame = FrameData {
            shader_id: INTRO_SHADER_ID.to_string(),
            frame: i as u32,
            secondary_shader_id: secondary_id,
            blend_progress,
            blend_mode,

            // Time
            time: t_adjusted,
            dynamic_time: t_adjusted,
            beat_time: t * 0.7, // slow beat

            // Core audio — very subtle
            energy,
            rms: energy * 0.8,
            bass,
            mids: energy * 0.3,
            highs: energy * 0.1,
            onset: 0.0,
            centroid: 0.3,
            beat: 0.0,

            // Smoothed
            slow_energy: energy,
            fast_energy: energy,
            fast_bass: bass,
            spectral_flux: 0.0,
            energy_accel: 0.0,
            energy_trend: if t < 5.0 { 0.3 } else { 0.0 },
            tempo: 60.0,
            onset_snap: 0.0,
            beat_snap: 0.0,
            musical_time: t * 0.5,
            beat_confidence: 0.0,
            beat_stability: 0.5,
            downbeat: 0.0,

            // Stems — silent
            drum_onset: 0.0,
            drum_beat: 0.0,
            stem_bass: bass * 0.5,
            stem_drums: 0.0,
            vocal_energy: 0.0,
            vocal_presence: 0.0,
            other_energy: 0.0,
            other_centroid: 0.0,

            // Harmonic
            chroma_hue: style.palette_primary,
            chroma_shift: 0.0,
            chord_index: 0.0,
            harmonic_tension: 0.0,
            melodic_pitch: 0.0,
            melodic_direction: 0.0,
            melodic_confidence: 0.0,
            chord_confidence: 0.0,

            // Section — intro type
            section_type: 4.0, // intro
            section_index: 0.0,
            section_progress: t / INTRO_DURATION,
            climax_phase: 0.0,
            climax_intensity: 0.0,
            coherence: 1.0,
            jam_density: 0.0,
            jam_phase: 0.0,
            jam_progress: 0.0,

            // Forecast
            energy_forecast: energy,
            peak_approaching: 0.0,

            // Deep audio
            tempo_derivative: 0.0,
            dynamic_range: 0.8,
            space_score: 0.0,
            timbral_brightness: 0.3,
            timbral_flux: 0.0,
            vocal_pitch: 0.0,
            vocal_pitch_confidence: 0.0,
            improvisation_score: 0.0,

            // CLAP semantic — ambient / cosmic
            semantic_psychedelic: 0.0,
            semantic_cosmic: 0.3,
            semantic_aggressive: 0.0,
            semantic_tender: 0.2,
            semantic_rhythmic: 0.0,
            semantic_ambient: 0.8,
            semantic_chaotic: 0.0,
            semantic_triumphant: 0.0,

            // Palette — era-derived
            palette_primary: style.palette_primary,
            palette_secondary: style.palette_secondary,
            palette_saturation: style.era_saturation,

            // Envelope — gentle
            envelope_brightness: 0.9 + energy * 0.1,
            envelope_saturation: 0.85 + energy * 0.15,
            envelope_hue: 0.0,

            // Era grading
            era_saturation: style.era_saturation,
            era_brightness: style.era_brightness,
            era_sepia: style.era_sepia,

            // Show-level
            show_warmth: style.show_warmth,
            show_contrast: style.show_contrast,
            show_saturation: style.era_saturation,
            show_grain: style.show_grain,
            show_bloom: style.show_bloom,

            // Shader params — tuned for intro
            param_bass_scale: 1.0,
            param_energy_scale: 1.0,
            param_motion_speed: 0.8,
            param_color_sat_bias: 0.0,
            param_complexity: 0.6,
            param_drum_reactivity: 0.0,
            param_vocal_weight: 0.0,

            // Misc
            peak_of_show: 0.0,
            song_progress: Some(t / INTRO_DURATION),
            shader_hold_progress: Some(t / INTRO_DURATION),
            show_grain_character: Some(style.show_grain),
            show_bloom_character: Some(style.show_bloom),
            show_temperature_character: Some(style.show_warmth),
            show_contrast_character: Some(style.show_contrast),
            contrast: None,
            motion_blur_samples: 1, effect_mode: 0, effect_intensity: 0.0, composited_mode: 0, composited_intensity: 0.0, show_position: 0.0, camera_behavior: 0,
        };

        frames.push(frame);

        // ─── Text overlay layers ───
        let mut frame_overlays = Vec::new();

        // "DEAD AIR" logo: visible 5.5s-10s with fade in/out
        let logo_opacity = if t < LOGO_START + 0.5 {
            0.0
        } else if t < LOGO_START + 2.5 {
            // 2s fade in (5.5s → 7.5s)
            ((t - LOGO_START - 0.5) / 2.0).min(1.0)
        } else if t < LOGO_END - 2.0 {
            1.0
        } else if t < LOGO_END {
            // 2s fade up/drift (8s → 10s)
            1.0 - ((t - LOGO_END + 2.0) / 2.0).min(1.0)
        } else {
            0.0
        };

        if logo_opacity > 0.01 {
            if let Some(ref b64) = brand_b64 {
                // Brand PNG composited as embedded SVG image
                frame_overlays.push(OverlayLayer {
                    svg: brand_image_svg(b64, width, height, logo_opacity),
                    opacity: 1.0,
                    blend_mode: BlendMode::Normal,
                    z_order: 10,
                });
            } else {
                // Fallback: generated text logo
                frame_overlays.push(OverlayLayer {
                    svg: dead_air_logo_svg(width, height, logo_opacity),
                    opacity: 1.0,
                    blend_mode: BlendMode::Normal,
                    z_order: 10,
                });
            }
        }

        // Show card (venue/date): visible 10.5s-14.5s with fade in/out
        let card_opacity = if t < CARD_START + 0.5 {
            0.0
        } else if t < CARD_START + 2.5 {
            // 2s fade in (10.5s → 12.5s)
            ((t - CARD_START - 0.5) / 2.0).min(1.0)
        } else if t < CARD_END - 0.5 {
            1.0
        } else if t < CARD_END + 0.5 {
            // 1s fade out (13.5s → 14.5s)
            1.0 - ((t - CARD_END + 0.5) / 1.0).min(1.0)
        } else {
            0.0
        };

        if card_opacity > 0.01 {
            frame_overlays.push(OverlayLayer {
                svg: show_card_svg(&show.venue, &show.city, &show.date_display, width, height, card_opacity),
                opacity: 1.0,
                blend_mode: BlendMode::Normal,
                z_order: 11,
            });
        }

        overlays.push(frame_overlays);
    }

    (shaders, frames, overlays)
}

// ─── SVG Text Generators ───

/// "DEAD AIR" logo — hand-crafted SVG path letterforms.
/// Organic, flowing letters with slight imperfections and weight variation.
/// Evokes the Dead's poster art tradition (Kelley/Mouse, Rick Griffin)
/// without using any system font. Each letter is a unique path.
fn dead_air_logo_svg(width: u32, height: u32, opacity: f32) -> String {
    let op = format!("{:.3}", opacity.clamp(0.0, 1.0));
    let cx = width / 2;
    let cy = (height as f32 * 0.45) as u32;

    // Scale the logo paths to fit the render resolution
    // Base paths designed at 800px wide — scale to ~40% of frame width
    let logo_width = (width as f32 * 0.42) as u32;
    let logo_height = (logo_width as f32 * 0.18) as u32;
    let logo_x = cx - logo_width / 2;
    let logo_y = cy - logo_height / 2;
    let scale = logo_width as f32 / 800.0;

    let presents_size = (width as f32 * 0.018).max(14.0) as u32;
    let presents_y = logo_y + logo_height + (width as f32 * 0.025) as u32;
    let shadow_blur = (scale * 6.0).max(3.0) as u32;
    // Hand-crafted "DEAD AIR" letterforms as SVG paths.
    // Each letter has organic curves, slight weight variation, and
    // imperfect baselines — like they were hand-lettered on a poster.
    // Designed at 800x140 base, scaled to render resolution.
    //
    // D-E-A-D  A-I-R with generous spacing between words.
    // Style: Art Nouveau meets psychedelic — flowing serifs, tapered strokes.
    let logo_paths = r#"
      <!-- D -->
      <path d="M0,5 L0,130 Q0,138 8,138 L45,138 Q95,135 110,100 Q120,70 110,40 Q95,5 45,2 L8,2 Q0,2 0,5 Z M22,22 L42,22 Q78,24 88,50 Q95,70 88,92 Q78,118 42,118 L22,118 Z"/>
      <!-- E -->
      <path d="M135,2 L135,138 L230,138 L230,118 Q228,115 225,115 L157,115 L157,78 L210,78 Q213,78 213,75 L213,62 Q213,59 210,59 L157,59 L157,22 L225,22 Q228,22 230,19 L230,2 Z"/>
      <!-- A -->
      <path d="M255,138 L290,2 Q292,-1 296,2 L335,138 L312,138 L303,105 L275,105 L266,138 Z M280,85 L298,85 L289,42 Z"/>
      <!-- D -->
      <path d="M360,5 L360,130 Q360,138 368,138 L405,138 Q455,135 470,100 Q480,70 470,40 Q455,5 405,2 L368,2 Q360,2 360,5 Z M382,22 L402,22 Q438,24 448,50 Q455,70 448,92 Q438,118 402,118 L382,118 Z"/>

      <!-- gap between words -->

      <!-- A -->
      <path d="M530,138 L565,2 Q567,-1 571,2 L610,138 L587,138 L578,105 L550,105 L541,138 Z M555,85 L573,85 L564,42 Z"/>
      <!-- I -->
      <path d="M635,2 L635,138 L657,138 L657,2 Z"/>
      <!-- R -->
      <path d="M685,2 L685,138 L707,138 L707,82 L730,82 L755,138 L780,138 L752,78 Q775,70 778,48 Q780,22 755,10 Q745,5 730,2 Z M707,22 L728,22 Q748,24 752,42 Q755,58 740,64 L707,64 Z"/>
    "#;

    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="{blur}" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="{sd}" stdDeviation="{shb}" flood-color="rgba(0,0,0,0.6)"/>
    </filter>
  </defs>
  <g opacity="{op}">
    <!-- Warm amber glow halo -->
    <g transform="translate({lx},{ly}) scale({sc})" filter="url(#glow)">
      <g fill="rgba(255,150,60,0.30)" stroke="none">
        {paths}
      </g>
    </g>
    <!-- Main letterforms — warm cream with shadow -->
    <g transform="translate({lx},{ly}) scale({sc})" filter="url(#shadow)">
      <g fill="rgba(255,242,220,0.92)" stroke="rgba(200,150,80,0.15)" stroke-width="0.5">
        {paths}
      </g>
    </g>
    <!-- "presents" beneath -->
    <text x="{cx}" y="{py}" font-family="Georgia, serif" font-style="italic" font-size="{ps}" font-weight="300"
      fill="rgba(255,230,200,0.35)" text-anchor="middle" letter-spacing="6">presents</text>
  </g>
</svg>"#,
        w = width,
        h = height,
        op = op,
        lx = logo_x,
        ly = logo_y,
        sc = format!("{:.4}", scale),
        paths = logo_paths,
        blur = (scale * 15.0).max(5.0) as u32,
        shb = shadow_blur,
        sd = (scale * 2.0).max(1.0) as u32,
        cx = cx,
        py = presents_y,
        ps = presents_size,
    )
}

/// Show card — venue, city, date in clean vintage serif.
fn show_card_svg(
    venue: &str,
    city: &str,
    date: &str,
    width: u32,
    height: u32,
    opacity: f32,
) -> String {
    let op = format!("{:.3}", opacity.clamp(0.0, 1.0));
    let cx = width / 2;
    // Centered vertically, slightly below middle
    let base_y = (height as f32 * 0.50) as u32;
    let venue_size = (width as f32 * 0.028).max(18.0) as u32;
    let city_size = (width as f32 * 0.018).max(12.0) as u32;
    let date_size = (width as f32 * 0.016).max(11.0) as u32;
    let line_gap = (venue_size as f32 * 0.8) as u32;

    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">
  <defs>
    <filter id="textglow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <g opacity="{op}">
    <text x="{cx}" y="{y1}" font-family="Georgia, 'Palatino Linotype', serif" font-style="italic" font-size="{vs}" font-weight="600"
      fill="rgba(255,245,230,0.90)" text-anchor="middle" letter-spacing="{vls}"
      filter="url(#textglow)">{venue}</text>
    <text x="{cx}" y="{y2}" font-family="Georgia, 'Palatino Linotype', serif" font-style="italic" font-size="{cs}" font-weight="300"
      fill="rgba(255,240,220,0.70)" text-anchor="middle"
      letter-spacing="2">{city}</text>
    <text x="{cx}" y="{y3}" font-family="Georgia, 'Palatino Linotype', serif" font-style="italic" font-size="{ds}" font-weight="300"
      fill="rgba(255,235,210,0.60)" text-anchor="middle"
      letter-spacing="3">{date}</text>
  </g>
</svg>"#,
        w = width,
        h = height,
        op = op,
        cx = cx,
        y1 = base_y,
        y2 = base_y + line_gap,
        y3 = base_y + line_gap * 2,
        vs = venue_size,
        cs = city_size,
        ds = date_size,
        vls = (venue_size as f32 * 0.15) as u32,
        venue = xml_escape(venue),
        city = xml_escape(city),
        date = xml_escape(date),
    )
}

/// Brand logo as embedded PNG image — centered, scaled to ~60% of frame width.
fn brand_image_svg(b64_data: &str, width: u32, height: u32, opacity: f32) -> String {
    let op = format!("{:.3}", opacity.clamp(0.0, 1.0));
    // Scale to 60% of frame width, centered
    let img_w = (width as f32 * 0.60) as u32;
    let img_h = img_w; // square image
    let x = (width - img_w) / 2;
    let y = (height - img_h) / 2;

    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}">
  <g opacity="{op}">
    <image x="{x}" y="{y}" width="{iw}" height="{ih}"
      href="data:image/png;base64,{data}"
      preserveAspectRatio="xMidYMid meet"/>
  </g>
</svg>"#,
        w = width,
        h = height,
        op = op,
        x = x,
        y = y,
        iw = img_w,
        ih = img_h,
        data = b64_data,
    )
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
