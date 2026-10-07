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
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { isBuildingDayLandPriceRequired } from "./mixed-use-acq-date";
import {
  isHousingBuildingStdAtAcqRequired,
  isHousingBuildingStdAtTransferRequired,
  isHousingPriceAtAcqRequired,
  isHousingPriceAtTransferRequired,
  splitMixedUseHousingStd,
} from "./mixed-use-housing-std";
import { apportionByStdPrice } from "./std-price-apportion";
import { mixedPartAcqNeedsOf } from "./mixed-use-part-acq";
import type { MixedUseHousingStdSplitDetail } from "./types/transfer-mixed-use.types";

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
  /** S3-2 — 비-PHD·비-4부분 경로의 가목:나목 비례 분할 echo (취득·양도). */
  housingStdSplit?: { acq?: MixedUseHousingStdSplitDetail; transfer?: MixedUseHousingStdSplitDetail };
  landHoldingYears: number;
  buildingHoldingYears: number;
}

/**
 * 🔴 §97②2호 **단서**(나목 채택)를 **PHD 경로** split에 반영한다 — 2026-08-13 F18.
 *
 * PHD 분기(§164⑦ 미공시)는 조기 return이라 아래 §97 분기의 `swapToDirect` 처리
 * (취득가액 슬롯 0 + 필요경비 = 나목 안분분)에 **한 번도 도달하지 못했다**. 결과적으로
 * 주택분만 본문(환산취득가 + 개산공제)으로 남아 자산 전체 필요경비가 「본문 + 단서」
 * 하이브리드가 됐고, 나목은 상가분이 전액 흡수했다.
 *
 * 비-PHD 분기와 **같은 규칙**을 적용한다:
 *   · 취득가액 슬롯 = **0** — 가목이 「환산취득가액 + 개산공제」의 **합계액**이므로
 *     나목 채택 시 취득가액을 따로 빼면 이중차감이다.
 *   · 필요경비 = 나목의 **이 파트 안분분**. 성질별로 축이 갈린다(「소득세법」 §100② 본문·후문):
 *       자본적지출(§97①2호) → **취득시** 기준시가 · 양도비(§97①3호) → **양도시** 기준시가
 *
 * ⚠️ PHD + 상속·증여 분기는 오케스트레이터의 `provisoEligible`이 false라 여기 도달하지 않는다
 *    (§163⑨ 실지거래가액 의제는 단서 대상이 아니다).
 */
function applyHousingProviso(
  base: HousingGainSplit,
  args: {
    asset: MixedUseAssetInput;
    derived: MixedUseDerivedAreas;
    acqDerived: MixedUseDerivedAreas;
    acqLandStd: number;
    acqBuildingStd: number;
    transferLandStd: number;
    transferBuildingStd: number;
    /** PHD 모드에서 부재한 취득시 개별주택가격 축 복원 (`apportionAcquisitionPrice` 참조). */
    acqStdOverride: { housingStd?: number; commercialStd?: number };
  },
): HousingGainSplit {
  const { landAppraisalDed, buildingAppraisalDed } = resolvePartNecessaryExpense({
    partDirect: undefined,
    commonCapitalExpenditure: apportionAcquisitionPrice(
      args.asset.capitalExpenditure ?? 0,
      args.asset,
      args.acqDerived,
      args.acqStdOverride,
    ).housingAcqPrice,
    commonTransferExpense: apportionTransferPrice(
      args.asset.transferExpense ?? 0,
      args.asset,
      args.derived,
    ).housingTransferPrice,
    acqLandStd: args.acqLandStd,
    acqBuildingStd: args.acqBuildingStd,
    transferLandStd: args.transferLandStd,
    transferBuildingStd: args.transferBuildingStd,
  });
  const landGain = base.landTransferPrice - landAppraisalDed;
  const buildingGain = base.buildingTransferPrice - buildingAppraisalDed;
  return {
    ...base,
    landAcqPrice: 0,
    buildingAcqPrice: 0,
    landAppraisalDed,
    buildingAppraisalDed,
    landGain,
    buildingGain,
    totalGain: landGain + buildingGain,
  };
}

