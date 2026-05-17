/**
 * 주식 양도소득세 — 비상장주식 보충적 평가 모듈 (PR-2 완전 구현)
 *
 * 소득세법 시행령 §165④1:
 *   가중평균 = (1주당 순손익가치 × 3 + 1주당 순자산가치 × 2) ÷ 5
 *   단서: 가중평균 < 순자산가치 × 80% 시 → max(가중평균, 순자산가치 × 80%)
 *
 * 시행령 §165④3 가~라목: 순자산가치 단독 평가 (80% 하한 미적용)
 * 시행령 §165⑤: 부동산과다보유법인 가중치 반전 (순손익 2/5 + 순자산 3/5)
 *
 * 입력값 규약 (PR-2 정정 확정):
 *   netIncomePerShare = 1주당 순손익가치 (= 1주당 순손익액 ÷ 10% 이미 반영한 값)
 *   netAssetPerShare  = 1주당 순자산가치
 *   → 엔진에서 ÷10% 재적용 금지 (PR-1 인계 사항 정정)
 *
 * 시기별 평가 연혁 (§165④ 개정 이력):
 *   1998년 이하  : 순자산가치 단독
 *   1999~2000   : 가중평균 (손익 5/5? → 당시 시행령 구조)
 *   2001~2003   : 순손익 × 3 + 순자산 × 2 (5분의)
 *   2004~2007.2.27: 순손익 × 3 + 순자산 × 2 (현행과 동일 분모)
 *   2007.2.28~  : 현행 (§165④1 본칙 + 단서 80%)
 *
 * ※ 취득 후 상장 환산비율 계산(분자·분모)에는 80% 하한 미적용
 *    (환산비율 분자·분모는 stock-valuation-post-listing.ts에서 처리)
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import {
  STOCK,
  STOCK_FLOOR_80_PCT,
  STOCK_LOSS_GAIN_DISCOUNT_RATE,
} from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 평가 결과 타입
// ============================================================

export interface UnlistedValuationResult {
  /** 1주당 최종 평가액 (80% 하한 적용 후) */
  perShareValue: number;
  /** 취득기준시가 총액 (개산공제 계산 기준) */
  acquisitionStdPriceTotal: number;
  /** 환산취득가 총액 = 양도가 × (취득기준시가 / 양도기준시가) */
  totalAcquisitionPrice: number;
  /** 평가 방법 */
  method: "weighted_avg" | "net_asset_only" | "face_value";
  /** 80% 하한 적용 여부 (§165④1 단서) */
  netAssetFloorApplied: boolean;
  /** 80% 하한값 (netAssetFloorApplied=true 시) */
  netAssetFloorValue?: number;
  /** 1주당 가중평균값 (floor 전) */
  weightedAvgRaw?: number;
  /** 1주당 순손익가치 */
  netIncomeValue?: number;
  /** 1주당 순자산가치 */
  netAssetValue?: number;
  /** 순자산 단독 사유 (netAssetOnlyReason 전달) */
  netAssetOnlyReason?: StockTransferInput["netAssetOnlyReason"];
  warnings: string[];
  appliedRules: string[];
}

// ============================================================
// 시기별 평가 연혁 — 양도일 기준 (§165④ 개정 이력)
// ============================================================

interface ValuationWeights {
  niWeight: number;   // 순손익가치 가중치 (합계 5분의)
  naWeight: number;   // 순자산가치 가중치 (합계 5분의)
  hasFloor80: boolean; // 80% 하한 적용 여부
}

/**
 * 양도일 기준 시기별 평가 가중치 조회
 *
 * 연혁 (시행령 §165④ 개정):
 *   ~1998.12.31.      : 순자산 단독 (ni=0, na=5)
 *   1999.1.1.~2000.12.31.: 순손익 3/5 + 순자산 2/5 (80% 하한 없음)
 *   2001.1.1.~2004.12.31.: 순손익 3/5 + 순자산 2/5 (80% 하한 없음)
 *   2004.1.1.~2007.2.27.: 순손익 3/5 + 순자산 2/5 (80% 하한 없음)
 *   2007.2.28.~         : 순손익 3/5 + 순자산 2/5 + 80% 하한 (현행)
 *
 * ★ 연혁 5분기 (케이스 19):
 *   PR-2 범위에서는 1998↓ vs 2007.2.28.~ 2분기 정확 분기.
 *   중간 구간(1999~2007.2.27.)은 현행 가중치와 동일하나 80% 하한 미적용.
 */
