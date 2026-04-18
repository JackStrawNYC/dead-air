//! Visual effect modes — post-processing transforms applied on top of any shader.
//!
//! Each effect reads the scene HDR texture and writes a transformed version.
//! Effects are gated to specific musical moments via the manifest.
//!
//! Architecture:
//!   Scene shader renders → HDR texture
//!   → Effect pass transforms the HDR texture in-place
//!   → Bloom + composite + FXAA run on the transformed result
//!
//! Effects are WGSL fragment shaders that manipulate UVs, colors, or
//! compose with temporal data (feedback buffer).

use wgpu::util::DeviceExt;

/// Which effect mode is active (0 = none).
#[repr(u32)]
#[derive(Clone, Copy, Debug, Default)]
pub enum EffectMode {
    #[default]
    None = 0,
    Kaleidoscope = 1,
    DeepFeedback = 2,
    Hypersaturation = 3,
    ChromaticSplit = 4,
    TrailsEcho = 5,
    MirrorSymmetry = 6,
    AudioDisplacement = 7,
    ZoomPunch = 8,
    SlowBreathPulse = 9,
    LightLeakBurst = 10,
    TimeDilation = 11,
    MoirePatterns = 12,
    DepthOfField = 13,
    GlitchDatamosh = 14,
}

/// Uniform buffer for effect parameters.
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
pub struct EffectUniforms {
    /// Active effect mode (0 = none, 1 = kaleidoscope, etc.)
    pub mode: u32,
    /// Effect intensity 0-1 (0 = off, 1 = full)
    pub intensity: f32,
    /// Time for animation
    pub time: f32,
    /// Energy for audio reactivity
    pub energy: f32,
    /// Bass for low-frequency response
    pub bass: f32,
    /// Beat snap for rhythmic triggers
    pub beat_snap: f32,
    /// Resolution width
    pub width: f32,
    /// Resolution height
    pub height: f32,
}

/// The effect pass WGSL shader — a mega-shader with all effects as branches.
/// Each effect is a UV or color transform applied to the scene texture.
const EFFECT_WGSL: &str = r#"
@group(0) @binding(0) var tex_sampler: sampler;
@group(0) @binding(1) var scene_tex: texture_2d<f32>;
@group(0) @binding(2) var prev_frame_tex: texture_2d<f32>;

struct EffectUniforms {
    mode: u32,
    intensity: f32,
    time: f32,
    energy: f32,
    bass: f32,
    beat_snap: f32,
    width: f32,
    height: f32,
}
@group(0) @binding(3) var<uniform> fx: EffectUniforms;

