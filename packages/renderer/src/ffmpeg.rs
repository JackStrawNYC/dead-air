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

use std::io::{BufWriter, Write};
use std::process::{Child, Command, Stdio};

pub struct FfmpegPipe {
    child: Child,
    writer: Option<BufWriter<std::process::ChildStdin>>,
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
        // Use NVENC if FFMPEG_CODEC=h264_nvenc, otherwise libx264 ultrafast
        let codec = std::env::var("FFMPEG_CODEC").unwrap_or_else(|_| "libx264".to_string());
        let preset = std::env::var("FFMPEG_PRESET").unwrap_or_else(|_| "medium".to_string());
        Self::new_with_codec(width, height, fps, output_path, &codec, &preset, 18)
    }

    /// Start FFmpeg with specific codec settings.
    /// For NVENC: codec="h264_nvenc", preset="p4" (balanced), crf maps to -cq.
    /// For libx264: codec="libx264", preset="fast"/"slow", crf is CRF value.
    pub fn new_with_codec(
        width: u32,
        height: u32,
        fps: u32,
        output_path: &str,
        codec: &str,
        preset: &str,
        crf: u32,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let is_nvenc = codec.contains("nvenc");
        let mut args = vec![
            "-y".to_string(),
            "-f".to_string(), "rawvideo".to_string(),
            "-pix_fmt".to_string(), "rgba".to_string(),
            "-s".to_string(), format!("{}x{}", width, height),
            "-r".to_string(), format!("{}", fps),
            "-i".to_string(), "pipe:0".to_string(),
            "-c:v".to_string(), codec.to_string(),
            "-preset".to_string(), preset.to_string(),
        ];
        if is_nvenc {
            // NVENC: constant quality mode, -cq for quality (lower = better)
            args.extend(["-rc".to_string(), "constqp".to_string()]);
            args.extend(["-cq".to_string(), format!("{}", crf)]);
            args.extend(["-b:v".to_string(), "0".to_string()]);
        } else {
            args.extend(["-crf".to_string(), format!("{}", crf)]);
        }
        args.extend([
            "-pix_fmt".to_string(), "yuv420p".to_string(),
            "-threads".to_string(), "0".to_string(),
            // Color space flags: GLSL shaders output full-range sRGB values
            // (ACES tone mapping → display-referred). Without these flags FFmpeg
            // treats full-range 0-255 as limited-range 16-235, crushing contrast.
            "-color_range".to_string(), "pc".to_string(),
            "-colorspace".to_string(), "bt709".to_string(),
            "-color_primaries".to_string(), "bt709".to_string(),
            "-color_trc".to_string(), "iec61966-2-1".to_string(),
            "-an".to_string(),
            output_path.to_string(),
        ]);
        let mut child = Command::new("ffmpeg")
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()?;

        // Wrap stdin in a 256MB BufWriter to prevent pipe deadlocks.
        // Without this, each 33MB frame write blocks until ffmpeg reads from
        // the tiny 64KB kernel pipe buffer. The BufWriter absorbs multiple
        // frames, letting the GPU render ahead while ffmpeg encodes.
        let stdin = child.stdin.take().ok_or("FFmpeg stdin not available")?;
        let writer = Some(BufWriter::with_capacity(256 * 1024 * 1024, stdin));

        Ok(Self {
            child,
            writer,
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

        let writer = self.writer.as_mut().ok_or("FFmpeg writer not available")?;
        writer.write_all(pixels)?;
        self.frames_written += 1;

        Ok(())
    }

    /// Close the pipe and wait for FFmpeg to finish encoding.
    /// Returns the total number of frames written.
    pub fn finish(mut self) -> Result<u64, Box<dyn std::error::Error>> {
        // Flush and drop the BufWriter to send remaining data + signal EOF
        if let Some(writer) = self.writer.take() {
            let mut inner = writer.into_inner()?;
            inner.flush()?;
            drop(inner);
        }

        let status = self.child.wait()?;
        if !status.success() {
            return Err(format!("FFmpeg exited with {}", status).into());
        }

        Ok(self.frames_written)
    }

    /// Number of frames written so far.
    pub fn frames_written(&self) -> u64 {
        self.frames_written
    }
}
