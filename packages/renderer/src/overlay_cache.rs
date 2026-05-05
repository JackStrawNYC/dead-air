//! Overlay cache — loads pre-rendered overlay PNGs and applies per-frame transforms.
//!
//! Two-tier system:
//!   1. STATIC overlays: pre-rendered once as RGBA PNG, per-frame transform (scale, rotate, opacity)
//!   2. ANIMATED overlays: keyframe SVGs at reduced fps (10-15fps), interpolated in Rust
//!
//! Cache stores decoded RGBA pixel buffers keyed by overlay ID.
//! Transform pipeline: load → scale → rotate → translate → alpha composite.

use std::collections::HashMap;
use std::path::Path;
use serde::{Deserialize, Serialize};

/// Pre-rendered overlay image (cached RGBA pixels at render resolution).
#[derive(Clone)]
pub struct CachedOverlay {
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Per-frame transform parameters for an overlay.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayTransform {
    pub opacity: f32,
    pub scale: f32,
    pub rotation_deg: f32,
    /// Offset from center as fraction of frame (0 = centered, -0.5 = left edge)
    pub offset_x: f32,
    pub offset_y: f32,
}

impl Default for OverlayTransform {
    fn default() -> Self {
        Self {
            opacity: 1.0,
            scale: 1.0,
            rotation_deg: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }
}

/// Keyframe for animated overlays — an SVG rendered at a specific frame.
#[derive(Debug, Serialize, Deserialize)]
pub struct OverlayKeyframe {
    pub frame: u32,
    pub svg: String,
}

/// Overlay instance in the per-frame schedule.
#[derive(Debug, Serialize, Deserialize)]
pub struct OverlayInstance {
    pub overlay_id: String,
    pub transform: OverlayTransform,
    #[serde(default)]
    pub blend_mode: crate::compositor::BlendMode,
    /// If set, this is an animated keyframe SVG (overrides cached PNG)
    pub keyframe_svg: Option<String>,
}

/// Cache of pre-rendered overlay images.
pub struct OverlayImageCache {
    cache: HashMap<String, CachedOverlay>,
}

impl OverlayImageCache {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    /// Load a pre-rendered overlay image from disk (supports PNG, JPEG, etc.).
    pub fn load_png(&mut self, overlay_id: &str, path: &Path) -> Result<(), String> {
        // Use content-based format detection (not file extension) because
        // some overlay files are JPEG with .png extension.
        let reader = image::io::Reader::open(path)
            .map_err(|e| format!("Failed to open {}: {}", path.display(), e))?
            .with_guessed_format()
            .map_err(|e| format!("Failed to detect format {}: {}", path.display(), e))?;
        let img = reader.decode()
            .map_err(|e| format!("Failed to decode {}: {}", path.display(), e))?
            .to_rgba8();
        let width = img.width();
        let height = img.height();
        let pixels = img.into_raw();

        self.cache.insert(
            overlay_id.to_string(),
            CachedOverlay {
                pixels,
                width,
                height,
            },
        );

        Ok(())
    }

    /// Load all PNG files from a directory. Filename (minus .png) becomes overlay_id.
    pub fn load_directory(&mut self, dir: &Path) -> Result<usize, String> {
        let entries = std::fs::read_dir(dir)
            .map_err(|e| format!("Can't read {}: {}", dir.display(), e))?;

        let mut count = 0;
        for entry in entries {
            let entry = entry.map_err(|e| format!("{}", e))?;
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "png") {
                let id = path
                    .file_stem()
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                self.load_png(&id, &path)?;
                count += 1;
            }
        }

        Ok(count)
    }

    /// Get a cached overlay by ID.
    pub fn get(&self, overlay_id: &str) -> Option<&CachedOverlay> {
        self.cache.get(overlay_id)
    }

    /// True if an overlay is loaded.
    pub fn contains(&self, overlay_id: &str) -> bool {
        self.cache.contains_key(overlay_id)
    }

    /// Borrow the underlying cache map (for batch operations like atlas
    /// packing — see `overlay_atlas::build_atlas`).
    pub fn entries(&self) -> &HashMap<String, CachedOverlay> {
        &self.cache
    }