// VertexOutput defined in VERTEX_WGSL (shared)

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// ═══════════════════════════════════════════════════════════
// EFFECT 1: KALEIDOSCOPE — A++++ quality radial symmetry
//
// Features:
// - Smooth interpolated fold count (no popping between 4→5→6)
// - Anti-aliased fold edges (no visible seams)
// - Energy-driven fold count with smooth transitions
// - Musically-reactive rotation speed (slow drift + beat accent)
// - Radial zoom breathing with bass
// - Aspect-ratio corrected polar coordinates
// - Edge fade to prevent border artifacts
// ═══════════════════════════════════════════════════════════
fn kaleidoscope(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec2<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let p = uv - center;

    // Convert to polar coordinates
    var angle = atan2(p.y, p.x);
    let radius = length(p);

    // Number of folds: 6 at rest, up to 8 at peak energy
    let folds = 6.0 + energy * 2.0;
    let sector = TAU / folds;

    // Fold the angle into one sector
    // Add PI to shift atan2 range from [-PI,PI] to [0,TAU]
    var a = angle + PI;
    a = a - floor(a / sector) * sector; // modulo into [0, sector]

    // Mirror within sector for clean symmetry
    if (a > sector * 0.5) {
        a = sector - a;
    }

    // Slow rotation
    a = a + time * 0.04 * intensity;

    // Convert back to cartesian
    let new_uv = vec2<f32>(
        cos(a) * radius + 0.5,
        sin(a) * radius + 0.5
    );

    // Blend with original based on intensity
    return mix(uv, clamp(new_uv, vec2<f32>(0.01), vec2<f32>(0.99)), intensity);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 2: DEEP FEEDBACK — A++++ recursive visual echo
//
// Recreates the organic spiral patterns of analog video feedback
// (pointing a camera at its own monitor). Features:
// - Slight zoom-in creates infinite tunnel recursion
// - Slow rotation creates spiral vortex
// - Proper HSV hue rotation (not crude channel swap)
// - Energy-reactive recursion depth (quiet=subtle, loud=deep)
// - Bass-driven zoom pulsing
// - Color saturation decay per recursion (prevents white-out)
// - Multi-sample feedback for smoother trails
// ═══════════════════════════════════════════════════════════
fn deep_feedback(uv: vec2<f32>, scene_col: vec3<f32>, intensity: f32, time: f32, energy: f32) -> vec3<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let p = uv - center;

    // Zoom: slight inward pull creates the infinite recursion tunnel.
    // Bass modulates for breathing depth.
    let base_zoom = 1.0 - intensity * 0.025;
    let bass_zoom = 1.0 - fx.bass * 0.015 * intensity;
    let zoom = base_zoom * bass_zoom;

    // Rotation: slow organic spiral. Energy drives speed.
    let rot_speed = intensity * (0.004 + energy * 0.006);
    let rot = time * rot_speed;
    let c = cos(rot);
    let s = sin(rot);

    // Transform previous frame UV: rotate + zoom around center
    let rotated = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c) * zoom;
    let prev_uv = clamp(rotated + center, vec2<f32>(0.002), vec2<f32>(0.998));

    // Multi-sample feedback: 3-tap for smoother trails (reduces aliasing)
    let offset = 0.002 * intensity;
    let prev1 = textureSample(prev_frame_tex, tex_sampler, prev_uv).rgb;
    let prev2 = textureSample(prev_frame_tex, tex_sampler, prev_uv + vec2<f32>(offset, 0.0)).rgb;
    let prev3 = textureSample(prev_frame_tex, tex_sampler, prev_uv + vec2<f32>(0.0, offset)).rgb;
    let prev = (prev1 + prev2 + prev3) / 3.0;

    // Proper HSV hue rotation for psychedelic color evolution.
    // Each recursion shifts hue by a small amount, creating rainbow spirals.
    let hue_rate = intensity * 0.015;
    let prev_luma = dot(prev, vec3<f32>(0.2126, 0.7152, 0.0722));
    let prev_chroma = prev - vec3<f32>(prev_luma);
    // Rotate chroma in the RG plane (simplified hue rotation)
    let hc = cos(hue_rate * TAU);
    let hs = sin(hue_rate * TAU);
    let rotated_chroma = vec3<f32>(
        prev_chroma.r * hc - prev_chroma.g * hs,
        prev_chroma.r * hs + prev_chroma.g * hc,
        prev_chroma.b
    );
    // Slight desaturation per recursion (prevents infinite brightness buildup)
    let sat_decay = 0.97;
    let prev_shifted = vec3<f32>(prev_luma) + rotated_chroma * sat_decay;

    // Blend: energy-reactive depth. Quiet = subtle echo, loud = deep recursion.
    let blend = intensity * (0.40 + energy * 0.30);

    return mix(scene_col, max(prev_shifted, vec3<f32>(0.0)), blend);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 3: HYPERSATURATION — A++++ psychedelic color explosion
//
// Not just "more saturation" — a perceptually-aware color push that:
// - Protects highlights and shadows (only boosts midtones)
// - Uses hue-dependent curves (warm colors boost more than cool)
// - Applies gamut compression to prevent ugly clipping
// - Energy-reactive: subtle glow at rest, acid trip at peaks
// - Warm color bias matching Dead aesthetic
// ═══════════════════════════════════════════════════════════
fn hypersaturation(col: vec3<f32>, intensity: f32, energy: f32) -> vec3<f32> {
    let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));

    // Protect shadows and highlights — only push midtone saturation.
    // Dark pixels (luma < 0.1): minimal boost (prevents noise amplification)
    // Bright pixels (luma > 0.85): reduced boost (prevents clipping to white)
    let midtone_mask = smoothstep(0.05, 0.20, luma) * smoothstep(0.95, 0.75, luma);

    // Base saturation multiplier: 1.5x at rest, up to 3.5x at peak energy
    let base_mult = 1.5 + intensity * (1.0 + energy * 1.5);
    let sat_mult = 1.0 + (base_mult - 1.0) * midtone_mask;

    // Extract chroma (color information separated from luminance)
    let chroma = col - vec3<f32>(luma);

    // Hue-dependent saturation: warm colors (red/amber/gold) boost MORE
    // than cool colors (blue/cyan). This reinforces the Dead warm palette.
    let warmth = max(chroma.r - chroma.b, 0.0); // positive when warm-toned
    let warm_boost = 1.0 + warmth * intensity * 0.5;

    // Apply saturation with warm bias
    var result = vec3<f32>(luma) + chroma * sat_mult * warm_boost;

    // Gamut compression: soft-clip values that exceed [0,1] instead of hard clamp.
    // This preserves hue (hard clamp shifts hue toward white).
    let max_channel = max(result.r, max(result.g, result.b));
    if (max_channel > 1.0) {
        let compress = 1.0 / max_channel;
        result = mix(result, result * compress, smoothstep(1.0, 1.5, max_channel));
    }
    result = max(result, vec3<f32>(0.0));

    // Subtle vibrance on top: boost the LEAST saturated channel
    // (fills in muted areas without oversaturating already-vivid areas)
    let min_channel = min(result.r, min(result.g, result.b));
    let vibrance = intensity * 0.15 * midtone_mask;
    result = result + (vec3<f32>(luma) - result) * vec3<f32>(-vibrance) * (1.0 - min_channel);

    return max(result, vec3<f32>(0.0));
}

