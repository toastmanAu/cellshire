# -*- coding: utf-8 -*-
"""Cellshire township / interior / NPC visual generation catalog.

Three tiers, each with its own art direction prefix:

* **buildings** — same isometric voxel style as existing tile assets.
  Reads at game zoom; one-tile silhouette; plain light grey background.
* **interiors** — stylized illustrations for RPG window backdrops. NOT
  voxel. Painted/lit perspective inside the building.
* **npcs** — small character sprites matching the existing player
  character format (`player_miner.png` style). Two-direction facing
  expected once Codex wires them.

Seeds are namespaced per tier to keep file ids stable across reruns.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


BUILDING_STYLE = (
    "Single isolated Cellshire township building asset, centered with generous "
    "padding. Isometric voxel building style, Minecraft-style pixel cube "
    "construction, 30-degree isometric viewing angle, chunky square voxel "
    "details, compact readable silhouette, top-left lighting. Keep the cubic "
    "pixel-grid look exact, no smoothing, no rounding, no glossy plastic. "
    "Plain solid light grey background."
)

INTERIOR_STYLE = (
    "Stylized painted illustration of an RPG building interior, viewed from "
    "the front like a shopkeeper's perspective. Warm cosy fantasy aesthetic, "
    "painterly textures, soft volumetric lantern light, balanced composition "
    "with a clear focal counter or feature. 16:9 landscape framing with "
    "moderate depth. NOT pixel art, NOT voxel, NOT photorealistic. No people "
    "in frame. Detailed but readable at small UI sizes."
)

BOOT_STYLE = (
    "Cinematic wide establishing shot for a cosy crypto-mining village game. "
    "Stylized voxel-and-painted hybrid aesthetic — chunky voxel building and "
    "terrain shapes set in soft atmospheric lighting like a painted matte "
    "background. Wide 16:9 framing with breathing room in the centre (do "
    "NOT place the main subject dead centre — keep it offset so a UI panel "
    "can sit in the middle of the frame without overlap). Warm earthy "
    "Cellshire palette: ochre, terracotta, dusty cream, deep teal sky, "
    "soft golden light. Atmospheric perspective and gentle haze at the "
    "horizon. No characters, no people in frame, no text."
)


NPC_STYLE = (
    "Single isolated Cellshire NPC character sprite, full body facing the "
    "viewer slightly to the right, centered with generous padding. Chunky "
    "voxel character style matching the existing Cellshire player sprites: "
    "blocky proportions, Minecraft-style head and limbs, clear silhouette, "
    "warm fantasy-village colour palette, top-left lighting. Plain solid "
    "light grey background. No text, no logo, no extra characters."
)


BUILDING_NEGATIVE = (
    "photorealistic, smooth 3d render, rounded shapes, clay render, soft toy, "
    "low-poly, painterly, watercolor, anime, flat icon, vector art, UI icon, "
    "text, logo, watermark, complex background, floor plane, cast shadow, "
    "cropped subject, multiple objects, blurry, noisy edges"
)

INTERIOR_NEGATIVE = (
    "voxel, pixel art, Minecraft style, blocky, low-poly, isometric tile, "
    "text, logo, watermark, blurry, distorted, cropped, dark gloomy, "
    "photorealistic faces, people, characters, signage with letters"
)

BOOT_NEGATIVE = (
    "main subject centred in frame, large central object blocking middle, "
    "characters, people, faces, text, logo, watermark, signage with letters, "
    "low quality, blurry, distorted, cropped, harsh contrast, neon, "
    "futuristic, cyberpunk, sci-fi, weapons, blood, dark gothic, "
    "frame border, vignette overlay, painted UI elements"
)


NPC_NEGATIVE = (
    "photorealistic, smooth 3d render, rounded shapes, clay render, soft toy, "
    "low-poly mesh, painterly, watercolor, anime, flat icon, vector art, "
    "text, logo, watermark, complex background, cast shadow, multiple "
    "characters, weapons drawn, aggressive pose, blurry, noisy edges"
)


@dataclass(frozen=True)
class VisualPrompt:
    id: str
    tier: str
    parent_id: str  # asset slot or scene id; multiple candidates share parent
    seed: int
    prompt: str


# ── Tier 1: Township buildings ────────────────────────────────────────
# Codebase already references these slot ids in src/township/townshipZone.js
# but currently substitutes generic house variants (cube_house, terrace_house,
# two_story, villa) as fallback.

BUILDING_PROMPTS: List[VisualPrompt] = [
    # township_store — General Store
    VisualPrompt("township_store_a_awning", "buildings", "township_store", 7101,
        "A small township General Store building. Warm wooden voxel structure "
        "with a striped cloth awning over the front counter, stacked goods crates "
        "outside, a hanging shop sign with a generic basket icon (no readable "
        "letters), and a tidy door. Reads as a village goods trader."),
    VisualPrompt("township_store_a_stall", "buildings", "township_store", 7102,
        "A township General Store with a front trading stall. Warm wood frame, "
        "open counter facing the street, baskets of goods, a barrel, and a "
        "simple awning roof. Compact and readable."),
    VisualPrompt("township_store_a_cottage", "buildings", "township_store", 7103,
        "A cosy General Store cottage with a display window. Whitewashed walls, "
        "warm wood trim, a small wooden sign post, two visible crates by the "
        "front, and a peaked roof. Village trader feel."),

    # township_market — Player Marketplace
    VisualPrompt("township_market_a_stalls", "buildings", "township_market", 7201,
        "A small Player Marketplace pavilion. Several open-air voxel stalls "
        "under one shared peaked roof, colourful cloth banners, baskets of "
        "miscellaneous goods. Bustling unique-trade feel, more open than a "
        "shop. No people in frame."),
    VisualPrompt("township_market_a_banners", "buildings", "township_market", 7202,
        "Player Marketplace building with prominent banner display. Open "
        "front, multiple tall pole banners in distinct colours, low counter "
        "with sample goods, exposed warm timber frame. Reads as a place for "
        "unique listings."),
    VisualPrompt("township_market_a_round", "buildings", "township_market", 7203,
        "A round Player Marketplace rotunda. Circular open-air voxel structure "
        "with peaked roof on wooden posts, market goods spread on a central "
        "counter, hanging cloth banners between posts. Welcoming and unique."),

    # township_bank — Bank
    VisualPrompt("township_bank_a_vault", "buildings", "township_bank", 7301,
        "A solid two-story township Bank building. Grey stone voxel walls, a "
        "prominent dark vault-style metal door on the ground floor, narrow "
        "barred windows, a small treasury motif above the door. Sturdy and "
        "trustworthy."),
    VisualPrompt("township_bank_a_pillars", "buildings", "township_bank", 7302,
        "A classical voxel Bank facade. Two short stone pillars flanking a "
        "heavy ironclad door, polished steps, small coin motif inset into the "
        "wall, peaked tile roof. Compact but imposing."),
    VisualPrompt("township_bank_a_strongbox", "buildings", "township_bank", 7303,
        "A blocky Bank vault-house. Grey limestone voxel walls reinforced with "
        "dark iron bands, a single thick metal door, a single small barred "
        "window, and a sturdy dark roof. Reads as a strongbox of a building."),

    # township_gallery — Gallery
    VisualPrompt("township_gallery_a_windows", "buildings", "township_gallery", 7401,
        "A tall narrow Gallery building. Whitewashed walls, three large clean "
        "display windows showing simple coloured shapes inside (no text), a "
        "small awning over the door, peaked roof. Reads as a place for "
        "displaying art."),
    VisualPrompt("township_gallery_a_atrium", "buildings", "township_gallery", 7402,
        "A Gallery building with an atrium feel. Light stone voxel walls, a "
        "tall central arched display window showing a coloured square inside, "
        "smaller side windows, modest stepped entrance, simple peaked roof."),
    VisualPrompt("township_gallery_a_modern", "buildings", "township_gallery", 7403,
        "A modest Cellshire Gallery. Pale stone walls, a single large picture "
        "window with a coloured triangle visible inside, a clean wooden door, "
        "and a slim balcony above the door. No text, no signage letters."),

    # township_community_hall — Community Hall
    VisualPrompt("township_community_hall_a_lodge", "buildings", "township_community_hall", 7501,
        "A wide single-story Community Hall lodge. Long warm timber walls, "
        "central chimney with smoke voxel cubes, double front doors, banners "
        "or pennants on either side, peaked shingled roof. Inviting gathering "
        "space."),
    VisualPrompt("township_community_hall_a_meeting", "buildings", "township_community_hall", 7502,
        "A Community Hall built around a central hearth. Long voxel hall, "
        "two visible windows showing warm interior light, central stone "
        "chimney rising through the roof, peaked roof, modest porch entry."),
    VisualPrompt("township_community_hall_a_chapel", "buildings", "township_community_hall", 7503,
        "A small Community Hall with a chapel-like silhouette. Warm wood and "
        "stone voxel walls, a tall peaked roof, two long stained-glass-like "
        "side windows showing coloured cubes, modest double doors. Communal "
        "and welcoming."),
]


# ── Tier 2: RPG interior backdrops ───────────────────────────────────
# Painted illustration style, NOT voxel. Sized for the existing RPG
# interior window panel aspect ratio (treat as 16:9 for safety).

INTERIOR_PROMPTS: List[VisualPrompt] = [
    VisualPrompt("interior_store_a_counter", "interiors", "interior_store", 7601,
        "Stylized painted RPG General Store interior. Wooden counter in the "
        "foreground with a brass scale and a stack of small crates, shelves "
        "of jars and bottles on the back wall, a hanging lantern providing "
        "warm light, swept wood plank floor. Cosy village shop atmosphere. "
        "No people."),
    VisualPrompt("interior_store_a_shelves", "interiors", "interior_store", 7602,
        "RPG General Store interior view. Multiple tall shelves filled with "
        "boxes, sacks of grain, hanging tools, a chalkboard-like sign on the "
        "wall with no readable text, a warm round lantern, polished wooden "
        "counter at the foreground. Painted illustration style."),
    VisualPrompt("interior_store_a_cosy", "interiors", "interior_store", 7603,
        "Warm cosy General Store interior with hearth glow. Stacked goods, "
        "barrels of dry goods, dangling herbs from ceiling beams, a soft "
        "lit display, warm fire glow on right side. Painterly fantasy art "
        "style, inviting."),

    VisualPrompt("interior_market_a_open", "interiors", "interior_market", 7611,
        "Stylized painted Player Marketplace interior. Wide open hall with "
        "rows of empty market stalls under cloth awnings, baskets and crates "
        "scattered, banners hanging from rafters, soft daylight streaming "
        "through high windows. No people. Painted illustration."),
    VisualPrompt("interior_market_a_bustle", "interiors", "interior_market", 7612,
        "Painted Player Marketplace interior with a sense of bustle. Many "
        "stall counters covered with miscellaneous goods, colourful banners, "
        "lanterns on poles, a sweeping view down a market aisle. No people. "
        "Warm illustration."),
    VisualPrompt("interior_market_a_atrium", "interiors", "interior_market", 7613,
        "Painted Player Marketplace interior atrium. Tall central skylight "
        "casts warm beams across a polished wooden floor, ringed by display "
        "stalls and banner draped pillars. Mixed handicrafts on tables. No "
        "people. Cosy fantasy art."),

    VisualPrompt("interior_bank_a_vault", "interiors", "interior_bank", 7621,
        "Stylized painted Bank interior. Polished wooden counter in the "
        "foreground with a small brass bell and a stack of ledger books, "
        "behind it a massive dark iron vault door, lanterns on either side, "
        "warm but formal atmosphere. No people. Painted illustration."),
    VisualPrompt("interior_bank_a_office", "interiors", "interior_bank", 7622,
        "Painted Bank office interior. Tall mahogany counter, an old chest "
        "of strongboxes on shelves behind, a heavy chair, scattered coin "
        "sacks on a side table, warm green-shaded lamp, stained glass window. "
        "No people. Detailed fantasy art."),
    VisualPrompt("interior_bank_a_treasury", "interiors", "interior_bank", 7623,
        "Painted treasury room of a fantasy Bank. Stacked chests of varying "
        "sizes, a tall scale with brass pans, a candlelit ledger on a "
        "writing desk, the corner of a vault door visible. Rich but not "
        "ostentatious. No people. Warm light."),

    VisualPrompt("interior_gallery_a_walls", "interiors", "interior_gallery", 7631,
        "Stylized painted Gallery interior. Long polished wooden floor, "
        "framed art on both side walls (visible as coloured blocks, no "
        "readable images), a central display plinth with a small statue, "
        "skylight glow from above. Quiet and dignified. No people."),
    VisualPrompt("interior_gallery_a_atrium", "interiors", "interior_gallery", 7632,
        "Painted Gallery atrium. High ceiling with arched skylight, soft "
        "light falling on framed art along the walls, a velvet rope around "
        "a central display, polished marble-like floor. No people. Elegant "
        "fantasy art."),
    VisualPrompt("interior_gallery_a_cozy", "interiors", "interior_gallery", 7633,
        "Cosy small painted Gallery interior. Warm timber walls covered in "
        "small framed paintings (coloured blocks, no readable detail), a "
        "single visitor bench in the centre, two soft lamps, a wooden "
        "display case. Inviting and small-town. No people."),

    VisualPrompt("interior_hall_a_hearth", "interiors", "interior_hall", 7641,
        "Stylized painted Community Hall interior. Long warm timber hall, "
        "central stone hearth with crackling fire, long communal benches on "
        "either side, hanging lanterns, a high beamed ceiling. Cosy "
        "gathering atmosphere. No people."),
    VisualPrompt("interior_hall_a_benches", "interiors", "interior_hall", 7642,
        "Painted Community Hall interior, viewed from the head of the hall. "
        "Two long rows of benches, a raised speaker's platform at the far "
        "end, banners hanging from rafters, candles in iron holders. Civic "
        "atmosphere. No people."),
    VisualPrompt("interior_hall_a_feast", "interiors", "interior_hall", 7643,
        "Painted Community Hall interior set for a small feast. Long wooden "
        "table down the centre laid with bowls and bread, candles along the "
        "middle, hearth on one side, banners above, warm welcoming glow. "
        "No people."),
]


# ── Tier 3: NPCs ──────────────────────────────────────────────────────
# Match existing player_miner / player_seeker / player_tinker sprite style.

NPC_PROMPTS: List[VisualPrompt] = [
    VisualPrompt("npc_storekeeper_a", "npcs", "npc_storekeeper", 7701,
        "A friendly Cellshire General Storekeeper character. Voxel character "
        "in a warm brown apron over a cream tunic, dark trousers, sturdy "
        "boots, holding a small ledger. Welcoming neutral expression. Match "
        "the existing Cellshire player sprite proportions and palette."),
    VisualPrompt("npc_storekeeper_b", "npcs", "npc_storekeeper", 7702,
        "Same Cellshire General Storekeeper, variant outfit. Tan vest over a "
        "white shirt, brown trousers, hands resting on hips, neat short hair. "
        "Voxel chunky proportions, top-left lighting, plain background."),
    VisualPrompt("npc_storekeeper_c", "npcs", "npc_storekeeper", 7703,
        "Same Cellshire General Storekeeper, third variant. Wears a long "
        "apron over a green shirt, holding a small wrapped parcel. Warm "
        "smile, voxel style, matches existing player sprite scale."),

    VisualPrompt("npc_trader_a", "npcs", "npc_trader", 7711,
        "A Cellshire Trader character — currency exchange specialist. Voxel "
        "character in a fine dark vest over a striped shirt, satchel of "
        "coins at the hip, holding a small balance scale. Quietly confident "
        "expression. Match Cellshire player sprite style."),
    VisualPrompt("npc_trader_b", "npcs", "npc_trader", 7712,
        "Same Cellshire Trader, variant outfit. Long traveling coat, "
        "shoulder bag, gloved hand holding a coin up to the light. Voxel "
        "chunky proportions, top-left lighting, plain background."),
    VisualPrompt("npc_trader_c", "npcs", "npc_trader", 7713,
        "Same Cellshire Trader, third variant. Wears a merchant's tabard "
        "over a tunic, hands clasped behind back, neat short beard. Voxel "
        "style, matches player sprite scale."),

    VisualPrompt("npc_bank_teller_a", "npcs", "npc_bank_teller", 7721,
        "A Cellshire Bank Teller character. Voxel character in a neat "
        "buttoned waistcoat over a white shirt, plain dark trousers, a "
        "small visor cap, holding a stack of ledger books. Polite formal "
        "expression. Match Cellshire player sprite style."),
    VisualPrompt("npc_bank_teller_b", "npcs", "npc_bank_teller", 7722,
        "Same Cellshire Bank Teller, variant outfit. Crisp suit-tunic, "
        "modest tie, half-moon glasses, hands holding a quill above an open "
        "ledger. Voxel chunky proportions, top-left lighting."),
    VisualPrompt("npc_bank_teller_c", "npcs", "npc_bank_teller", 7723,
        "Same Cellshire Bank Teller, third variant. Wears a dark green "
        "waistcoat, small key ring at belt, hands resting calmly. Voxel "
        "style, plain light grey background."),

    VisualPrompt("npc_gallery_curator_a", "npcs", "npc_gallery_curator", 7731,
        "A Cellshire Gallery Curator character. Voxel character in an "
        "elegant long jacket over a buttoned shirt, fine dark trousers, "
        "small spectacles, holding a small framed picture. Thoughtful "
        "expression. Match Cellshire player sprite style."),
    VisualPrompt("npc_gallery_curator_b", "npcs", "npc_gallery_curator", 7732,
        "Same Cellshire Gallery Curator, variant outfit. Soft scarf, "
        "embroidered vest, gloved hand gesturing to one side as if "
        "presenting. Voxel chunky proportions, plain background."),
    VisualPrompt("npc_gallery_curator_c", "npcs", "npc_gallery_curator", 7733,
        "Same Cellshire Gallery Curator, third variant. Wears a high "
        "collared coat in deep blue, hands clasped, calm refined posture. "
        "Voxel style, matches player sprite scale."),

    VisualPrompt("npc_hall_keeper_a", "npcs", "npc_hall_keeper", 7741,
        "A Cellshire Community Hall Keeper character. Voxel character in a "
        "warm hooded cloak over a tunic, sturdy boots, holding a wooden "
        "broom or staff. Friendly elder-of-the-village vibe. Match Cellshire "
        "player sprite style."),
    VisualPrompt("npc_hall_keeper_b", "npcs", "npc_hall_keeper", 7742,
        "Same Cellshire Hall Keeper, variant outfit. Wears a heavy wool "
        "shawl over a long tunic, simple belt, holding a lantern in one "
        "hand. Voxel chunky proportions, plain background."),
    VisualPrompt("npc_hall_keeper_c", "npcs", "npc_hall_keeper", 7743,
        "Same Cellshire Hall Keeper, third variant. Wears a long apron "
        "tunic, broom propped on shoulder, kind weathered face, voxel "
        "style, plain light grey background."),
]


BOOT_PROMPTS: List[VisualPrompt] = [
    VisualPrompt("boot_a_valley_township", "boot", "boot_screen", 7801,
        "Wide cinematic view of a small voxel township nestled in a warm valley "
        "at golden hour. Township buildings clustered on the LEFT third of the "
        "frame: small homes, a mill, a chapel silhouette, smoke rising from "
        "chimneys. The CENTRE and RIGHT of the frame open onto golden farmland "
        "and distant rolling foothills under a gentle teal-and-ochre sky. "
        "Keep the centre area open with low foreground meadow and sky so a "
        "loading panel can sit there cleanly."),
    VisualPrompt("boot_b_mine_entrance", "boot", "boot_screen", 7802,
        "Wide cinematic view of a stylized voxel mine entrance on the RIGHT "
        "side of the frame, set into a warm ochre cliff face. A timber-framed "
        "entrance, a few stacked wooden carts and crates beside it, a lantern "
        "glowing softly. The LEFT and CENTRE open onto a wide gravel approach "
        "path and distant scrub-grass plain under a high pale-blue sky. "
        "Atmospheric, hopeful, inviting."),
    VisualPrompt("boot_c_quarry_dawn", "boot", "boot_screen", 7803,
        "Wide cinematic view of a stylized voxel quarry pit at early dawn. "
        "Terraced ochre and grey limestone steps descending on the LEFT side "
        "of the frame, mist drifting across the lower terraces. Sunrise just "
        "cresting the horizon on the right with warm peach light spilling "
        "across the pit. The middle of the frame is open misty distance. No "
        "people, no machinery, calm and quietly grand."),
    VisualPrompt("boot_d_township_aerial", "boot", "boot_screen", 7804,
        "Wide high-angle isometric establishing shot of a small voxel "
        "township. Cluster of warm-roofed homes, market banners, stone "
        "streets, a central well, surrounded by farm plots and a small mine "
        "entrance at the upper edge. Subject occupies the LOWER THIRD of the "
        "frame with sky and soft cloud above to leave centre space for a "
        "loading panel. Warm late-afternoon light."),
    VisualPrompt("boot_e_hearth_night", "boot", "boot_screen", 7805,
        "Wide cinematic cosy night view of a Cellshire homestead. A "
        "single-story voxel home on the RIGHT side of frame with warm "
        "interior light glowing through windows and the silhouette of a "
        "hearth visible inside. A garden lantern on a post in the mid-ground. "
        "The LEFT and CENTRE open onto a dim starry sky over distant "
        "foothills. Warm gold light against cool blue night."),
    VisualPrompt("boot_f_misty_forest_edge", "boot", "boot_screen", 7806,
        "Wide cinematic dawn shot of a stylized voxel forest edge meeting "
        "a meadow. Tall voxel pines clustered on the LEFT, a few stone "
        "outcrops scattered in the meadow on the right, low ground mist "
        "drifting across. Soft pale dawn light, deep teal-green palette "
        "with warm cream highlights on the meadow grass. Centre of frame is "
        "open meadow and sky. Peaceful and full of possibility."),
]


def all_prompts() -> List[VisualPrompt]:
    return BUILDING_PROMPTS + INTERIOR_PROMPTS + NPC_PROMPTS + BOOT_PROMPTS


def prompts_for_tier(tier: str) -> List[VisualPrompt]:
    return [p for p in all_prompts() if p.tier == tier]


def style_for_tier(tier: str) -> str:
    return {
        "buildings": BUILDING_STYLE,
        "interiors": INTERIOR_STYLE,
        "npcs": NPC_STYLE,
        "boot": BOOT_STYLE,
    }[tier]


def negative_for_tier(tier: str) -> str:
    return {
        "buildings": BUILDING_NEGATIVE,
        "interiors": INTERIOR_NEGATIVE,
        "npcs": NPC_NEGATIVE,
        "boot": BOOT_NEGATIVE,
    }[tier]


def summary() -> str:
    by_tier: dict[str, int] = {}
    for p in all_prompts():
        by_tier[p.tier] = by_tier.get(p.tier, 0) + 1
    lines = [f"Cellshire township visual catalog — {len(all_prompts())} prompts"]
    for tier, count in by_tier.items():
        lines.append(f"  {tier:12s} {count:3d}")
    return "\n".join(lines)


if __name__ == "__main__":
    print(summary())
