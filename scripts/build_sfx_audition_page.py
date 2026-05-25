#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build an HTML audition page for the generated SFX batch.

After ``run_cellshire_sfx_batch.py`` finishes, run this to produce
``tmp/sfx-generation/audition.html`` — a single self-contained page
that groups every clip by layer with inline ``<audio>`` players, the
prompt, and a checkbox to mark a selection. Selections export to a
JSON snippet you can paste into ``SFX_SELECTIONS`` in
``install_cellshire_sfx.py``.

Open the page locally::

    xdg-open tmp/sfx-generation/audition.html

or serve it::

    python3 -m http.server -d tmp/sfx-generation 8765
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from cellshire_sfx_catalog import SFX_CATALOG  # noqa: E402


import argparse

_parser = argparse.ArgumentParser(add_help=False)
_parser.add_argument("--source", default="tmp/sfx-generation",
                     help="Source dir (default tmp/sfx-generation)")
_args, _ = _parser.parse_known_args()
TMP_ROOT = ROOT / _args.source


HTML_TOP = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cellshire SFX Audition</title>
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
    .clip {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 0.5rem 1rem;
      align-items: center;
      padding: 0.6rem 0;
      border-bottom: 1px dashed #2c3134;
    }
    .clip-id { font-weight: 600; }
    .clip-meta { color: #8a8f93; font-size: 0.85rem; }
    .clip-prompt { grid-column: 2; color: #9aa0a4; font-style: italic; }
    .candidates { display: flex; flex-wrap: wrap; gap: 0.6rem; }
    .candidate {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 0.4rem 0.6rem;
      border: 1px solid #2c3134;
      border-radius: 6px;
      background: #1d2123;
    }
    .candidate label { font-size: 0.8rem; color: #aab1b6; cursor: pointer; }
    .candidate audio { width: 220px; }
    #export {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      padding: 0.5rem 0.9rem;
      background: #2a8c5b;
      color: #fff;
      border: 0;
      border-radius: 6px;
      font: inherit;
      cursor: pointer;
    }
    #out {
      position: fixed;
      bottom: 4rem;
      right: 1rem;
      max-width: 480px;
      max-height: 40vh;
      overflow: auto;
      padding: 0.75rem;
      background: #0c0e0f;
      border: 1px solid #2c3134;
      border-radius: 6px;
      white-space: pre;
      font: 12px/1.4 ui-monospace, monospace;
      display: none;
    }
  </style>
</head>
<body>
<h1>Cellshire SFX Audition</h1>
<p>Pick the winning candidate per clip (radio per clip). Then click
<strong>Export</strong> for a Python snippet to paste into
<code>SFX_SELECTIONS</code> in <code>install_cellshire_sfx.py</code>.</p>
"""


HTML_BOTTOM = """
<button id="export" type="button">Export selections</button>
<pre id="out"></pre>
<script>
document.getElementById('export').addEventListener('click', () => {
  const lines = [];
  document.querySelectorAll('.clip').forEach(clip => {
    const id = clip.dataset.id;
    const layer = clip.dataset.layer;
    const interval = clip.dataset.interval;
    const selected = clip.querySelector('input[type=radio]:checked');
    if (!selected) return;
    const seed = selected.value;
    lines.push(`    SfxSelection(${JSON.stringify(id)}, ${seed}, ${JSON.stringify(layer)}, min_interval_ms=${interval}),`);
  });
  const out = document.getElementById('out');
  if (!lines.length) { out.textContent = '(no selections yet)'; out.style.display = 'block'; return; }
  out.textContent = 'SFX_SELECTIONS = [\\n' + lines.join('\\n') + '\\n]';
  out.style.display = 'block';
});
</script>
</body>
</html>
"""


def render() -> str:
    parts = [HTML_TOP]
    by_layer: dict[str, list] = {}
    for entry in SFX_CATALOG:
        by_layer.setdefault(entry.layer, []).append(entry)

    for layer, entries in by_layer.items():
        parts.append(f'<h2>{layer}</h2>')
        for entry in entries:
            clip_dir = TMP_ROOT / entry.id
            wavs = sorted(clip_dir.glob("seed*.wav"))
            interval = 35 if entry.duration > 0.8 else 25 if entry.duration > 0.4 else 15
            parts.append(
                f'<div class="clip" data-id="{entry.id}" data-layer="{entry.layer}" '
                f'data-interval="{interval}">'
            )
            parts.append(
                f'<div><div class="clip-id">{entry.id}</div>'
                f'<div class="clip-meta">{entry.duration:.1f}s · '
                f'seeds {entry.seed}–{entry.seed + entry.candidates - 1}</div></div>'
            )
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
            parts.append(f'<div class="clip-prompt">{entry.prompt}</div>')
            parts.append('</div>')

    parts.append(HTML_BOTTOM)
    return "\n".join(parts)


def main() -> int:
    if not TMP_ROOT.exists():
        sys.stderr.write(f"{TMP_ROOT} missing — run run_cellshire_sfx_batch.py first\n")
        return 1
    out = TMP_ROOT / "audition.html"
    out.write_text(render())
    print(f"Wrote {out.relative_to(ROOT)}")
    print("Open in browser:")
    print(f"  xdg-open {out}")
    print("Or serve:")
    print(f"  python3 -m http.server -d {TMP_ROOT} 8765")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
