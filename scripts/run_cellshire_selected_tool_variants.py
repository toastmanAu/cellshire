#!/usr/bin/env python3
"""Generate tiered variants from selected Cellshire tool bases."""

from __future__ import annotations

import json
import shutil
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


SERVER = "127.0.0.1:8188"
COMFY_INPUT = Path("/home/phill/ComfyUI/input")
OUT_ROOT = Path("tmp/resource-asset-generation/selected-tool-variants")
WIDTH = 1024
HEIGHT = 1024

NEGATIVE_PROMPT = (
    "second tool, multiple tools, different pose, different silhouette, different "
    "camera angle, extra handle, character, hand, text, logo, watermark, complex "
    "background, photorealistic, smooth 3d render, painterly, blurry, noisy edges"
)

STYLE = (
    "Edit the reference image as a Cellshire voxel inventory and marketplace "
    "tool icon. Preserve the same single-tool pose, scale, framing, camera angle, "
    "and overall silhouette. Keep the light grey background and voxel cube "
    "construction. Make the requested material/cosmetic tier change clearly "
    "visible without changing the tool family."
)

SELECTED_BASES = [
    {
        "family": "pickaxe",
        "base_id": "pickaxe_b_side",
        "path": Path("tmp/resource-asset-generation/tool-base-candidates/pickaxe/pickaxe_b_side/flux1-schnell-q4-seed6102.png"),
        "variants": [
            {
                "id": "pickaxe_reinforced",
                "seed": 7101,
                "prompt": (
                    "Reinforced pickaxe tier. Preserve the selected pickaxe shape. "
                    "Make the head darker wrought iron, add a dark metal collar near "
                    "the head, add one bronze band on the wooden handle, and deepen "
                    "the wood grain slightly."
                ),
            },
            {
                "id": "pickaxe_steel",
                "seed": 7102,
                "prompt": (
                    "Steel pickaxe tier. Preserve the selected pickaxe shape. Make "
                    "the head cleaner bright steel with crisp edge highlights, add "
                    "two small silver bands on the handle, and polish the wood slightly."
                ),
            },
            {
                "id": "pickaxe_silver",
                "seed": 7103,
                "prompt": (
                    "Silver pickaxe tier. Preserve the selected pickaxe shape. Make "
                    "the head polished pale silver with a softer white-metal sheen, "
                    "add silver caps and a subtle silver grip wrap, and keep the "
                    "wood handle visible."
                ),
            },
            {
                "id": "pickaxe_gold",
                "seed": 7104,
                "prompt": (
                    "Gold pickaxe tier. Preserve the selected pickaxe shape. Make "
                    "the head warm metallic gold with bright voxel highlights, add "
                    "gold collars near the head and handle end, and keep it readable "
                    "as a working mining pickaxe."
                ),
            },
            {
                "id": "pickaxe_diamond",
                "seed": 8105,
                "prompt": (
                    "Clear diamond pickaxe tier. Preserve the selected pickaxe "
                    "shape. Keep one clean pickaxe head, not a gem cluster. Make "
                    "the pick head mostly transparent clear crystal with smooth "
                    "beveled voxel facets, faint white highlights, and only very "
                    "subtle pale cyan along a few edges. Keep the handle visible "
                    "and practical."
                ),
            },
        ],
    },
    {
        "family": "woodaxe",
        "base_id": "woodaxe_b_side",
        "path": Path("tmp/resource-asset-generation/tool-base-candidates/woodaxe/woodaxe_b_side/flux1-schnell-q4-seed6202.png"),
        "variants": [
            {
                "id": "woodaxe_reinforced",
                "seed": 7201,
                "prompt": (
                    "Reinforced woodaxe tier. Preserve the selected woodaxe shape. "
                    "Make the axe blade darker wrought iron, add one bronze collar "
                    "where the blade meets the handle, add a darker grip band, and "
                    "keep it practical for timber harvesting."
                ),
            },
            {
                "id": "woodaxe_steel",
                "seed": 7202,
                "prompt": (
                    "Steel woodaxe tier. Preserve the selected woodaxe shape. Make "
                    "the blade bright steel with a sharp clean cutting edge, add two "
                    "small silver bands on the handle, and make the wood cleaner."
                ),
            },
            {
                "id": "woodaxe_silver",
                "seed": 7203,
                "prompt": (
                    "Silver woodaxe tier. Preserve the selected woodaxe shape. Make "
                    "the axe blade polished pale silver with soft white-metal highlights, "
                    "add silver collars on the handle, and keep it clearly a practical "
                    "timber harvesting axe."
                ),
            },
            {
                "id": "woodaxe_gold",
                "seed": 7204,
                "prompt": (
                    "Gold woodaxe tier. Preserve the selected woodaxe shape. Make "
                    "the axe blade warm metallic gold with crisp voxel highlights, "
                    "add gold collars and a darker premium handle grip, and keep the "
                    "same single-tool framing."
                ),
            },
            {
                "id": "woodaxe_diamond",
                "seed": 8205,
                "prompt": (
                    "Clear diamond woodaxe tier. Preserve the selected woodaxe "
                    "shape. Keep one smooth axe blade, not loose crystal chunks. "
                    "Make the blade a clear polished diamond/glass axe head with "
                    "smooth beveled voxel facets, white shine, and subtle pale "
                    "icy-cyan edge glints. Preserve the wooden handle and original "
                    "woodaxe silhouette."
                ),
            },
        ],
    },
    {
        "family": "hoe_scythe",
        "base_id": "hoe_b_side",
        "path": Path("tmp/resource-asset-generation/tool-base-candidates/hoe_scythe/hoe_b_side/flux1-schnell-q4-seed6302.png"),
        "variants": [
            {
                "id": "hoe_reinforced",
                "seed": 7301,
                "prompt": (
                    "Reinforced hoe tier. Preserve the selected farming hoe shape. "
                    "Make the blade darker wrought iron, add one bronze collar near "
                    "the blade, add a simple darker handle band, and keep it clearly "
                    "a crop-farming tool."
                ),
            },
            {
                "id": "hoe_steel",
                "seed": 7302,
                "prompt": (
                    "Steel hoe tier. Preserve the selected farming hoe shape. Make "
                    "the blade bright clean steel with a crisp edge highlight, add "
                    "two silver bands on the handle, and polish the wood slightly."
                ),
            },
            {
                "id": "hoe_silver",
                "seed": 7303,
                "prompt": (
                    "Silver hoe tier. Preserve the selected farming hoe shape. Make "
                    "the blade polished pale silver with soft white-metal highlights, "
                    "add silver collars near the blade and grip, and keep it clearly "
                    "a crop-farming tool."
                ),
            },
            {
                "id": "hoe_gold",
                "seed": 7304,
                "prompt": (
                    "Gold hoe tier. Preserve the selected farming hoe shape. Make "
                    "the blade warm metallic gold with bright voxel highlights, add "
                    "gold collars and a premium darker handle grip, and keep the "
                    "same pose and framing."
                ),
            },
            {
                "id": "hoe_diamond",
                "seed": 8305,
                "prompt": (
                    "Clear diamond farming hoe tier. Preserve the selected farming "
                    "hoe shape. Keep one smooth hoe blade, not a bumpy crystal row. "
                    "Make the blade polished transparent diamond/glass with smooth "
                    "beveled voxel facets, white glossy highlights, and only subtle "
                    "pale cyan edge glints. Preserve the long wooden handle and the "
                    "original farming-tool silhouette."
                ),
            },
        ],
    },
]


