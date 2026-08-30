/**
 * 비상장 보충평가 — **한쪽 시점만** 산출하는 경로 모음
 *
 * `stock-valuation-unlisted.ts`가 800줄 정책을 넘겨 분리했다.
 * 이음매는 **산출 범위**다 — 본체 `calcUnlistedValuation`은 양도·취득 **양측**을 함께
 * 평가하고 환산까지 마치지만, 여기 셋은 한쪽만 낸다:
 *   · `calcTransferStdPriceForFaceValue` — 액면가(§99①4 후단) 경로의 **양도**기준시가(분모)
 *   · `calcFaceValueTransferEstimated`    — 그 분모로 환산취득가만 계산
 *   · `calcAcquisitionStdPerShareSupplementary` — [C-1] 취득일 거래정지의 **취득**측(분자)
 *
 * 연혁 게이팅·가중평균·80% 하한은 전부 `valuation-165-4-basis.ts` 정본에 위임한다.
 * import 경로 호환을 위해 본체 파일이 이 셋을 재수출한다.
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import { STOCK, STOCK_FLOOR_80_PCT } from "@/lib/tax-engine/legal-codes/stock";
import {
  getValuationWeights,
  calcSection165_4Value,
  calcWeightedAvgPerShare,
} from "./valuation-165-4-basis";

// ============================================================
// 비상장 장부분실 액면가 취득가 + 환산취득가 분리 헬퍼
// ============================================================

/**
 * 비상장 장부분실 액면가 환산취득가
 *
 * §99①4: 장부분실 시 취득기준시가 = 액면가
 * 환산취득가 = 양도가 × (액면가 / 양도기준시가)
 *
 * 양도기준시가 = calcUnlistedValuation()에서 반환된 transferStdPricePerShare
 *
 * 사례 49 anchor:
 *   양도가 = 6,000,000,000
 *   액면가 = 12,500
 *   양도기준시가 = 160,000 (80% 하한 적용 후)
 *   → 환산취득가 = 6,000,000,000 × 12,500 / 160,000 = 468,750,000
 */
export function calcFaceValueTransferEstimated(
  transferPrice: number,
  faceValuePerShare: number,
  transferStdPricePerShare: number,
): number {
  if (transferStdPricePerShare <= 0) return 0;
  const numerator = BigInt(transferPrice) * BigInt(faceValuePerShare);
  const denominator = BigInt(transferStdPricePerShare);
  return Number(numerator / denominator);
}

/**
 * 비상장 장부분실 시 양도기준시가 계산
 * (액면가는 취득기준시가 — 양도기준시가는 별도 보충 평가 필요)
 *
 * 사례 49: isHeavyRealEstateForValuation=false, niPerShare=30,000, naPerShare=200,000
 * weighted = 30,000×3/5 + 200,000×2/5 = 98,000
 * floor80  = 200,000×0.80 = 160,000
 * → max(98,000, 160,000) = 160,000 (80% 하한 발동)
 */
export function calcTransferStdPriceForFaceValue(
  input: StockTransferInput,
): { perShare: number; netAssetFloorApplied: boolean; netAssetFloorValue?: number } {
  const { transferDate, isHeavyRealEstateForValuation } = input;
  const transferNi = input.transferYearNetIncomePerShare ?? 0;
  const transferNa = input.transferYearNetAssetPerShare ?? 0;

  const weights = getValuationWeights(transferDate);
  const niWeight = isHeavyRealEstateForValuation ? 2 : weights.niWeight;
  const naWeight = isHeavyRealEstateForValuation ? 3 : weights.naWeight;

  let weightedRaw: number;
  if (niWeight === 0) {
    weightedRaw = transferNa;
  } else {
    weightedRaw = calcWeightedAvgPerShare(transferNi, transferNa, niWeight, naWeight);
  }

  if (weights.hasFloor80) {
    const floor80 = transferNa * STOCK_FLOOR_80_PCT;
    if (floor80 > weightedRaw) {
      return {
        perShare: Math.floor(floor80),
        netAssetFloorApplied: true,
        netAssetFloorValue: Math.floor(floor80),
      };
    }
  }

  return { perShare: Math.floor(weightedRaw), netAssetFloorApplied: false };
}

// ============================================================
// [C-1] 취득일 거래정지 — 취득시 1주당 보충평가 단독 산출
// ============================================================

export interface AcquisitionSideSupplementaryResult {
  /** 취득시 1주당 보충평가액 (floor) — §165④1 단서 80% 하한 적용 후 */
  perShare: number;
  /** floor 전 가중평균 raw (NA 단독 시 NA 그대로) */
  weightedRaw: number;
  /** §165④1 단서 80% 하한이 발동했는지 — 호출부가 결과뷰·신고서에 그대로 싣는다 */
  floorApplied: boolean;
  /** 비타입 문자열 규칙 (호출부 warnings로 전달 — calcUnlistedValuation 호출부 패턴) */
  appliedRules: string[];
  warnings: string[];
}