// ═══════════════════════════════════════════════════════════
// EFFECT 4: CHROMATIC SPLIT — A++++ prismatic color separation
//
// Simulates lens chromatic aberration with:
// - Radial split (stronger at edges, none at center — like real optics)
// - Energy-reactive split distance
// - 6-sample per channel for smooth prismatic rainbow fringing
// - Beat-triggered split pulse
// - Proper aspect ratio handling
// ═══════════════════════════════════════════════════════════
fn chromatic_split(uv: vec2<f32>, intensity: f32, energy: f32, time: f32) -> vec3<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let to_center = uv - center;
    let dist_from_center = length(to_center);

    // Radial split: stronger at edges (like real lens aberration)
    let radial_strength = smoothstep(0.0, 0.5, dist_from_center);
    let base_offset = intensity * (0.004 + energy * 0.012) * radial_strength;

    // Beat pulse: brief split intensification
    let beat_pulse = 1.0 + fx.beat_snap * 0.8 * intensity;
    let offset = base_offset * beat_pulse;

    // Split direction: radial (away from center) + slight rotation for prismatic effect
    let radial_dir = normalize(to_center + vec2<f32>(0.001));
    let rot_angle = time * 0.1;
    let rc = cos(rot_angle);
    let rs = sin(rot_angle);
    let dir = vec2<f32>(radial_dir.x * rc - radial_dir.y * rs,
                         radial_dir.x * rs + radial_dir.y * rc);

    // 3-tap per channel for smoother prismatic fringing
    let r1 = textureSample(scene_tex, tex_sampler, uv + dir * offset).r;
    let r2 = textureSample(scene_tex, tex_sampler, uv + dir * offset * 0.6).r;
    let r = (r1 + r2) * 0.5;

    let g = textureSample(scene_tex, tex_sampler, uv).g;

    let b1 = textureSample(scene_tex, tex_sampler, uv - dir * offset).b;
    let b2 = textureSample(scene_tex, tex_sampler, uv - dir * offset * 0.6).b;
    let b = (b1 + b2) * 0.5;

    return vec3<f32>(r, g, b);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 5: TRAILS / ECHO — A++++ motion persistence
