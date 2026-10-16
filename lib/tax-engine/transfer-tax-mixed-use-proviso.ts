/**
 * 겸용주택 STEP 7.5 — §97②2호 단서(가목·나목 택일), 자산 단위 표준 경로.
 *
 * `transfer-tax-mixed-use.ts` 800줄 정책 분리(2026-10-16) — 로직은 오케스트레이터에서 **그대로** 옮겼다(동작 불변).
 * 근거 주석(비교 단위·환산 경로 전용·감정가액 제외 F19)은 오케스트레이터 STEP 7.5 블록 주석이 정본이다.
 */
import {
  calcHousingGainSplit,
  calcCommercialGainSplit,
  type HousingEstimatedAcqResult,
  type HousingGainSplit,
  type CommercialGainSplit,
  type computeDerivedAreas,
  type computeAcqDerivedAreas,
} from "./transfer-tax-mixed-use-helpers";
import type { MixedUseApportionment, MixedUseAssetInput, MixedUseGainBreakdown } from "./types/transfer-mixed-use.types";

export function applyStandardProviso(args: {
  asset: MixedUseAssetInput;
  apportionment: MixedUseApportionment;
  housingAcqResult: HousingEstimatedAcqResult;
  derived: ReturnType<typeof computeDerivedAreas>;
  transferDate: Date;
  acqDerived: ReturnType<typeof computeAcqDerivedAreas>;
  acqApportionment: { commercialAcqPrice: number } | undefined;
  housingGainSplit: HousingGainSplit;
  commercialGainSplit: CommercialGainSplit;
}): {
  housing: HousingGainSplit;
  commercial: CommercialGainSplit;
  proviso: MixedUseGainBreakdown["necessaryExpenseProviso"];
} {
  const { asset, apportionment, housingAcqResult, derived, transferDate, acqDerived, acqApportionment } = args;
  let housing = args.housingGainSplit;
  let commercial = args.commercialGainSplit;
  const provisoEligible =
    !asset.acquisitionByInheritance &&
    !asset.acquisitionByGift &&
    !asset.useActualAcquisition &&
    !asset.useAppraisalSalesAcquisition;
  const provisoDeclared =
    asset.capitalExpenditure !== undefined || asset.transferExpense !== undefined;
  if (!(provisoEligible && provisoDeclared)) return { housing, commercial, proviso: undefined };

  const gamok =
    housing.landAcqPrice + housing.buildingAcqPrice +
    housing.landAppraisalDed + housing.buildingAppraisalDed +
    commercial.landAcqPrice + commercial.buildingAcqPrice +
    commercial.landAppraisalDed + commercial.buildingAppraisalDed;
  const namok = (asset.capitalExpenditure ?? 0) + (asset.transferExpense ?? 0);
  // 동률(==)은 본문 — 단서가 「적은 경우」로 명시한다(일반건물·상업용·부담부증여와 같은 판정).
  const chosen: "estimated" | "direct" = namok > gamok ? "direct" : "estimated";
  if (chosen === "direct") {
    housing = calcHousingGainSplit(
      apportionment.housingTransferPrice, housingAcqResult, asset, derived, transferDate,
      acqDerived, true,
    );
    commercial = calcCommercialGainSplit(
      apportionment.commercialTransferPrice, asset, derived, transferDate, acqDerived,
      housingAcqResult, acqApportionment?.commercialAcqPrice, true,
    );
  }
  return { housing, commercial, proviso: { estimatedSide: gamok, directSide: namok, chosen } };
}
