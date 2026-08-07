/**
 * 겸용주택 상가부분 환산취득가액 + 양도차익 분리 (STEP 7) — 800줄 정책 분리.
 *
 * `transfer-tax-mixed-use-helpers.ts`가 상속 취득(소령 §163⑨) 분기 추가로 800줄을 초과하여
 * 분리(2026-07-20). 형제 파일(`transfer-tax-mixed-use-fourpart.ts`·`-totals.ts`·`-period-split.ts`)과
 * 동일한 명명 관례. helpers.ts는 이 파일의 함수를 재export하여 기존 import 경로를 그대로 유지한다.
 */

import { estimatedDeductionRate } from "./legal-codes";
import { calculateEstimatedAcquisitionPrice, calculateHoldingPeriod, applyRate, computeEstimatedDeduction } from "./tax-utils";
import {
  applyExprTotalDenominator,
  type ExprTotalValuationDetail,
} from "./transfer-tax-expropriation-valuation";
import { buildCommercialGainSplitFromFourPart } from "./transfer-tax-mixed-use-fourpart";
import {
  resolveCommercialInheritedAcq,
  splitDeemedExpense,
  resolvePartNecessaryExpense,
  type InheritedAcquisitionDetail,
} from "./transfer-tax-mixed-use-inheritance";
import type { MixedUseAssetInput, MixedUseDerivedAreas } from "./types/transfer-mixed-use.types";
import type { HousingEstimatedAcqResult } from "./transfer-tax-mixed-use-helpers";
import { apportionAcquisitionPrice, apportionTransferPrice } from "./transfer-tax-mixed-use-helpers";

// ──────────────────────────────────────────────────────────────
// 상가부분 환산취득가액 + 양도차익 분리 (STEP 7)
// ──────────────────────────────────────────────────────────────

export interface CommercialGainSplit {
  estimatedAcqPrice: number;
  totalGain: number;
  landGain: number;
  buildingGain: number;
  landTransferPrice: number;
  buildingTransferPrice: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  landAppraisalDed: number;
  buildingAppraisalDed: number;
  /** 취득시 토지/건물 기준시가 — 개산공제 산식 표시용 */
  landStdPriceAtAcq?: number;
  buildingStdPriceAtAcq?: number;
  landHoldingYears: number;
  buildingHoldingYears: number;
  acqStandardSource: "user_input";
  acqStandardLand: number;
  acqStandardBuilding: number;
  /** §164⑨1호 상가분 토지 총액 특례 산출근거 (계획 P7/D8) — 적용 시만 */
  expropriationDetail?: ExprTotalValuationDetail;
  /** 상속 취득가액 산정 상세(소령 §163⑨) — acquisitionByInheritance=true일 때만 */
  inheritedAcquisitionDetail?: InheritedAcquisitionDetail;
}

