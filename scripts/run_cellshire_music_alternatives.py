#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate alternative directions for mine_zone and interior_bed.

The original SA3 medium pass produced acceptable but not great results
for these two zones. This script tries four distinct musical directions
per slot. Same SA3 medium pipeline as the main music batch (we know it
works well for music) — the buzzsaw issue was specific to SA3 small-sfx,
not the medium model.

Outputs at tmp/music-alternatives/<slot>/seed<N>.wav.
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / "tmp" / "music-alternatives"
SA3_ROOT = Path("/data/stable-audio-3")
SA3_PYTHON = Path("/data/venvs/stable-audio-3/bin/python")
SA3_STUB_DIR = ROOT / "scripts" / "_sa3_stubs"


@dataclass(frozen=True)
class AltPrompt:
    slot: str          # mine_zone or interior_bed
    variant: str       # short name appended to filename
    seed: int
    duration: float
    prompt: str


NEGATIVE = (
    "vocals, singing, lyrics, narration, speech, talking, low quality, "
    "distorted, clipped, noisy, abrupt cuts, harsh transients, buzzsaw"
)


PROMPTS: list[AltPrompt] = [
    # ── mine_zone alternatives ────────────────────────────────────
    AltPrompt(
        "mine_zone", "dark_drone", 5201, 150.0,
        "A patient looping ambient bed for an underground mining map. "
        "Deep low warm cello drone, occasional muted bass pulse, "
        "distant cave reverb texture, subtle metallic shimmer high "
        "above. Atmospheric and slightly mysterious. Leaves wide "
        "headroom for crisp foreground pickaxe hits. No drums, no "
        "melody, no vocals. Loopable seamlessly."
    ),
    AltPrompt(
        "mine_zone", "kalimba_curious", 5202, 150.0,
        "A patient looping ambient bed for an underground mining map. "
        "Sparse warm kalimba melody motif played slowly over a quiet "
        "felt-piano drone, occasional water-drop high chime, gentle "
        "breath of cave-reverb space. Curious, hopeful, low-key. "
        "Plenty of headroom for foreground pickaxe hits. No drums, no "
        "vocals. Loopable seamlessly."
    ),
    AltPrompt(
        "mine_zone", "crystal_cave", 5203, 150.0,
        "A patient looping ambient bed for a crystalline cave map. "
        "Slow warm strings pad with subtle high crystal-glass shimmer, "
        "delicate bell-like notes drifting at random, a quiet swirl of "
        "low resonant air. Magical, slightly otherworldly, but never "
        "intrusive. Leaves space for crisp foreground sound effects. "
        "No drums, no melody hook, no vocals. Loopable."
    ),
    AltPrompt(
        "mine_zone", "subtle_pulse", 5204, 150.0,
        "A patient looping ambient bed for an industrial mine. Slow "
        "soft heartbeat-like low pulse every few seconds, warm sub-bass "
        "drone, distant metallic clink texture, occasional reverb tail. "
        "Restrained, mechanical, mysterious, never builds into a song. "
        "Wide headroom for foreground pickaxe hits. No drums, no "
        "melody, no vocals. Loopable seamlessly."
    ),

    # ── interior_bed alternatives ─────────────────────────────────
    AltPrompt(
        "interior_bed", "celesta_glow", 5301, 90.0,
        "A sparse low-volume RPG shop interior bed. Slow soft celesta "
        "motif of three or four notes drifting, a quiet felt piano "
        "underneath, a single distant wind chime, gentle warm ambient "
        "pad. Cosy magical fantasy shop atmosphere. No drums, no big "
        "melody hook, no vocals. Loopable seamlessly."
    ),
    AltPrompt(
        "interior_bed", "folk_hearth", 5302, 90.0,
        "A sparse cosy RPG hearth-side interior bed. Slow soft "
        "fingerpicked nylon guitar motif, distant low cello pad, a "
        "warm flicker of wooden creak, almost like a fireside whisper. "
        "Quiet, lived-in folk-medieval feel. Designed to sit under "
        "dialogue. No drums, no vocals. Loopable seamlessly."
    ),
    AltPrompt(
        "interior_bed", "meditative_space", 5303, 90.0,
        "A very sparse meditative RPG interior bed. Long warm pad "
        "tones evolving slowly, occasional single felt-piano note, "
        "very quiet distant reverb tail. Almost silent at moments. "
        "Designed to feel calm and undemanding under menu interaction. "
        "No drums, no melody hook, no vocals. Loopable seamlessly."
    ),
    AltPrompt(
        "interior_bed", "music_box", 5304, 90.0,
        "A sparse RPG shop interior bed with a music-box character. "
        "Slow delicate music-box motif of three or four notes, soft "
        "warm pad underneath, distant tick of a clock, gentle felt "
        "piano. Quaint, cosy, slightly nostalgic. Quiet enough to sit "
        "under dialogue. No drums, no big melody hook, no vocals. "
        "Loopable seamlessly."
    ),
]


