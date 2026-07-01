pub const MINING_SESSION_COMMITMENT_SCHEMA_VERSION: u16 = 1;
pub const MINING_SESSION_TAPE_VERSION: u16 = 1;
pub const USD_VALUE_SCALE: u64 = 1_000_000;
pub const USD_PRICE_SCALE: u64 = 1_000_000_000_000;
pub const CURRENCY_AMOUNT_SCALE: u64 = 100_000_000;

const COMMITMENT_MAGIC: &[u8; 4] = b"CSMS";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MiningSession<'a> {
    pub epoch: &'a str,
    pub map_id: &'a str,
    pub ore_id: &'a str,
    pub ore_type: &'a str,
    pub gx: i32,
    pub gy: i32,
    pub initial: InitialState,
    pub actions: &'a [MiningAction<'a>],
    pub final_state: FinalState,
    pub rewards: &'a [RewardSummary<'a>],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct InitialState {
    pub capacity_remaining: u32,
    pub max_capacity: u32,
    pub total_value_usd_micros: u64,
    pub remaining_value_usd_micros: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FinalState {
    pub capacity_remaining: u32,
    pub remaining_value_usd_micros: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MiningAction<'a> {
    pub epoch: &'a str,
    pub map_id: &'a str,
    pub ore_id: &'a str,
    pub ore_type: &'a str,
    pub gx: i32,
    pub gy: i32,
    pub capacity_before: u32,
    pub capacity_after: u32,
    pub max_capacity: u32,
    pub total_value_usd_micros: u64,
    pub remaining_value_usd_before_micros: u64,
    pub remaining_value_usd_after_micros: u64,
    pub capacity_per_hit: u32,
    pub yield_multiplier: u32,
    pub price_snapshot: Option<PriceSnapshot<'a>>,
    pub result: MiningResult<'a>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PriceSnapshot<'a> {
    pub source: &'a str,
    pub captured_at: &'a str,
    pub vs_currency: &'a str,
    pub prices: &'a [CurrencyPrice<'a>],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CurrencyPrice<'a> {
    pub currency: &'a str,
    pub usd_price_scaled: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MiningResult<'a> {
    pub ore_type: &'a str,
    pub currency: &'a str,
    pub amount_units: u64,
    pub base_value_usd_micros: u64,
    pub value_usd_micros: u64,
    pub yield_multiplier: u32,
    pub capacity_spent: u32,
    pub depleted: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RewardSummary<'a> {
    pub currency: &'a str,
    pub amount_units: u64,
    pub base_value_usd_micros: u64,
    pub value_usd_micros: u64,
    pub hits: u32,
}

pub fn golden_two_hit_coal_session() -> MiningSession<'static> {
    static PRICES: [CurrencyPrice<'static>; 1] = [CurrencyPrice {
        currency: "zec",
        usd_price_scaled: 523_740_000_000_000,
    }];
    static REWARDS: [RewardSummary<'static>; 1] = [RewardSummary {
        currency: "zec",
        amount_units: 22_912_132,
        base_value_usd_micros: 60_000_000,
        value_usd_micros: 120_000_000,
        hits: 2,
    }];
    static ACTIONS: [MiningAction<'static>; 2] = [
        MiningAction {
            epoch: "14455",
            map_id: "mine:14455",
            ore_id: "ore:mine%3A14455:14455:5:7:coal_seam",
            ore_type: "coal_seam",
            gx: 5,
            gy: 7,
            capacity_before: 3,
            capacity_after: 2,
            max_capacity: 3,
            total_value_usd_micros: 90_000_000,
            remaining_value_usd_before_micros: 90_000_000,
            remaining_value_usd_after_micros: 60_000_000,
            capacity_per_hit: 1,
            yield_multiplier: 2,
            price_snapshot: Some(PriceSnapshot {
                source: "coingecko:simple-price",
                captured_at: "2026-05-18T14:06:32Z",
                vs_currency: "usd",
                prices: &PRICES,
            }),
            result: MiningResult {
                ore_type: "coal_seam",
                currency: "zec",
                amount_units: 11_456_066,
                base_value_usd_micros: 30_000_000,
                value_usd_micros: 60_000_000,
                yield_multiplier: 2,
                capacity_spent: 1,
                depleted: false,
            },
        },
        MiningAction {
            epoch: "14455",
            map_id: "mine:14455",
            ore_id: "ore:mine%3A14455:14455:5:7:coal_seam",
            ore_type: "coal_seam",
            gx: 5,
            gy: 7,
            capacity_before: 2,
            capacity_after: 1,
            max_capacity: 3,
            total_value_usd_micros: 90_000_000,
            remaining_value_usd_before_micros: 60_000_000,
            remaining_value_usd_after_micros: 30_000_000,
            capacity_per_hit: 1,
            yield_multiplier: 2,
            price_snapshot: Some(PriceSnapshot {
                source: "coingecko:simple-price",
                captured_at: "2026-05-18T14:06:32Z",
                vs_currency: "usd",
                prices: &PRICES,
            }),
            result: MiningResult {
                ore_type: "coal_seam",
                currency: "zec",
                amount_units: 11_456_066,
                base_value_usd_micros: 30_000_000,
                value_usd_micros: 60_000_000,
                yield_multiplier: 2,
                capacity_spent: 1,
                depleted: false,
            },
        },
    ];
    MiningSession {
        epoch: "14455",
        map_id: "mine:14455",
        ore_id: "ore:mine%3A14455:14455:5:7:coal_seam",
        ore_type: "coal_seam",
        gx: 5,
        gy: 7,
        initial: InitialState {
            capacity_remaining: 3,
            max_capacity: 3,
            total_value_usd_micros: 90_000_000,
            remaining_value_usd_micros: 90_000_000,
        },
        actions: &ACTIONS,
        final_state: FinalState {
            capacity_remaining: 1,
            remaining_value_usd_micros: 30_000_000,
        },
        rewards: &REWARDS,
    }
}

