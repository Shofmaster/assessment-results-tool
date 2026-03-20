from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import List

from PIL import Image, ImageDraw, ImageFilter, ImageFont


def load_lines(path: Path) -> List[str]:
    with path.open("r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def render_line(text: str, out_path: Path, idx: int) -> dict:
    width, height = 1800, 140
    image = Image.new("RGB", (width, height), color=(247, 244, 236))
    draw = ImageDraw.Draw(image)

    font_size = random.randint(34, 50)
    try:
        # Works on many systems with Office installs; falls back if unavailable.
        font = ImageFont.truetype("segoepr.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    x = random.randint(20, 80)
    y = random.randint(30, 50)
    draw.text((x, y), text, fill=(42, 40, 36), font=font)

    if random.random() < 0.5:
        image = image.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.2, 1.0)))

    if random.random() < 0.4:
        noise = Image.effect_noise((width, height), random.uniform(2.0, 10.0)).convert("L")
        image.paste(Image.merge("RGB", (noise, noise, noise)), mask=noise.point(lambda p: p * 0.1))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    file_name = f"synthetic_{idx:06d}.png"
    final_path = out_path / file_name
    image.save(final_path)

    return {
        "id": f"synthetic_{idx:06d}",
        "image_path": str(final_path),
        "text": text,
        "source_type": "synthetic",
        "source_name": "generate_synthetic_lines.py",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic logbook-like line images.")
    parser.add_argument("--lines", type=Path, required=True, help="Text file with one line per record.")
    parser.add_argument("--out-dir", type=Path, required=True, help="Output directory for PNG files.")
    parser.add_argument("--manifest", type=Path, required=True, help="Output JSONL manifest.")
    parser.add_argument("--count", type=int, default=500, help="Number of samples to generate.")
    args = parser.parse_args()

    lines = load_lines(args.lines)
    if not lines:
        raise RuntimeError("No input lines were found.")

    records = []
    for i in range(args.count):
        text = random.choice(lines)
        records.append(render_line(text, args.out_dir, i))

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    with args.manifest.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"Generated {len(records)} samples at {args.out_dir}")


if __name__ == "__main__":
    main()
