//! Transition blending — crossfade between two shader renders.
//!
//! When the manifest specifies a secondary_shader_id + blend_progress,
//! both shaders are rendered and blended per-pixel.
//!
//! Blend modes for transitions:
//!   - dissolve: linear opacity crossfade (default)
//!   - additive: both contribute light (glow effect)
//!   - luminance_key: bright areas of incoming punch through first

use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TransitionBlendMode {
    #[default]
    Dissolve,
    Additive,
    LuminanceKey,
}

/// Blend two rendered frames for a transition.
/// `progress` is 0.0 (fully `from`) to 1.0 (fully `to`).
pub fn blend_transition(
    from_pixels: &[u8],
    to_pixels: &[u8],
    progress: f32,
    mode: TransitionBlendMode,
) -> Vec<u8> {
    assert_eq!(from_pixels.len(), to_pixels.len());
    let mut output = vec![0u8; from_pixels.len()];
    let p = progress.clamp(0.0, 1.0);

    for i in (0..from_pixels.len()).step_by(4) {
        let fr = from_pixels[i] as f32 / 255.0;
        let fg = from_pixels[i + 1] as f32 / 255.0;
        let fb = from_pixels[i + 2] as f32 / 255.0;

        let tr = to_pixels[i] as f32 / 255.0;
        let tg = to_pixels[i + 1] as f32 / 255.0;
        let tb = to_pixels[i + 2] as f32 / 255.0;

        let (rr, rg, rb) = match mode {
            TransitionBlendMode::Dissolve => {
                // Simple linear crossfade
                (
                    fr * (1.0 - p) + tr * p,
                    fg * (1.0 - p) + tg * p,
                    fb * (1.0 - p) + tb * p,
                )
            }

            TransitionBlendMode::Additive => {
                // Both contribute light — incoming adds on top
                let cap = 1.5; // Allow slight HDR
                (
                    (fr + tr * p).min(cap),
                    (fg + tg * p).min(cap),
                    (fb + tb * p).min(cap),
                )
            }

            TransitionBlendMode::LuminanceKey => {
                // Bright areas of incoming punch through first
                let to_lum = 0.299 * tr + 0.587 * tg + 0.114 * tb;
                // Effective blend: brighter incoming pixels transition earlier
                let effective_p = (p * 2.0 * to_lum).clamp(0.0, 1.0);
                (
                    fr * (1.0 - effective_p) + tr * effective_p,
                    fg * (1.0 - effective_p) + tg * effective_p,
                    fb * (1.0 - effective_p) + tb * effective_p,
                )
            }
        };

        output[i] = (rr * 255.0).clamp(0.0, 255.0) as u8;
        output[i + 1] = (rg * 255.0).clamp(0.0, 255.0) as u8;
        output[i + 2] = (rb * 255.0).clamp(0.0, 255.0) as u8;
        output[i + 3] = 255; // Full opacity
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dissolve_midpoint() {
        let from = vec![200, 100, 0, 255];
        let to = vec![0, 100, 200, 255];
        let result = blend_transition(&from, &to, 0.5, TransitionBlendMode::Dissolve);
        assert_eq!(result[0], 100); // R: (200+0)/2
        assert_eq!(result[1], 100); // G: (100+100)/2
        assert_eq!(result[2], 100); // B: (0+200)/2
    }

    #[test]
    fn test_dissolve_endpoints() {
        let from = vec![255, 0, 0, 255];
        let to = vec![0, 0, 255, 255];
        // progress=0 → fully from
        let r0 = blend_transition(&from, &to, 0.0, TransitionBlendMode::Dissolve);
        assert_eq!(r0[0], 255);
        assert_eq!(r0[2], 0);
        // progress=1 → fully to
        let r1 = blend_transition(&from, &to, 1.0, TransitionBlendMode::Dissolve);
        assert_eq!(r1[0], 0);
        assert_eq!(r1[2], 255);
    }

    #[test]
    fn test_additive_brightens() {
        let from = vec![128, 128, 128, 255];
        let to = vec![128, 128, 128, 255];
        let result = blend_transition(&from, &to, 1.0, TransitionBlendMode::Additive);
        // Additive: 128+128 = 256, clamped to 255
        assert!(result[0] > 200, "Additive should brighten: {}", result[0]);
    }
}
