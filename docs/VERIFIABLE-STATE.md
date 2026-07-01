# Verifiable State — porting the "TEE worlds on CKB" model to Cellshire

> **Status:** design note / non-normative. Additive only. The first pipeline
> slices now exist in `src/mining/miningSessionTape.js`: mining hits are
> journaled as a replayable JS tape, committed mining yield uses integer-scaled
> USD/reward math instead of `.toFixed(8)` float rounding, and replayed sessions
> can be serialized to canonical bytes plus a 32-byte CKB blake2b commitment.
> `verifier/mining-parity` now contains the first Rust conformance harness for
> the frozen JS commitment vector. The remaining full reducer port and on-chain
> verifier pieces below are still design targets.
>
> **Companion:** the reference implementation of this pattern lives in the
> `crypto-blast` repo (`src/sim/`, `verifier/`, `docs/COMMITMENT.md`,
> `docs/ESCROW.md`). Function/path references to it below are for porting.

---

## 0. TL;DR

- Cellshire already uses **two** on-chain models. The economy/ownership layer
  (`src/chain/*Tx.js`, UDT balances, ore cells) is **"cells-as-truth"** — the
  ledger *is* the state. That is the correct tool for balances and ownership and
  should stay as-is.
- The crypto-blast **"tape → replay → hash commitment"** model is a *different*
  tool, for **bounded, adversarial, value-producing computations**. In Cellshire
  the natural fit is **mining yield**: a session that produces claimable
  currency, where a player would profit from forging a bigger payout.
- **Procgen** is already ~90% in the spirit of the model (world reconstructible
  from an on-chain epoch seed). It just isn't *verified* by a replay script yet,
  and has one non-deterministic leak (`Math.random()` fallback).
- **Do not** try to commit the whole persistent world as one tape. It is
  open-ended; a single CKB script cannot replay unbounded history. Scope the
  model **per mining session / per epoch**.

---

## 1. Two on-chain models — pick the right tool per component

| | **Tape/replay** (crypto-blast) | **Cells-as-truth** (Cellshire today) |
|---|---|---|
| Where truth lives | off-chain deterministic engine; chain holds a **32-byte blake2b commitment** | actual **cells** (UDT balances, ore cells, property snapshots) |
| Chain's job | re-execute a `{seed, inputs[]}` tape on dispute; exit 0 iff replay hashes match the claim | hold state directly; every mutation is a transaction |
| Cost model | **optimistic** — cheap unless disputed; one big replay | pay-per-mutation; state *is* the cost |
| Best for | bounded adversarial **sessions** (a match, a wager, a mining run) | persistent economic **ledger** (who owns what, balances) |
| Wrong for | ledgers, ownership, open-ended worlds | one-off computations you only need to *verify*, not store |

**Rule of thumb:** if the thing you want to secure is *"who owns X / what is the
balance"* → cell. If it is *"was this value-producing computation performed
honestly"* → tape.

---

## 2. Component-by-component verdict

| Subsystem | Key files | Fits tape model? | Verdict |
|---|---|---|---|
| **Mining yield** | `mining/OreState.js`, `chain/miningTx.js`, `mining/miningAdapter.js`, `mining/cryptoEconomy.js` | ✅ **Strong fit** | Bounded session, produces claimable currency, clear adversarial incentive. The centerpiece — see §3. |
| **Procgen world** | `worldgen/procgen.js`, `chain/epochSeed.js` | ✅ **Already ~90%** | Seed derives from the epoch anchor block hash. World is reconstructible from an on-chain value today. Needs the `Math.random()` fallback removed from any committed path + a Rust parity port to be *verified*. See §6. |
| **Farm / crops** | `farm/farmState.js` | 🟡 **Fixable** | Wall-clock `growMs` breaks determinism, but epoch-based timing (`growEpochs`) is already supported. Only worth taping if crop yield is claimable value. See §7. |
| **Tool / building progression** | `progression/toolProgression.js`, `progression/buildingProgression.js` | 🟡 Fixable, low value | Deterministic if journaled, but no adversarial pressure (nobody profits from forging your pickaxe level). Probably not worth a verifier. |
| **Currencies / UDT balances** | `chain/udtBalance.js`, `economy/*` | ❌ **Wrong tool** | Already cells-as-truth. Don't replay a ledger. |
| **Property / marketplace / bank** | `chain/propertySnapshotTx.js`, `chain/marketplacePurchaseTx.js`, `chain/bankTx.js` | ❌ **Wrong tool** | Transactional ownership → correctly modeled as actual cells already. |

