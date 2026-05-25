#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Install selected Cellshire music tracks into the game assets directory.

Mirrors ``install_cellshire_sfx.py`` for music. Source wavs come from
``tmp/music-generation/<track-id>/seed<N>.wav``; install destination
is ``assets/music/<track-id>.ogg``.

Music loops are encoded at higher quality (q:a 6, ~128 kbps stereo by
default) than SFX since they play continuously and listeners notice
artifacts much more readily than in a one-shot SFX hit.

Unlike SFX, music is **not** auto-wired by ``loadUiAudio()`` today. Codex
must add a small music-zone manager that loops the active track per
map kind (mine / property / township / interior) with crossfades on
travel. The JS stub block this script emits is a starting point.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP_ROOT = ROOT / "tmp" / "music-generation"
ASSETS_MUSIC = ROOT / "assets" / "music"


@dataclass(frozen=True)
class MusicSelection:
    track_id: str
    seed: int
    role: str   # title / zone / interior / sting
    loop: bool  # whether the music manager should loop this track


MUSIC_SELECTIONS: list[MusicSelection] = [
    MusicSelection("title_boot",       4102, "title",    loop=False),
    MusicSelection("mine_zone",        5202, "zone",     loop=True),  # kalimba_curious alt
    MusicSelection("property_zone",    4301, "zone",     loop=True),
    MusicSelection("township_zone",    4401, "zone",     loop=True),
    MusicSelection("interior_bed",     5301, "interior", loop=True),  # celesta_glow alt
    MusicSelection("high_value_sting", 4601, "sting",    loop=False),
]


def have_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def convert_to_ogg(src_wav: Path, dst_ogg: Path) -> None:
    dst_ogg.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(src_wav),
            "-c:a",
            "libvorbis",
            "-q:a",
            "6",
            str(dst_ogg),
        ],
        check=True,
    )


def render_js_snippet(selections: list[MusicSelection]) -> str:
    by_role: dict[str, list[MusicSelection]] = {}
    for sel in selections:
        by_role.setdefault(sel.role, []).append(sel)
    lines = [
        "// Music zone manifest — feed this to a new MusicManager.",
        "// Example consumer: src/ui/MusicManager.js (to be created by Codex).",
        "//",
        "// Suggested behaviour:",
        "//   - MusicManager.attach(game) listens for map-change events",
        "//   - on enter: pick track for map kind (mine|property|township|interior)",
        "//   - crossfade 800ms between active and next loop",
        "//   - one-shot sting (high_value_sting) plays over the active bed",
        "export const MUSIC_TRACKS = {",
    ]
    for role, entries in by_role.items():
        lines.append(f"  // {role}")
        for sel in entries:
            lines.append(
                f"  {sel.track_id}: {{ url: 'music/{sel.track_id}.ogg', loop: "
                f"{'true' if sel.loop else 'false'} }},"
            )
    lines.append("};")
    return "\n".join(lines)


def main() -> int:
    if not MUSIC_SELECTIONS:
        print("No selections recorded yet — review tmp/music-generation/audition.html")
        print("then edit MUSIC_SELECTIONS in this file and re-run.")
        return 0
    if not have_ffmpeg():
        print("ERROR: ffmpeg not found on PATH. Install ffmpeg first.", file=sys.stderr)
        return 1

    converted = 0
    missing: list[MusicSelection] = []
    for sel in MUSIC_SELECTIONS:
        src = TMP_ROOT / sel.track_id / f"seed{sel.seed}.wav"
        if not src.exists():
            missing.append(sel)
            continue
        dst = ASSETS_MUSIC / f"{sel.track_id}.ogg"
        convert_to_ogg(src, dst)
        print(f"  ✓ {sel.track_id:20s} → {dst.relative_to(ROOT)}")
        converted += 1

    if missing:
        print()
        for sel in missing:
            print(f"  ✗ missing seed wav for {sel.track_id} seed={sel.seed}")
        return 2

    print()
    print(f"Installed {converted} tracks into {ASSETS_MUSIC.relative_to(ROOT)}/")
    print()
    print("JS snippet:")
    print()
    print(render_js_snippet(MUSIC_SELECTIONS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
