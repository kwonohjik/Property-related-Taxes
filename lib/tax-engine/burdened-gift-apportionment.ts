/**
 * 부담부증여(Burdened Gift) — 양도세 자산별 안분 모듈.
 *
 * 법령 근거:
 *   - 소득세법 §88 ① 1호 후단 (양도 정의 — 채무인수분)
 *   - 소득세법 §95 ② 표1 + §95 ④ 본문 (보유기간 — 양도자=증여자 본인)
 *   - 소득세법 시행령 §159 (양도차익 계산)
 *   - 소득세법 시행령 §163 ⑥ (개산공제 3%)
 *   - 상증법 §60~§66 (증여재산 평가 — Max 보충적·담보·임대)
 *   - 상증법 시행령 §50 ⑦ (임대료 환산가액 12%)
 *
 * 양도자 = 증여자 본인이므로 소득세법 §97의2(이월과세) 미적용.
 *
 * Phase 1 가드: propertyType === "general_building" 전용. 1세대1주택(장특공률표 §95② 표2)은 Phase 3.
 *
 * 수학적 동치 주의:
 *   부담부증여 §159 ① 1호 (acq = stdPriceAtAcq × debtRatio)
 *   ≡ 환산취득가 §114 ⑦ (acq = transferPrice × stdPriceAtAcq / stdPriceAtTransfer)
 *   결과는 같으나 법적 근거 조문이 다르므로 코드 경로 분리 유지.
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
  calculateEstimatedAcquisitionPrice,
} from "./tax-utils";
import { calcGiftTax } from "./gift-tax";
import type {
  BurdenedGiftInfo,
  TransferBurdenedGiftBreakdown,
} from "./types/transfer-burdened-gift.types";
import { format } from "date-fns";

// ── 800줄 정책 분리(2026-08-07 W-6) — 기존 import 경로 유지용 재수출 ──
import {
  scaleBurdenedGiftInfo,
  computeSangjeungbeopValuation,
  computeDebtRatio,
  apportionTransferPrice,
  apportionAcquisitionPrice,
  estimatedDeductionForBurdenedGift,
} from "./burdened-gift-valuation";

export {
  scaleBurdenedGiftInfo,
  computeMortgageValuation,
  computeSangjeungbeopValuation,
  computeDebtRatio,
  apportionTransferPrice,
  apportionAcquisitionPrice,
  estimatedDeductionForBurdenedGift,
} from "./burdened-gift-valuation";
export {
  assertBurdenedGiftEligible,
  detectBurdenedGiftMultiHouseWarning,
} from "./burdened-gift-eligibility";


// ============================================================
// 전체 자산-수준 분기 (orchestrator용)
// ============================================================

/**
 * 부담부증여 모드에서 토지·건물 자산-수준 양도가액·취득가액·개산공제를 한번에 산출.
 *
 * @param params.landStdPriceAtTransfer   양도시 토지 기준시가 (개별공시지가 × 면적).
 * @param params.buildingStdPriceAtTransfer 양도시 건물 기준시가 합계.
 * @param params.landStdPriceAtAcquisition  취득시 토지 기준시가.
 * @param params.buildingStdPriceAtAcquisition 취득시 건물 기준시가 합계.
 * @param params.info BurdenedGiftInfo.
 *
 * @returns TransferBurdenedGiftBreakdown — 자산-수준 분기·Phase 2 연결 export 포함.
 */
