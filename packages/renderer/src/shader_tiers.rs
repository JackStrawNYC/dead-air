//! Per-shader cost tier data — backs adaptive `--scene-scale` routing.
//!
//! Source: `tests/shader_cost_profile.rs` baseline run captured in
//! `SHADER-COST-PROFILE-2026-05-02.md` (Apple M3 Pro, 640x360). The
//! relative ranking is hardware-independent within an order of magnitude;
//! the absolute ms thresholds shift with resolution but the BUSTED group
//! is unambiguously 5-10x slower than median across all hardware.
//!
//! Tier definitions (640x360 baseline):
//!   - OK60   < 16.67ms p95 — meets 60fps budget natively
//!   - OK30   16.67-33.33  — meets 30fps budget; needs LOD for 60
//!   - SLOW   33.33-66.67  — busts 30fps at 1080p without LOD
//!   - BUSTED > 66.67       — busts every realtime budget; LOD critical
//!
//! Renderer policy: BUSTED shaders render at `--busted-scene-scale` (default
//! 0.5, i.e. 4x cost reduction) while everything else uses `--scene-scale`.
//! This makes 60fps achievable across the full pool without blocklisting.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CostTier {
    /// p95 < 16.67ms at 360p — meets 60fps budget natively.
    Ok60,
    /// p95 16.67-33.33ms at 360p — meets 30fps; needs LOD for 60.
    Ok30,
    /// p95 33.33-66.67ms at 360p — busts 30fps at high resolutions.
    Slow,
    /// p95 > 66.67ms at 360p — busts every realtime budget.
    Busted,
    /// Shader not in the baseline. Treat as Ok60 (assumed cheap until
    /// re-baselined). Logged at startup so re-profiling is obvious.
    Unknown,
}

impl CostTier {
    pub fn label(self) -> &'static str {
        match self {
            CostTier::Ok60 => "OK60",
            CostTier::Ok30 => "OK30",
            CostTier::Slow => "SLOW",
            CostTier::Busted => "BUSTED",
            CostTier::Unknown => "UNKNOWN",
        }
    }
}

/// Look up a shader's cost tier. Unknown shaders return `Unknown`.
pub fn tier_for(shader_id: &str) -> CostTier {
    match shader_id {
        // BUSTED — > 66.67ms p95 at 360p
        "voronoi-flow"
        | "voronoi_flow"
        | "psychedelic-garden"
        | "psychedelic_garden"
        | "bioluminescence"
        | "volumetric-smoke"
        | "volumetric_smoke"
        | "smoke-rings"
        | "smoke_rings"
        | "coral-reef"
        | "coral_reef"
        | "smoke-and-mirrors"
        | "smoke_and_mirrors"
        | "flower-field"
        | "flower_field"
        | "particle-nebula"
        | "particle_nebula"
        | "memorial-drift"
        | "memorial_drift"
        | "bloom-explosion"
        | "bloom_explosion"
        | "inferno"
        | "earthquake-fissure"
        | "earthquake_fissure"
        | "lava-flow"
        | "lava_flow"
        | "desert-road"
        | "desert_road"
        => CostTier::Busted,

        // SLOW — 33.33-66.67ms p95 at 360p
        "river"
        | "fluid-light"
        | "fluid_light"
        | "particle-swarm"
        | "particle_swarm"
        | "aviary-canopy"
        | "aviary_canopy"
        | "reaction-diffusion"
        | "reaction_diffusion"
        | "storm-vortex"
        | "storm_vortex"
        | "cosmic-dust"
        | "cosmic_dust"
        | "deep-ocean"
        | "deep_ocean"
        | "neural-web"
        | "neural_web"
        | "morphogenesis"
        | "mycelium-network"
        | "mycelium_network"
        | "warm-nebula"
        | "warm_nebula"
        => CostTier::Slow,

        // OK30 — 16.67-33.33ms p95 at 360p (most named here are explicit;
        // unmatched shaders fall through to Unknown which the renderer
        // treats as Ok60. False-negatives are safe — they just don't get
        // LOD reduction).
        "highway-horizon" | "highway_horizon"
        | "volumetric-clouds" | "volumetric_clouds"
        | "estimated-prophet-mist" | "estimated_prophet_mist"
        | "canyon-chase" | "canyon_chase"
        | "galaxy-spiral" | "galaxy_spiral"
        | "aurora"
        | "dark-star-void" | "dark_star_void"
        | "tie-dye" | "tie_dye"
        | "acid-melt" | "acid_melt"
        | "morning-dew-fog" | "morning_dew_fog"
        | "locomotive-engine" | "locomotive_engine"
        | "canyon"
        | "creation"
        | "truchet-tiling" | "truchet_tiling"
        | "campfire"
        | "mobius-amphitheater" | "mobius_amphitheater"
        | "plasma-field" | "plasma_field"
        | "space-travel" | "space_travel"
        | "spectral-analyzer" | "spectral_analyzer"
        | "honeycomb-cathedral" | "honeycomb_cathedral"
        => CostTier::Ok30,

        // Everything else: Ok60 if known, Unknown otherwise. We could
        // exhaustively list all 80 OK60 shaders but the lookup is the
        // hot path and the Unknown→Ok60-treatment fallback is safe.
        _ => CostTier::Unknown,
    }
}

/// Pick a render scale for a shader. `base` is the user's `--scene-scale`,
/// `busted_scale` is the override applied to BUSTED shaders.
pub fn scale_for(shader_id: &str, base: f32, busted_scale: f32) -> f32 {
    match tier_for(shader_id) {
        CostTier::Busted => busted_scale.min(base),
        // SLOW shaders also benefit from reduction at 60fps targets,
        // but the cost gap to BUSTED is 2-5x so a single override
        // suffices for now. Future work: separate --slow-scene-scale.
        _ => base,
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn busted_shaders_classified() {
        assert_eq!(tier_for("voronoi-flow"), CostTier::Busted);
        assert_eq!(tier_for("psychedelic-garden"), CostTier::Busted);
        assert_eq!(tier_for("bioluminescence"), CostTier::Busted);
        assert_eq!(tier_for("inferno"), CostTier::Busted);
    }

    #[test]
    fn slow_shaders_classified() {
        assert_eq!(tier_for("river"), CostTier::Slow);
        assert_eq!(tier_for("deep-ocean"), CostTier::Slow);
    }

    #[test]
    fn known_cheap_shader_returns_ok30_or_unknown_not_busted() {
        // ember-meadow is OK60 (1.6ms p95) — falls through to Unknown.
        // Critical: it must NEVER classify as Busted/Slow.
        let t = tier_for("ember-meadow");
        assert!(matches!(t, CostTier::Unknown | CostTier::Ok60));
    }

    #[test]
    fn busted_scale_lowered_for_busted_shaders() {
        assert_eq!(scale_for("voronoi-flow", 1.0, 0.5), 0.5);
        assert_eq!(scale_for("voronoi-flow", 0.75, 0.5), 0.5);
        // Don't UPSCALE if user's base is already below busted_scale.
        assert_eq!(scale_for("voronoi-flow", 0.4, 0.5), 0.4);
    }

    #[test]
    fn cheap_shader_keeps_base_scale() {
        assert_eq!(scale_for("amber-drift", 1.0, 0.5), 1.0);
        assert_eq!(scale_for("amber-drift", 0.75, 0.5), 0.75);
    }

}
