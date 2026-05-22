#!/usr/bin/env python3
"""Generate Cellshire standard-building candidate assets with local Flux.1."""

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


OUT_ROOT = Path("tmp/resource-asset-generation/building-candidates")

STYLE = (
    "Single isolated Cellshire home-base building asset, centered with generous "
    "padding. Isometric voxel prop/building style, Minecraft-style pixel cube "
    "construction, 30-degree isometric viewing angle, chunky square voxel "
    "details, compact readable one-tile silhouette, top-left lighting. Keep the "
    "cubic pixel-grid look exact, no smoothing, no rounding, no glossy plastic. "
    "Plain solid light grey background."
)

ASSETS = [
    {
        "id": "workbench",
        "candidates": [
            {
                "id": "workbench_a_table",
                "seed": 9101,
                "prompt": (
                    "Compact crafting workbench for a cozy mining settlement. "
                    "Sturdy warm oak voxel tabletop, blocky trestle legs, a small "
                    "clamp, hammer and chisel cubes, and two stacked crafting "
                    "material blocks. Clearly a workbench at game distance."
                ),
            },
            {
                "id": "workbench_b_tools",
                "seed": 9102,
                "prompt": (
                    "Compact crafting workbench with more visible tool detail. "
                    "Warm brown plank table, dark iron vise, small saw, hammer, "
                    "wood offcuts, and one tiny blueprint-like pale square with "
                    "no readable text. One-tile home-base upgrade."
                ),
            },
            {
                "id": "workbench_c_sturdy",
                "seed": 9103,
                "prompt": (
                    "Sturdy square crafting workbench built from thick oak voxel "
                    "planks. Heavy tabletop, lower shelf, small stacked stone and "
                    "wood materials, a dark metal clamp, and compact practical "
                    "crafting-station silhouette."
                ),
            },
        ],
    },
    {
        "id": "tool_rack",
        "candidates": [
            {
                "id": "tool_rack_a_upright",
                "seed": 9201,
                "prompt": (
                    "Compact upright tool rack for tool upgrades. Warm brown wood "
                    "frame, dark iron brackets, two hanging pickaxe shapes, one "
                    "woodaxe shape, and a small hammer. Clear vertical rack, not "
                    "a table or crate."
                ),
            },
            {
                "id": "tool_rack_b_wall",
                "seed": 9202,
                "prompt": (
                    "Small wall-style tool rack on two wooden posts. Crossbeam "
                    "with dark hooks holding a pickaxe, axe, hoe, and hammer. "
                    "Compact one-tile workshop prop with readable tools."
                ),
            },
            {
                "id": "tool_rack_c_corner",
                "seed": 9203,
                "prompt": (
                    "Corner-shaped tool rack for a home base. Two short warm wood "
                    "supports, small base plank, dark iron hooks, visible pickaxe "
                    "and hoe heads, and a few metal upgrade pieces. Practical and "
                    "readable from game distance."
                ),
            },
        ],
    },
    {
        "id": "sawmill",
        "candidates": [
            {
                "id": "sawmill_a_frame",
                "seed": 9301,
                "prompt": (
                    "Tiny home-base sawmill for wood processing. Warm timber beam "
                    "frame, compact dark iron saw blade, stacked log cubes, plank "
                    "pile, and small work platform. Functional building upgrade "
                    "that still fits one tile."
                ),
            },
            {
                "id": "sawmill_b_blade",
                "seed": 9302,
                "prompt": (
                    "Compact sawmill with the blade as the main read. Low timber "
                    "bench, circular dark metal saw blade, cut log section, plank "
                    "stacks, sawdust-colored voxel chips, and warm wood beams."
                ),
            },
            {
                "id": "sawmill_c_logs",
                "seed": 9303,
                "prompt": (
                    "Home-base sawmill focused on log processing. Two chunky logs "
                    "on rails, small timber gantry, dark saw frame, stacked planks "
                    "beside it, and clean one-tile industrial craft silhouette."
                ),
            },
        ],
    },
    {
        "id": "stone_yard",
        "candidates": [
            {
                "id": "stone_yard_a_blocks",
                "seed": 9401,
                "prompt": (
                    "Compact stone yard for masonry processing. Stacked grey "
                    "limestone voxel blocks, dark slate blocks, tiny chisel bench, "
                    "fresh light chipped faces, and a practical home-base station "
                    "silhouette. Not a crypto ore deposit."
                ),
            },
            {
                "id": "stone_yard_b_mason",
                "seed": 9402,
                "prompt": (
                    "Small masonry yard with cut stone blocks arranged by size. "
                    "Low workbench, chisel and mallet shapes, dust-colored chips, "
                    "grey limestone and dark slate contrast. Reads as stone "
                    "processing, not mining loot."
                ),
            },
            {
                "id": "stone_yard_c_crane",
                "seed": 9403,
                "prompt": (
                    "Tiny stone yard with a simple wooden lifting frame over cut "
                    "stone cubes. Grey block stacks, dark slate slab, small chisel "
                    "bench, and chipped pale voxel faces. Compact one-tile upgrade."
                ),
            },
        ],
    },
    {
        "id": "farm_storage",
        "candidates": [
            {
                "id": "farm_storage_a_crates",
                "seed": 9501,
                "prompt": (
                    "Compact farm storage for a cozy home base. Warm wooden voxel "
                    "crates, crop baskets, sacks, small roofed bin, and a few green "
                    "vegetable cubes. Reads as storage capacity for farming, not a "
                    "market stall."
                ),
            },
            {
                "id": "farm_storage_b_bin",
                "seed": 9502,
                "prompt": (
                    "Small roofed farm storage bin. Low timber roof, stacked crates, "
                    "grain sack cubes, leafy vegetable blocks, and a compact tidy "
                    "farm-yard storage silhouette."
                ),
            },
            {
                "id": "farm_storage_c_harvest",
                "seed": 9503,
                "prompt": (
                    "Harvest storage pile for the home farm. Wooden crate stack, "
                    "round crop baskets made from voxel blocks, sacks, carrots or "
                    "greens as simple colored cubes, and a small protective awning."
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
                    refine.flux1_t2i_workflow(prompt, seed, f"cellshire_building_candidates/{asset_id}/{candidate_id}"),
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
