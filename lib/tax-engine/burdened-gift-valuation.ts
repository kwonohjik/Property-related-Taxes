/**
 * 부담부증여 — **평가·비율 헬퍼** (상증법 §60~§66 · 소령 §159 · §163⑥).
 *
 * `burdened-gift-apportionment.ts` 800줄 정책 분리(2026-08-07 W-6). **로직 무변경 이전**이다.
 * 오케스트레이터(`buildBurdenedGiftBreakdown`)가 쓰는 순수 계산만 모았다.
 *
 * ⚠️ 기존 import 경로 호환을 위해 `burdened-gift-apportionment.ts`가 전부 **재수출**한다
 *    (메모리 `feedback_800line_split_export_preservation`).
 */

import {
  ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23,
  REGISTERED_ESTIMATED_DEDUCTION_RATE,
  UNREGISTERED_ESTIMATED_DEDUCTION_RATE,
} from "./legal-codes/burdened-gift";
import {
  safeMultiplyThenDivide,
  applyRate,
  applyRatio,
  computeEstimatedDeduction,
} from "./tax-utils";
import type {
  BurdenedGiftInfo,
  TransferBurdenedGiftBreakdown,
} from "./types/transfer-burdened-gift.types";

// ============================================================
// 공유지분 스케일 (소령 §159 — A·C는 증여 대상 재산의 값)
// ============================================================

/**
 * 공유지분 부담부증여 — **시스템이 물건 전체(100%)로 들고 있는 평가액**을 지분분으로 축소.
 *
 * ## 왜 필요한가
 *
 * 소령 §159①(KoreanLaw 실측 mst=286211): `취득가액 = A × B/C` · `양도가액 = A × B/C`.
 * **A(§97①1호 가액 / 상증법 §60~66 평가액)와 C(증여가액)는 모두 "증여 대상 재산"의 값**이므로
 * 증여 대상이 1/2 지분이면 A·C 모두 지분분이다. **B(채무액)만 절대금액**이다.
 *
 * A와 C가 함께 축소되면 산식은 **스케일 불변**이라 결과가 같다 — 이것이 지분 미인지 상태에서도
 * 대부분 정답이 나오던 이유다. 상쇄가 깨지는 지점은 **C = max(보충적, 담보, 임대)** 의
 * 담보·임대 항이 **절대금액**이라 지분에 따라 줄지 않는다는 것이다. C가 채무액으로 결정되면
 * A만 100% 스케일로 남아 약분되지 않고 **취득가액 과대 → 과소과세**가 된다.
 *
 * ## 스케일하지 않는 것
 *
 * `lendingDepositTotal`·`mortgageDebtAmount`·`annualRentTotal`·`mortgageSetAmount`는
 * **사용자가 해당 지분의 인수분을 입력**한다. 엔진이 물건 전체 채무를 ×ratio로 쪼개면
 * **자동 안분 fallback**이 되어 정책 위반이다(`feedback_no_silent_apportion_fallback`).
 * 인수채무는 계약으로 정해지는 금액이지 지분율로 파생되는 값이 아니다.
 *
 * `capitalExpenditure`·`transferExpense`도 제외 — `transfer-tax-api.ts`에서 **이미**
 * `applyRatio` 적용되어 도달한다(이중 적용 금지).
 *
 * ## 절사
 *
 * 성분별 **독립 floor**(`applyRatio` = `Math.floor(v × ratio)`). 잔액 흡수는 PR #845에서
 * 논파되어 규약에서 제외됐다(소득세법 §100② "각각 구분하여 기장"). 재도입 금지.
 */
export function scaleBurdenedGiftInfo(
  info: BurdenedGiftInfo,
  ownershipRatio?: number,
): BurdenedGiftInfo {
  if (ownershipRatio === undefined || ownershipRatio >= 1 || ownershipRatio <= 0) return info;
  const s = (v: number | undefined) => (v === undefined ? undefined : applyRatio(v, ownershipRatio));
  return {
    ...info,
    // 기준시가 4 (양도·취득 × 토지·건물)
    landStdPriceAtTransfer: applyRatio(info.landStdPriceAtTransfer, ownershipRatio),
    buildingStdPriceAtTransfer: applyRatio(info.buildingStdPriceAtTransfer, ownershipRatio),
    landStdPriceAtAcquisition: applyRatio(info.landStdPriceAtAcquisition, ownershipRatio),
    buildingStdPriceAtAcquisition: applyRatio(info.buildingStdPriceAtAcquisition, ownershipRatio),
    // 증여세 평가용 건물 기준시가 (상증법 §61 층별 가감율)
    giftBuildingStdPriceAtTransfer: s(info.giftBuildingStdPriceAtTransfer),
    // 시가 모드 2
    marketValueAtTransfer: s(info.marketValueAtTransfer),
    marketValueAtAcquisition: s(info.marketValueAtAcquisition),
    // K-4 실지취득가액 3
    actualLandAcquisitionPrice: s(info.actualLandAcquisitionPrice),
    actualBuildingAcquisitionPrice: s(info.actualBuildingAcquisitionPrice),
    actualAcquisitionTotal: s(info.actualAcquisitionTotal),
  };
}

