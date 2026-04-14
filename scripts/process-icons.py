#!/usr/bin/env python3
"""
Batch process images into transparent 1024x1024 PNGs for the overlay system.

Usage:
    # First time setup:
    pip install rembg Pillow onnxruntime

    # Process a folder of raw images:
    python scripts/process-icons.py raw-icons/ --output packages/visualizer-poc/public/assets/dead-icons/

    # Process a single image:
    python scripts/process-icons.py raw-icons/casey-jones-train.jpg --output packages/visualizer-poc/public/assets/dead-icons/

    # Skip background removal (image already has transparency or is on white):
    python scripts/process-icons.py raw-icons/ --output packages/visualizer-poc/public/assets/dead-icons/ --no-rembg

    # Use alpha matting for better edges (slower but cleaner):
    python scripts/process-icons.py raw-icons/ --output packages/visualizer-poc/public/assets/dead-icons/ --alpha-matting
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter
except ImportError:
    print("pip install Pillow")
    sys.exit(1)

TARGET_SIZE = 1024
SUPPORTED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff', '.gif'}


def remove_background(img: Image.Image, alpha_matting: bool = False) -> Image.Image:
    """Remove background using rembg."""
    try:
        from rembg import remove
    except ImportError:
        print("ERROR: rembg not installed. Run: pip install rembg onnxruntime")
        print("  Or use --no-rembg if your images already have transparency.")
        sys.exit(1)

    kwargs = {}
    if alpha_matting:
        kwargs['alpha_matting'] = True
        kwargs['alpha_matting_foreground_threshold'] = 240
        kwargs['alpha_matting_background_threshold'] = 10
        kwargs['alpha_matting_erode_size'] = 10

    return remove(img, **kwargs)


def remove_white_background(img: Image.Image, threshold: int = 240) -> Image.Image:
    """Simple white background removal using color threshold."""
    img = img.convert("RGBA")
    data = img.getdata()
    new_data = []
    for r, g, b, a in data:
        if r > threshold and g > threshold and b > threshold:
            new_data.append((r, g, b, 0))
        else:
            new_data.append((r, g, b, a))
    img.putdata(new_data)
    return img


def fit_to_square(img: Image.Image, size: int = TARGET_SIZE, padding: float = 0.05) -> Image.Image:
    """
    Fit image into a square canvas, preserving aspect ratio.
    Adds padding so the icon doesn't touch the edges.
    """
    # Crop to bounding box of non-transparent pixels
    if img.mode == 'RGBA':
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)

    # Calculate target size with padding
    padded_size = int(size * (1 - 2 * padding))

    # Scale to fit within padded area
    w, h = img.size
    scale = min(padded_size / w, padded_size / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)

    # Center on transparent canvas
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.paste(img, (x, y), img if img.mode == 'RGBA' else None)

    return canvas


def get_version_number(output_dir: Path, base_name: str) -> int:
    """Find next available version number for this icon name."""
    existing = list(output_dir.glob(f"{base_name}-v*.png"))
    if not existing:
        return 1
    versions = []
    for f in existing:
        try:
            v = int(f.stem.split('-v')[-1])
            versions.append(v)
        except ValueError:
            pass
    return max(versions, default=0) + 1


def sanitize_name(filename: str) -> str:
    """Convert filename to overlay-system-friendly name."""
    name = Path(filename).stem.lower()
    # Remove common suffixes
    for suffix in ['_transparent', '_nobg', '_cutout', '_clean', '_final', '_raw']:
        name = name.replace(suffix, '')
    # Normalize separators
    name = name.replace(' ', '-').replace('_', '-')
    # Remove version suffixes if present (we'll add our own)
    import re
    name = re.sub(r'-v\d+$', '', name)
    name = re.sub(r'-+', '-', name).strip('-')
    return name


def process_image(
    input_path: Path,
    output_dir: Path,
    use_rembg: bool = True,
    alpha_matting: bool = False,
    white_bg: bool = False,
) -> Path:
    """Process a single image into a transparent 1024x1024 PNG."""
    img = Image.open(input_path).convert("RGBA")

    # Step 1: Remove background
    if use_rembg:
        print(f"  Removing background with rembg...")
        img = remove_background(img, alpha_matting=alpha_matting)
    elif white_bg:
        print(f"  Removing white background...")
        img = remove_white_background(img)

    # Step 2: Fit to 1024x1024 square
    img = fit_to_square(img, TARGET_SIZE)

    # Step 3: Save with proper naming
    base_name = sanitize_name(input_path.name)
    version = get_version_number(output_dir, base_name)
    output_name = f"{base_name}-v{version}.png"
    output_path = output_dir / output_name

    img.save(output_path, "PNG", optimize=True)
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Process images into transparent 1024x1024 overlay PNGs")
    parser.add_argument("input", help="Input image or directory of images")
    parser.add_argument("--output", "-o", default="packages/visualizer-poc/public/assets/dead-icons/",
                        help="Output directory")
    parser.add_argument("--no-rembg", action="store_true",
                        help="Skip AI background removal (use if images already have transparency)")
    parser.add_argument("--white-bg", action="store_true",
                        help="Simple white background removal instead of rembg")
    parser.add_argument("--alpha-matting", action="store_true",
                        help="Use alpha matting for cleaner edges (slower)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be processed without saving")

    args = parser.parse_args()
    input_path = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Collect input files
    if input_path.is_dir():
        files = sorted([f for f in input_path.iterdir()
                        if f.suffix.lower() in SUPPORTED_EXTENSIONS])
    elif input_path.is_file():
        files = [input_path]
    else:
        print(f"ERROR: {input_path} not found")
        sys.exit(1)

    if not files:
        print(f"No supported images found in {input_path}")
        sys.exit(1)

    print(f"Processing {len(files)} images → {output_dir}/")
    print(f"Mode: {'rembg AI removal' if not args.no_rembg and not args.white_bg else 'white bg removal' if args.white_bg else 'no bg removal (transparency preserved)'}")
    print()

    success = 0
    failed = []
    for i, f in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {f.name}")
        if args.dry_run:
            print(f"  → would save as: {sanitize_name(f.name)}-v{get_version_number(output_dir, sanitize_name(f.name))}.png")
            success += 1
            continue

        try:
            out = process_image(
                f, output_dir,
                use_rembg=not args.no_rembg and not args.white_bg,
                alpha_matting=args.alpha_matting,
                white_bg=args.white_bg,
            )
            size_kb = out.stat().st_size / 1024
            print(f"  → {out.name} ({size_kb:.0f} KB)")
            success += 1
        except Exception as e:
            print(f"  FAILED: {e}")
            failed.append((f.name, str(e)))

    print(f"\nDone: {success} processed, {len(failed)} failed")
    if failed:
        print("Failed files:")
        for name, err in failed:
            print(f"  {name}: {err}")


if __name__ == "__main__":
    main()
