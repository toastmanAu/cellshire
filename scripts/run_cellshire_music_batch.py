#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Run the Cellshire music catalog through Stable Audio 3 medium.

Outputs land in ``tmp/music-generation/<track-id>/seed<seed>.wav`` plus
a ``tmp/music-generation/contact-sheet.md`` for selection review.

Usage::

    python3 scripts/run_cellshire_music_batch.py                        # full catalog
    python3 scripts/run_cellshire_music_batch.py --only mine_zone       # one track
    python3 scripts/run_cellshire_music_batch.py --role zone            # zone beds only
    python3 scripts/run_cellshire_music_batch.py --dry-run              # plan only

SA3 medium generates roughly real-time on the RX 7900 XTX; a 150-second
zone bed therefore takes ~90-150s per candidate. The full default
catalog (~13 candidates × ~120s avg) is roughly 25-35 minutes of wall
clock — long enough to want ``--role`` chunked runs in practice.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from cellshire_music_catalog import MUSIC_CATALOG, MusicPrompt, NEGATIVE_PROMPT  # noqa: E402


SA3_ROOT = Path("/data/stable-audio-3")
SA3_PYTHON = Path("/data/venvs/stable-audio-3/bin/python")
SA3_MODEL = "medium"
SA3_STUB_DIR = ROOT / "scripts" / "_sa3_stubs"
OUT_ROOT = ROOT / "tmp" / "music-generation"


def build_command(prompt: MusicPrompt, seed: int, output_path: Path) -> list[str]:
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


def _inherit_env() -> dict[str, str]:
    keep = (
        "PATH", "HOME", "USER", "LANG", "LC_ALL", "LD_LIBRARY_PATH",
        "HSA_OVERRIDE_GFX_VERSION", "ROCR_VISIBLE_DEVICES", "HIP_VISIBLE_DEVICES",
        "PYTORCH_HIP_ALLOC_CONF", "MIOPEN_USER_DB_PATH", "MIOPEN_SYSTEM_DB_PATH",
    )
    return {k: v for k, v in os.environ.items() if k in keep}


def run_one(prompt: MusicPrompt, seed: int, output_path: Path) -> tuple[bool, float]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = build_command(prompt, seed, output_path)
    env = {"PYTHONPATH": f"{SA3_STUB_DIR}:{SA3_ROOT}", **_inherit_env()}
    start = time.time()
    try:
        result = subprocess.run(
            cmd, cwd=SA3_ROOT, env=env, capture_output=True, text=True, timeout=900,
        )
    except subprocess.TimeoutExpired:
        return False, time.time() - start
    elapsed = time.time() - start
    if result.returncode != 0:
        sys.stderr.write(f"  ✗ seed={seed} failed (rc={result.returncode}) in {elapsed:.1f}s\n")
        for line in result.stderr.strip().splitlines()[-10:]:
            sys.stderr.write(f"    {line}\n")
        return False, elapsed
    if not output_path.exists():
        alt = output_path.with_name(output_path.stem + "_0" + output_path.suffix)
        if alt.exists():
            alt.rename(output_path)
    return output_path.exists(), elapsed


def write_contact_sheet(generated: list[tuple[MusicPrompt, list[Path]]]) -> Path:
    sheet = OUT_ROOT / "contact-sheet.md"
    lines = [
        "# Cellshire Music Contact Sheet",
        "",
        f"Generated {sum(len(paths) for _, paths in generated)} tracks from "
        f"{len(generated)} prompts via Stable Audio 3 medium.",
        "",
        "Listen to each candidate. The winning track per prompt should be "
        "encoded to Ogg/Vorbis and copied into `assets/music/<track-id>.ogg`.",
        "Music is **not** auto-wired by the existing `loadUiAudio()` — Codex "
        "needs a new music-loop manager that loops these tracks per active "
        "map zone with crossfades on travel.",
        "",
    ]
    by_role: dict[str, list[tuple[MusicPrompt, list[Path]]]] = {}
    for prompt, paths in generated:
        by_role.setdefault(prompt.role, []).append((prompt, paths))
    for role, entries in by_role.items():
        lines.append(f"## {role.title()}")
        lines.append("")
        for prompt, paths in entries:
            lines.append(f"### `{prompt.id}` — {prompt.duration:.0f}s")
            lines.append("")
            lines.append(f"> {prompt.prompt}")
            lines.append("")
            for path in paths:
                rel = path.relative_to(ROOT)
                lines.append(f"- `{rel}`")
            lines.append("")
    sheet.write_text("\n".join(lines))
    return sheet


def select_prompts(only: str | None, role: str | None) -> list[MusicPrompt]:
    if only:
        return [p for p in MUSIC_CATALOG if p.id == only]
    if role:
        return [p for p in MUSIC_CATALOG if p.role == role]
    return list(MUSIC_CATALOG)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Generate just this track id")
    parser.add_argument("--role", help="Generate just this role (title/zone/interior/sting)")
    parser.add_argument("--dry-run", action="store_true", help="Print plan, don't generate")
    args = parser.parse_args()

    prompts = select_prompts(args.only, args.role)
    if not prompts:
        sys.stderr.write("No prompts matched filter.\n")
        return 2

    total_clips = sum(p.candidates for p in prompts)
    total_seconds = sum(p.duration * p.candidates for p in prompts)
    print(f"Planned: {len(prompts)} tracks, {total_clips} generations, "
          f"{total_seconds:.0f}s of audio")
    if args.dry_run:
        for p in prompts:
            print(f"  {p.role:10s} {p.id:20s} {p.duration:>5.0f}s × {p.candidates}")
        return 0

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    generated: list[tuple[MusicPrompt, list[Path]]] = []
    started_at = time.time()
    for idx, prompt in enumerate(prompts, 1):
        clip_dir = OUT_ROOT / prompt.id
        clip_dir.mkdir(parents=True, exist_ok=True)
        produced: list[Path] = []
        for variant in range(prompt.candidates):
            seed = prompt.seed + variant
            out = clip_dir / f"seed{seed}.wav"
            print(f"[{idx}/{len(prompts)}] {prompt.id} seed={seed} "
                  f"({prompt.duration:.0f}s) ...", end=" ", flush=True)
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