pub fn canonical_mining_session_bytes(session: &MiningSession<'_>) -> Vec<u8> {
    let mut w = ByteWriter::default();
    w.write_bytes(COMMITMENT_MAGIC);
    w.write_u16(MINING_SESSION_COMMITMENT_SCHEMA_VERSION);
    w.write_u16(MINING_SESSION_TAPE_VERSION);
    w.write_string(session.epoch);
    w.write_string(session.map_id);
    w.write_string(session.ore_id);
    w.write_string(session.ore_type);
    w.write_i32(session.gx);
    w.write_i32(session.gy);
    w.write_u32(session.initial.capacity_remaining);
    w.write_u32(session.initial.max_capacity);
    w.write_u64(session.initial.total_value_usd_micros);
    w.write_u64(session.initial.remaining_value_usd_micros);

    w.write_u32(session.actions.len() as u32);
    for (index, action) in session.actions.iter().enumerate() {
        write_action(&mut w, index as u32, action);
    }

    w.write_u32(session.final_state.capacity_remaining);
    w.write_u64(session.final_state.remaining_value_usd_micros);
    w.write_u32(session.rewards.len() as u32);
    for reward in session.rewards {
        w.write_string(reward.currency);
        w.write_u64(reward.amount_units);
        w.write_u64(reward.base_value_usd_micros);
        w.write_u64(reward.value_usd_micros);
        w.write_u32(reward.hits);
    }
    w.finish()
}

pub fn commit_mining_session(session: &MiningSession<'_>) -> [u8; 32] {
    ckb_blake2b_256(&canonical_mining_session_bytes(session))
}

pub fn commit_mining_session_hex(session: &MiningSession<'_>) -> String {
    to_hex_prefixed(&commit_mining_session(session))
}

pub fn to_hex_prefixed(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(2 + bytes.len() * 2);
    out.push_str("0x");
    for byte in bytes {
        out.push(nibble_to_hex(byte >> 4));
        out.push(nibble_to_hex(byte & 0x0f));
    }
    out
}

fn write_action(w: &mut ByteWriter, index: u32, action: &MiningAction<'_>) {
    w.write_u32(index);
    w.write_string(action.epoch);
    w.write_string(action.map_id);
    w.write_string(action.ore_id);
    w.write_string(action.ore_type);
    w.write_i32(action.gx);
    w.write_i32(action.gy);
    w.write_u32(action.capacity_before);
    w.write_u32(action.capacity_after);
    w.write_u32(action.max_capacity);
    w.write_u64(action.total_value_usd_micros);
    w.write_u64(action.remaining_value_usd_before_micros);
    w.write_u64(action.remaining_value_usd_after_micros);
    w.write_u32(action.capacity_per_hit);
    w.write_u32(action.yield_multiplier);
    write_price_snapshot(w, action.price_snapshot);

    w.write_string(action.result.ore_type);
    w.write_string(action.result.currency);
    w.write_u64(action.result.amount_units);
    w.write_u64(action.result.base_value_usd_micros);
    w.write_u64(action.result.value_usd_micros);
    w.write_u32(action.result.yield_multiplier);
    w.write_u32(action.result.capacity_spent);
    w.write_u8(u8::from(action.result.depleted));
}