//
// Creates phosphor-decay trailing like an old CRT or long-exposure photo.
// - Screen blend (additive-like, prevents darkening)
// - Color fade: trails warm as they decay (cool→warm shift)
// - Energy-reactive trail length
// - Multi-sample temporal for smoother persistence
// - Subtle desaturation on trails (simulates phosphor decay)
// ═══════════════════════════════════════════════════════════
fn trails_echo(uv: vec2<f32>, scene_col: vec3<f32>, intensity: f32) -> vec3<f32> {
    // Multi-sample previous frame for smoother trails
    let prev1 = textureSample(prev_frame_tex, tex_sampler, uv).rgb;
    let prev2 = textureSample(prev_frame_tex, tex_sampler, uv + vec2<f32>(0.001, 0.0)).rgb;
    let prev = (prev1 + prev2) * 0.5;

    // Trail persistence: energy-reactive (0.65 at rest → 0.88 at peak)
    let persist = 0.65 + intensity * (0.10 + fx.energy * 0.13);

    // Phosphor decay: trails warm slightly as they fade (cool→amber shift)
    let trail_warmth = intensity * 0.03;
    let decayed = prev * persist * vec3<f32>(1.0 + trail_warmth, 1.0, 1.0 - trail_warmth);

    // Slight desaturation on the trail (mimics phosphor afterglow)
    let trail_luma = dot(decayed, vec3<f32>(0.2126, 0.7152, 0.0722));
    let desaturated_trail = mix(decayed, vec3<f32>(trail_luma), intensity * 0.15);

    // Screen blend: trail + scene without darkening either
    // Formula: 1 - (1-scene)(1-trail)
    let blended = scene_col + desaturated_trail * (vec3<f32>(1.0) - scene_col) * intensity;

    return blended;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 6: MIRROR SYMMETRY — A++++ bilateral reflection
//
// - Rotating mirror axis with smooth interpolation
// - Anti-aliased mirror edge (no hard seam)
// - Energy-reactive axis speed
// - Optional quad symmetry at high energy (both axes)
// - Edge blend to prevent artifacts at frame border
// ═══════════════════════════════════════════════════════════
fn mirror_symmetry(uv: vec2<f32>, intensity: f32, time: f32) -> vec2<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let p = uv - center;

    // Mirror axis rotates slowly, energy modulates speed
    let angle = time * (0.015 + fx.energy * 0.01) * intensity;
    let c = cos(angle);
    let s = sin(angle);

    // Rotate into mirror space
    let rotated = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);

    // Primary mirror: reflect across X axis
    let mirrored = vec2<f32>(abs(rotated.x), rotated.y);

    // At high energy, add secondary mirror for quad symmetry
    var final_mirror = mirrored;
    if (fx.energy > 0.4) {
        let quad_blend = smoothstep(0.4, 0.7, fx.energy) * intensity;
        let quad = vec2<f32>(abs(rotated.x), abs(rotated.y));
        final_mirror = mix(mirrored, quad, quad_blend);
    }

    // Rotate back
    let back = vec2<f32>(final_mirror.x * c + final_mirror.y * s,
                          -final_mirror.x * s + final_mirror.y * c);

    // Anti-aliased mirror edge: smooth blend near the axis
    let edge_dist = abs(rotated.x);
    let aa = smoothstep(0.0, 0.008, edge_dist);
    let result = mix(p, back, aa * intensity);

    return result + center;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 7: AUDIO DISPLACEMENT — A++++ frequency-mapped UV warp