function getValuationWeights(transferDate: Date): ValuationWeights {
  const ts = transferDate.getTime();

  // 1998.12.31. 이하 — 순자산 단독 (연혁 분기 1)
  const CUTOFF_1998 = new Date("1999-01-01").getTime();
  if (ts < CUTOFF_1998) {
    return { niWeight: 0, naWeight: 5, hasFloor80: false };
  }

  // 2007.2.28. 이상 — 현행 (80% 하한 포함)
  const CUTOFF_2007_2_28 = new Date("2007-02-28").getTime();
  if (ts >= CUTOFF_2007_2_28) {
    return { niWeight: 3, naWeight: 2, hasFloor80: true };
  }

  // 1999.1.1.~2007.2.27. — 가중평균 동일하나 80% 하한 없음
  return { niWeight: 3, naWeight: 2, hasFloor80: false };
}

// ============================================================
// 가중평균 1주당 평가액 계산
// ============================================================

/**
 * 비상장 1주당 가중평균 계산
 *
 * netIncomeValue = 1주당 순손익가치 (= 1주당 순손익액 ÷ 10% 이미 반영)
 * netAssetValue  = 1주당 순자산가치
 *
 * 현행(2007.2.28.~): (ni × 3 + na × 2) ÷ 5
 * 가중치 반전(부동산과다보유): (ni × 2 + na × 3) ÷ 5
 */
function calcWeightedAvgPerShare(
  netIncomeValue: number,
  netAssetValue: number,
  niWeight: number,
  naWeight: number,
): number {
  return (netIncomeValue * niWeight + netAssetValue * naWeight) / 5;
}

// ============================================================
// 메인: 비상장 보충적 평가 (양도·취득 기준시가)
// ============================================================

/**
 * 비상장 보충적 평가
 *
 * transferPrice: 양도가액 (교환 합계 또는 실가)
 * shareCount: 주식수
 * transferDate: 양도일 (시기별 평가 연혁 분기 기준)
 *
 * 반환:
 *   - acquisitionStdPriceTotal: 취득기준시가 총액 (개산공제 기준)
 *   - totalAcquisitionPrice: 환산취득가 (양도가 × 취득기준시가 / 양도기준시가)
 */