fn write_price_snapshot(w: &mut ByteWriter, snapshot: Option<PriceSnapshot<'_>>) {
    let Some(snapshot) = snapshot else {
        w.write_u8(0);
        return;
    };
    w.write_u8(1);
    w.write_string(snapshot.source);
    w.write_string(snapshot.captured_at);
    w.write_string(snapshot.vs_currency);
    w.write_u32(snapshot.prices.len() as u32);
    for price in snapshot.prices {
        w.write_string(price.currency);
        w.write_u64(price.usd_price_scaled);
    }
}

#[derive(Default)]
struct ByteWriter {
    parts: Vec<u8>,
}

impl ByteWriter {
    fn write_string(&mut self, value: &str) {
        self.write_u32(value.len() as u32);
        self.write_bytes(value.as_bytes());
    }

    fn write_u8(&mut self, value: u8) {
        self.parts.push(value);
    }

    fn write_u16(&mut self, value: u16) {
        self.write_bytes(&value.to_le_bytes());
    }

    fn write_u32(&mut self, value: u32) {
        self.write_bytes(&value.to_le_bytes());
    }

    fn write_i32(&mut self, value: i32) {
        self.write_bytes(&value.to_le_bytes());
    }

    fn write_u64(&mut self, value: u64) {
        self.write_bytes(&value.to_le_bytes());
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        self.parts.extend_from_slice(bytes);
    }

    fn finish(self) -> Vec<u8> {
        self.parts
    }
}

fn nibble_to_hex(value: u8) -> char {
    match value {
        0..=9 => (b'0' + value) as char,
        10..=15 => (b'a' + value - 10) as char,
        _ => unreachable!(),
    }
}

const BLAKE2B_BLOCK_BYTES: usize = 128;
const BLAKE2B_OUT_BYTES: usize = 32;
const CKB_PERSONAL: &[u8; 16] = b"ckb-default-hash";

const IV: [u64; 8] = [
    0x6a09e667f3bcc908,
    0xbb67ae8584caa73b,
    0x3c6ef372fe94f82b,
    0xa54ff53a5f1d36f1,
    0x510e527fade682d1,
    0x9b05688c2b3e6c1f,
    0x1f83d9abfb41bd6b,
    0x5be0cd19137e2179,
];

