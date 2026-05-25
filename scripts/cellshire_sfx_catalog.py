# -*- coding: utf-8 -*-
"""Cellshire SFX prompt catalog.

Each entry drives one or more Stable Audio 3 small-sfx generations.

Fields:
  id           Cellshire clip id — also the filename stem (e.g. "wood_chop" → wood_chop.wav).
  layer        Grouping for the contact sheet (harvest, crafting, economy, ...).
  prompt       Descriptive sound prompt. Stable Audio 3 SFX is tuned for
               descriptive *sound* language, not literary cues.
  duration     Target length in seconds. SA3 outputs up to ~47s; SFX clips
               should stay tight (0.3-3s typical).
  seed         Base seed. The runner adds 0..N for candidate variants.
  candidates   How many seeded variants to generate. 1 for very short
               deterministic UI taps, 3 for music-style clips that benefit
               from selection.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class SfxPrompt:
    id: str
    layer: str
    prompt: str
    duration: float
    seed: int
    candidates: int = 3


NEGATIVE_PROMPT = (
    "speech, vocals, singing, talking, narration, music, melody, "
    "long sustain, drone, reverb tail, low fidelity, distorted, "
    "clipped, noisy, hum, background noise"
)


SFX_CATALOG: List[SfxPrompt] = [
    # ── Harvest layer ────────────────────────────────────────────────
    SfxPrompt("wood_chop",       "harvest",  "a sharp wooden chop, axe biting into a tree trunk, crisp split, no music",                 1.4, 3101),
    SfxPrompt("stone_strike",    "harvest",  "a heavy iron pickaxe striking solid stone, chunky impact, slight rocky ring, no music",     1.3, 3102),
    SfxPrompt("crop_harvest",    "harvest",  "leafy crop being pulled from soil, short rustle and earthy pluck, no music",                0.9, 3103),
    SfxPrompt("herb_pluck",      "harvest",  "small leafy herb snapped off a stem, light crisp pluck, very short, no music",              0.7, 3104),

    # ── Mining (richer than current placement reuse) ─────────────────
    SfxPrompt("mine_strike",     "mining",   "meaty pickaxe blow on an ore deposit, dense rocky thunk with metallic edge, no music",      1.3, 3201),
    SfxPrompt("mine_deplete",    "mining",   "a rock face crumbling and shattering, layered debris fall, no music",                       2.0, 3202),
    SfxPrompt("ore_yield",       "mining",   "a small bright crystalline chime, magical sparkle pickup, very short, no music",            0.7, 3203),

    # ── Crafting layer ───────────────────────────────────────────────
    SfxPrompt("craft_success",   "crafting", "warm wooden workbench thunk followed by a bright two-note chime, success cue, no music",    1.6, 3301),
    SfxPrompt("tool_upgrade",    "crafting", "rising metallic shimmer, anvil ting then a clean ascending sparkle, upgrade cue, no music", 2.0, 3302),
    SfxPrompt("building_unlock", "crafting", "a confident three-note bright bell fanfare, achievement cue, no vocals, no music",          2.5, 3303),
    SfxPrompt("recipe_fail",     "crafting", "a short low descending buzz, failure cue, dry and abrupt, no music",                        0.6, 3304),

    # ── Economy layer ────────────────────────────────────────────────
    SfxPrompt("coin_chime",      "economy",  "a single bright coin chime, short metallic ping, very short, no music",                     0.5, 3401),
    SfxPrompt("coin_shuffle",    "economy",  "many coins tumbling and shuffling together, currency exchange sound, no music",             1.4, 3402),
    SfxPrompt("loan_borrow",     "economy",  "a heavy coin stack thud followed by a low warm chord, lending cue, no vocals, no music",    1.6, 3403),
    SfxPrompt("loan_repay",      "economy",  "a clean coin clink followed by a bright chord, repayment cue, no vocals, no music",         1.6, 3404),
    SfxPrompt("purchase_done",   "economy",  "a vintage cash register ding with a soft drawer close, purchase confirmation, no music",    1.2, 3405),

    # ── Map travel ───────────────────────────────────────────────────
    SfxPrompt("portal_whoosh",   "travel",   "a gentle magical whoosh teleport, soft sweep, short and clean, no music",                   1.6, 3501),
    SfxPrompt("arrive_mine",     "travel",   "a deep cave reverb tail, distant water drip, ambient cave atmosphere, no music",            1.4, 3502),
    SfxPrompt("arrive_property", "travel",   "a cozy hearth crackle with soft wind chime tail, home ambient, no music",                   1.4, 3503),
    SfxPrompt("arrive_township", "travel",   "a bustling medieval village ambient swell, distant voices and footsteps, no narration",     1.8, 3504),

    # ── Property ─────────────────────────────────────────────────────
    SfxPrompt("tier_unlock",     "property", "a triumphant ascending sparkle and bright bell, property expansion fanfare, no music",      3.0, 3601),
    SfxPrompt("save_success",    "property", "a soft confirming tick with a tiny chime, subtle save cue, very short, no music",           0.6, 3602),

    # ── UI ───────────────────────────────────────────────────────────
    SfxPrompt("toast_success",   "ui",       "a clean bright tick, positive notification, very short, no music",                          0.4, 3701, candidates=2),
    SfxPrompt("toast_error",     "ui",       "a low muffled thud, error notification, very short, no music",                              0.4, 3702, candidates=2),
    SfxPrompt("toast_info",      "ui",       "a soft neutral tap, informational notification, very short, no music",                      0.4, 3703, candidates=2),
    SfxPrompt("wallet_connect",  "ui",       "a digital handshake sound, two soft synth blips ascending, short, no music",                0.8, 3704),
    SfxPrompt("modal_open",      "ui",       "a quiet airy whoosh, panel opening, very short and subtle, no music",                       0.5, 3705),

    # ── Player ───────────────────────────────────────────────────────
    SfxPrompt("footstep_grass",  "player",   "a single soft footstep on grass, gentle rustle, very short, no music",                      0.3, 3801, candidates=4),
    SfxPrompt("footstep_stone",  "player",   "a single footstep on stone, harder impact, very short, no music",                           0.3, 3802, candidates=4),

    # ── Epochs ───────────────────────────────────────────────────────
    SfxPrompt("shift_change",    "epoch",    "a deep distant bell ring followed by a brief shimmer sweep, time-shift cue, no music",      2.0, 3901),
    SfxPrompt("high_value_sting","epoch",    "a brilliant ascending three-note sparkle sting, rare-event cue, no vocals, no music",       2.0, 3902),
]


def total_clip_count() -> int:
    return sum(p.candidates for p in SFX_CATALOG)


if __name__ == "__main__":
    by_layer: dict[str, int] = {}
    for p in SFX_CATALOG:
        by_layer[p.layer] = by_layer.get(p.layer, 0) + p.candidates
    print(f"Cellshire SFX catalog — {len(SFX_CATALOG)} clips, {total_clip_count()} generations")
    for layer, count in by_layer.items():
        print(f"  {layer:10s} {count:3d}")
