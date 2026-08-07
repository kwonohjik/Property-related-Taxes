/**
 * 겸용주택 — **표시용 step·계산경로 메타 빌더**.
 *
 * `transfer-tax-mixed-use.ts`가 800줄 정책을 넘겨(821줄, 2026-08-07 W-8) 분리했다.
 * **로직 무변경 이전**이며, 오케스트레이터가 전부 재수출해 기존 import 경로를 유지한다
 * (메모리 `feedback_800line_split_export_preservation`).
 */

import { calculateHoldingPeriod } from "./tax-utils";
import { MIXED_USE } from "./legal-codes/transfer";
import type {
  MixedUseAssetInput,
  MixedUseGainBreakdown,
  MixedUseApportionment,
  MixedUseStep,
  MixedUseCalculationRoute,
} from "./types/transfer-mixed-use.types";
import type {
  buildHousingPart,
  buildCommercialPart,
  buildNonBusinessPart,
  calcExcessLandRatio,
} from "./transfer-tax-mixed-use-helpers";
import type { computeDerivedAreas } from "./transfer-tax-mixed-use-helpers";
import type { buildTotalTax } from "./transfer-tax-mixed-use-totals";


// ──────────────────────────────────────────
// 계산 경로 메타 빌더
// ──────────────────────────────────────────

export function buildCalculationRoute(
  asset: MixedUseAssetInput,
  housingPart: ReturnType<typeof buildHousingPart>,
  excessResult: ReturnType<typeof calcExcessLandRatio>,
  commercialPart: ReturnType<typeof buildCommercialPart>,
  // 표2 게이트에 실제로 쓴 통산 거주 연수 — 재계산 없이 주입받아 표시-계산 drift 차단.
  table2ResidenceYears: number,
  /** §154① 보유요건까지 반영한 최종 비과세 적용 여부 — 오케스트레이터 1회 판정값. */
  isOneHouseExempt: boolean,
): MixedUseCalculationRoute {
  const acqHousing = asset.acquisitionStandardPrice.housingPrice;
  const housingAcqPriceSource =
    asset.usePreHousingDisclosure
      ? ("phd_auto" as const)
      : acqHousing && acqHousing > 0
        ? ("direct_input" as const)
        : ("missing" as const);

  // 취득가액 산정 경로 — 상속·증여(§163⑨)·매매실가(§100²)·환산(§176의2) 분기.
  // 매매실가(useActualAcquisition)는 PHD 미적용(실가 모드는 위 엔진에서 PHD 조합 throw)이라 단일 값.
  const acquisitionConversionRoute = asset.useActualAcquisition
    ? ("section97_actual" as const)
    : asset.useAppraisalSalesAcquisition
    ? ("section176_2_appraisal_sales" as const)
    : asset.acquisitionByInheritance
      ? asset.usePreHousingDisclosure
        ? ("inheritance_phd_max" as const)
        : ("inheritance_direct" as const)
      : asset.acquisitionByGift
        ? asset.usePreHousingDisclosure
          ? ("gift_phd_max" as const)
          : ("gift_direct" as const)
        : asset.usePreHousingDisclosure
          ? ("phd_corrected" as const)
          : ("section97_direct" as const);

  // 표2 게이트는 통산 거주(§154⑧3호) — 사유 서술도 게이트 값으로(통산 케이스에서 "실거주 0년 ≥2년" 모순 방지).
  const housingDeductionTableReason =
    housingPart.longTermDeductionTable === 2
      ? `거주(통산) ${table2ResidenceYears}년 ≥ 2년 → 표2 (보유×4% + 거주×4%, 최대 80%)`
      : `거주(통산) ${table2ResidenceYears}년 < 2년 → 표1 (보유×2%, 최대 30%)`;

  const zoneLabel = asset.zoneType ?? "residential";
  const metroLabel = asset.isMetropolitanArea === false ? "수도권 외" : "수도권";
  const landMultiplierReason = `${metroLabel} ${zoneLabel} → ${excessResult.multiplier}배 (시행령 §168의12)`;

  // 🚨 Critical: 다주택자·§154① 보유요건 미충족(isOneHouseExempt === false)
  //    → non_one_house_full_taxation. 판정은 오케스트레이터가 1회 수행해 주입받는다
  //    (재도출 시 표시-계산 drift — memory `feedback_engine_result_display_drift`).
  const highValueRule = !isOneHouseExempt
    ? ("non_one_house_full_taxation" as const)
    : housingPart.isExempt
      ? ("below_threshold_exempt" as const)
      : ("above_threshold_prorated" as const);

  // 보유 중 일부 용도변경 사유 (사전 정의 템플릿)
  const partialUsageChangeReason = asset.partialUsageChange
    ? buildPartialUsageChangeReason(
        asset.partialUsageChange.direction,
        commercialPart.acqStandardSource,
      )
    : undefined;

  return {
    housingAcqPriceSource,
    acquisitionConversionRoute,
    housingDeductionTableReason,
    landMultiplierReason,
    highValueRule,
    partialUsageChangeReason,
  };
}

