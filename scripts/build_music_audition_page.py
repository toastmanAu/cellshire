#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build an HTML audition page for the generated music batch."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from cellshire_music_catalog import MUSIC_CATALOG  # noqa: E402

TMP_ROOT = ROOT / "tmp" / "music-generation"


HTML_TOP = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cellshire Music Audition</title>
  <style>
    :root { color-scheme: dark; }
    body {
      font: 14px/1.5 system-ui, sans-serif;
      max-width: 1100px;
      margin: 2rem auto;
      padding: 0 1.5rem;
      background: #161819;
      color: #e8e8e8;
    }
    h1 { font-size: 1.6rem; margin: 0 0 1.5rem; }
    h2 {
      font-size: 1.1rem;
      margin: 2rem 0 0.75rem;
      padding-bottom: 0.25rem;
      border-bottom: 1px solid #2c3134;
      text-transform: capitalize;
    }
    .track {
      padding: 1rem 0;
      border-bottom: 1px dashed #2c3134;
    }
    .track-id { font-weight: 600; font-size: 1.05rem; }
    .track-meta { color: #8a8f93; font-size: 0.85rem; }
    .track-prompt { color: #9aa0a4; font-style: italic; margin: 0.4rem 0 0.8rem; }
    .candidates { display: flex; flex-direction: column; gap: 0.5rem; }
    .candidate {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      padding: 0.5rem 0.7rem;
      border: 1px solid #2c3134;
      border-radius: 6px;
      background: #1d2123;
    }
    .candidate label { font-size: 0.85rem; color: #aab1b6; min-width: 5rem; cursor: pointer; }
    .candidate audio { flex: 1; max-width: 600px; }
    .loop-toggle { color: #8a8f93; font-size: 0.85rem; margin-left: 1rem; }
    #export {
      position: fixed; bottom: 1rem; right: 1rem;
      padding: 0.5rem 0.9rem; background: #2a8c5b; color: #fff;
      border: 0; border-radius: 6px; font: inherit; cursor: pointer;
    }
    #out {
      position: fixed; bottom: 4rem; right: 1rem;
      max-width: 560px; max-height: 40vh; overflow: auto;
      padding: 0.75rem; background: #0c0e0f;
      border: 1px solid #2c3134; border-radius: 6px;
      white-space: pre; font: 12px/1.4 ui-monospace, monospace;
      display: none;
    }
  </style>
</head>
<body>
<h1>Cellshire Music Audition</h1>
<p>Pick one candidate per track. Toggle <em>Loop</em> for tracks that
should play continuously (zones + interior; off for one-shot stings and
title intros).</p>
"""

HTML_BOTTOM = """
<button id="export" type="button">Export selections</button>
<pre id="out"></pre>
<script>
document.getElementById('export').addEventListener('click', () => {
  const lines = [];
  document.querySelectorAll('.track').forEach(track => {
    const id = track.dataset.id;
    const role = track.dataset.role;
    const selected = track.querySelector('input[type=radio]:checked');
    if (!selected) return;
    const seed = selected.value;
    const loop = track.querySelector('input[name="loop_' + id + '"]').checked;
    lines.push(`    MusicSelection(${JSON.stringify(id)}, ${seed}, ${JSON.stringify(role)}, loop=${loop ? 'True' : 'False'}),`);
  });
  const out = document.getElementById('out');
  if (!lines.length) { out.textContent = '(no selections yet)'; out.style.display = 'block'; return; }
  out.textContent = 'MUSIC_SELECTIONS = [\\n' + lines.join('\\n') + '\\n]';
  out.style.display = 'block';
});
</script>
</body>
</html>
"""


def render() -> str:
    parts = [HTML_TOP]
    by_role: dict[str, list] = {}
    for entry in MUSIC_CATALOG:
        by_role.setdefault(entry.role, []).append(entry)

    loop_default = {"zone": True, "interior": True, "title": False, "sting": False}

    for role, entries in by_role.items():
        parts.append(f"<h2>{role}</h2>")
        for entry in entries:
            track_dir = TMP_ROOT / entry.id
            wavs = sorted(track_dir.glob("seed*.wav"))
            default_loop = loop_default.get(entry.role, False)
            parts.append(
                f'<div class="track" data-id="{entry.id}" data-role="{entry.role}">'
            )
            parts.append(
                f'<div class="track-id">{entry.id}</div>'
                f'<div class="track-meta">{entry.duration:.0f}s · '
                f'seeds {entry.seed}–{entry.seed + entry.candidates - 1}'
                f'<label class="loop-toggle"><input type="checkbox" '
                f'name="loop_{entry.id}" {"checked" if default_loop else ""}> '
                f'loop</label></div>'
            )
            parts.append(f'<div class="track-prompt">{entry.prompt}</div>')
            parts.append('<div class="candidates">')
            if not wavs:
                parts.append('<em style="color:#a23a3a">no wav generated</em>')
            for wav in wavs:
                seed = int(wav.stem.replace("seed", ""))
                rel = wav.relative_to(TMP_ROOT)
                parts.append(
                    f'<div class="candidate">'
                    f'<label><input type="radio" name="{entry.id}" value="{seed}"> seed {seed}</label>'
                    f'<audio controls preload="metadata" src="{rel}"></audio>'
                    f'</div>'
                )
            parts.append('</div>')
            parts.append('</div>')

    parts.append(HTML_BOTTOM)
    return "\n".join(parts)


def main() -> int:
    if not TMP_ROOT.exists():
        sys.stderr.write(f"{TMP_ROOT} missing — run run_cellshire_music_batch.py first\n")
        return 1
    out = TMP_ROOT / "audition.html"
    out.write_text(render())
    print(f"Wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
