/**
 * 부담부증여 §159①1호 — 자산별 취득가액·필요경비 슬롯(STEP 4 ~ 5.5).
 *
 * `burdened-gift-apportionment.ts`(710줄)에서 옮겼다 — 의제취득일(1985.1.1.) 전 상속·증여 **파트**의 3자 max(일반건물 · 사용자 결정 Q-28 ·
 * `burdened-gift-part-pre-deemed.ts`)가 이 자리를 대신하기 때문이다(계획서 `inheritance-pre-deemed-bg-pr7b.plan.md` PR-7b-6).
 * 본문은 종전 그대로다 — 바깥 함수의 지역 변수를 `ctx`로 받는다.
 */
import { REGISTERED_ESTIMATED_DEDUCTION_RATE, UNREGISTERED_ESTIMATED_DEDUCTION_RATE } from "./legal-codes/burdened-gift";
import { estimatedDeductionRate } from "./legal-codes/transfer-nbl";
import { safeMultiplyThenDivide, calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { apportionByStdPrice } from "./std-price-apportion";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { apportionTransferPrice, apportionAcquisitionPrice, estimatedDeductionForBurdenedGift } from "./burdened-gift-valuation";
import type { BurdenedGiftInfo, TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";

/** `buildBurdenedGiftBreakdown`의 단일 자산 의제취득일 전 입력(STEP 0.45 결과) — 그 함수의 `preDeemed` 인자와 같다. */
export interface BgWholePreDeemed {
  stdAtDeemed: number;
  acquisition: number;
  selected: "reported" | "sec164" | "converted";
  reported: number | null;
  sec164: number | null;
  converted: number;
}

/** STEP 4~5.5가 읽는 값 — 모두 지분 축소 후(`scaleBurdenedGiftInfo`)다. */
export interface BgAcquisitionContext {
  info: BurdenedGiftInfo;
  landStdPriceAtTransfer: number;
  buildingStdPriceAtTransfer: number;
  landStdPriceAtAcquisition: number;
  buildingStdPriceAtAcquisition: number;
  /** STEP 3 자산별 양도가액(채무 안분 후) */
  landTransferPrice: number;
  buildingTransferPrice: number;
  assumedDebtAmount: number;
  giftValuation: { max: number };
  acqStdPriceForced: boolean;
  isRightToMoveInValuation: boolean;
  preDeemed?: BgWholePreDeemed;
  params: { capitalExpenditure?: number; transferExpense?: number };
  isUnregistered: boolean;
}

export interface BgAcquisitionSlots {
  acquisitionMethodUsed: TransferBurdenedGiftBreakdown["acquisitionMethodUsed"];
  /** 파트별 산정 경로 — 자산 단위 계산은 둘 다 `acquisitionMethodUsed`다(파트별 3자 max만 갈린다). */
  landMethod: TransferBurdenedGiftBreakdown["acquisitionMethodUsed"];
  buildingMethod: TransferBurdenedGiftBreakdown["acquisitionMethodUsed"];
  landAcquisitionPrice: number;
  buildingAcquisitionPrice: number;
  landActualAcquisition?: number;
  buildingActualAcquisition?: number;
  landPresumedAcquisition?: number;
  buildingPresumedAcquisition?: number;
  landEstimatedDeduction: number;
  buildingEstimatedDeduction: number;
  appliedEstimatedDeductionRate?: number;
  /** 파트별 개산공제율 — 파트별 3자 max에서 실지 파트는 율이 없다. 자산 단위 계산은 두 파트 모두 `appliedEstimatedDeductionRate`. */
  landEstimatedDeductionRate?: number;
  buildingEstimatedDeductionRate?: number;
  necessaryExpenseSwap?: TransferBurdenedGiftBreakdown["necessaryExpenseSwap"];
  necessaryExpenseInput?: TransferBurdenedGiftBreakdown["necessaryExpenseInput"];
  convertedAcquisitionBeforeSwap?: TransferBurdenedGiftBreakdown["convertedAcquisitionBeforeSwap"];
}

/**
 * 실비를 **성질별 시점 비율**로 토지·건물에 나눈다(W-5) — 아래 STEP 5 주석 참조. 파트별 3자 max도 같은 규칙을 쓴다.
 * 총액은 인자로 받은 값 그대로다 — 자본적지출분을 구하고 잔액을 양도비분이 흡수하며, 건물이 다시 잔액을 흡수한다.
 */
export function splitBgRealExpenseByNature(
  debtApportionedTotal: number,
  capitalExpenditureRaw: number,
  realExpenseTotal: number,
  std: Pick<
    BgAcquisitionContext,
    "landStdPriceAtAcquisition" | "buildingStdPriceAtAcquisition" | "landStdPriceAtTransfer" | "buildingStdPriceAtTransfer"
  > & { info?: BurdenedGiftInfo },
): { land: number; building: number } {
  const capexDebt =
    realExpenseTotal === 0
      ? 0
      : safeMultiplyThenDivide(debtApportionedTotal, capitalExpenditureRaw, realExpenseTotal);
  const transferExpDebt = debtApportionedTotal - capexDebt;
  const totalAcqStd = std.landStdPriceAtAcquisition + std.buildingStdPriceAtAcquisition;
  const totalTransferStd = std.landStdPriceAtTransfer + std.buildingStdPriceAtTransfer;
  // 한 파트만 이월과세 — 당초 증여자 자본적지출(§97의2①2호 「해당 자산에 대하여 지출한」)은 증여받은 파트에 귀속하고, 나머지 자본적지출만 취득시 기준시가로 나눈다.
  const directPart = std.info?.carryoverGiftTaxPart;
  const directCapex = directPart ? Math.min(std.info?.carryoverDonorCapexDirect ?? 0, capitalExpenditureRaw) : 0;
  const directDebt = directCapex > 0 ? safeMultiplyThenDivide(capexDebt, directCapex, capitalExpenditureRaw) : 0;
  const pooledCapexDebt = capexDebt - directDebt;
  const capexLand =
    (totalAcqStd === 0 ? 0 : safeMultiplyThenDivide(pooledCapexDebt, std.landStdPriceAtAcquisition, totalAcqStd)) +
    (directPart === "land" ? directDebt : 0);
  const transferExpLand =
    totalTransferStd === 0 ? 0 : safeMultiplyThenDivide(transferExpDebt, std.landStdPriceAtTransfer, totalTransferStd);
  const land = capexLand + transferExpLand;
  return { land, building: debtApportionedTotal - land };
}

/** 자산 단위 STEP 4~5.5 — 종전 `buildBurdenedGiftBreakdown` 본문. */
export function resolveWholeBgAcquisition(ctx: BgAcquisitionContext): BgAcquisitionSlots {
  const {
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
    params,
    isUnregistered,
  } = ctx;

  // STEP 4: 자산별 취득가액 산정 (소령 §159 ① 1호) — 4-way 분기 (§100① 일치 게이트 내재화)
  //   K-1~K-3 (괄호 발동):        취득시 기준시가 × 채무비율 (§159①1호 A괄호 강제). 분모 giftValuation.max.
  //   K-4 (actual):              실지취득가액 × 채무비율 (§159①1호 본문). 개산공제 미적용.
  //                              시가 모드 + `actual`, 그리고 **조합원입주권**(괄호 미발동)이 여기로 온다.
  //   K-6/K-7 (market+salesCase/appraisal): 매매사례가액·감정가액 × 채무비율 (§97①1호나목·§176의2③1·2호). 개산공제 적용·실비 swap 없음.
  //   K-5 (market+converted):    환산취득가액 = 자산별 양도가액 × (취득기준시가 ÷ 양도기준시가) (§176의2②2호). 개산공제 적용.
  //   market+미지정 (legacy):    backward-compat — marketValueAtAcquisition 기반 (개산공제 적용).
  let landAcquisitionPrice: number;
  let buildingAcquisitionPrice: number;
  let acquisitionMethodUsed: TransferBurdenedGiftBreakdown["acquisitionMethodUsed"];
  let landActualAcquisition: number | undefined;
  let buildingActualAcquisition: number | undefined;
  let landPresumedAcquisition: number | undefined;
  let buildingPresumedAcquisition: number | undefined;

  // 조합원입주권은 K-4 고정이다 — 아래 K-4 분기가 입주권을 먼저 잡아 매매사례가액·감정가액을 **조용히 무시**하므로 먼저 막는다.
  if (
    isRightToMoveInValuation &&
    !acqStdPriceForced &&
    (info.acquisitionMethod === "appraisal" || info.acquisitionMethod === "salesCase")
  ) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "[burdened_gift] 조합원입주권의 취득가액은 종전 부동산(기존건물과 그 부수토지)의 취득가액이라 매매사례가액·감정가액을 쓸 수 없습니다 — " +
        "「소득세법 시행령」 제166조 제3항은 그 취득가액을 확인할 수 없는 경우를 기준시가 환산식으로 직접 정하고, 같은 조 제4항 제2호의 매매사례가액·감정가액은 " +
        "취득가액이 아니라 기존건물과 그 부수토지의 「평가액」(관리처분계획등 인가일 전후) 산정에 쓰입니다. 취득가액 산정방식을 「실지취득가액」으로 선택하세요.",
    );
  }

  if (acqStdPriceForced) {
    // K-1~K-3: 취득시 기준시가 × 채무비율 (A괄호). 분모 giftValuation.max (Excel 정합).
    //   의제취득일 전 자산은 그 기준시가가 의제취득일 기준시가다(위 `withDeemedAcquisitionStd` — Q-25). 없으면 취득가액 0이 되어 막히지 않는 오답이다.
    if (preDeemed && landStdPriceAtAcquisition + buildingStdPriceAtAcquisition <= 0) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "[burdened_gift] 의제취득일(1985.1.1.) 전에 취득한 자산을 기준시가로 평가해 부담부증여하면 「소득세법 시행령」 제159조 제1항 제1호 괄호에 따라 " +
          "취득가액을 의제취득일 현재 기준시가(같은 영 제164조 제4항~제7항)로 산정해야 합니다. 의제취득일 기준시가를 입력하세요.",
      );
    }
    acquisitionMethodUsed = "standard_price";
    landAcquisitionPrice = apportionAcquisitionPrice(landStdPriceAtAcquisition, assumedDebtAmount, giftValuation.max);
    buildingAcquisitionPrice = apportionAcquisitionPrice(buildingStdPriceAtAcquisition, assumedDebtAmount, giftValuation.max);
  } else if (preDeemed) {
    // 의제취득일 전 상속·증여 × 시가 평가 (Q-24): A = max(①,②,③) — 안분 전 전체 금액으로 고른 값 — × B/C.
    //   ①② = 실지거래가액 의제(영 §163⑨)라 실제 필요경비, ③ = 환산(영 §176조의2④)이라 개산공제 + §97②2호 단서(STEP 5·5.5가 그대로 처리).
    //   토지·건물은 의제취득일 기준시가 비율로 나눈다(K-4 단일 총액과 같은 근거). 사용자가 고른 산정방식은 이 구간에서 쓰지 않는다.
    acquisitionMethodUsed = preDeemed.selected === "converted" ? "converted" : "actual";
    const totalAcqStd = landStdPriceAtAcquisition + buildingStdPriceAtAcquisition;
    const totalTransferStd = landStdPriceAtTransfer + buildingStdPriceAtTransfer;
    const landWhole =
      totalAcqStd > 0
        ? safeMultiplyThenDivide(preDeemed.acquisition, landStdPriceAtAcquisition, totalAcqStd)
        : totalTransferStd > 0
          ? safeMultiplyThenDivide(preDeemed.acquisition, landStdPriceAtTransfer, totalTransferStd)
          : preDeemed.acquisition;
    const buildingWhole = preDeemed.acquisition - landWhole;
    if (acquisitionMethodUsed === "actual") {
      landActualAcquisition = landWhole;
      buildingActualAcquisition = buildingWhole;
    }
    landAcquisitionPrice = apportionAcquisitionPrice(landWhole, assumedDebtAmount, giftValuation.max);
    buildingAcquisitionPrice = apportionAcquisitionPrice(buildingWhole, assumedDebtAmount, giftValuation.max);
  } else if (info.acquisitionMethod === "actual" || isRightToMoveInValuation) {
    // K-4: 실지취득가액 × 채무비율 (§159①1호 본문).
    //   조합원입주권은 **항상 이 경로**다 — §166①1호가 쓰는 취득가액이 「기존건물과 그 부수토지의
    //   취득가액」(= 종전 부동산 실지취득가액)이고, 그 환산(§166③)은 부담부증여에서 점화되지
    //   않는다(`transfer-tax-burdened-gift-step.ts`가 `useEstimatedAcquisition: false`를 강제).
    //   자산별 실지취득가 — 토지·건물 분리 입력 우선, 없으면 단일 total을 취득기준시가 비율로 분배.
    acquisitionMethodUsed = "actual";
    if (info.actualLandAcquisitionPrice !== undefined || info.actualBuildingAcquisitionPrice !== undefined) {
      landActualAcquisition = info.actualLandAcquisitionPrice ?? 0;
      buildingActualAcquisition = info.actualBuildingAcquisitionPrice ?? 0;
    } else {
      const totalAcqStd = landStdPriceAtAcquisition + buildingStdPriceAtAcquisition;
      const total = info.actualAcquisitionTotal ?? 0;
      // 🔴 조합원입주권은 K-4 고정이라 실지취득가액이 비면 취득가액 0 → 양도차익 과대(막히지 않는 오답)다. 자동 대체값을 쓰지 않고 중단한다 —
      //   ⑧(승계: 승계취득가액 · 원조합원: 종전 부동산 실지취득가액)은 이미 요구한다. 단건 시가 모드는 ⑫ refine이 먼저 막았고, 기준시가 모드·묶음·축 B는 여기가 처음이다.
      if (isRightToMoveInValuation && total <= 0) {
        throw new TaxCalculationError(
          TaxErrorCode.INVALID_INPUT,
          "[burdened_gift] 조합원입주권의 취득가액은 실지취득가액을 입력해야 합니다 — 승계조합원은 승계취득가액(+ 추가분담금), 원조합원은 종전 부동산 실지취득가액(「소득세법 시행령」 제166조 제1항 제1호)입니다. " +
            "입력이 없으면 취득가액이 0원으로 계산되어 양도차익이 과대해집니다.",
        );
      }
      landActualAcquisition = totalAcqStd === 0 ? 0 : safeMultiplyThenDivide(total, landStdPriceAtAcquisition, totalAcqStd);
      buildingActualAcquisition = total - landActualAcquisition;
    }
    landAcquisitionPrice = apportionAcquisitionPrice(landActualAcquisition, assumedDebtAmount, giftValuation.max);
    buildingAcquisitionPrice = apportionAcquisitionPrice(buildingActualAcquisition, assumedDebtAmount, giftValuation.max);
  } else if (info.acquisitionMethod === "appraisal" || info.acquisitionMethod === "salesCase") {
    // K-6/K-7: 매매사례가액·감정가액(§97①1호나목 · 소령 §163⑫ → §176의2③1·2호) × 채무비율.
    //   실지거래가액 불명 시 순차 적용하는 추계가액이라 필요경비는 개산공제(STEP 5 else — 기준시가 × B/C × 율)뿐이고
    //   실비 택일(§97②2호 단서)은 환산 전용이라 STEP 5.5가 자동으로 꺼진다.
    //   🔴 미입력을 0으로 두면 취득가액 0 → 양도차익 과대(막히지 않는 오답) — fail-fast.
    const methodLabel = info.acquisitionMethod === "appraisal" ? "감정가액" : "매매사례가액";
    acquisitionMethodUsed = info.acquisitionMethod;
    if (info.presumedLandAcquisitionPrice !== undefined || info.presumedBuildingAcquisitionPrice !== undefined) {
      landPresumedAcquisition = info.presumedLandAcquisitionPrice ?? 0;
      buildingPresumedAcquisition = info.presumedBuildingAcquisitionPrice ?? 0;
    } else if (info.presumedAcquisitionTotal !== undefined) {
      // 단일 총액 → 취득시 기준시가 비율 분배(K-4 단일자산과 같은 근거 — 계획서 Q-3). 분모 0이면 분배 불가.
      const totalAcqStd = landStdPriceAtAcquisition + buildingStdPriceAtAcquisition;
      if (totalAcqStd <= 0) {
        throw new TaxCalculationError(
          TaxErrorCode.INVALID_INPUT,
          `[burdened_gift] ${methodLabel}를 토지·건물로 나누려면 취득시 기준시가가 필요합니다 (개산공제 기준이기도 합니다).`,
        );
      }
      const split = apportionByStdPrice(
        info.presumedAcquisitionTotal,
        landStdPriceAtAcquisition,
        buildingStdPriceAtAcquisition,
      );
      landPresumedAcquisition = split.land;
      buildingPresumedAcquisition = split.building;
    } else {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `[burdened_gift] 취득가액 산정방식 「${methodLabel}」은 취득 당시 ${methodLabel}을 입력해야 합니다 ` +
          "(「소득세법」 제97조제1항제1호나목 · 같은 법 시행령 제176조의2제3항).",
      );
    }
    landAcquisitionPrice = apportionAcquisitionPrice(landPresumedAcquisition, assumedDebtAmount, giftValuation.max);
    buildingAcquisitionPrice = apportionAcquisitionPrice(buildingPresumedAcquisition, assumedDebtAmount, giftValuation.max);
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
  const splitRealExpenseByNature = (debtApportionedTotal: number) =>
    splitBgRealExpenseByNature(debtApportionedTotal, capitalExpenditureRaw, realExpenseTotal, ctx);

  // STEP 5: 자산별 필요경비 슬롯 (estimatedDeduction)
  //   K-1~K-3·K-5·legacy: 개산공제 (취득가액 × 3%, §163⑥).
  //   K-4 (실지취득가): 개산공제 미적용 — 실비를 채무비율 안분 후 **성질별 시점 비율**로 자산 분배.
  let landEstimatedDeduction: number;
  /** §163⑥ 개산공제율 echo — 실비 안분 경로에서는 undefined (율 개념 없음). */
  let appliedEstimatedDeductionRate: number | undefined;
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
    landEstimatedDeduction = estimatedDeductionForBurdenedGift(landStdApportioned, isUnregistered, isRightToMoveInValuation);
    buildingEstimatedDeduction = estimatedDeductionForBurdenedGift(buildingStdApportioned, isUnregistered, isRightToMoveInValuation);
    // 율 echo — 표시 층이 「× 3%」를 다시 적으면 미등기(§163⑥1호 단서 3/1000)에서 적힌 산식이
    // 적힌 값을 만들지 못한다. **개산공제 경로에서만** 채운다 — 위 split 분기는 실비 안분이라
    // 율이라는 개념 자체가 없다.
    appliedEstimatedDeductionRate = isRightToMoveInValuation
      ? estimatedDeductionRate(isUnregistered, "right_to_move_in")
      : isUnregistered
        ? UNREGISTERED_ESTIMATED_DEDUCTION_RATE
        : REGISTERED_ESTIMATED_DEDUCTION_RATE;
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

  return {
    acquisitionMethodUsed,
    landMethod: acquisitionMethodUsed,
    buildingMethod: acquisitionMethodUsed,
    landAcquisitionPrice,
    buildingAcquisitionPrice,
    landActualAcquisition,
    buildingActualAcquisition,
    landPresumedAcquisition,
    buildingPresumedAcquisition,
    landEstimatedDeduction,
    buildingEstimatedDeduction,
    appliedEstimatedDeductionRate,
    landEstimatedDeductionRate: appliedEstimatedDeductionRate,
    buildingEstimatedDeductionRate: appliedEstimatedDeductionRate,
    necessaryExpenseSwap,
    // 실비를 명시 입력했으면 카드가 「(자본적지출 + 양도비) × 채무비율」을 적을 수 있게 입력값과 안분액을 싣는다(표시 전용 echo).
    ...(realExpenseDeclared
      ? { necessaryExpenseInput: { capitalExpenditure: capitalExpenditureRaw, transferExpense: transferExpenseRaw, debtApportioned: necessaryExpenseDebtTotal } }
      : {}),
    convertedAcquisitionBeforeSwap,
  };
}
