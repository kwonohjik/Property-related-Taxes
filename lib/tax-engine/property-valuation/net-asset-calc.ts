/**
 * Phase 3 모듈 — 순자산가액 계산 (별지 부표3 2~3쪽 4.순자산가액)
 *
 * 법령: 상증령 §55 ① + §17의2 1~4호 (KoreanLaw 검증 2026-05-22)
 *
 * §55①: "순자산가액은 평가기준일 현재 당해 법인의 자산을 법 §60~§66에 따라 평가한 가액에서
 *        부채를 차감한 가액으로 하며, 순자산가액이 0원 이하인 경우에는 0원으로 한다.
 *        이 경우 ... 평가한 가액이 장부가액보다 적은 경우에는 장부가액으로 한다."
 *
 * §55②: "재정경제부령이 정하는 무형고정자산·준비금·충당금등 ... 자산과 부채의 가액에서
 *        각각 차감하거나 가산한다." → §17의2 1~4호
 *
 * §55③: 영업권 가산 + 단서 1·2·3호 자동 배제 (별도 모듈 goodwill.ts에서 처리)
 *
 * 별지 부표3 2~3쪽 산식:
 *   자산총액 가 = ① + ② + ③ + ④ + ⑤ − ⑥ − ⑦
 *   부채총액 나 = ⑨ + ⑩ + ⑪ + ⑫ + ⑬ + ⑭ + ⑮ − ⑯ − ⑰ + ⑱
 *   영업권 포함 전 순자산가액 다 = 가 − 나
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

export interface NetAssetCalcResult {
  /** 가. 자산총액 (별지 양식 ⑧ 소계) */
  totalAssets: number;
  /** 나. 부채총액 (별지 양식 ⑲ 소계) */
  totalLiabilities: number;
  /** 다. 영업권 포함 전 순자산가액 (가 − 나) */
  netAssetBeforeGoodwill: number;
  /** §55① 후단 — 0 이하 시 0 처리 발동 여부 */
  zeroFloorApplied: boolean;
}

/**
 * 순자산가액 산정 — §55① + §17의2
 *
 * @example PDF 사례 6 (p1546~1547)
 *   자산총액 ⑧ = 2,476,889,520 + 91,548,350 + 0 + 0 + 0 − 65,400,500 − 0 = 2,503,037,370
 *   부채총액 ⑲ = 1,833,780,000 + 32,627,890 + 0 + 3,262,780 + 0 + 445,785,000 + 0 − 0 − 301,770,000 + 0
 *               = 2,013,685,670
 *   영업권 포함 전 순자산가액 다 = 489,351,700원
 */
export function calcNetAssetTotal(
  input: UnlistedNetAssetCalculation,
): NetAssetCalcResult {
  // 자산총액 (가)
  // §17의2 1호 (자산 가산): ⑤ otherEarnedRights (지급받을 권리 확정 가액)
  // §17의2 2호 (자산 차감): ⑥ prepaidExpenses (선급비용 + 법인세령 §24①2호바목 무형자산)
  const totalAssets =
    input.bsTotalAssets +
    input.assetValuationDelta +
    input.corpTaxReservedAmount +
    input.paidInCapitalIncrease +
    input.otherEarnedRights -
    input.prepaidExpenses -
    input.preGiftRetainedEarnings;

  // 부채총액 (나)
  // §17의2 3호 (부채 가산): ⑩~⑭ 법인세·농특세·지방세·배당금·퇴직급여추계
  // §17의2 3호 가 추가: ⑮ 기타 충당금 중 비용 확정분 (단서 가)
  // §17의2 4호 본문 (부채 차감): ⑯ 제준비금 + ⑰ 제충당금
  // ⑱ deferredTaxAdjustment: 기타 (이연법인세대 등) — 가산
  // 보험사업 단서 (§17의2 4호 나·다): F-11 후속, 가산 처리
  const totalLiabilities =
    input.bsTotalLiabilities +
    input.corporateTaxPayable +
    input.farmingSurtax +
    input.localIncomeTax +
    input.dividendPayable +
    input.retirementProvision +
    input.otherProvision -
    input.reserveExcluded -
    input.allowanceExcluded +
    input.deferredTaxAdjustment +
    (input.insuranceReservePolicy ?? 0) +
    (input.insuranceExtraordinaryReserve ?? 0) +
    (input.insuranceSurrenderReserve ?? 0);

  // 다. 영업권 포함 전 순자산가액
  const raw = totalAssets - totalLiabilities;
  const netAssetBeforeGoodwill = Math.max(0, raw); // §55① 후단

  return {
    totalAssets,
    totalLiabilities,
    netAssetBeforeGoodwill,
    zeroFloorApplied: raw < 0,
  };
}

/**
 * 1주당 순자산가치 ④ (영업권 포함 후 순자산가액 ÷ 발행주식총수)
 *
 * @param netAssetTotalIncludingGoodwill 영업권 포함 후 순자산가액 (③)
 * @param totalShares 발행주식총수 (평가기준일 현재)
 * @returns ④ 1주당 순자산가액 = ③ / 발행주식총수
 *
 * @example PDF 사례 6: 489,351,700 / 50,000 = 9,787.034 → floor → 9,787원
 */
export function calcNetAssetPerShare(
  netAssetTotalIncludingGoodwill: number,
  totalShares: number,
): number {
  if (totalShares <= 0) return 0;
  return Math.floor(netAssetTotalIncludingGoodwill / totalShares);
}
