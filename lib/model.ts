// The token radar's model, radar-2-peer: one snapshot of the protocol universe in, one ranked
// board out. The dashboard and the gate both read what this file computes, so its arithmetic is
// stated here once, in full, and the page recomputes every row from the same figures.
//
// Who gets ranked: every slug on the snapshot's watchlist (the floor, never a ceiling), plus the
// strongest pre-token protocols below the watchlist floor — the early rows the radar exists to
// find. A protocol counts as pre-token when its index entry records no token at all: no market
// cap, no CoinGecko id, no symbol. Live-token protocols are kept apart and shown with the
// market's own values, never mixed into the ranked board.
//
// Implied value is a peer-multiple valuation, computed from the snapshot alone. No protocol is
// named anywhere in this file; the same function scores every row:
//
//   peer multiple  the median mcap/TVL of the live-token protocols in the same category, each
//                  ratio winsorized to [0.005, 2.0] first (a ratio below 0.005 counts as 0.005,
//                  one above 2.0 counts as 2.0, so a single outlier cannot move the median);
//                  a category with fewer than 3 live
//                  comparables falls back to the global winsorized median; the multiple used is
//                  clamped to [0.04, 0.80], so one extreme token never sets a whole category
//   base           tvl_usd x peer multiple
//   growth         change_7d clamped to [-60, 120] per cent, then
//                  1 + (growth / 100) x GROWTH_WEIGHT
//   maturity       0.7 + min(age_days, 1095) / 1095 x 0.3; an unknown listing age counts as 365 days
//   size           (50,000,000 / tvl_usd) ^ 0.15, clamped to [0.6, 1.4]: a log-size dampener, so
//                  a giant TVL cannot win on size alone and a small protocol is not erased
//   chain          1 + 0.03 per chain past the first, at most 1.12, for running on more chains
//   implied        max(1, round(base x growth x maturity x size x chain))
//
// The comparables table the dashboard shows is the same table this file computes: category, live
// count, median, p25, p75 and the multiple actually used.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the page's sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  size_exponent: number;
  size_floor: number;
  size_cap: number;
  chain_step: number;
  chain_max: number;
  peer_min_n: number;
  peer_clamp_min: number;
  peer_clamp_max: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.4,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  size_exponent: 0.15,
  size_floor: 0.6,
  size_cap: 1.4,
  chain_step: 0.03,
  chain_max: 0.12,
  peer_min_n: 3,
  peer_clamp_min: 0.04,
  peer_clamp_max: 0.8,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2-peer';