export function calcCommercialGainSplit(
  commercialTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
  acqDerived?: MixedUseDerivedAreas,
  housingAcqResult?: HousingEstimatedAcqResult,
  /** 매매 실가 모드(useActualAcquisition) 취득가액 상가분 — 오케스트레이터 apportionAcquisitionPrice 산출값. */
  actualCommercialAcqPrice?: number,
  /** §97②2호 **단서** 적용 신호 (2026-08-07 W-8) — 주택분과 같은 의미. */
  swapToDirect?: boolean,
): CommercialGainSplit {
  // Case A 4부분 안분 — 별도 어댑터 호출
  const fp = housingAcqResult?.phdResult?.fourPartApportionment;
  if (fp) {
    return buildCommercialGainSplitFromFourPart(fp, asset, transferDate);
  }

  // 상속·증여·매매실가 취득 + §164⑨1호 공익수용 특례 조합 — 미지원(가드).
  // 상속·증여는 §163⑨ 실지거래가액 의제, 매매실가는 §100② 안분 — 둘 다 환산 분모 개념이 없다.
  if (
    (asset.acquisitionByInheritance || asset.acquisitionByGift || asset.useActualAcquisition || asset.useAppraisalSalesAcquisition) &&
    asset.transferCause === "public_expropriation"
  ) {
    throw new Error(
      "상속·증여·매매 실거래가·감정/매매사례 취득 + 공익수용 특례 조합은 아직 지원하지 않습니다.",
    );
  }

  // acqDerived 미주입 시 derived 그대로 사용 (backward compat)
  const effectiveAcqDerived = acqDerived ?? derived;

  // 양도시 상가부분 기준시가
  const transferLandStd =
    asset.transferStandardPrice.landPricePerSqm * derived.commercialLandArea;
  const transferTotalStd =
    transferLandStd + asset.transferStandardPrice.commercialBuildingPrice;

  // 취득시 상가부분 기준시가 — 사용자 직접 입력만 허용 (모든 direction 동일)
  // 과거 house_to_commercial 미입력 시 개별주택공시가격을 면적비율로 자동 안분하던 fallback은
  // 세법상 부정확하여 2026-05-01 제거. 미입력 시 명확한 오류로 차단.
  const userBuildingStd = asset.acquisitionStandardPrice.commercialBuildingPrice;
  const userLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;

  if (userBuildingStd <= 0 || userLandPerSqm <= 0) {
    if (asset.partialUsageChange?.direction === "house_to_commercial") {
      throw new Error(
        "보유 중 일부 용도변경(주택→상가): 취득시 상가건물 기준시가와 개별공시지가를 모두 입력하세요. " +
          "취득 당시 동일 건물의 국세청 고시 기준시가를 직접 조회·입력해야 합니다.",
      );
    }
    throw new Error(
      "겸용주택: 취득시 상가건물 기준시가와 개별공시지가를 모두 입력하세요.",
    );
  }

  // 토지분 = 단가 × 면적, 건물분 = 입력값.
  // house_to_commercial은 acqDerived.commercialLandArea = 0이므로 양도시 면적 사용.
  const landAreaForUserInput =
    asset.partialUsageChange?.direction === "house_to_commercial"
      ? derived.commercialLandArea
      : effectiveAcqDerived.commercialLandArea;
  const acqLandStd = userLandPerSqm * landAreaForUserInput;
  const acqBuildingStd = userBuildingStd;
  const acqStandardSource = "user_input" as const;

  const acqTotalStd = acqLandStd + acqBuildingStd;

  // §164⑨1호 공익수용 — 상가분 **토지 기준시가만** 낮춘 환산 분모(§80⑧ 건물분 미적용·안분 원값, D16-GB).
  // 상속 취득(실지거래가액 의제)은 환산 자체를 쓰지 않으므로 분모 계산을 생략(위 가드로 조합은 이미 차단).
  const commercialExprVal = (asset.acquisitionByInheritance || asset.acquisitionByGift || asset.useActualAcquisition || asset.useAppraisalSalesAcquisition)
    ? undefined
    : applyExprTotalDenominator({
        standardTotal: transferLandStd,
        compensationTotal: asset.commercialLandCompensationTotal,
        compensationBasisTotal: asset.commercialLandCompensationBasisTotal,
        isExpropriation: asset.transferCause === "public_expropriation",
        transferDate,
      });
  const transferTotalStdConv =
    (commercialExprVal?.denominator ?? transferLandStd) + asset.transferStandardPrice.commercialBuildingPrice;

  // 상속·증여 취득(소령 §163⑨ 본문) — 상가분(토지+건물 합계) fallback(reportedValue ?? acqTotalStd).
  // 그 외(비상속·비증여)는 기존 §97 환산취득가액 (분모 = 특례 적용 후 총액. 미적용 시 원 transferTotalStd와 동일)
  let estimatedAcqPrice: number;
  let inheritedAcquisitionDetail: InheritedAcquisitionDetail | undefined;
  if (asset.useActualAcquisition || asset.useAppraisalSalesAcquisition) {
    // 취득가액 총액 안분(법 §100²) — 실거래가(§97①1호가목) 또는 감정/매매사례(§176의2②③)의 상가분을 직접 사용(환산 아님).
    // 개산공제 차이(실거래가=배제·감정/매매사례=적용)는 아래 usesDeemedAcq에서 처리.
    estimatedAcqPrice = actualCommercialAcqPrice ?? 0;
  } else if (asset.acquisitionByInheritance || asset.acquisitionByGift) {
    const inherited = resolveCommercialInheritedAcq(asset, acqTotalStd);
    estimatedAcqPrice = inherited.estimatedAcqPrice;
    inheritedAcquisitionDetail = inherited.detail;
  } else {
    estimatedAcqPrice =
      transferTotalStdConv > 0
        ? calculateEstimatedAcquisitionPrice(commercialTransferPrice, acqTotalStd, transferTotalStdConv)
        : 0;
  }

  // 시행령 §166⑥: 양도가액은 양도시 비율, 취득가액은 취득시 비율로 안분 — **원값**(특례 미적용).
  const acqLandRatio = acqTotalStd > 0 ? acqLandStd / acqTotalStd : 0.5;
  const transferLandRatio = transferTotalStd > 0 ? transferLandStd / transferTotalStd : acqLandRatio;

  // 양도가액 안분 — 양도시 비율
  const landTransferPrice = Math.floor(commercialTransferPrice * transferLandRatio);
  const buildingTransferPrice = commercialTransferPrice - landTransferPrice;

  // 취득가액 안분 — 취득시 비율.
  // §97②2호 단서(나목) 채택 시에는 **차감하지 않는다**(가목에 이미 포함 — 이중차감 금지).
  const landAcqPrice = swapToDirect ? 0 : Math.floor(estimatedAcqPrice * acqLandRatio);
  const buildingAcqPrice = swapToDirect ? 0 : estimatedAcqPrice - landAcqPrice;

  // 개산공제 (§163⑥) — 상속·증여(실지거래가액 의제, 소령 §163⑨)·매매실가는 미적용.
  // 실제 필요경비(자본적지출·양도비)는 취득시 토지/건물 기준시가 비율로 안분(splitDeemedExpense).
  const dedRate = estimatedDeductionRate(asset.isUnregistered);
  const usesDeemedAcq = asset.acquisitionByInheritance || asset.acquisitionByGift || asset.useActualAcquisition;
  /**
   * 🔴 자산 단위 **공통** 자본적지출·양도비의 **상가분 안분분**(2026-08-07 W-3).
   * 주택분과 **같은 헬퍼·같은 축**을 쓴다 — 자본적지출=취득시 · 양도비=양도시(§100② 후문).
   */
  const commonCapexCommercial = apportionAcquisitionPrice(
    asset.capitalExpenditure ?? 0, asset, effectiveAcqDerived,
  ).commercialAcqPrice;
  const commonTransferExpCommercial = apportionTransferPrice(
    asset.transferExpense ?? 0, asset, derived,
  ).commercialTransferPrice;
  const necessaryExpensePair = () =>
    resolvePartNecessaryExpense({
      partDirect: swapToDirect ? undefined : asset.commercialInheritedExpense,
      commonCapitalExpenditure: commonCapexCommercial,
      commonTransferExpense: commonTransferExpCommercial,
      acqLandStd, acqBuildingStd,
      transferLandStd,
      transferBuildingStd: asset.transferStandardPrice.commercialBuildingPrice,
    });
  const { landAppraisalDed, buildingAppraisalDed } = usesDeemedAcq || swapToDirect
    ? necessaryExpensePair()
    : {
        // 상가분은 **가목(개별공시지가) + 나목(건물 기준시가)** 별도 공시라 결합 총액이 없다 →
        // 잔액 흡수 대상이 아니며 성분별 독립 산출이 정본이다(주택분과 다른 이유는 설계 §3 E2).
        landAppraisalDed: computeEstimatedDeduction(acqLandStd, dedRate, asset.ownershipRatio),
        buildingAppraisalDed: computeEstimatedDeduction(acqBuildingStd, dedRate, asset.ownershipRatio),
      };

  const landGain = landTransferPrice - landAcqPrice - landAppraisalDed;
  const buildingGain = buildingTransferPrice - buildingAcqPrice - buildingAppraisalDed;
  const totalGain = landGain + buildingGain;

  const { years: landHoldingYears } = calculateHoldingPeriod(
    asset.landAcquisitionDate,
    transferDate,
  );
  const { years: buildingHoldingYears } = calculateHoldingPeriod(
    asset.buildingAcquisitionDate,
    transferDate,
  );

  return {
    estimatedAcqPrice,
    totalGain,
    landGain,
    buildingGain,
    landTransferPrice,
    buildingTransferPrice,
    landAcqPrice,
    buildingAcqPrice,
    landAppraisalDed,
    buildingAppraisalDed,
    landStdPriceAtAcq: acqLandStd,
    buildingStdPriceAtAcq: acqBuildingStd,
    landHoldingYears,
    buildingHoldingYears,
    acqStandardSource,
    acqStandardLand: acqLandStd,
    acqStandardBuilding: acqBuildingStd,
    expropriationDetail: commercialExprVal?.detail,
    inheritedAcquisitionDetail,
  };
}