/**
 * 보유 중 일부 용도변경 사유 — 산출 근거 안내 템플릿.
 *
 * - house_to_commercial: 취득시 전체 주택 → 양도시 일부 상가화. 사용자가 취득시 상가건물 기준시가 +
 *   개별공시지가를 직접 입력해야 함 (자동 안분 fallback 폐지, 2026-05-01).
 * - commercial_to_house: 취득시 전체 상가 → 양도시 일부 주택화 (미러).
 */
export function buildPartialUsageChangeReason(
  direction: "house_to_commercial" | "commercial_to_house",
  _acqStandardSource: "user_input",
): string {
  if (direction === "house_to_commercial") {
    return (
      "양도시점에는 겸용주택이나 취득시점에는 전체 주택이었으므로 시행령 §166⑥에 따라, " +
      "사용자가 입력한 취득시 상가건물 기준시가와 개별공시지가(상가)로 취득시 상가부분 기준시가를 직접 산정"
    );
  }
  // commercial_to_house — 미러 (현재는 단일 메시지)
  return (
    "양도시점에는 겸용주택이나 취득시점에는 전체 상가였으므로 시행령 §166⑥에 따라 " +
    "환산취득가 산정 시 취득시 상가 기준시가(건물+토지)를 양도시 면적비율로 안분 — 직접 사례 제한적, 보수 검토 필요"
  );
}

// ──────────────────────────────────────────
// 경고 수집
// ──────────────────────────────────────────

export function collectWarnings(asset: MixedUseAssetInput): string[] {
  const warnings: string[] = [];
  if (asset.isMetropolitanArea === undefined) {
    warnings.push(
      "수도권 여부 미입력 — 수도권(3배 배율)으로 보수 처리됩니다. 정확한 계산을 위해 수도권 여부를 입력하세요.",
    );
  }
  return warnings;
}

// ──────────────────────────────────────────
// 거부 결과 빌더
// ──────────────────────────────────────────

export function buildRejectionResult(warning: string): MixedUseGainBreakdown {
  const zero = {
    housingStandardPrice: 0,
    commercialStandardPrice: 0,
    housingRatio: 0,
    housingTransferPrice: 0,
    commercialTransferPrice: 0,
  } satisfies MixedUseApportionment;
  return {
    splitMode: "pre-2022-rejected",
    apportionment: zero,
    housingPart: {
      estimatedAcquisitionPrice: 0,
      transferGain: 0,
      landTransferGain: 0,
      buildingTransferGain: 0,
      landTransferPrice: 0,
      landAcqPrice: 0,
      landAppraisalDed: 0,
      buildingTransferPrice: 0,
      buildingAcqPrice: 0,
      buildingAppraisalDed: 0,
      isExempt: false,
      proratedTaxableGain: 0,
      longTermDeductionTable: 1,
      longTermDeductionRate: 0,
      longTermDeductionAmount: 0,
      incomeAmount: 0,
      nonBusinessTransferRatio: 0,
      nonBusinessTransferredGain: 0,
    },
    commercialPart: {
      estimatedAcquisitionPrice: 0,
      transferGain: 0,
      landTransferGain: 0,
      buildingTransferGain: 0,
      landTransferPrice: 0,
      landAcqPrice: 0,
      landAppraisalDed: 0,
      buildingTransferPrice: 0,
      buildingAcqPrice: 0,
      buildingAppraisalDed: 0,
      longTermDeductionRate: 0,
      longTermDeductionAmount: 0,
      incomeAmount: 0,
      acqStandardSource: "user_input",
      acqStandardTotal: 0,
      acqStandardLand: 0,
      acqStandardBuilding: 0,
    },
    nonBusinessLandPart: null,
    total: {
      aggregateIncome: 0,
      basicDeduction: 0,
      taxBase: 0,
      taxByBasicRate: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      nonBusinessSurcharge: 0,
      transferTax: 0,
      localTax: 0,
      totalPayable: 0,
    },
    steps: [],
    calculationRoute: {
      housingAcqPriceSource: "missing",
      acquisitionConversionRoute: "section97_direct",
      housingDeductionTableReason: "계산 미진행",
      landMultiplierReason: "계산 미진행",
      highValueRule: "below_threshold_exempt",
    },
    warnings: [warning],
  };
}

// ──────────────────────────────────────────
// 결과 카드용 Step 빌더
// ──────────────────────────────────────────