---

## 3. The centerpiece — mining as a verifiable session

Mining maps onto crypto-blast almost one-to-one, and the scaffolding largely
exists already.

### 3.1 Primitive correspondence

| crypto-blast primitive | Cellshire equivalent | Status today |
|---|---|---|
| `seed` (match nonce) | epoch anchor block hash → `seedFromHash` (`chain/epochSeed.js:59`) | ✅ on-chain-derived |
| `tape` of `TickInput` | ordered list of **mine actions** `{ oreId, capacityPerHit, yieldMultiplier }` | ⬜ not journaled yet |
| `stepWorld(world, input)` reducer | `OreState.mine(rand, opts)` (`mining/OreState.js:72`) | ✅ isolated, `rand` injectable |
| `commitWorld(world)` → 32-byte hash | blake2b of `{ oreId, epoch, capacity_remaining, yield_nonce, total_yield }` | ✅ JS canonical serialization + golden commitment |
| verifier lock exits 0 iff replay matches | gates the **UDT yield mint** (`buildYieldCell`, `chain/miningTx.js:21`) | ⬜ Rust verifier port |
| escrow/court (Phase 4A) | **not needed** for solo mining (no opponent to equivocate) | n/a |

**Economic claim being secured:** *"I mined ore `oreId` over N hits under epoch
seed S, and it legitimately yielded amount Y of currency C."* A verifier that
re-derives Y from `(S, oreId, hit-tape)` means a player **cannot forge a larger
payout** — the exact guarantee crypto-blast's Phase 2 verifier lock gives a
match outcome, except it gates a *mint* instead of a *pot*.

### 3.2 Why solo mining is *easier* than a crypto-blast match

- **No equivocation problem.** crypto-blast's whole Phase 4A escrow / interleaved
  hash-chain (`docs/ESCROW.md`) exists because two adversaries each sign moves and
  the last mover can rewrite history. Solo mining has one actor and one signer;
  the residual final-move vulnerability simply does not arise.
- **Tiny world state.** crypto-blast commits a 921,600-byte terrain mask; a mining
  session commits a handful of integers per ore. Cycle cost and memory are a
  non-issue relative to the 200M/4MB CKB ceilings.
- **Bounded by construction.** An ore has finite `capacity_max`; the tape can
  never exceed capacity-many hits. No unbounded-replay risk.

---

## 4. Determinism spec (what must change to make mining tapeable)

These mirror crypto-blast's hard invariants (`docs/COMMITMENT.md` §9). Ordered by
effort. **All are additive/parametric — the seams already exist.**

### 4.1 Seed the mining RNG (plumbing, not rewrite)

Today the production path calls `OreState.mine(Math.random, ...)`. Replace with a
serializable per-ore cursor derived from on-chain values:

```
oreSeed  = blake2b(epochHash ‖ oreId)          // oreId already stable & deterministic
hitState = mulberry32Cursor(oreSeed)           // advance once per hit, store the i32 cursor
```

- `oreId` is already the deterministic string `ore:mapId:epoch:gx:gy:assetId`
  (`mining/oreIdentity.js:7`) — a perfect domain-separation key.
- `mulberry32` already exists in `worldgen/procgen.js`; crypto-blast's serializable
  cursor form is `src/core/rng.ts` `nextRandom(state)` — copy that shape so the
  RNG state lives *in the committed struct*, not in a closure.