/**
 * [C-1] 취득시 1주당 §165④ 보충평가 단독 산출 (취득일 거래정지 전용)
 *
 * 소령 §165③ 후문 "양도일ㆍ취득일 이전 1개월" — 취득일 이전 1개월 거래정지·관리종목 시
 * 취득시 기준시가만 §99①4 → §165④ 보충 평가로 대체 (양도시는 1개월 종가평균 유지).
 * §165⑤ 비적용 판정(계산식이 상장일 기반 취득 후 상장 전제).
 *
 * - 가중치 연혁: getValuationWeights(transferDate) — 양측 경로(calcUnlistedValuation)와 동일 (양도시점 과세)
 * - netAssetOnlyReason 시 취득연도 NA 단독 (§165④3 — 양측 경로와 동일 규율)
 * - isHeavyRealEstateForValuation 시 2:3 반전 (§165④1 괄호)
 * - **80% 하한 적용** (§165④1 단서) — 공용 정본 `calcSection165_4Value` 위임
 *
 * 🔑 종전에는 이 경로만 하한을 걸지 않았고, 근거로 「양측 경로 분자 관행」을 적었다.
 *    그 양측 경로(`calcUnlistedValuation`)는 이미 취득측에도 하한을 걸도록 정정됐고(#1150),
 *    인용된 줄 번호는 전혀 다른 코드를 가리키고 있었다 — **stale 자기참조**였다.
 *    §165③ 후문은 분자만 §165④로 대체하도록 명령하므로 그 1호 **단서까지 함께** 딸려온다.
 *    하한은 값을 **올리는** 장치라, 여기서만 빼면 분자가 낮아져
 *    환산취득가 과소 → 세액 과대로 한쪽으로만 찌그러진다.
 */
export function calcAcquisitionStdPerShareSupplementary(
  input: StockTransferInput,
): AcquisitionSideSupplementaryResult {
  const { transferDate, netAssetOnlyReason, isHeavyRealEstateForValuation } = input;
  const acquisitionNi = input.acquisitionYearNetIncomePerShare ?? 0;
  const acquisitionNa = input.acquisitionYearNetAssetPerShare ?? 0;

  const warnings: string[] = [];
  const appliedRules: string[] = [
    STOCK.ENFORCEMENT_DECREE_165_3_TRADING_HALT,
  ];

  // 순자산 단독 평가 4사유 (§165④3 가~라목) — 취득측 NA 단독
  if (netAssetOnlyReason) {
    let ruleRef: string;
    switch (netAssetOnlyReason) {
      case "liquidation_or_owner_death":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_GA_LIQUIDATION;
        break;
      case "no_business_or_short_or_closed":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_NA_PRE_BUSINESS;
        break;
      case "stock_holding_company":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_DA_HOLDING_CO;
        break;
      case "remaining_term_under_3y":
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_RA_REMAINING_3Y;
        break;
      default:
        ruleRef = STOCK.ENFORCEMENT_DECREE_165_4_3_GA_LIQUIDATION;
    }
    appliedRules.push(ruleRef);
    // §165④3호는 「제1호 각 목 외의 부분에도 불구하고」라 1호 단서(하한)도 함께 비껴간다.
    return {
      perShare: Math.floor(acquisitionNa),
      weightedRaw: acquisitionNa,
      floorApplied: false,
      appliedRules,
      warnings,
    };
  }

  // 가중평균 + §165④1 단서 — 공용 정본에 위임 (연혁 분기·부동산과다보유 반전·하한 일괄)
  appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_4_1_WEIGHTED_AVG);
  if (isHeavyRealEstateForValuation) {
    appliedRules.push("부동산과다보유가중치반전");
  }
  const evaluated = calcSection165_4Value(
    acquisitionNi,
    acquisitionNa,
    isHeavyRealEstateForValuation === true,
    transferDate,
  );
  if (evaluated.floorApplied) {
    appliedRules.push("80%하한(취득기준시가)");
    appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_4_1_FLOOR_80);
  }

  if (evaluated.value <= 0) {
    warnings.push("취득시 보충평가액이 0 이하 — 취득연도 순손익·순자산가치를 확인하세요");
  }

  return {
    perShare: evaluated.value,
    weightedRaw: evaluated.weightedRaw,
    floorApplied: evaluated.floorApplied,
    appliedRules,
    warnings,
  };
}