def post_json(path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"http://{SERVER}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def get_json(path: str, timeout: int = 30) -> dict:
    with urllib.request.urlopen(f"http://{SERVER}{path}", timeout=timeout) as resp:
        return json.loads(resp.read())


def get_bytes(path: str, query: dict) -> bytes:
    qs = urllib.parse.urlencode(query)
    with urllib.request.urlopen(f"http://{SERVER}{path}?{qs}", timeout=60) as resp:
        return resp.read()


def queue_and_wait(workflow: dict, label: str, timeout_s: int = 1500) -> dict:
    result = post_json("/prompt", {"prompt": workflow, "client_id": str(uuid.uuid4())})
    prompt_id = result["prompt_id"]
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        history = get_json(f"/history/{prompt_id}", timeout=30)
        if prompt_id in history:
            item = history[prompt_id]
            status = item.get("status", {})
            if not status.get("completed", False):
                raise RuntimeError(f"{label} failed: {status}")
            return item
        time.sleep(2)
    raise TimeoutError(f"{label} timed out waiting for {prompt_id}")


def flux2_edit_workflow(prompt: str, image_name: str, seed: int, prefix: str) -> dict:
    return {
        "0": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "1": {"class_type": "ImageScaleToTotalPixels", "inputs": {
            "image": ["0", 0],
            "upscale_method": "nearest-exact",
            "megapixels": 1.0,
            "resolution_steps": 1,
        }},
        "2": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "flux-2-klein-base-4b.safetensors",
            "weight_dtype": "default",
        }},
        "3": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "flux2_klein_qwen3_merged.safetensors",
            "type": "flux2",
        }},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-klein-vae.safetensors"}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["3", 0]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE_PROMPT, "clip": ["3", 0]}},
        "7": {"class_type": "VAEEncode", "inputs": {"pixels": ["1", 0], "vae": ["4", 0]}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["5", 0], "latent": ["7", 0]}},
        "9": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["6", 0], "latent": ["7", 0]}},
        "10": {"class_type": "CFGGuider", "inputs": {
            "model": ["2", 0],
            "positive": ["8", 0],
            "negative": ["9", 0],
            "cfg": 5.0,
        }},
        "11": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "12": {"class_type": "Flux2Scheduler", "inputs": {"steps": 20, "width": WIDTH, "height": HEIGHT}},
        "13": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "14": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}},
        "15": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["13", 0],
            "guider": ["10", 0],
            "sampler": ["11", 0],
            "sigmas": ["12", 0],
            "latent_image": ["14", 0],
        }},
        "16": {"class_type": "VAEDecode", "inputs": {"samples": ["15", 0], "vae": ["4", 0]}},
        "17": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["16", 0]}},
    }


