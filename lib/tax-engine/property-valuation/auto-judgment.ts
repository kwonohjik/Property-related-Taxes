/**
 * PR-E — 자동 판정 헬퍼 (보유지분)
 *
 * 본 PR 엔진은 `isMaxShareholder` / `isRealEstateHeavy` boolean을 직접 입력받는다.
 * 본 헬퍼는 사용자 입력값(보유주식)에서 §22② 최대주주 여부를 자동 도출한다.
 *
 * §54① 본문 괄호 부동산과다보유 판정은 사용자가 직접 ON/OFF 선택 (UI ToggleCard).
 *
 * 3-state 사용 패턴 (UI 시니어 영역):
 *   - auto: 본 헬퍼 결과 그대로 사용
 *   - manual_on: 사용자 명시 ON
 *   - manual_off: 사용자 명시 OFF
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md §3 PR-E
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-followup.design.md §6-3
 */

// ============================================================
// PR-E — §22② 최대주주 추가공제 제외 자동 도출
// ============================================================

/**
 * §22② 최대주주 판정 결과
 *
 * 본 결과는 §22② 추가공제 제외 자동 도출용. §63③ 할증평가는
 * `max-shareholder-premium.ts` 별도 모듈에서 처리하며 의미가 다르다.
 *
 * §22②: 최대주주 보유주식 + 친족 합산 → 추가공제 제외
 * §63③: 보유주식 가장 많은 1인 + 1년 내 양도·증여 합산 → 할증평가 (×120%)
 */
export interface Section22MajorShareholderResult {
  /** §22② 추가공제 제외 대상 여부 */
  isSection22Major: boolean;
  /** 보유지분율 = ownedShares / totalShares (소수, 0~1) */
  ownershipRatio: number;
  /** 본 판정의 자동성 식별 — UI 3-state에서 manual override 분기 */
  source: "auto";
}

/**
 * §22② 최대주주 자동 도출 (보유지분 기준)
 *
 * 본 헬퍼는 단순 보유지분 비교만 수행한다. 실제 §53④ "보유주식 가장 많은 1인" +
 * §53⑤ "1년 내 양도·증여 합산" 정밀 판정은 사용자 명시 입력(친족 합산 등)이
 * 필요하며, UI 3-state에서 manual_on/manual_off로 override 한다.
 *
 * @param input.ownedShares 피상속인·수증인 보유주식 + 친족 합산 (사용자 입력)
 * @param input.totalShares 발행주식총수 (평가기준일 현재)
 * @param input.threshold 임계 보유지분율 (기본 0.5 — 단순 다수결 기준; UI에서 override 가능)
 *
 * @example 사례 6: 26,000 / 50,000 = 52% → 최대주주 (threshold 50% 기준)
 *   ownedShares=26,000, totalShares=50,000 → isSection22Major=true, ownershipRatio=0.52
 */
export function deriveSection22MajorShareholder(input: {
  ownedShares: number;
  totalShares: number;
  threshold?: number;
}): Section22MajorShareholderResult {
  const threshold = input.threshold ?? 0.5;
  if (input.totalShares <= 0) {
    return { isSection22Major: false, ownershipRatio: 0, source: "auto" };
  }
  const ratio = input.ownedShares / input.totalShares;
  return {
    isSection22Major: ratio >= threshold,
    ownershipRatio: ratio,
    source: "auto",
  };
}


