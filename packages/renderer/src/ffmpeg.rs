//! FFmpeg pipe — streams raw RGBA pixels directly to FFmpeg for video encoding.
//!
//! Instead of saving individual PNGs (slow: PNG compression + disk I/O per frame),
//! pipe raw pixel data to FFmpeg via stdin. FFmpeg handles encoding to H.264/H.265.
//!
//! Usage:
//!   let mut pipe = FfmpegPipe::new(3840, 2160, 60, "output.mp4")?;
//!   for frame in frames {
//!       pipe.write_frame(&pixels)?;
//!   }
//!   pipe.finish()?;

use std::io::Write;
use std::process::{Child, Command, Stdio};

pub struct FfmpegPipe {
    child: Child,
    width: u32,
    height: u32,
    frames_written: u64,
}

impl FfmpegPipe {
    /// Start an FFmpeg process that accepts raw RGBA frames on stdin.
    pub fn new(
        width: u32,
        height: u32,
        fps: u32,
        output_path: &str,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        Self::new_with_codec(width, height, fps, output_path, "libx264", "slow", 18)
    }

    /// Start FFmpeg with specific codec settings.
    pub fn new_with_codec(
        width: u32,
        height: u32,
        fps: u32,
        output_path: &str,
        codec: &str,
        preset: &str,
        crf: u32,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let child = Command::new("ffmpeg")
            .args([
                "-y",                           // Overwrite output
                "-f", "rawvideo",               // Input format: raw pixels
                "-pix_fmt", "rgba",             // Input pixel format
                "-s", &format!("{}x{}", width, height), // Input size
                "-r", &format!("{}", fps),      // Input framerate
                "-i", "pipe:0",                 // Read from stdin
                "-c:v", codec,                  // Video codec
                "-preset", preset,              // Encoding speed/quality tradeoff
                "-crf", &format!("{}", crf),    // Quality (lower = better, 18 ≈ visually lossless)
                "-pix_fmt", "yuv420p",          // Output pixel format (compatibility)
                "-movflags", "+faststart",      // Web-friendly MP4
                "-an",                          // No audio (added separately)
                output_path,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()?;

        Ok(Self {
            child,
            width,
            height,
            frames_written: 0,
        })
    }

    /// Write one frame of raw RGBA pixels to FFmpeg.
    /// `pixels` must be exactly width * height * 4 bytes.
    pub fn write_frame(&mut self, pixels: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
        let expected = self.width as usize * self.height as usize * 4;
        if pixels.len() != expected {
            return Err(format!(
                "Frame size mismatch: got {} bytes, expected {}",
                pixels.len(),
                expected
            )
            .into());
        }

        let stdin = self
            .child
            .stdin
            .as_mut()
            .ok_or("FFmpeg stdin not available")?;
        stdin.write_all(pixels)?;
        self.frames_written += 1;

        Ok(())
    }

    /// Close the pipe and wait for FFmpeg to finish encoding.
    /// Returns the total number of frames written.
    pub fn finish(mut self) -> Result<u64, Box<dyn std::error::Error>> {
        // Close stdin to signal EOF
        drop(self.child.stdin.take());

        let output = self.child.wait_with_output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Only show last few lines of FFmpeg output
            let last_lines: Vec<&str> = stderr.lines().rev().take(5).collect();
            return Err(format!(
                "FFmpeg exited with {}: {}",
                output.status,
                last_lines.into_iter().rev().collect::<Vec<_>>().join("\n")
            )
            .into());
        }

        Ok(self.frames_written)
    }

    /// Number of frames written so far.
    pub fn frames_written(&self) -> u64 {
        self.frames_written
    }
}
