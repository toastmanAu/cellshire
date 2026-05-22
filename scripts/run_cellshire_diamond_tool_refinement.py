#!/usr/bin/env python3
"""Generate smoother clear-diamond tool variants from selected Cellshire bases."""

from __future__ import annotations

import json
import shutil
import time
import importlib.util
from pathlib import Path


SELECTED_SCRIPT = Path(__file__).with_name("run_cellshire_selected_tool_variants.py")
spec = importlib.util.spec_from_file_location("run_cellshire_selected_tool_variants", SELECTED_SCRIPT)
if spec is None or spec.loader is None:
    raise ImportError(f"Unable to load {SELECTED_SCRIPT}")
selected = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selected)


OUT_ROOT = Path("tmp/resource-asset-generation/tool-diamond-v2")

selected.NEGATIVE_PROMPT = (
    selected.NEGATIVE_PROMPT
    + ", bumpy crystals, lumpy crystal cluster, bright saturated blue, neon blue, "
    "oversized gems, rough rock chunks, noisy facets"
)

DIAMOND_STYLE = (
    f"{selected.STYLE}\n\n"
    "Make this a premium clear diamond/glass tier. Preserve the same tool pose, "
    "scale, framing, and functional silhouette from the reference image. Avoid "
    "bumpy crystal clusters and avoid bright saturated blue. Use mostly clear "
    "transparent glass-like diamond material with smooth polished facets, white "
    "specular highlights, subtle pale icy-cyan edge glints only, and a cleaner "
    "shinier finish. The result should read as smooth clear gemstone/glass, not "
    "cartoon blue rock."
)

RUNS = [
    {
        "family": "pickaxe",
        "base_id": "pickaxe_b_side",
        "base": Path("tmp/resource-asset-generation/tool-base-candidates/pickaxe/pickaxe_b_side/flux1-schnell-q4-seed6102.png"),
        "current": Path("tmp/resource-asset-generation/selected-tool-variants/pickaxe/pickaxe_diamond/flux2-reference-edit-seed7105.png"),
        "id": "pickaxe_diamond_v2",
        "seed": 8105,
        "prompt": (
            "Clear diamond pickaxe tier. Keep one clean pickaxe head, not a "
            "gem cluster. Make the pick head mostly transparent clear crystal "
            "with smooth beveled voxel facets, faint white highlights, and only "
            "very subtle pale cyan along a few edges. Keep the handle visible "
            "and practical."
        ),
    },
    {
        "family": "woodaxe",
        "base_id": "woodaxe_b_side",
        "base": Path("tmp/resource-asset-generation/tool-base-candidates/woodaxe/woodaxe_b_side/flux1-schnell-q4-seed6202.png"),
        "current": Path("tmp/resource-asset-generation/selected-tool-variants/woodaxe/woodaxe_diamond/flux2-reference-edit-seed7205.png"),
        "id": "woodaxe_diamond_v2",
        "seed": 8205,
        "prompt": (
            "Clear diamond woodaxe tier. Keep one smooth axe blade, not loose "
            "crystal chunks. Make the blade a clear polished diamond/glass axe "
            "head with smooth beveled voxel facets, white shine, and subtle pale "
            "icy-cyan edge glints. Preserve the wooden handle and original "
            "woodaxe silhouette."
        ),
    },
    {
        "family": "hoe_scythe",
        "base_id": "hoe_b_side",
        "base": Path("tmp/resource-asset-generation/tool-base-candidates/hoe_scythe/hoe_b_side/flux1-schnell-q4-seed6302.png"),
        "current": Path("tmp/resource-asset-generation/selected-tool-variants/hoe_scythe/hoe_diamond/flux2-reference-edit-seed7305.png"),
        "id": "hoe_diamond_v2",
        "seed": 8305,
        "prompt": (
            "Clear diamond farming hoe tier. Keep one smooth hoe blade, not a "
            "bumpy crystal row. Make the blade polished transparent diamond/glass "
            "with smooth beveled voxel facets, white glossy highlights, and only "
            "subtle pale cyan edge glints. Preserve the long wooden handle and "
            "the original farming-tool silhouette."
        ),
    },
]


def copy_history_image(history_item: dict, family: str, variant_id: str, seed: int) -> Path:
    images = []
    for node in history_item.get("outputs", {}).values():
        images.extend(node.get("images", []))
    if not images:
        raise RuntimeError(f"{variant_id} produced no image")
    image = images[0]
    data = selected.get_bytes("/view", {
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    })
    target = OUT_ROOT / family / variant_id / f"flux2-reference-edit-seed{seed}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


def make_contact_sheet(paths: list[tuple[str, str, Path]]) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    thumb_w = 260
    thumb_h = 245
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
    for i, (family, label, path) in enumerate(paths):
        col = i % cols
        row = i // cols
        x = col * thumb_w
        y = row * (thumb_h + label_h)
        draw.rectangle([x, y, x + thumb_w - 1, y + thumb_h + label_h - 1], outline="#cccccc")
        img = Image.open(path).convert("RGB")
        img.thumbnail((thumb_w - 20, thumb_h - 20), Image.Resampling.LANCZOS)
        sheet.paste(img, (x + (thumb_w - img.width) // 2, y + 10 + (thumb_h - 20 - img.height) // 2))
        draw.text((x + 10, y + thumb_h + 8), family, fill="#111111", font=small)
        draw.text((x + 10, y + thumb_h + 28), label, fill="#111111", font=font)
    target = OUT_ROOT / "contact-sheet.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target)
    return target


def main() -> int:
    selected.get_json("/system_stats")
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    selected.COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    manifest = {"adapter": "Flux2 ReferenceLatent", "direction": "clear smooth diamond v2", "runs": []}
    contact: list[tuple[str, str, Path]] = []

    for run in RUNS:
        family = run["family"]
        if not run["base"].exists():
            raise FileNotFoundError(run["base"])
        if not run["current"].exists():
            raise FileNotFoundError(run["current"])

        contact.append((family, f"base {run['base_id']}", run["base"]))
        contact.append((family, "current diamond", run["current"]))

        input_name = f"cellshire_{family}_{run['base_id']}_diamond_v2_ref.png"
        shutil.copy2(run["base"], selected.COMFY_INPUT / input_name)
        variant_id = run["id"]
        seed = run["seed"]
        target = OUT_ROOT / family / variant_id / f"flux2-reference-edit-seed{seed}.png"
        if target.exists():
            print(f"SKIP  {family}/{variant_id} -> {target}", flush=True)
            path = target
            elapsed = 0
        else:
            prompt = f"{DIAMOND_STYLE}\n\n{run['prompt']}"
            label = f"{family}/{variant_id}"
            print(f"QUEUE {label}", flush=True)
            started = time.time()
            history = selected.queue_and_wait(
                selected.flux2_edit_workflow(
                    prompt,
                    input_name,
                    seed,
                    f"cellshire_diamond_v2/{family}/{variant_id}",
                ),
                label,
            )
            path = copy_history_image(history, family, variant_id, seed)
            elapsed = round(time.time() - started, 2)
            print(f"DONE  {label} -> {path} ({elapsed}s)", flush=True)

        manifest["runs"].append({
            "family": family,
            "base_id": run["base_id"],
            "base_file": str(run["base"]),
            "current_file": str(run["current"]),
            "id": variant_id,
            "seed": seed,
            "prompt": run["prompt"],
            "file": str(path),
            "elapsed_sec": elapsed,
        })
        contact.append((family, variant_id, path))
        (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))

    sheet = make_contact_sheet(contact)
    manifest["contact_sheet"] = str(sheet)
    (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"CONTACT {sheet}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
