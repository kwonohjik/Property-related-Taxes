/**
 * 기타토지 판정 공용 조각 — `other-land.ts`에서 떼어 낸 순수 헬퍼(NBL-STATE-HISTORY-E2 · 800줄 정책 기회주의적 분리).
 * 판정 로직은 그대로다(이동만) — `isBareLand`는 `other-land.ts`가 re-export한다.
 */
import type {
  CategoryJudgeResult,
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
