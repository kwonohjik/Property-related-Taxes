/**
 * 겸용주택 — **주택부분** 토지/건물 양도차익 분리 (STEP 4).
 *
 * 주택 환산취득가액을 취득시 토지/건물 기준시가 비율로 재안분한다.
 * 소득세법 §100② (토지·건물 각각 구분 기장) / 소득령 §163⑥ (개산공제) / §95② (LTHD).
 *
 * `transfer-tax-mixed-use-helpers.ts`가 800줄을 넘어 분리(2026-07-28).
 * **상가부분(`transfer-tax-mixed-use-commercial.ts`)과 대칭 구조**다.
 * 기존 호출부의 import 경로는 helpers의 재export로 그대로 유지된다
 * (memory `feedback_800line_split_export_preservation`).
 */

import { estimatedDeductionRate } from "./legal-codes";
import { calculateHoldingPeriod, computeEstimatedDeduction } from "./tax-utils";
import { buildHousingGainSplitFromFourPart } from "./transfer-tax-mixed-use-fourpart";
import { splitDeemedExpense, resolvePartNecessaryExpense } from "./transfer-tax-mixed-use-inheritance";
import { apportionAcquisitionPrice, apportionTransferPrice } from "./transfer-tax-mixed-use-helpers";
import type { MixedUseAssetInput, MixedUseDerivedAreas } from "./types/transfer-mixed-use.types";
import type { HousingEstimatedAcqResult } from "./transfer-tax-mixed-use-helpers";

// ──────────────────────────────────────────────────────────────
// 4. 주택부분 토지/건물 양도차익 분리 (STEP 4)
//    주택 환산취득가액을 취득시 토지/건물 기준시가 비율로 재안분
// ──────────────────────────────────────────────────────────────

export interface HousingGainSplit {
  totalGain: number;
  landGain: number;
  buildingGain: number;
  landTransferPrice: number;
  buildingTransferPrice: number;
  landAcqPrice: number;
  buildingAcqPrice: number;
  landAppraisalDed: number;
  buildingAppraisalDed: number;
  landStdPriceAtAcq?: number;
  buildingStdPriceAtAcq?: number;
  landHoldingYears: number;
  buildingHoldingYears: number;
}