// ============================================================
// 상증법 §60~§66 Max 평가 산정
// ============================================================

/**
 * 담보평가의 (근)저당 항 — 상증령 §63①3호 + §63② 전단.
 *
 * - **§63①3호**: 근저당권이 설정된 재산의 가액 = "평가기준일 현재 당해 재산이 담보하는 **채권액**".
 *   즉 원칙은 **설정액(채권최고액)이 아니라 실제 채권액**이다.
 * - **§63② 전단**: 채권최고액이 담보채권액보다 **적은** 경우에만 채권최고액으로 한다.
 *   ⇒ 두 조항의 결합은 `min(채권최고액, 채권액)` — 담보로 잡힌 금액의 상한이 최고액이라는 취지.
 *
 * ⚠️ **구법 드리프트 주의**(2026-07-28 정정): 구 상속세법 시행령 §5의2 3호는 근저당을
 * **채권최고액**으로 평가하도록 규정했고, 그 시기의 조세심판례(국심1997부0752 등 1989~1997년)가
 * 다수 검색된다. 현행 상증령 §63①3호는 **채권액**으로 개정돼 있으므로 그 심판례를 현행 근거로
 * 인용하면 안 된다. 종전 구현은 `mortgageSetAmount ?? mortgageDebtAmount`로 **설정액을 무조건
 * 우선**해 구법 규칙을 적용했다 — 설정액이 통상 채권액의 120%이므로 증여가액 C가 과대평가되고,
 * §159의 채무비율 B/C가 작아져 취득가액이 줄고 **양도차익이 과대**해지는(납세자 불리) 방향이었다.
 * (memory `feedback_no_unfavorable_application_without_legal_basis`)
 *
 * @param info 보증금·차입금·설정액 입력.
 * @returns 임대보증금 + min(채권최고액, 담보채권액).
 *          합산 구조의 근거는 §63② 후단 — "동일한 재산이 다수의 채권(전세금채권과 임차보증금채권을
 *          포함한다)의 담보로 되어 있는 경우에는 그 재산이 담보하는 채권액의 **합계액**으로 한다".
 */
export function computeMortgageValuation(info: BurdenedGiftInfo): number {
  const securedClaim =
    info.mortgageSetAmount === undefined
      ? info.mortgageDebtAmount
      : Math.min(info.mortgageSetAmount, info.mortgageDebtAmount);
  return info.lendingDepositTotal + securedClaim;
}

/**
 * 상증법 §60~§66 증여재산 평가 Max 산정.
 *
 * @param landStdPriceAtTransfer  양도시 토지 기준시가 (개별공시지가 × 면적). 시가 모드에서도 입력 가능 (보충적 비교용).
 * @param buildingStdPriceAtTransfer 양도시 건물 기준시가 합계.
 * @param info BurdenedGiftInfo (보증금·임대료·차입금·시가 입력).
 *
 * @returns supplementary/mortgage/rental + selectedMode + max.
 */
export function computeSangjeungbeopValuation(
  landStdPriceAtTransfer: number,
  buildingStdPriceAtTransfer: number,
  info: BurdenedGiftInfo,
): TransferBurdenedGiftBreakdown["sangjeungbeopValuation"] {
  // ① 보충적평가 (상증법 §61): 자산별 기준시가 합계.
  // 시가 모드에서는 marketValueAtTransfer로 대체 (상증법 §60②~④).
  const supplementary =
    info.valuationMode === "sangjeungbeop_market"
      ? (info.marketValueAtTransfer ?? 0)
      : landStdPriceAtTransfer + buildingStdPriceAtTransfer;

  // ② 담보평가 (상증법 §66 · 상증령 §63):
  //   = 임대보증금 + min(채권최고액, 담보채권액). 상세 근거는 computeMortgageValuation 주석.
  const mortgage = computeMortgageValuation(info);

  // ③ 임대평가 (상증법 §61⑤·시행령 §50⑦):
  //   = 임대보증금 + (연간 임대료 / 12%)  [2009.4.23. 이후 시행분]
  //   safeMultiplyThenDivide 사용: annualRent × 1 ÷ 0.12 == annualRent / 0.12. 부동소수 회피.
  const rentalCapitalized =
    info.annualRentTotal === 0
      ? 0
      : Math.floor(info.annualRentTotal / ANNUAL_RENT_CAPITALIZATION_RATE_AFTER_2009_04_23);
  const rental = info.lendingDepositTotal + rentalCapitalized;

  // Max 채택
  let selectedMode: "supplementary" | "mortgage" | "rental" = "supplementary";
  let max = supplementary;
  if (mortgage > max) {
    max = mortgage;
    selectedMode = "mortgage";
  }
  if (rental > max) {
    max = rental;
    selectedMode = "rental";
  }

  return { supplementary, mortgage, rental, selectedMode, max };
}

