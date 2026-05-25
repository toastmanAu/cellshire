#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Run the Cellshire SFX catalog through Stable Audio 3 small-sfx.

Outputs land in ``tmp/sfx-generation/<clip-id>/seed<seed>.wav`` plus a
``tmp/sfx-generation/contact-sheet.md`` for selection review.

Stable Audio 3 lives at ``/data/stable-audio-3`` with its venv at
``/data/venvs/stable-audio-3``. The package is run as ``python -m`` from
the source tree (not pip-installed). Generation is ROCm-accelerated on
the RX 7900 XTX.

Usage::

    python scripts/run_cellshire_sfx_batch.py                  # full catalog
    python scripts/run_cellshire_sfx_batch.py --only wood_chop # one clip
    python scripts/run_cellshire_sfx_batch.py --layer harvest  # one layer
    python scripts/run_cellshire_sfx_batch.py --dry-run        # plan only
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from cellshire_sfx_catalog import NEGATIVE_PROMPT, SFX_CATALOG, SfxPrompt  # noqa: E402


SA3_ROOT = Path("/data/stable-audio-3")
SA3_PYTHON = Path("/data/venvs/stable-audio-3/bin/python")
SA3_MODEL = "small-sfx"
OUT_ROOT = ROOT / "tmp" / "sfx-generation"


def build_command(prompt: SfxPrompt, seed: int, output_path: Path) -> list[str]:
    return [
        str(SA3_PYTHON),
        "-m",
        "stable_audio_3.cli",
        "--model",
        SA3_MODEL,
        "--prompt",
        prompt.prompt,
        "--negative-prompt",
        NEGATIVE_PROMPT,
        "--duration",
        f"{prompt.duration}",
        "--seed",
        str(seed),
        "--steps",
        "8",
        "--cfg-scale",
        "1.0",
        "--output",
        str(output_path),
    ]


def run_one(prompt: SfxPrompt, seed: int, output_path: Path) -> tuple[bool, float]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = build_command(prompt, seed, output_path)
    # Prepend a local torchcodec stub dir so the broken user-site
    # torchcodec (CUDA-13-linked) is shadowed for this run.
    stub_dir = ROOT / "scripts" / "_sa3_stubs"
    env = {"PYTHONPATH": f"{stub_dir}:{SA3_ROOT}"}
    final_env = {**env, **_inherit_env()}
    start = time.time()
    try:
        result = subprocess.run(
            cmd,
            cwd=SA3_ROOT,
            env=final_env,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        return False, time.time() - start
    elapsed = time.time() - start
    if result.returncode != 0:
        sys.stderr.write(f"  ✗ seed={seed} failed (rc={result.returncode}) in {elapsed:.1f}s\n")
        sys.stderr.write("    --- stderr ---\n")
        for line in result.stderr.strip().splitlines()[-15:]:
            sys.stderr.write(f"    {line}\n")
        return False, elapsed
    # SA3 saves as <output>_0.wav when batch_size=1 and stem has no extension
    # — but we pass a .wav extension, so the file lands at output_path directly.
    # Some versions still append _0; check both.
    if not output_path.exists():
        alt = output_path.with_name(output_path.stem + "_0" + output_path.suffix)
        if alt.exists():
            alt.rename(output_path)
    return output_path.exists(), elapsed


def _inherit_env() -> dict[str, str]:
    import os
    inherit_keys = (
        "PATH", "HOME", "USER", "LANG", "LC_ALL", "LD_LIBRARY_PATH",
        "HSA_OVERRIDE_GFX_VERSION", "ROCR_VISIBLE_DEVICES", "HIP_VISIBLE_DEVICES",
        "PYTORCH_HIP_ALLOC_CONF", "MIOPEN_USER_DB_PATH", "MIOPEN_SYSTEM_DB_PATH",
    )
    return {k: v for k, v in os.environ.items() if k in inherit_keys}


def write_contact_sheet(generated: list[tuple[SfxPrompt, list[Path]]]) -> Path:
    sheet = OUT_ROOT / "contact-sheet.md"
    lines = [
        "# Cellshire SFX Contact Sheet",
        "",
        f"Generated {sum(len(paths) for _, paths in generated)} clips from "
        f"{len(generated)} prompts via Stable Audio 3 small-sfx.",
        "",
        "Listen to each candidate, decide which (if any) to install. The "
        "winning clip per prompt should be copied into `assets/sfx/<clip-id>.ogg`",
        "via `scripts/install_cellshire_sfx.py` once selections are made.",
        "",
    ]
    by_layer: dict[str, list[tuple[SfxPrompt, list[Path]]]] = {}
    for prompt, paths in generated:
        by_layer.setdefault(prompt.layer, []).append((prompt, paths))
    for layer, entries in by_layer.items():
        lines.append(f"## {layer.title()}")
        lines.append("")
        for prompt, paths in entries:
            lines.append(f"### `{prompt.id}` — {prompt.duration}s")
            lines.append("")
            lines.append(f"> {prompt.prompt}")
            lines.append("")
            for path in paths:
                rel = path.relative_to(ROOT)
                lines.append(f"- `{rel}`")
            lines.append("")
    sheet.write_text("\n".join(lines))
    return sheet


def select_prompts(only: str | None, layer: str | None) -> list[SfxPrompt]:
    if only:
        return [p for p in SFX_CATALOG if p.id == only]
    if layer:
        return [p for p in SFX_CATALOG if p.layer == layer]
    return list(SFX_CATALOG)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Generate just this clip id")
    parser.add_argument("--layer", help="Generate just this layer")
    parser.add_argument("--dry-run", action="store_true", help="Print plan, don't generate")
    args = parser.parse_args()

    prompts = select_prompts(args.only, args.layer)
    if not prompts:
        sys.stderr.write("No prompts matched filter.\n")
        return 2

    total_clips = sum(p.candidates for p in prompts)
    print(f"Planned: {len(prompts)} prompts, {total_clips} generations")
    if args.dry_run:
        for p in prompts:
            print(f"  {p.layer:10s} {p.id:18s} {p.duration:>4.1f}s × {p.candidates}")
        return 0

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    generated: list[tuple[SfxPrompt, list[Path]]] = []
    started_at = time.time()
    for idx, prompt in enumerate(prompts, 1):
        clip_dir = OUT_ROOT / prompt.id
        clip_dir.mkdir(parents=True, exist_ok=True)
        produced: list[Path] = []
        for variant in range(prompt.candidates):
            seed = prompt.seed + variant
            out = clip_dir / f"seed{seed}.wav"
            print(f"[{idx}/{len(prompts)}] {prompt.id} seed={seed} ...", end=" ", flush=True)
            ok, elapsed = run_one(prompt, seed, out)
            if ok:
                produced.append(out)
                print(f"{elapsed:.1f}s")
            else:
                print(f"FAILED ({elapsed:.1f}s)")
        if produced:
            generated.append((prompt, produced))

    sheet = write_contact_sheet(generated)
    elapsed_total = time.time() - started_at
    print()
    print(f"Done in {elapsed_total/60:.1f}m. Contact sheet: {sheet.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