const SIGMA: [[usize; 16]; 12] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
    [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
    [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
    [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
    [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
    [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
    [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
    [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
    [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
];

pub fn ckb_blake2b_256(input: &[u8]) -> [u8; 32] {
    let mut h = blake2b_initial_state();
    let mut offset = 0usize;
    let mut counter = 0u128;

    while input.len().saturating_sub(offset) > BLAKE2B_BLOCK_BYTES {
        counter += BLAKE2B_BLOCK_BYTES as u128;
        compress(
            &mut h,
            input[offset..offset + BLAKE2B_BLOCK_BYTES]
                .try_into()
                .unwrap(),
            counter,
            false,
        );
        offset += BLAKE2B_BLOCK_BYTES;
    }

    let mut last = [0u8; BLAKE2B_BLOCK_BYTES];
    let remaining = input.len() - offset;
    last[..remaining].copy_from_slice(&input[offset..]);
    counter += remaining as u128;
    compress(&mut h, &last, counter, true);

    let mut out = [0u8; 32];
    for (i, word) in h.iter().take(BLAKE2B_OUT_BYTES / 8).enumerate() {
        out[i * 8..i * 8 + 8].copy_from_slice(&word.to_le_bytes());
    }
    out
}

fn blake2b_initial_state() -> [u64; 8] {
    let mut param = [0u8; 64];
    param[0] = BLAKE2B_OUT_BYTES as u8;
    param[2] = 1;
    param[3] = 1;
    param[48..64].copy_from_slice(CKB_PERSONAL);
    let mut h = IV;
    for i in 0..8 {
        h[i] ^= u64::from_le_bytes(param[i * 8..i * 8 + 8].try_into().unwrap());
    }
    h
}

fn compress(h: &mut [u64; 8], block: &[u8; 128], counter: u128, last: bool) {
    let mut m = [0u64; 16];
    for (i, chunk) in block.chunks_exact(8).enumerate() {
        m[i] = u64::from_le_bytes(chunk.try_into().unwrap());
    }

    let mut v = [0u64; 16];
    v[..8].copy_from_slice(h);
    v[8..].copy_from_slice(&IV);
    v[12] ^= counter as u64;
    v[13] ^= (counter >> 64) as u64;
    if last {
        v[14] ^= u64::MAX;
    }

    for s in SIGMA {
        g(&mut v, 0, 4, 8, 12, m[s[0]], m[s[1]]);
        g(&mut v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
        g(&mut v, 2, 6, 10, 14, m[s[4]], m[s[5]]);
        g(&mut v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
        g(&mut v, 0, 5, 10, 15, m[s[8]], m[s[9]]);
        g(&mut v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
        g(&mut v, 2, 7, 8, 13, m[s[12]], m[s[13]]);
        g(&mut v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
    }

    for i in 0..8 {
        h[i] ^= v[i] ^ v[i + 8];
    }
}

fn g(v: &mut [u64; 16], a: usize, b: usize, c: usize, d: usize, x: u64, y: u64) {
    v[a] = v[a].wrapping_add(v[b]).wrapping_add(x);
    v[d] = (v[d] ^ v[a]).rotate_right(32);
    v[c] = v[c].wrapping_add(v[d]);
    v[b] = (v[b] ^ v[c]).rotate_right(24);
    v[a] = v[a].wrapping_add(v[b]).wrapping_add(y);
    v[d] = (v[d] ^ v[a]).rotate_right(16);
    v[c] = v[c].wrapping_add(v[d]);
    v[b] = (v[b] ^ v[c]).rotate_right(63);
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOLDEN_EMPTY_CKB_HASH: &str =
        "0x44f4c69744d5f8c55d642062949dcae49bc4e7ef43d388c5a12f42b5633d163e";
    const GOLDEN_TWO_HIT_COMMITMENT: &str =
        "0xd69085953112657ffadbd8fe96d9d72dcc37f58732a283030e9168b3cf47a155";
    const GOLDEN_TWO_HIT_BYTES: &str = "0x43534d53010001000500000031343435350a0000006d696e653a3134343535240000006f72653a6d696e6525334131343435353a31343435353a353a373a636f616c5f7365616d09000000636f616c5f7365616d05000000070000000300000003000000804a5d0500000000804a5d050000000002000000000000000500000031343435350a0000006d696e653a3134343535240000006f72653a6d696e6525334131343435353a31343435353a353a373a636f616c5f7365616d09000000636f616c5f7365616d0500000007000000030000000200000003000000804a5d0500000000804a5d0500000000008793030000000001000000020000000116000000636f696e6765636b6f3a73696d706c652d707269636514000000323032362d30352d31385431343a30363a33325a0300000075736401000000030000007a65630098a7b856dc010009000000636f616c5f7365616d030000007a656342ceae000000000080c3c901000000000087930300000000020000000100000000010000000500000031343435350a0000006d696e653a3134343535240000006f72653a6d696e6525334131343435353a31343435353a353a373a636f616c5f7365616d09000000636f616c5f7365616d0500000007000000020000000100000003000000804a5d0500000000008793030000000080c3c9010000000001000000020000000116000000636f696e6765636b6f3a73696d706c652d707269636514000000323032362d30352d31385431343a30363a33325a0300000075736401000000030000007a65630098a7b856dc010009000000636f616c5f7365616d030000007a656342ceae000000000080c3c9010000000000879303000000000200000001000000000100000080c3c9010000000001000000030000007a6563849c5d01000000000087930300000000000e27070000000002000000";

    #[test]
    fn ckb_blake2b_matches_js_empty_vector() {
        assert_eq!(
            to_hex_prefixed(&ckb_blake2b_256(b"")),
            GOLDEN_EMPTY_CKB_HASH
        );
    }

    #[test]
    fn canonical_session_bytes_match_js_golden_vector() {
        let bytes = canonical_mining_session_bytes(&golden_two_hit_coal_session());
        assert_eq!(to_hex_prefixed(&bytes), GOLDEN_TWO_HIT_BYTES);
    }

    #[test]
    fn mining_commitment_matches_js_golden_vector() {
        let session = golden_two_hit_coal_session();
        assert_eq!(
            commit_mining_session_hex(&session),
            GOLDEN_TWO_HIT_COMMITMENT
        );
        assert_eq!(session.final_state.capacity_remaining, 1);
        assert_eq!(session.final_state.remaining_value_usd_micros, 30_000_000);
        assert_eq!(session.rewards[0].amount_units, 22_912_132);
        assert_eq!(session.rewards[0].value_usd_micros, 120_000_000);
    }
}
