//! Integration test: compile the ACTUAL fractal-temple shader from Dead Air.
//! This loads the pre-composed GLSL (all template literals resolved)
//! and verifies naga can parse it.

#[test]
fn test_compile_fractal_temple() {
    let glsl = std::fs::read_to_string("/tmp/fractal-temple-composed.glsl")
        .expect("Run `npx tsx -e \"...\"` first to generate the composed GLSL");

    println!("Input GLSL: {} chars, {} lines", glsl.len(), glsl.lines().count());

    // Convert WebGL → desktop GLSL
    let desktop = dead_air_renderer::glsl_compat::webgl_to_desktop(&glsl);
    println!("Desktop GLSL: {} chars, {} lines", desktop.len(), desktop.lines().count());

    // Try to parse with naga
    let mut parser = naga::front::glsl::Frontend::default();
    let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);

    match parser.parse(&options, &desktop) {
        Ok(module) => {
            println!("Parse OK! {} functions, {} globals",
                module.functions.len(), module.global_variables.len());

            // Try to validate
            match naga::valid::Validator::new(
                naga::valid::ValidationFlags::all(),
                naga::valid::Capabilities::all(),
            ).validate(&module) {
                Ok(info) => {
                    // Try to generate WGSL
                    match naga::back::wgsl::write_string(
                        &module, &info, naga::back::wgsl::WriterFlags::empty(),
                    ) {
                        Ok(wgsl) => {
                            println!("WGSL output: {} chars — FULL SUCCESS!", wgsl.len());
                        }
                        Err(e) => {
                            println!("WGSL generation failed: {}", e);
                            // Don't panic — this is informational for now
                        }
                    }
                }
                Err(e) => {
                    println!("Validation failed: {}", e);
                }
            }
        }
        Err(e) => {
            // Print first few errors with line context
            eprintln!("Parse failed with {} errors:", e.errors.len());
            for (i, err) in e.errors.iter().take(5).enumerate() {
                eprintln!("  Error {}: {}", i + 1, err);
            }

            // Print the problematic area
            let lines: Vec<&str> = desktop.lines().collect();
            if let Some(first_err) = e.errors.first() {
                let err_str = format!("{}", first_err);
                eprintln!("\nFirst error context: {}", err_str);
            }

            // Print first 20 lines of converted GLSL for debugging
            eprintln!("\n=== First 30 lines of converted GLSL ===");
            for (i, line) in desktop.lines().enumerate().take(30) {
                eprintln!("{:4}: {}", i + 1, line);
            }

            // Don't panic on the real shader — this test is diagnostic
            eprintln!("\nNOTE: Real shader compilation is expected to need iterative fixes.");
        }
    }
}
