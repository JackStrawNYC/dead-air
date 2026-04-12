//! Compositor — blends overlay layers onto shader output.
//!
//! Pipeline:
//!   1. Shader renders to RGBA pixel buffer (from gpu.rs)
//!   2. Overlay SVG strings are rasterized via resvg
//!   3. Per-pixel alpha compositing with blend mode support
//!
//! Blend modes (matching CSS mix-blend-mode):
//!   - Normal: standard alpha-over
//!   - Screen: 1 - (1-a)(1-b) — brightens, good for glows
//!   - SoftLight: photoshop soft light — subtle tinting
//!   - ColorDodge: brightens base by overlay — intense highlights
//!   - Multiply: a*b — darkens, good for shadows
//!   - Luminosity: overlay's luminance onto base color

use serde::Deserialize;

/// Blend mode for overlay compositing.
#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BlendMode {
    #[default]
    Screen,
    Normal,
    SoftLight,
    ColorDodge,
    Multiply,
    Luminosity,
    Overlay,
}

/// A single overlay layer to composite onto the shader output.
#[derive(Debug, Deserialize)]
pub struct OverlayLayer {
    /// SVG string (from react-dom/server rendering)
    pub svg: String,
    /// Opacity (0.0 - 1.0)
    pub opacity: f32,
    /// Blend mode
    #[serde(default)]
    pub blend_mode: BlendMode,
    /// Z-order (lower = behind, higher = in front)
    pub z_order: u32,
}

/// Rasterize an SVG string to an RGBA pixel buffer.
pub fn rasterize_svg(svg_str: &str, width: u32, height: u32) -> Option<Vec<u8>> {
    let options = usvg::Options::default();
    let tree = usvg::Tree::from_str(svg_str, &options).ok()?;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)?;

    // Scale SVG to fit target dimensions
    let svg_size = tree.size();
    let scale_x = width as f32 / svg_size.width();
    let scale_y = height as f32 / svg_size.height();
    let transform = resvg::tiny_skia::Transform::from_scale(scale_x, scale_y);

    resvg::render(&tree, transform, &mut pixmap.as_mut());

    // Convert from premultiplied alpha to straight alpha
    let mut pixels = pixmap.take();
    for chunk in pixels.chunks_exact_mut(4) {
        let a = chunk[3] as f32 / 255.0;
        if a > 0.001 {
            chunk[0] = (chunk[0] as f32 / a).min(255.0) as u8;
            chunk[1] = (chunk[1] as f32 / a).min(255.0) as u8;
            chunk[2] = (chunk[2] as f32 / a).min(255.0) as u8;
        }
    }

    Some(pixels)
}

/// Composite overlay pixels onto base (shader) pixels using the specified blend mode.
/// Both buffers must be width*height*4 bytes (RGBA8).
/// Modifies `base` in place.
pub fn composite(
    base: &mut [u8],
    overlay: &[u8],
    opacity: f32,
    blend_mode: BlendMode,
) {
    assert_eq!(base.len(), overlay.len(), "Base and overlay must be same size");

    for i in (0..base.len()).step_by(4) {
        let oa = overlay[i + 3] as f32 / 255.0 * opacity;
        if oa < 0.001 {
            continue; // Fully transparent overlay pixel — skip
        }

        // Normalize to 0-1 range
        let br = base[i] as f32 / 255.0;
        let bg = base[i + 1] as f32 / 255.0;
        let bb = base[i + 2] as f32 / 255.0;

        let or = overlay[i] as f32 / 255.0;
        let og = overlay[i + 1] as f32 / 255.0;
        let ob = overlay[i + 2] as f32 / 255.0;

        // Apply blend mode
        let (rr, rg, rb) = match blend_mode {
            BlendMode::Normal => (or, og, ob),

            BlendMode::Screen => (
                1.0 - (1.0 - br) * (1.0 - or),
                1.0 - (1.0 - bg) * (1.0 - og),
                1.0 - (1.0 - bb) * (1.0 - ob),
            ),

            BlendMode::Multiply => (br * or, bg * og, bb * ob),

            BlendMode::SoftLight => (
                soft_light(br, or),
                soft_light(bg, og),
                soft_light(bb, ob),
            ),

            BlendMode::ColorDodge => (
                color_dodge(br, or),
                color_dodge(bg, og),
                color_dodge(bb, ob),
            ),

            BlendMode::Overlay => (
                overlay_blend(br, or),
                overlay_blend(bg, og),
                overlay_blend(bb, ob),
            ),

            BlendMode::Luminosity => {
                let base_lum = 0.299 * br + 0.587 * bg + 0.114 * bb;
                let overlay_lum = 0.299 * or + 0.587 * og + 0.114 * ob;
                let ratio = if base_lum > 0.001 { overlay_lum / base_lum } else { 1.0 };
                (
                    (br * ratio).min(1.0),
                    (bg * ratio).min(1.0),
                    (bb * ratio).min(1.0),
                )
            }
        };

        // Alpha blend: lerp between base and blended result
        base[i] = ((br + (rr - br) * oa) * 255.0).clamp(0.0, 255.0) as u8;
        base[i + 1] = ((bg + (rg - bg) * oa) * 255.0).clamp(0.0, 255.0) as u8;
        base[i + 2] = ((bb + (rb - bb) * oa) * 255.0).clamp(0.0, 255.0) as u8;
        // Keep base alpha
    }
}

