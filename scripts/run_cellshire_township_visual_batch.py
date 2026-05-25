#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Run the Cellshire township / interior / NPC visual batch.

Same ComfyUI + Flux.1 Schnell GGUF pipeline as
``run_cellshire_building_candidates.py``. Outputs land in
``tmp/township-visual-generation/<parent>/<id>.png`` plus per-tier
contact sheets.

Usage::

    python3 scripts/run_cellshire_township_visual_batch.py
    python3 scripts/run_cellshire_township_visual_batch.py --tier buildings
    python3 scripts/run_cellshire_township_visual_batch.py --only township_store
    python3 scripts/run_cellshire_township_visual_batch.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from cellshire_township_visual_catalog import (  # noqa: E402
    all_prompts,
    negative_for_tier,
    prompts_for_tier,
    style_for_tier,
    VisualPrompt,
)


SERVER = "127.0.0.1:8188"
OUT_ROOT = ROOT / "tmp" / "township-visual-generation"

# Interior backdrops want landscape framing; buildings + NPCs want square.
DIMS_BY_TIER = {
    "buildings": (1024, 1024),
    "interiors": (1280, 720),
    "npcs": (1024, 1024),
    "boot": (1536, 896),  # 16:9-ish, sized for fullscreen background
}


# ── ComfyUI plumbing ─────────────────────────────────────────────────


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
    with urllib.request.urlopen(f"http://{SERVER}{path}?{qs}", timeout=120) as resp:
        return resp.read()


def flux1_workflow(prompt_text: str, negative_text: str, seed: int,
                   width: int, height: int, prefix: str) -> dict:
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q4_0.gguf"}},
        "2": {"class_type": "DualCLIPLoaderGGUF", "inputs": {
            "clip_name1": "t5-v1_1-xxl-encoder-Q4_K_M.gguf",
            "clip_name2": "clip_l.safetensors",
            "type": "flux",
        }},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["2", 0]}},
        "4n": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_text, "clip": ["2", 0]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {
            "width": width, "height": height, "batch_size": 1,
        }},
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


def queue_and_wait(workflow: dict, label: str, timeout_s: int = 1800) -> dict:
    result = post_json("/prompt", {"prompt": workflow, "client_id": str(uuid.uuid4())})
    prompt_id = result["prompt_id"]
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            history = get_json(f"/history/{prompt_id}", timeout=30)
        except Exception:
            time.sleep(2)
            continue
        if prompt_id in history:
            item = history[prompt_id]
            status = item.get("status", {})
            if not status.get("completed", False):
                raise RuntimeError(f"{label} failed: {status}")
            return item
        time.sleep(2)
    raise TimeoutError(f"{label} timed out waiting for {prompt_id}")


def fetch_image(history_item: dict) -> bytes:
    images = []
    for node in history_item.get("outputs", {}).values():
        images.extend(node.get("images", []))
    if not images:
        raise RuntimeError("no images in history item")
    image = images[0]
    return get_bytes("/view", {
        "filename": image["filename"],
        "subfolder": image.get("subfolder", ""),
        "type": image.get("type", "output"),
    })


# ── Orchestration ────────────────────────────────────────────────────


def run_one(p: VisualPrompt) -> tuple[bool, float, Path | None]:
    tier_style = style_for_tier(p.tier)
    tier_neg = negative_for_tier(p.tier)
    full_prompt = f"{tier_style}\n\n{p.prompt}"
    width, height = DIMS_BY_TIER[p.tier]
    prefix = f"cellshire-twn/{p.tier}/{p.id}"
    workflow = flux1_workflow(full_prompt, tier_neg, p.seed, width, height, prefix)
    start = time.time()
    try:
        history = queue_and_wait(workflow, p.id)
        data = fetch_image(history)
    except Exception as e:
        sys.stderr.write(f"  ✗ {p.id} failed: {e}\n")
        return False, time.time() - start, None
    out_dir = OUT_ROOT / p.tier / p.parent_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{p.id}.png"
    out_path.write_bytes(data)
    return True, time.time() - start, out_path


def write_contact_sheets(generated: list[tuple[VisualPrompt, Path]]) -> None:
    by_tier: dict[str, list[tuple[VisualPrompt, Path]]] = {}
    for p, path in generated:
        by_tier.setdefault(p.tier, []).append((p, path))
    for tier, entries in by_tier.items():
        sheet = OUT_ROOT / tier / "contact-sheet.md"
        lines = [
            f"# Cellshire {tier.title()} Contact Sheet",
            "",
            f"{len(entries)} candidates generated via Flux.1 Schnell.",
            "",
        ]
        by_parent: dict[str, list[tuple[VisualPrompt, Path]]] = {}
        for p, path in entries:
            by_parent.setdefault(p.parent_id, []).append((p, path))
        for parent, items in by_parent.items():
            lines.append(f"## `{parent}`")
            lines.append("")
            for p, path in items:
                rel = path.relative_to(sheet.parent)
                lines.append(f"### `{p.id}` (seed {p.seed})")
                lines.append("")
                lines.append(f"![{p.id}]({rel})")
                lines.append("")
                lines.append(f"> {p.prompt}")
                lines.append("")
        sheet.write_text("\n".join(lines))
        print(f"  wrote {sheet.relative_to(ROOT)}")


def select_prompts(tier: str | None, only: str | None) -> list[VisualPrompt]:
    if only:
        return [p for p in all_prompts() if p.id == only or p.parent_id == only]
    if tier:
        return prompts_for_tier(tier)
    return all_prompts()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=["buildings", "interiors", "npcs", "boot"],
                        help="Generate just this tier")
    parser.add_argument("--only", help="Generate just this id or parent id")
    parser.add_argument("--dry-run", action="store_true", help="Print plan only")
    args = parser.parse_args()

    prompts = select_prompts(args.tier, args.only)
    if not prompts:
        sys.stderr.write("No prompts matched filter.\n")
        return 2

    print(f"Planned: {len(prompts)} generations")
    if args.dry_run:
        for p in prompts:
            print(f"  {p.tier:10s} {p.parent_id:24s} {p.id:32s} seed={p.seed}")
        return 0

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    generated: list[tuple[VisualPrompt, Path]] = []
    started = time.time()
    for idx, p in enumerate(prompts, 1):
        print(f"[{idx}/{len(prompts)}] {p.tier}/{p.id} ...", end=" ", flush=True)
        ok, elapsed, path = run_one(p)
        if ok and path:
            generated.append((p, path))
            print(f"{elapsed:.1f}s")
        else:
            print(f"FAILED ({elapsed:.1f}s)")

    print()
    print(f"Done in {(time.time() - started)/60:.1f}m. Writing contact sheets...")
    write_contact_sheets(generated)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
