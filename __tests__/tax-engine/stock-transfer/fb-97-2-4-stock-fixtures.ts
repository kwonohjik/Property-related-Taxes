/**
 * F-1 주식 §97의2④ anchor 공용 픽스처 — 단건(`fb-97-2-4-stock.anchor`)·lot(`fb-97-2-4-stock-lots.anchor`)이 같이 쓴다.
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.2
 */
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { FamilyBusinessRateBasis } from "@/lib/tax-engine/family-business-applied-rate";

export const D = (s: string) => new Date(s);

export function unlisted(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: 0.6,
    selfMarketCap: 2_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: D("2025-12-31"),
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    isListedSmallShareholder: false,
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    acquisitionDate: D("2024-03-01"),
    transferDate: D("2026-06-01"),
    shareCount: 10_000,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "inheritance",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 80_000,
    acquisitionMode: "actual",
    acquiredBeforeListing: false,
    perShareAcquisitionPrice: 50_000,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    ...o,
  } as StockTransferInput;
}

/**
 * 기본 양도일(2026-06-01)은 신 ③2호 시대다 — 주식(법인가업 대상 자산)의 적용률은
 * (총자산가액 − 사업무관자산) ÷ 총자산가액이라 분자 n · 분모 d를 그 모양으로 싣는다.
 */
export const ratio = (n: number, d: number): FamilyBusinessRateBasis => ({
  kind: "corporate_business_assets",
  totalAssets: d,
  nonBusinessAssets: d - n,
});
/** 구 ③(양도일 2026.2.26. 이전) — 공제금액 ÷ 가업상속 재산가액 */
export const deduction = (deductionAmount: number, businessEstateValue: number): FamilyBusinessRateBasis => ({
  kind: "deduction_ratio",
  deductionAmount,
  businessEstateValue,
});

export function fb(basis: FamilyBusinessRateBasis, o: Partial<StockTransferInput> = {}, perShare = 5_000) {
  return unlisted({
    familyBusinessInheritance: { decedentAcquisitionPricePerShare: perShare, fbRateBasis: basis },
    ...o,
  });
}
