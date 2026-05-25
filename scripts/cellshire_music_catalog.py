# -*- coding: utf-8 -*-
"""Cellshire backing-music catalog.

Six tracks cover the entire game audio surface: title/boot, three zone
beds (mine / property / township), one shared interior bed for RPG
building windows, and one high-value epoch sting.

SA3 medium is the model. Generations are seconds-long, so each track
gets a generous duration with structure (intro/bridge/drop) language
in the prompt. We generate 2 candidates per track by default — these
are long renders and ear-evaluation per pair is enough.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class MusicPrompt:
    id: str
    role: str
    prompt: str
    duration: float
    seed: int
    candidates: int = 2


NEGATIVE_PROMPT = (
    "vocals, singing, lyrics, narration, speech, talking, low quality, "
    "distorted, clipped, noisy, abrupt cuts, harsh transients"
)


MUSIC_CATALOG: List[MusicPrompt] = [
    MusicPrompt(
        id="title_boot",
        role="title",
        prompt=(
            "A short cinematic intro for a cozy crypto-mining village game. "
            "Slow rising synth pad, gentle plucked dulcimer or harp motif, "
            "ascending into a bright bell flourish. Hopeful, mysterious, "
            "calm but full of possibility. No vocals. Smooth fade in and out."
        ),
        duration=28.0,
        seed=4101,
    ),
    MusicPrompt(
        id="mine_zone",
        role="zone",
        prompt=(
            "A patient looping ambient bed for an underground mining map. "
            "Low warm pad, sparse marimba or kalimba notes, a slow gentle "
            "pulse, distant cave reverb texture, subtle metallic shimmer. "
            "Mysterious and curious, leaves headroom for crisp foreground "
            "pickaxe hits. No drums, no melody hook, no vocals. Loopable."
        ),
        duration=150.0,
        seed=4201,
    ),
    MusicPrompt(
        id="property_zone",
        role="zone",
        prompt=(
            "A cozy pastoral loop for a player home plot. Warm acoustic "
            "guitar fingerpicking, soft accordion, light hand percussion, "
            "small wooden flute melody. Comfortable, lived-in, gentle "
            "rhythm. Like a fireside hearth in a small farm cottage. "
            "No vocals. Loopable with smooth seam."
        ),
        duration=150.0,
        seed=4301,
    ),
    MusicPrompt(
        id="township_zone",
        role="zone",
        prompt=(
            "A bustling medieval-fantasy folk village loop. Fiddle, "
            "mandolin, bodhrán drum, hand claps, light tin whistle. "
            "Upbeat but unhurried, like a market day. An intro, a main "
            "section, a small bridge, a return to the main groove. No "
            "vocals. Loopable."
        ),
        duration=150.0,
        seed=4401,
    ),
    MusicPrompt(
        id="interior_bed",
        role="interior",
        prompt=(
            "A sparse low-volume RPG shop interior bed. Soft felt piano, "
            "distant wind chime, gentle wooden creak, very quiet ambient "
            "pad. Spacious, almost meditative, designed to sit underneath "
            "dialogue and menus. No melody hook, no drums, no vocals. "
            "Loopable seamlessly."
        ),
        duration=90.0,
        seed=4501,
    ),
    MusicPrompt(
        id="high_value_sting",
        role="sting",
        prompt=(
            "A brilliant celebratory orchestral sting for a rare-event "
            "discovery. Bright brass swell, harp glissando, a final shimmering "
            "chime. Triumphant, magical, very short. No vocals. Clean attack "
            "and decay, no looping needed."
        ),
        duration=6.0,
        seed=4601,
        candidates=3,
    ),
]


def total_clip_count() -> int:
    return sum(p.candidates for p in MUSIC_CATALOG)


if __name__ == "__main__":
    by_role: dict[str, int] = {}
    for p in MUSIC_CATALOG:
        by_role[p.role] = by_role.get(p.role, 0) + p.candidates
    print(f"Cellshire music catalog — {len(MUSIC_CATALOG)} tracks, {total_clip_count()} generations")
    for role, count in by_role.items():
        print(f"  {role:10s} {count:3d}")
