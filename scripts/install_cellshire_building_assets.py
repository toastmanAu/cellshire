#!/usr/bin/env python3
"""Install selected generated standard-building assets as transparent PNGs."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat


SELECTIONS = [
    {
        "asset_id": "workbench",
        "candidate_id": "workbench_c_sturdy",
        "source": Path("tmp/resource-asset-generation/building-candidates/workbench/workbench_c_sturdy/flux1-schnell-q4-seed9103.png"),
    },
    {
        "asset_id": "tool_rack",
        "candidate_id": "tool_rack_b_wall",
        "source": Path("tmp/resource-asset-generation/building-candidates/tool_rack/tool_rack_b_wall/flux1-schnell-q4-seed9202.png"),
    },
    {
        "asset_id": "sawmill",
        "candidate_id": "sawmill_c_logs",
        "source": Path("tmp/resource-asset-generation/building-candidates/sawmill/sawmill_c_logs/flux1-schnell-q4-seed9303.png"),
    },
    {
        "asset_id": "stone_yard",
        "candidate_id": "stone_yard_c_crane",
        "source": Path("tmp/resource-asset-generation/building-candidates/stone_yard/stone_yard_c_crane/flux1-schnell-q4-seed9403.png"),
    },
    {
        "asset_id": "farm_storage",
        "candidate_id": "farm_storage_c_harvest",
        "source": Path("tmp/resource-asset-generation/building-candidates/farm_storage/farm_storage_c_harvest/flux1-schnell-q4-seed9503.png"),
    },
]

RAW_DIR = Path("assets/raw")
ASSET_DIR = Path("assets")
OUT_ROOT = Path("tmp/resource-asset-generation/building-candidates/installed")


def sampled_background(rgb: Image.Image) -> tuple[int, int, int]:
    w, h = rgb.size
    border = Image.new("RGB", (w * 2 + h * 2, 1))
    strips = [
        rgb.crop((0, 0, w, 1)),
        rgb.crop((0, h - 1, w, h)),
        rgb.crop((0, 0, 1, h)).transpose(Image.Transpose.ROTATE_90),
        rgb.crop((w - 1, 0, w, h)).transpose(Image.Transpose.ROTATE_90),
    ]
    x = 0
    for strip in strips:
        border.paste(strip, (x, 0))
        x += strip.width
    median = ImageStat.Stat(border).median
    return tuple(int(channel) for channel in median)


def remove_flat_background(path: Path) -> Image.Image:
    rgb = Image.open(path).convert("RGB")
    bg = sampled_background(rgb)
    bg_img = Image.new("RGB", rgb.size, bg)
    diff = ImageChops.difference(rgb, bg_img).convert("L")
    diff = diff.filter(ImageFilter.GaussianBlur(0.6))

    transparent_at = 9
    opaque_at = 38
    alpha = diff.point(lambda v: 0 if v <= transparent_at else 255 if v >= opaque_at else int((v - transparent_at) * 255 / (opaque_at - transparent_at)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))

    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    bbox = alpha.getbbox()
    if not bbox:
        return rgba
    pad = 18
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(rgba.width, bbox[2] + pad)
    bottom = min(rgba.height, bbox[3] + pad)
    return rgba.crop((left, top, right, bottom))


def make_contact_sheet(paths: list[tuple[str, Path]]) -> Path:
    from PIL import ImageDraw, ImageFont

    thumb_w = 250
    thumb_h = 235
    label_h = 42
    cols = 5
    rows = (len(paths) + cols - 1) // cols
    checker = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "#eeeeee")
    draw = ImageDraw.Draw(checker)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 13)
    except Exception:
        font = None
    for i, (label, path) in enumerate(paths):
        col = i % cols
        row = i // cols
        x = col * thumb_w
        y = row * (thumb_h + label_h)
        draw.rectangle([x, y, x + thumb_w - 1, y + thumb_h + label_h - 1], outline="#cccccc")
        img = Image.open(path).convert("RGBA")
        img.thumbnail((thumb_w - 20, thumb_h - 20), Image.Resampling.LANCZOS)
        bg = Image.new("RGBA", (thumb_w - 20, thumb_h - 20), "#f7f7f7")
        for cy in range(0, bg.height, 16):
            for cx in range(0, bg.width, 16):
                if (cx // 16 + cy // 16) % 2 == 0:
                    ImageDraw.Draw(bg).rectangle([cx, cy, cx + 15, cy + 15], fill="#e4e4e4")
        bg.alpha_composite(img, ((bg.width - img.width) // 2, (bg.height - img.height) // 2))
        checker.paste(bg.convert("RGB"), (x + 10, y + 10))
        draw.text((x + 10, y + thumb_h + 10), label, fill="#111111", font=font)
    target = OUT_ROOT / "contact-sheet.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    checker.save(target)
    return target


def main() -> int:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {"installed": []}
    contact: list[tuple[str, Path]] = []

    for selected in SELECTIONS:
        source = selected["source"]
        if not source.exists():
            raise FileNotFoundError(source)
        asset_id = selected["asset_id"]
        image = remove_flat_background(source)
        raw_target = RAW_DIR / f"{asset_id}.png"
        asset_target = ASSET_DIR / f"{asset_id}.png"
        preview_target = OUT_ROOT / f"{asset_id}.png"
        image.save(raw_target)
        image.save(asset_target)
        image.save(preview_target)
        manifest["installed"].append({
            **selected,
            "source": str(source),
            "raw_file": str(raw_target),
            "asset_file": str(asset_target),
            "preview_file": str(preview_target),
            "size": image.size,
        })
        contact.append((asset_id, preview_target))
        print(f"INSTALLED {asset_id} <- {selected['candidate_id']} {image.size}", flush=True)

    sheet = make_contact_sheet(contact)
    manifest["contact_sheet"] = str(sheet)
    (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"CONTACT {sheet}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
