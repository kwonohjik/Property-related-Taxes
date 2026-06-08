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
  CalculationStep,
} from "./types/inheritance-gift.types";
import { evaluateUnlistedStockV2 } from "./property-valuation/unlisted-orchestrator";
// listed_stock / V1 간편 비상장(unlistedStockData) 평가 단일 진실.
// resolve-estate-item-value.ts는 property-valuation.ts를 import하지 않으므로 순환 없음(단방향).
import {
  computeStockValuation,
  resolveEstateItemValue,
  resolveUnlistedDisplayMode,
} from "./valuation/resolve-estate-item-value";

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
 * 평가방식 단일 도출 (§60·시행령 §49②④) — 입력 금액에서 평가방법 파생.
 * 우선순위: 시가(매매·수용·경매) > 감정가 > 유사매매사례가액 > 보충적 평가.
 *   - market·appraised(해당 재산 직접 시가)는 §49①상 동순위이나, 본 엔진은 매매 우선 tie-break(D-4).
 *     §49② "평가기준일에 가장 가까운 날" 규칙은 평가일 입력 부재로 미반영(설계 동결 한계).
 *   - similar_sales(유사매매사례)는 §49④ "시가로 본다"이나 §49② 단서로 해당 재산 시가 있으면 배제
 *     → if-chain상 market/appraised에서 먼저 return되어 자연 후순위.
 * UI 평가방식 라디오 삭제(2026-06-08) 후 valuationMethod·부표2코드·감정수수료 판정의 단일 진실.
 */
export function resolveValuationMethod(item: EstateItem): ValuationMethod {
  if (item.marketValue != null && item.marketValue > 0) return "market_value";
  if (item.appraisedValue != null && item.appraisedValue > 0) return "appraisal";
  if (item.similarSalesValue != null && item.similarSalesValue > 0) return "similar_sales";
  if (item.standardPrice != null && item.standardPrice > 0) return "standard_price";
  return "standard_price";
}

/**
 * 시가 우선 원칙으로 평가액 및 방법 결정 (§60) — resolveValuationMethod 단일 진실 사용.
 */
function resolveValuationAmount(item: EstateItem): {
  amount: number;
  method: ValuationMethod;
} {
  const method = resolveValuationMethod(item);
  const amount =
    method === "market_value"
      ? (item.marketValue ?? 0)
      : method === "appraisal"
        ? (item.appraisedValue ?? 0)
        : method === "similar_sales"
          ? (item.similarSalesValue ?? 0)
          : (item.standardPrice ?? 0);
  return { amount, method };
}

/**
 * §61⑤·시행령 §50⑦·시행규칙 §15의2 — 임대 부동산 임대료환산가액.
 * 환산가액 = (월 임대료 × 12 ÷ 12%) + 임대보증금. 월세 미입력 시 0(미적용).
 * convertLeaseToValue(보증금 자본환원 별도 용도)와 다른 산식 — 혼동 금지.
 */
function calcRentalConversionValue(item: EstateItem): number {
  const monthly = item.monthlyRent ?? 0;
  if (monthly <= 0) return 0;
  return Math.floor((monthly * 12) / LEASE_CONVERSION_RATE) + (item.leaseDeposit ?? 0);
}

/**
 * §66·시행령 §63 — 저당권 등이 설정된 재산 평가 특례.
 * §60 평가액(보충평가 시 §61⑤ 임대료환산가액과 MAX) 과 "그 재산이 담보하는 채권액"
 * (§63② — 저당[신용보증액 차감] + 전세/임대보증금 합산) 중 **큰 금액**(MAX). 차감이 아니라 하한.
 *   - ㉱ 임대료환산: method==="standard_price"(보충평가) 케이스만 (§61⑤은 §61①~④ 보충평가와 비교).
 *   - ㉲ 신용보증 차감: 저당분(§66 1호)에서만, 음수 가드 (시행령 §63②).
 * 담보채무 자체는 별도로 §14 부채로 공제한다.
 */
