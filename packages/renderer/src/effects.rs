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

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

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
    let aspect = fx.width / fx.height;
    let pa = vec2<f32>(p.x * aspect, p.y);

    var angle = atan2(pa.y, pa.x);
    let radius = length(pa);

    // Smooth fold count: interpolate between integer folds for seamless transitions.
    // 5 at rest → 8 at peak energy. Uses smoothstep for organic feel.
    let fold_float = 5.0 + smoothstep(0.1, 0.6, energy) * 3.0;
    let fold_lo = floor(fold_float);
    let fold_hi = fold_lo + 1.0;
    let fold_blend = fract(fold_float);

    // Fold with lower count
    let sector_lo = TAU / fold_lo;
    var a_lo = ((angle % sector_lo) + sector_lo) % sector_lo;
    if (a_lo > sector_lo * 0.5) { a_lo = sector_lo - a_lo; }

    // Fold with higher count
    let sector_hi = TAU / fold_hi;
    var a_hi = ((angle % sector_hi) + sector_hi) % sector_hi;
    if (a_hi > sector_hi * 0.5) { a_hi = sector_hi - a_hi; }

    // Blend between fold counts for smooth transition
    var a = mix(a_lo, a_hi, smoothstep(0.3, 0.7, fold_blend));

    // Musically-reactive rotation: slow drift + beat accent
    let drift = time * 0.03 * intensity; // very slow base drift
    let beat_accent = fx.beat_snap * 0.05 * intensity; // subtle beat-locked nudge
    a = a + drift + beat_accent;

    // Bass breathing: subtle radial zoom
    let zoom = 1.0 + fx.bass * 0.06 * intensity;
    let zoomed_radius = radius * zoom;

    // Convert back to cartesian with aspect correction
    let new_p = vec2<f32>(cos(a) * zoomed_radius / aspect, sin(a) * zoomed_radius);

    // Anti-alias fold edges: blend with original UV near sector boundaries
    // This prevents the hard seam visible at fold lines
    let sector = TAU / fold_lo;
    let fold_pos = ((angle % sector) + sector) % sector;
    let edge_dist = min(fold_pos, sector - fold_pos); // distance to nearest fold edge
    let aa_width = 0.015; // anti-aliasing width in radians
    let edge_blend = smoothstep(0.0, aa_width, edge_dist);
    let final_p = mix(p / vec2<f32>(aspect, 1.0) * zoom, new_p, edge_blend * intensity);

    // Edge fade: prevent border artifacts at frame edges
    let edge_fade = smoothstep(0.0, 0.05, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    return mix(uv, final_p * vec2<f32>(1.0, 1.0) + center, intensity * edge_fade);
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
// EFFECT 6: MIRROR SYMMETRY — bilateral reflection
// ═══════════════════════════════════════════════════════════
fn mirror_symmetry(uv: vec2<f32>, intensity: f32, time: f32) -> vec2<f32> {
    // Reflect left/right with slow axis rotation
    let center = vec2<f32>(0.5, 0.5);
    let p = uv - center;
    let angle = time * 0.02 * intensity;
    let c = cos(angle);
    let s = sin(angle);
    let rotated = vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
    let mirrored = vec2<f32>(abs(rotated.x), rotated.y);
    // Rotate back
    let back = vec2<f32>(mirrored.x * c + mirrored.y * s, -mirrored.x * s + mirrored.y * c);
    return mix(uv, back + center, intensity);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 7: AUDIO DISPLACEMENT — bass-driven UV warp
// ═══════════════════════════════════════════════════════════
fn audio_displacement(uv: vec2<f32>, intensity: f32, bass: f32, time: f32) -> vec2<f32> {
    let warp = intensity * bass * 0.08;
    let wave_x = sin(uv.y * 12.0 + time * 2.0) * warp;
    let wave_y = cos(uv.x * 10.0 + time * 1.5) * warp * 0.6;
    return uv + vec2<f32>(wave_x, wave_y);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 8: ZOOM PUNCH — beat-triggered zoom
// ═══════════════════════════════════════════════════════════
fn zoom_punch(uv: vec2<f32>, intensity: f32, beat_snap: f32) -> vec2<f32> {
    let zoom = 1.0 - beat_snap * intensity * 0.06;
    let center = vec2<f32>(0.5, 0.5);
    return (uv - center) * zoom + center;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 9: SLOW BREATH PULSE — whole-image scale oscillation
// ═══════════════════════════════════════════════════════════
fn breath_pulse(uv: vec2<f32>, intensity: f32, time: f32) -> vec2<f32> {
    let breathe = sin(time * 0.3) * intensity * 0.015;
    let center = vec2<f32>(0.5, 0.5);
    return (uv - center) * (1.0 + breathe) + center;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 10: LIGHT LEAK BURST — warm amber flash overlay
// ═══════════════════════════════════════════════════════════
fn light_leak_burst(col: vec3<f32>, uv: vec2<f32>, intensity: f32, time: f32, beat_snap: f32) -> vec3<f32> {
    // Radial gradient from a drifting point — warm amber light burst
    let leak_center = vec2<f32>(
        0.3 + sin(time * 0.15) * 0.4,
        0.4 + cos(time * 0.12) * 0.3
    );
    let dist = length(uv - leak_center);
    let glow = smoothstep(0.6, 0.0, dist) * intensity;
    // Beat-triggered flash intensification
    let flash = glow * (1.0 + beat_snap * 1.5);
    // Warm amber leak color
    let leak_color = vec3<f32>(1.0, 0.7, 0.3);
    return col + leak_color * flash * 0.35;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 11: TIME DILATION — temporal slow-motion via feedback
// ═══════════════════════════════════════════════════════════
fn time_dilation(uv: vec2<f32>, scene_col: vec3<f32>, intensity: f32) -> vec3<f32> {
    // Heavy blend with previous frame — creates visual "slow motion"
    let prev = textureSample(prev_frame_tex, tex_sampler, uv).rgb;
    // 85-95% previous frame = extreme temporal smoothing
    let blend = 0.85 + intensity * 0.10;
    return mix(scene_col, prev, blend);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 12: MOIRE PATTERNS — interference grid overlay
// ═══════════════════════════════════════════════════════════
fn moire_patterns(col: vec3<f32>, uv: vec2<f32>, intensity: f32, time: f32) -> vec3<f32> {
    let aspect = fx.width / fx.height;
    let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

    // Two overlapping grids at slightly different angles
    let freq = 40.0 + intensity * 60.0;
    let angle1 = time * 0.02;
    let angle2 = time * 0.02 + 0.4;

    let grid1_x = p.x * cos(angle1) - p.y * sin(angle1);
    let grid2_x = p.x * cos(angle2) - p.y * sin(angle2);

    let pattern1 = sin(grid1_x * freq);
    let pattern2 = sin(grid2_x * freq);

    // Interference = product of two grids
    let moire = pattern1 * pattern2;
    let moire_val = smoothstep(-0.3, 0.3, moire) * intensity * 0.25;

    return col + col * moire_val;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 13: DEPTH OF FIELD — radial blur from center
// ═══════════════════════════════════════════════════════════
fn depth_of_field(uv: vec2<f32>, intensity: f32) -> vec3<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let dist = length(uv - center);

    // Blur amount increases with distance from center
    let blur_amount = dist * intensity * 0.012;

    // 5-tap radial blur
    var col = textureSample(scene_tex, tex_sampler, uv).rgb * 0.4;
    let dir = normalize(uv - center) * blur_amount;
    col += textureSample(scene_tex, tex_sampler, uv + dir).rgb * 0.15;
    col += textureSample(scene_tex, tex_sampler, uv - dir).rgb * 0.15;
    col += textureSample(scene_tex, tex_sampler, uv + dir * 2.0).rgb * 0.15;
    col += textureSample(scene_tex, tex_sampler, uv - dir * 2.0).rgb * 0.15;

    return col;
}

// ═══════════════════════════════════════════════════════════
// EFFECT 14: GLITCH / DATAMOSH — digital corruption
// ═══════════════════════════════════════════════════════════
fn glitch_datamosh(uv: vec2<f32>, scene_col: vec3<f32>, intensity: f32, time: f32, beat_snap: f32) -> vec3<f32> {
    var col = scene_col;

    // Horizontal line displacement (scanline glitch)
    let line_hash = fract(sin(floor(uv.y * 80.0) * 43758.5453 + floor(time * 8.0)) * 12345.6789);
    if (line_hash > (1.0 - intensity * 0.15)) {
        let shift = (line_hash - 0.5) * intensity * 0.15;
        col = textureSample(scene_tex, tex_sampler, vec2<f32>(uv.x + shift, uv.y)).rgb;
    }

    // Block displacement on beats
    if (beat_snap > 0.3) {
        let block_x = floor(uv.x * 8.0) / 8.0;
        let block_y = floor(uv.y * 6.0) / 6.0;
        let block_hash = fract(sin(block_x * 127.1 + block_y * 311.7 + floor(time * 4.0)) * 43758.5453);
        if (block_hash > (1.0 - intensity * beat_snap * 0.2)) {
            // Swap with previous frame block
            let prev = textureSample(prev_frame_tex, tex_sampler, uv).rgb;
            col = prev;
        }
    }

    // Color channel offset on some lines
    if (line_hash > (1.0 - intensity * 0.08)) {
        col = vec3<f32>(col.b, col.r, col.g); // channel swap
    }

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

/// Vertex shader (shared with postprocess)
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
        sampler: &wgpu::Sampler,
        vertex_buffer_layout: wgpu::VertexBufferLayout<'static>,
    ) -> Self {
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
                    format: crate::gpu::SCENE_FORMAT,
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

        // Create intermediate texture (same format as scene — Rgba16Float)
        let output_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("effect_output"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: crate::gpu::SCENE_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
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
}
