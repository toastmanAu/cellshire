#!/usr/bin/env python3
"""Generate standalone base candidates for Cellshire tool families."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


SERVER = "127.0.0.1:8188"
OUT_ROOT = Path("tmp/resource-asset-generation/tool-base-candidates")
WIDTH = 1024
HEIGHT = 1024

NEGATIVE_PROMPT = (
    "second tool, multiple tools, hammer, sledgehammer, mallet, shovel, weapon, "
    "character, hand, stone support, platform, base tile, ground tile, crate, "
    "workbench, floor plane, cast shadow, photorealistic, smooth 3d render, "
    "rounded shapes, clay render, low-poly, painterly, watercolor, anime, flat "
    "icon, vector art, text, logo, watermark, complex background, cropped "
    "subject, blurry, noisy edges"
)

STYLE = (
    "Standalone Cellshire inventory and marketplace tool icon. One tool only, "
    "centered and large, fills most of the image area with generous padding. "
    "Voxel object style, Minecraft-style square cube construction, chunky "
    "readable silhouette, orthographic game item icon, plain solid light grey "
    "background. No base, no tile, no platform, no stone support, no extra props. "
    "Keep cubic pixel-grid details exact, no smoothing, no rounding."
)

CANDIDATES = [
    {
        "family": "pickaxe",
        "id": "pickaxe_a_diagonal",
        "seed": 6101,
        "prompt": (
            "A simple mining pickaxe angled diagonally from lower-left handle to "
            "upper-right head. Warm wooden handle, dark iron pickaxe head with "
            "two pointed ends, single object only."
        ),
    },
    {
        "family": "pickaxe",
        "id": "pickaxe_b_side",
        "seed": 6102,
        "prompt": (
            "A clean side-view mining pickaxe profile. Long warm wooden handle, "
            "dark iron head, compact chunky voxel silhouette, single object only."
        ),
    },
    {
        "family": "pickaxe",
        "id": "pickaxe_c_threequarter",
        "seed": 6103,
        "prompt": (
            "A mining pickaxe in slight three-quarter view, floating as a UI item "
            "icon. Warm wooden handle, dark iron head, readable voxel geometry, "
            "single object only."
        ),
    },
    {
        "family": "pickaxe",
        "id": "pickaxe_d_chunky",
        "seed": 6104,
        "prompt": (
            "A short chunky mining pickaxe icon. Thick warm wooden handle, dark "
            "iron head, strong readable silhouette, single object only."
        ),
    },
    {
        "family": "woodaxe",
        "id": "woodaxe_a_diagonal",
        "seed": 6201,
        "prompt": (
            "A simple woodcutting axe angled diagonally. Warm wooden handle, dark "
            "iron axe blade, compact wedge head, single object only. It should "
            "read as a tree-harvesting tool, not a battle axe."
        ),
    },
    {
        "family": "woodaxe",
        "id": "woodaxe_b_side",
        "seed": 6202,
        "prompt": (
            "A clean side-view woodcutting axe profile. Long warm wooden handle, "
            "single dark iron blade head, chunky voxel blade, single object only."
        ),
    },
    {
        "family": "woodaxe",
        "id": "woodaxe_c_hatchet",
        "seed": 6203,
        "prompt": (
            "A compact hatchet-style woodaxe for harvesting timber. Shorter warm "
            "wood handle, broad dark iron blade, sturdy voxel proportions, single "
            "object only."
        ),
    },
    {
        "family": "woodaxe",
        "id": "woodaxe_d_broad",
        "seed": 6204,
        "prompt": (
            "A broad-bladed timber axe icon. Warm wooden handle, wide dark iron "
            "axe head with a clear cutting edge, practical woodcutting tool, "
            "single object only."
        ),
    },
    {
        "family": "hoe_scythe",
        "id": "hoe_a_diagonal",
        "seed": 6301,
        "prompt": (
            "A simple farming hoe angled diagonally. Warm wooden handle, dark iron "
            "rectangular hoe blade at the end, chunky voxel construction, single "
            "object only."
        ),
    },
    {
        "family": "hoe_scythe",
        "id": "hoe_b_side",
        "seed": 6302,
        "prompt": (
            "A clean side-view farming hoe profile. Long warm wooden handle, dark "
            "iron hoe blade set at a right angle, readable crop-farming tool, "
            "single object only."
        ),
    },
    {
        "family": "hoe_scythe",
        "id": "scythe_a_curved",
        "seed": 6303,
        "prompt": (
            "A simple crop harvesting scythe icon. Long warm wooden handle, curved "
            "dark iron blade, practical farm tool silhouette, single object only, "
            "not a fantasy weapon."
        ),
    },
    {
        "family": "hoe_scythe",
        "id": "scythe_b_compact",
        "seed": 6304,
        "prompt": (
            "A compact sickle-style harvesting tool. Short warm wooden handle, "
            "curved dark iron blade, chunky voxel form, clearly for crop harvest, "
            "single object only."
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


def flux1_workflow(prompt: str, seed: int, prefix: str) -> dict:
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


def copy_history_image(history_item: dict, family: str, candidate_id: str, seed: int) -> Path:
    images = []
    for node in history_item.get("outputs", {}).values():
        images.extend(node.get("images", []))
    if not images:
        raise RuntimeError(f"{candidate_id} produced no image")
    image = images[0]
    data = get_bytes("/view", {
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    })
    target = OUT_ROOT / family / candidate_id / f"flux1-schnell-q4-seed{seed}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


def make_contact_sheet(paths: list[tuple[str, str, Path]]) -> Path:
    from PIL import Image, ImageDraw, ImageFont

    thumb_w = 240
    thumb_h = 230
    label_h = 52
    cols = 4
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
    manifest = {"runs": []}
    contact = []
    for candidate in CANDIDATES:
        prompt = f"{STYLE}\n\n{candidate['prompt']}"
        candidate_id = candidate["id"]
        family = candidate["family"]
        seed = candidate["seed"]
        print(f"QUEUE {family}/{candidate_id}", flush=True)
        started = time.time()
        history = queue_and_wait(
            flux1_workflow(prompt, seed, f"cellshire_tool_base/{family}/{candidate_id}"),
            candidate_id,
        )
        path = copy_history_image(history, family, candidate_id, seed)
        elapsed = round(time.time() - started, 2)
        print(f"DONE  {family}/{candidate_id} -> {path} ({elapsed}s)", flush=True)
        manifest["runs"].append({**candidate, "file": str(path), "elapsed_sec": elapsed})
        contact.append((family, candidate_id, path))
        (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    sheet = make_contact_sheet(contact)
    manifest["contact_sheet"] = str(sheet)
    (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"CONTACT {sheet}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
