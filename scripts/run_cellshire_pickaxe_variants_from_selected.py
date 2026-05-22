#!/usr/bin/env python3
"""Generate pickaxe upgrade variants from the selected base image."""

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
OUT_ROOT = Path("tmp/resource-asset-generation/pickaxe-selected-variants")

NEGATIVE_PROMPT = (
    "hammer, sledgehammer, mallet, axe, shovel, hoe, second tool, multiple tools, "
    "new pose, different silhouette, different camera angle, extra handle, extra "
    "pickaxe head, character, hand, photorealistic, smooth 3d render, rounded "
    "shapes, clay render, painterly, watercolor, anime, flat icon, vector art, "
    "text, logo, watermark, complex background, blurry, noisy edges"
)

STYLE = (
    "Edit the input image into a Cellshire voxel game tool icon. Preserve the "
    "same pickaxe pose, same scale, same framing, same camera angle, and same "
    "overall silhouette. One pickaxe only. Keep the voxel cube construction and "
    "plain light grey background. Make only material and cosmetic changes."
)

VARIANTS = [
    {
        "id": "pickaxe_reinforced",
        "seed": 5501,
        "denoise": 0.44,
        "prompt": (
            "Reinforced tier: make the pickaxe head darker wrought iron, add one "
            "small bronze or dark metal band around the handle near the head, "
            "slightly deepen the handle grain, keep the same base shape and pose."
        ),
    },
    {
        "id": "pickaxe_steel",
        "seed": 5502,
        "denoise": 0.44,
        "prompt": (
            "Steel tier: make the pickaxe head cleaner brighter steel with a "
            "subtle sharp edge highlight, add two small iron bands on the handle, "
            "slightly cleaner polished finish, keep the same base shape and pose."
        ),
    },
    {
        "id": "pickaxe_reinforced_alt",
        "seed": 5503,
        "denoise": 0.52,
        "prompt": (
            "Reinforced tier alternate: preserve pose and silhouette, dark iron "
            "head, heavier head collar, one metal band on the wood handle, subtle "
            "rugged wear, no extra tools."
        ),
    },
    {
        "id": "pickaxe_steel_alt",
        "seed": 5504,
        "denoise": 0.52,
        "prompt": (
            "Steel tier alternate: preserve pose and silhouette, brighter steel "
            "head, crisp edge highlight, two neat metal handle bands, cleaner "
            "higher-tier finish, no extra tools."
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


def workflow(prompt: str, image_name: str, seed: int, denoise: float, prefix: str) -> dict:
    return {
        "0": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q4_0.gguf"}},
        "2": {"class_type": "DualCLIPLoaderGGUF", "inputs": {
            "clip_name1": "t5-v1_1-xxl-encoder-Q4_K_M.gguf",
            "clip_name2": "clip_l.safetensors",
            "type": "flux",
        }},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4n": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE_PROMPT, "clip": ["2", 0]}},
        "5": {"class_type": "VAEEncode", "inputs": {"pixels": ["0", 0], "vae": ["3", 0]}},
        "6": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": 3.5}},
        "7": {"class_type": "KSampler", "inputs": {
            "seed": seed,
            "steps": 14,
            "cfg": 1.0,
            "sampler_name": "euler",
            "scheduler": "simple",
            "denoise": denoise,
            "model": ["1", 0],
            "positive": ["6", 0],
            "negative": ["4n", 0],
            "latent_image": ["5", 0],
        }},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}},
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
    target = OUT_ROOT / variant_id / f"flux1-img2img-seed{seed}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


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
    if not BASE_IMAGE.exists():
        raise FileNotFoundError(BASE_IMAGE)
    get_json("/system_stats")
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    input_name = "cellshire_pickaxe_c_threequarter_selected.png"
    shutil.copy2(BASE_IMAGE, COMFY_INPUT / input_name)

    manifest = {
        "base": str(BASE_IMAGE),
        "runs": [],
    }
    contact: list[tuple[str, Path]] = [("selected_base", BASE_IMAGE)]
    for variant in VARIANTS:
        variant_id = variant["id"]
        seed = variant["seed"]
        prompt = f"{STYLE}\n\n{variant['prompt']}"
        print(f"QUEUE {variant_id}", flush=True)
        started = time.time()
        history = queue_and_wait(
            workflow(
                prompt,
                input_name,
                seed,
                variant["denoise"],
                f"cellshire_pickaxe_selected/{variant_id}",
            ),
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
