/**
 * 종목 마스터 캐시 (KOSPI + KOSDAQ 전종목 prefetch).
 *
 * - 첫 호출 시 ka10099 (mrkt_tp=0 + mrkt_tp=10) 2회 호출 → Map<stockCode, StockMasterEntry>
 * - TTL 24h (장 마감 후 정보 갱신 가정. 환경별 변경 가능)
 * - 동시 다중 호출은 deduplicate로 단일 fetch
 *
 * 후속 (F-X): KONEX mrkt_tp 확정 / Supabase 영구 캐시 / 일별 cron prefetch
 */

import { fetchStockList, type StockMasterEntry } from "./tr/ka10099";
import { deduplicate } from "./dedup";

const TTL_MS = 24 * 60 * 60 * 1000;

interface MasterCacheEntry {
  byCode: Map<string, StockMasterEntry>;
  loadedAt: number;
}

let cache: MasterCacheEntry | null = null;

/** 캐시 초기화 (테스트용) */
export function __resetStockMaster() {
  cache = null;
}

export function __getStockMasterSize(): number {
  return cache?.byCode.size ?? 0;
}

/**
 * 전종목 마스터 로드 (캐시 hit 우선).
 *
 * @returns 종목코드 → StockMasterEntry Map
 */
async function loadStockMaster(): Promise<Map<string, StockMasterEntry>> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) {
    return cache.byCode;
  }
  return deduplicate("stock-master-load", async () => {
    // 캐시 재확인 (race condition)
    if (cache && now - cache.loadedAt < TTL_MS) return cache.byCode;

    const [kospi, kosdaq] = await Promise.all([
      fetchStockList({ marketTp: "0" }),
      fetchStockList({ marketTp: "10" }),
    ]);

    const byCode = new Map<string, StockMasterEntry>();
    for (const entry of kospi) byCode.set(entry.stockCode, entry);
    for (const entry of kosdaq) byCode.set(entry.stockCode, entry);

    cache = { byCode, loadedAt: Date.now() };
    return byCode;
  });
}

/**
 * 단일 종목 마스터 조회 (없으면 undefined).
 *
 * 자동 mirror 용도: securityCode 입력 시 marketType / tradingHalt 즉시 확정.
 */
export async function lookupStockMaster(stockCode: string): Promise<StockMasterEntry | undefined> {
  if (!/^\d{6}$/.test(stockCode)) return undefined;
  const master = await loadStockMaster();
  return master.get(stockCode);
}

/** marketCode (ka10099) → store marketType (lowercase) 매핑 */
export function masterMarketCodeToStore(marketCode: string): "kospi" | "kosdaq" | "" {
  if (marketCode === "0") return "kospi";
  if (marketCode === "10") return "kosdaq";
  return "";
}
