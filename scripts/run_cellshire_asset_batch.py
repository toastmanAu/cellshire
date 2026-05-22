#!/usr/bin/env python3
"""Run Cellshire asset prompts through local ComfyUI.

Outputs are copied from ComfyUI into:
  tmp/resource-asset-generation/<asset-id>/<model>-seed<seed>.png
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


SERVER = "127.0.0.1:8188"
OUT_ROOT = Path("tmp/resource-asset-generation")
WIDTH = 1024
HEIGHT = 1024

NEGATIVE_PROMPT = (
    "photorealistic, smooth 3d render, rounded shapes, clay render, soft toy, "
    "low-poly, painterly, watercolor, anime, flat icon, vector art, UI icon, "
    "text, logo, watermark, complex background, floor plane, cast shadow, "
    "cropped subject, multiple objects, blurry, noisy edges"
)

STYLE = (
    "Single isolated game asset, centered with generous padding. Same isometric "
    "voxel object style as Cellshire, Minecraft-style pixel cube construction, "
    "30-degree isometric viewing angle, chunky square voxel details, compact "
    "readable silhouette, consistent top-left lighting. Keep the cubic "
    "pixel-grid look exact, no smoothing, no rounding, no glossy plastic, no "
    "realistic render. Plain solid light grey background."
)

ASSETS = [
    {
        "id": "workbench",
        "seed": 2201,
        "prompt": "A compact crafting workbench for a cozy mining settlement. Warm oak-brown voxel planks, sturdy tabletop, small tool cubes, a clamp, stacked crafting materials. Readable as a workbench from game distance and fits one home-base tile.",
    },
    {
        "id": "tool_rack",
        "seed": 2202,
        "prompt": "A compact tool rack for pickaxe upgrades. Warm brown voxel wood with dark iron brackets. Two visible pickaxe shapes, a hammer shape, small metal tool heads, arranged on a simple upright rack. Compact and readable in one tile.",
    },
    {
        "id": "sawmill",
        "seed": 2203,
        "prompt": "A tiny home-base sawmill for wood processing. Warm timber voxel beams, a small saw frame, stacked log cubes, plank piles, dark iron blade details. Functional building upgrade, compact enough for a home-base tile.",
    },
    {
        "id": "stone_yard",
        "seed": 2204,
        "prompt": "A compact stone yard for masonry processing. Grey limestone voxel blocks, dark slate blocks, a small chisel bench, stacked cut stone cubes, freshly chipped light faces. Home-base stone processing station, not an ore deposit.",
    },
    {
        "id": "farm_storage",
        "seed": 2205,
        "prompt": "Compact farm storage for a cozy home base. Warm wooden voxel crates, a small roofed bin, sacks, crop baskets, a few green vegetable cubes. Reads as storage capacity for farming, not a market stall.",
    },
    {
        "id": "harvest_tree",
        "seed": 2206,
        "prompt": "A harvestable timber tree for a cozy mining town. Chunky warm brown voxel wood trunk, compact deep green voxel leaf canopy, a few cuttable branch cubes visible. Reads as a resource node players can harvest for wood.",
    },
    {
        "id": "stone_outcrop",
        "seed": 2207,
        "prompt": "A harvestable stone outcrop for building materials. Grey limestone and dark slate voxel cubes, chipped angular blocks, lighter freshly-broken faces. Construction stone, not a crypto ore deposit.",
    },
    {
        "id": "gold_nugget_node",
        "seed": 2208,
        "prompt": "A small gold nugget resource node for crafting. Warm metallic yellow-gold voxel cubes as distinct nuggets in a dark stone matrix. Gold concentrated in a few chunky visible nuggets rather than coating the whole rock.",
    },
    {
        "id": "farm_plot_empty",
        "seed": 2209,
        "prompt": "An empty prepared farm plot. Clear voxel soil rows, small raised wooden edges, compact readable farm-game silhouette. No plants yet, tidy dark soil ready for planting.",
    },
    {
        "id": "farm_plot_starter_crop",
        "seed": 2210,
        "prompt": "A starter crop farm plot. Dark voxel soil rows with small blocky green shoots and a few compact leafy crop cubes. Clearly early growth, not fully mature.",
    },
    {
        "id": "farm_plot_ready_crop",
        "seed": 2211,
        "prompt": "A mature harvest-ready crop plot. Dense blocky green leaves, a few warm yellow crop cubes, clear soil rows still visible between plants. Reads as ready to harvest.",
    },
    {
        "id": "pickaxe_reinforced",
        "seed": 2212,
        "prompt": "A reinforced pickaxe upgrade icon as a small placeable voxel object. Warm wooden handle, dark iron pickaxe head, stone chips near the base, one simple metal band. Clear chunky silhouette.",
    },
    {
        "id": "pickaxe_steel",
        "seed": 2213,
        "prompt": "A steel pickaxe upgrade icon as a small placeable voxel object. Dark polished steel pickaxe head, reinforced warm wooden handle, two iron bands, subtle bright edge on the tool head. Higher-tier but not magical or oversized.",
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


def queue_and_wait(workflow: dict, label: str, timeout_s: int = 1800) -> dict:
    client_id = str(uuid.uuid4())
    result = post_json("/prompt", {"prompt": workflow, "client_id": client_id})
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


def copy_history_images(history_item: dict, asset_id: str, model_id: str, seed: int) -> list[str]:
    out_dir = OUT_ROOT / asset_id
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    images = []
    for node in history_item.get("outputs", {}).values():
        images.extend(node.get("images", []))
    for index, image in enumerate(images):
        data = get_bytes("/view", {
            "filename": image["filename"],
            "subfolder": image.get("subfolder", ""),
            "type": image.get("type", "output"),
        })
        suffix = f"-{index + 1}" if len(images) > 1 else ""
        target = out_dir / f"{model_id}-seed{seed}{suffix}.png"
        target.write_bytes(data)
        saved.append(str(target))
    return saved


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


def flux2_workflow(prompt: str, seed: int, prefix: str) -> dict:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {
            "unet_name": "flux-2-klein-base-4b.safetensors",
            "weight_dtype": "default",
        }},
        "2": {"class_type": "CLIPLoader", "inputs": {
            "clip_name": "flux2_klein_qwen3_merged.safetensors",
            "type": "flux2",
        }},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-klein-vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4n": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE_PROMPT, "clip": ["2", 0]}},
        "5": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": 3.25}},
        "6": {"class_type": "BasicGuider", "inputs": {"model": ["1", 0], "conditioning": ["5", 0]}},
        "7": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "8": {"class_type": "Flux2Scheduler", "inputs": {"steps": 28, "width": WIDTH, "height": HEIGHT}},
        "9": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "10": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}},
        "11": {"class_type": "SamplerCustomAdvanced", "inputs": {
            "noise": ["9", 0],
            "guider": ["6", 0],
            "sampler": ["7", 0],
            "sigmas": ["8", 0],
            "latent_image": ["10", 0],
        }},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["3", 0]}},
        "13": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["12", 0]}},
    }


def main() -> int:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "server": SERVER,
        "width": WIDTH,
        "height": HEIGHT,
        "negative_prompt": NEGATIVE_PROMPT,
        "runs": [],
    }
    get_json("/system_stats")
    for asset in ASSETS:
        asset_id = asset["id"]
        seed = asset["seed"]
        prompt = f"{STYLE}\n\n{asset['prompt']}"
        for model_id, builder in (
            ("flux1-schnell-q4", flux1_workflow),
            ("flux2-klein-base-4b", flux2_workflow),
        ):
            prefix = f"cellshire_asset_generation/{asset_id}/{model_id}-seed{seed}"
            label = f"{asset_id} / {model_id}"
            print(f"QUEUE {label}", flush=True)
            started = time.time()
            history = queue_and_wait(builder(prompt, seed, prefix), label)
            saved = copy_history_images(history, asset_id, model_id, seed)
            elapsed = round(time.time() - started, 2)
            print(f"DONE  {label} -> {saved} ({elapsed}s)", flush=True)
            manifest["runs"].append({
                "asset_id": asset_id,
                "model": model_id,
                "seed": seed,
                "elapsed_sec": elapsed,
                "prompt": prompt,
                "files": saved,
            })
            (OUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
