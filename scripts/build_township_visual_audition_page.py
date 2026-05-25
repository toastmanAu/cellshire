#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build an HTML audition page for the township visual batch.

Shows all 3 candidates per asset slot side-by-side with radio selection.
Mirrors the SFX/music audition pages, except images are inlined inline
rather than `<audio>` elements.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from cellshire_township_visual_catalog import (  # noqa: E402
    all_prompts,
    VisualPrompt,
)

TMP_ROOT = ROOT / "tmp" / "township-visual-generation"


HTML_TOP = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cellshire Township Visual Audition</title>
  <style>
    :root { color-scheme: dark; }
    body {
      font: 14px/1.5 system-ui, sans-serif;
      max-width: 1400px;
      margin: 2rem auto;
      padding: 0 1.5rem;
      background: #161819;
      color: #e8e8e8;
    }
    h1 { font-size: 1.6rem; margin: 0 0 1.5rem; }
    h2 {
      font-size: 1.2rem; margin: 2.5rem 0 0.5rem;
      padding-bottom: 0.25rem; border-bottom: 1px solid #2c3134;
      text-transform: capitalize;
    }
    h3 { font-size: 1rem; margin: 1.5rem 0 0.5rem; color: #ffd692; }
    .slot { margin-bottom: 1.5rem; }
    .candidates {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 0.75rem;
    }
    .candidate {
      border: 1px solid #2c3134;
      border-radius: 6px;
      background: #1d2123;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .candidate img {
      width: 100%; height: 320px; object-fit: contain;
      background: #0c0e0f;
      display: block;
    }
    .candidate-meta {
      padding: 0.5rem 0.7rem;
      display: flex;
      align-items: center;
      gap: 0.7rem;
      font-size: 0.85rem;
    }
    .candidate-meta label { cursor: pointer; }
    .prompt { color: #9aa0a4; font-style: italic; font-size: 0.85rem; margin: 0 0 0.5rem; }
    #export {
      position: fixed; bottom: 1rem; right: 1rem;
      padding: 0.5rem 0.9rem; background: #2a8c5b; color: #fff;
      border: 0; border-radius: 6px; font: inherit; cursor: pointer;
    }
    #out {
      position: fixed; bottom: 4rem; right: 1rem;
      max-width: 640px; max-height: 40vh; overflow: auto;
      padding: 0.75rem; background: #0c0e0f;
      border: 1px solid #2c3134; border-radius: 6px;
      white-space: pre; font: 12px/1.4 ui-monospace, monospace;
      display: none;
    }
  </style>
</head>
<body>
<h1>Cellshire Township Visual Audition</h1>
<p>Pick one candidate per asset slot (radio per slot). Then click
<strong>Export</strong> for a Python <code>VISUAL_SELECTIONS</code>
block you can paste into <code>install_cellshire_township_visuals.py</code>.</p>
"""


HTML_BOTTOM = """
<button id="export" type="button">Export selections</button>
<pre id="out"></pre>
<script>
document.getElementById('export').addEventListener('click', () => {
  const lines = [];
  document.querySelectorAll('.slot').forEach(slot => {
    const parent = slot.dataset.parent;
    const tier = slot.dataset.tier;
    const selected = slot.querySelector('input[type=radio]:checked');
    if (!selected) return;
    const candidate = selected.value;
    lines.push(`    VisualSelection(${JSON.stringify(parent)}, ${JSON.stringify(candidate)}, ${JSON.stringify(tier)}),`);
  });
  const out = document.getElementById('out');
  if (!lines.length) { out.textContent = '(no selections yet)'; out.style.display = 'block'; return; }
  out.textContent = 'VISUAL_SELECTIONS = [\\n' + lines.join('\\n') + '\\n]';
  out.style.display = 'block';
});
</script>
</body>
</html>
"""


def render() -> str:
    parts = [HTML_TOP]
    by_tier: dict[str, list[VisualPrompt]] = {}
    for p in all_prompts():
        by_tier.setdefault(p.tier, []).append(p)

    for tier, entries in by_tier.items():
        parts.append(f"<h2>{tier}</h2>")
        by_parent: dict[str, list[VisualPrompt]] = {}
        for p in entries:
            by_parent.setdefault(p.parent_id, []).append(p)
        for parent, items in by_parent.items():
            parts.append(f'<div class="slot" data-parent="{parent}" data-tier="{tier}">')
            parts.append(f"<h3>{parent}</h3>")
            parts.append('<div class="candidates">')
            for p in items:
                img_path = TMP_ROOT / tier / parent / f"{p.id}.png"
                rel = img_path.relative_to(TMP_ROOT)
                exists = img_path.exists()
                img_tag = f'<img src="{rel}" alt="{p.id}">' if exists else (
                    f'<div style="height:320px;display:flex;align-items:center;'
                    f'justify-content:center;color:#a23a3a;background:#0c0e0f;">'
                    f'not generated yet</div>'
                )
                parts.append(
                    f'<div class="candidate">'
                    f'{img_tag}'
                    f'<div class="prompt" style="padding:0.4rem 0.7rem 0">{p.prompt}</div>'
                    f'<div class="candidate-meta">'
                    f'<label><input type="radio" name="{parent}" value="{p.id}"> '
                    f'<strong>{p.id.rsplit("_", 1)[-1]}</strong> · seed {p.seed}</label>'
                    f'</div>'
                    f'</div>'
                )
            parts.append('</div>')
            parts.append('</div>')

    parts.append(HTML_BOTTOM)
    return "\n".join(parts)


def main() -> int:
    if not TMP_ROOT.exists():
        sys.stderr.write(
            f"{TMP_ROOT} missing — run run_cellshire_township_visual_batch.py first\n"
        )
        return 1
    out = TMP_ROOT / "audition.html"
    out.write_text(render())
    print(f"Wrote {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
