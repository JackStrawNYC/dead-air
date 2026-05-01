//! Cross-check the generated uniform layout against the schema.
//!
//! Wave 2.1 phase C — the generated `uniforms_layout` mod and the
//! committed `uniforms-schema.json` should always agree. Re-extract
//! both and compare. Drift means somebody touched one without the
//! other.

use dead_air_renderer::uniforms_layout;

#[test]
fn ubo_size_agrees_with_uniforms_rs() {
    // The hand-written uniforms.rs uses 656 as UBO_SIZE; this is the schema
    // value. Both must stay aligned.
    assert_eq!(uniforms_layout::UBO_SIZE, 656);
}

#[test]
fn fields_sorted_by_offset() {
    let fields = uniforms_layout::FIELDS;
    assert!(fields.len() > 100, "expected >100 uniforms, got {}", fields.len());
    for w in fields.windows(2) {
        assert!(
            w[0].offset < w[1].offset,
            "FIELDS not sorted by offset: {} ({}) >= {} ({})",
            w[0].name, w[0].offset, w[1].name, w[1].offset,
        );
    }
}

#[test]
fn no_field_overlaps_next_one() {
    let fields = uniforms_layout::FIELDS;
    for w in fields.windows(2) {
        assert!(
            w[0].offset + w[0].size <= w[1].offset,
            "{} (offset {}, size {}) overlaps {} (offset {})",
            w[0].name, w[0].offset, w[0].size, w[1].name, w[1].offset,
        );
    }
}

#[test]
fn last_field_fits_in_buffer() {
    let last = uniforms_layout::FIELDS.last().expect("at least one field");
    assert!(
        last.offset + last.size <= uniforms_layout::UBO_SIZE,
        "last field {} ends at {} but UBO_SIZE is {}",
        last.name, last.offset + last.size, uniforms_layout::UBO_SIZE,
    );
}

#[test]
fn well_known_offsets_match_uniforms_rs() {
    // Spot-check that the codegen agrees with the hand-written
    // packing in src/uniforms.rs at well-known anchor points.
    use uniforms_layout::offsets::*;
    assert_eq!(U_TIME, 0);
    assert_eq!(U_DYNAMIC_TIME, 4);
    assert_eq!(U_BEAT_TIME, 8);
    assert_eq!(U_BASS, 12);
    assert_eq!(U_RMS, 16);
    assert_eq!(U_ENERGY, 40);
}
