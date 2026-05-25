#!/usr/bin/env python3
"""Install selected farm plot and tool progression assets as transparent PNGs."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat


SELECTIONS = [
    {
        "asset_id": "farm_plot_empty",
        "candidate_id": "farm_plot_empty_v2",
        "source": Path("tmp/resource-asset-generation/refinement/farm_plot_empty_v2/flux1-schnell-q4-seed3301.png"),
    },
    {
        "asset_id": "farm_plot_starter_crop",
        "candidate_id": "farm_plot_starter_crop_v2",
        "source": Path("tmp/resource-asset-generation/refinement/farm_plot_starter_crop_v2/flux1-schnell-q4-seed3302.png"),
    },
    {
        "asset_id": "tool_pickaxe_t1",
        "candidate_id": "pickaxe_b_side",
        "source": Path("tmp/resource-asset-generation/tool-base-candidates/pickaxe/pickaxe_b_side/flux1-schnell-q4-seed6102.png"),
    },
    {
        "asset_id": "tool_pickaxe_t2",
        "candidate_id": "pickaxe_reinforced",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/pickaxe/pickaxe_reinforced/flux2-reference-edit-seed7101.png"),
    },
    {
        "asset_id": "tool_pickaxe_t3",
        "candidate_id": "pickaxe_steel",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/pickaxe/pickaxe_steel/flux2-reference-edit-seed7102.png"),
    },
    {
        "asset_id": "tool_pickaxe_t4",
        "candidate_id": "pickaxe_silver",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/pickaxe/pickaxe_silver/flux2-reference-edit-seed7103.png"),
    },
    {
        "asset_id": "tool_pickaxe_t5",
        "candidate_id": "pickaxe_gold",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/pickaxe/pickaxe_gold/flux2-reference-edit-seed7104.png"),
    },
    {
        "asset_id": "tool_pickaxe_t6",
        "candidate_id": "pickaxe_diamond_v2",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/pickaxe/pickaxe_diamond/flux2-reference-edit-seed8105.png"),
    },
    {
        "asset_id": "tool_woodaxe_t1",
        "candidate_id": "woodaxe_b_side",
        "source": Path("tmp/resource-asset-generation/tool-base-candidates/woodaxe/woodaxe_b_side/flux1-schnell-q4-seed6202.png"),
    },
    {
        "asset_id": "tool_woodaxe_t2",
        "candidate_id": "woodaxe_reinforced",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/woodaxe/woodaxe_reinforced/flux2-reference-edit-seed7201.png"),
    },
    {
        "asset_id": "tool_woodaxe_t3",
        "candidate_id": "woodaxe_steel",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/woodaxe/woodaxe_steel/flux2-reference-edit-seed7202.png"),
    },
    {
        "asset_id": "tool_woodaxe_t4",
        "candidate_id": "woodaxe_silver",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/woodaxe/woodaxe_silver/flux2-reference-edit-seed7203.png"),
    },
    {
        "asset_id": "tool_woodaxe_t5",
        "candidate_id": "woodaxe_gold",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/woodaxe/woodaxe_gold/flux2-reference-edit-seed7204.png"),
    },
    {
        "asset_id": "tool_woodaxe_t6",
        "candidate_id": "woodaxe_diamond_v2",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/woodaxe/woodaxe_diamond/flux2-reference-edit-seed8205.png"),
    },
    {
        "asset_id": "tool_hoe_scythe_t1",
        "candidate_id": "hoe_b_side",
        "source": Path("tmp/resource-asset-generation/tool-base-candidates/hoe_scythe/hoe_b_side/flux1-schnell-q4-seed6302.png"),
    },
    {
        "asset_id": "tool_hoe_scythe_t2",
        "candidate_id": "hoe_reinforced",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/hoe_scythe/hoe_reinforced/flux2-reference-edit-seed7301.png"),
    },
    {
        "asset_id": "tool_hoe_scythe_t3",
        "candidate_id": "hoe_steel",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/hoe_scythe/hoe_steel/flux2-reference-edit-seed7302.png"),
    },
    {
        "asset_id": "tool_hoe_scythe_t4",
        "candidate_id": "hoe_silver",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/hoe_scythe/hoe_silver/flux2-reference-edit-seed7303.png"),
    },
    {
        "asset_id": "tool_hoe_scythe_t5",
        "candidate_id": "hoe_gold",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/hoe_scythe/hoe_gold/flux2-reference-edit-seed7304.png"),
    },
    {
        "asset_id": "tool_hoe_scythe_t6",
        "candidate_id": "hoe_diamond_v2",
        "source": Path("tmp/resource-asset-generation/selected-tool-variants/hoe_scythe/hoe_diamond/flux2-reference-edit-seed8305.png"),
    },
]

RAW_DIR = Path("assets/raw")
ASSET_DIR = Path("assets")
OUT_ROOT = Path("tmp/resource-asset-generation/farm-tool-installed")


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
    return tuple(int(channel) for channel in ImageStat.Stat(border).median)


def remove_flat_background(path: Path) -> Image.Image:
    rgb = Image.open(path).convert("RGB")
    bg_img = Image.new("RGB", rgb.size, sampled_background(rgb))
    diff = ImageChops.difference(rgb, bg_img).convert("L")
    diff = diff.filter(ImageFilter.GaussianBlur(0.6))

    transparent_at = 9
    opaque_at = 38
    alpha = diff.point(
        lambda v: 0
        if v <= transparent_at
        else 255
        if v >= opaque_at
        else int((v - transparent_at) * 255 / (opaque_at - transparent_at))
    )
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
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("DejaVuSans.ttf", 12)
    except Exception:
        font = None

    thumb_w = 190
    thumb_h = 160
    label_h = 36
    cols = 5
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "#eeeeee")
    draw = ImageDraw.Draw(sheet)
    for i, (label, path) in enumerate(paths):
        col = i % cols
        row = i // cols
        x = col * thumb_w
        y = row * (thumb_h + label_h)
        draw.rectangle([x, y, x + thumb_w - 1, y + thumb_h + label_h - 1], outline="#cccccc")
        img = Image.open(path).convert("RGBA")
        img.thumbnail((thumb_w - 20, thumb_h - 20), Image.Resampling.LANCZOS)
        bg = Image.new("RGBA", (thumb_w - 20, thumb_h - 20), "#f8f8f8")
        bg_draw = ImageDraw.Draw(bg)
        for cy in range(0, bg.height, 16):
            for cx in range(0, bg.width, 16):
                if (cx // 16 + cy // 16) % 2 == 0:
                    bg_draw.rectangle([cx, cy, cx + 15, cy + 15], fill="#e4e4e4")
        bg.alpha_composite(img, ((bg.width - img.width) // 2, (bg.height - img.height) // 2))
        sheet.paste(bg.convert("RGB"), (x + 10, y + 10))
        draw.text((x + 10, y + thumb_h + 8), label, fill="#111111", font=font)
    target = OUT_ROOT / "contact-sheet.png"
    sheet.save(target)
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