export function calcUnlistedValuation(
  input: StockTransferInput,
  transferPrice: number,
): UnlistedValuationResult {
  const {
    shareCount,
    transferDate,
    bookLost,
    faceValuePerShare,
    netAssetOnlyReason,
    isHeavyRealEstateForValuation,
  } = input;

  const warnings: string[] = [];
  const appliedRules: string[] = [STOCK.ENFORCEMENT_DECREE_165_4_1_WEIGHTED_AVG];

  // ──────────────────────────────────────────────────────────
  // 장부분실 + 액면가 (§99①4)
  // bookLost = true → acquisitionMode="face_value"에서 호출됨
  // ──────────────────────────────────────────────────────────
  if (bookLost && faceValuePerShare) {
    const perShareValue = faceValuePerShare;
    const acquisitionStdPriceTotal = perShareValue * shareCount;

    // 환산취득가 계산 — 액면가 취득기준시가 / 양도기준시가(보충평가) 방식은 별도 계산 필요
    // 단, 사례 49: acquisitionMode="face_value"에서는 직접 취득가 = face_value × shareCount가 아님
    // 올바른 계산: 환산취득가 = 양도가 × (액면가 / 양도기준시가)
    // 양도기준시가는 별도로 입력받아야 하나, face_value 모드의 경우
    // 엔진 STEP 2에서 calcUnlistedValuation 호출 → transferPrice와 함께 전달됨
    // 여기서는 취득기준시가 총액만 반환하고, 환산취득가는 호출부에서 계산

    appliedRules.push(STOCK.SECTION_99_1_4_FACE_VALUE);

    return {
      perShareValue,
      acquisitionStdPriceTotal,
      totalAcquisitionPrice: acquisitionStdPriceTotal, // 호출부에서 환산 재계산
      method: "face_value",
      netAssetFloorApplied: false,
      warnings,
      appliedRules,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 양도일 1주당 평가액 (양도기준시가) — 시기별 연혁 분기
  // ──────────────────────────────────────────────────────────
  const weights = getValuationWeights(transferDate);

  // 양도일 직전 사업연도 입력값
  const transferNi = input.transferYearNetIncomePerShare ?? 0;
  const transferNa = input.transferYearNetAssetPerShare ?? 0;

  // 취득일 직전 사업연도 입력값 (취득기준시가)
  const acquisitionNi = input.acquisitionYearNetIncomePerShare ?? 0;
  const acquisitionNa = input.acquisitionYearNetAssetPerShare ?? 0;

  // ──────────────────────────────────────────────────────────
  // 순자산 단독 평가 4사유 (§165④3 가~라목)
  // 80% 하한 미적용 (케이스 27)
  // ──────────────────────────────────────────────────────────
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

    // 양도기준시가 = 순자산 단독
    const transferStdPricePerShare = Math.floor(transferNa);
    // 취득기준시가 = 순자산 단독
    const acquisitionStdPricePerShare = Math.floor(acquisitionNa);
    const acquisitionStdPriceTotal = acquisitionStdPricePerShare * shareCount;

    if (transferStdPricePerShare <= 0) {
      warnings.push("양도일 순자산 단독 평가액이 0 이하입니다.");
      return {
        perShareValue: 0,
        acquisitionStdPriceTotal: 0,
        totalAcquisitionPrice: 0,
        method: "net_asset_only",
        netAssetFloorApplied: false,
        netAssetOnlyReason,
        warnings,
        appliedRules,
      };
    }

    // 환산취득가 = 양도가 × 취득기준시가 / 양도기준시가
    const totalAcquisitionPrice = Math.floor(
      (transferPrice * acquisitionStdPricePerShare) / transferStdPricePerShare,
    );

    return {
      perShareValue: acquisitionStdPricePerShare,
      acquisitionStdPriceTotal,
      totalAcquisitionPrice,
      method: "net_asset_only",
      netAssetFloorApplied: false, // §165④3 단독 사유 — 80% 하한 미적용
      netAssetOnlyReason,
      netIncomeValue: transferNi,
      netAssetValue: transferNa,
      warnings,
      appliedRules,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 가중평균 — 현행 or 시기별
  // ──────────────────────────────────────────────────────────

  // 가중치 반전 (부동산과다보유법인 §165⑤)
  const niWeight = isHeavyRealEstateForValuation ? 2 : weights.niWeight;
  const naWeight = isHeavyRealEstateForValuation ? 3 : weights.naWeight;

  if (isHeavyRealEstateForValuation) {
    appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_5_POST_LISTING + "가중치반전");
    appliedRules.push("부동산과다보유가중치반전");
  }

  // 1998 이하 순자산 단독 연혁 분기 (getValuationWeights에서 niWeight=0, naWeight=5로 처리)
  if (weights.niWeight === 0 && weights.naWeight === 5 && !isHeavyRealEstateForValuation) {
    appliedRules.push("시기별평가1998이하순자산단독");
  }

  // ─── 양도기준시가 (양도일 직전 사업연도 기준) ───
  let transferWeightedRaw: number;
  if (niWeight === 0) {
    // 1998 이하 연혁: 순자산 단독
    transferWeightedRaw = transferNa;
  } else {
    transferWeightedRaw = calcWeightedAvgPerShare(transferNi, transferNa, niWeight, naWeight);
  }

  // 80% 하한 적용 (현행 §165④1 단서)
  let transferStdPricePerShare: number;
  let netAssetFloorApplied = false;
  let netAssetFloorValue: number | undefined;

  if (weights.hasFloor80 && !isHeavyRealEstateForValuation) {
    // 가중치 반전(부동산과다보유) 시 80% 하한은 별도 검토 — PR-2 범위에서 본칙 적용
    const floor80 = transferNa * STOCK_FLOOR_80_PCT;
    if (floor80 > transferWeightedRaw) {
      netAssetFloorApplied = true;
      netAssetFloorValue = Math.floor(floor80);
      transferStdPricePerShare = Math.floor(floor80);
      appliedRules.push("80%하한");
      appliedRules.push(STOCK.ENFORCEMENT_DECREE_165_4_1_FLOOR_80);
    } else {
      transferStdPricePerShare = Math.floor(transferWeightedRaw);
    }
  } else if (weights.hasFloor80 && isHeavyRealEstateForValuation) {
    // 부동산과다보유 가중치 반전 + 80% 하한: 반전 가중치 가중평균이 순자산 80% 미만인 경우
    const floor80 = transferNa * STOCK_FLOOR_80_PCT;
    if (floor80 > transferWeightedRaw) {
      netAssetFloorApplied = true;
      netAssetFloorValue = Math.floor(floor80);
      transferStdPricePerShare = Math.floor(floor80);
      appliedRules.push("80%하한");
    } else {
      transferStdPricePerShare = Math.floor(transferWeightedRaw);
    }
  } else {
    transferStdPricePerShare = Math.floor(transferWeightedRaw);
  }

  if (transferStdPricePerShare <= 0) {
    warnings.push("양도기준시가가 0 이하입니다. 보충적 평가 불가.");
    return {
      perShareValue: 0,
      acquisitionStdPriceTotal: 0,
      totalAcquisitionPrice: 0,
      method: "weighted_avg",
      netAssetFloorApplied: false,
      warnings,
      appliedRules,
    };
  }

  // ─── 취득기준시가 (취득일 직전 사업연도 기준) ───
  // 취득기준시가에도 동일 가중치 적용 (80% 하한은 양도기준시가에만)
  let acquisitionWeightedRaw: number;
  if (niWeight === 0) {
    acquisitionWeightedRaw = acquisitionNa;
  } else {
    acquisitionWeightedRaw = calcWeightedAvgPerShare(acquisitionNi, acquisitionNa, niWeight, naWeight);
  }
  const acquisitionStdPricePerShare = Math.floor(acquisitionWeightedRaw);
  const acquisitionStdPriceTotal = acquisitionStdPricePerShare * shareCount;

  // ─── 환산취득가 = 양도가 × (취득기준시가 / 양도기준시가) ───
  // 정수 정밀도: 곱셈 먼저 (overflow 방지는 BigInt 사용)
  let totalAcquisitionPrice: number;
  if (acquisitionStdPricePerShare === 0 || transferStdPricePerShare === 0) {
    totalAcquisitionPrice = 0;
    warnings.push("취득기준시가 또는 양도기준시가가 0입니다. 환산취득가 = 0.");
  } else {
    // BigInt로 overflow 방지
    const numerator = BigInt(transferPrice) * BigInt(acquisitionStdPricePerShare);
    const denominator = BigInt(transferStdPricePerShare);
    totalAcquisitionPrice = Number(numerator / denominator);
  }

  return {
    perShareValue: acquisitionStdPricePerShare,
    acquisitionStdPriceTotal,
    totalAcquisitionPrice,
    method: "weighted_avg",
    netAssetFloorApplied,
    netAssetFloorValue,
    weightedAvgRaw: transferWeightedRaw,
    netIncomeValue: transferNi,
    netAssetValue: transferNa,
    warnings,
    appliedRules,
  };
}

// ============================================================
// 개산공제 기준시가 총액 계산 헬퍼 (§163⑥4)
// ============================================================

/**
 * 개산공제 = 취득당시 기준시가 × 1%
 *
 * 비상장 보충적 평가: 취득기준시가 총액 = acquisitionStdPriceTotal
 * 액면가: 취득기준시가 총액 = faceValuePerShare × shareCount
 *
 * ★ PR-2 정정: estimatedBase = 취득기준시가 총액 (환산취득가 아님)
 */
export function calcEstimatedDeductionBase(
  acquisitionMode: StockTransferInput["acquisitionMode"],
  acquisitionStdPriceTotal: number,
  faceValuePerShare: number | undefined,
  shareCount: number,
): number {
  if (acquisitionMode === "face_value") {
    return (faceValuePerShare ?? 0) * shareCount;
  }
  return acquisitionStdPriceTotal;
}

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