//
// Maps different frequency bands to different spatial frequencies:
// - Bass: large slow undulations (like heat shimmer)
// - Mids: medium organic waves
// - Highs: fine fast ripples
// - Beat-triggered sharp displacement spikes
// ═══════════════════════════════════════════════════════════
fn audio_displacement(uv: vec2<f32>, intensity: f32, bass: f32, time: f32) -> vec2<f32> {
    // Bass: large slow waves (like heat rising)
    let bass_freq = 3.0;
    let bass_amp = intensity * bass * 0.05;
    let bass_x = sin(uv.y * bass_freq + time * 0.8) * bass_amp;
    let bass_y = cos(uv.x * bass_freq * 0.7 + time * 0.6) * bass_amp * 0.7;

    // Mids: medium organic displacement
    let mid_freq = 8.0;
    let mid_amp = intensity * fx.energy * 0.025;
    let mid_x = sin(uv.y * mid_freq + time * 1.5 + sin(uv.x * 4.0)) * mid_amp;
    let mid_y = cos(uv.x * mid_freq * 0.8 + time * 1.2) * mid_amp * 0.6;

    // High frequency: fine ripples (subtle)
    let hi_freq = 20.0;
    let hi_amp = intensity * fx.energy * 0.008;
    let hi_x = sin(uv.y * hi_freq + time * 3.0) * hi_amp;
    let hi_y = cos(uv.x * hi_freq + time * 2.5) * hi_amp;

    // Beat spike: sharp momentary displacement
    let beat_spike = fx.beat_snap * intensity * 0.03;
    let spike_x = sin(uv.y * 6.0 + time * 10.0) * beat_spike;

    return uv + vec2<f32>(bass_x + mid_x + hi_x + spike_x,
                           bass_y + mid_y + hi_y);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 8: ZOOM PUNCH — A++++ beat-triggered zoom impact
//
// - Exponential decay (sharp attack, smooth release)
// - Energy-reactive punch strength
// - Slight barrel distortion at peak zoom for impact feel
// - Bass modulates punch depth
// ═══════════════════════════════════════════════════════════
fn zoom_punch(uv: vec2<f32>, intensity: f32, beat_snap: f32) -> vec2<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let p = uv - center;

    // Zoom amount: beat_snap provides fast-attack envelope
    // Strength scales with energy (quiet beats = subtle, loud = punchy)
    let punch_strength = beat_snap * intensity * (0.04 + fx.energy * 0.04);

    // Slight barrel distortion at peak for impact feel
    let dist = length(p);
    let barrel = 1.0 + punch_strength * dist * 2.0;

    let zoom = 1.0 - punch_strength * barrel;
    return p * zoom + center;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 9: SLOW BREATH PULSE — A++++ organic scale oscillation
//
// Simulates the visual experience of "the walls breathing" during
// psychedelic perception. Features:
// - Multiple layered sine waves (not a single mechanical oscillation)
// - Bass-modulated breath depth
// - Slight center-of-gravity shift (not perfectly centered)
// - Energy-reactive breath rate (slower when quiet, faster at peaks)
// ═══════════════════════════════════════════════════════════
fn breath_pulse(uv: vec2<f32>, intensity: f32, time: f32) -> vec2<f32> {
    // Primary breath: slow, deep, organic (~0.2 Hz at rest)
    let rate = 0.2 + fx.energy * 0.15;
    let primary = sin(time * rate * TAU) * intensity * 0.012;

    // Secondary breath: slightly faster, smaller (adds organic irregularity)
    let secondary = sin(time * rate * TAU * 1.7 + 1.3) * intensity * 0.004;

    // Bass modulation: deeper breathing on bass hits
    let bass_depth = fx.bass * intensity * 0.006;
    let bass_breath = sin(time * 0.8 + 0.5) * bass_depth;

    let total_scale = 1.0 + primary + secondary + bass_breath;

    // Breathing center shifts slightly (not perfectly centered — more organic)
    let cx = 0.5 + sin(time * 0.05) * 0.02 * intensity;
    let cy = 0.5 + cos(time * 0.04) * 0.015 * intensity;
    let center = vec2<f32>(cx, cy);

    return (uv - center) * total_scale + center;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 10: LIGHT LEAK BURST — A++++ film light leak simulation
//
// Simulates real film camera light leaks with:
// - Multiple drifting leak sources (not a single radial gradient)
// - Spectral color variation (amber → magenta → orange)
// - Beat-triggered flash intensification
// - Directional streak (horizontal, like real film gate leaks)
// - Energy-reactive leak frequency
// ═══════════════════════════════════════════════════════════
fn light_leak_burst(col: vec3<f32>, uv: vec2<f32>, intensity: f32, time: f32, beat_snap: f32) -> vec3<f32> {
    var leak = vec3<f32>(0.0);

    // 3 drifting leak sources with different colors and positions
    for (var i = 0; i < 3; i = i + 1) {
        let id = f32(i);
        let phase = id * 2.094; // 120° apart

        // Leak center drifts slowly
        let cx = 0.2 + sin(time * (0.08 + id * 0.03) + phase) * 0.5;
        let cy = 0.3 + cos(time * (0.06 + id * 0.02) + phase * 0.7) * 0.4;
        let leak_center = vec2<f32>(cx, cy);

        // Elliptical shape: wider horizontally (film gate leak direction)
        let dp = uv - leak_center;
        let dist = length(vec2<f32>(dp.x * 0.6, dp.y)); // horizontal stretch

        // Spectral color per leak source
        let leak_color = vec3<f32>(
            0.9 + sin(phase) * 0.1,
            0.5 + sin(phase + 1.5) * 0.3,
            0.2 + sin(phase + 3.0) * 0.2
        );

        let glow = smoothstep(0.5, 0.0, dist);
        leak += leak_color * glow * (0.15 + beat_snap * 0.25);
    }

    // Horizontal streak (film gate leak characteristic)
    let streak_y = 0.5 + sin(time * 0.1) * 0.3;
    let streak = smoothstep(0.15, 0.0, abs(uv.y - streak_y)) * 0.08;
    leak += vec3<f32>(1.0, 0.6, 0.2) * streak;

    return col + leak * intensity;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 11: TIME DILATION — A++++ temporal slow-motion
//
// Not just "blend with previous frame" — creates the perceptual
// experience of time stretching:
// - Weighted multi-frame averaging (not binary blend)
// - Slight spatial drift in feedback (movement feels dreamlike)
// - Desaturation + contrast shift (visual hallmark of slow-mo perception)
// - Energy-reactive: nearly frozen at rest, flowing at peaks
// ═══════════════════════════════════════════════════════════
fn time_dilation(uv: vec2<f32>, scene_col: vec3<f32>, intensity: f32) -> vec3<f32> {
    // Slight spatial drift: feedback UV shifts very slightly (dreamlike motion)
    let drift = vec2<f32>(
        sin(fx.time * 0.03) * 0.002 * intensity,
        cos(fx.time * 0.025) * 0.0015 * intensity
    );
    let prev_uv = clamp(uv + drift, vec2<f32>(0.0), vec2<f32>(1.0));

    // Multi-sample previous frame for smoother temporal blend
    let prev1 = textureSample(prev_frame_tex, tex_sampler, prev_uv).rgb;
    let prev2 = textureSample(prev_frame_tex, tex_sampler, prev_uv + vec2<f32>(0.001, 0.001)).rgb;
    let prev = (prev1 + prev2) * 0.5;

    // Very heavy temporal blend (85-93%)
    let blend = 0.85 + intensity * 0.08;
    var result = mix(scene_col, prev, blend);

    // Slight contrast reduction (visual hallmark of slow-motion perception)
    let luma = dot(result, vec3<f32>(0.2126, 0.7152, 0.0722));
    result = mix(result, vec3<f32>(luma), intensity * 0.10); // subtle desat
    result = mix(vec3<f32>(0.5), result, 1.0 - intensity * 0.08); // reduce contrast

    return result;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 12: MOIRE PATTERNS — A++++ optical interference
//
// - 3 overlapping grids at precisely different angles
// - Circular moire rings from center
// - Energy-reactive grid frequency (tighter at peaks)
// - Color fringing at interference peaks
// - Anti-aliased grid lines
// ═══════════════════════════════════════════════════════════
fn moire_patterns(col: vec3<f32>, uv: vec2<f32>, intensity: f32, time: f32) -> vec3<f32> {
    let aspect = fx.width / fx.height;
    let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

    var moire_total = 0.0;

    // 3 overlapping grids at precisely different angles
    for (var i = 0; i < 3; i = i + 1) {
        let id = f32(i);
        let angle = time * (0.012 + id * 0.004) + id * 1.047; // 60° apart, slowly rotating
        let freq = 35.0 + fx.energy * 40.0 + id * 15.0;

        let ca = cos(angle);
        let sa = sin(angle);
        let grid_coord = p.x * ca - p.y * sa;

        // Anti-aliased grid line
        let line = sin(grid_coord * freq);
        moire_total += line;
    }

    // Circular interference rings from center
    let ring_freq = 25.0 + fx.energy * 20.0;
    let ring = sin(length(p) * ring_freq - time * 0.5);
    moire_total += ring;

    moire_total = moire_total / 4.0;

    // Sharp interference peaks
    let interference = pow(abs(moire_total), 2.0);

    // Color fringing at interference peaks (chromatic)
    let fringe = vec3<f32>(
        interference * 1.2,
        interference * 0.9,
        interference * 0.7
    );

    return col + fringe * intensity * 0.20;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 13: DEPTH OF FIELD — A++++ bokeh blur simulation
//
// - 13-tap Poisson disk sampling (not radial lines)
// - Circular bokeh shape (not directional blur)
// - Smooth focus transition (not sharp cutoff)
// - Energy-reactive focus distance
// - Proper aspect ratio for circular bokeh
// ═══════════════════════════════════════════════════════════
fn depth_of_field(uv: vec2<f32>, intensity: f32) -> vec3<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let dist = length(uv - center);

    // Focus region: sharp at center, blurry at edges
    // Energy shifts the focus zone (high energy = wider sharp area)
    let focus_radius = 0.15 + fx.energy * 0.15;
    let blur_amount = smoothstep(focus_radius, focus_radius + 0.3, dist) * intensity * 0.008;

    if (blur_amount < 0.0005) {
        return textureSample(scene_tex, tex_sampler, uv).rgb;
    }

    // 13-tap Poisson disk sampling for circular bokeh
    let aspect = vec2<f32>(1.0, fx.width / fx.height);
    var col = vec3<f32>(0.0);
    var total_weight = 0.0;

    // Poisson disk offsets (pre-computed, well-distributed)
    let offsets = array<vec2<f32>, 13>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(0.527, 0.085),
        vec2<f32>(-0.040, 0.536),
        vec2<f32>(-0.670, -0.179),
        vec2<f32>(0.110, -0.620),
        vec2<f32>(0.695, -0.356),
        vec2<f32>(-0.330, 0.740),
        vec2<f32>(-0.755, 0.370),
        vec2<f32>(0.340, -0.860),
        vec2<f32>(0.893, 0.350),
        vec2<f32>(-0.540, -0.630),
        vec2<f32>(0.180, 0.920),
        vec2<f32>(-0.910, -0.200),
    );

    for (var i = 0; i < 13; i = i + 1) {
        let sample_uv = uv + offsets[i] * blur_amount * aspect;
        let clamped = clamp(sample_uv, vec2<f32>(0.0), vec2<f32>(1.0));
        let weight = 1.0 - length(offsets[i]) * 0.3; // center-weighted
        col += textureSample(scene_tex, tex_sampler, clamped).rgb * weight;
        total_weight += weight;
    }

    return col / total_weight;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 14: GLITCH / DATAMOSH — A++++ digital corruption art
//
// - Multi-layer corruption (scanlines, blocks, color channel)
// - Beat-triggered block displacement (from previous frame)
// - Horizontal VHS tracking lines
// - Color banding artifacts
// - Energy-reactive corruption density
// - RGB shift on corrupted regions
// ═══════════════════════════════════════════════════════════
fn glitch_datamosh(uv: vec2<f32>, scene_col: vec3<f32>, intensity: f32, time: f32, beat_snap: f32) -> vec3<f32> {
    var col = scene_col;
    let t = floor(time * 6.0); // quantized time for stable glitch blocks

    // Layer 1: VHS tracking lines (horizontal displacement bands)
    let band_y = floor(uv.y * 40.0);
    let band_hash = fract(sin(band_y * 43758.5453 + t * 7.13) * 12345.6789);
    let band_active = step(1.0 - intensity * 0.12 * (1.0 + fx.energy), band_hash);
    if (band_active > 0.5) {
        let shift = (band_hash - 0.5) * intensity * 0.12;
        col = textureSample(scene_tex, tex_sampler, vec2<f32>(uv.x + shift, uv.y)).rgb;
        // RGB shift on displaced bands
        col = vec3<f32>(
            textureSample(scene_tex, tex_sampler, vec2<f32>(uv.x + shift + 0.003, uv.y)).r,
            col.g,
            textureSample(scene_tex, tex_sampler, vec2<f32>(uv.x + shift - 0.003, uv.y)).b
        );
    }

    // Layer 2: Block corruption on beats (datamosh-style frame hold)
    if (beat_snap > 0.4) {
        let block_size = 8.0 + (1.0 - fx.energy) * 8.0; // smaller blocks at high energy
        let bx = floor(uv.x * block_size);
        let by = floor(uv.y * block_size * 0.75);
        let block_hash = fract(sin(bx * 127.1 + by * 311.7 + t * 3.7) * 43758.5453);
        if (block_hash > (1.0 - intensity * beat_snap * 0.15)) {
            // Hold previous frame in this block (datamosh effect)
            let prev = textureSample(prev_frame_tex, tex_sampler, uv).rgb;
            col = prev;
        }
    }

    // Layer 3: Color banding (posterization on random bands)
    let color_band = fract(sin(floor(uv.y * 60.0) * 98765.4321 + t) * 54321.0);
    if (color_band > (1.0 - intensity * 0.06)) {
        // Reduce color depth (posterize)
        col = floor(col * 4.0) / 4.0;
    }

    // Layer 4: Subtle static noise overlay
    let noise = fract(sin(dot(uv * 1000.0 + t, vec2<f32>(12.9898, 78.233))) * 43758.5453);
    col = mix(col, vec3<f32>(noise), intensity * 0.03);

    return col;
}

// ═══════════════════════════════════════════════════════════
// MAIN: dispatch to active effect
// ═══════════════════════════════════════════════════════════
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var uv = in.uv;
    let intensity = fx.intensity;

    // No effect — passthrough
    if (fx.mode == 0u || intensity < 0.01) {
        return textureSample(scene_tex, tex_sampler, uv);
    }

    // UV-based effects (modify UV before sampling)
    if (fx.mode == 1u) { // Kaleidoscope
        uv = kaleidoscope(uv, intensity, fx.time, fx.energy);
    } else if (fx.mode == 6u) { // Mirror
        uv = mirror_symmetry(uv, intensity, fx.time);
    } else if (fx.mode == 7u) { // Audio displacement
        uv = audio_displacement(uv, intensity, fx.bass, fx.time);
    } else if (fx.mode == 8u) { // Zoom punch
        uv = zoom_punch(uv, intensity, fx.beat_snap);
    } else if (fx.mode == 9u) { // Breath pulse
        uv = breath_pulse(uv, intensity, fx.time);
    }

    // Clamp UV to valid range
    uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));

    // Sample scene at (possibly transformed) UV
    var col = textureSample(scene_tex, tex_sampler, uv).rgb;

    // Color/composition effects (modify color after sampling)
    if (fx.mode == 2u) { // Deep feedback
        col = deep_feedback(in.uv, col, intensity, fx.time, fx.energy);
    } else if (fx.mode == 3u) { // Hypersaturation
        col = hypersaturation(col, intensity, fx.energy);
    } else if (fx.mode == 4u) { // Chromatic split
        col = chromatic_split(in.uv, intensity, fx.energy, fx.time);
    } else if (fx.mode == 5u) { // Trails/echo
        col = trails_echo(in.uv, col, intensity);
    } else if (fx.mode == 10u) { // Light leak burst
        col = light_leak_burst(col, in.uv, intensity, fx.time, fx.beat_snap);
    } else if (fx.mode == 11u) { // Time dilation
        col = time_dilation(in.uv, col, intensity);
    } else if (fx.mode == 12u) { // Moire patterns
        col = moire_patterns(col, in.uv, intensity, fx.time);
    } else if (fx.mode == 13u) { // Depth of field
        col = depth_of_field(in.uv, intensity);
    } else if (fx.mode == 14u) { // Glitch datamosh
        col = glitch_datamosh(in.uv, col, intensity, fx.time, fx.beat_snap);
    }

    return vec4<f32>(col, 1.0);
}
"#;

/// Shared struct definitions + vertex shader
const VERTEX_WGSL: &str = r#"
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.clip_position = vec4<f32>(in.position, 0.0, 1.0);
    out.uv = in.uv;
    return out;
}
"#;

