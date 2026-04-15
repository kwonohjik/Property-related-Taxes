/**
 * 재산평가 — 부동산·금융·임대차 (상증법 §60~§66)
 *
 * 평가 원칙 (§60):
 *   1순위: 시가 (매매·감정·수용·경매 — 평가기간 내)
 *   2순위: 유사매매사례가액 (시행령 §49①5호)
 *   3순위: 보충적 평가 (개별공시지가·기준시가)
 *
 * 이 모듈은 Pure Function — DB 호출 없음, 순수 계산만 수행.
 */

import { VALUATION } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type {
  EstateItem,
  PropertyValuationResult,
  ValuationMethod,
} from "./types/inheritance-gift.types";

// ============================================================
// 임대차 환산 (§61 — 임대보증금 환산가액)
// 환산율 12% (= 보증금 ÷ 0.12)
// ============================================================

const LEASE_CONVERSION_RATE = 0.12;

/**
 * 임대보증금 → 시가 환산 (§61)
 * 환산가액 = 보증금 ÷ 12%
 */
export function convertLeaseToValue(depositAmount: number): number {
  if (depositAmount <= 0) return 0;
  return Math.floor(depositAmount / LEASE_CONVERSION_RATE);
}

// ============================================================
// 공통 평가 우선순위 선택
// ============================================================

/**
 * 시가 우선 원칙으로 평가액 및 방법 결정 (§60)
 * 시가 → 보충적 평가 순
 */
function resolveValuationAmount(item: EstateItem): {
  amount: number;
  method: ValuationMethod;
} {
  // 1순위: 시가 (직접 입력)
  if (item.marketValue != null && item.marketValue > 0) {
    return { amount: item.marketValue, method: "market_value" };
  }
  // 2순위: 감정평가액
  if (item.appraisedValue != null && item.appraisedValue > 0) {
    return { amount: item.appraisedValue, method: "appraisal" };
  }
  // 3순위: 보충적 평가 (개별공시지가·기준시가)
  if (item.standardPrice != null && item.standardPrice > 0) {
    return { amount: item.standardPrice, method: "standard_price" };
  }
  return { amount: 0, method: "standard_price" };
}

// ============================================================
// 토지 평가 (§61 ① — 개별공시지가)
// ============================================================

export function evaluateLand(item: EstateItem): PropertyValuationResult {
  if (item.category !== "real_estate_land") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateLand: 토지 자산이 아닙니다.",
    );
  }

  const { amount, method } = resolveValuationAmount(item);
  const mortgageDeduction = item.mortgageAmount ?? 0;
  const netAmount = Math.max(0, amount - mortgageDeduction);

  return {
    estateItemId: item.id,
    method,
    valuatedAmount: netAmount,
    breakdown: [
      { label: "토지 평가액", amount, lawRef: VALUATION.REAL_ESTATE_SUPP },
      ...(mortgageDeduction > 0
        ? [{ label: "저당권 차감", amount: -mortgageDeduction, lawRef: VALUATION.COLLATERAL_SPECIAL }]
        : []),
      { label: "순 평가액", amount: netAmount },
    ],
    warnings:
      method === "standard_price"
        ? ["개별공시지가 기준 보충적 평가 적용 — 시가 확인 권장"]
        : [],
  };
}

// ============================================================
// 아파트 평가 (§61 ① — 공동주택 기준시가 / 시가 우선)
// ============================================================

