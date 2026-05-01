//! Cross-language compatibility test: load a msgpack file emitted by msgpackr (TS)
//! and assert it parses with rmp_serde (Rust) into the expected Manifest shape.
//!
//! Skips silently when the fixture file is not present so this test is safe in CI
//! without needing the TS toolchain.

use dead_air_renderer::manifest::load_manifest;
use std::path::Path;

#[test]
fn loads_tsx_emitted_msgpack() {
    let candidates = [
        "/tmp/test-intro.msgpack",
        "/tmp/veneta-full.msgpack",
        "test-intro.msgpack",
    ];
    let path = candidates.iter().map(Path::new).find(|p| p.exists());
    let Some(path) = path else {
        eprintln!("[cross_lang_msgpack] skipping: no fixture file present");
        return;
    };

    let m = load_manifest(path).expect("load msgpack manifest");
    assert!(!m.frames.is_empty(), "manifest has frames");
    assert!(!m.shaders.is_empty(), "manifest has shaders");
    let f0 = &m.frames[0];
    assert!(!f0.shader_id.is_empty(), "frame has shader_id");
    assert!(m.shaders.contains_key(&f0.shader_id), "frame shader exists in shaders map");
    eprintln!(
        "[cross_lang_msgpack] OK — {} frames, {} shaders, first shader={}",
        m.frames.len(),
        m.shaders.len(),
        f0.shader_id
    );
}