export function calcHousingGainSplit(
  housingTransferPrice: number,
  housingAcqResult: HousingEstimatedAcqResult,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
  acqDerived?: MixedUseDerivedAreas,
  /**
   * §97②2호 **단서** 적용 신호 (2026-08-07 W-8).
   * true면 **취득가액을 차감하지 않고**(가목이 환산취득가+개산공제의 **합계액**이므로
   * 나목 채택 시 별도 차감은 이중차감), 필요경비를 **나목**(자본적지출+양도비의 이 파트 안분분)으로 한다.
   * 판정은 오케스트레이터가 **자산 단위**로 한다(`general-building-swap.ts:144-148` 교리).
   */
  swapToDirect?: boolean,
): HousingGainSplit {
  const housingEstimatedAcq = housingAcqResult.estimatedAcq;
  const effectiveAcqDerived = acqDerived ?? derived;
  // B1 — 파트 모델이면 무엇이 쓰이는가(총액 모델은 undefined = 기존 술어 불변)
  const partAcqNeeds = mixedPartAcqNeedsOf(asset);

  // PHD 분기 — 산식 상세에서 토지/건물 안분값 직접 사용
  if (housingAcqResult.phdResult) {
    const phd = housingAcqResult.phdResult;
    // Case A 4부분 안분 — 별도 파일로 분리 (transfer-tax-mixed-use-fourpart.ts)
    if (phd.fourPartApportionment) {
      // 동적 import 대신 require 회피 — 상위 helpers는 4부분 어댑터를 직접 호출
      const fp = phd.fourPartApportionment;
      const fpSplit = buildHousingGainSplitFromFourPart(fp, asset, transferDate);
      if (!swapToDirect) return fpSplit;
      // 4부분도 취득·양도 시점 기준시가가 fp 안에 4갈래로 다 있으므로 그 축을 그대로 쓴다.
      return applyHousingProviso(fpSplit, {
        asset,
        derived,
        acqDerived: effectiveAcqDerived,
        acqLandStd: fp.housingLandStdAtAcq,
        acqBuildingStd: fp.housingBuildingStdAtAcq,
        transferLandStd: fp.housingLandStdAtTransfer,
        transferBuildingStd: fp.housingBuildingStdAtTransfer,
        acqStdOverride: {
          housingStd: fp.housingLandStdAtAcq + fp.housingBuildingStdAtAcq,
          commercialStd: fp.commercialLandStdAtAcq + fp.commercialBuildingStdAtAcq,
        },
      });
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
    const phdSplit: HousingGainSplit = {
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
    if (!swapToDirect) return phdSplit;
    // §97②2호 단서(나목) — 취득시 축은 PHD가 역산한 취득시 개별주택가격(P_A_est)과
    // 그 토지/건물 성분(`land/buildingHousingAtAcquisition`, 합 = P_A_est)이다.
    return applyHousingProviso(phdSplit, {
      asset,
      derived,
      acqDerived: effectiveAcqDerived,
      acqLandStd: phd.landHousingAtAcquisition,
      acqBuildingStd: phd.buildingHousingAtAcquisition,
      // 양도비 안분 축 — PHD 자체 양도시 분할(양도가액 안분과 같은 척도). 종전에는 PHD 분기 위에서
      // 호이스팅한 `H_T − 가목` 뺄셈값을 써서 한 자산 안에 비례(양도가액)·뺄셈(양도비)이 섞였다(S3-2 Q-C).
      transferLandStd: phd.landHousingAtTransfer,
      transferBuildingStd: phd.buildingHousingAtTransfer,
      acqStdOverride: { housingStd: phd.estimatedHousingPriceAtAcquisition },
    });
  }

  // 기존 §97 분기 — 시행령 §166⑥: 양도가액은 양도시 비율, 취득가액은 취득시 비율로 안분

  // ─── 양도시 주택분 토지/건물 분할 (S3-2 — 뺄셈 `H_T − 가목` → 가목:나목 비례) ───
  // 개별주택공시가격은 토지+건물 일괄이므로 가목(공시지가 × 주택부수토지 면적):나목(주택건물 기준시가)
  // 비율로 나눈다. 양도가액 안분·양도비 안분 축·(상가→주택 용도변경의) 취득시 주택 합계 분할이 이 값을 쓴다.
  // 나목이 없으면 뺄셈으로 후퇴하지 않고 차단한다(자동 안분 fallback 금지). PHD는 위에서 이미 분기했다.
  const transferBuildingStdInput = asset.transferStandardPrice.housingBuildingPrice;
  if (
    // PHD 분기는 위에서 이미 return했다 — 여기 도달하면 PHD 환산 결과(phdResult)가 없다(토글만 켠 비정상 입력 포함).
    isHousingBuildingStdAtTransferRequired({ usePhd: housingAcqResult.phdResult !== undefined }) &&
    !(transferBuildingStdInput !== undefined && transferBuildingStdInput > 0)
  ) {
    throw new Error(
      "겸용주택: 양도시 주택건물 기준시가(나목, transferStandardPrice.housingBuildingPrice)가 필요합니다. " +
        "양도시 주택의 토지분·건물분은 개별주택가격을 가목(개별공시지가 × 주택부수토지 면적):나목(주택건물 기준시가) 비율로 나눕니다.",
    );
  }
  // 양도시 개별주택가격(H_T)도 필수 — 없으면 가목:나목 원값 비율로 대신하지 않고 차단한다(Q-B는 취득시 상속·증여 한정).
  if (
    isHousingPriceAtTransferRequired({ usePhd: housingAcqResult.phdResult !== undefined }) &&
    !(asset.transferStandardPrice.housingPrice > 0)
  ) {
    throw new Error(
      "겸용주택: 양도시 개별주택가격(transferStandardPrice.housingPrice)이 필요합니다. " +
        "양도시 주택의 토지분·건물분은 이 가격을 가목:나목 비율로 나눕니다.",
    );
  }
  const transferSplit = splitMixedUseHousingStd({
    housingTotal: asset.transferStandardPrice.housingPrice,
    landStd: multiplyByArea(asset.transferStandardPrice.landPricePerSqm, derived.residentialLandArea),
    buildingStd: transferBuildingStdInput as number,
  });
  const transferLandStd = transferSplit.landBasis;
  const transferBuildingStd = transferSplit.buildingBasis;
  const transferTotal = transferLandStd + transferBuildingStd;
  let acqSplit: MixedUseHousingStdSplitDetail | undefined;

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
    const acqCommTotal = acqCommBuilding + multiplyByArea(acqLandPerSqm, asset.totalLandArea);
    const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
    const housRatio = totalFloor > 0 ? asset.residentialFloorArea / totalFloor : 0;
    const acqHousingTotal = Math.floor(acqCommTotal * housRatio);

    if (acqHousingTotal === 0) {
      throw new Error(
        "용도변경(상가→주택): 취득시 상가 기준시가(건물+토지)가 0이거나 미입력. " +
          "취득시 상가건물 기준시가와 공시지가를 입력하세요.",
      );
    }

    // 토지/건물 내부 분리 — 양도시 가목:나목 분할 비율 차용 (취득시 분리값 없음 · 집행기준 99-164-10).
    // 취득시 나목은 요구하지 않는다(그 시점에 주택 건물이 없다) — 양도시 나목만 필요.
    const borrowed = apportionByStdPrice(acqHousingTotal, transferLandStd, transferBuildingStd);
    acqLandStd = borrowed.land;
    acqBuildingStd = borrowed.building;
  } else if (partAcqNeeds !== undefined && !partAcqNeeds.housingPriceAtAcq) {
    // B1 파트 모델 — 양쪽 실가(+경비 선언 없음)는 취득시 개별주택가격·건물 취득일 공시지가·γ1 basis가 쓰이지 않는다.
    // (`mixedPartAcqNeeds`: H_A·L_b 요구와 같은 술어 — 소비처가 없으면 요구도, 계산도 하지 않는다.)
    acqLandStd = 0;
    acqBuildingStd = 0;
  } else {
    // 기존 일반 겸용주택 분기
    const acqLandRaw = multiplyByArea(
      asset.acquisitionStandardPrice.landPricePerSqm,
      effectiveAcqDerived.residentialLandArea,
    );
    const acqHousingTotal = asset.acquisitionStandardPrice.housingPrice ?? 0;
    const acqBuildingStdInput = asset.acquisitionStandardPrice.housingBuildingPrice;
    if (
      isHousingBuildingStdAtAcqRequired({
        usePhd: housingAcqResult.phdResult !== undefined,
        partialDirection: asset.partialUsageChange?.direction,
        partAcqNeeds,
      }) &&
      !(acqBuildingStdInput !== undefined && acqBuildingStdInput > 0)
    ) {
      throw new Error(
        "겸용주택: 취득시 주택건물 기준시가(나목, acquisitionStandardPrice.housingBuildingPrice)가 필요합니다. " +
          "취득시 주택의 토지분·건물분은 개별주택가격을 가목(개별공시지가 × 주택부수토지 면적):나목(주택건물 기준시가) " +
          "비율로 나눕니다. 토지·건물 취득일이 다르면 건물 취득일 기준 나목입니다.",
      );
    }
    // 🔴 B0 — 개별주택가격은 **건물 취득일** 공시 결합가다. 토지·건물 취득일이 다르면 그 가격을 토지 취득일로
    // 옮길 비율의 분모에 **같은 날(건물 취득일)** 가목·나목을 쓴다(토지 취득일 값으로 대체 금지). 토지분도 원값이 아니라
    // 「취득당시 주택가격」의 비례 몫이다(Q-A γ1 — 양도소득세 집행기준 99-164-9의 절차, `splitMixedUseHousingStd`).
    const buildingDayRequired = isBuildingDayLandPriceRequired({
      landDate: asset.landAcquisitionDate,
      buildingDate: asset.buildingAcquisitionDate,
      usePhd: asset.usePreHousingDisclosure,
      partialDirection: asset.partialUsageChange?.direction,
      housingPrice: acqHousingTotal,
      partAcqNeeds,
    });
    let landStdAtBuildingDay: number | undefined;
    if (buildingDayRequired) {
      const landPerSqmAtBuildingAcq = asset.acquisitionStandardPrice.landPricePerSqmAtBuildingAcq;
      if (landPerSqmAtBuildingAcq === undefined || !(landPerSqmAtBuildingAcq > 0)) {
        throw new Error(
          "겸용주택: 토지·건물 취득일이 달라 건물 취득일 기준 주택부수토지 개별공시지가" +
            "(acquisitionStandardPrice.landPricePerSqmAtBuildingAcq)가 필요합니다. " +
            "토지 취득일 기준 공시지가로 대신할 수 없습니다.",
        );
      }
      landStdAtBuildingDay = multiplyByArea(landPerSqmAtBuildingAcq, effectiveAcqDerived.residentialLandArea);
    }
    // 취득시 개별주택가격(H_A) — 상속·증여 외에는 필수(환산 분자이기도 하다). 없으면 원값 비율로 대신하지 않고 차단.
    const byInheritanceOrGift = asset.acquisitionByInheritance === true || asset.acquisitionByGift === true;
    if (
      isHousingPriceAtAcqRequired({
        usePhd: housingAcqResult.phdResult !== undefined,
        partialDirection: asset.partialUsageChange?.direction,
        byInheritanceOrGift,
        partAcqNeeds,
      }) &&
      !(acqHousingTotal > 0)
    ) {
      throw new Error(
        "겸용주택: 취득시 개별주택가격(acquisitionStandardPrice.housingPrice)이 필요합니다. " +
          "취득시 주택의 토지분·건물분은 이 가격을 가목:나목 비율로 나눕니다(상속·증여 신고가액 취득만 예외).",
      );
    }
    // H 없음은 상속·증여 신고가액 취득(Q-B)에서만 — 가목:나목 원값 비율로 나눠 「전부 토지분」 침묵 오배분을 없앤다.
    // 나목은 위에서 > 0임이 확인됐다(필수 경로) — PHD·c2h는 이 분기에 오지 않는다.
    acqSplit = splitMixedUseHousingStd({
      allowRawRatio: byInheritanceOrGift,
      housingTotal: acqHousingTotal,
      landStd: acqLandRaw,
      buildingStd: acqBuildingStdInput as number,
      ...(landStdAtBuildingDay !== undefined ? { landStdAtBuildingDay } : {}),
    });
    acqLandStd = acqSplit.landBasis;
    acqBuildingStd = acqSplit.buildingBasis;
  }

  const acqTotal = acqLandStd + acqBuildingStd;
  const acqLandRatio = acqTotal > 0 ? acqLandStd / acqTotal : 0.5;
  const transferLandRatio = transferTotal > 0 ? transferLandStd / transferTotal : acqLandRatio;

  // 양도가액 안분 — 양도시 비율
  const landTransferPrice = Math.floor(housingTransferPrice * transferLandRatio);
  const buildingTransferPrice = housingTransferPrice - landTransferPrice;

  // 취득가액 안분 — 취득시 비율.
  // §97②2호 단서(나목) 채택 시에는 **차감하지 않는다**(가목에 이미 포함 — 이중차감 금지).
  const landAcqPrice = swapToDirect ? 0 : Math.floor(housingEstimatedAcq * acqLandRatio);
  const buildingAcqPrice = swapToDirect ? 0 : housingEstimatedAcq - landAcqPrice;

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
  const necessaryExpensePair = () =>
    resolvePartNecessaryExpense({
      partDirect: swapToDirect ? undefined : asset.housingInheritedExpense,
      commonCapitalExpenditure: commonCapexHousing,
      commonTransferExpense: commonTransferExpHousing,
      acqLandStd, acqBuildingStd, transferLandStd, transferBuildingStd,
    });
  const { landAppraisalDed, buildingAppraisalDed } =
    usesDeemedAcq || swapToDirect ? necessaryExpensePair() : housingLumpPair;

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
    housingStdSplit: { ...(acqSplit ? { acq: acqSplit } : {}), transfer: transferSplit },
    landHoldingYears,
    buildingHoldingYears,
  };
}
