#!/usr/bin/env python3
"""Generate Cellshire resource and farm-state candidate assets with local Flux.1."""

from __future__ import annotations

import importlib.util
import json
import time
from pathlib import Path


REFINEMENT_SCRIPT = Path(__file__).with_name("run_cellshire_asset_refinement.py")
spec = importlib.util.spec_from_file_location("run_cellshire_asset_refinement", REFINEMENT_SCRIPT)
if spec is None or spec.loader is None:
    raise ImportError(f"Unable to load {REFINEMENT_SCRIPT}")
refine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refine)


OUT_ROOT = Path("tmp/resource-asset-generation/resource-candidates")

STYLE = (
    "Single isolated Cellshire resource or farm asset, centered with generous "
    "padding. Isometric voxel game style, Minecraft-style pixel cube "
    "construction, 30-degree isometric viewing angle, chunky square voxel "
    "details, compact readable one-tile silhouette, top-left lighting. Keep the "
    "cubic pixel-grid look exact, no smoothing, no rounding, no glossy plastic. "
    "Plain solid light grey background."
)

ASSETS = [
    {
        "id": "harvest_tree",
        "candidates": [
            {
                "id": "harvest_tree_a_oak",
                "seed": 10101,
                "prompt": (
                    "Harvestable timber tree for a cozy mining town. Chunky warm "
                    "brown trunk, compact deep green voxel leaf canopy, visible "
                    "cuttable branch cubes, and a practical resource-node shape. "
                    "Not ornamental, clearly a wood source."
                ),
            },
            {
                "id": "harvest_tree_b_pine",
                "seed": 10102,
                "prompt": (
                    "Harvestable evergreen timber tree. Straight warm brown voxel "
                    "trunk, stacked compact dark green leaf blocks, a few exposed "
                    "branch cubes, readable as a chop-for-wood resource node."
                ),
            },
            {
                "id": "harvest_tree_c_stump",
                "seed": 10103,
                "prompt": (
                    "Harvestable broadleaf timber tree with a thick trunk and a "
                    "few chopped stump marks near the base. Compact blocky green "
                    "canopy, visible wood cubes, strong one-tile silhouette."
                ),
            },
        ],
    },
    {
        "id": "stone_outcrop",
        "candidates": [
            {
                "id": "stone_outcrop_a_limestone",
                "seed": 10201,
                "prompt": (
                    "Harvestable stone outcrop for building materials. Grey "
                    "limestone voxel blocks, dark slate accents, chipped angular "
                    "pieces, and light freshly broken faces. Construction stone, "
                    "not a colorful ore deposit."
                ),
            },
            {
                "id": "stone_outcrop_b_stack",
                "seed": 10202,
                "prompt": (
                    "Compact stack of harvestable masonry stone. Layered grey "
                    "voxel rocks, blocky cut faces, darker cracks, and a few "
                    "loose stone chunks. Reads as stone resource for crafting."
                ),
            },
            {
                "id": "stone_outcrop_c_quarry",
                "seed": 10203,
                "prompt": (
                    "Small quarry-style stone resource node. Angular grey blocks, "
                    "fresh pale chip marks, dark slate base stones, and a rugged "
                    "one-tile outcrop shape for harvesting stone."
                ),
            },
        ],
    },
    {
        "id": "gold_nugget_node",
        "candidates": [
            {
                "id": "gold_nugget_node_a_matrix",
                "seed": 10301,
                "prompt": (
                    "Small gold nugget resource node for crafting. Dark stone "
                    "matrix with a few warm metallic yellow-gold voxel nuggets "
                    "embedded in it. Gold appears as distinct chunks, not a fully "
                    "gold rock."
                ),
            },
            {
                "id": "gold_nugget_node_b_chunks",
                "seed": 10302,
                "prompt": (
                    "Compact crafting gold node. Grey and dark stone cluster with "
                    "three or four chunky gold nugget cubes protruding, warm "
                    "metallic highlights, readable as rare local gold material."
                ),
            },
            {
                "id": "gold_nugget_node_c_small",
                "seed": 10303,
                "prompt": (
                    "Small low gold nugget cluster for a home-base resource. Mostly "
                    "dark slate and grey stone, with sparse bright gold cube seams "
                    "and nuggets. Compact, not oversized, not a crypto ore deposit."
                ),
            },
        ],
    },
    {
        "id": "farm_plot_ready_crop",
        "candidates": [
            {
                "id": "farm_plot_ready_crop_a_leafy",
                "seed": 10401,
                "prompt": (
                    "Mature harvest-ready crop plot on one tile. Low warm wooden "
                    "garden-bed border, dark soil rows, dense blocky green leaves, "
                    "and a few warm yellow crop cubes. Clearly ready to harvest."
                ),
            },
            {
                "id": "farm_plot_ready_crop_b_rows",
                "seed": 10402,
                "prompt": (
                    "Harvest-ready farm plot with clear rows. Square isometric "
                    "wooden bed, dark soil still visible between rows, compact "
                    "green crop blocks, and small yellow produce cubes. Farm-game "
                    "crop tile, not a wild bush."
                ),
            },
            {
                "id": "farm_plot_ready_crop_c_full",
                "seed": 10403,
                "prompt": (
                    "Full mature crop bed for harvesting. Neat wooden border, rich "
                    "soil rows, dense leafy voxel plants, a few orange-yellow crop "
                    "tops, compact one-tile silhouette matching earlier farm beds."
                ),
            },
        ],
    },
]