/** How many pre-token protocols below the watchlist floor the early radar carries. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's peer comparables, as computed from the live-token protocols in the snapshot. */
export interface CategoryComparable {
  category: string;
  n: number;
  median: number;
  p25: number;
  p75: number;
  used_multiple: number;
  source: 'category' | 'global';
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    size_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  peer_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  size_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the comparables and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_peer_multiple: number;
  comparables: CategoryComparable[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `v` into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Round to four decimal places, for the multiples the board and the page display. */
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a sorted array, or 0 when it is empty. */
function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a sorted array by nearest rank, or 0 when it is empty. */
function quantileOf(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[at]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

// ---------------------------------------------------------------- peer multiples

/** A mcap/TVL ratio winsorized to [0.005, 2.0]: one extreme token never sets a whole category. */
const winsorize = (ratio: number): number => clamp(ratio, 0.005, 2.0);

/** The winsorized mcap/TVL ratios of the live-token protocols, sorted ascending. */
function liveRatios(protocols: SnapshotProtocol[]): number[] {
  return protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => winsorize(p.mcap_usd! / p.tvl_usd))
    .sort((a, b) => a - b);
}

/** The winsorized ratios of one category's live-token protocols, grouped by category name. */
function ratiosByCategory(protocols: SnapshotProtocol[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const key = p.category ?? 'Other';
    const ratio = winsorize(p.mcap_usd / p.tvl_usd);
    const list = groups.get(key);
    if (list) list.push(ratio);
    else groups.set(key, [ratio]);
  }
  return groups;
}

/**
 * One category's comparable row: the median of its live ratios, or the global multiple when it has
 * too few comparables to speak for itself. The multiple used is always clamped.
 */
function comparableFor(
  category: string,
  ratios: number[],
  global: number,
  model: ModelConstants,
): CategoryComparable {
  const sorted = [...ratios].sort((a, b) => a - b);
  const med = medianOf(sorted);
  const enough = sorted.length >= model.peer_min_n;
  const used = enough ? clamp(med, model.peer_clamp_min, model.peer_clamp_max) : global;
  return {
    category,
    n: sorted.length,
    median: round4(med),
    p25: round4(quantileOf(sorted, 0.25)),
    p75: round4(quantileOf(sorted, 0.75)),
    used_multiple: round4(used),
    source: enough ? 'category' : 'global',
  };
}

/**
 * The peer multiples of the snapshot: for every category with at least `peer_min_n` live-token
 * protocols, the median of their winsorized mcap/TVL ratios; every other category falls back to
 * the global winsorized median. Both are clamped to [peer_clamp_min, peer_clamp_max].
 */
export function peerMultiples(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { global: number; byCategory: Map<string, CategoryComparable> } {
  const global = clamp(medianOf(liveRatios(snapshot.protocols)), model.peer_clamp_min, model.peer_clamp_max);
  const byCategory = new Map<string, CategoryComparable>();
  const groups = ratiosByCategory(snapshot.protocols);
  for (const category of [...groups.keys()].sort((a, b) => (a < b ? -1 : 1))) {
    byCategory.set(category, comparableFor(category, groups.get(category)!, global, model));
  }
  return { global, byCategory };
}

/** The peer multiple a category's rows use: its own when it has enough comparables, else the global. */
export function peerFor(
  category: string | null,
  peers: { global: number; byCategory: Map<string, CategoryComparable> },
): number {
  const row = category === null ? undefined : peers.byCategory.get(category);
  return row === undefined ? peers.global : row.used_multiple;
}

// ---------------------------------------------------------------- the five multipliers

/** The growth multiplier from a protocol's 7-day change, clamped to the model's window. */
export function growthMultiplier(change7d: number | null, model: ModelConstants): { pct: number; mult: number } {
  const pct = clamp(finite(change7d, 0), model.growth_floor, model.growth_cap);
  return { pct, mult: 1 + (pct / 100) * model.growth_weight };
}

/** The maturity multiplier from a protocol's age in days; an unknown age counts as `unknown_age_days`. */
export function maturityMultiplier(age: number | null, model: ModelConstants): number {
  const days = age ?? model.unknown_age_days;
  return model.maturity_floor + (Math.min(Math.max(days, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
}

/** The size multiplier from a protocol's TVL against the watchlist floor: a log-size dampener. */
export function sizeMultiplier(tvlUsd: number, floorUsd: number, model: ModelConstants): number {
  return clamp(Math.pow(floorUsd / Math.max(1, tvlUsd), model.size_exponent), model.size_floor, model.size_cap);
}

/** The chain multiplier from how many chains a protocol runs on: at most `chain_max` above 1. */
export function chainMultiplier(chainCount: number, model: ModelConstants): number {
  const extra = Math.min(Math.max(chainCount - 1, 0), 4);
  return 1 + Math.min(model.chain_max, model.chain_step * extra);
}

/** The five multipliers and the implied value one protocol gets under `model` and its peer multiple. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  peerMultiple: number,
  floorUsd: number,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  sizeMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { pct: growthPct, mult: growthMult } = growthMultiplier(protocol.change_7d, model);
  const maturityMult = maturityMultiplier(age, model);
  const sizeMult = sizeMultiplier(protocol.tvl_usd, floorUsd, model);
  const chainMult = chainMultiplier(protocol.chains.length, model);
  const base = protocol.tvl_usd * peerMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * sizeMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, sizeMult, chainMult, age };
}

// ---------------------------------------------------------------- what may be ranked

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Whether a protocol's name carries a whole word wrapped, staked or staking. */
function isWrappedName(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w === 'wrapped' || w === 'staked' || w === 'staking');
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped, staked or bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !WRAPPED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !isWrappedName(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Strongest TVL first, slug as the tie-break, for choosing the early rows. */
function byTvlDesc(a: SnapshotProtocol, b: SnapshotProtocol): number {
  return b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/** Strongest implied value first, slug as the tie-break, for the ranked board. */
function byImpliedDesc(
  a: { implied: number; p: SnapshotProtocol },
  b: { implied: number; p: SnapshotProtocol },
): number {
  return b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0);
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const peers = peerMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort(byTvlDesc)
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const peer = peerFor(p.category, peers);
    const scoredRow = impliedValue(p, snapshot.as_of, model, peer, snapshot.floor_usd);
    return { p, peer, ...scoredRow };
  });
  scored.sort(byImpliedDesc);
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      peer_multiple: round4(s.peer),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      size_multiplier: round4(s.sizeMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

// ---------------------------------------------------------------- farm plans

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * One category rule: when the lowercased category names one of `words`, the farm action is the
 * template `build` returns for this protocol, capital and chain. The first matching rule wins,
 * and a protocol no rule names falls back to a plain deposit.
 */
interface ActionRule {
  words: string[];
  build: (name: string, capital: number, chain: string) => string;
}

const ACTION_RULES: ActionRule[] = [
  {
    words: ['lend', 'cdp', 'collateral'],
    build: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
  },
  {
    words: ['dex', 'yield', 'leveraged farm'],
    build: (name, capital, chain) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
  },
  {
    words: ['bridge'],
    build: (name, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
  },
  {
    words: ['staking', 'restak'],
    build: (name, capital, chain) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`,
  },
  {
    words: ['perpetual', 'derivative'],
    build: (name, capital, chain) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`,
  },
  {
    words: ['prediction'],
    build: (name, capital, chain) => `Fund $${capital} and place one market position on ${name}.`,
  },
  {
    words: ['curator', 'allocator'],
    build: (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
  },
  {
    words: ['stable'],
    build: (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
  },
  {
    words: ['rwa'],
    build: (name, capital, chain) => `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`,
  },
  {
    words: ['insurance'],
    build: (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
  },
];

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  for (const rule of ACTION_RULES) {
    if (rule.words.some((w) => c.includes(w))) return rule.build(p.name, capital, chain);
  }
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** The wallet step: start clean, with only the funds the farm needs. */
function walletStep(): FarmStep {
  return {
    text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
    cost: 'under $3 of gas for the first transaction',
    time: '5 minutes',
  };
}

/** The entry step: the protocol's own action, with its capital and setup cost. */
function entryStep(p: SnapshotProtocol, capital: number, chain: string): FarmStep {
  return {
    text: actionFor(p, capital, chain),
    cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
    time: '15 minutes to set up',
  };
}

/** The weekly step: one qualifying action a week, so the position stays live. */
function weeklyStep(): FarmStep {
  return {
    text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
    cost: 'about $2 of gas a week',
    time: '10 minutes a week',
  };
}

/** The hold step: keep the position open long enough to be counted in more than one snapshot. */
function holdStep(capital: number, hold: number): FarmStep {
  return {
    text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
    cost: `the $${capital} stays in the position`,
    time: `${hold} days`,
  };
}

/** The claim step: check the protocol's own rewards page, and never pay to claim. */
function claimStep(): FarmStep {
  return {
    text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
    cost: 'no fee to check, and never pay to claim',
    time: '10 minutes',
  };
}

/** The log step: write the farm down, so the position can be repeated or unwound. */
function logStep(): FarmStep {
  return {
    text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
    cost: 'nothing but the log',
    time: '5 minutes',
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [walletStep(), entryStep(p, capital, chain), weeklyStep(), holdStep(capital, hold), claimStep(), logStep()];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    peer_multiple: row.model.peer_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    size_multiplier: row.model.size_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_peer_multiple: round4(peers.global),
    comparables: [...peers.byCategory.values()].sort((a, b) => (a.category < b.category ? -1 : 1)),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
