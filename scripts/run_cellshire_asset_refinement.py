#!/usr/bin/env python3
"""Run Cellshire asset refinement prompts through local ComfyUI.

This pass uses Flux.1 Schnell only. It writes review images to:
  tmp/resource-asset-generation/refinement/
"""

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
OUT_ROOT = Path("tmp/resource-asset-generation/refinement")
WIDTH = 1024
HEIGHT = 1024

NEGATIVE_PROMPT = (
    "photorealistic, smooth 3d render, rounded shapes, clay render, soft toy, "
    "low-poly, painterly, watercolor, anime, flat icon, vector art, UI icon, "
    "text, logo, watermark, complex background, floor plane, cast shadow, "
    "cropped subject, multiple objects, blurry, noisy edges"
)

STYLE = (
    "Single isolated Cellshire game asset, centered with generous padding. "
    "Isometric voxel object style, Minecraft-style pixel cube construction, "
    "30-degree isometric viewing angle, chunky square voxel details, compact "
    "readable silhouette, top-left lighting. Keep the cubic pixel-grid look "
    "exact, no smoothing, no rounding, no glossy plastic. Plain solid light "
    "grey background."
)

FARM_REDO = [
    {
        "id": "farm_plot_empty_v2",
        "seed": 3301,
        "prompt": (
            "A compact empty prepared farm plot on one tile. Square isometric "
            "wooden garden bed with low warm-brown plank border, dark blocky "
            "soil inside, three clear tidy soil rows, no seeds, no sprouts, "
            "no loose decorations. It must match a farm-game crop tile."
        ),
    },
    {
        "id": "farm_plot_starter_crop_v2",
        "seed": 3302,
        "prompt": (
            "A compact starter crop farm plot on one tile. Same square "
            "isometric wooden garden bed with low warm-brown plank border and "
            "dark soil rows, with sparse small green voxel sprouts in neat "
            "rows. Early crop growth only, not mature, no flowers, no big plants."
        ),
    },
]

PICKAXE_BASE = {
    "id": "pickaxe_base",
    "seed": 3310,
    "prompt": (
        "A simple base pickaxe upgrade icon as a small isolated voxel object. "
        "One diagonal pickaxe lying on a tiny neutral stone support tile. Warm "
        "wooden handle, plain dark iron pickaxe head, chunky readable silhouette, "
        "no extra objects."
    ),
}

PICKAXE_VARIANTS = [
    {
        "id": "pickaxe_reinforced_v2",
        "seed": 3311,
        "denoise": 0.34,
        "prompt": (
            "Modify this same pickaxe only. Preserve the exact pose, silhouette, "
            "scale, camera angle, and stone support. Add a reinforced tier look: "
            "slightly darker iron head, one warm metal band around the wooden "
            "handle, a few subtle stone chips. Minor cosmetic upgrade only."
        ),
    },
    {
        "id": "pickaxe_steel_v2",
        "seed": 3312,
        "denoise": 0.34,
        "prompt": (
            "Modify this same pickaxe only. Preserve the exact pose, silhouette, "
            "scale, camera angle, and stone support. Add a steel tier look: "
            "clean brighter steel head, two small iron bands on the wooden "
            "handle, subtle brighter edge highlight. Minor cosmetic upgrade only."
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


def copy_history_images(history_item: dict, asset_id: str, filename: str) -> Path:
    out_dir = OUT_ROOT / asset_id
    out_dir.mkdir(parents=True, exist_ok=True)
    images = []
    for node in history_item.get("outputs", {}).values():
        images.extend(node.get("images", []))
    if not images:
        raise RuntimeError(f"{asset_id} produced no images")
    image = images[0]
    data = get_bytes("/view", {
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    })
    target = out_dir / filename
    target.write_bytes(data)
    return target


def flux1_t2i_workflow(prompt: str, seed: int, prefix: str) -> dict:
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q4_0.gguf"}},
        "2": {"class_type": "DualCLIPLoaderGGUF", "inputs": {
            "clip_name1": "t5-v1_1-xxl-encoder-Q4_K_M.gguf",
            "clip_name2": "clip_l.safetensors",
            "type": "flux",
        }},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4n": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE_PROMPT, "clip": ["2", 0]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}},
        "6": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": 3.5}},
        "7": {"class_type": "KSampler", "inputs": {
            "seed": seed,
            "steps": 8,
            "cfg": 1.0,
            "sampler_name": "euler",
            "scheduler": "simple",
            "denoise": 1.0,
            "model": ["1", 0],
            "positive": ["6", 0],
            "negative": ["4n", 0],
            "latent_image": ["5", 0],
        }},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}},
    }


