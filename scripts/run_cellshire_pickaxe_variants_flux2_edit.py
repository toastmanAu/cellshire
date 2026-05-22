#!/usr/bin/env python3
"""Generate pickaxe variants using Flux.2 edit-model reference conditioning."""

from __future__ import annotations

import json
import shutil
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


SERVER = "127.0.0.1:8188"
BASE_IMAGE = Path(
    "tmp/resource-asset-generation/pickaxe-base-candidates/"
    "pickaxe_base_c_threequarter/flux1-schnell-q4-seed4403.png"
)
COMFY_INPUT = Path("/home/phill/ComfyUI/input")
OUT_ROOT = Path("tmp/resource-asset-generation/pickaxe-flux2-edit-variants")
WIDTH = 1024
HEIGHT = 1024

NEGATIVE_PROMPT = (
    "hammer, sledgehammer, mallet, axe, shovel, hoe, second tool, multiple tools, "
    "different pose, different silhouette, different camera angle, extra handle, "
    "extra pickaxe head, character, hand, text, logo, watermark, complex background, "
    "photorealistic, smooth 3d render, painterly, blurry"
)

STYLE = (
    "Edit the reference image as a Cellshire voxel inventory tool icon. Preserve "
    "the same single pickaxe pose, same scale, same framing, same camera angle, "
    "and same overall silhouette. One pickaxe only. Keep the light grey background "
    "and voxel cube construction. Make the requested material/cosmetic changes "
    "clearly visible."
)

VARIANTS = [
    {
        "id": "pickaxe_reinforced",
        "seed": 6601,
        "prompt": (
            "Reinforced tier. Preserve the original pickaxe exactly except for "
            "materials: make the head dark wrought iron, add a dark metal collar "
            "where the head meets the handle, add one bronze band on the handle, "
            "slightly darker rugged wood grain."
        ),
    },
    {
        "id": "pickaxe_steel",
        "seed": 6602,
        "prompt": (
            "Steel tier. Preserve the original pickaxe exactly except for "
            "materials: make the head bright clean steel with crisp light edge "
            "highlights, add two small silver bands on the handle, make the wood "
            "slightly cleaner and polished."
        ),
    },
    {
        "id": "pickaxe_gold_trim",
        "seed": 6603,
        "prompt": (
            "Premium marketplace variant. Preserve the original pickaxe exactly "
            "except for materials: dark steel head with a small gold trim line, "
            "gold collar near the head, warm polished wooden handle. Still a "
            "practical mining pickaxe, not magical."
        ),
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


def queue_and_wait(workflow: dict, label: str, timeout_s: int = 1200) -> dict:
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
        "14": {"class_type": "EmptyFlux2LatentImage", "inputs": {
            "width": WIDTH,
            "height": HEIGHT,
            "batch_size": 1,
        }},
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


def copy_history_image(history_item: dict, variant_id: str, seed: int) -> Path:
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
    target = OUT_ROOT / variant_id / f"flux2-reference-edit-seed{seed}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


def make_contact_sheet(paths: list[tuple[str, Path]]) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    thumb_w = 240
    thumb_h = 240
    label_h = 42
    cols = 2
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + label_h)), "#f2f2f2")
    draw = ImageDraw.Draw(sheet)
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
        img = Image.open(path).convert("RGB")
        img.thumbnail((thumb_w - 20, thumb_h - 20), Image.Resampling.LANCZOS)
        sheet.paste(img, (x + (thumb_w - img.width) // 2, y + 10 + (thumb_h - 20 - img.height) // 2))
        draw.text((x + 10, y + thumb_h + 10), label, fill="#111111", font=font)
    target = OUT_ROOT / "contact-sheet.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(target)
    return target


def main() -> int:
    if not BASE_IMAGE.exists():
        raise FileNotFoundError(BASE_IMAGE)
    get_json("/system_stats")
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    input_name = "cellshire_pickaxe_c_threequarter_selected.png"
    shutil.copy2(BASE_IMAGE, COMFY_INPUT / input_name)

    manifest = {"base": str(BASE_IMAGE), "adapter": "Flux2 ReferenceLatent", "runs": []}
    contact: list[tuple[str, Path]] = [("selected_base", BASE_IMAGE)]
    for variant in VARIANTS:
        variant_id = variant["id"]
        seed = variant["seed"]
        prompt = f"{STYLE}\n\n{variant['prompt']}"
        print(f"QUEUE {variant_id}", flush=True)
        started = time.time()
        history = queue_and_wait(
            flux2_edit_workflow(prompt, input_name, seed, f"cellshire_pickaxe_flux2_edit/{variant_id}"),
            variant_id,
        )
        path = copy_history_image(history, variant_id, seed)
        elapsed = round(time.time() - started, 2)
        print(f"DONE  {variant_id} -> {path} ({elapsed}s)", flush=True)
        manifest["runs"].append({**variant, "file": str(path), "elapsed_sec": elapsed})
        contact.append((variant_id, path))
        (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    sheet = make_contact_sheet(contact)
    manifest["contact_sheet"] = str(sheet)
    (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"CONTACT {sheet}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
