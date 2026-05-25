#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenerate the Cellshire SFX catalog using Meta AudioGen (audiocraft).

The first SFX pass via Stable Audio 3 small-sfx produced uniformly
buzzsaw-y output. AudioGen medium (1.5B params, 16 kHz mono) is the
SFX-tuned model and already cached locally at
``/data/huggingface-cache/hub/models--facebook--audiogen-medium``.

This orchestrator loads AudioGen **once** in the current process and
loops through the prompt catalog — much faster than the SA3 subprocess
pattern, since AudioGen's per-clip generation is ~1-2 s after warmup.

Outputs at ``tmp/sfx-generation-audiogen/<clip-id>/seed<seed>.wav``.
Reuses the existing SFX prompt catalog so picks transfer.

Usage::

    python3 scripts/run_cellshire_sfx_audiogen_batch.py
    python3 scripts/run_cellshire_sfx_audiogen_batch.py --only wood_chop
    python3 scripts/run_cellshire_sfx_audiogen_batch.py --layer harvest
    python3 scripts/run_cellshire_sfx_audiogen_batch.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

# Same catalog as the SA3 pass — reuse so audition + install picks
# transfer cleanly between backends.
from cellshire_sfx_catalog import SFX_CATALOG, SfxPrompt  # noqa: E402


OUT_ROOT = ROOT / "tmp" / "sfx-generation-audiogen"
MODEL_ID = "facebook/audiogen-medium"
HF_CACHE = "/data/huggingface-cache"


def load_model():
    """Load AudioGen once, prefer ROCm/CUDA if VRAM permits.

    audiocraft.models.AudioGen handles the ROCm/CUDA masquerade
    transparently — torch.cuda.is_available() returns True on this
    7900 XTX box."""
    # Match audiocraft's expected cache location.
    os.environ.setdefault("HF_HOME", HF_CACHE)
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", f"{HF_CACHE}/hub")

    import torch
    from audiocraft.models import AudioGen

    device = "cpu"
    if torch.cuda.is_available():
        free_mb = torch.cuda.mem_get_info()[0] / 1024 ** 2
        # AudioGen medium at fp16 ~3 GB weights, ~5 GB peak. 7900 XTX
        # has 24 GB so we'll fit comfortably.
        if free_mb > 6000:
            device = "cuda"
        else:
            print(f"[AudioGen] only {free_mb:.0f}MB free VRAM, falling back to CPU")
    print(f"[AudioGen] loading {MODEL_ID} on {device} ...")
    t0 = time.time()
    model = AudioGen.get_pretrained(MODEL_ID, device=device)
    print(f"[AudioGen] loaded in {time.time() - t0:.1f}s, "
          f"sample_rate={model.sample_rate} Hz")
    return model


def generate_one(model, prompt: SfxPrompt, seed: int, out_path: Path) -> tuple[bool, float]:
    """Generate one clip with a deterministic seed."""
    import torch
    import soundfile as sf

    t0 = time.time()
    try:
        # AudioGen sample-rate is 16 kHz and trained on 10 s windows; we
        # request the catalog's intended duration up to that cap.
        duration = min(max(0.5, prompt.duration), 10.0)
        model.set_generation_params(duration=duration)
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        with torch.no_grad():
            wav = model.generate([prompt.prompt])
        audio = wav[0].cpu().numpy()
        if audio.ndim == 2:
            audio = audio[0]
        out_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out_path), audio, model.sample_rate)
        return True, time.time() - t0
    except Exception as exc:
        sys.stderr.write(f"  ✗ {prompt.id} seed={seed}: {exc}\n")
        return False, time.time() - t0


def write_contact_sheet(generated: list[tuple[SfxPrompt, list[Path]]]) -> Path:
    """Markdown contact sheet — the actual audition page is built by
    build_sfx_audition_page.py against this same output tree."""
    sheet = OUT_ROOT / "contact-sheet.md"
    lines = [
        "# Cellshire SFX Contact Sheet — AudioGen pass",
        "",
        f"Generated {sum(len(p) for _, p in generated)} clips from "
        f"{len(generated)} prompts via Meta AudioGen medium (16 kHz mono).",
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
    parser.add_argument("--dry-run", action="store_true", help="Print plan only")
    args = parser.parse_args()

    prompts = select_prompts(args.only, args.layer)
    if not prompts:
        sys.stderr.write("No prompts matched filter.\n")
        return 2

    total = sum(p.candidates for p in prompts)
    print(f"Planned: {len(prompts)} prompts, {total} generations via AudioGen medium")
    if args.dry_run:
        for p in prompts:
            print(f"  {p.layer:10s} {p.id:18s} {p.duration:>4.1f}s × {p.candidates}")
        return 0

    OUT_ROOT.mkdir(parents=True, exist_ok=True)

    model = load_model()

    generated: list[tuple[SfxPrompt, list[Path]]] = []
    started = time.time()
    for idx, prompt in enumerate(prompts, 1):
        produced: list[Path] = []
        for variant in range(prompt.candidates):
            seed = prompt.seed + variant
            out = OUT_ROOT / prompt.id / f"seed{seed}.wav"
            print(f"[{idx}/{len(prompts)}] {prompt.id} seed={seed} ...", end=" ", flush=True)
            ok, elapsed = generate_one(model, prompt, seed, out)
            if ok:
                produced.append(out)
                print(f"{elapsed:.1f}s")
            else:
                print(f"FAILED ({elapsed:.1f}s)")
        if produced:
            generated.append((prompt, produced))

    sheet = write_contact_sheet(generated)
    elapsed_total = time.time() - started
    print()
    print(f"Done in {elapsed_total/60:.1f}m.")
    print(f"Contact sheet: {sheet.relative_to(ROOT)}")
    print()
    print("Build the audition page against this output tree with:")
    print(f"  python3 scripts/build_sfx_audition_page.py --source {OUT_ROOT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
