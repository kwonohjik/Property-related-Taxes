/**
 * §97의2① 주식 이월과세 anchor 공용 픽스처.
 *
 * 계획서: docs/02-design/features/stock-carryover-97-2-necessary-expense.plan.md
 *
 * 기준 케이스 — 코스닥 **대주주 · 중소기업 외** · 10,000주
 *   양도 1주당 100,000 (총 10억) · 양도일 2025-12-01
 *   증여일 2025-06-01 (= 수증자 취득일) · 증여자 취득일 2015-03-01
 *
 * 이 조합에서 세율이 갈린다:
 *   · 수증일 기산  → 보유 183일 → §104①11호가목**1)** 단기 **30%**
 *   · 증여자 기산  → 보유 3,928일 → 가목**2)** 누진(3억 이하 20% / 초과 25%)
 */
import type {
  StockTransferInput,
  AcquisitionLot,
  TransferLot,
} from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

export const D = (s: string) => new Date(s);

/** 1주당 양도가 (총 10억) */
export const PER_SHARE_TRANSFER = 100_000;
export const SHARE_COUNT = 10_000;

/** 코스닥 대주주 · 비중소 기준 픽스처 */
export function stock(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    isSmallMediumEnterprise: false,
    selfShareRatio: 0.1,
    selfMarketCap: 10_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    totalIssuedShares: 100_000,
    shareCount: SHARE_COUNT,
    priorYearEndDate: D("2024-12-31"),
    transferDate: D("2025-12-01"),
    acquisitionDate: D("2025-06-01"),
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: PER_SHARE_TRANSFER,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 80_000, // 증여 당시 평가액 (= 수증자 취득가액)
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    ...o,
  } as StockTransferInput;
}

/**
 * 이월과세 대상 픽스처 — 게이트를 **모두 통과**하는 기본형.
 * 증여일 2025-06-01(≥ 2025.1.1.) · 양도까지 6개월(≤ 1년) · 배우자 생존.
 */
export function carryover(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return stock({
    acquisitionCause: "carryover_gift",
    donorAcquisitionDate: D("2015-03-01"),
    donorRelation: "spouse",
    donorDeceased: false,
    // §97의2①1호 — 증여자 취득가액 1주당 30,000 (총 3억)
    donorAcquisitionPrice: 30_000,
    ...o,
  });
}

/** 매수 lot */
export function acqLot(o: Partial<AcquisitionLot> & { shareCount: number }): AcquisitionLot {
  return {
    acquisitionDate: D("2025-06-01"),
    perShareAcquisitionPrice: 80_000,
    acquisitionCause: "purchase",
    ...o,
  } as AcquisitionLot;
}

/** 매도 lot */
export function xferLot(o: Partial<TransferLot> & { shareCount: number }): TransferLot {
  return {
    transferDate: D("2025-12-01"),
    perShareTransferPrice: PER_SHARE_TRANSFER,
    ...o,
  } as TransferLot;
}
