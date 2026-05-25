#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Install selected township / interior / NPC visual assets.

Three install paths in one script:

* **buildings** → ``assets/raw/<asset_id>.png`` + transparent
  ``assets/<asset_id>.png``. Uses the same flat-background removal as
  ``install_cellshire_building_assets.py``.
* **interiors** → ``assets/interiors/<scene_id>.png`` as full-bleed
  illustration. NO transparency processing.
* **npcs** → same transparent pipeline as buildings, with output in
  ``assets/<asset_id>.png``.

After install, the script emits a manifest-snippet for Codex to wire the
new asset ids into ``src/assets/assetManifest.js``.

Workflow:

1. Audition in tmp/township-visual-generation/audition.html
2. Click Export, paste the VISUAL_SELECTIONS block into this file
3. ``python3 scripts/install_cellshire_township_visuals.py``
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent.parent
TMP_ROOT = ROOT / "tmp" / "township-visual-generation"
ASSETS_RAW = ROOT / "assets" / "raw"
ASSETS_DIR = ROOT / "assets"
ASSETS_INTERIORS = ROOT / "assets" / "interiors"
ASSETS_BOOT = ROOT / "assets" / "boot"


@dataclass(frozen=True)
class VisualSelection:
    parent_id: str    # e.g. "township_store" or "interior_bank" or "npc_trader"
    candidate_id: str  # the chosen variant id, e.g. "township_store_a_awning"
    tier: str          # buildings | interiors | npcs


VISUAL_SELECTIONS: list[VisualSelection] = [
    VisualSelection("boot_screen",            "boot_a_valley_township",          "boot"),
    VisualSelection("township_store",         "township_store_a_stall",          "buildings"),
    VisualSelection("township_market",        "township_market_a_stalls",        "buildings"),
    VisualSelection("township_bank",          "township_bank_a_strongbox",       "buildings"),
    VisualSelection("township_gallery",       "township_gallery_a_modern",       "buildings"),
    VisualSelection("township_community_hall","township_community_hall_a_lodge", "buildings"),
    VisualSelection("interior_store",         "interior_store_a_shelves",        "interiors"),
    VisualSelection("interior_market",        "interior_market_a_open",          "interiors"),
    VisualSelection("interior_bank",          "interior_bank_a_vault",           "interiors"),
    VisualSelection("interior_gallery",       "interior_gallery_a_cozy",         "interiors"),
    VisualSelection("interior_hall",          "interior_hall_a_hearth",          "interiors"),
    VisualSelection("npc_storekeeper",        "npc_storekeeper_a",               "npcs"),
    VisualSelection("npc_trader",             "npc_trader_a",                    "npcs"),
    VisualSelection("npc_bank_teller",        "npc_bank_teller_b",               "npcs"),
    VisualSelection("npc_gallery_curator",    "npc_gallery_curator_b",           "npcs"),
    VisualSelection("npc_hall_keeper",        "npc_hall_keeper_b",               "npcs"),
]


# ── Transparent-bg pipeline (lifted from install_cellshire_building_assets.py) ──


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
    return tuple(int(c) for c in median)