- The `yield_nonce` field on the ore cell (`chain/miningTx.js:16`) is the natural
  home for (or derivation input to) the cursor across transactions.

### 4.2 Kill floating-point in the yield math (implemented for JS)

The committed JS mining yield path now uses fixed-scale integers instead of
`.toFixed(8)` float rounding. Keep that invariant intact in any future committed
path; float → string → float rounding is **the** cross-engine divergence hazard,
the same class of bug crypto-blast hit with `Math.round` vs `f64::round`
(`docs/COMMITMENT.md` invariant #4).

Adopt crypto-blast's fixed-point discipline (`src/sim/serialize.ts`
`FLOAT_SCALE`, `verifier/src/lib.rs` `quantize`):

- Represent USD value and currency amounts as **integers** in a fixed scale
  (e.g. USD in micro-dollars `×1e6`, currency in the coin's native smallest unit).
- Do the division as integer math with an explicit rounding rule that **both**
  the JS engine and the Rust verifier implement identically.
- Prices (`CURRENCY_CATALOG[*].priceUsd`, `cryptoEconomy.js:19`) must be pinned as
  **integers in a fixed scale** in the committed price snapshot, not floats.

> This is the single biggest correctness item. Until yield math is integer-exact,
> a Rust verifier cannot reproduce the TS result byte-for-byte.

### 4.3 Remove `Math.random()` from any committed path

`epochSeed.js:196` falls back to `Math.floor(Math.random() * 1e9)` when the chain
is unreachable. That is fine for *offline play*, but a world generated from a
random seed is **unverifiable**. For a committed/claimable session, **fail closed**
(refuse to mint) rather than mint against a random-seeded world.

### 4.4 Keep render timing out of the commitment

crypto-blast excludes render-only fields (`prevX`, `prevY`, `events`) from the
commitment (`docs/COMMITMENT.md` invariant #10). Do the same: ore-crumble
animations keyed to `performance.now()` / `_pendingDepletions` are **render-only**
and must not feed any committed value. No change needed as long as the commitment
draws solely from `OreState` integers, not animation clocks.

### 4.5 Journal the action tape

Mutations today are destructive (only current state is persisted to
`localStorage`). To replay you need the **inputs**, not just the final state.
Append each mine action `{ oreId, capacityPerHit, yieldMultiplier }` to a
per-session tape (crypto-blast: `src/sim/tape.ts` `recordTick`, binary form
`src/sim/tapeBinary.ts`). The tape is what goes in the witness.

---

## 5. Verifier shape (mirror crypto-blast Phase 2)

Reference: `crypto-blast/verifier/contract/src/main.rs`.

```
lock.args  = epoch_seed(4 LE) ‖ ore_id_hash(32) ‖ claimed_yield_commitment(32)
witness[0].lock = mining tape (compact per-hit encoding)

program_entry:
  1. parse args (fixed length)
  2. load witness tape
  3. reconstruct ore state from (epoch_seed, ore_id_hash)   // deterministic OreState.fromAsset
  4. for each hit in decode_tape(tape): step (mine)          // integer-exact yield math
  5. digest = ckb_blake2b(serialize_session(state))
  6. exit 0 iff digest == claimed_yield_commitment, else non-zero
```

Port targets (Rust, `no_std` + `alloc`, byte-identical to the JS engine):
- `OreState.mine` → `ore.rs::step`
- `cryptoEconomy` integer yield math → `economy.rs`
- canonical session serialization → `serialize_session` (field order **load-bearing**, freeze with golden vectors like `crypto-blast/tests/commit.test.ts`)
- conformance suite (Rust ≡ TS) → mirror `crypto-blast/verifier/tests/conformance.rs`

**Effort note:** this Rust port only covers the mining reducer (~`mining/` is
~842 LOC), not the 21k-LOC game. It is a bounded, well-scoped chunk.

---

## 6. Procgen — already "TEE-world"-shaped

`worldgen/procgen.js` uses a seeded `mulberry32` and the seed comes from the epoch
anchor block hash (`chain/epochSeed.js`). This means **the entire ore layout for
an epoch is already reconstructible from a single on-chain value** — the defining
property of the crypto-blast model.

To make it *verifiable* (not merely deterministic):
1. Remove / fail-closed the `Math.random()` fallback for committed sessions (§4.3).
2. Ensure procgen uses only cross-engine-safe ops (crypto-blast avoids `Math.sin`
   via `src/core/trig.ts` `dsin/dcos`; check `procgen.js` value-noise for any
   transcendental that would diverge on RISC-V softfloat).
3. Port procgen to Rust with golden-vector parity so a verifier can independently
   regenerate the ore layout and confirm a claimed `oreId` really exists at
   `(gx, gy)` for that epoch.

Until then procgen is *trusted-deterministic* (client reproduces it) but not
*chain-verified* (no script re-derives it).

---

## 7. Farm — epoch-time migration (if crop yield is claimable)

`farm/farmState.js` grows crops on wall-clock `plantedAt + growMs`. Wall-clock is
not a tape input, so it breaks determinism. The code already supports epoch-based
timing (`plantedEpoch + readyEpoch`); switching the committed path to **epoch
time** (a monotonic on-chain quantity) makes farming replayable on the same terms
as mining. Only pursue this if crop output becomes claimable value worth
verifying — otherwise leave it as local, render-only sim.

---

## 8. Non-goals (what NOT to tape)

- **The persistent world as a single tape.** Open-ended, unbounded → can't replay
  in one script. Scope per session/epoch.
- **Balances, ownership, loans, marketplace listings.** Already cells-as-truth;
  replay is the wrong tool and would be strictly worse.
- **Cosmetic/progression state with no adversarial incentive.** Determinism is
  possible but the verifier buys nothing.

---

## 9. Incremental adoption path

Each step is independently valuable and does not require the next:

1. **Deterministic offline replay (no chain).** Seed the mining RNG (§4.1) +
   integer yield math (§4.2) + journal the tape (§4.5). Deliverable: a JS
   `replayMiningSession(seed, tape)` that reproduces yield exactly, plus golden
   vectors. *This alone gives reproducible, auditable mining with zero on-chain
   work.*
2. **Client-side commitment.** Add `commitSession` (blake2b) + freeze golden
   commitments (mirror `crypto-blast/tests/commit.test.ts`). Implemented in JS
   as `commitMiningSession()` with canonical byte vectors.
3. **Rust parity port + conformance.** Port the reducer; prove Rust ≡ TS
   byte-for-byte (mirror `verifier/tests/conformance.rs`). First harness now
   exists at `verifier/mining-parity` for canonical bytes + CKB blake2b digest.
4. **Verifier lock.** Deploy the §5 script; gate the yield mint on it
   (mirror `docs/VERIFIER_DEPLOY.md`).

Stop at whatever rung delivers enough value; the model degrades gracefully.

---

## 10. crypto-blast invariants worth copying verbatim

From `crypto-blast/docs/COMMITMENT.md` §9 — these are the tripwires that keep
past commitments valid forever:

1. Reducer input ordering / enums are **append-only** (cf. `WEAPON_ORDER`).
2. Serialization field order is **load-bearing** — never reorder; freeze with
   golden vectors.
3. Fixed-point scale is **frozen** (pick one, e.g. `1e6` USD micro-units).
4. **One rounding rule**, implemented identically in JS and Rust.
5. RNG is a **serializable integer cursor**, not a closure — state lives in the
   committed struct.
6. **No** `Date.now` / `performance.now` / `Math.random` in any committed path.
7. **No** transcendental ops that diverge across engines (or use a polynomial
   approximation like `dsin`).
8. Render-only fields **excluded** from the commitment.

---

*Written 2026-07-02. Purely additive design note; no Cellshire source was
modified. Cross-references to line numbers reflect the tree at time of writing —
re-verify before implementing.*
