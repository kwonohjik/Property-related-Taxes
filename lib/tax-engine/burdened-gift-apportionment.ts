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
} from "./legal-codes/burdened-gift";
import {
  safeMultiplyThenDivide,
  applyRate,
  applyRatio,
  computeEstimatedDeduction,
} from "./tax-utils";
import { buildBurdenedGiftGiftTax } from "./burdened-gift-gift-tax";
import { resolveWholeBgAcquisition, type BgAcquisitionContext } from "./burdened-gift-acquisition";
import { resolvePartwiseBgAcquisition, type BgPreDeemedParts } from "./burdened-gift-part-pre-deemed";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type {
  BurdenedGiftInfo,
  TransferBurdenedGiftBreakdown,
} from "./types/transfer-burdened-gift.types";

// ── 800줄 정책 분리(2026-08-07 W-6) — 기존 import 경로 유지용 재수출 ──
import {
  scaleBurdenedGiftInfo,
  computeSangjeungbeopValuation,
  computeDebtRatio,
  resolveBgAcquisitionBasis,
  apportionTransferPrice,
  apportionAcquisitionPrice,
  fractionalHighValueDenominator,
  withDeemedAcquisitionStd,
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
  burdenedGiftSurchargeSuspendedNotice,
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
  /**
   * 의제취득일(1985.1.1.) 전 상속·증여 자산 — STEP 0.45 결과(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §18).
   * 취득시 기준시가 슬롯을 의제취득일 기준시가(`stdAtDeemed`, 물건 전체)로 바꾸고(Q-25 · 개산공제 base도 같다),
   * 괄호 미발동이면 `acquisition`(①②③ 중 큰 금액, 지분 축소 후·안분 전)을 사용자가 고른 산정방식 대신 쓴다(Q-24).
   */
  preDeemed?: {
    stdAtDeemed: number;
    acquisition: number;
    selected: "reported" | "sec164" | "converted";
    reported: number | null;
    sec164: number | null;
    converted: number;
  };
  /**
   * 일반건물 — 의제취득일(1985.1.1.) 전 상속·증여 **파트**의 ①②(`generalBuildingValuation.{land,building}PreDeemedClauseA`).
   * 시가 평가 · 괄호 미발동이면 그 파트만 3자 max(사용자 결정 Q-28 · `burdened-gift-part-pre-deemed.ts`). 괄호가 발동하면 쓰지 않는다 —
   * 일반건물 취득시 기준시가 칸이 이미 의제취득일 기준시가다(Q-25 · PR-7b-2).
   */
  preDeemedParts?: BgPreDeemedParts;
}): TransferBurdenedGiftBreakdown {
  const { isUnregistered = false, ownershipRatio, preDeemed } = params;
  const rawInfo = preDeemed ? withDeemedAcquisitionStd(params.info, preDeemed.stdAtDeemed) : params.info;

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

  /**
   * §159①1호 **A괄호 발동 판정** — 취득가액을 기준시가로 강제하는가.
   *
   * 괄호는 열거를 **닫아** 두고 있다:
   *
   * > 「… 취득가액(양도가액을 「상속세 및 증여세법」 **제61조제1항ㆍ제2항ㆍ제5항 및 제66조**에
   * >   따라 기준시가로 산정한 경우에는 취득가액도 기준시가로 산정한다) …」
   *
   * **§61③은 열거에 없다.** 조합원입주권의 증여재산 평가는 §61③(부동산을 취득할 수 있는 권리)
   * → 시행령 §51②이므로 그 괄호가 발동하지 않고, 취득가액은 §97①1호 **실지거래가액**이다.
   *
   * ⇒ 판정 축은 「사용자가 고른 평가 모드」가 아니라 **「어느 조항으로 양도가액을 산정했는가」**다.
   *
   * | 상황 | 산정 근거 | 괄호 | 취득가액 |
   * |---|---|---|---|
   * | 기준시가 모드 · 보충적 승 · 입주권 | **§61③** | **미발동** | 실지(K-4) |
   * | 기준시가 모드 · 보충적 승 · 그 외 | §61①4호 등 | 발동 | 기준시가 |
   * | 기준시가 모드 · 담보 승 | §66 | 발동 | 기준시가 |
   * | 기준시가 모드 · 임대 승 | §61⑤ | 발동 | 기준시가 |
   * | 시가 모드 | §60② | 미발동 | K-4/K-5 |
   *
   * ⚠️ 기존 5종은 `rightValuation`이 없어 판정이 **항상 「발동」**이다 — 동작 불변.
   * ⚠️ 축은 `sangjeungbeopValuation`(양도세 축)이다. 괄호가 말하는 것은 「**양도가액**을
   *    무엇으로 산정했는가」이지 증여세 평가가 아니다.
   */
  const {
    isRightToMoveIn: isRightToMoveInValuation,
    isStandardMode,
    collateralForcedStdInMarketMode,
    acqStdPriceForced,
  } = resolveBgAcquisitionBasis(info, sangjeungbeopValuation.selectedMode);

  /**
   * 🔴 입주권 × 담보(§66)·임대(§61⑤) 승리는 **fail-fast**.
   *
   * 그 경로는 괄호가 발동해 「입주권의 기준시가」(소령 §165①)를 요구하는데, 본 설계는 그 입력을
   * 두지 않는다(입주권은 K-4 전용). 값이 0으로 흘러 **취득가액 0 → 양도차익 과대**가 되므로
   * 근거 없는 불리 적용을 막기 위해 계산을 중단한다 — `assertBurdenedGiftEligible`과 같은 층위다.
   */
  if (
    isRightToMoveInValuation &&
    isStandardMode &&
    sangjeungbeopValuation.selectedMode !== "supplementary"
  ) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "[burdened_gift] 조합원입주권의 증여재산 평가가 " +
        (sangjeungbeopValuation.selectedMode === "mortgage" ? "담보(§66)" : "임대(§61⑤)") +
        " 평가로 결정됐습니다. 이 경우 「소득세법 시행령」 제159조 제1항 제1호 괄호에 따라 " +
        "취득가액도 기준시가로 산정해야 하는데, 조합원입주권의 기준시가(같은 영 제165조 제1항) " +
        "입력 경로가 없어 계산할 수 없습니다. 담보 설정액·임대 보증금 입력을 재확인하세요.",
    );
  }

  /**
   * 시가 평가인데 담보평가(§66)가 시가보다 커서 C가 담보평가가 된 경우 — 괄호가 문언대로 발동한다(「제66조에 따라 기준시가로 산정한
   * 경우」). 해석례가 없어 괄호대로 계산하고 확인 필요로 알린다(1h-G1-2 · 결정 #23 하위 2 다). 입주권은 기존 동작 유지(위 fail-fast 주석).
   */
  if (collateralForcedStdInMarketMode && landStdPriceAtAcquisition + buildingStdPriceAtAcquisition <= 0) {
    // 취득시 기준시가가 없으면 취득가액이 0이 되어 양도차익이 통째로 부풀지만 막히지 않는 오답이다 — 입력을 요구한다(자동 fallback 금지).
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "[burdened_gift] 시가로 평가했지만 담보채권액 평가(상증법 §66)가 시가보다 커서 「소득세법 시행령」 제159조 제1항 제1호 괄호에 따라 " +
        "취득가액을 취득시 기준시가로 산정해야 합니다. 취득시 기준시가를 입력하세요.",
    );
  }

  /**
   * 기준시가 평가인데 양도시 기준시가 합이 0 — 증여가액 C와 양도가액이 정해지지 않는다(「소득세법 시행령」 제159조 제1항 제2호).
   * 그대로 두면 담보평가가 C가 되고 STEP 3이 양도가액을 0으로 두어, 취득가액만 남은 양도차손 → 세액 0이 된다.
   * ⑧이 화면에서 먼저 막고, 여기는 API 직접 호출·일반건물·함께 양도를 한 곳에서 막는다(계획서 `bg-std-mode-transfer-std-required.plan.md` §3.2).
   */
  if (isStandardMode && sangjeungbeopValuation.supplementary === 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "[burdened_gift] 기준시가로 평가했는데 양도시 기준시가가 없습니다. 증여가액과 양도가액이 양도시 기준시가로 정해지므로 " +
        "(「소득세법 시행령」 제159조 제1항 제2호) 양도시 기준시가를 입력하세요.",
    );
  }

  // 괄호 발동 판정(`acqStdPriceForced`)은 위 `resolveBgAcquisitionBasis`가 단일 소스 — 겸용 부담부증여도 같은 함수를 부른다.

  // STEP 4 ~ 5.5: 자산별 취득가액·필요경비 슬롯 — `burdened-gift-acquisition.ts`(파트별 3자 max는 `burdened-gift-part-pre-deemed.ts`).
  const acqCtx: BgAcquisitionContext = {
    info,
    landStdPriceAtTransfer,
    buildingStdPriceAtTransfer,
    landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition,
    landTransferPrice,
    buildingTransferPrice,
    assumedDebtAmount,
    giftValuation,
    acqStdPriceForced,
    isRightToMoveInValuation,
    preDeemed,
    params: { capitalExpenditure: params.capitalExpenditure, transferExpense: params.transferExpense },
    isUnregistered,
  };
  const partwise =
    // 단일 자산 `preDeemed`(STEP 0.45)와 함께 오지 않는다 — 파트 ①②는 일반건물 route만 싣고, 일반건물은 STEP 0.45를 타지 않는다.
    !acqStdPriceForced && (params.preDeemedParts?.land || params.preDeemedParts?.building)
      ? resolvePartwiseBgAcquisition(acqCtx, params.preDeemedParts)
      : undefined;
  const acq = partwise ? partwise.slots : resolveWholeBgAcquisition(acqCtx);
  const { acquisitionMethodUsed, necessaryExpenseSwap, convertedAcquisitionBeforeSwap } = acq;
  const { landActualAcquisition, buildingActualAcquisition, landPresumedAcquisition, buildingPresumedAcquisition } = acq;
  const { landAcquisitionPrice, buildingAcquisitionPrice } = acq;
  let { landEstimatedDeduction, buildingEstimatedDeduction } = acq;

  /**
   * STEP 5.7 — **이월과세 증여세 상당액 산입** (§97의2①3호 · 시행령 §163의2②) — 2026-08-10 D-7a.
   *
   * `info.carryoverGiftTaxAmount`는 `calcCarryoverScenarios`가 **시나리오 A 사본에만** 실어 보낸다.
   * 시나리오 B(이월과세 미적용)에는 없으므로 이 블록이 통째로 건너뛰어진다.
   *
   * ## 🔴 왜 여기(STEP 5.5 **뒤**)인가 — 두 가지가 동시에 걸려 있다
   *
   * 1. **§97②2호 단서(swap) 비교 대상 밖**이다. 증여세 상당액은 §97의2①3호가 독립적으로
   *    산입하는 항목이지 가목(환산+개산공제)도 나목(자본적지출+양도비)도 아니다.
   *    STEP 5.5 앞에 두면 나목에 섞여 **단서 판정을 오염**시킨다.
   * 2. **개산공제 경로에도 도달해야 한다**. 종전에는 `transferExpense`에 얹었는데
   *    K-1~K-3·K-5·legacy는 실비를 아예 읽지 않아(STEP 5 `else` = 개산공제) 결과 화면에는
   *    「증여세 산입」이 뜨는데 **세액은 그대로**였다(계획서 §5.7.4 실측 D3-3 · 침묵 오답보다 나쁘다).
   *    ⇒ 모드 분기 **바깥**의 필요경비 슬롯에 직접 얹는다.
   *
   * ## 순서: 안분 → 파트 배분 → 파트별 한도 (뒤집으면 한도가 과소 적용된다 — 타입 주석 참조)
   *
   * 토지·건물 배분은 **증여 당시 토지분·건물분 평가액 비율**이다 — 2호 「양도한 해당 자산가액」이 파트마다의 증여세 과세가액이기 때문이다
   * (`carryoverDonorBasis.giftValuationByPart` · 계획서 `gb-bg-carryover-gift-tax-part-limit.plan.md` Q-2 a · Q-3 b).
   * 그 값이 없는 종전 본문·직접 호출만 **자산별 양도가액 비율**(§159가 채무를 나눈 축)로 나눈다.
   * 잔액은 건물이 흡수한다(메모리 `feedback_floor_residual_absorption`).
   *
   * 한도는 **파트마다** 그 파트의 잔액이다 — 토지·건물은 「소득세법」 제94조 제1항 제1호상 각각의 자산이고,
   * 후단 한도 「양도가액에서 법 제97조제1항 및 제2항의 금액을 공제한 잔액」은 파트마다 따로 정해진다(토지와 건물의 양도차익은 각각 계산 —
   * 양도소득세 집행기준 97-163-42 · 일반 양도 `transfer-tax-split-carryover.ts`와 같다). 사전-2025-법규재산-0366의 「해당 자산에 대한 양도차익」은
   * 같은 한도의 요약이지만 토지·건물을 나눈 사례가 아니다 — 정면 해석례는 없다(계획서 §8 V-1).
   * 한 파트에서 넘친 몫은 다른 파트로 옮기지 않는다. 종전에는 두 파트 합계를 한도로 걸어 한 파트의 양도차익이
   * 음수가 되어 다른 파트를 깎았다(계획서 `gb-bg-carryover-gift-tax-part-limit.plan.md` §1.1 — 36,284,050 → 42,050,540).
   */
  let carryoverGiftTax: TransferBurdenedGiftBreakdown["carryoverGiftTax"];
  const carryoverGiftTaxRaw = info.carryoverGiftTaxAmount ?? 0;
  if (carryoverGiftTaxRaw > 0) {
    const apportioned = apportionAcquisitionPrice(
      carryoverGiftTaxRaw, assumedDebtAmount, giftValuation.max,
    );
    // 파트 배분 — 한 파트만 증여받았으면 그 파트에 전액(다른 파트는 증여받지 않았다 · 계획서 `gb-bg-part-carryover-calc.plan.md` Q-2 a).
    const part = info.carryoverGiftTaxPart;
    const totalTransfer = landTransferPrice + buildingTransferPrice;
    const byPart = info.carryoverDonorBasis?.giftValuationByPart;
    const byPartTotal = byPart ? byPart.land + byPart.building : 0;
    const landShare =
      part === "land" ? apportioned
      : part === "building" ? 0
      : byPart && byPartTotal > 0
        ? safeMultiplyThenDivide(apportioned, byPart.land, byPartTotal)
        : totalTransfer === 0
          ? 0
          : safeMultiplyThenDivide(apportioned, landTransferPrice, totalTransfer);
    const buildingShare = apportioned - landShare;
    // 한도 = 그 파트의 양도차익 = 양도가액 − (취득가액 + 그 밖의 필요경비) — 시행령 §163의2② 후단의 「양도가액에서 법 §97① 및 ②의 금액을 공제한 잔액」.
    const landCap = Math.max(0, landTransferPrice - landAcquisitionPrice - landEstimatedDeduction);
    const buildingCap = Math.max(0, buildingTransferPrice - buildingAcquisitionPrice - buildingEstimatedDeduction);
    const landApplied = Math.min(landShare, landCap);
    const buildingApplied = Math.min(buildingShare, buildingCap);
    carryoverGiftTax = {
      raw: carryoverGiftTaxRaw,
      apportioned,
      cap: (part === "building" ? 0 : landCap) + (part === "land" ? 0 : buildingCap),
      applied: landApplied + buildingApplied,
      limitApplied: landShare > landCap || buildingShare > buildingCap,
    };
    landEstimatedDeduction += landApplied;
    buildingEstimatedDeduction += buildingApplied;
  }

  // STEP 6: 무상이전분 — 증여재산 평가액(giftValuation.max) − 채무액 (상증법 §47① — 증여재산가액에서 수증자가 인수한 채무를 뺀다)
  const gratuitousPortion = giftValuation.max - assumedDebtAmount;

  // STEP 7: Phase 2 — 증여세 계산 (calcGiftTax 호출) — 단건·겸용 공용 함수(`burdened-gift-gift-tax.ts`)
  const giftTaxSummary = buildBurdenedGiftGiftTax({
    info,
    giftDate: params.giftDate,
    giftValuationMax: giftValuation.max,
    assumedDebtAmount,
    gratuitousPortion,
  });

  return {
    assumedDebtAmount,
    sangjeungbeopValuation,
    giftValuation,
    wholePropertySupplementary,
    // 시가 평가인데 담보평가가 이겨 취득가액도 기준시가로 산정했는가 — 확인 필요 고지의 근거(1h-G1-2)
    ...(collateralForcedStdInMarketMode ? { acquisitionStdForcedByCollateral: true } : {}),
    // 지분 모드의 12억 판정 가액(소령 §156① — 지분 증여가액 ÷ 지분율). 단독 소유는 없음.
    ...(ownershipRatio !== undefined && ownershipRatio > 0 && ownershipRatio < 1
      ? {
          fractionalHighValueDenominator: fractionalHighValueDenominator({
            selectedMode: sangjeungbeopValuation.selectedMode,
            max: sangjeungbeopValuation.max,
            wholePropertySupplementary,
            ownershipRatio,
          }),
        }
      : {}),
    /**
     * 입주권 평가 구성 내역 — 표시·검증 전용. 평가액 **자체**는
     * `buildingStdPriceAtTransfer`(→ `perAsset.building.sangjeungbeopValue`)가 담는다.
     * 값은 **지분 축소 후**(`scaleBurdenedGiftInfo`)라 std 필드와 같은 스케일이다.
     */
    ...(info.rightValuation
      ? {
          assetKind: "right_to_move_in" as const,
          rightValuationDetail: {
            memberRightsValue: info.rightValuation.memberRightsValue,
            paidInstallments: info.rightValuation.paidInstallments,
            premium: info.rightValuation.premium,
            total:
              info.rightValuation.memberRightsValue +
              info.rightValuation.paidInstallments +
              info.rightValuation.premium,
          },
        }
      : {}),
    ownershipRatio: ownershipRatio !== undefined && ownershipRatio < 1 ? ownershipRatio : undefined,
    debtRatio,
    gratuitousPortion,
    taxpayer: "donor",
    acquisitionMethodUsed,
    ...(preDeemed
      ? {
          preDeemed: acqStdPriceForced
            ? { basis: "deemed_std" as const, stdAtDeemed: preDeemed.stdAtDeemed }
            : {
                basis: "three_way" as const,
                stdAtDeemed: preDeemed.stdAtDeemed,
                reported: preDeemed.reported,
                sec164: preDeemed.sec164,
                converted: preDeemed.converted,
                selected: preDeemed.selected,
                wholeAcquisition: preDeemed.acquisition,
              },
        }
      : partwise
        ? {
            preDeemed: {
              basis: "three_way_parts" as const,
              stdAtDeemed: (partwise.parts.land?.stdAtDeemed ?? 0) + (partwise.parts.building?.stdAtDeemed ?? 0),
              parts: partwise.parts,
            },
          }
        : {}),
    ...(necessaryExpenseSwap ? { necessaryExpenseSwap } : {}),
    ...(convertedAcquisitionBeforeSwap ? { convertedAcquisitionBeforeSwap } : {}),
    ...(carryoverGiftTax ? { carryoverGiftTax } : {}),
    giftTax: giftTaxSummary,
    perAsset: {
      land: {
        sangjeungbeopValue: landSangjeungbeopValue,
        stdPriceAtAcquisition: landStdPriceAtAcquisition,
        transferPrice: landTransferPrice,
        acquisitionPrice: landAcquisitionPrice,
        estimatedDeduction: landEstimatedDeduction,
        estimatedDeductionRate: acq.landEstimatedDeductionRate,
        acquisitionMethod: acq.landMethod,
        stdPriceAtTransfer: landStdPriceAtTransfer,
        actualAcquisition: landActualAcquisition,
        presumedAcquisition: landPresumedAcquisition,
      },
      building: {
        sangjeungbeopValue: buildingSangjeungbeopValue,
        stdPriceAtAcquisition: buildingStdPriceAtAcquisition,
        transferPrice: buildingTransferPrice,
        acquisitionPrice: buildingAcquisitionPrice,
        estimatedDeduction: buildingEstimatedDeduction,
        estimatedDeductionRate: acq.buildingEstimatedDeductionRate,
        acquisitionMethod: acq.buildingMethod,
        stdPriceAtTransfer: buildingStdPriceAtTransfer,
        actualAcquisition: buildingActualAcquisition,
        presumedAcquisition: buildingPresumedAcquisition,
      },
    },
  };
}