def flux1_img2img_workflow(prompt: str, image_name: str, seed: int, denoise: float, prefix: str) -> dict:
    workflow = flux1_t2i_workflow(prompt, seed, prefix)
    workflow["0"] = {"class_type": "LoadImage", "inputs": {"image": image_name}}
    workflow["5"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["0", 0], "vae": ["3", 0]}}
    workflow["7"]["inputs"]["latent_image"] = ["5", 0]
    workflow["7"]["inputs"]["denoise"] = denoise
    workflow["7"]["inputs"]["steps"] = 12
    return workflow


def make_contact_sheet(paths: list[tuple[str, Path]]) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    thumb_w = 240
    thumb_h = 240
    label_h = 42
    cols = 3
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
    get_json("/system_stats")
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {"runs": []}
    contact_paths: list[tuple[str, Path]] = []

    for asset in FARM_REDO:
        prompt = f"{STYLE}\n\n{asset['prompt']}"
        label = asset["id"]
        print(f"QUEUE {label}", flush=True)
        started = time.time()
        hist = queue_and_wait(flux1_t2i_workflow(prompt, asset["seed"], f"cellshire_refine/{label}"), label)
        path = copy_history_images(hist, label, f"flux1-schnell-q4-seed{asset['seed']}.png")
        elapsed = round(time.time() - started, 2)
        print(f"DONE  {label} -> {path} ({elapsed}s)", flush=True)
        contact_paths.append((label, path))
        manifest["runs"].append({**asset, "file": str(path), "elapsed_sec": elapsed})

    base_prompt = f"{STYLE}\n\n{PICKAXE_BASE['prompt']}"
    print("QUEUE pickaxe_base", flush=True)
    started = time.time()
    hist = queue_and_wait(flux1_t2i_workflow(base_prompt, PICKAXE_BASE["seed"], "cellshire_refine/pickaxe_base"), "pickaxe_base")
    base_path = copy_history_images(hist, "pickaxe_base", f"flux1-schnell-q4-seed{PICKAXE_BASE['seed']}.png")
    elapsed = round(time.time() - started, 2)
    print(f"DONE  pickaxe_base -> {base_path} ({elapsed}s)", flush=True)
    contact_paths.append(("pickaxe_base", base_path))
    manifest["runs"].append({**PICKAXE_BASE, "file": str(base_path), "elapsed_sec": elapsed})

    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    base_input_name = "cellshire_pickaxe_base_refine.png"
    shutil.copy2(base_path, COMFY_INPUT / base_input_name)
    for asset in PICKAXE_VARIANTS:
        prompt = f"{STYLE}\n\n{asset['prompt']}"
        label = asset["id"]
        print(f"QUEUE {label}", flush=True)
        started = time.time()
        hist = queue_and_wait(
            flux1_img2img_workflow(
                prompt,
                base_input_name,
                asset["seed"],
                asset["denoise"],
                f"cellshire_refine/{label}",
            ),
            label,
        )
        path = copy_history_images(hist, label, f"flux1-img2img-seed{asset['seed']}.png")
        elapsed = round(time.time() - started, 2)
        print(f"DONE  {label} -> {path} ({elapsed}s)", flush=True)
        contact_paths.append((label, path))
        manifest["runs"].append({**asset, "file": str(path), "base_file": str(base_path), "elapsed_sec": elapsed})

    sheet = make_contact_sheet(contact_paths)
    manifest["contact_sheet"] = str(sheet)
    (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"CONTACT {sheet}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
