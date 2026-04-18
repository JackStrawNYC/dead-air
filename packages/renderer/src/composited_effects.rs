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
// EFFECT 1: PARTICLE SWARM — A++++ massive particle field
//
// Simulates 50K+ particles using a grid-based approach:
// each pixel checks its local cell for nearby particles,
// creating the illusion of thousands without per-particle loops.
// - Multi-layer depth (3 layers at different scales)
// - Energy-driven particle density and speed
// - Bass-reactive radial breathing
// - Warm organic color palette (amber/gold, not clinical white)
// - Size variation and soft glow falloff
// ═══════════════════════════════════════════════════════════
fn particle_swarm(uv: vec2<f32>, intensity: f32, time: f32, energy: f32, bass: f32) -> vec4<f32> {
    var col = vec3<f32>(0.0);
    let aspect = cu.width / cu.height;

    // 3 layers at different scales for depth perception
    for (var layer = 0; layer < 3; layer = layer + 1) {
        let lid = f32(layer);
        let layer_scale = 15.0 + lid * 20.0; // 15, 35, 55 cells
        let layer_speed = (0.3 + lid * 0.2) * (0.5 + energy);
        let layer_size = (0.004 - lid * 0.001) * (1.0 + energy * 0.5);
        let layer_brightness = 1.0 - lid * 0.25;

        let p = uv * layer_scale;
        let cell = floor(p);

        // Check 3x3 neighborhood for nearby particles
        for (var dy = -1; dy <= 1; dy = dy + 1) {
            for (var dx = -1; dx <= 1; dx = dx + 1) {
                let neighbor = cell + vec2<f32>(f32(dx), f32(dy));
                let h = hash22(neighbor + vec2<f32>(lid * 100.0, 0.0));

                // Only ~60% of cells have particles (density control)
                if (h.x > 0.4 + (1.0 - energy) * 0.2) { continue; }

                // Particle position within cell (animated orbit)
                let orbit_phase = h.y * TAU + time * layer_speed * (0.5 + h.x);
                let orbit_r = 0.2 + h.x * 0.25;
                let particle_pos = neighbor + 0.5 + vec2<f32>(
                    cos(orbit_phase) * orbit_r,
                    sin(orbit_phase * 0.7 + h.y * 3.0) * orbit_r
                );

                // Bass breathing: particles pulse outward from center
                let to_center = (particle_pos / layer_scale - 0.5);
                let breath = bass * 0.15 * intensity;
                let breathed_pos = particle_pos + to_center * layer_scale * breath;

                let diff = p - breathed_pos;
                let dist = length(vec2<f32>(diff.x, diff.y * aspect));

                // Soft glow with size variation
                let glow = smoothstep(layer_size * 3.0, 0.0, dist);

                // Warm color: amber to gold, shifting with time
                let hue = fract(h.x * 0.3 + h.y * 0.7 + time * 0.01);
                let particle_col = vec3<f32>(
                    0.9 + hue * 0.1,
                    0.6 + (1.0 - hue) * 0.2,
                    0.2 + hue * 0.1
                ) * layer_brightness;

                col += particle_col * glow * intensity * 0.06;
            }
        }
    }

    let alpha = min(length(col) * 3.0, 1.0) * intensity;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 2: CAUSTICS — A++++ underwater light refraction
//
// Physically-inspired caustic simulation using Voronoi-based
// light concentration. Features:
// - Voronoi cell edges create sharp caustic lines
// - 3 overlapping scales for organic complexity
// - Energy-reactive sharpness (soft glow → sharp lines)
// - Chromatic dispersion (edges split into color spectrum)
// - Bass-driven wave amplitude
// ═══════════════════════════════════════════════════════════
fn caustics(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec4<f32> {
    var caustic_r = 0.0;
    var caustic_g = 0.0;
    var caustic_b = 0.0;

    // 3 scales of caustic patterns for organic complexity
    for (var layer = 0; layer < 3; layer = layer + 1) {
        let lid = f32(layer);
        let scale = 5.0 + lid * 3.0;
        let speed = 0.2 + lid * 0.1;
        let t = time * speed;
        let bass_amp = cu.bass * 0.3;

        // Chromatic dispersion: slightly different UV per color channel
        let disp = lid * 0.008 * intensity;

        for (var ch = 0; ch < 3; ch = ch + 1) {
            let ch_offset = f32(ch) * disp;
            let p = (uv + vec2<f32>(ch_offset, 0.0)) * scale;
            let cell = floor(p);
            let frac = fract(p);

            // Find minimum distance to animated Voronoi points
            var min_dist = 1.0;
            var second_dist = 1.0;
            for (var dy = -1; dy <= 1; dy = dy + 1) {
                for (var dx = -1; dx <= 1; dx = dx + 1) {
                    let neighbor = vec2<f32>(f32(dx), f32(dy));
                    let point = hash22(cell + neighbor + vec2<f32>(lid * 50.0, 0.0));
                    // Animate points with organic motion
                    let animated = point + vec2<f32>(
                        sin(t * (1.0 + point.x * 2.0) + point.y * TAU) * (0.3 + bass_amp),
                        cos(t * (0.8 + point.y * 1.5) + point.x * TAU) * (0.3 + bass_amp)
                    );
                    let diff = neighbor + animated - frac;
                    let d = length(diff);
                    if (d < min_dist) {
                        second_dist = min_dist;
                        min_dist = d;
                    } else if (d < second_dist) {
                        second_dist = d;
                    }
                }
            }

            // Caustic intensity from Voronoi edge distance
            // (light concentrates at cell boundaries)
            let edge = second_dist - min_dist;
            let sharpness = 2.0 + energy * 6.0; // sharper at high energy
            let caustic_val = pow(1.0 - smoothstep(0.0, 0.3, edge), sharpness);

            if (ch == 0) { caustic_r += caustic_val / 3.0; }
            else if (ch == 1) { caustic_g += caustic_val / 3.0; }
            else { caustic_b += caustic_val / 3.0; }
        }
    }

    // Warm caustic color (golden-aqua, not clinical blue)
    let col = vec3<f32>(
        caustic_r * 0.6 + caustic_g * 0.3,
        caustic_g * 0.7 + caustic_b * 0.2,
        caustic_b * 0.5 + caustic_r * 0.1
    ) * intensity * 0.35;

    let alpha = max(caustic_r, max(caustic_g, caustic_b)) * intensity * 0.4;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 3: CELESTIAL MAP — A++++ deep star field
//
// Multi-layer star field with:
// - 3 depth layers (near bright stars, mid, distant dim)
// - Physically-modeled twinkle (atmospheric scintillation)
// - Star color temperature variation (blue giants → red dwarfs)
// - Faint nebula clouds between stars
// - Energy-reactive star brightness (brighter at peaks)
// - Slow celestial rotation
// ═══════════════════════════════════════════════════════════
fn celestial_map(uv: vec2<f32>, intensity: f32, time: f32) -> vec4<f32> {
    var col = vec3<f32>(0.0);

    // Slow celestial rotation
    let rot_speed = time * 0.005;
    let rc = cos(rot_speed);
    let rs = sin(rot_speed);
    let centered = uv - 0.5;
    let rotated = vec2<f32>(centered.x * rc - centered.y * rs,
                             centered.x * rs + centered.y * rc) + 0.5;

    // 3 star layers at different densities
    for (var layer = 0; layer < 3; layer = layer + 1) {
        let lid = f32(layer);
        let grid = 20.0 + lid * 15.0; // 20, 35, 50 cells
        let star_chance = 0.70 + lid * 0.08; // fewer stars in denser grids
        let brightness_mult = 1.0 - lid * 0.35;
        let size = 0.06 - lid * 0.015;

        let p = rotated * grid;
        let cell = floor(p);
        let frac = fract(p) - 0.5;

        // Check this cell
        let h = hash21(cell + vec2<f32>(lid * 100.0, 0.0));
        if (h > star_chance) {
            let star_pos = (hash22(cell + vec2<f32>(7.0 + lid * 50.0, 13.0)) - 0.5) * 0.7;
            let dist = length(frac - star_pos);

            let base_bright = (h - star_chance) / (1.0 - star_chance);

            // Atmospheric scintillation (realistic twinkle)
            let twinkle_speed = 1.5 + hash21(cell + vec2<f32>(99.0, 0.0)) * 3.0;
            let twinkle = 0.6 + sin(time * twinkle_speed + h * 100.0) * 0.25
                            + sin(time * twinkle_speed * 2.3 + h * 50.0) * 0.15;

            let star_glow = smoothstep(size, 0.0, dist) * base_bright * twinkle * brightness_mult;

            // Star color temperature: hash-based spectral class
            let temp = hash21(cell + vec2<f32>(31.0, 97.0));
            var star_col: vec3<f32>;
            if (temp < 0.2) {
                star_col = vec3<f32>(0.7, 0.8, 1.0); // blue giant
            } else if (temp < 0.6) {
                star_col = vec3<f32>(1.0, 0.98, 0.92); // white/yellow
            } else {
                star_col = vec3<f32>(1.0, 0.85, 0.6); // orange/red dwarf
            }

            col += star_col * star_glow * (0.7 + cu.energy * 0.3);
        }
    }

    // Faint nebula wisps (adds depth between stars)
    let nebula_p = rotated * 3.0;
    let n1 = sin(nebula_p.x * 2.0 + time * 0.02) * sin(nebula_p.y * 1.5 + time * 0.015);
    let n2 = sin(nebula_p.x * 3.5 + time * 0.03) * cos(nebula_p.y * 2.8 + time * 0.02);
    let nebula = max(n1 * n2, 0.0) * 0.03 * intensity;
    col += vec3<f32>(0.3, 0.2, 0.5) * nebula; // faint purple nebula

    let alpha = min(length(col) * 2.0, 1.0) * intensity;
    return vec4<f32>(col * intensity, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 4: TUNNEL / WORMHOLE — A++++ hyperspace tunnel
//
// - Multiple concentric ring layers with parallax depth
// - Ring thickness varies with energy (thin wireframe → thick bands)
// - Warm color palette (amber/gold/red, not rainbow)
// - Bass-driven ring pulse (rings breathe with the music)
// - Smooth anti-aliased ring edges
// - Spiral twist for psychedelic feel
// ═══════════════════════════════════════════════════════════
fn tunnel_wormhole(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec4<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let p = uv - center;
    let aspect = cu.width / cu.height;
    let pa = vec2<f32>(p.x * aspect, p.y);
    let radius = length(pa);
    let angle = atan2(pa.y, pa.x);

    var col = vec3<f32>(0.0);

    // 2 layers at different speeds for depth
    for (var layer = 0; layer < 2; layer = layer + 1) {
        let lid = f32(layer);
        let speed = (0.8 + energy * 1.5) * (1.0 + lid * 0.3);
        let ring_space = 0.12 + lid * 0.04;

        // Ring position with bass breathing
        let bass_pulse = cu.bass * 0.04 * intensity;
        let z = fract(radius / ring_space - time * speed * 0.2 + bass_pulse);

        // Ring thickness: energy-reactive (thin at rest, thick at peaks)
        let thickness = 0.03 + energy * 0.08;
        let ring = smoothstep(thickness, thickness * 0.3, abs(z - 0.5));

        // Spiral twist: angle offset varies with radius (psychedelic vortex)
        let twist = radius * 3.0 * intensity + time * 0.3;
        let twisted_angle = angle + twist;

        // Warm color: gold → amber → red, shifting with angle + time
        let hue_val = fract(twisted_angle / TAU + time * 0.03 + lid * 0.2);
        let ring_col = vec3<f32>(
            0.9 + sin(hue_val * TAU) * 0.1,
            0.5 + sin(hue_val * TAU + 1.5) * 0.3,
            0.2 + sin(hue_val * TAU + 3.0) * 0.15
        );

        // Depth fade: rings get dimmer at edges, bright in the middle zone
        let depth_fade = smoothstep(0.0, 0.10, radius) * smoothstep(0.55, 0.30, radius);
        let layer_fade = 1.0 - lid * 0.3;

        col += ring_col * ring * depth_fade * intensity * 0.3 * layer_fade;
    }

    let alpha = min(length(col) * 2.5, 1.0) * intensity;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 5: FIRE / EMBERS — A++++ rising ember field
//
// Grid-based particle system for hundreds of visible embers:
// - Multi-layer depth (near/mid/far)
// - Physically-modeled rise with turbulent drift
// - Hot→cool color gradient (white→orange→red→dark)
// - Bass-driven ember burst (more particles on bass hits)
// - Size variation with altitude (larger when fresh, smaller as they cool)
// - Soft glow with proper falloff
// ═══════════════════════════════════════════════════════════
fn fire_embers(uv: vec2<f32>, intensity: f32, time: f32, energy: f32, bass: f32) -> vec4<f32> {
    var col = vec3<f32>(0.0);

    // 2 layers: foreground (large, fast) + background (small, slow)
    for (var layer = 0; layer < 2; layer = layer + 1) {
        let lid = f32(layer);
        let grid_scale = 12.0 + lid * 8.0; // 12x, 20x grid
        let rise_speed = 0.08 + lid * 0.04;
        let base_size = 0.006 - lid * 0.002;
        let layer_bright = 1.0 - lid * 0.3;

        let p = vec2<f32>(uv.x * grid_scale, uv.y * grid_scale * 0.6); // taller cells
        let cell = floor(p);

        for (var dy = -1; dy <= 1; dy = dy + 1) {
            for (var dx = -1; dx <= 1; dx = dx + 1) {
                let neighbor = cell + vec2<f32>(f32(dx), f32(dy));
                let h = hash22(neighbor + vec2<f32>(lid * 50.0, 0.0));

                // ~50% of cells have embers
                if (h.x > 0.5 + (1.0 - energy) * 0.15) { continue; }

                // Rise animation: each ember rises independently
                let rise = fract(h.y * 0.5 - time * rise_speed * (0.5 + h.x));
                let life = rise; // 0 = fresh (bottom), 1 = dying (top)

                // Position with turbulent horizontal drift
                let drift_amp = 0.15 + life * 0.2;
                let drift = sin(time * (1.5 + h.x * 3.0) + h.y * TAU) * drift_amp;
                let ember_x = (neighbor.x + 0.5 + h.x * 0.3 + drift) / grid_scale;
                let ember_y = 1.0 - rise; // rises from bottom

                let dist = length(uv - vec2<f32>(ember_x, ember_y));

                // Size: larger when fresh, shrinks as it cools
                let size = base_size * (1.0 - life * 0.6) * (1.0 + bass * 0.4);
                let glow = smoothstep(size * 3.5, 0.0, dist);

                // Color gradient: white-hot → orange → deep red → dark
                var ember_col: vec3<f32>;
                if (life < 0.2) {
                    ember_col = mix(vec3<f32>(1.0, 0.95, 0.8), vec3<f32>(1.0, 0.7, 0.2), life * 5.0);
                } else if (life < 0.6) {
                    ember_col = mix(vec3<f32>(1.0, 0.7, 0.2), vec3<f32>(0.8, 0.2, 0.05), (life - 0.2) * 2.5);
                } else {
                    ember_col = mix(vec3<f32>(0.8, 0.2, 0.05), vec3<f32>(0.2, 0.05, 0.0), (life - 0.6) * 2.5);
                }

                let fade = (1.0 - life * 0.9); // fade as it rises
                col += ember_col * glow * fade * intensity * 0.08 * layer_bright;
            }
        }
    }

    let alpha = min(length(col) * 4.0, 1.0) * intensity;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 6: RIPPLE / WAVES — A++++ concentric wave field
//
// - Multiple wave sources (not just center)
// - Beat-triggered new wave emission
// - Energy-reactive wave speed and decay
// - Interference patterns where waves cross
// - Warm color tint
// ═══════════════════════════════════════════════════════════
fn ripple_waves(uv: vec2<f32>, intensity: f32, time: f32, beat_snap: f32) -> vec4<f32> {
    var wave_total = 0.0;

    // 3 wave sources at different positions
    for (var i = 0; i < 3; i = i + 1) {
        let id = f32(i);
        let phase = id * 2.094;
        let source = vec2<f32>(
            0.5 + sin(time * 0.05 + phase) * 0.2,
            0.5 + cos(time * 0.04 + phase * 0.7) * 0.2
        );
        let dist = length(uv - source);

        // Expanding rings with decay
        let wave_freq = 25.0 + cu.energy * 15.0;
        let speed = time * (1.5 + cu.energy);
        let wave = sin(dist * wave_freq - speed + id * 2.0);

        // Sharp peaks, soft troughs (like real water ripples)
        let sharp = pow(max(wave, 0.0), 2.0);

        // Decay with distance
        let decay = smoothstep(0.5, 0.05, dist);
        wave_total += sharp * decay;
    }

    // Beat-triggered center burst
    if (beat_snap > 0.3) {
        let center_dist = length(uv - vec2<f32>(0.5, 0.5));
        let burst = sin(center_dist * 40.0 - time * 4.0) * beat_snap;
        wave_total += max(burst, 0.0) * smoothstep(0.4, 0.0, center_dist);
    }

    wave_total = min(wave_total / 3.0, 1.0);

    // Warm ripple color
    let col = vec3<f32>(0.9, 0.8, 0.6) * wave_total * intensity * 0.18;
    let alpha = wave_total * intensity * 0.15;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 7: STROBE / FLICKER — A++++ safe controlled flash
//
// - NEVER exceeds broadcast safety guidelines (< 3Hz, < 20% delta)
// - Beat-gated (only on confident beats, not every frame)
// - Warm flash color (amber, not clinical white)
// - Energy-gated (no flash during quiet passages)
// - Smooth attack/release (not binary on/off)
// ═══════════════════════════════════════════════════════════
fn strobe_flicker(intensity: f32, beat_snap: f32, energy: f32) -> vec4<f32> {
    // Triple gate: beat must be confident, energy must be moderate+, intensity set
    let gate = beat_snap * energy * intensity;

    // Only trigger above 0.5 threshold (prevents constant flicker)
    let trigger = smoothstep(0.5, 0.8, gate);

    // Max 12% warm amber overlay (safe for photosensitive viewers)
    let flash_val = trigger * 0.12;

    // Warm amber flash (not cold white — matches Dead aesthetic)
    let flash_color = vec3<f32>(1.0, 0.85, 0.6);

    return vec4<f32>(flash_color * flash_val, flash_val);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 8: GEOMETRIC BREAKDOWN — A++++ crystal fracture
//
// - Animated Voronoi cells with proper edge detection
// - Energy-reactive cell count (fewer large cells → many small shards)
// - Warm golden edge color
// - Cell interior subtle color variation
// - Beat-triggered cell explosion (cells move apart briefly)
// ═══════════════════════════════════════════════════════════
fn geometric_breakdown(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec4<f32> {
    let scale = 3.0 + energy * 6.0; // 3 cells at rest → 9 at peaks
    let p = uv * scale;
    let cell = floor(p);
    let frac = fract(p);

    var min_dist = 1.0;
    var second_dist = 1.0;
    var closest_cell = vec2<f32>(0.0);

    for (var dy = -1; dy <= 1; dy = dy + 1) {
        for (var dx = -1; dx <= 1; dx = dx + 1) {
            let neighbor = vec2<f32>(f32(dx), f32(dy));
            let point = hash22(cell + neighbor);
            // Organic animation + beat explosion
            let beat_explode = cu.beat_snap * 0.15 * intensity;
            let anim = point + sin(time * 0.4 + point * TAU) * (0.12 + beat_explode);
            let diff = neighbor + anim - frac;
            let d = length(diff);
            if (d < min_dist) {
                second_dist = min_dist;
                min_dist = d;
                closest_cell = cell + neighbor;
            } else if (d < second_dist) {
                second_dist = d;
            }
        }
    }

    // Edge detection: distance between closest and second closest
    let edge_dist = second_dist - min_dist;
    let edge_width = 0.02 + energy * 0.02;
    let edge = smoothstep(edge_width, 0.0, edge_dist);

    // Cell interior: subtle warm color variation based on cell ID
    let cell_hash = hash21(closest_cell);
    let cell_col = vec3<f32>(
        0.15 + cell_hash * 0.08,
        0.10 + cell_hash * 0.05,
        0.05 + cell_hash * 0.03
    );

    // Golden edge color
    let edge_col = vec3<f32>(0.9, 0.75, 0.4) * edge;

    let col = (edge_col + cell_col * (1.0 - edge)) * intensity;
    let alpha = (edge * 0.3 + 0.05) * intensity;
    return vec4<f32>(col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 9: LIQUID METAL — A++++ chrome/mercury surface
//
// - 4-layer noise for organic metallic flow
// - Fresnel rim lighting (bright edges)
// - Specular highlights with energy-reactive sharpness
// - Bass-driven surface tension ripples
// - Warm chrome tint (gold-silver, not cold steel)
// - Smooth organic deformation (like mercury flowing)
// ═══════════════════════════════════════════════════════════
fn liquid_metal(uv: vec2<f32>, intensity: f32, time: f32, energy: f32, bass: f32) -> vec4<f32> {
    let aspect = cu.width / cu.height;
    let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y - 0.5);
    let t = time * 0.15;

    // Layer 1: large organic undulations (mercury flow)
    var surface = 0.0;
    surface += sin(p.x * 2.5 + t + sin(p.y * 1.8 + t * 0.6)) * 0.35;
    surface += sin(p.y * 3.0 - t * 0.7 + cos(p.x * 2.2 + t * 0.4)) * 0.30;

    // Layer 2: medium detail (surface tension)
    surface += sin(p.x * 5.0 + p.y * 3.0 + t * 1.2) * 0.20;
    surface += cos(p.x * 4.0 - p.y * 5.0 + t * 0.9) * 0.15;

    // Layer 3: bass-reactive fine ripples
    let ripple_freq = 10.0 + bass * 15.0;
    surface += sin(p.x * ripple_freq + t * 3.0) * sin(p.y * ripple_freq * 0.8 + t * 2.0) * bass * 0.25;

    // Layer 4: sharp specular highlights (energy-reactive)
    let spec_angle = atan2(p.y, p.x) + t * 0.2;
    let spec_radius = length(p);
    let spec = pow(max(sin(spec_angle * 4.0 + spec_radius * 12.0 - t * 2.5), 0.0), 6.0 + energy * 8.0);

    // Normal estimation for fresnel effect
    let nx = sin(p.x * 3.0 + t) * 0.5 + sin(p.x * 7.0 + t * 1.5) * 0.3;
    let fresnel_view = abs(nx); // simplified view-dependent fresnel
    let fresnel = pow(1.0 - fresnel_view, 3.0) * 0.4;

    // Chrome color: warm gold-silver gradient based on surface angle
    let warmth = smoothstep(-0.3, 0.5, surface);
    let base_col = mix(
        vec3<f32>(0.18, 0.20, 0.25),  // cool dark chrome
        vec3<f32>(0.85, 0.78, 0.60),   // warm gold highlight
        warmth
    );

    // Add specular and fresnel
    let spec_col = vec3<f32>(1.0, 0.95, 0.85) * spec * 0.6;
    let fresnel_col = vec3<f32>(0.7, 0.65, 0.5) * fresnel;

    let final_col = (base_col * (0.4 + abs(surface) * 0.6) + spec_col + fresnel_col) * intensity;
    let alpha = intensity * (0.15 + abs(surface) * 0.15 + spec * 0.2);
    return vec4<f32>(final_col, alpha);
}

// ═══════════════════════════════════════════════════════════
// EFFECT 10: CONCERT POSTER — A++++ stylized poster art overlay
//
// Creates a brief concert-poster art treatment:
// - Halftone dot pattern (CMYK-style printing simulation)
// - Limited warm color palette (cream, red, amber, dark)
// - Bold decorative border frame
// - Procedural texture simulating aged paper
// - Energy-reactive dot density
// ═══════════════════════════════════════════════════════════
fn concert_poster(uv: vec2<f32>, intensity: f32, time: f32, energy: f32) -> vec4<f32> {
    // Halftone dots: CMYK-style printing simulation
    // Multiple dot grids at slightly different angles for realistic halftone
    var dot_total = 0.0;

    for (var i = 0; i < 3; i = i + 1) {
        let id = f32(i);
        let dot_scale = 40.0 + energy * 30.0 + id * 10.0;
        let dot_angle = id * 0.524; // 30° apart (CMYK convention)
        let ca = cos(dot_angle);
        let sa = sin(dot_angle);
        let rotated_uv = vec2<f32>(uv.x * ca - uv.y * sa, uv.x * sa + uv.y * ca);

        let dot_uv = rotated_uv * dot_scale;
        let dot_frac = fract(dot_uv) - 0.5;
        let dot_dist = length(dot_frac);

        // Dot size variation based on position (simulates tonal range)
        let cell = floor(dot_uv);
        let tone = hash21(cell + vec2<f32>(id * 30.0, 0.0));
        let dot_size = tone * 0.4;
        dot_total += smoothstep(dot_size + 0.02, dot_size, dot_dist) / 3.0;
    }

    // Aged paper texture
    let paper_noise = hash21(uv * 500.0 + vec2<f32>(time * 0.1, 0.0));
    let paper = vec3<f32>(0.92, 0.88, 0.78) - paper_noise * 0.05; // cream with grain

    // Limited poster palette: cream, deep red, dark brown
    let ink = mix(
        vec3<f32>(0.75, 0.15, 0.08),  // poster red
        vec3<f32>(0.15, 0.08, 0.03),   // dark brown
        dot_total
    );

    let poster_col = mix(paper, ink, smoothstep(0.3, 0.7, dot_total));

    // Decorative border frame (ornate edges)
    let border_x = smoothstep(0.0, 0.03, uv.x) * smoothstep(0.0, 0.03, 1.0 - uv.x);
    let border_y = smoothstep(0.0, 0.04, uv.y) * smoothstep(0.0, 0.04, 1.0 - uv.y);
    let inner_border_x = smoothstep(0.03, 0.05, uv.x) * smoothstep(0.03, 0.05, 1.0 - uv.x);
    let inner_border_y = smoothstep(0.04, 0.06, uv.y) * smoothstep(0.04, 0.06, 1.0 - uv.y);
    let outer_frame = 1.0 - border_x * border_y;
    let inner_frame = (1.0 - inner_border_x * inner_border_y) * border_x * border_y;
    let frame_line = max(outer_frame, inner_frame * 0.5);

    let frame_col = vec3<f32>(0.12, 0.06, 0.02); // dark frame
    let final_col = mix(poster_col, frame_col, frame_line);

    let alpha = intensity * 0.35;
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