/// Composite multiple overlay layers (sorted by z_order) onto a base image.
pub fn composite_layers(
    base: &mut [u8],
    layers: &[OverlayLayer],
    width: u32,
    height: u32,
) {
    // Sort by z_order
    let mut sorted: Vec<&OverlayLayer> = layers.iter().collect();
    sorted.sort_by_key(|l| l.z_order);

    for layer in sorted {
        if layer.opacity < 0.01 {
            continue;
        }

        if let Some(overlay_pixels) = rasterize_svg(&layer.svg, width, height) {
            composite(base, &overlay_pixels, layer.opacity, layer.blend_mode);
        } else {
            log::warn!("Failed to rasterize overlay SVG ({} bytes)", layer.svg.len());
        }
    }
}

// ─── Blend mode math ───

fn soft_light(base: f32, blend: f32) -> f32 {
    if blend <= 0.5 {
        base - (1.0 - 2.0 * blend) * base * (1.0 - base)
    } else {
        let d = if base <= 0.25 {
            ((16.0 * base - 12.0) * base + 4.0) * base
        } else {
            base.sqrt()
        };
        base + (2.0 * blend - 1.0) * (d - base)
    }
}

fn color_dodge(base: f32, blend: f32) -> f32 {
    if blend >= 0.999 {
        1.0
    } else {
        (base / (1.0 - blend)).min(1.0)
    }
}

fn overlay_blend(base: f32, blend: f32) -> f32 {
    if base <= 0.5 {
        2.0 * base * blend
    } else {
        1.0 - 2.0 * (1.0 - base) * (1.0 - blend)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_screen_blend() {
        let mut base = vec![128, 64, 32, 255]; // dark warm pixel
        let overlay = vec![100, 100, 200, 255]; // blue-ish
        composite(&mut base, &overlay, 0.5, BlendMode::Screen);
        // Screen brightens — all channels should increase
        assert!(base[0] > 128, "R should brighten: got {}", base[0]);
        assert!(base[1] > 64, "G should brighten: got {}", base[1]);
        assert!(base[2] > 32, "B should brighten: got {}", base[2]);
    }

    #[test]
    fn test_zero_opacity_noop() {
        let original = vec![100, 150, 200, 255];
        let mut base = original.clone();
        let overlay = vec![255, 0, 0, 255];
        composite(&mut base, &overlay, 0.0, BlendMode::Normal);
        assert_eq!(base, original);
    }

    #[test]
    fn test_rasterize_simple_svg() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <circle cx="50" cy="50" r="40" fill="red"/>
        </svg>"#;
        let pixels = rasterize_svg(svg, 100, 100).expect("SVG rasterization failed");
        assert_eq!(pixels.len(), 100 * 100 * 4);
        // Center pixel should be red
        let center = (50 * 100 + 50) * 4;
        assert!(pixels[center] > 200, "Center R should be red: {}", pixels[center]);
        assert!(pixels[center + 3] > 200, "Center should be opaque: {}", pixels[center + 3]);
    }
}