export function evaluateApartment(item: EstateItem): PropertyValuationResult {
  if (item.category !== "real_estate_apartment") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateApartment: 아파트 자산이 아닙니다.",
    );
  }

  const { amount, method } = resolveValuationAmount(item);
  const depositDeduction = item.leaseDeposit ?? 0;
  const mortgageDeduction = item.mortgageAmount ?? 0;
  const totalDeduction = depositDeduction + mortgageDeduction;
  const netAmount = Math.max(0, amount - totalDeduction);

  const warnings: string[] = [];
  if (method === "standard_price") {
    warnings.push("공동주택 기준시가 보충적 평가 — 실거래가 확인 권장");
  }
  if (depositDeduction > 0) {
    warnings.push(`임대보증금 ${depositDeduction.toLocaleString()}원 차감 적용`);
  }

  return {
    estateItemId: item.id,
    method,
    valuatedAmount: netAmount,
    breakdown: [
      { label: "아파트 평가액", amount, lawRef: VALUATION.PRINCIPLE },
      ...(depositDeduction > 0
        ? [{ label: "임대보증금 차감", amount: -depositDeduction }]
        : []),
      ...(mortgageDeduction > 0
        ? [{ label: "저당권 차감", amount: -mortgageDeduction, lawRef: VALUATION.COLLATERAL_SPECIAL }]
        : []),
      { label: "순 평가액", amount: netAmount },
    ],
    warnings,
  };
}

// ============================================================
// 단독주택·다가구 평가 (§61 ① — 개별주택가격 / 시가 우선)
// ============================================================

export function evaluateDetachedHouse(item: EstateItem): PropertyValuationResult {
  if (item.category !== "real_estate_building") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateDetachedHouse: 건물(단독주택) 자산이 아닙니다.",
    );
  }

  const { amount, method } = resolveValuationAmount(item);
  const depositDeduction = item.leaseDeposit ?? 0;
  const mortgageDeduction = item.mortgageAmount ?? 0;
  const netAmount = Math.max(0, amount - depositDeduction - mortgageDeduction);

  return {
    estateItemId: item.id,
    method,
    valuatedAmount: netAmount,
    breakdown: [
      { label: "단독주택 평가액", amount, lawRef: VALUATION.REAL_ESTATE_SUPP },
      ...(depositDeduction > 0
        ? [{ label: "임대보증금 차감", amount: -depositDeduction }]
        : []),
      ...(mortgageDeduction > 0
        ? [{ label: "저당권 차감", amount: -mortgageDeduction, lawRef: VALUATION.COLLATERAL_SPECIAL }]
        : []),
      { label: "순 평가액", amount: netAmount },
    ],
    warnings:
      method === "standard_price"
        ? ["개별주택가격 보충적 평가 — 시가 확인 권장"]
        : [],
  };
}

// ============================================================
// 상업용 건물 평가 (§61 ① — 건물 기준시가)
// ============================================================

export function evaluateBuilding(item: EstateItem): PropertyValuationResult {
  if (item.category !== "real_estate_building") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateBuilding: 건물 자산이 아닙니다.",
    );
  }
  const { amount, method } = resolveValuationAmount(item);
  const mortgageDeduction = item.mortgageAmount ?? 0;
  const netAmount = Math.max(0, amount - mortgageDeduction);

  return {
    estateItemId: item.id,
    method,
    valuatedAmount: netAmount,
    breakdown: [
      { label: "건물 평가액", amount, lawRef: VALUATION.REAL_ESTATE_SUPP },
      ...(mortgageDeduction > 0
        ? [{ label: "저당권 차감", amount: -mortgageDeduction, lawRef: VALUATION.COLLATERAL_SPECIAL }]
        : []),
      { label: "순 평가액", amount: netAmount },
    ],
    warnings:
      method === "standard_price"
        ? ["건물 기준시가 보충적 평가 — 감정평가 고려 권장"]
        : [],
  };
}

// ============================================================
// 전세보증금 반환채권 평가 (§61 — 상속세 전용)
// 임차인(피상속인)이 임대인에게 맡긴 전세보증금 = 반환받을 채권
// 평가액 = 전세보증금 액면가 (시가 = 액면)
// 주의: §61의 "보증금 ÷ 12%" 공식은 임대료 수익을 자본화하는 공식으로
//       전세권(권리) 평가가 아니라 임대수익 재산 평가에 적용되는 것임.
// ============================================================

