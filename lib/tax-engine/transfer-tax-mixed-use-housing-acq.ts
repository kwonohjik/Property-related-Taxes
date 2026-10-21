/**
 * 겸용주택 주택부분 환산취득가액 (STEP 3, §97 또는 §164⑦ PHD) — `transfer-tax-mixed-use-helpers.ts` 800줄 정책 분리(2026-10-14, #17-2b).
 * 로직·export 이름은 **종전 그대로**다. 헬퍼 파일이 같은 이름으로 재수출해 기존 import 경로를 유지한다
 * (memory `feedback_800line_split_export_preservation`).
 */
import { calculateEstimatedAcquisitionPrice } from "./tax-utils";
import { safeMultiplyThenDivide } from "./tax-utils";
import { calcPreHousingDisclosureGain } from "./transfer-tax-pre-housing-disclosure";
import {
  applyExprTotalDenominator,
  type ExprTotalValuationDetail,
} from "./transfer-tax-expropriation-valuation";
import {
  resolveHousingInheritedAcqDirect,
  resolveHousingInheritedAcqPhd,
  type InheritedAcquisitionDetail,
} from "./transfer-tax-mixed-use-inheritance";
import type { PreHousingDisclosureResult } from "./types/transfer.types";
import type { MixedUseAssetInput, MixedUseDerivedAreas } from "./types/transfer-mixed-use.types";
import { acqHousingStdNumerator } from "./mixed-use-housing-std";
import { multiplyByArea } from "./area-utils";

// ──────────────────────────────────────────────────────────────
// 3. 주택부분 환산취득가액 (STEP 3, §97 또는 §164⑦ PHD)
//    취득시 기준시가 = 취득시 개별주택공시가격
//    양도시 기준시가 = 양도시 개별주택공시가격
//    usePreHousingDisclosure=true 시 PHD 3-시점 알고리즘으로 취득시 주택가격 역산.
//    토지면적 = 주택부수토지(totalLandArea × residentialRatio) 자동 주입.
// ──────────────────────────────────────────────────────────────

export interface HousingEstimatedAcqResult {
  /** 주택부분 환산취득가액 */
  estimatedAcq: number;
  /**
   * §97 직접 환산 분기에서 실제로 쓴 **취득시 개별주택공시가격**(분수의 분자) — 표시 전용 echo.
   *
   * 종전에는 결과 카드가 이 분자를 **라벨만 적고 값 없이** 그렸다. 미공시(0)일 때
   * 「주택 환산취득가액 0 · 취득시 개별주택공시가격 ÷ 양도시 872,000,000」이 되어 사용자가
   * 0으로 잡힌 것인지 입력이 누락된 것인지 구별할 수 없었다(결과탭 코드리뷰 #077).
   * 바로 아래 상가분은 `acqStandardTotal` echo로 분자를 표시해 비대칭이 더 두드러졌다.
   *
   * 용도변경(상가→주택) 보정 **후**의 값이다 — 엔진이 분자로 넣은 그 값이라야 산식이 검산된다.
   */
  acqHousingStandardPrice?: number;
  /** PHD 모드에서 역산된 취득시 개별주택가격 (P_A_est) */
  phdAcqHousingPrice?: number;
  /** PHD 3-시점 산식 상세 (UI 표시용) */
  phdResult?: PreHousingDisclosureResult;
  /**
   * PHD §164⑦ 환산 분기 — `partialUsageChange` 결합 시에만 산출.
   *
   * - "case_a_whole_building": firstDisclosureDate < usageChangeDate.
   *   최초공시 시점에 아직 용도변경 전(전체 주택). Sum_A·Sum_F 에 전체 토지면적·전체 건물 사용.
   * - "case_b_housing_only": firstDisclosureDate ≥ usageChangeDate.
   *   최초공시 시점에 이미 겸용. 주택분만 사용.
   * - undefined: 일반 PHD (partialUsageChange 미사용).
   */
  phdScopeBranch?: "case_a_whole_building" | "case_b_housing_only";
  /** §164⑨1호 주택분 총액 특례 산출근거 (계획 P7/D8, 일반 §97 전용) — 적용 시만 */
  expropriationDetail?: ExprTotalValuationDetail;
  /** 상속 취득가액 산정 상세(소령 §163⑨) — acquisitionByInheritance=true일 때만 */
  inheritedAcquisitionDetail?: InheritedAcquisitionDetail;
  /** PHD 상속(§163⑨2호 max) 취득시 토지분 취득가액 — PHD+상속 분기 전용 */
  inheritedLandAcqPrice?: number;
  /** PHD 상속(§163⑨2호 max) 취득시 건물분 취득가액 — PHD+상속 분기 전용 */
  inheritedBuildingAcqPrice?: number;
}