// ============================================================
// 채무비율 산정 (소령 §159 — B / C)
// ============================================================

/**
 * 채무비율 = 인수채무 / 증여가액 = (임대보증금 + 담보차입금) / Max 평가액.
 *
 * @returns { assumedDebtAmount, debtRatio }
 */
export function computeDebtRatio(
  info: BurdenedGiftInfo,
  sangjeungbeopMax: number,
): { assumedDebtAmount: number; debtRatio: number } {
  // 컴패니언(다른 물건) 함께 부담부증여 — §159①의 B는 **신고 단위**이므로 ④가
  // Bᵢ = B × Aᵢ/ΣA로 재배분한 값을 싣는다. 평가(A)는 원 입력 채무로 이미 확정됐고
  // 여기서만 B를 갈아끼우므로 자기참조가 없다. 상세: 타입 주석 `assumedDebtOverride`.
  const assumedDebtAmount =
    info.assumedDebtOverride ?? info.lendingDepositTotal + info.mortgageDebtAmount;
  if (sangjeungbeopMax === 0) {
    return { assumedDebtAmount, debtRatio: 0 };
  }
  // 부동소수 비율 — anchor에서는 toBeCloseTo로 비교. 자산별 안분은 safeMultiplyThenDivide로 정수 보존.
  const debtRatio = assumedDebtAmount / sangjeungbeopMax;
  return { assumedDebtAmount, debtRatio };
}

// ============================================================
// 자산별 양도가액 안분 (소령 §159 ① 2호)
// ============================================================

/**
 * 자산별 양도가액 = 자산별 평가가액 × 채무비율.
 *
 * 정수 보존을 위해 안분식은 safeMultiplyThenDivide(평가가액, 채무액, max) 사용 —
 * 부동소수 곱셈 회피.
 */
export function apportionTransferPrice(
  assetSangjeungbeopValue: number,
  assumedDebtAmount: number,
  sangjeungbeopMax: number,
): number {
  return safeMultiplyThenDivide(assetSangjeungbeopValue, assumedDebtAmount, sangjeungbeopMax);
}

// ============================================================
// 자산별 취득가액 안분 (소령 §159 ① 1호)
// ============================================================

/**
 * 기준시가 모드에서 자산별 취득가액 = 취득시 자산 기준시가 × 채무비율.
 *
 * 소령 §159 ① 1호 A 괄호: 양도가액을 상증법 §61①·②·⑤·§66에 따라 기준시가로 산정한 경우
 * → 취득가액도 기준시가로 산정.
 *
 * 시가 모드(sangjeungbeop_market)에서는 별도 산식 — 사용자가 marketValueAtAcquisition을 총액으로 입력하므로
 * 자산별 분리 필요 시 v2에서 별도 anchor (Phase 1은 토지·건물 합계만으로 처리하고
 * 자산별 비율은 양도시 시가 비율을 그대로 사용).
 */
export function apportionAcquisitionPrice(
  assetStdPriceAtAcquisition: number,
  assumedDebtAmount: number,
  sangjeungbeopMax: number,
): number {
  return safeMultiplyThenDivide(assetStdPriceAtAcquisition, assumedDebtAmount, sangjeungbeopMax);
}

// ============================================================
// 자산별 개산공제 (소령 §163 ⑥)
// ============================================================

/**
 * 안분된 **취득당시 기준시가** × 개산공제율 (소령 §163⑥1호·2호가목).
 *   등기: 3% · 미등기양도자산(§104③): 0.3% (단서 "미등기 3/1000"). (H-25)
 *
 * 계산 본체는 `tax-utils.ts`의 `computeEstimatedDeduction` 단일 소스에 위임한다 —
 * 같은 §163⑥ 개념 함수가 둘이면 드리프트한다(feedback_ui_engine_dual_truth_avoidance).
 * 부담부증여 경로는 지분 미인지(경로 전체가 그렇다)이므로 `ownershipRatio`를 넘기지 않는다.
 *
 * ⚠️ 종전 파라미터명 `assetAcquisitionPrice`는 **오칭**이었다 — 실제 base는 취득가액이 아니라
 *    §159 채무비율로 안분된 **기준시가**다(호출부 `landStdApportioned` 참조).
 */
export function estimatedDeductionForBurdenedGift(
  standardPriceApportioned: number,
  isUnregistered = false,
): number {
  const rate = isUnregistered
    ? UNREGISTERED_ESTIMATED_DEDUCTION_RATE
    : REGISTERED_ESTIMATED_DEDUCTION_RATE;
  return computeEstimatedDeduction(standardPriceApportioned, rate);
}