function applyCollateralFloor(
  amount: number,
  item: EstateItem,
  method: ValuationMethod,
): { valuatedAmount: number; securedClaim: number; raised: boolean; rentalRaised: boolean } {
  // ㉱ 임대료환산가액 — 보충평가 케이스만 (§61⑤)
  let baseAmount = amount;
  let rentalRaised = false;
  if (method === "standard_price") {
    const rentalValue = calcRentalConversionValue(item);
    if (rentalValue > amount) {
      baseAmount = rentalValue;
      rentalRaised = true;
    }
  }
  // ㉲ 신용보증 차감 — 저당분(§66 1호)만, 음수 가드 (§63②)
  const mortgageNet = Math.max(0, (item.mortgageAmount ?? 0) - (item.creditGuaranteeAmount ?? 0));
  const securedClaim = mortgageNet + (item.leaseDeposit ?? 0);
  const valuatedAmount = Math.max(baseAmount, securedClaim);
  return { valuatedAmount, securedClaim, raised: valuatedAmount > baseAmount, rentalRaised };
}

/** §61⑤ 임대료환산·§63② 신용보증 차감 breakdown 행 (4 평가 함수 공통, raised 행 앞에 삽입) */
function extraCollateralRows(
  item: EstateItem,
  valuatedAmount: number,
  rentalRaised: boolean,
): CalculationStep[] {
  const rows: CalculationStep[] = [];
  if (rentalRaised) {
    rows.push({ label: "§61⑤ 임대료환산가액 적용", amount: valuatedAmount, lawRef: VALUATION.RENTAL_CONVERSION });
  }
  const cg = item.creditGuaranteeAmount ?? 0;
  if (cg > 0) {
    rows.push({ label: "§63② 신용보증기관 보증액 차감", amount: -cg, lawRef: VALUATION.COLLATERAL_SPECIAL });
  }
  return rows;
}

