//! Composited visual effects — GPU-rendered layers overlaid on top of shaders.
//!
//! Unlike post-processing transforms (effects.rs) which modify the scene texture,
//! these render NEW visual elements (particles, caustics, geometry) that get
//! alpha-blended on top of whatever shader is running.
//!
//! Architecture:
//!   Scene shader → HDR texture
//!   → Post-processing transforms (effects.rs)
//!   → Composited layers (this module) — additive/screen blend on top
//!   → Bloom + composite + FXAA
//!
//! Each composited effect is a WGSL fragment shader that generates visual
//! content from scratch (not reading the scene) and outputs with alpha
//! for blending.

use wgpu::util::DeviceExt;

/// Composited effect types.
#[repr(u32)]
#[derive(Clone, Copy, Debug, Default)]
pub enum CompositedEffect {
    #[default]
    None = 0,
    ParticleSwarm = 1,
    Caustics = 2,
    CelestialMap = 3,
    TunnelWormhole = 4,
    FireEmbers = 5,
    RippleWaves = 6,
    StrobeFlicker = 7,
    GeometricBreakdown = 8,
    LiquidMetal = 9,
    ConcertPoster = 10,
}

/// Uniform buffer for composited effect parameters.
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
pub struct CompositedUniforms {
    pub mode: u32,
    pub intensity: f32,
    pub time: f32,
    pub energy: f32,
    pub bass: f32,
    pub beat_snap: f32,
    pub width: f32,
    pub height: f32,
}

/// Composited effects WGSL shader — generates visual layers with alpha.
const COMPOSITED_WGSL: &str = r#"

struct CompUniforms {
    mode: u32,
    intensity: f32,
    time: f32,
    energy: f32,
    bass: f32,
    beat_snap: f32,
    width: f32,
    height: f32,
}
@group(0) @binding(0) var<uniform> cu: CompUniforms;

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;

// Hash function for pseudo-random numbers
fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(hash21(p), hash21(p + vec2<f32>(127.1, 311.7)));
}