def output_path(asset_id: str, candidate_id: str, seed: int) -> Path:
    return OUT_ROOT / asset_id / candidate_id / f"flux1-schnell-q4-seed{seed}.png"


def copy_history_image(history_item: dict, asset_id: str, candidate_id: str, seed: int) -> Path:
    images = []
    for node in history_item.get("outputs", {}).values():
        images.extend(node.get("images", []))
    if not images:
        raise RuntimeError(f"{candidate_id} produced no image")
    image = images[0]
    data = refine.get_bytes("/view", {
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    })
    target = output_path(asset_id, candidate_id, seed)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


def make_contact_sheet(paths: list[tuple[str, str, Path]]) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    thumb_w = 250
    thumb_h = 235
    label_h = 52
    cols = 3
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "#f2f2f2")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 13)
        small = ImageFont.truetype("DejaVuSans.ttf", 11)
    except Exception:
        font = small = None
    for i, (asset_id, label, path) in enumerate(paths):
        col = i % cols
        row = i // cols
        x = col * thumb_w
        y = row * (thumb_h + label_h)
        draw.rectangle([x, y, x + thumb_w - 1, y + thumb_h + label_h - 1], outline="#cccccc")
        img = Image.open(path).convert("RGB")
        img.thumbnail((thumb_w - 20, thumb_h - 20), Image.Resampling.LANCZOS)
        sheet.paste(img, (x + (thumb_w - img.width) // 2, y + 10 + (thumb_h - 20 - img.height) // 2))
        draw.text((x + 10, y + thumb_h + 8), asset_id, fill="#111111", font=small)
        draw.text((x + 10, y + thumb_h + 28), label, fill="#111111", font=font)
    target = OUT_ROOT / "contact-sheet.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target)
    return target


def main() -> int:
    refine.get_json("/system_stats")
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "model": "flux1-schnell-q4",
        "style": STYLE,
        "negative_prompt": refine.NEGATIVE_PROMPT,
        "runs": [],
    }
    contact: list[tuple[str, str, Path]] = []

    for asset in ASSETS:
        asset_id = asset["id"]
        for candidate in asset["candidates"]:
            candidate_id = candidate["id"]
            seed = candidate["seed"]
            target = output_path(asset_id, candidate_id, seed)
            if target.exists():
                print(f"SKIP  {asset_id}/{candidate_id} -> {target}", flush=True)
                path = target
                elapsed = 0
            else:
                prompt = f"{STYLE}\n\n{candidate['prompt']}"
                label = f"{asset_id}/{candidate_id}"
                print(f"QUEUE {label}", flush=True)
                started = time.time()
                history = refine.queue_and_wait(
                    refine.flux1_t2i_workflow(prompt, seed, f"cellshire_resource_candidates/{asset_id}/{candidate_id}"),
                    label,
                )
                path = copy_history_image(history, asset_id, candidate_id, seed)
                elapsed = round(time.time() - started, 2)
                print(f"DONE  {label} -> {path} ({elapsed}s)", flush=True)
            manifest["runs"].append({
                "asset_id": asset_id,
                **candidate,
                "file": str(path),
                "elapsed_sec": elapsed,
            })
            contact.append((asset_id, candidate_id, path))
            (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    sheet = make_contact_sheet(contact)
    manifest["contact_sheet"] = str(sheet)
    (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"CONTACT {sheet}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