    /// Loaded overlay count.
    pub fn len(&self) -> usize {
        self.cache.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }

    /// Pre-flight validation: scan a schedule, report which referenced overlays
    /// are missing from the cache. Each missing overlay would otherwise render as
    /// nothing — silently. Call this once at startup before the render loop.
    ///
    /// Returns (missing_overlay_ids, frame_instance_count_affected).
    pub fn validate_schedule(
        &self,
        schedule: &[Vec<OverlayInstance>],
    ) -> ValidationReport {
        let mut missing: HashMap<String, usize> = HashMap::new();
        let mut total_referenced = 0usize;
        let mut keyframe_count = 0usize;
        for frame in schedule {
            for inst in frame {
                if inst.keyframe_svg.is_some() {
                    keyframe_count += 1;
                    continue; // SVG keyframes don't need PNG cache
                }
                total_referenced += 1;
                if !self.cache.contains_key(&inst.overlay_id) {
                    *missing.entry(inst.overlay_id.clone()).or_insert(0) += 1;
                }
            }
        }
        let mut missing_vec: Vec<(String, usize)> = missing.into_iter().collect();
        missing_vec.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        let affected_instances: usize = missing_vec.iter().map(|(_, n)| *n).sum();
        ValidationReport {
            missing: missing_vec,
            total_instances: total_referenced,
            keyframe_instances: keyframe_count,
            affected_instances,
            cache_size: self.cache.len(),
        }
    }

    /// Render an overlay instance onto a target pixel buffer.
    /// Handles: scaling, rotation, translation, opacity, blend mode.
    pub fn composite_instance(
        &self,
        target: &mut [u8],
        target_width: u32,
        target_height: u32,
        instance: &OverlayInstance,
    ) {
        if instance.transform.opacity < 0.01 {
            return;
        }

        // Get source pixels — either from cache or from keyframe SVG
        let source_pixels: Vec<u8>;
        let src_w: u32;
        let src_h: u32;

        if let Some(ref svg) = instance.keyframe_svg {
            // Animated overlay: rasterize keyframe SVG
            if let Some(pixels) =
                crate::compositor::rasterize_svg(svg, target_width, target_height)
            {
                source_pixels = pixels;
                src_w = target_width;
                src_h = target_height;
            } else {
                return;
            }
        } else if let Some(cached) = self.cache.get(&instance.overlay_id) {
            source_pixels = cached.pixels.clone(); // TODO: avoid clone with lifetime work
            src_w = cached.width;
            src_h = cached.height;
        } else {
            return;
        }

        // Apply transform and composite
        composite_transformed(
            target,
            target_width,
            target_height,
            &source_pixels,
            src_w,
            src_h,
            &instance.transform,
            instance.blend_mode,
        );
    }
}

/// Pre-flight overlay validation result.
#[derive(Debug)]
pub struct ValidationReport {
    /// (overlay_id, frames_referenced). Sorted by frequency desc then id asc.
    pub missing: Vec<(String, usize)>,
    /// Total instances in schedule that needed a PNG (excludes keyframe SVGs).
    pub total_instances: usize,
    /// Animated keyframe SVG instances (don't need PNG cache).
    pub keyframe_instances: usize,
    /// Sum of frame-instances that will silently render as nothing.
    pub affected_instances: usize,
    /// Number of overlays loaded into cache.
    pub cache_size: usize,
}

impl ValidationReport {
    pub fn ok(&self) -> bool {
        self.missing.is_empty()
    }