export function buildApportionmentStep(a: MixedUseApportionment): MixedUseStep {
  return {
    id: "step-2-apportionment",
    title: "양도가액 안분",
    legalBasis: MIXED_USE.APPORTIONMENT,
    values: [
      { label: "양도시 개별주택공시가격", value: a.housingStandardPrice },
      { label: "양도시 상가부분 기준시가 합계", value: a.commercialStandardPrice },
      { label: "주택비율", value: `${(a.housingRatio * 100).toFixed(2)}%` },
      { label: "주택 양도가액", value: a.housingTransferPrice, isResult: true },
      { label: "상가 양도가액", value: a.commercialTransferPrice, isResult: true },
    ],
  };
}

export function buildHousingStep(
  h: ReturnType<typeof buildHousingPart>,
  a: MixedUseApportionment,
): MixedUseStep {
  return {
    id: "step-5-housing",
    title: "주택부분",
    legalBasis: MIXED_USE.HIGH_VALUE_HOUSE,
    values: [
      { label: "주택 환산취득가액", value: h.estimatedAcquisitionPrice },
      { label: "주택 양도차익", value: h.transferGain },
      { label: "12억 초과 비과세 적용 후 과세대상 양도차익", value: h.proratedTaxableGain },
      { label: `장기보유공제 (표${h.longTermDeductionTable}, ${(h.longTermDeductionRate * 100).toFixed(0)}%)`, value: h.longTermDeductionAmount },
      { label: "주택부분 양도소득금액", value: h.incomeAmount, isResult: true },
    ],
  };
}

export function buildCommercialStep(
  c: ReturnType<typeof buildCommercialPart>,
  a: MixedUseApportionment,
): MixedUseStep {
  // 취득시 상가부분 기준시가는 항상 사용자 직접 입력 (자동 안분 fallback 폐지)
  const acqStdLabel = "취득시 상가부분 기준시가 합계";

  return {
    id: "step-7-commercial",
    title: "상가부분",
    legalBasis: MIXED_USE.APPORTIONMENT,
    values: [
      { label: acqStdLabel, value: c.acqStandardTotal },
      { label: "상가 환산취득가액", value: c.estimatedAcquisitionPrice },
      { label: "상가 양도차익", value: c.transferGain },
      { label: `장기보유공제 (표1, ${(c.longTermDeductionRate * 100).toFixed(0)}%)`, value: c.longTermDeductionAmount },
      { label: "상가부분 양도소득금액", value: c.incomeAmount, isResult: true },
    ],
  };
}

export function buildNonBusinessStep(
  nb: NonNullable<ReturnType<typeof buildNonBusinessPart>>,
  excess: ReturnType<typeof calcExcessLandRatio>,
  derived: ReturnType<typeof computeDerivedAreas>,
): MixedUseStep {
  return {
    id: "step-6-non-business-land",
    title: "비사업용토지 부분 (주택부수토지 배율초과)",
    legalBasis: MIXED_USE.LAND_RATIO,
    values: [
      { label: "주택부수토지 면적", value: `${derived.residentialLandArea.toFixed(2)} ㎡` },
      { label: `적용 배율 (${excess.multiplier}배) × 주택 정착면적`, value: `${(derived.residentialFootprintArea * excess.multiplier).toFixed(2)} ㎡` },
      { label: "배율초과 면적", value: `${nb.excessArea.toFixed(2)} ㎡` },
      { label: "비사업용 양도차익", value: nb.transferGain },
      { label: `장기보유공제 (표1, ${(nb.longTermDeductionRate * 100).toFixed(0)}%)`, value: nb.longTermDeductionAmount },
      { label: "비사업용토지 양도소득금액 (+10%p 가산)", value: nb.incomeAmount, isResult: true },
    ],
  };
}

export function buildTotalStep(t: ReturnType<typeof buildTotalTax>): MixedUseStep {
  return {
    id: "step-9-total",
    title: "합산 세액",
    legalBasis: "소득세법 §92~§107",
    values: [
      { label: "합산 양도소득금액", value: t.aggregateIncome },
      { label: "기본공제", value: t.basicDeduction },
      { label: "과세표준", value: t.taxBase },
      { label: "산출세액 (기본세율)", value: t.taxByBasicRate },
      // P6 — 비사토가 §104⑤2호 파트로 계산되면 이 값은 0이다(총액에 별도 가산하지 않음).
      // 배율초과가 있는데 「가산세 0원」이 뜨면 중과 누락으로 오해되므로 감춘다.
      // 결과 카드(`MixedUseResultCard`)의 `> 0` 조건부 렌더와 같은 규칙이다.
      ...(t.nonBusinessSurcharge > 0
        ? [{ label: "비사업용토지 +10%p 가산세", value: t.nonBusinessSurcharge }]
        : []),
      { label: "양도소득세", value: t.transferTax },
      { label: "지방소득세 (10%)", value: t.localTax },
      { label: "총 납부세액", value: t.totalPayable, isResult: true },
    ],
  };
}