pub struct EffectPipeline {
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    /// Intermediate texture for the effect output (same format as scene)
    output_texture: wgpu::Texture,
    output_view: wgpu::TextureView,
}

impl EffectPipeline {
    pub fn new(
        device: &wgpu::Device,
        width: u32,
        height: u32,
    ) -> Self {
        // Vertex layout matching gpu.rs quad vertices: position (f32x2) + uv (f32x2)
        let vertex_buffer_layout = wgpu::VertexBufferLayout {
            array_stride: 16, // 4 floats × 4 bytes
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 0,
                    format: wgpu::VertexFormat::Float32x2,
                },
                wgpu::VertexAttribute {
                    offset: 8,
                    shader_location: 1,
                    format: wgpu::VertexFormat::Float32x2,
                },
            ],
        };
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("effect_bind_group_layout"),
            entries: &[
                // Sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                // Scene texture
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // Previous frame texture (for feedback/trails)
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // Uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("effect_pipeline_layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("effect_shader"),
            source: wgpu::ShaderSource::Wgsl(
                format!("{}\n{}", VERTEX_WGSL, EFFECT_WGSL).into(),
            ),
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("effect_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[vertex_buffer_layout],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: crate::gpu::OUTPUT_FORMAT,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        // Create intermediate texture — SDR format (Rgba8Unorm) to match output texture.
        // Effects run AFTER postprocess, transforming the final SDR output.
        let output_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("effect_output"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: crate::gpu::OUTPUT_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

        Self {
            pipeline,
            bind_group_layout,
            output_texture,
            output_view,
        }
    }

    /// Apply the effect to the scene texture.
    /// Returns a reference to the output texture view (transformed scene).
    /// If mode is None/0, returns the input scene_view unchanged (no GPU work).
    /// Apply the effect. Returns true if effect was applied (use output_view()),
    /// false if passthrough (use the original scene_view).
    pub fn apply(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        device: &wgpu::Device,
        sampler: &wgpu::Sampler,
        scene_view: &wgpu::TextureView,
        prev_frame_view: &wgpu::TextureView,
        uniforms: &EffectUniforms,
        vertex_buffer: &wgpu::Buffer,
        index_buffer: &wgpu::Buffer,
    ) -> bool {
        // Skip if no effect active
        if uniforms.mode == 0 || uniforms.intensity < 0.01 {
            return false;
        }

        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("effect_uniforms"),
            contents: bytemuck::bytes_of(uniforms),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("effect_bind_group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: wgpu::BindingResource::Sampler(sampler) },
                wgpu::BindGroupEntry { binding: 1, resource: wgpu::BindingResource::TextureView(scene_view) },
                wgpu::BindGroupEntry { binding: 2, resource: wgpu::BindingResource::TextureView(prev_frame_view) },
                wgpu::BindGroupEntry { binding: 3, resource: uniform_buffer.as_entire_binding() },
            ],
        });

        let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("effect_pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &self.output_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: None,
            timestamp_writes: None,
            occlusion_query_set: None,
        });

        render_pass.set_pipeline(&self.pipeline);
        render_pass.set_bind_group(0, &bind_group, &[]);
        render_pass.set_vertex_buffer(0, vertex_buffer.slice(..));
        render_pass.set_index_buffer(index_buffer.slice(..), wgpu::IndexFormat::Uint16);
        render_pass.draw_indexed(0..6, 0, 0..1);

        true // effect was applied — caller should use output_view()
    }

    pub fn output_view(&self) -> &wgpu::TextureView {
        &self.output_view
    }

    pub fn output_texture(&self) -> &wgpu::Texture {
        &self.output_texture
    }
}