def _inherit_env() -> dict[str, str]:
    keep = ("PATH", "HOME", "USER", "LANG", "LC_ALL", "LD_LIBRARY_PATH",
            "HSA_OVERRIDE_GFX_VERSION", "ROCR_VISIBLE_DEVICES",
            "HIP_VISIBLE_DEVICES", "PYTORCH_HIP_ALLOC_CONF",
            "MIOPEN_USER_DB_PATH", "MIOPEN_SYSTEM_DB_PATH")
    return {k: v for k, v in os.environ.items() if k in keep}


def run_one(p: AltPrompt) -> tuple[bool, float]:
    out_dir = OUT_ROOT / p.slot
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"seed{p.seed}_{p.variant}.wav"
    cmd = [
        str(SA3_PYTHON), "-m", "stable_audio_3.cli",
        "--model", "medium",
        "--prompt", p.prompt,
        "--negative-prompt", NEGATIVE,
        "--duration", f"{p.duration}",
        "--seed", str(p.seed),
        "--steps", "8",
        "--cfg-scale", "1.0",
        "--output", str(out_path),
    ]
    env = {"PYTHONPATH": f"{SA3_STUB_DIR}:{SA3_ROOT}", **_inherit_env()}
    t0 = time.time()
    result = subprocess.run(cmd, cwd=SA3_ROOT, env=env,
                            capture_output=True, text=True, timeout=900)
    elapsed = time.time() - t0
    if result.returncode != 0:
        sys.stderr.write(f"  ✗ {p.slot}/{p.variant}: rc={result.returncode}\n")
        for line in result.stderr.strip().splitlines()[-5:]:
            sys.stderr.write(f"    {line}\n")
        return False, elapsed
    return out_path.exists(), elapsed


def render_audition() -> Path:
    sheet = OUT_ROOT / "audition.html"
    by_slot: dict[str, list[AltPrompt]] = {}
    for p in PROMPTS:
        by_slot.setdefault(p.slot, []).append(p)
    blocks = []
    for slot, items in by_slot.items():
        blocks.append(f'<h2>{slot}</h2>')
        blocks.append('<div class="cards">')
        for p in items:
            rel = f"{slot}/seed{p.seed}_{p.variant}.wav"
            blocks.append(
                f'<div class="card">'
                f'<div class="meta"><label>'
                f'<input type="radio" name="{slot}" value="{p.seed}"> '
                f'<strong>{p.variant}</strong> · seed {p.seed} · {p.duration:.0f}s'
                f'</label></div>'
                f'<audio controls preload="metadata" src="{rel}"></audio>'
                f'<div class="prompt">{p.prompt}</div>'
                f'</div>'
            )
        blocks.append('</div>')

    html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>Music Alternatives — mine_zone & interior_bed</title>
<style>
:root{{color-scheme:dark}}
body{{font:14px/1.5 system-ui,sans-serif;background:#161819;color:#e8e8e8;max-width:1200px;margin:1.5rem auto;padding:0 1.5rem}}
h1{{font-size:1.4rem;margin:0 0 1rem}}
h2{{margin:2rem 0 0.5rem;padding-bottom:0.25rem;border-bottom:1px solid #2c3134}}
.cards{{display:flex;flex-direction:column;gap:.6rem}}
.card{{border:1px solid #2c3134;border-radius:6px;background:#1d2123;padding:.6rem .8rem}}
.meta label{{cursor:pointer}}
.card audio{{width:100%;max-width:640px;margin-top:.4rem;display:block}}
.prompt{{color:#9aa0a4;font-style:italic;font-size:.83rem;margin-top:.4rem}}
#export{{position:fixed;bottom:1rem;right:1rem;padding:.5rem .9rem;background:#2a8c5b;color:#fff;border:0;border-radius:6px;font:inherit;cursor:pointer}}
#out{{position:fixed;bottom:4rem;right:1rem;max-width:560px;padding:.75rem;background:#0c0e0f;border:1px solid #2c3134;border-radius:6px;white-space:pre;font:12px/1.4 ui-monospace,monospace;display:none}}
</style></head><body>
<h1>Music Alternatives</h1>
<p style="color:#9aa0a4">Pick one per slot, or shout if I should swing further in a direction.</p>
{''.join(blocks)}
<button id="export">Export</button>
<pre id="out"></pre>
<script>
document.getElementById('export').addEventListener('click',()=>{{
  const lines=[];
  ['mine_zone','interior_bed'].forEach(slot=>{{
    const s=document.querySelector('input[name="'+slot+'"]:checked');
    if(s) lines.push(`  ${{slot}}: seed ${{s.value}}`);
  }});
  const o=document.getElementById('out');
  o.textContent=lines.length?lines.join('\\n'):'(no selections)';
  o.style.display='block';
}});
</script></body></html>"""
    sheet.write_text(html)
    return sheet


def main() -> int:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    print(f"Planned: {len(PROMPTS)} generations")
    started = time.time()
    for idx, p in enumerate(PROMPTS, 1):
        print(f"[{idx}/{len(PROMPTS)}] {p.slot}/{p.variant} ...", end=" ", flush=True)
        ok, elapsed = run_one(p)
        print(f"{elapsed:.1f}s" if ok else f"FAILED ({elapsed:.1f}s)")
    sheet = render_audition()
    print(f"\nDone in {(time.time()-started)/60:.1f}m. Audition: {sheet.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