export function calcHousingEstimatedAcq(
  housingTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
  acqDerived?: MixedUseDerivedAreas,
  /** 매매 실가 모드(useActualAcquisition) 취득가액 주택분 — 오케스트레이터 apportionAcquisitionPrice 산출값. */
  actualHousingAcqPrice?: number,
): HousingEstimatedAcqResult {
  // ─── 취득가액 총액 직접 안분 (법 §100²) — 실거래가(R1·§97①1호가목) 또는 감정/매매사례(R-B·§176의2②③) ───
  // 환산·PHD 미적용. 취득가액 총액을 취득시 기준시가 비율로 안분한 주택분을 직접 사용.
  // 개산공제 차이(실거래가=배제·감정/매매사례=적용)는 calcHousingGainSplit의 usesDeemedAcq에서 처리.
  // ⚠️ 미공시(PHD)·보유중용도변경·공익수용 조합은 미지원 — 안분 비율/시점 구조가 달라 별도 설계 필요.
  if (asset.useActualAcquisition || asset.useAppraisalSalesAcquisition) {
    const kind = asset.useActualAcquisition ? "취득 실거래가" : "감정가액·매매사례가액";
    if (asset.usePreHousingDisclosure || asset.partialUsageChange) {
      throw new Error(
        `겸용 ${kind} + 미공시(PHD)·보유 중 용도변경 조합은 아직 지원하지 않습니다. 환산취득가 모드로 입력하세요.`,
      );
    }
    if (asset.transferCause === "public_expropriation") {
      throw new Error(
        `겸용 ${kind} + 공익수용 특례 조합은 아직 지원하지 않습니다.`,
      );
    }
    return { estimatedAcq: actualHousingAcqPrice ?? 0 };
  }

  // §164⑦ PHD 분기 — 겸용주택의 주택부수토지 면적을 토지면적으로 사용
  if (asset.usePreHousingDisclosure && asset.preHousingDisclosure) {
    // 사용자가 면적을 직접 지정한 경우(최초 공시 당시 전체 주택 등) 우선 사용
    const effectiveLandArea =
      (asset.preHousingDisclosure.landArea ?? 0) > 0
        ? asset.preHousingDisclosure.landArea!
        : derived.residentialLandArea;

    // ─── 보유 중 일부 용도변경 + PHD 결합 시 시점별 면적·기준시가 영역 분기 (Case A/B) ───
    // Case A: firstDisclosureDate < usageChangeDate
    //   최초공시 시점에 아직 용도변경 전(전체 주택). P_F = 건물 전체(미래 상가 부분 포함)의 가격.
    //   → Sum_A·Sum_F 에 전체 토지면적·전체 건물 기준시가 사용
    //   → landAreaAtAcquisition = landAreaAtFirstDisclosure = totalLandArea
    // Case B: firstDisclosureDate ≥ usageChangeDate
    //   최초공시 시점에 이미 겸용. P_F = 주택분만의 가격.
    //   → Sum_A·Sum_F 에 주택분만 사용 (시점별 겸용 면적)
    //   → landAreaAtAcquisition·AtFirstDisclosure 는 시점별 주택부수토지
    let landAreaAtAcquisition: number | undefined;
    let landAreaAtFirstDisclosure: number | undefined;
    let landAreaAtTransfer: number | undefined;
    let phdScopeBranch: "case_a_whole_building" | "case_b_housing_only" | undefined;
    const usageChangeDate = asset.partialUsageChange?.usageChangeDate;
    if (usageChangeDate) {
      const firstDate = asset.preHousingDisclosure.firstDisclosureDate;
      const isCaseA = firstDate < usageChangeDate;
      phdScopeBranch = isCaseA ? "case_a_whole_building" : "case_b_housing_only";
      if (isCaseA) {
        // 취득·최초공시 시점에는 건물 전체가 주택 → 전체 토지면적 사용
        landAreaAtAcquisition = asset.totalLandArea;
        landAreaAtFirstDisclosure = asset.totalLandArea;
        landAreaAtTransfer = derived.residentialLandArea;
      } else if (acqDerived) {
        // Case B: 시점별 주택부수토지 사용
        landAreaAtAcquisition = acqDerived.residentialLandArea;
        landAreaAtFirstDisclosure = derived.residentialLandArea;
        landAreaAtTransfer = derived.residentialLandArea;
      }
    }

    // Case A 4부분 안분 자동 주입 — phdScopeBranch === "case_a_whole_building" 이고
    // 4부분 입력이 갖춰진 경우만. 양도시 상가건물은 transferStandardPrice.commercialBuildingPrice 자동 사용.
    // PHD 의 buildingStdPriceAtTransfer 필드가 이미 양도시 주택건물 기준시가(홈택스) 역할.
    const isCaseA = phdScopeBranch === "case_a_whole_building";
    const fourPartFields = isCaseA &&
      asset.preHousingDisclosure.commercialBuildingStdPriceAtAcq !== undefined &&
      asset.preHousingDisclosure.commercialBuildingStdPriceAtFirstDisclosure !== undefined &&
      asset.preHousingDisclosure.totalTransferPriceForFourPart !== undefined &&
      asset.preHousingDisclosure.totalTransferPriceForFourPart > 0
      ? {
          commercialBuildingStdPriceAtAcq: asset.preHousingDisclosure.commercialBuildingStdPriceAtAcq,
          commercialBuildingStdPriceAtFirstDisclosure: asset.preHousingDisclosure.commercialBuildingStdPriceAtFirstDisclosure,
          commercialBuildingStdPriceAtTransfer: asset.transferStandardPrice.commercialBuildingPrice,
          housingLandArea: derived.residentialLandArea,
          commercialLandArea: derived.commercialLandArea,
          totalTransferPriceForFourPart: asset.preHousingDisclosure.totalTransferPriceForFourPart,
        }
      : {};

    const phdResult = calcPreHousingDisclosureGain(housingTransferPrice, {
      ...asset.preHousingDisclosure,
      landArea: effectiveLandArea,
      landAreaAtAcquisition: asset.preHousingDisclosure.landAreaAtAcquisition ?? landAreaAtAcquisition,
      landAreaAtFirstDisclosure: asset.preHousingDisclosure.landAreaAtFirstDisclosure ?? landAreaAtFirstDisclosure,
      landAreaAtTransfer: asset.preHousingDisclosure.landAreaAtTransfer ?? landAreaAtTransfer,
      ownershipRatio: asset.ownershipRatio,
      isUnregistered: asset.isUnregistered,
      ...fourPartFields,
    });
    // 상속·증여 취득(소령 §163⑨2호) — 미공시 주택분 = max(신고가액, §164⑦ 환산). 4부분 조합은 Phase 2 범위 밖.
    if (asset.acquisitionByInheritance || asset.acquisitionByGift) {
      if (phdResult.fourPartApportionment) {
        throw new Error(
          "상속 취득 + PHD 4부분 안분(용도변경 결합) 조합은 아직 지원하지 않습니다 (Phase 2 예정).",
        );
      }
      const inherited = resolveHousingInheritedAcqPhd(asset, phdResult);
      return {
        estimatedAcq: inherited.estimatedAcq,
        phdAcqHousingPrice: phdResult.estimatedHousingPriceAtAcquisition,
        phdResult,
        phdScopeBranch,
        inheritedAcquisitionDetail: inherited.detail,
        inheritedLandAcqPrice: inherited.landAcqPrice,
        inheritedBuildingAcqPrice: inherited.buildingAcqPrice,
      };
    }

    // Case A 4부분 모드 — 주택부분 환산취득가는 D11+E11 합계 (housingAcqPriceSum)
    // 비4부분 모드 — 기존 totalEstimatedAcquisitionPrice (housingTransferPrice 기반 환산)
    const fp = phdResult.fourPartApportionment;
    const housingEstAcq = fp
      ? fp.housingAcqPriceSum
      : phdResult.totalEstimatedAcquisitionPrice;
    return {
      estimatedAcq: housingEstAcq,
      phdAcqHousingPrice: phdResult.estimatedHousingPriceAtAcquisition,
      phdResult,
      phdScopeBranch,
    };
  }

  // 상속 취득(소령 §163⑨ 본문) — 공시(비-PHD) 주택분은 fallback(reportedValue ?? stdCandidate).
  // 보유 중 용도변경(§166⑥ 안분) 조합은 Phase 2 범위 밖(가드) — §164⑨1호 공익수용 특례(exprVal)
  // 분모 계산에도 도달하지 않으므로 상속+공익수용 조합은 이 지점에서 자연 차단.
  if (asset.acquisitionByInheritance || asset.acquisitionByGift) {
    if (asset.partialUsageChange) {
      throw new Error(
        "상속·증여 취득 + 보유 중 용도변경 조합은 아직 지원하지 않습니다 (Phase 2 예정).",
      );
    }
    const inherited = resolveHousingInheritedAcqDirect(asset);
    return { estimatedAcq: inherited.estimatedAcq, inheritedAcquisitionDetail: inherited.detail };
  }

  // 기존 §97 직접 환산 — 토지·건물 취득일이 다르면 분자는 취득당시 주택가격 P(집행기준 99-164-9)
  let stdAtAcq = acqHousingStdNumerator(asset, acqDerived ?? derived);

  // ─── 보유 중 일부 용도변경 (상가→주택) — 시행령 §166⑥ 미러 ───
  // 취득시점에 주택이 없었으므로 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 안분.
  if (asset.partialUsageChange?.direction === "commercial_to_house") {
    const acqCommBuilding = asset.acquisitionStandardPrice.commercialBuildingPrice;
    const acqLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;
    const acqCommTotal = acqCommBuilding + multiplyByArea(acqLandPerSqm, asset.totalLandArea);
    const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
    // 면적 비율은 0.01㎡ 정수(`round2` 규약과 같은 단위)로 올려 분자·분모로 나눈다 — 소수 면적을 두 번 나누면 오차가 쌓여 참값이 정수일 때 1원 과소가 난다.
    stdAtAcq = totalFloor > 0
      ? safeMultiplyThenDivide(acqCommTotal, Math.round(asset.residentialFloorArea * 100), Math.round(totalFloor * 100))
      : 0;
    if (stdAtAcq === 0) {
      throw new Error(
        "용도변경(상가→주택): 취득시 상가 기준시가(건물+토지)가 0이거나 미입력. " +
          "취득시 상가건물 기준시가와 공시지가를 입력하세요.",
      );
    }
  }

  const rawStdAtTransfer = asset.transferStandardPrice.housingPrice;
  if (rawStdAtTransfer <= 0) {
    // 환산은 성립하지 않지만 분자는 이미 정해졌다 — 카드가 그 값을 보여줄 수 있어야 한다.
    return { estimatedAcq: 0, acqHousingStandardPrice: stdAtAcq };
  }
  // §164⑨1호 공익수용 특례 — 주택분(라목 개별주택가격 총액) 환산 분모만 낮춘다(안분 원값).
  // PHD 분기는 위에서 조기 반환하므로 여기(일반 §97)만 적용. 미충족 시 null → 현행 분모 유지.
  const exprVal = applyExprTotalDenominator({
    standardTotal: rawStdAtTransfer,
    compensationTotal: asset.housingCompensationTotal,
    compensationBasisTotal: asset.housingCompensationBasisTotal,
    isExpropriation: asset.transferCause === "public_expropriation",
    transferDate,
  });
  const stdAtTransfer = exprVal?.denominator ?? rawStdAtTransfer;
  return {
    estimatedAcq: calculateEstimatedAcquisitionPrice(
      housingTransferPrice,
      stdAtAcq,
      stdAtTransfer,
    ),
    // 분수의 분자를 그대로 echo한다 — 결과 카드가 값 없이 라벨만 그리던 자리다(#077).
    acqHousingStandardPrice: stdAtAcq,
    expropriationDetail: exprVal?.detail,
  };
}