def remove_flat_background(path: Path) -> Image.Image:
    rgb = Image.open(path).convert("RGB")
    bg = sampled_background(rgb)
    bg_img = Image.new("RGB", rgb.size, bg)
    diff = ImageChops.difference(rgb, bg_img).convert("L")
    diff = diff.filter(ImageFilter.GaussianBlur(0.6))
    transparent_at = 9
    opaque_at = 38
    alpha = diff.point(lambda v: 0 if v <= transparent_at else 255 if v >= opaque_at
                       else int((v - transparent_at) * 255 / (opaque_at - transparent_at)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    bbox = alpha.getbbox()
    if not bbox:
        return rgba
    pad = 18
    left = max(0, bbox[0] - pad)
    upper = max(0, bbox[1] - pad)
    right = min(rgba.width, bbox[2] + pad)
    lower = min(rgba.height, bbox[3] + pad)
    return rgba.crop((left, upper, right, lower))


# ── Install handlers per tier ────────────────────────────────────────


def install_voxel_asset(sel: VisualSelection) -> None:
    """Buildings + NPCs: copy raw + processed transparent."""
    src = TMP_ROOT / sel.tier / sel.parent_id / f"{sel.candidate_id}.png"
    if not src.exists():
        raise FileNotFoundError(f"missing source: {src}")
    ASSETS_RAW.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    raw_dst = ASSETS_RAW / f"{sel.parent_id}.png"
    raw_dst.write_bytes(src.read_bytes())
    transparent = remove_flat_background(src)
    final_dst = ASSETS_DIR / f"{sel.parent_id}.png"
    transparent.save(final_dst, "PNG", optimize=True)
    print(f"  ✓ {sel.parent_id:32s} → {final_dst.relative_to(ROOT)}")


def install_interior_backdrop(sel: VisualSelection) -> None:
    """Interiors: copy as-is (preserving the painted background)."""
    src = TMP_ROOT / sel.tier / sel.parent_id / f"{sel.candidate_id}.png"
    if not src.exists():
        raise FileNotFoundError(f"missing source: {src}")
    ASSETS_INTERIORS.mkdir(parents=True, exist_ok=True)
    dst = ASSETS_INTERIORS / f"{sel.parent_id}.png"
    Image.open(src).save(dst, "PNG", optimize=True)
    print(f"  ✓ {sel.parent_id:32s} → {dst.relative_to(ROOT)}")


def install_boot_background(sel: VisualSelection) -> None:
    """Boot screen: copy as-is to assets/boot/."""
    src = TMP_ROOT / sel.tier / sel.parent_id / f"{sel.candidate_id}.png"
    if not src.exists():
        raise FileNotFoundError(f"missing source: {src}")
    ASSETS_BOOT.mkdir(parents=True, exist_ok=True)
    dst = ASSETS_BOOT / f"{sel.parent_id}.png"
    Image.open(src).save(dst, "PNG", optimize=True)
    print(f"  ✓ {sel.parent_id:32s} → {dst.relative_to(ROOT)}")


# ── Manifest snippet emitter ─────────────────────────────────────────


def render_manifest_snippet(selections: list[VisualSelection]) -> str:
    """Emit JS for src/assets/assetManifest.js — Codex pastes this in."""
    by_tier: dict[str, list[VisualSelection]] = {}
    for sel in selections:
        by_tier.setdefault(sel.tier, []).append(sel)
    lines = [
        "// Auto-generated by scripts/install_cellshire_township_visuals.py",
        "// Paste into src/assets/assetManifest.js alongside the existing entries.",
        "",
    ]
    if "buildings" in by_tier:
        lines.append("// Township building tiles — voxel assets, full transparent pipeline")
        for sel in by_tier["buildings"]:
            lines.append(
                f"  {sel.parent_id}: {{ src: '{sel.parent_id}.png', footprint: "
                f"{{ w: 2, d: 2 }} }},  // tune footprint per asset"
            )
        lines.append("")
    if "interiors" in by_tier:
        lines.append("// RPG interior backdrops — full-bleed illustrations")
        lines.append("// Consume via src/ui/BuildingInteriorWindow.js (or equivalent).")
        lines.append("export const INTERIOR_BACKDROPS = {")
        for sel in by_tier["interiors"]:
            lines.append(f"  {sel.parent_id}: 'interiors/{sel.parent_id}.png',")
        lines.append("};")
        lines.append("")
    if "npcs" in by_tier:
        lines.append("// NPC sprites — voxel character format")
        for sel in by_tier["npcs"]:
            lines.append(
                f"  {sel.parent_id}: {{ src: '{sel.parent_id}.png', kind: 'npc' }},"
            )
        lines.append("")
    if "boot" in by_tier:
        lines.append("// Boot screen background — drop into index.html / styles.css")
        for sel in by_tier["boot"]:
            lines.append(
                f"// #loading-screen {{ background-image: url('assets/boot/{sel.parent_id}.png'); "
                f"background-size: cover; background-position: center; }}"
            )
    return "\n".join(lines)


# ── Main ─────────────────────────────────────────────────────────────


def main() -> int:
    if not VISUAL_SELECTIONS:
        print("No selections recorded yet — review tmp/township-visual-generation/audition.html")
        print("then edit VISUAL_SELECTIONS in this file and re-run.")
        return 0

    handlers = {
        "buildings": install_voxel_asset,
        "interiors": install_interior_backdrop,
        "npcs": install_voxel_asset,
        "boot": install_boot_background,
    }
    missing: list[VisualSelection] = []
    installed = 0
    for sel in VISUAL_SELECTIONS:
        handler = handlers.get(sel.tier)
        if not handler:
            sys.stderr.write(f"unknown tier {sel.tier!r} for {sel.parent_id}\n")
            return 2
        try:
            handler(sel)
        except FileNotFoundError as e:
            missing.append(sel)
            sys.stderr.write(f"  ✗ {e}\n")
            continue
        installed += 1

    if missing:
        sys.stderr.write(f"\n{len(missing)} selections missing source images.\n")
        return 2

    print()
    print(f"Installed {installed} visual assets.")
    print()
    print("Manifest snippet for src/assets/assetManifest.js:")
    print()
    print(render_manifest_snippet(VISUAL_SELECTIONS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