/** 담보채무는 평가에서 차감하지 않으므로 채무공제(§14) 입력을 안내 (Phase 1 — 자동반영 전) */
const COLLATERAL_DEBT_NOTICE =
  "저당권 등 담보채무는 평가액에서 차감되지 않습니다 — 채무로서 부채 명세(§14)에 입력해야 과세가액에서 공제됩니다.";

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
  const { valuatedAmount, securedClaim, raised, rentalRaised } = applyCollateralFloor(amount, item, method);

  return {
    estateItemId: item.id,
    method,
    valuatedAmount,
    breakdown: [
      { label: "토지 평가액", amount, lawRef: VALUATION.REAL_ESTATE_SUPP },
      ...extraCollateralRows(item, valuatedAmount, rentalRaised),
      ...(raised
        ? [{ label: "§66 담보채권액 하한 적용", amount: valuatedAmount, lawRef: VALUATION.COLLATERAL_SPECIAL }]
        : []),
      { label: "평가액", amount: valuatedAmount },
    ],
    warnings: [
      ...(method === "standard_price" ? ["개별공시지가 기준 보충적 평가 적용 — 시가 확인 권장"] : []),
      ...(securedClaim > 0 ? [COLLATERAL_DEBT_NOTICE] : []),
    ],
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
  const { valuatedAmount, securedClaim, raised, rentalRaised } = applyCollateralFloor(amount, item, method);

  const warnings: string[] = [];
  if (method === "standard_price") {
    warnings.push("공동주택 기준시가 보충적 평가 — 실거래가 확인 권장");
  }
  if (securedClaim > 0) {
    warnings.push(COLLATERAL_DEBT_NOTICE);
  }

  return {
    estateItemId: item.id,
    method,
    valuatedAmount,
    breakdown: [
      { label: "아파트 평가액", amount, lawRef: VALUATION.PRINCIPLE },
      ...extraCollateralRows(item, valuatedAmount, rentalRaised),
      ...(raised
        ? [{ label: "§66·§63② 담보채권액(저당+임대보증금) 하한 적용", amount: valuatedAmount, lawRef: VALUATION.COLLATERAL_SPECIAL }]
        : []),
      { label: "평가액", amount: valuatedAmount },
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
  const { valuatedAmount, securedClaim, raised, rentalRaised } = applyCollateralFloor(amount, item, method);

  return {
    estateItemId: item.id,
    method,
    valuatedAmount,
    breakdown: [
      { label: "단독주택 평가액", amount, lawRef: VALUATION.REAL_ESTATE_SUPP },
      ...extraCollateralRows(item, valuatedAmount, rentalRaised),
      ...(raised
        ? [{ label: "§66·§63② 담보채권액(저당+임대보증금) 하한 적용", amount: valuatedAmount, lawRef: VALUATION.COLLATERAL_SPECIAL }]
        : []),
      { label: "평가액", amount: valuatedAmount },
    ],
    warnings: [
      ...(method === "standard_price" ? ["개별주택가격 보충적 평가 — 시가 확인 권장"] : []),
      ...(securedClaim > 0 ? [COLLATERAL_DEBT_NOTICE] : []),
    ],
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
  const { valuatedAmount, securedClaim, raised, rentalRaised } = applyCollateralFloor(amount, item, method);

  return {
    estateItemId: item.id,
    method,
    valuatedAmount,
    breakdown: [
      { label: "건물 평가액", amount, lawRef: VALUATION.REAL_ESTATE_SUPP },
      ...extraCollateralRows(item, valuatedAmount, rentalRaised),
      ...(raised
        ? [{ label: "§66 담보채권액 하한 적용", amount: valuatedAmount, lawRef: VALUATION.COLLATERAL_SPECIAL }]
        : []),
      { label: "평가액", amount: valuatedAmount },
    ],
    warnings: [
      ...(method === "standard_price" ? ["건물 기준시가 보충적 평가 — 감정평가 고려 권장"] : []),
      ...(securedClaim > 0 ? [COLLATERAL_DEBT_NOTICE] : []),
    ],
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
 *
 * 모든 자산을 평가에 포함한다 (이전: listed_stock·V1 간편 비상장주식을 배제 → grossEstate 누락 버그).
 * 라우팅:
 *   - 비상장주식 V2 입력(unlistedStockValuationV2) → 상세 어댑터 (Phase 5-A).
 *   - listed_stock / V1 간편 비상장(unlistedStockData) → evaluateStockAsPropertyResult (computeStockValuation 단일 진실).
 *   - 그 외(부동산·금융·임대차 등) → evaluateEstateItem.
 * ⚠️ evaluateEstateItem은 listed_stock/unlisted_stock에 throw하므로 주식은 반드시 위 두 분기로 라우팅.
 */
export function evaluateAllEstateItems(
  items: EstateItem[],
): PropertyValuationResult[] {
  return items.map((i) => {
    // V2 라우팅은 mode==="formal" + V2 객체 동시 충족 시에만 (2026-05-31 fix — dual-truth 차단).
    // 종전: V2 객체 존재만으로 라우팅 → simple mode에서 V2 객체 stale 잔류 시 V1 산식 무시되어
    // computeStockValuation(resolveUnlistedDisplayMode 통과·V1=500m)과 evaluateAllEstateItems(V2=400m)
    // 사이 dual-truth 발생. resolveUnlistedDisplayMode 단일 진실 통일로 3경로 정합.
    if (
      i.category === "unlisted_stock" &&
      resolveUnlistedDisplayMode(i) === "formal" &&
      i.unlistedStockValuationV2
    ) {
      return evaluateUnlistedStockV2AsPropertyResult(i);
    }
    if (i.category === "listed_stock" || i.category === "unlisted_stock") {
      return evaluateStockAsPropertyResult(i);
    }
    return evaluateEstateItem(i);
  });
}

/**
 * 엔진 권위 평가액(valuatedAmount) 단일 진실 헬퍼 (T2 — R1 dual-truth 제거).
 *
 * `resolveEstateItemValue`(§60 우선순위만)와 달리 §66 담보채권 하한(`max(평가, securedClaim)`)·
 * 주식 라우팅을 **엔진과 동일하게** 반영한다. 검증(`validateEstateItemAllocations`)·
 * 집계표 표시(source-summary)가 이 함수를 단일 진실로 사용해 합계열↔인별열 기준을 통일.
 *
 * ⚠️ `evaluateEstateItem`은 주식에 throw → 반드시 `evaluateAllEstateItems` 경유(주식 라우팅 포함).
 */
export function resolveEngineValuatedAmount(item: EstateItem): number {
  return evaluateAllEstateItems([item])[0]?.valuatedAmount ?? 0;
}

/**
 * listed_stock / V1 간편 비상장(unlistedStockData) → PropertyValuationResult 어댑터.
 *
 * 평가액은 §60 단일 진실 resolveEstateItemValue에 위임 (1-A 수정):
 *   1순위: marketValue (시가 — 매매사례가·감정가·수용가·경매가)
 *   2순위: appraisedValue (감정가)
 *   3순위: standardPrice (기준시가)
 *   4순위: computeStockValuation (주식 보충평가 — §63 2개월 평균 또는 §54 순손익·순자산)
 *
 * 수정 전(Bug #1): computeStockValuation 단독 → 명시 시가·감정·기준시가 무시 → 법령 §60 위반.
 * 수정 후: resolveEstateItemValue → 4경로(엔진·validate·UI·문서상) 단일 진실 통일.
 *
 * 범위: 상장(listed_stock) + V1 간편 비상장(unlisted_stock, unlistedValuationMode="simple").
 * V2 비상장은 evaluateAllEstateItems(:373)에서 이미 별도 라우팅 — 본 함수 미호출.
 *
 * ⚠️ breakdown.method 보정:
 *   - marketValue 사용 시: "market_value"
 *   - appraisedValue 사용 시: "appraisal"
 *   - standardPrice 사용 시: "standard_price"
 *   - computeStockValuation fallback: 기존 method 유지 (상장="market_value", V1="book_value")
 */
function evaluateStockAsPropertyResult(item: EstateItem): PropertyValuationResult {
  // §60 우선순위: 명시 평가액 → 주식 보충평가 fallback
  const amount = resolveEstateItemValue(item);
  const isListed = item.category === "listed_stock";

  // method: 어느 경로로 평가했는지 정확히 반영
  let method: ValuationMethod;
  let label: string;
  if (typeof item.marketValue === "number" && item.marketValue > 0) {
    method = "market_value";
    label = isListed ? "상장주식 시가 (명시)" : "비상장주식 시가 (명시)";
  } else if (typeof item.appraisedValue === "number" && item.appraisedValue > 0) {
    method = "appraisal";
    label = isListed ? "상장주식 감정가액" : "비상장주식 감정가액";
  } else if (typeof item.standardPrice === "number" && item.standardPrice > 0) {
    method = "standard_price";
    label = isListed ? "상장주식 기준시가" : "비상장주식 기준시가";
  } else {
    // 주식 보충평가 fallback (§63 2개월 평균 또는 §54 순손익·순자산)
    method = (isListed ? "market_value" : "book_value") as ValuationMethod;
    label = isListed ? "상장주식 평가액" : "비상장주식 평가액(간편)";
  }

  return {
    estateItemId: item.id,
    method,
    valuatedAmount: amount,
    breakdown: [
      {
        label,
        amount,
        lawRef: isListed ? VALUATION.LISTED_STOCK : VALUATION.UNLISTED_FORMULA,
      },
    ],
    warnings:
      amount === 0
        ? ["주식 평가액 0 — 입력(주식 수·시세 또는 순손익·순자산가치)을 확인하세요."]
        : [],
  };
}

/**
 * V2 평가 결과 → PropertyValuationResult 어댑터 (Phase 5-A)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 * Engine: lib/tax-engine/property-valuation/unlisted-orchestrator.ts
 */
function evaluateUnlistedStockV2AsPropertyResult(
  item: EstateItem,
): PropertyValuationResult {
  if (!item.unlistedStockValuationV2) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateUnlistedStockV2AsPropertyResult: unlistedStockValuationV2 필요",
    );
  }
  const v2 = evaluateUnlistedStockV2(item.unlistedStockValuationV2);
  return {
    estateItemId: item.id,
    method: "book_value" as ValuationMethod,
    valuatedAmount: v2.totalValuation,
    breakdown: [
      {
        label: "1주당 순자산가치 ④",
        amount: v2.netAssetPerShare,
        lawRef: VALUATION.UNLISTED_FORMULA,
      },
      {
        label: "1주당 순손익가치 ⑤",
        amount: v2.netIncomePerShare,
        lawRef: VALUATION.UNLISTED_NET_INCOME_FORMULA,
      },
      {
        label: "1주당 평가액 ⑥",
        amount: v2.finalPerShareValue,
        lawRef: VALUATION.UNLISTED_FORMULA,
        note: v2.netAssetFloorApplied ? "80% 하한 발동" : "가중평균 본칙",
      },
      ...(v2.goodwillCalculation.goodwillFinal > 0
        ? [
            {
              label: "영업권 평가액",
              amount: v2.goodwillCalculation.goodwillFinal,
              lawRef: VALUATION.GOODWILL_FORMULA,
            },
          ]
        : []),
      ...(v2.premiumRate > 0
        ? [
            {
              label: `최대주주 할증평가 ×${(1 + v2.premiumRate) * 100}%`,
              amount: v2.premiumPerShare,
              lawRef: VALUATION.MAX_SHAREHOLDER_PREMIUM,
            },
          ]
        : []),
      {
        label: "보유 주식수",
        amount: item.unlistedStockValuationV2.ownedShares,
        note: "주",
      },
      {
        label: "비상장주식 V2 평가액",
        amount: v2.totalValuation,
        lawRef: VALUATION.UNLISTED_STOCK,
      },
    ],
    warnings: v2.warnings,
  };
}