export function calcHousingGainSplit(
  housingTransferPrice: number,
  housingAcqResult: HousingEstimatedAcqResult,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
  acqDerived?: MixedUseDerivedAreas,
): HousingGainSplit {
  const housingEstimatedAcq = housingAcqResult.estimatedAcq;
  const effectiveAcqDerived = acqDerived ?? derived;

  // PHD 분기 — 산식 상세에서 토지/건물 안분값 직접 사용
  if (housingAcqResult.phdResult) {
    const phd = housingAcqResult.phdResult;
    // Case A 4부분 안분 — 별도 파일로 분리 (transfer-tax-mixed-use-fourpart.ts)
    if (phd.fourPartApportionment) {
      // 동적 import 대신 require 회피 — 상위 helpers는 4부분 어댑터를 직접 호출
      return buildHousingGainSplitFromFourPart(phd.fourPartApportionment, asset, transferDate);
    }

    // 상속(§163⑨2호 max) — 개산공제 미적용, 필요경비는 취득시 토지/건물 기준시가 비율로 안분(splitDeemedExpense).
    if (
      (asset.acquisitionByInheritance || asset.acquisitionByGift) &&
      housingAcqResult.inheritedLandAcqPrice !== undefined
    ) {
      const landAcqPrice = housingAcqResult.inheritedLandAcqPrice;
      const buildingAcqPrice = housingAcqResult.inheritedBuildingAcqPrice ?? 0;
      const { landAppraisalDed, buildingAppraisalDed } = splitDeemedExpense(
        asset.housingInheritedExpense ?? 0,
        phd.landHousingAtAcquisition,
        phd.buildingHousingAtAcquisition,
      );
      const landGain = phd.landTransferPrice - landAcqPrice - landAppraisalDed;
      const buildingGain = phd.buildingTransferPrice - buildingAcqPrice - buildingAppraisalDed;
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
        totalGain,
        landGain,
        buildingGain,
        landTransferPrice: phd.landTransferPrice,
        buildingTransferPrice: phd.buildingTransferPrice,
        landAcqPrice,
        buildingAcqPrice,
        landAppraisalDed,
        buildingAppraisalDed,
        landStdPriceAtAcq: phd.landHousingAtAcquisition,
        buildingStdPriceAtAcq: phd.buildingHousingAtAcquisition,
        landHoldingYears,
        buildingHoldingYears,
      };
    }

    const landGain = phd.landTransferPrice - phd.landAcquisitionPrice - phd.landLumpDeduction;
    const buildingGain =
      phd.buildingTransferPrice - phd.buildingAcquisitionPrice - phd.buildingLumpDeduction;
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
      totalGain,
      landGain,
      buildingGain,
      landTransferPrice: phd.landTransferPrice,
      buildingTransferPrice: phd.buildingTransferPrice,
      landAcqPrice: phd.landAcquisitionPrice,
      buildingAcqPrice: phd.buildingAcquisitionPrice,
      landAppraisalDed: phd.landLumpDeduction,
      buildingAppraisalDed: phd.buildingLumpDeduction,
      landStdPriceAtAcq: phd.landHousingAtAcquisition,
      buildingStdPriceAtAcq: phd.buildingHousingAtAcquisition,
      landHoldingYears,
      buildingHoldingYears,
    };
  }

  // 기존 §97 분기 — 시행령 §166⑥: 양도가액은 양도시 비율, 취득가액은 취득시 비율로 안분

  // 양도시 토지/건물 기준시가 (양도가액 안분용 — 분기 위에서 먼저 계산)
  // 개별주택공시가격은 토지+건물 일괄이므로, 양도시 토지분 = 공시지가 × 주택부수토지 면적,
  // 양도시 건물분 = 개별주택공시가격 - 토지분 (음수 방지).
  const transferLandStd =
    asset.transferStandardPrice.landPricePerSqm * derived.residentialLandArea;
  const transferHousingTotal = asset.transferStandardPrice.housingPrice;
  const transferBuildingStd = Math.max(transferHousingTotal - transferLandStd, 0);
  const transferTotal = transferLandStd + transferBuildingStd;

  // 취득시 토지/건물 기준시가 (취득가액 안분 + 개산공제 base)
  let acqLandStd: number;
  let acqBuildingStd: number;

  if (asset.partialUsageChange?.direction === "commercial_to_house") {
    // ─── 보유 중 일부 용도변경 (상가→주택) — 시행령 §166⑥ 미러 ───
    // 취득시점에 주택이 없었으므로 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 안분.
    // ※ MixedUseAssetInput.totalLandArea는 types L46에 명시 정의됨 (필드 존재 확인).
    const acqCommBuilding = asset.acquisitionStandardPrice.commercialBuildingPrice;
    const acqLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;
    // 가정: 취득시 토지면적 = 양도시 토지면적 (단순 용도변경 케이스)
    // 분필·합필·도로편입 시에는 사용자가 partialChangeAcqResidentialArea로 보정 가능
    const acqCommTotal = acqCommBuilding + Math.floor(acqLandPerSqm * asset.totalLandArea);
    const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
    const housRatio = totalFloor > 0 ? asset.residentialFloorArea / totalFloor : 0;
    const acqHousingTotal = Math.floor(acqCommTotal * housRatio);

    if (acqHousingTotal === 0) {
      throw new Error(
        "용도변경(상가→주택): 취득시 상가 기준시가(건물+토지)가 0이거나 미입력. " +
          "취득시 상가건물 기준시가와 공시지가를 입력하세요.",
      );
    }

    // 토지/건물 내부 분리 — 양도시 토지/건물 비율 차용 (취득시 분리값 없음)
    const transferLandRatioForFallback = transferTotal > 0 ? transferLandStd / transferTotal : 0.5;
    acqLandStd = Math.floor(acqHousingTotal * transferLandRatioForFallback);
    acqBuildingStd = acqHousingTotal - acqLandStd;
  } else {
    // 기존 일반 겸용주택 분기
    acqLandStd =
      asset.acquisitionStandardPrice.landPricePerSqm * effectiveAcqDerived.residentialLandArea;
    const acqHousingTotal = asset.acquisitionStandardPrice.housingPrice ?? 0;
    acqBuildingStd = Math.max(acqHousingTotal - acqLandStd, 0);
  }

  const acqTotal = acqLandStd + acqBuildingStd;
  const acqLandRatio = acqTotal > 0 ? acqLandStd / acqTotal : 0.5;
  const transferLandRatio = transferTotal > 0 ? transferLandStd / transferTotal : acqLandRatio;

  // 양도가액 안분 — 양도시 비율
  const landTransferPrice = Math.floor(housingTransferPrice * transferLandRatio);
  const buildingTransferPrice = housingTransferPrice - landTransferPrice;

  // 취득가액 안분 — 취득시 비율
  const landAcqPrice = Math.floor(housingEstimatedAcq * acqLandRatio);
  const buildingAcqPrice = housingEstimatedAcq - landAcqPrice;

  // 개산공제(§163⑥, 취득시 기준시가 × 3%). 상속·증여(§163⑨)·매매실가는 미적용 —
  // 실제 필요경비(자본적지출·양도비)를 취득시 토지/건물 기준시가 비율로 안분(splitDeemedExpense).
  // 공유지분 축소만 적용한다 — 성분별 독립 floor가 정본이며 잔액 흡수는 하지 않는다
  // (§166⑥ 구분 계산. `transfer-tax-pre-housing-disclosure.ts` Step 7 주석 참조).
  const dedRate = estimatedDeductionRate(asset.isUnregistered);
  const housingLumpPair = {
    landAppraisalDed: computeEstimatedDeduction(acqLandStd, dedRate, asset.ownershipRatio),
    buildingAppraisalDed: computeEstimatedDeduction(acqBuildingStd, dedRate, asset.ownershipRatio),
  };
  const usesDeemedAcq = asset.acquisitionByInheritance || asset.acquisitionByGift || asset.useActualAcquisition;
  /**
   * 🔴 자산 단위 **공통** 자본적지출·양도비의 **주택분 안분분**(2026-08-07 W-3).
   *
   * 「소득세법」 제100조 제2항 후문 — 「공통되는 취득가액과 **양도비용**은 **해당 자산의 가액에
   * 비례하여** 안분계산한다」. 성질에 따라 축이 갈린다(같은 항 본문 「취득 **또는** 양도 당시」):
   *   · 자본적지출 → `apportionAcquisitionPrice`(**취득시** 기준시가)
   *   · 양도비     → `apportionTransferPrice`(**양도시** 기준시가)
   * 두 헬퍼는 이미 취득가액·양도가액 안분에 쓰는 **같은 함수**다 — 축을 새로 만들지 않는다.
   */
  const commonCapexHousing = apportionAcquisitionPrice(
    asset.capitalExpenditure ?? 0, asset, effectiveAcqDerived,
  ).housingAcqPrice;
  const commonTransferExpHousing = apportionTransferPrice(
    asset.transferExpense ?? 0, asset, derived,
  ).housingTransferPrice;
  const { landAppraisalDed, buildingAppraisalDed } = usesDeemedAcq
    ? resolvePartNecessaryExpense({
        partDirect: asset.housingInheritedExpense,
        commonCapitalExpenditure: commonCapexHousing,
        commonTransferExpense: commonTransferExpHousing,
        acqLandStd, acqBuildingStd, transferLandStd, transferBuildingStd,
      })
    : housingLumpPair;

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
  };
}
