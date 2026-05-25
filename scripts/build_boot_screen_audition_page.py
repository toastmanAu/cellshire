#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Boot-screen-specific audition page.

Unlike the general visual audition, this page renders each candidate at
the *actual* boot screen aspect with the existing loading card overlaid
at its real size. Lets you judge composition — "does the centred panel
fight with the artwork?" — before committing.

Run AFTER ``run_cellshire_township_visual_batch.py --tier boot``.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from cellshire_township_visual_catalog import BOOT_PROMPTS  # noqa: E402

TMP_ROOT = ROOT / "tmp" / "township-visual-generation"
LOGO_SRC = ROOT / "assets" / "cellshire_logo.png"


HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cellshire Boot Screen Audition</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{
      font: 14px/1.5 system-ui, sans-serif;
      max-width: 1400px;
      margin: 1.5rem auto;
      padding: 0 1.5rem;
      background: #161819;
      color: #e8e8e8;
    }}
    h1 {{ font-size: 1.6rem; margin: 0 0 0.5rem; }}
    .intro {{ color: #9aa0a4; margin-bottom: 2rem; }}

    .candidate {{
      margin-bottom: 2.5rem;
      border: 1px solid #2c3134;
      border-radius: 8px;
      overflow: hidden;
      background: #1d2123;
    }}
    .stage {{
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #0c0e0f;
    }}
    .stage img.bg {{
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}
    /* Replica of the real .loading-card from styles.css */
    .stage .loading-card {{
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: #fdf6e6;
      border-radius: 18px;
      padding: 36px 48px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      text-align: center;
      width: 360px;
      color: #2b2a26;
      font-family: system-ui, sans-serif;
    }}
    .stage .loading-logo {{
      width: 86px; height: 86px;
      margin: -8px auto 18px;
      filter: drop-shadow(0 10px 18px rgba(43, 42, 38, 0.18));
    }}
    .stage .loading-logo img {{ width: 100%; height: 100%; object-fit: contain; }}
    .stage .loading-title {{ font-size: 1.6rem; font-weight: 600; margin-bottom: 6px; }}
    .stage .loading-sub {{ font-size: 0.95rem; color: #6b6a64; margin-bottom: 18px; }}
    .stage .loading-bar {{
      width: 200px; height: 8px;
      background: #e5dcc0; border-radius: 4px; margin: 0 auto 12px;
      overflow: hidden;
    }}
    .stage .loading-fill {{
      width: 60%; height: 100%;
      background: linear-gradient(90deg, #a35b29, #d18b4a);
    }}
    .stage .loading-status {{ font-size: 0.85rem; color: #8b7e63; }}

    .meta {{
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      font-size: 0.9rem;
    }}
    .meta label {{ cursor: pointer; }}
    .prompt {{ color: #9aa0a4; font-style: italic; margin: 0 1rem 1rem; font-size: 0.85rem; }}

    #export {{
      position: fixed; bottom: 1rem; right: 1rem;
      padding: 0.5rem 0.9rem; background: #2a8c5b; color: #fff;
      border: 0; border-radius: 6px; font: inherit; cursor: pointer;
    }}
    #out {{
      position: fixed; bottom: 4rem; right: 1rem;
      max-width: 560px; max-height: 40vh; overflow: auto;
      padding: 0.75rem; background: #0c0e0f;
      border: 1px solid #2c3134; border-radius: 6px;
      white-space: pre; font: 12px/1.4 ui-monospace, monospace;
      display: none;
    }}
  </style>
</head>
<body>
<h1>Cellshire Boot Screen Audition</h1>
<p class="intro">Each candidate previews the bare background <em>with the
real loading card overlaid at actual proportions</em>. Pick the one whose
composition leaves the centre breathing for the panel without competing
for attention.</p>

{candidates}

<button id="export" type="button">Export selection</button>
<pre id="out"></pre>
<script>
document.getElementById('export').addEventListener('click', () => {{
  const selected = document.querySelector('input[name="boot_screen"]:checked');
  const out = document.getElementById('out');
  if (!selected) {{ out.textContent = '(no selection yet)'; out.style.display = 'block'; return; }}
  out.textContent = `VISUAL_SELECTIONS = [
    VisualSelection("boot_screen", ${{JSON.stringify(selected.value)}}, "boot"),
]`;
  out.style.display = 'block';
}});
</script>
</body>
</html>
"""


CARD_HTML = """
      <div class="loading-card">
        <div class="loading-logo"><img src="{logo}" alt=""></div>
        <div class="loading-title">Cellshire</div>
        <div class="loading-sub">Opening the quarry...</div>
        <div class="loading-bar"><div class="loading-fill"></div></div>
        <div class="loading-status">warming the kilns</div>
      </div>
"""


def render() -> str:
    if not LOGO_SRC.exists():
        sys.stderr.write(f"warning: logo missing at {LOGO_SRC} — overlay will look bare\n")
    # The audition.html lives in TMP_ROOT so paths are relative to that.
    # Use absolute path with file:// so the logo loads when opened directly.
    logo_path = LOGO_SRC.resolve().as_posix()

    blocks: list[str] = []
    for p in BOOT_PROMPTS:
        img = TMP_ROOT / p.tier / p.parent_id / f"{p.id}.png"
        if not img.exists():
            bg = ('<div class="stage" style="display:flex;align-items:center;'
                  'justify-content:center;color:#a23a3a">not generated yet</div>')
        else:
            rel = img.relative_to(TMP_ROOT)
            bg = (
                '<div class="stage">'
                f'<img class="bg" src="{rel}" alt="">'
                + CARD_HTML.format(logo=logo_path) +
                '</div>'
            )
        blocks.append(
            f'<div class="candidate">'
            f'{bg}'
            f'<div class="meta"><label><input type="radio" name="boot_screen" '
            f'value="{p.id}"> <strong>{p.id}</strong> · seed {p.seed}</label></div>'
            f'<div class="prompt">{p.prompt}</div>'
            f'</div>'
        )
    return HTML.format(candidates="\n".join(blocks))


def main() -> int:
    if not TMP_ROOT.exists():
        sys.stderr.write(f"{TMP_ROOT} missing — run --tier boot first\n")
        return 1
    out = TMP_ROOT / "boot-audition.html"
    out.write_text(render())
    print(f"Wrote {out.relative_to(ROOT)}")
    print("Open:")
    print(f"  xdg-open {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