def copy_history_image(history_item: dict, family: str, variant_id: str, seed: int) -> Path:
    images = []
    for node in history_item.get("outputs", {}).values():
        images.extend(node.get("images", []))
    if not images:
        raise RuntimeError(f"{variant_id} produced no image")
    image = images[0]
    data = get_bytes("/view", {
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    })
    target = variant_output_path(family, variant_id, seed)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


def variant_output_path(family: str, variant_id: str, seed: int) -> Path:
    return OUT_ROOT / family / variant_id / f"flux2-reference-edit-seed{seed}.png"


def make_contact_sheet(paths: list[tuple[str, str, Path]]) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    thumb_w = 240
    thumb_h = 230
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
    get_json("/system_stats")
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    manifest = {"adapter": "Flux2 ReferenceLatent", "runs": []}
    contact: list[tuple[str, str, Path]] = []
    for base in SELECTED_BASES:
        family = base["family"]
        base_path = base["path"]
        if not base_path.exists():
            raise FileNotFoundError(base_path)
        input_name = f"cellshire_{family}_{base['base_id']}_selected.png"
        shutil.copy2(base_path, COMFY_INPUT / input_name)
        contact.append((family, f"base {base['base_id']}", base_path))
        for variant in base["variants"]:
            variant_id = variant["id"]
            seed = variant["seed"]
            existing = variant_output_path(family, variant_id, seed)
            if existing.exists():
                print(f"SKIP  {family}/{variant_id} -> {existing}", flush=True)
                contact.append((family, variant_id, existing))
                manifest["runs"].append({
                    "family": family,
                    "base_id": base["base_id"],
                    "base_file": str(base_path),
                    **variant,
                    "file": str(existing),
                    "elapsed_sec": 0,
                    "skipped_existing": True,
                })
                continue
            prompt = f"{STYLE}\n\n{variant['prompt']}"
            label = f"{family}/{variant_id}"
            print(f"QUEUE {label}", flush=True)
            started = time.time()
            history = queue_and_wait(
                flux2_edit_workflow(
                    prompt,
                    input_name,
                    seed,
                    f"cellshire_selected_tools/{family}/{variant_id}",
                ),
                label,
            )
            path = copy_history_image(history, family, variant_id, seed)
            elapsed = round(time.time() - started, 2)
            print(f"DONE  {label} -> {path} ({elapsed}s)", flush=True)
            manifest["runs"].append({
                "family": family,
                "base_id": base["base_id"],
                "base_file": str(base_path),
                **variant,
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