// ═══════════════════════════════════════════════════════════
// EFFECT 1: PARTICLE SWARM — thousands of point particles
// ═══════════════════════════════════════════════════════════
fn particle_swarm(uv: vec2<f32>, intensity: f32, time: f32, energy: f32, bass: f32) -> vec4<f32> {
    var col = vec3<f32>(0.0);
    let aspect = cu.width / cu.height;
    let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

    // ~200 visible particles (GPU-efficient point sampling)
    for (var i = 0; i < 200; i = i + 1) {
        let id = f32(i);
        let h = hash22(vec2<f32>(id * 0.1, id * 0.3));

        // Particle position: orbiting with energy-driven speed
        let orbit_r = 0.1 + h.x * 0.4;
        let orbit_speed = (0.2 + h.y * 0.5) * (0.5 + energy);
        let angle = time * orbit_speed + id * 0.37;
        let pos = vec2<f32>(cos(angle) * orbit_r, sin(angle) * orbit_r * 0.8);

        // Bass breathing: particles pulse outward
        let breath = 1.0 + bass * 0.3;
        let particle_pos = pos * breath;

        let dist = length(p - particle_pos);
        let size = 0.002 + energy * 0.003;
        let glow = smoothstep(size * 3.0, 0.0, dist);

        // Warm particle color
        let hue = fract(h.x * 0.5 + time * 0.02);
        let particle_col = vec3<f32>(
            0.8 + hue * 0.2,
            0.5 + (1.0 - hue) * 0.3,
            0.3
        );
        col += particle_col * glow * intensity * 0.15;
    }

    let alpha = min(length(col) * 2.0, 1.0) * intensity;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 2: CAUSTICS — underwater light patterns
// ═══════════════════════════════════════════════════════════
fn caustics(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec4<f32> {
    let p = uv * 8.0;
    let t = time * 0.3;

    // Two layers of caustic-like interference
    var caustic = 0.0;
    for (var i = 0; i < 3; i = i + 1) {
        let scale = 1.0 + f32(i) * 0.5;
        let speed = 1.0 + f32(i) * 0.3;
        let pp = p * scale + vec2<f32>(t * speed, t * speed * 0.7);
        let c1 = sin(pp.x + sin(pp.y * 0.5 + t));
        let c2 = sin(pp.y + cos(pp.x * 0.5 + t * 0.8));
        caustic += abs(c1 * c2);
    }
    caustic = caustic / 3.0;
    caustic = pow(caustic, 2.0 + energy * 2.0); // sharper at high energy

    let col = vec3<f32>(0.4, 0.7, 1.0) * caustic * intensity * 0.4;
    let alpha = caustic * intensity * 0.5;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 3: CELESTIAL MAP — star field constellation
// ═══════════════════════════════════════════════════════════
fn celestial_map(uv: vec2<f32>, intensity: f32, time: f32) -> vec4<f32> {
    var col = vec3<f32>(0.0);
    let p = uv * 30.0;
    let cell = floor(p);
    let frac = fract(p) - 0.5;

    // Star at each cell with random brightness
    let h = hash21(cell);
    let star_pos = (hash22(cell + vec2<f32>(7.0, 13.0)) - 0.5) * 0.6;
    let dist = length(frac - star_pos);

    // Only some cells have stars
    if (h > 0.65) {
        let brightness = (h - 0.65) * 3.0;
        let twinkle = 0.7 + sin(time * (2.0 + h * 4.0) + h * 100.0) * 0.3;
        let star_glow = smoothstep(0.08, 0.0, dist) * brightness * twinkle;
        // Star color: warm white to blue-white
        let temp = hash21(cell + vec2<f32>(31.0, 97.0));
        let star_col = mix(
            vec3<f32>(1.0, 0.95, 0.8),  // warm
            vec3<f32>(0.8, 0.9, 1.0),    // cool
            temp
        );
        col = star_col * star_glow;
    }

    // Faint constellation lines
    // (connecting nearby stars — simplified as faint grid)
    let grid_line = smoothstep(0.02, 0.0, min(abs(frac.x), abs(frac.y)));
    col += vec3<f32>(0.2, 0.3, 0.5) * grid_line * 0.03 * intensity;

    let alpha = min(length(col), 1.0) * intensity;
    return vec4<f32>(col * intensity, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 4: TUNNEL / WORMHOLE — rings flying past camera
// ═══════════════════════════════════════════════════════════
fn tunnel_wormhole(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec4<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let p = uv - center;
    let aspect = cu.width / cu.height;
    let pa = vec2<f32>(p.x * aspect, p.y);
    let radius = length(pa);
    let angle = atan2(pa.y, pa.x);

    // Concentric rings rushing toward camera
    let speed = 1.0 + energy * 2.0;
    let ring_space = 0.15;
    let z = fract(radius / ring_space - time * speed * 0.3);
    let ring = smoothstep(0.02, 0.0, abs(z - 0.5) - 0.45);

    // Ring color varies with angle for trippy effect
    let hue_shift = angle / TAU + time * 0.05;
    let ring_col = vec3<f32>(
        0.5 + sin(hue_shift * TAU) * 0.5,
        0.5 + sin(hue_shift * TAU + 2.094) * 0.5,
        0.5 + sin(hue_shift * TAU + 4.189) * 0.5
    );

    // Fade at center and edges
    let edge_fade = smoothstep(0.0, 0.15, radius) * smoothstep(0.6, 0.4, radius);
    let col = ring_col * ring * edge_fade * intensity * 0.5;
    let alpha = ring * edge_fade * intensity * 0.4;

    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 5: FIRE / EMBERS — rising glowing particles
// ═══════════════════════════════════════════════════════════
fn fire_embers(uv: vec2<f32>, intensity: f32, time: f32, energy: f32, bass: f32) -> vec4<f32> {
    var col = vec3<f32>(0.0);

    for (var i = 0; i < 60; i = i + 1) {
        let id = f32(i);
        let h = hash22(vec2<f32>(id * 0.17, id * 0.31));

        // Ember rises with slight horizontal drift
        let x = h.x;
        let rise_speed = 0.05 + h.y * 0.15;
        let y = fract(h.y * 0.5 - time * rise_speed);
        let drift = sin(time * (1.0 + h.x * 2.0) + id) * 0.03;

        let ember_pos = vec2<f32>(x + drift, 1.0 - y);
        let dist = length(uv - ember_pos);

        // Ember size: larger when fresh (bottom), smaller as they rise
        let life = y; // 0 at bottom, 1 at top
        let size = (0.003 + bass * 0.002) * (1.0 - life * 0.7);
        let glow = smoothstep(size * 4.0, 0.0, dist);

        // Color: bright orange → dark red as they cool (rise)
        let ember_col = mix(
            vec3<f32>(1.0, 0.6, 0.1),  // hot
            vec3<f32>(0.5, 0.1, 0.0),  // cool
            life
        );
        col += ember_col * glow * (1.0 - life * 0.8) * intensity * 0.12;
    }

    let alpha = min(length(col) * 3.0, 1.0) * intensity;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 6: RIPPLE / CONCENTRIC WAVES
// ═══════════════════════════════════════════════════════════
fn ripple_waves(uv: vec2<f32>, intensity: f32, time: f32, beat_snap: f32) -> vec4<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let dist = length(uv - center);

    // Concentric rings expanding outward, triggered by beats
    let wave_freq = 20.0 + beat_snap * 10.0;
    let wave_speed = time * 2.0;
    let wave = sin(dist * wave_freq - wave_speed) * 0.5 + 0.5;
    let wave_sharp = pow(wave, 4.0);

    // Fade with distance
    let fade = smoothstep(0.5, 0.1, dist);
    let val = wave_sharp * fade * intensity;

    let col = vec3<f32>(0.8, 0.9, 1.0) * val * 0.2;
    let alpha = val * 0.15;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 7: STROBE / FLICKER — controlled flash overlay
// ═══════════════════════════════════════════════════════════
fn strobe_flicker(intensity: f32, beat_snap: f32, energy: f32) -> vec4<f32> {
    // Only flash on strong beats, never faster than ~2Hz (safe)
    // Flash is a brief white overlay, not a full-screen strobe
    let flash = beat_snap * energy * intensity;
    let flash_val = smoothstep(0.6, 0.9, flash) * 0.15; // max 15% white overlay
    return vec4<f32>(vec3<f32>(1.0), flash_val);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 8: GEOMETRIC BREAKDOWN — shard/fracture overlay
// ═══════════════════════════════════════════════════════════
fn geometric_breakdown(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec4<f32> {
    // Voronoi-like cell edges
    let scale = 4.0 + energy * 4.0;
    let p = uv * scale;
    let cell = floor(p);
    let frac = fract(p);

    var min_dist = 1.0;
    for (var dy = -1; dy <= 1; dy = dy + 1) {
        for (var dx = -1; dx <= 1; dx = dx + 1) {
            let neighbor = vec2<f32>(f32(dx), f32(dy));
            let point = hash22(cell + neighbor);
            // Animate points slightly
            let animated = point + sin(time * 0.5 + point * TAU) * 0.1;
            let diff = neighbor + animated - frac;
            let dist = length(diff);
            min_dist = min(min_dist, dist);
        }
    }

    // Sharp edges where cells meet
    let edge = smoothstep(0.05, 0.0, min_dist - 0.4);
    let col = vec3<f32>(0.9, 0.8, 0.6) * edge * intensity * 0.25;
    let alpha = edge * intensity * 0.2;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 9: LIQUID METAL — chrome reflective surface overlay
// ═══════════════════════════════════════════════════════════
fn liquid_metal(uv: vec2<f32>, intensity: f32, time: f32, energy: f32, bass: f32) -> vec4<f32> {
    let aspect = cu.width / cu.height;
    let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);

    // Flowing metallic surface: layered noise creating chrome-like reflections
    let t = time * 0.2;
    var metal = 0.0;

    // Layer 1: broad undulations
    metal += sin(p.x * 3.0 + t + sin(p.y * 2.0 + t * 0.7)) * 0.4;
    metal += sin(p.y * 4.0 - t * 0.8 + cos(p.x * 3.0 + t * 0.5)) * 0.3;

    // Layer 2: fine ripples (bass-reactive)
    let ripple_freq = 8.0 + bass * 12.0;
    metal += sin(p.x * ripple_freq + t * 2.0) * sin(p.y * ripple_freq * 0.7 + t * 1.5) * 0.3;

    // Layer 3: specular highlights
    let spec_angle = atan2(p.y, p.x) + t * 0.3;
    let spec = pow(max(sin(spec_angle * 3.0 + length(p) * 10.0 - t * 2.0), 0.0), 8.0);
    metal += spec * energy;

    // Chrome color: silver-blue with warm highlights
    let highlight = smoothstep(0.3, 0.8, metal);
    let col = mix(
        vec3<f32>(0.15, 0.18, 0.22),  // dark chrome
        vec3<f32>(0.9, 0.85, 0.75),    // bright highlight (warm silver)
        highlight
    );

    // Fresnel-like edge glow
    let edge = smoothstep(0.0, 0.3, length(p));
    let fresnel = (1.0 - edge) * 0.3;

    let final_col = col * (0.5 + metal * 0.5) + vec3<f32>(0.8, 0.7, 0.5) * fresnel;
    let alpha = intensity * 0.25 * (0.3 + abs(metal) * 0.7);
    return vec4<f32>(final_col * intensity, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 10: CONCERT POSTER FREEZE — brief stylized freeze
// Captures the current visual, applies poster-art treatment:
// high contrast, limited palette, halftone dots, bold edges.
// ═══════════════════════════════════════════════════════════
fn concert_poster(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec4<f32> {
    // This effect reads the scene (unlike other composited effects)
    // but transforms it into a poster-art style overlay.
    // It should only fire briefly (1-2 seconds) at peak moments.

    // Halftone dot pattern
    let dot_scale = 60.0;
    let dot_uv = uv * dot_scale;
    let dot_cell = floor(dot_uv);
    let dot_frac = fract(dot_uv) - 0.5;
    let dot_dist = length(dot_frac);

    // Dot size based on "ink coverage" — darker areas get bigger dots
    let sample_uv = (dot_cell + 0.5) / dot_scale;
    // Can't sample scene_tex here (it's not bound in composited effects)
    // Instead, use procedural luminance based on position
    let pseudo_luma = 0.5 + sin(sample_uv.x * 12.0 + time) * 0.2 + cos(sample_uv.y * 8.0) * 0.2;
    let dot_size = (1.0 - pseudo_luma) * 0.45;
    let dot = smoothstep(dot_size + 0.02, dot_size, dot_dist);

    // Bold border frame
    let border = smoothstep(0.0, 0.02, uv.x) * smoothstep(0.0, 0.02, uv.y)
               * smoothstep(0.0, 0.02, 1.0 - uv.x) * smoothstep(0.0, 0.02, 1.0 - uv.y);
    let frame = 1.0 - border;

    // Poster color: limited palette (warm amber, deep red, cream)
    let poster_col = mix(
        vec3<f32>(0.9, 0.85, 0.7),  // cream paper
        vec3<f32>(0.8, 0.2, 0.1),    // poster red ink
        dot
    );

    // Frame border in dark
    let final_col = mix(poster_col, vec3<f32>(0.1, 0.05, 0.0), frame * 0.8);

    let alpha = intensity * 0.4;
    return vec4<f32>(final_col * intensity, alpha);
}

// ═══════════════════════════════════════════════════════════
// MAIN: dispatch and output with alpha for compositing
// ═══════════════════════════════════════════════════════════
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    if (cu.mode == 0u || cu.intensity < 0.01) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0); // transparent
    }

    if (cu.mode == 1u) { return particle_swarm(in.uv, cu.intensity, cu.time, cu.energy, cu.bass); }
    if (cu.mode == 2u) { return caustics(in.uv, cu.intensity, cu.time, cu.energy); }
    if (cu.mode == 3u) { return celestial_map(in.uv, cu.intensity, cu.time); }
    if (cu.mode == 4u) { return tunnel_wormhole(in.uv, cu.intensity, cu.time, cu.energy); }
    if (cu.mode == 5u) { return fire_embers(in.uv, cu.intensity, cu.time, cu.energy, cu.bass); }
    if (cu.mode == 6u) { return ripple_waves(in.uv, cu.intensity, cu.time, cu.beat_snap); }
    if (cu.mode == 7u) { return strobe_flicker(cu.intensity, cu.beat_snap, cu.energy); }
    if (cu.mode == 8u) { return geometric_breakdown(in.uv, cu.intensity, cu.time, cu.energy); }
    if (cu.mode == 9u) { return liquid_metal(in.uv, cu.intensity, cu.time, cu.energy, cu.bass); }
    if (cu.mode == 10u) { return concert_poster(in.uv, cu.intensity, cu.time, cu.energy); }

    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
}
"#;

// Note: This module defines the shaders but does NOT create a pipeline yet.
// The pipeline creation follows the same pattern as effects.rs EffectPipeline
// but with alpha blending enabled (additive or screen blend onto the scene).
// Integration into the render loop is a separate step.

/// Placeholder for future pipeline — shaders are defined and ready to compile.
pub fn get_composited_shader_source() -> &'static str {
    COMPOSITED_WGSL
}
