// Per-asset-class valuation strategy pattern (PROJECT_BRIEF.md section 5).
//
// None of the "if sold today" adjustments below include capital gains tax —
// that needs the tax engine (build-order step 8, not built yet). The
// percentages used are rough, clearly-labeled approximations, not real
// scheme/state-specific figures.

export type HoldingRow = {
  asset_id: string;
  symbol: string | null;
  name: string;
  asset_class: string;
  quantity: number;
  invested_value: number;
  manual_current_value: number | null;
};

export type Valuation = {
  current_price: number | null;
  current_value: number | null;
  if_sold_today_value: number | null;
  adjustment_note: string;
  price_as_of: string | null;
};

export interface ValuationStrategy {
  valuate(holding: HoldingRow): Promise<Valuation>;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------- Stock ---
export class StockValuation implements ValuationStrategy {
  constructor(private latestPrices: Map<string, { ltp: number; tickedAt: string }>) {}

  async valuate(holding: HoldingRow): Promise<Valuation> {
    const price = holding.symbol ? this.latestPrices.get(holding.symbol) : undefined;
    const currentPrice = price?.ltp ?? null;
    const currentValue = currentPrice !== null ? holding.quantity * currentPrice : null;
    return {
      current_price: currentPrice,
      current_value: currentValue,
      if_sold_today_value: currentValue !== null ? currentValue * 0.999 : null,
      adjustment_note:
        "Approximate STT only (~0.1%); brokerage assumed zero (Angel One delivery trades). Capital gains tax not included — tax engine not built yet.",
      price_as_of: price?.tickedAt ?? null,
    };
  }
}

// --------------------------------------------------------- Mutual Fund ---
const mfNavCache = new Map<string, { nav: number; date: string; expiresAt: number }>();

async function fetchMfNav(schemeCode: string): Promise<{ nav: number; date: string } | null> {
  const cached = mfNavCache.get(schemeCode);
  if (cached && cached.expiresAt > Date.now()) return cached;
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) return cached ?? null;
    const body = await res.json();
    const latest = body?.data?.[0];
    if (!latest) return cached ?? null;
    const result = { nav: Number(latest.nav), date: latest.date, expiresAt: Date.now() + CACHE_TTL_MS };
    mfNavCache.set(schemeCode, result);
    return result;
  } catch {
    return cached ?? null;
  }
}

export class MutualFundValuation implements ValuationStrategy {
  async valuate(holding: HoldingRow): Promise<Valuation> {
    const nav = holding.symbol ? await fetchMfNav(holding.symbol) : null;
    const currentValue = nav ? holding.quantity * nav.nav : null;
    return {
      current_price: nav?.nav ?? null,
      current_value: currentValue,
      if_sold_today_value: currentValue,
      adjustment_note: "Exit load and capital gains tax not modeled yet — showing current NAV value as-is.",
      price_as_of: nav?.date ?? null,
    };
  }
}

// ---------------------------------------------------------------- Gold ---
let goldRateCache: { ratePerGramInr: number; asOf: string; expiresAt: number } | null = null;

async function fetchGoldRatePerGramInr(): Promise<{ ratePerGramInr: number; asOf: string } | null> {
  if (goldRateCache && goldRateCache.expiresAt > Date.now()) return goldRateCache;
  try {
    const [goldRes, fxRes] = await Promise.all([
      fetch("https://api.gold-api.com/price/XAU"),
      fetch("https://open.er-api.com/v6/latest/USD"),
    ]);
    if (!goldRes.ok || !fxRes.ok) return goldRateCache;
    const gold = await goldRes.json();
    const fx = await fxRes.json();
    const usdPerOunce = Number(gold.price);
    const inrPerUsd = Number(fx?.rates?.INR);
    if (!usdPerOunce || !inrPerUsd) return goldRateCache;
    // 1 troy ounce = 31.1034768 grams
    const ratePerGramInr = (usdPerOunce * inrPerUsd) / 31.1034768;
    goldRateCache = {
      ratePerGramInr,
      asOf: gold.updatedAt ?? new Date().toISOString(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    return goldRateCache;
  } catch {
    return goldRateCache;
  }
}

export class GoldValuation implements ValuationStrategy {
  async valuate(holding: HoldingRow): Promise<Valuation> {
    const rate = await fetchGoldRatePerGramInr();
    const currentValue = rate ? holding.quantity * rate.ratePerGramInr : null;
    return {
      current_price: rate?.ratePerGramInr ?? null,
      current_value: currentValue,
      if_sold_today_value: currentValue !== null ? currentValue * 0.97 : null,
      adjustment_note:
        "International spot gold rate converted to INR/gram (not a local jeweller's rate); ~3% resale spread/making-charge estimate for physical gold. Tax not included yet.",
      price_as_of: rate?.asOf ?? null,
    };
  }
}

// --------------------------------------------------------- Real Estate ---
export class RealEstateValuation implements ValuationStrategy {
  async valuate(holding: HoldingRow): Promise<Valuation> {
    const currentValue = holding.manual_current_value ?? holding.invested_value;
    return {
      current_price: null,
      current_value: currentValue,
      if_sold_today_value: currentValue * 0.93,
      adjustment_note:
        "User-entered estimate. ~7% approximate combined stamp duty + brokerage deduction for a hypothetical sale (actual rate varies by state). Tax not included yet.",
      price_as_of: null,
    };
  }
}

// --------------------------------------------------------------- Other ---
export class OtherValuation implements ValuationStrategy {
  async valuate(holding: HoldingRow): Promise<Valuation> {
    const currentValue = holding.manual_current_value ?? holding.invested_value;
    return {
      current_price: null,
      current_value: currentValue,
      if_sold_today_value: currentValue,
      adjustment_note: "User-entered estimate, as-is. No depreciation modeled yet.",
      price_as_of: null,
    };
  }
}

export function getValuationStrategy(
  assetClass: string,
  latestPrices: Map<string, { ltp: number; tickedAt: string }>,
): ValuationStrategy {
  switch (assetClass) {
    case "stock":
      return new StockValuation(latestPrices);
    case "mutual_fund":
      return new MutualFundValuation();
    case "gold":
      return new GoldValuation();
    case "real_estate":
      return new RealEstateValuation();
    default:
      return new OtherValuation();
  }
}
