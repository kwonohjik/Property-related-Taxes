/**
 * RTMS 유사매매사례가액 Mediator — fetch + Dexie 캐시
 *
 * 역할: 클라이언트에서 호출되는 진입점. 프록시 라우트 호출 + 기간 단위 Dexie 캐시.
 *   - 캐시 키: `rtms_${lawdCd}_${baseDate}_${taxType}` (§9 D5 기간 단위)
 *   - TTL: 7일 (공공데이터포털 쿼터 절약)
 *   - filterSimilarSales / rankByClosestDate / averageAmount re-export
 *
 * 설계: docs/01-plan/features/inheritance-similar-sales-rtms-lookup.plan.md §9 D5
 * Phase 1: fetch + 캐시. Phase 2: 후보별 vworld 공시가격 재조회.
 */

import { db } from "@/lib/storage/db";
import type { RtmsSalesCacheRecord } from "@/lib/storage/db";
import type {
  RtmsAptTradeResponse,
  RtmsPropertyType,
} from "@/app/api/address/apt-trade/route";
import type { RtmsTradeRecord, SimilarSalesCandidate } from "./rtms-similar-sales-filter";

export type { RtmsPropertyType } from "@/app/api/address/apt-trade/route";

/** RTMS 조회 세목 — 평가기간 산정 (상속·증여=상증령 §49 / 양도=소득세법 시행령 §176의2③) */
export type RtmsTaxType = "inheritance" | "gift" | "transfer";

// re-export 순수 필터 함수들 (UI가 직접 소비)
export {
  filterSimilarSales,
  normalizeAptName,
  parseDealAmountWon,
} from "./rtms-similar-sales-filter";
export type {
  RtmsTradeRecord,
  SimilarSalesFilterCriteria,
  SimilarSalesCandidate,
  SimilarSalesFilterResult,
} from "./rtms-similar-sales-filter";

// ──────────────────────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// ──────────────────────────────────────────────────────────────
// 에러 타입
// ──────────────────────────────────────────────────────────────

export type RtmsLookupErrorCode =
  | "API_KEY_MISSING"
  | "INVALID_LAWD_CD"
  | "RTMS_FETCH_FAILED"
  | "PARSE_ERROR";

export interface RtmsLookupError {
  code: RtmsLookupErrorCode;
  message: string;
}

export interface RtmsLookupSuccess {
  records: RtmsTradeRecord[];
  fromCache: boolean;
  months: string[];
}

export type RtmsLookupOutcome = RtmsLookupSuccess | RtmsLookupError;

export function isRtmsLookupError(o: RtmsLookupOutcome): o is RtmsLookupError {
  return "code" in o;
}

// ──────────────────────────────────────────────────────────────
// 캐시 키
// ──────────────────────────────────────────────────────────────

function makeCacheKey(
  lawdCd: string,
  baseDate: string,
  taxType: RtmsTaxType,
  propertyType: RtmsPropertyType,
): string {
  return `rtms_${propertyType}_${lawdCd}_${baseDate}_${taxType}`;
}

// ──────────────────────────────────────────────────────────────
// 핵심 함수
// ──────────────────────────────────────────────────────────────

/**
 * RTMS 거래 조회 + Dexie 캐시 (기간 단위 캐시 — §9 D5).
 *
 * @param lawdCd       5자리 법정동코드 (시군구 코드 앞 5자리)
 * @param baseDate     평가기준일(상속·증여) 또는 취득일(양도) "YYYY-MM-DD"
 * @param taxType      세목 (평가기간 산정)
 * @param propertyType 물건 종류 (apt/rh/offi — 기본 apt)
 */
export async function fetchRtmsSimilarSales(
  lawdCd: string,
  baseDate: string,
  taxType: RtmsTaxType,
  propertyType: RtmsPropertyType = "apt",
): Promise<RtmsLookupOutcome> {
  const cacheKey = makeCacheKey(lawdCd, baseDate, taxType, propertyType);
  const now = Date.now();

  // 1. 캐시 조회
  try {
    const cached = await db.rtmsSalesCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return {
        records: cached.records,
        fromCache: true,
        months: cached.months,
      };
    }
  } catch {
    // IndexedDB 무력 (Safari private mode 등) — 캐시 단계 skip, API 진입
  }

  // 2. API 호출
  const params = new URLSearchParams({ lawdCd, baseDate, taxType, propertyType });
  let res: Response;
  try {
    res = await fetch(`/api/address/apt-trade?${params}`, { method: "GET" });
  } catch (err) {
    return { code: "RTMS_FETCH_FAILED", message: String(err) };
  }

  let data: RtmsAptTradeResponse;
  try {
    data = (await res.json()) as RtmsAptTradeResponse;
  } catch {
    return { code: "PARSE_ERROR", message: "RTMS 응답 파싱 실패" };
  }

  // env 미설정 감지
  if (data.configMissing) {
    return { code: "API_KEY_MISSING", message: "MOLIT_RTMS_API_KEY 미설정" };
  }

  if (!data.success) {
    return {
      code: "RTMS_FETCH_FAILED",
      message: data.error ?? "RTMS 조회 실패",
    };
  }

  // 3. 캐시 저장 (IndexedDB 무력 시 silent skip)
  const record: RtmsSalesCacheRecord = {
    id: cacheKey,
    lawdCd,
    baseDate,
    taxType,
    propertyType,
    records: data.records,
    months: data.months ?? [],
    createdAt: now,
    expiresAt: now + CACHE_TTL_MS,
  };
  try {
    await db.rtmsSalesCache.put(record);
  } catch {
    // IndexedDB 무력 — 캐시 저장 skip
  }

  return {
    records: data.records,
    fromCache: false,
    months: data.months ?? [],
  };
}

// ──────────────────────────────────────────────────────────────
// 편의 함수 (UI가 소비)
// ──────────────────────────────────────────────────────────────

/**
 * 후보를 가장 가까운 날 순으로 정렬.
 * filterSimilarSales 내부에서도 정렬되지만, UI 재정렬 시 독립 호출 가능.
 */
export function rankByClosestDate(
  candidates: SimilarSalesCandidate[],
): SimilarSalesCandidate[] {
  return [...candidates].sort(
    (a, b) => a.daysFromValuationDate - b.daysFromValuationDate,
  );
}

/**
 * 후보 목록의 거래금액 평균 (원 미만 절사 — Math.floor, Math.round 금지).
 * @param candidates 평균 대상 후보 (빈 배열이면 0 반환)
 */
export function averageAmount(candidates: SimilarSalesCandidate[]): number {
  if (candidates.length === 0) return 0;
  const sum = candidates.reduce(
    (s, c) => s + c.trade.dealAmountWon,
    0,
  );
  return Math.floor(sum / candidates.length);
}

/**
 * 만료된 RTMS 캐시 entry 청소 (선택 호출).
 */
export async function purgeExpiredRtmsCache(): Promise<number> {
  const now = Date.now();
  try {
    return await db.rtmsSalesCache.where("expiresAt").below(now).delete();
  } catch {
    return 0;
  }
}
