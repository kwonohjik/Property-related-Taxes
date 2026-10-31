/**
 * 부담부증여 ⑫ — 시가 모드 · 담보 승 판정 (필수값 refine · 당초 증여자 건물 기준시가 0 거부 공용).
 * `transfer-tax-schema-required-refines.ts`와 `transfer-tax-schema-donor-built.ts`가 서로 import하지 않도록 리프로 둔다.
 */
import { computeSangjeungbeopValuation } from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

/** 판정에 쓰는 와이어 값만. `valuationMode`가 없으면(와이어 생략) 담보 승이 아니다. */
export type CollateralWinLike = {
  valuationMode?: string;
  marketValueAtTransfer?: number;
  lendingDepositTotal?: number;
  mortgageDebtAmount?: number;
  mortgageSetAmount?: number;
  /** 조합원입주권 평가 3항 — 있으면 §159①1호 괄호가 발동하지 않는다(엔진 `resolveBgAcquisitionBasis`). */
  rightValuation?: unknown;
};

/**
 * 시가 모드 · 담보 승(「상속세 및 증여세법」 제66조) — 엔진이 산정방식과 무관하게 취득가액을 취득시 기준시가 × 채무비율로 강제하고
 * (「소득세법 시행령」 제159조 제1항 제1호 괄호 · `resolveBgAcquisitionBasis`) 실지취득가액·매매사례가액·감정가액을 읽지 않는다.
 * 엔진과 같은 함수로 판정하되 **지분 축소 전** 시가로 본다 — 축소는 시가만 줄이므로 여기서 담보가 이기면 엔진에서도 이긴다
 * (요구를 잘못 빼는 방향으로는 틀리지 않는다). 조합원입주권(괄호 미발동)은 제외 — ⑧이 담보 승을 막는다.
 * 이월과세도 같다 — 양도인·당초 증여자 양쪽 모두 취득시 기준시가를 읽고 방식별 금액은 읽지 않는다(당초 증여자 기준시가는 엔진 `assertCarryoverDonorBasis`가 요구한다).
 * 계획서 `docs/00-pm/burdened-gift-residuals-o3-o5-o8.plan.md` O-5 · `bg-carryover-mkt-collateral-win.plan.md`.
 */
export function collateralForcesStdAcquisition(bg: CollateralWinLike): boolean {
  if (bg.valuationMode !== "sangjeungbeop_market" || bg.rightValuation !== undefined) return false;
  return (
    computeSangjeungbeopValuation(0, 0, {
      valuationMode: "sangjeungbeop_market",
      marketValueAtTransfer: bg.marketValueAtTransfer ?? 0,
      lendingDepositTotal: bg.lendingDepositTotal ?? 0,
      mortgageDebtAmount: bg.mortgageDebtAmount ?? 0,
      mortgageSetAmount: bg.mortgageSetAmount,
      annualRentTotal: 0,
    } as BurdenedGiftInfo).selectedMode === "mortgage"
  );
}

