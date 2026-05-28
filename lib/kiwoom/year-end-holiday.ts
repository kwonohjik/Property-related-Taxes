/**
 * year-end-holiday — KRX 납회기간 판정 (year-agnostic).
 *
 * 사용자 명시 (2026-05-28):
 *   "납회기간은 12월 29일 ~ 12월 31일이야 그러니까 평가 기준일(상속개시일 증여일)이
 *   납회기간에 속하면 기산일은 12월 28일이 되는거야. 12월 28일이 토요일 또는 일요일이면
 *   그 전 거래가 있는 최초일이고"
 *
 * → MM-DD ∈ {12-29, 12-30, 12-31} 매년 고정. 모든 연도에 적용.
 *   매년 수동 fixture 등록 불필요.
 *   12.28이 토·일·휴장이면 일반 anchor shift 로직(직전 거래일 search)이 자동 처리.
 *
 * 신년 휴장(1.1·1.2 등)은 본 모듈 범위 외 — KRX 휴장 fixture (isKrxHolidayInFixture) 가 처리.
 *
 * Plan: docs/00-pm/listed-stock-valuation-anchor-shift-fix.plan.md §3-1
 */

const YEAR_END_NON_TRADING_MD = new Set(["12-29", "12-30", "12-31"]);

/**
 * 납회기간 여부 — MM-DD year-agnostic.
 *
 * @param iso "YYYY-MM-DD" 형식
 * @returns 12.29 / 12.30 / 12.31 이면 true
 */
export function isYearEndNonTrading(iso: string): boolean {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return false;
  return YEAR_END_NON_TRADING_MD.has(`${m[1]}-${m[2]}`);
}

/** 납회 라벨 — `nonTradingLabel` 에서 사용 */
export function yearEndNonTradingLabel(iso: string): string | undefined {
  return isYearEndNonTrading(iso) ? "납회기간" : undefined;
}