export function evaluateRentalConversion(item: EstateItem): PropertyValuationResult {
  if (item.category !== "deposit") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateRentalConversion: 전세보증금 반환채권 자산이 아닙니다.",
    );
  }
  if (!item.leaseDeposit || item.leaseDeposit <= 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateRentalConversion: 전세보증금 금액이 필요합니다.",
    );
  }

  const amount = item.leaseDeposit;

  return {
    estateItemId: item.id,
    method: "market_value",
    valuatedAmount: amount,
    breakdown: [
      {
        label: "전세보증금 반환채권 (액면가)",
        amount,
        lawRef: VALUATION.PRINCIPLE,
        note: "임차인이 임대인에게 맡긴 전세보증금 — 반환받을 채권의 시가 = 액면",
      },
    ],
    warnings: [],
  };
}

// ============================================================
// 현금 평가 (§60 — 시가 원칙: 현금 액면가 = 시가)
// §22 금융재산공제 대상 아님 (금융기관 취급 상품이 아님)
// ============================================================

export function evaluateCash(item: EstateItem): PropertyValuationResult {
  if (item.category !== "cash") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateCash: 현금 자산이 아닙니다.",
    );
  }

  const amount = item.marketValue ?? 0;

  return {
    estateItemId: item.id,
    method: "market_value",
    valuatedAmount: amount,
    breakdown: [
      {
        label: "현금 (액면가)",
        amount,
        lawRef: VALUATION.PRINCIPLE,
        note: "현금은 액면가 = 시가 (§22 금융재산공제 대상 아님)",
      },
    ],
    warnings: amount <= 0 ? ["현금 금액이 0원 — 입력 확인 필요"] : [],
  };
}

// ============================================================
// 금융재산 평가 (§62 — 예금·채권·펀드)
// ============================================================

export function evaluateFinancial(item: EstateItem): PropertyValuationResult {
  if (item.category !== "financial") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateFinancial: 금융재산 자산이 아닙니다.",
    );
  }

  const amount = item.marketValue ?? 0;

  return {
    estateItemId: item.id,
    method: "market_value",
    valuatedAmount: amount,
    breakdown: [
      {
        label: "금융재산 평가액 (잔액·시가)",
        amount,
        lawRef: VALUATION.PRINCIPLE,
      },
    ],
    warnings: amount <= 0 ? ["금융재산 금액이 0원 — 입력 확인 필요"] : [],
  };
}

// ============================================================
// 통합 평가 디스패처 — 자산 종류에 따라 적합한 함수 호출
// ============================================================

export function evaluateEstateItem(item: EstateItem): PropertyValuationResult {
  switch (item.category) {
    case "real_estate_land":
      return evaluateLand(item);
    case "real_estate_apartment":
      return evaluateApartment(item);
    case "real_estate_building":
      return evaluateDetachedHouse(item);
    case "cash":
      return evaluateCash(item);
    case "financial":
      return evaluateFinancial(item);
    case "deposit":
      return evaluateRentalConversion(item);
    case "listed_stock":
    case "unlisted_stock":
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "주식 평가는 property-valuation-stock.ts를 사용하세요.",
      );
    default:
      // other — 시가 그대로 사용
      return {
        estateItemId: item.id,
        method: "market_value",
        valuatedAmount: item.marketValue ?? 0,
        breakdown: [
          { label: "기타재산 평가액", amount: item.marketValue ?? 0, lawRef: VALUATION.INTANGIBLE },
        ],
        warnings: ["기타재산 — 유형에 맞는 평가 방법 세무사 확인 권장"],
      };
  }
}

/**
 * 전체 상속·증여 재산 일괄 평가
 * 주식 항목은 포함하지 않음 (property-valuation-stock.ts로 처리)
 */
export function evaluateAllEstateItems(
  items: EstateItem[],
): PropertyValuationResult[] {
  return items
    .filter((i) => i.category !== "listed_stock" && i.category !== "unlisted_stock")
    .map((i) => evaluateEstateItem(i));
}
