#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate four fresh harvest_tree candidates with different visual directions.

The original three variants (oak / pine / stump) all leaned generic-voxel-tree.
This batch tries four different silhouettes so the harvest_tree slot gets
a wider option set to pick from.

Outputs at tmp/harvest-tree-redo/<id>.png plus a markdown contact sheet.
Uses the same Flux.1 Schnell GGUF pipeline as the township visual batch.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / "tmp" / "harvest-tree-redo"
SERVER = "127.0.0.1:8188"
WIDTH = 1024
HEIGHT = 1024


STYLE = (
    "Single isolated Cellshire harvestable timber tree, centered with generous "
    "padding. Isometric voxel object style, Minecraft-style pixel cube "
    "construction, 30-degree isometric viewing angle, chunky square voxel "
    "details, strong readable one-tile silhouette, top-left lighting. Keep "
    "the cubic pixel-grid look exact, no smoothing, no rounding, no glossy "
    "plastic. Reads clearly as a wood harvest resource node, not a decorative "
    "tree. Plain solid light grey background."
)


NEGATIVE = (
    "photorealistic, smooth 3d render, rounded shapes, clay render, soft toy, "
    "low-poly mesh, painterly, watercolor, anime, flat icon, vector art, UI "
    "icon, text, logo, watermark, complex background, floor plane, cast "
    "shadow, cropped subject, multiple objects, blurry, generic christmas tree"
)


@dataclass(frozen=True)
class TreePrompt:
    id: str
    seed: int
    prompt: str


PROMPTS: list[TreePrompt] = [
    TreePrompt(
        "harvest_tree_d_gnarled_oak", 10110,
        "Gnarled stylized oak harvest tree on one tile. Thick warm brown voxel "
        "trunk with a single pronounced bend or fork low down, wide bushy deep "
        "green canopy that reads as ripe for harvest, two exposed cut-branch "
        "ends with light fresh-wood faces. Mossy roots at base. Compact and "
        "readable as a wood resource node at game distance."
    ),
    TreePrompt(
        "harvest_tree_e_tall_pine", 10111,
        "Tall stylized layered pine harvest tree on one tile. Slim warm brown "
        "trunk with several distinct horizontal voxel branch tiers stepping "
        "downward, each tier a layer of dark teal-green needle cubes. Cut "
        "marks on lower trunk showing light cream wood. Silhouette is "
        "pyramidal and instantly recognisable as a wood source."
    ),
    TreePrompt(
        "harvest_tree_f_bushy_dome", 10112,
        "Bushy domed broadleaf harvest tree on one tile. Compact warm brown "
        "trunk, oversized rounded mushroom-shaped canopy of soft sage-and-deep "
        "green voxels with visible leaf-cube clumps, three lower branches "
        "stripped to bare wood showing they have been recently chopped. "
        "Compact silhouette that reads as a fully grown harvest tree."
    ),
    TreePrompt(
        "harvest_tree_g_log_pile", 10113,
        "Harvest tree mid-chop on one tile. A medium warm brown voxel tree "
        "with a smaller-than-usual canopy of deep green leaves and a clear "
        "axe-bite notch in the trunk, plus a stacked pair of freshly cut warm "
        "cream log cubes at its base. Visibly a tree being actively harvested "
        "for wood — gameplay-readable resource node."
    ),
]


# ── ComfyUI plumbing (lifted from run_cellshire_township_visual_batch) ──


def post_json(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"http://{SERVER}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def get_json(path: str, timeout: int = 30) -> dict:
    with urllib.request.urlopen(f"http://{SERVER}{path}", timeout=timeout) as resp:
        return json.loads(resp.read())


def get_bytes(path: str, query: dict) -> bytes:
    qs = urllib.parse.urlencode(query)
    with urllib.request.urlopen(f"http://{SERVER}{path}?{qs}", timeout=120) as resp:
        return resp.read()


def flux_workflow(prompt: str, seed: int, prefix: str) -> dict:
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q4_0.gguf"}},
        "2": {"class_type": "DualCLIPLoaderGGUF", "inputs": {
            "clip_name1": "t5-v1_1-xxl-encoder-Q4_K_M.gguf",
            "clip_name2": "clip_l.safetensors",
            "type": "flux",
        }},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "4n": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["2", 0]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1}},
        "6": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": 3.5}},
        "7": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": 8, "cfg": 1.0,
            "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
            "model": ["1", 0], "positive": ["6", 0], "negative": ["4n", 0],
            "latent_image": ["5", 0],
        }},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}},
    }


