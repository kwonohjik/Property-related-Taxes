/**
 * 시장 거래일 달력 — **참조 종목의 일봉**에서 얻는다 (계획서 B′안)
 *
 * ## 왜 필요한가
 *
 * `calendar.ts`의 anchor 시프트는 정적 휴장일 fixture(`KRX_HOLIDAYS_2020_2026`)에 기댄다.
 * 그 **범위 밖**의 평일 공휴일은 거래일로 오판되어, 상증법 §63①1가목 괄호
 * (「평가기준일이 매매가 없는 날이면 **그 전일**을 기준」)의 시프트가 일어나지 않는다.
 *
 * 취득일은 대개 수년 전이라 이 공백이 **상시 발화**한다. 실측(005930, 2015-02-19 설날):
 *
 *   현재    [2015-01-20 ~ 2015-02-19] · 거래일 21 · 평균 1,372,857
 *   법령상  [2015-01-18 ~ 2015-02-17] · 거래일 22 · 평균 1,371,500   (차이 1,357원/주)
 *
 * ## 왜 「응답에 종가가 없으면 옮긴다」로는 안 되는가
 *
 * 종가가 없는 이유가 두 가지다:
 *   ① **휴장** — 시장이 안 열렸다 ⇒ anchor를 옮기는 것이 맞다
 *   ② **그 종목의 거래정지** ⇒ 옮기면 **안 된다**. 상증령 §52의2③은 정지 종목에 이 평가를
 *      아예 적용하지 않는다. 옮기면 정지 구간을 조용히 건너뛴 평균이 만들어진다.
 *
 * 키움 ka10001은 `tradingHalt`·`adminIssue`가 **현재 상태**뿐이라 과거 정지를 알려주지 않는다
 * (V-3 실측). 그래서 **참조 종목**(장수·고유동성 종목)의 일봉으로 시장 거래일을 얻어 가른다:
 *
 *   anchor ∉ 시장거래일                    → 휴장            → 직전 시장거래일로 이동
 *   anchor ∈ 시장거래일 · 대상 종목 종가 없음 → 그 종목의 정지 → 이동하지 않고 안내
 *
 * ## 이 모듈은 순수 함수다
 *
 * fetch 책임이 없다. 호출부(route)가 참조 종목 일봉을 받아 `buildMarketDaySet`에 넘긴다.
 */

import { KRX_HOLIDAY_FIXTURE_RANGE } from "./data/krx-holidays-2020-2026";
import type { KiwoomDailyQuote } from "./types";

/**
 * 시장 거래일 판정의 **참조 종목** — 삼성전자.
 *
 * 1975-06-11 상장. 액면분할·병합은 있었으나 **거래일 자체는 끊긴 적이 사실상 없다**.
 * 평가에 쓰는 값이 아니라 「그 날 시장이 열렸는가」만 보므로 가격 수준·수정주가 여부는 무관하다.
 */
export const MARKET_REFERENCE_STOCK_CODE = "005930";

/** 참조 달력이 필요한가 — 휴장일 fixture가 덮지 못하는 연도인가 */
export function needsMarketCalendar(dateIso: string): boolean {
  const year = Number(dateIso.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return year < KRX_HOLIDAY_FIXTURE_RANGE.startYear || year > KRX_HOLIDAY_FIXTURE_RANGE.endYear;
}

/** 참조 종목 일봉 → 시장 거래일 집합 (종가 > 0 인 날만) */
export function buildMarketDaySet(quotes: ReadonlyArray<KiwoomDailyQuote>): Set<string> {
  const s = new Set<string>();
  for (const q of quotes) {
    if (q.close > 0) s.add(q.date);
  }
  return s;
}

export interface MarketAnchorResult {
  /** 확정된 anchor (YYYY-MM-DD) */
  anchor: string;
  /** 기준일에서 실제로 옮겼는가 */
  shifted: boolean;
  /**
   * 되짚어 본 한도 안에서 시장 거래일을 못 찾았다 —
   * 참조 종목 조회 실패·상장 이전 등. 이때 `anchor`는 입력 그대로다(**추정 금지**).
   */
  exhausted: boolean;
}

/**
 * 되짚기 한도 — 연휴 최장 구간을 덮되 거래정지를 삼키지 않을 만큼만.
 *
 * KRX 최장 비거래 연속은 설·추석 연휴 + 주말 + 임시공휴일로 대략 5~7일이다.
 * `calendar.ts`의 `resolveValuationAnchor`도 「정상 경로 6일 이내 종료」를 전제로 적혀 있다.
 * 10일을 넘겨 되짚어야 한다면 그것은 휴장이 아니라 **그 시장/종목의 이상**이므로
 * 옮기지 않고 호출부에 넘긴다.
 */
export const MARKET_ANCHOR_MAX_LOOKBACK_DAYS = 10;

/**
 * 시장 거래일 집합으로 anchor를 확정한다.
 *
 * 기준일이 시장 거래일이면 그대로 두고, 아니면 **직전 시장 거래일**로 옮긴다
 * (상증법 §63①1가목 괄호 · 소득세법 §99①3 준용).
 */
export function resolveAnchorFromMarketDays(
  baseDateIso: string,
  marketDays: ReadonlySet<string>,
  maxLookbackDays: number = MARKET_ANCHOR_MAX_LOOKBACK_DAYS,
): MarketAnchorResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDateIso)) {
    return { anchor: baseDateIso, shifted: false, exhausted: true };
  }
  if (marketDays.size === 0) {
    // 참조 종목을 못 받았다 — 판단 근거가 없으므로 «옮기지 않는다».
    return { anchor: baseDateIso, shifted: false, exhausted: true };
  }
  if (marketDays.has(baseDateIso)) {
    return { anchor: baseDateIso, shifted: false, exhausted: false };
  }

  const [y, m, d] = baseDateIso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < maxLookbackDays; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const iso = cursor.toISOString().slice(0, 10);
    if (marketDays.has(iso)) {
      return { anchor: iso, shifted: true, exhausted: false };
    }
  }
  return { anchor: baseDateIso, shifted: false, exhausted: true };
}

/**
 * anchor가 시장 거래일인데 **대상 종목**만 종가가 없는가 —
 * 그렇다면 휴장이 아니라 그 종목의 거래정지·미상장이다(상증령 §52의2③ 영역).
 */
export function isStockSpecificGap(
  anchorIso: string,
  marketDays: ReadonlySet<string>,
  stockDays: ReadonlySet<string>,
): boolean {
  return marketDays.has(anchorIso) && !stockDays.has(anchorIso);
}
