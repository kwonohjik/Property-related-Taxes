/**
 * 기타토지 판정 공용 조각 — `other-land.ts`에서 떼어 낸 순수 헬퍼(NBL-STATE-HISTORY-E2 · 800줄 정책 기회주의적 분리).
 * 판정 로직은 그대로다(이동만) — `isBareLand`는 `other-land.ts`가 re-export한다.
 */
import type {
  CategoryJudgeResult,
  DateInterval,
  JudgmentStep,
  NonBusinessLandInput,
  RevenueTestResult,
} from "./types";
import type { PeriodCriteriaResult } from "./period-criteria";

/**
 * 나대지 간주 (소득세법 §104의3①4호나목 — 재산세 별도합산 제외 → 비사업용).
 *
 * NBL2611-V10-OL10 — **실제로 구현된 두 경우만** 참을 돌려준다:
 * - 건축물이 없다(`hasBuilding` 거짓) → 건축물 없는 토지
 * - 건축물 시가표준액과 부속토지 시가표준액이 **둘 다** 입력됐고 건축물 < 부속토지 × 2%
 *   → 건축물 없는 토지로 봄 (지방세법 시행령 §101①2호나목). 한쪽이라도 비면 이 경우는 판정하지 않는다.
 *
 * ⚠️ 「지방세법 시행령」 §101① 단서(무허가·사용승인 없이 사용 중인 건축물의 부속토지 제외)는 **처리하지 않는다**
 *    — 입력 칸이 없다(리뷰 Q-2 (가) 보류: 혼재 고지서 안내 + 확인 필요만). 단서 해당 여부는 판정하지 않는다.
 * 결과적으로 propertyTaxType을 "종합합산"으로 조정하는 판정용 술어다.
 *
 * NBL2611-V1-A — 이 술어는 «근거가 확인되지 않은 선언»에만 쓴다. 재산세 분류 근거(`property-tax-basis.ts`)가 확인된 비종합합산 선언은
 * 이 술어를 거치지 않는다(법 §104의3①4호 가목·나목은 건축물을 요건으로 하지 않는다). 호출부는 `judgeOtherLandCore` Step 0.
 */
export function isBareLand(input: NonBusinessLandInput): boolean {
  const o = input.otherLand;
  if (!o) return false;
  if (!o.hasBuilding) return true;
  if (o.buildingStandardValue !== undefined && o.landStandardValue !== undefined) {
    if (o.buildingStandardValue < o.landStandardValue * 0.02) return true;
  }
  return false;
}

/**
 * core(`judgeOtherLandCore`)가 **이력과 독립한 축(다목)** 으로 사업용을 판정한 경로의 날짜 집합 — 상태 이력 판정(`applyStateHistory`)이 읽는다(Q-15 (가′) · 엔진 V-18).
 *   · DM-01 — 당해 사업개시일 `[개시일, 양도일)`(직전 비율② 미통과 + 개시일 있음일 때만)
 *   · 3호 — 조성 완료 `[완료일, +2년)`
 *   · 호 인정(3호 외)·복합용도·연접 다필지·레거시 boolean·수입금액비율 통과 — `fullPeriod`(소유기간 전체). 법 §104의3①4호 가·나·다목은 병렬 제외 사유라 다목은 건축물·재산세 구분 이력과 무관하다.
 * 나목(Step 3-1 비종합합산 · Step 3-2 바닥면적)은 건축물·재산세 구분 = 이력이 다루는 축이라 기록하지 않는다(꼬리 전용).
 * `own`이 없으면 그런 경로가 적용되지 않았다(빈 배열도 «적용됨 · 비어 있음»). 이 기록은 core가 **실제로 지난 경로**만 담는다 — core는 수입금액비율 → 나목 → 호 인정 순으로 첫 PASS에서 끝나므로 뒤 경로의 다목은 빠질 수 있다.
 * 상태 이력 판정(`applyStateHistory`)이 core를 다목만/나목만 켠 입력으로 다시 돌려(`CoreProbe`) 경로 순서와 무관하게 보충한다.
 */
export interface OtherLandOwnTrace {
  own?: DateInterval[];
}

/**
 * 자체 사업기간 기록 — core가 사업용(또는 3호의 기간기준 판정)을 **자기 구간**으로 결론낸 경로에서 부른다.
 * 다목(영 §168의11 호 인정 · ②수입금액비율)은 건축물·재산세 구분과 **독립한 축**이라 date 집합이 이력과 무관하다 — `fullPeriod`(소유기간 전체)를 넘기면
 * 상태 이력이 이 날들을 지우지 못한다(법 §104의3①4호 가·나·다목은 병렬 제외 사유 — 날짜 집합의 합집합). 나목(Step 3-1·3-2)은 이력이 다루는 축이라 기록하지 않는다.
 */
export function markOwn(trace: OtherLandOwnTrace, periods: DateInterval[], ho?: string): void {
  // 13호(나지)는 기록하지 않는다 — «어느 용도로도 사용되고 있지 아니한 토지»는 건축물이 있던 구간과 충돌하고 날짜별 적용 범위를 확인하지 못했다(확인 필요). 꼬리만 core 결론을 따른다.
  if (ho === "vacant_lot_1household") return;
  trace.own = [...(trace.own ?? []), ...periods];
}

export interface Ctx {
  r: PeriodCriteriaResult;
  totalOwnershipDays: number;
  revenueTestDetail?: RevenueTestResult;
}

export function buildPass(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: true,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    revenueTestDetail: ctx.revenueTestDetail,
    warnings,
  };
}

export function buildFail(
  reason: string,
  steps: JudgmentStep[],
  appliedLaws: string[],
  warnings: string[],
  ctx: Ctx,
): CategoryJudgeResult {
  return {
    isBusiness: false,
    reason,
    steps,
    appliedLaws,
    totalOwnershipDays: ctx.totalOwnershipDays,
    effectiveBusinessDays: ctx.r.effectiveBusinessDays,
    gracePeriodDays: ctx.r.gracePeriodDays,
    businessUseRatio: ctx.r.ratio,
    criteria: ctx.r.criteria,
    revenueTestDetail: ctx.revenueTestDetail,
    warnings,
  };
}