def queue_and_fetch(prompt: TreePrompt) -> Path:
    full_prompt = f"{STYLE}\n\n{prompt.prompt}"
    workflow = flux_workflow(full_prompt, prompt.seed, f"cellshire-tree/{prompt.id}")
    result = post_json("/prompt", {"prompt": workflow, "client_id": str(uuid.uuid4())})
    prompt_id = result["prompt_id"]
    deadline = time.time() + 600
    while time.time() < deadline:
        try:
            history = get_json(f"/history/{prompt_id}", timeout=30)
        except Exception:
            time.sleep(2)
            continue
        if prompt_id in history:
            item = history[prompt_id]
            if not item.get("status", {}).get("completed", False):
                raise RuntimeError(f"{prompt.id} failed: {item.get('status')}")
            images = []
            for node in item.get("outputs", {}).values():
                images.extend(node.get("images", []))
            if not images:
                raise RuntimeError(f"{prompt.id}: no image returned")
            data = get_bytes("/view", {
                "filename": images[0]["filename"],
                "subfolder": images[0].get("subfolder", ""),
                "type": images[0].get("type", "output"),
            })
            OUT_ROOT.mkdir(parents=True, exist_ok=True)
            out = OUT_ROOT / f"{prompt.id}.png"
            out.write_bytes(data)
            return out
        time.sleep(2)
    raise TimeoutError(f"{prompt.id}: timed out")


def write_contact_sheet(generated: list[tuple[TreePrompt, Path]]) -> Path:
    sheet = OUT_ROOT / "audition.html"
    blocks = []
    for p, path in generated:
        rel = path.name
        blocks.append(
            f'<div class="card"><img src="{rel}" alt="{p.id}">'
            f'<div class="meta"><label><input type="radio" name="tree" value="{p.id}"> '
            f'<strong>{p.id}</strong> · seed {p.seed}</label></div>'
            f'<div class="prompt">{p.prompt}</div></div>'
        )
    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Harvest Tree Redo</title>
<style>
:root{{color-scheme:dark}}
body{{font:14px/1.5 system-ui,sans-serif;background:#161819;color:#e8e8e8;max-width:1200px;margin:1.5rem auto;padding:0 1.5rem}}
h1{{font-size:1.4rem;margin:0 0 1rem}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}}
.card{{border:1px solid #2c3134;border-radius:6px;background:#1d2123;overflow:hidden;display:flex;flex-direction:column}}
.card img{{width:100%;height:320px;object-fit:contain;background:#0c0e0f;display:block}}
.meta{{padding:.5rem .7rem;font-size:.9rem}}
.prompt{{color:#9aa0a4;font-style:italic;font-size:.82rem;padding:0 .7rem .7rem}}
#export{{position:fixed;bottom:1rem;right:1rem;padding:.5rem .9rem;background:#2a8c5b;color:#fff;border:0;border-radius:6px;font:inherit;cursor:pointer}}
#out{{position:fixed;bottom:4rem;right:1rem;max-width:560px;padding:.75rem;background:#0c0e0f;border:1px solid #2c3134;border-radius:6px;white-space:pre;font:12px/1.4 ui-monospace,monospace;display:none}}
</style></head>
<body>
<h1>Harvest Tree — Round 2</h1>
<p style="color:#9aa0a4">Four new directions. Pick a winner or shout if none land — I can swing further.</p>
<div class="grid">
{''.join(blocks)}
</div>
<button id="export">Export selection</button>
<pre id="out"></pre>
<script>
document.getElementById('export').addEventListener('click',()=>{{
  const s=document.querySelector('input[name=tree]:checked');
  const o=document.getElementById('out');
  if(!s){{o.textContent='(no selection)';o.style.display='block';return}}
  o.textContent=`chosen: ${{s.value}}`;
  o.style.display='block';
}});
</script>
</body></html>
"""
    sheet.write_text(html)
    return sheet


def main() -> int:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    generated: list[tuple[TreePrompt, Path]] = []
    started = time.time()
    for idx, p in enumerate(PROMPTS, 1):
        print(f"[{idx}/{len(PROMPTS)}] {p.id} ...", end=" ", flush=True)
        try:
            path = queue_and_fetch(p)
            generated.append((p, path))
            print(f"{time.time() - started:.1f}s cum")
        except Exception as e:
            print(f"FAILED ({e})")
    sheet = write_contact_sheet(generated)
    print(f"\nDone. Audition: {sheet.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