export function buildBurdenedGiftBreakdown(params: {
  landStdPriceAtTransfer: number;
  buildingStdPriceAtTransfer: number;
  landStdPriceAtAcquisition: number;
  buildingStdPriceAtAcquisition: number;
  info: BurdenedGiftInfo;
  /** 증여일(= 양도일). Phase 2 증여세 호출용. 미제공 시 증여세 계산 생략. */
  giftDate?: Date;
  /** K-4 실지취득가 경로 필요경비 — 자본적지출(§163③). 채무비율 안분 후 estimatedDeduction 슬롯에 반영. */
  capitalExpenditure?: number;
  /** K-4 실지취득가 경로 필요경비 — 양도비(§163⑤). */
  transferExpense?: number;
  /** §104③ 미등기양도자산 — 개산공제율 0.3% 적용(소령 §163⑥1호 단서). 기본 false=등기(3%). (H-25) */
  isUnregistered?: boolean;
  /**
   * 공유지분율(0<r<1). §159의 A·C를 지분분으로 축소한다 — `scaleBurdenedGiftInfo` 참조.
   * 미전달·1.0이면 완전 무변경(단독 소유).
   */
  ownershipRatio?: number;
}): TransferBurdenedGiftBreakdown {
  const { info: rawInfo, isUnregistered = false, ownershipRatio } = params;

  // 지분 축소는 **여기 한 곳**에서만 한다 — 이하 로직은 이미 지분분이 된 값을 그대로 쓴다.
  // params의 기준시가 4필드는 info와 동일 소스(step 배선)이므로 스케일된 info에서 되읽는다.
  const info = scaleBurdenedGiftInfo(rawInfo, ownershipRatio);
  const landStdPriceAtTransfer = info.landStdPriceAtTransfer;
  const buildingStdPriceAtTransfer = info.buildingStdPriceAtTransfer;
  const landStdPriceAtAcquisition = info.landStdPriceAtAcquisition;
  const buildingStdPriceAtAcquisition = info.buildingStdPriceAtAcquisition;

  // 12억 고가주택 판정 분모용 — **물건 전체(100%)** 보충적평가액.
  // §89 12억은 물건 전체 가액 기준이다(A4/#849). 지분분 C를 쓰면 문턱이 1/지분율만큼 올라
  // 24억 물건의 1/2 지분이 비과세로 빠진다. max가 아닌 supplementary인 이유는 담보·임대
  // 평가항이 **지분 인수분**이라 물건 전체 스케일로 되돌릴 수 없기 때문(역산 = 자동 안분).
  const wholePropertySupplementary =
    rawInfo.valuationMode === "sangjeungbeop_market"
      ? (rawInfo.marketValueAtTransfer ?? 0)
      : rawInfo.landStdPriceAtTransfer + rawInfo.buildingStdPriceAtTransfer;

  // STEP 1a: 양도세 보충적평가 (양도시 §99 기준시가) — 자산별 양도가액 안분 분모용
  const sangjeungbeopValuation = computeSangjeungbeopValuation(
    landStdPriceAtTransfer,
    buildingStdPriceAtTransfer,
    info,
  );

  // STEP 1b: 증여세 보충적평가 (양도시 §61 기준시가 — 층별 가감율 적용) — 취득가액 안분 분모용
  // 토지는 동일, 건물만 giftBuildingStdPriceAtTransfer (미입력 시 양도세값 fallback).
  const giftBuildingStd =
    info.giftBuildingStdPriceAtTransfer ?? buildingStdPriceAtTransfer;
  const giftValuation = computeSangjeungbeopValuation(
    landStdPriceAtTransfer,
    giftBuildingStd,
    info,
  );

  // STEP 2: 채무비율 — 분모는 증여재산 평가액(giftValuation.max). Excel 정합.
  const { assumedDebtAmount, debtRatio } = computeDebtRatio(info, giftValuation.max);

  // STEP 3: 자산별 양도가액 안분 (소령 §159 ① 2호)
  //
  // §159①2호: 자산별 양도가액 = A(자산별 §60~§66 평가가액) × B(채무액) / C(증여가액)
  // 자산별 합 = (A_land + A_building) × B/C = C × B/C = B 이어야 함.
  //
  // [기준시가 모드 — sangjeungbeop_standard]
  //   mortgage/rental이 선택될 때 C(max) > supplementary(토지+건물 기준시가 합).
  //   A_land = max × (landStd / supplementary), A_building = max × (buildingStd / supplementary).
  //   → 자산별 양도가액 = (max × 자산Std / supplementary) × B / max = 자산Std × B / supplementary.
  //   결론: 분자는 자산별 기준시가, 분모는 supplementary(= 기준시가 합) — max가 아님.
  //   이로써 합 = B 보장.
  //
  //   정수 안분: land = safeMultiplyThenDivide(B, landStd, supplementary),
  //             building = B − land  (floor 잔액 흡수 — feedback_floor_residual_absorption).
  //
  // [시가 모드 — sangjeungbeop_market]
  //   A_land + A_building = marketTotal. C = max ≈ marketTotal (시가 선택 시).
  //   기준시가 비율로 marketTotal 안분 후 분모는 marketTotal — 합 = B 유지.
  let landSangjeungbeopValue: number;
  let buildingSangjeungbeopValue: number;
  let landTransferPrice: number;
  let buildingTransferPrice: number;

  if (info.valuationMode === "sangjeungbeop_standard") {
    landSangjeungbeopValue = landStdPriceAtTransfer;
    buildingSangjeungbeopValue = buildingStdPriceAtTransfer;
    // 분모 = supplementary (기준시가 합). 합 = B 보장.
    // supplementary = 0 방어 (토지+건물 기준시가 모두 0이면 채무비율도 0 → transferPrice = 0).
    const transferDenominator = sangjeungbeopValuation.supplementary;
    if (transferDenominator === 0 || assumedDebtAmount === 0) {
      landTransferPrice = 0;
      buildingTransferPrice = 0;
    } else {
      // floor 안분 + 잔액 흡수: 토지 먼저 floor, 건물은 잔액(합이 정확히 B).
      landTransferPrice = safeMultiplyThenDivide(landStdPriceAtTransfer, assumedDebtAmount, transferDenominator);
      buildingTransferPrice = assumedDebtAmount - landTransferPrice;
    }
  } else {
    // 시가 모드: 자산별 시가 분리 입력은 v2. Phase 1은 기준시가 비율로 시가 안분.
    const totalStd = landStdPriceAtTransfer + buildingStdPriceAtTransfer;
    const marketTotal = info.marketValueAtTransfer ?? 0;
    landSangjeungbeopValue =
      totalStd === 0 ? 0 : safeMultiplyThenDivide(marketTotal, landStdPriceAtTransfer, totalStd);
    buildingSangjeungbeopValue = marketTotal - landSangjeungbeopValue;
    // 시가 모드: 분모는 marketTotal (= 자산 평가가액 합). 합 = B 보장.
    if (marketTotal === 0 || assumedDebtAmount === 0) {
      landTransferPrice = 0;
      buildingTransferPrice = 0;
    } else {
      landTransferPrice = apportionTransferPrice(landSangjeungbeopValue, assumedDebtAmount, marketTotal);
      buildingTransferPrice = assumedDebtAmount - landTransferPrice;
    }
  }

  // STEP 4: 자산별 취득가액 산정 (소령 §159 ① 1호) — 4-way 분기 (§100① 일치 게이트 내재화)
  //   K-1~K-3 (standard):        취득시 기준시가 × 채무비율 (§159①1호 A괄호 강제). 분모 giftValuation.max.
  //   K-4 (market+actual):       실지취득가액 × 채무비율 (§159①1호 본문). 개산공제 미적용.
  //   K-5 (market+converted):    환산취득가액 = 자산별 양도가액 × (취득기준시가 ÷ 양도기준시가) (§176의2②2호). 개산공제 적용.
  //   market+미지정 (legacy):    backward-compat — marketValueAtAcquisition 기반 (개산공제 적용).
  let landAcquisitionPrice: number;
  let buildingAcquisitionPrice: number;
  let acquisitionMethodUsed: TransferBurdenedGiftBreakdown["acquisitionMethodUsed"];
  let landActualAcquisition: number | undefined;
  let buildingActualAcquisition: number | undefined;

  if (info.valuationMode === "sangjeungbeop_standard") {
    // K-1~K-3: 취득시 기준시가 × 채무비율 (A괄호). 분모 giftValuation.max (Excel 정합).
    acquisitionMethodUsed = "standard_price";
    landAcquisitionPrice = apportionAcquisitionPrice(landStdPriceAtAcquisition, assumedDebtAmount, giftValuation.max);
    buildingAcquisitionPrice = apportionAcquisitionPrice(buildingStdPriceAtAcquisition, assumedDebtAmount, giftValuation.max);
  } else if (info.acquisitionMethod === "actual") {
    // K-4: 실지취득가액 × 채무비율 (§159①1호 본문).
    //   자산별 실지취득가 — 토지·건물 분리 입력 우선, 없으면 단일 total을 취득기준시가 비율로 분배.
    acquisitionMethodUsed = "actual";
    if (info.actualLandAcquisitionPrice !== undefined || info.actualBuildingAcquisitionPrice !== undefined) {
      landActualAcquisition = info.actualLandAcquisitionPrice ?? 0;
      buildingActualAcquisition = info.actualBuildingAcquisitionPrice ?? 0;
    } else {
      const totalAcqStd = landStdPriceAtAcquisition + buildingStdPriceAtAcquisition;
      const total = info.actualAcquisitionTotal ?? 0;
      landActualAcquisition = totalAcqStd === 0 ? 0 : safeMultiplyThenDivide(total, landStdPriceAtAcquisition, totalAcqStd);
      buildingActualAcquisition = total - landActualAcquisition;
    }
    landAcquisitionPrice = apportionAcquisitionPrice(landActualAcquisition, assumedDebtAmount, giftValuation.max);
    buildingAcquisitionPrice = apportionAcquisitionPrice(buildingActualAcquisition, assumedDebtAmount, giftValuation.max);
  } else if (info.acquisitionMethod === "converted") {
    // K-5: 환산취득가액 (§176의2②2호) = 자산별 양도가액 × (취득시 기준시가 ÷ 양도시 기준시가).
    //   부담부증여 맥락: 자산별 양도가액(채무액 안분분)을 "양도당시 실지거래가액"으로 본다.
    //   자산별 독립 환산이라 합산이 처분청 일괄총액과 ±1원 차이 가능(§176의2②2호 자산별 적용, 법적 허용).
    acquisitionMethodUsed = "converted";
    landAcquisitionPrice =
      landStdPriceAtTransfer === 0
        ? 0
        : calculateEstimatedAcquisitionPrice(landTransferPrice, landStdPriceAtAcquisition, landStdPriceAtTransfer);
    buildingAcquisitionPrice =
      buildingStdPriceAtTransfer === 0
        ? 0
        : calculateEstimatedAcquisitionPrice(buildingTransferPrice, buildingStdPriceAtAcquisition, buildingStdPriceAtTransfer);
  } else {
    // legacy (market + 미지정): 기존 marketValueAtAcquisition 기반 (개산공제 적용 — STEP 5 else).
    acquisitionMethodUsed = "standard_price";
    const totalAcqStd = landStdPriceAtAcquisition + buildingStdPriceAtAcquisition;
    const marketAcqTotal = info.marketValueAtAcquisition ?? 0;
    const landAcqMarket =
      totalAcqStd === 0
        ? 0
        : safeMultiplyThenDivide(marketAcqTotal, landStdPriceAtAcquisition, totalAcqStd);
    const buildingAcqMarket = marketAcqTotal - landAcqMarket;
    landAcquisitionPrice = apportionTransferPrice(landAcqMarket, assumedDebtAmount, giftValuation.max);
    buildingAcquisitionPrice = apportionTransferPrice(buildingAcqMarket, assumedDebtAmount, giftValuation.max);
  }

  // ── 실비(자본적지출·양도비) 공통 계산 — K-4 본문과 K-5 단서(STEP 5.5)가 함께 쓴다 ──
  const capitalExpenditureRaw = params.capitalExpenditure ?? 0;
  const transferExpenseRaw = params.transferExpense ?? 0;
  const realExpenseTotal = capitalExpenditureRaw + transferExpenseRaw;
  /** 실비 총액의 채무비율 안분액 — 「양도로 보는 부분」에 대응하는 몫. */
  const necessaryExpenseDebtTotal = apportionAcquisitionPrice(
    realExpenseTotal, assumedDebtAmount, giftValuation.max,
  );
  /** 실비를 명시 입력했는가 — 미입력이면 단서 비교 자체를 하지 않는다(§97② 본문 유지). */
  const realExpenseDeclared =
    params.capitalExpenditure !== undefined || params.transferExpense !== undefined;

  /**
   * 실비를 **성질별 시점 비율**로 토지·건물에 나눈다(W-5).
   *
   * 「소득세법」 제100조 제2항 후문: 「이 경우 **공통되는 취득가액과 양도비용**은 **해당 자산의
   * 가액에 비례하여** 안분계산한다」. 같은 항 본문이 그 가액의 기준시점을 「**취득 또는 양도
   * 당시의** 기준시가」로 나란히 들므로, **어디에 부수하는 지출인지**가 시점을 정한다.
   *
   *   · 자본적지출(§97①2호) → **취득시** 기준시가 비율
   *   · 양도비(§97①3호)     → **양도시** 기준시가 비율
   *
   * ⚠️ **총액은 인자로 받은 값 그대로다** — 자본적지출분을 구하고 **잔액을 양도비분이 흡수**하며,
   *    건물이 다시 잔액을 흡수한다(메모리 `feedback_floor_residual_absorption`).
   */
  function splitRealExpenseByNature(debtApportionedTotal: number): { land: number; building: number } {
    const capexDebt =
      realExpenseTotal === 0
        ? 0
        : safeMultiplyThenDivide(debtApportionedTotal, capitalExpenditureRaw, realExpenseTotal);
    const transferExpDebt = debtApportionedTotal - capexDebt;
    const totalAcqStd = landStdPriceAtAcquisition + buildingStdPriceAtAcquisition;
    const totalTransferStd = landStdPriceAtTransfer + buildingStdPriceAtTransfer;
    const capexLand =
      totalAcqStd === 0 ? 0 : safeMultiplyThenDivide(capexDebt, landStdPriceAtAcquisition, totalAcqStd);
    const transferExpLand =
      totalTransferStd === 0 ? 0 : safeMultiplyThenDivide(transferExpDebt, landStdPriceAtTransfer, totalTransferStd);
    const land = capexLand + transferExpLand;
    return { land, building: debtApportionedTotal - land };
  }

  // STEP 5: 자산별 필요경비 슬롯 (estimatedDeduction)
  //   K-1~K-3·K-5·legacy: 개산공제 (취득가액 × 3%, §163⑥).
  //   K-4 (실지취득가): 개산공제 미적용 — 실비를 채무비율 안분 후 **성질별 시점 비율**로 자산 분배.
  let landEstimatedDeduction: number;
  let buildingEstimatedDeduction: number;
  if (acquisitionMethodUsed === "actual") {
    /**
     * 🔴 **성질별로 안분 시점이 다르다**(2026-08-07 W-5).
     *
     * 「소득세법」 제100조 제2항 후문: 「이 경우 **공통되는 취득가액과 양도비용**은 **해당 자산의
     * 가액에 비례하여** 안분계산한다」. 같은 항 본문이 그 가액의 기준시점을 「**취득 또는 양도
     * 당시의** 기준시가」로 나란히 들므로, **어디에 부수하는 지출인지**가 시점을 정한다.
     *
     * · 자본적지출(§97①2호) → **취득시** 기준시가 비율 (취득에 부수)
     * · 양도비(§97①3호)     → **양도시** 기준시가 비율 (양도에 부수)
     *
     * 종전에는 **둘을 합쳐 취득시 비율 하나로** 나눴다 — 실가 경로가 2026-08-07(P-2)에 이미
     * 성질별로 갈라 놓은 것과 어긋나 있었다(`general-building-route-actual.ts` `apportionExpenses`).
     *
     * ⚠️ **총액은 움직이지 않는다.** 채무비율 안분은 종전대로 **합계에 한 번** 걸고
     *    (`necessaryExpenseDebt`), 자본적지출분을 뺀 **잔액을 양도비분이 흡수**한다
     *    (메모리 `feedback_floor_residual_absorption`) ⇒ 절사 오차로 합계가 어긋나지 않는다.
     *    바뀌는 것은 **토지↔건물 배분**뿐이다.
     */
    const split = splitRealExpenseByNature(necessaryExpenseDebtTotal);
    landEstimatedDeduction = split.land;
    buildingEstimatedDeduction = split.building;
  } else {
    // 개산공제 base = 취득당시 기준시가 × 채무비율 (소령 §163⑥1호·2호가) — 환산취득가·market 가액이 아님.
    //   K-1~K-3(standard)는 landAcquisitionPrice가 이미 취득기준시가×채무비율이라 결과 불변.
    //   K-5(환산)·legacy(market)만 정정: 종전 환산/market 가액 × 3%였음 (M-4).
    const landStdApportioned = apportionAcquisitionPrice(landStdPriceAtAcquisition, assumedDebtAmount, giftValuation.max);
    const buildingStdApportioned = apportionAcquisitionPrice(buildingStdPriceAtAcquisition, assumedDebtAmount, giftValuation.max);
    landEstimatedDeduction = estimatedDeductionForBurdenedGift(landStdApportioned, isUnregistered);
    buildingEstimatedDeduction = estimatedDeductionForBurdenedGift(buildingStdApportioned, isUnregistered);
  }

  /**
   * STEP 5.5 — 🔴 **§97②2호 단서**: K-5(환산취득가액) 한정 가목·나목 **택일** (2026-08-07 W-6).
   *
   * > 「다만, **제1항제1호나목에 따라 취득가액을 환산취득가액으로 하는 경우**로서 **가목의 금액이
   * >  나목의 금액보다 적은 경우**에는 나목의 금액을 필요경비로 **할 수 있다**.」
   *
   *   · **가목** = 환산취득가액 + 개산공제 (= 필요경비 **전체**)
   *   · **나목** = 자본적지출 + 양도비
   *
   * ⚠️ **왜 K-5가 「제1항제1호나목」인가** — 위임 체인을 따라가면 닫힌다.
   *    「소득세법 시행령」 **제163조 제12항**: 「법 **제97조제1항제1호나목**에서 "…환산취득가액"이란
   *    **제176조의2제2항부터 제4항까지**의 규정에 따른 가액을 말한다」.
   *    K-5가 쓰는 §176의2②2호 산식은 §114⑦(추계결정·경정)과 **공유**하는 것이고,
   *    납세자가 증여자의 실지취득가액을 확인할 수 없어 환산을 택하는 K-5는 **1호나목** 계열이다.
   *    (§97②2호 본문이 §114⑦을 들면서 붙인 괄호 「제1호나목이 적용되는 경우는 제외한다」가
   *     둘의 우선순위를 정한다 — 1호나목이 적용되면 그쪽이다.)
   *
   * ⚠️ **나목 채택 시 환산취득가액을 별도로 차감하지 않는다** — 가목이 「환산취득가액 **과**
   *    개산공제의 **합계액**」이므로 둘은 **필요경비 전체를 놓고** 겨루는 것이다. 취득가액을
   *    남겨 두면 이중차감이 된다(메모리 `feedback_97_2_swap_necessary_expense_max_not_sum` ·
   *    조세심판원 조심2016서2576). 그래서 취득가액 슬롯을 **0으로 만들고** 나목을 경비 슬롯에 넣는다.
   *
   * ⚠️ **동률(==)은 본문**이다 — 단서가 「적은 경우」로 명시한다. 일반 경로
   *    (`transfer-tax-helpers.ts` `calcNecessaryExpense`)와 같은 판정이다.
   */
  let necessaryExpenseSwap: TransferBurdenedGiftBreakdown["necessaryExpenseSwap"];
  let convertedAcquisitionBeforeSwap: TransferBurdenedGiftBreakdown["convertedAcquisitionBeforeSwap"];
  if (acquisitionMethodUsed === "converted" && realExpenseDeclared) {
    const estimatedSide =
      landAcquisitionPrice + buildingAcquisitionPrice + landEstimatedDeduction + buildingEstimatedDeduction;
    const directSide = necessaryExpenseDebtTotal;
    const chosen = directSide > estimatedSide ? "direct" : "estimated";
    necessaryExpenseSwap = { estimatedSide, directSide, chosen };
    if (chosen === "direct") {
      // 🔑 §114조의2 가산세 base 등은 **환산취득가액 자체**를 봐야 하므로 스왑 전 값을 남긴다.
      convertedAcquisitionBeforeSwap = {
        land: landAcquisitionPrice,
        building: buildingAcquisitionPrice,
      };
      landAcquisitionPrice = 0;
      buildingAcquisitionPrice = 0;
      const split = splitRealExpenseByNature(directSide);
      landEstimatedDeduction = split.land;
      buildingEstimatedDeduction = split.building;
    }
  }

  // STEP 6: 무상이전분 — 증여재산 평가액(giftValuation.max) − 채무액 (상증법 §47③)
  const gratuitousPortion = giftValuation.max - assumedDebtAmount;

  // STEP 7: Phase 2 — 증여세 계산 (calcGiftTax 호출)
  // 증여세 = 무상이전분에 대해 수증자가 납부. 양도자(증여자)와 별도 납세의무자.
  let giftTaxSummary: TransferBurdenedGiftBreakdown["giftTax"];
  if (params.giftDate && gratuitousPortion > 0) {
    const donorRelation = info.donorRelation ?? "lineal_descendant";
    // G-M9 수정: toISOString()은 UTC 변환으로 KST 자정 → 전날로 롤백.
    // date-fns format()은 로컬 시간 기준 포맷 → 로컬 날짜 보존.
    const giftDateStr = format(params.giftDate, "yyyy-MM-dd");
    // Phase A: donor 매핑 (DonorRelation → GiftDonorRelation)
    //   donorRelation은 수증자 관점, donor는 증여자 관점.
    //   부담부증여 일반 시나리오: 증여자가 부모인 경우 "father" (단순화, 양친 구분 후속 PR).
    //   isGenerationSkip=true 면 donor=grandparent.
    // 수증자 관점 DonorRelation → 증여자 관점 GiftDonorRelation (deriveDonorRelation의 역).
    //   증여자가 직계존속(수증자 기준 lineal_ascendant_*) → "father"(그룹 A 대표).
    //   수증자가 직계비속(donorRelation === lineal_descendant) → "lineal_descendant"(그룹 D).
    const giftDonor: import("./types/inheritance-gift.types").GiftDonorRelation =
      info.isGenerationSkip
        ? "grandparent"
        : donorRelation === "spouse"
          ? "spouse"
          : donorRelation === "other_relative"
            ? "other_relative"
            : donorRelation === "lineal_ascendant_adult" ||
                donorRelation === "lineal_ascendant_minor"
              ? "father"
              : "lineal_descendant";
    const giftResult = calcGiftTax({
      giftDate: giftDateStr,
      donorRelation,
      donor: giftDonor,
      // 부담부증여 무상이전분을 단일 자산으로 평가 — marketValue 직접 입력(이미 §60~§66 Max 평가 완료된 가액).
      giftItems: [
        {
          id: "burdened-gift-gratuitous",
          category: "real_estate_building",
          name: "부담부증여 무상이전분",
          marketValue: gratuitousPortion,
        },
      ],
      // Phase 3 후속: 10년 이내 사전증여 합산 (상증법 §47②·§58)
      // Phase A: priorGift.donor를 현재 증여자 그룹과 동일하게 매핑 — 별도 입력 없으면
      //          현재 donor와 동일 그룹 가정 (legacy 호환).
      // PR3: computedTax·giftTaxBase를 전달해야 aggregatePriorGiftsForGift가 §58 Phase A
      //      안분 한도(floor(금번 산출세액 × 직전 과세표준 / 합산 과세표준))를 산출한다.
      //      미전달(undefined) 시 priorAggregation 0 → §58 미적용(공제 누락) — validation에서 입력 강제.
      // LOW — donor 강제 매핑 확인 결과:
      // BurdenedGiftInfo.priorGiftsWithin10Years 입력 모델에 donor 필드가 없으므로
      // 구조적으로 단일 증여자(현재 부담부증여 증여자)만 허용하는 설계.
      // 모든 prior를 현재 giftDonor 그룹으로 매핑하는 것이 설계 의도와 일치.
      // 다른 그룹 prior 표현이 필요하면 BurdenedGiftInfo에 donor 필드 추가 후 v2에서 확장.
      priorGiftsWithin10Years: (info.priorGiftsWithin10Years ?? []).map((p) => ({
        giftDate: p.giftDate,
        isHeir: false, // 증여세 §47 합산에서는 isHeir 무관 (상속세 §13 전용 필드)
        giftAmount: p.giftAmount,
        giftTaxPaid: p.giftTaxPaid,
        donor: giftDonor, // 단일 증여자 설계 — 입력모델(BurdenedGiftInfo)에 donor 필드 없음
        computedTax: p.computedTax,  // §58① 증여 당시 산출세액 (한도 분자·공제 대상)
        giftTaxBase: p.giftTaxBase,  // §58 한도 분자 = 가산 증여재산 과세표준
      })),
      isGenerationSkip: info.isGenerationSkip ?? false,
      isMinorDonee: info.isMinorDonee ?? false,
      deductionInput: {
        donorRelation,
      },
      creditInput: {
        isFiledOnTime: info.isFiledOnTime ?? true,
      },
    });
    giftTaxSummary = {
      grossGiftValue: giftResult.grossGiftValue,
      deduction: giftResult.totalDeduction,
      taxBase: giftResult.taxBase,
      computedTax: giftResult.computedTax,
      filingCredit: giftResult.creditDetail.filingCredit,
      // §58 기납부세액공제 — calcGiftTaxCredits 결과의 giftTaxCredit(= priorPaidCredit) (PR3)
      priorGiftCredit: giftResult.creditDetail.giftTaxCredit,
      finalTax: giftResult.finalTax,
      donorRelation,
    };
  }

  return {
    assumedDebtAmount,
    sangjeungbeopValuation,
    giftValuation,
    wholePropertySupplementary,
    ownershipRatio: ownershipRatio !== undefined && ownershipRatio < 1 ? ownershipRatio : undefined,
    debtRatio,
    gratuitousPortion,
    taxpayer: "donor",
    acquisitionMethodUsed,
    ...(necessaryExpenseSwap ? { necessaryExpenseSwap } : {}),
    ...(convertedAcquisitionBeforeSwap ? { convertedAcquisitionBeforeSwap } : {}),
    giftTax: giftTaxSummary,
    perAsset: {
      land: {
        sangjeungbeopValue: landSangjeungbeopValue,
        stdPriceAtAcquisition: landStdPriceAtAcquisition,
        transferPrice: landTransferPrice,
        acquisitionPrice: landAcquisitionPrice,
        estimatedDeduction: landEstimatedDeduction,
        acquisitionMethod: acquisitionMethodUsed,
        stdPriceAtTransfer: landStdPriceAtTransfer,
        actualAcquisition: landActualAcquisition,
      },
      building: {
        sangjeungbeopValue: buildingSangjeungbeopValue,
        stdPriceAtAcquisition: buildingStdPriceAtAcquisition,
        transferPrice: buildingTransferPrice,
        acquisitionPrice: buildingAcquisitionPrice,
        estimatedDeduction: buildingEstimatedDeduction,
        acquisitionMethod: acquisitionMethodUsed,
        stdPriceAtTransfer: buildingStdPriceAtTransfer,
        actualAcquisition: buildingActualAcquisition,
      },
    },
  };
}