    /// Human-readable report. Always logs a summary; on missing, dumps top offenders.
    pub fn print(&self) {
        if self.ok() {
            println!(
                "Overlays: validation OK — {} loaded, {} schedule instances + {} keyframe SVGs",
                self.cache_size, self.total_instances, self.keyframe_instances
            );
            return;
        }
        eprintln!(
            "Overlays: VALIDATION FAILED — {} unique overlays missing, {} frame-instances will render blank",
            self.missing.len(),
            self.affected_instances
        );
        eprintln!(
            "Overlays: cache_size={}, total_referenced={}, keyframes={}",
            self.cache_size, self.total_instances, self.keyframe_instances
        );
        // Print all missing overlays so a fix-list can be derived from the
        // log directly (was capped at 20 + "+N more"). 50-100 lines of text
        // is fine; truncating obscures which PNGs need to be generated.
        for (id, count) in &self.missing {
            eprintln!("  MISSING: {} ({} frames)", id, count);
        }
    }
}

/// Composite a source image onto target with transform (scale, rotate, translate, opacity).
/// Uses nearest-neighbor sampling for speed. Bilinear would be higher quality but
/// at 4K the difference is minimal.
fn composite_transformed(
    target: &mut [u8],
    tw: u32,
    th: u32,
    source: &[u8],
    sw: u32,
    sh: u32,
    transform: &OverlayTransform,
    blend_mode: crate::compositor::BlendMode,
) {
    let opacity = transform.opacity;
    let scale = transform.scale;
    let rot_rad = transform.rotation_deg * std::f32::consts::PI / 180.0;
    let cos_r = rot_rad.cos();
    let sin_r = rot_rad.sin();

    // Center of target + offset
    let cx = tw as f32 * (0.5 + transform.offset_x);
    let cy = th as f32 * (0.5 + transform.offset_y);

    // Center of source
    let scx = sw as f32 * 0.5;
    let scy = sh as f32 * 0.5;

    // Scale semantics: scale=1.0 means overlay fills the frame (source maps 1:1 to target).
    // scale=0.5 means overlay is 50% of frame size (source is shrunk to half).
    // Since overlay PNGs are rasterized at full render resolution, we need to
    // map target pixels to source pixels: smaller scale = more source pixels per target pixel.
    // inv_scale > 1 shrinks the overlay, inv_scale < 1 enlarges it.
    let inv_scale = 1.0 / scale.max(0.01);

    // For each target pixel, find corresponding source pixel
    for ty in 0..th {
        for tx in 0..tw {
            // Vector from target center
            let dx = tx as f32 - cx;
            let dy = ty as f32 - cy;

            // Inverse rotate + scale to find source coordinate
            let sx_f = (dx * cos_r + dy * sin_r) * inv_scale + scx;
            let sy_f = (-dx * sin_r + dy * cos_r) * inv_scale + scy;

            // Bounds check
            let sx = sx_f as i32;
            let sy = sy_f as i32;
            if sx < 0 || sx >= sw as i32 || sy < 0 || sy >= sh as i32 {
                continue;
            }

            let si = (sy as usize * sw as usize + sx as usize) * 4;
            let ti = (ty as usize * tw as usize + tx as usize) * 4;

            if si + 3 >= source.len() || ti + 3 >= target.len() {
                continue;
            }

            let sa = source[si + 3] as f32 / 255.0 * opacity;
            if sa < 0.005 {
                continue;
            }

            let sr = source[si] as f32 / 255.0;
            let sg = source[si + 1] as f32 / 255.0;
            let sb = source[si + 2] as f32 / 255.0;

            // Skip dark pixels: overlay PNGs have 100% opaque dark backgrounds.
            // Aggressively skip anything below 12% luminance — only render the
            // actual bright icon content, not the dark surround.
            let luma = sr * 0.2126 + sg * 0.7152 + sb * 0.0722;
            if luma < 0.12 {
                continue;
            }

            let tr = target[ti] as f32 / 255.0;
            let tg = target[ti + 1] as f32 / 255.0;
            let tb = target[ti + 2] as f32 / 255.0;

            // Apply blend mode
            let (br, bg, bb) = match blend_mode {
                crate::compositor::BlendMode::Screen => (
                    1.0 - (1.0 - tr) * (1.0 - sr),
                    1.0 - (1.0 - tg) * (1.0 - sg),
                    1.0 - (1.0 - tb) * (1.0 - sb),
                ),
                crate::compositor::BlendMode::Normal => (sr, sg, sb),
                crate::compositor::BlendMode::Multiply => (tr * sr, tg * sg, tb * sb),
                _ => {
                    // Fallback to screen for other modes
                    (
                        1.0 - (1.0 - tr) * (1.0 - sr),
                        1.0 - (1.0 - tg) * (1.0 - sg),
                        1.0 - (1.0 - tb) * (1.0 - sb),
                    )
                }
            };

            // Alpha composite
            target[ti] = ((tr + (br - tr) * sa) * 255.0).clamp(0.0, 255.0) as u8;
            target[ti + 1] = ((tg + (bg - tg) * sa) * 255.0).clamp(0.0, 255.0) as u8;
            target[ti + 2] = ((tb + (bb - tb) * sa) * 255.0).clamp(0.0, 255.0) as u8;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_transform() {
        let t = OverlayTransform::default();
        assert_eq!(t.opacity, 1.0);
        assert_eq!(t.scale, 1.0);
        assert_eq!(t.rotation_deg, 0.0);
    }

    fn instance(id: &str) -> OverlayInstance {
        OverlayInstance {
            overlay_id: id.to_string(),
            transform: OverlayTransform::default(),
            blend_mode: crate::compositor::BlendMode::Normal,
            keyframe_svg: None,
        }
    }

    #[test]
    fn validate_schedule_finds_missing() {
        let mut cache = OverlayImageCache::new();
        cache.cache.insert(
            "loaded".to_string(),
            CachedOverlay { pixels: vec![0; 16], width: 2, height: 2 },
        );
        let schedule = vec![
            vec![instance("loaded"), instance("missing_a")],
            vec![instance("missing_a"), instance("missing_b")],
            vec![instance("loaded")],
        ];
        let report = cache.validate_schedule(&schedule);
        assert!(!report.ok());
        assert_eq!(report.missing.len(), 2);
        // missing_a referenced 2x, missing_b 1x — sorted by freq desc
        assert_eq!(report.missing[0].0, "missing_a");
        assert_eq!(report.missing[0].1, 2);
        assert_eq!(report.missing[1].0, "missing_b");
        assert_eq!(report.affected_instances, 3);
        assert_eq!(report.total_instances, 5);
    }

    #[test]
    fn validate_schedule_passes_when_all_loaded() {
        let mut cache = OverlayImageCache::new();
        cache.cache.insert(
            "a".to_string(),
            CachedOverlay { pixels: vec![0; 16], width: 2, height: 2 },
        );
        let schedule = vec![vec![instance("a"), instance("a")]];
        let report = cache.validate_schedule(&schedule);
        assert!(report.ok());
        assert_eq!(report.affected_instances, 0);
        assert_eq!(report.total_instances, 2);
    }

    #[test]
    fn validate_schedule_skips_keyframe_svgs() {
        let cache = OverlayImageCache::new();
        let mut svg_inst = instance("doesnt_matter");
        svg_inst.keyframe_svg = Some("<svg/>".to_string());
        let schedule = vec![vec![svg_inst]];
        let report = cache.validate_schedule(&schedule);
        assert!(report.ok());
        assert_eq!(report.keyframe_instances, 1);
        assert_eq!(report.total_instances, 0);
    }

    #[test]
    fn test_composite_centered() {
        let tw = 100u32;
        let th = 100u32;
        let mut target = vec![0u8; (tw * th * 4) as usize];
        // 10x10 red square overlay
        let sw = 10u32;
        let sh = 10u32;
        let source: Vec<u8> = (0..sw * sh)
            .flat_map(|_| vec![255, 0, 0, 200]) // red, mostly opaque
            .collect();

        let transform = OverlayTransform {
            opacity: 0.8,
            scale: 1.0,
            rotation_deg: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
        };

        composite_transformed(
            &mut target, tw, th,
            &source, sw, sh,
            &transform,
            crate::compositor::BlendMode::Normal,
        );

        // Center pixel should have red contribution
        let center = ((50 * tw + 50) * 4) as usize;
        assert!(target[center] > 100, "Center R should be red: {}", target[center]);
    }
}
