#!/usr/bin/env python3
"""Convert a specific color (and similar colors within a tolerance) to alpha transparency.

Suitable for simple background removal when generating images against a solid backdrop.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def parse_color(color_str: str) -> tuple[int, int, int]:
    color_str = color_str.strip()
    if color_str.startswith("#"):
        color_str = color_str[1:]
    if len(color_str) == 6:
        try:
            return int(color_str[0:2], 16), int(color_str[2:4], 16), int(color_str[4:6], 16)
        except ValueError:
            pass
    # Try comma-separated RGB
    parts = color_str.split(",")
    if len(parts) == 3:
        try:
            return int(parts[0]), int(parts[1]), int(parts[2])
        except ValueError:
            pass
    raise argparse.ArgumentTypeError(
        f"Invalid color format {color_str!r}. Expected hex format (e.g., '#ffffff' or 'ffffff') "
        f"or RGB comma-separated integers (e.g., '255,255,255')."
    )


def color_to_alpha(
    img: Image.Image,
    color: tuple[int, int, int] | str,
    tolerance: float = 30.0,
    feather: float = 10.0,
) -> Image.Image:
    """Convert a specific color (and similar colors within a tolerance) to alpha transparency."""
    if isinstance(color, str):
        color = parse_color(color)

    # Convert to NumPy array
    arr = np.array(img, dtype=np.float32)  # Shape: (H, W, 4)
    rgb = arr[:, :, :3]
    alpha = arr[:, :, 3]

    target_color = np.array(color, dtype=np.float32)

    # Compute Euclidean distance in RGB space: sqrt((R-Rt)^2 + (G-Gt)^2 + (B-Bt)^2)
    dist = np.linalg.norm(rgb - target_color, axis=-1)

    # Calculate new alpha channel
    if feather <= 0:
        new_alpha = np.where(dist <= tolerance, 0.0, 255.0)
    else:
        new_alpha = np.clip((dist - tolerance) / feather, 0.0, 1.0) * 255.0

    # Combine with original alpha so we never make pre-existing transparent parts opaque
    arr[:, :, 3] = np.minimum(alpha, new_alpha)

    # Convert back to uint8 PIL image
    result_arr = np.clip(arr, 0.0, 255.0).astype(np.uint8)
    return Image.fromarray(result_arr, mode="RGBA")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a specific color (and similar colors within a tolerance) to alpha transparency."
    )
    parser.add_argument("-i", "--input", required=True, type=Path, help="Path to the input image.")
    parser.add_argument("-o", "--output", type=Path, default=None,
                        help="Path to the output PNG image (defaults to <input_name>_color_to_alpha.png).")
    parser.add_argument("-c", "--color", required=True, type=parse_color,
                        help="Target color to make transparent. E.g., '#FFFFFF' or '255,255,255'.")
    parser.add_argument("-t", "--tolerance", type=float, default=30.0,
                        help="Euclidean color distance tolerance (0-442) below which pixels are fully transparent. Default: 30.0")
    parser.add_argument("-f", "--feather", type=float, default=10.0,
                        help="Feathering transition range. Pixels between tolerance and tolerance+feather "
                             "will have partial transparency. Default: 10.0")

    args = parser.parse_args()

    if not args.input.exists():
        sys.exit(f"Error: Input file {args.input} does not exist.")

    try:
        img = Image.open(args.input).convert("RGBA")
    except Exception as e:
        sys.exit(f"Error: Failed to open image: {e}")

    result_img = color_to_alpha(img, args.color, args.tolerance, args.feather)

    # Resolve output path
    output_path = args.output
    if output_path is None:
        output_path = args.input.parent / f"{args.input.stem}_color_to_alpha.png"

    try:
        result_img.save(output_path, format="PNG")
        print(f"Successfully processed image and saved to: {output_path}")
    except Exception as e:
        sys.exit(f"Error: Failed to save output image: {e}")


if __name__ == "__main__":
    main()
