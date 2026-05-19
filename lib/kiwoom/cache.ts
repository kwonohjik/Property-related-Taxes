/**
 * 메모리 LRU 캐시 (Phase 1).
 *
 * - 일별 종가: TTL 무한 (거래일 종가는 historical fixed)
 * - 종목 메타: TTL 5분 (거래정지·관리종목 플래그 갱신)
 *
 * 후속 PR(F-07): Supabase `stock_quotes` 영구화.
 */

const DAILY_QUOTE_MAX_ENTRIES = 5000;
const STOCK_META_TTL_MS = 5 * 60 * 1000;
const STOCK_META_MAX_ENTRIES = 500;

interface LRUEntry<V> {
  value: V;
  /** epoch ms 만료 시각. Infinity = 영구. */
  expiresAt: number;
}

class LRUCache<V> {
  private map = new Map<string, LRUEntry<V>>();
  constructor(private capacity: number) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // LRU touch
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: V, ttlMs = Infinity) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: ttlMs === Infinity ? Infinity : Date.now() + ttlMs });
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear() {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

// ──────────────────────────────────────────────────────────
// 일별 종가 캐시 — key = `${stockCode}:${YYYY-MM-DD}`
// ──────────────────────────────────────────────────────────

const dailyQuoteCache = new LRUCache<number>(DAILY_QUOTE_MAX_ENTRIES);

export function getCachedDailyClose(stockCode: string, dateIso: string): number | undefined {
  return dailyQuoteCache.get(`${stockCode}:${dateIso}`);
}

export function setCachedDailyClose(stockCode: string, dateIso: string, close: number): void {
  dailyQuoteCache.set(`${stockCode}:${dateIso}`, close);
}

export function setCachedDailyCloses(
  stockCode: string,
  quotes: ReadonlyArray<{ date: string; close: number }>,
): void {
  for (const q of quotes) setCachedDailyClose(stockCode, q.date, q.close);
}

// ──────────────────────────────────────────────────────────
// 종목 메타 캐시 — TTL 5분
// ──────────────────────────────────────────────────────────

interface CachedStockMeta {
  stockCode: string;
  stockName: string;
  marketType: string;
  marketCap: number;
  listedShares: number;
  tradingHalt: boolean;
  adminIssue: boolean;
}

const stockMetaCache = new LRUCache<CachedStockMeta>(STOCK_META_MAX_ENTRIES);

export function getCachedStockMeta(stockCode: string): CachedStockMeta | undefined {
  return stockMetaCache.get(stockCode);
}

export function setCachedStockMeta(meta: CachedStockMeta): void {
  stockMetaCache.set(meta.stockCode, meta, STOCK_META_TTL_MS);
}

// ──────────────────────────────────────────────────────────
// 테스트 헬퍼
// ──────────────────────────────────────────────────────────

export function __resetKiwoomCache() {
  dailyQuoteCache.clear();
  stockMetaCache.clear();
}

export function __getCacheStats() {
  return {
    dailyQuotes: dailyQuoteCache.size(),
    stockMeta: stockMetaCache.size(),
  };
}
