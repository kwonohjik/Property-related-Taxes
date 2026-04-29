/**
 * 검용주택(1세대 1주택 + 상가) 양도소득세 분리계산 오케스트레이터
 *
 * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분:
 *   주택연면적 ≥ 상가연면적이라도 주택부분/상가부분/비사업용토지 강제 분리.
 *
 * 설계 문서: docs/02-design/features/transfer-tax-mixed-use-house.engine.design.md
 */

import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "./transfer-tax-helpers";
import { MIXED_USE } from "./legal-codes/transfer";
import type {
  MixedUseAssetInput,
  MixedUseGainBreakdown,
  MixedUseApportionment,
  MixedUseStep,
  MixedUseCalculationRoute,
} from "./types/transfer-mixed-use.types";
import {
  computeDerivedAreas,
  apportionTransferPrice,
  calcHousingEstimatedAcq,
  calcHousingGainSplit,
  calcCommercialGainSplit,
  calcExcessLandRatio,
  buildHousingPart,
  buildCommercialPart,
  buildNonBusinessPart,
  buildTotalTax,
} from "./transfer-tax-mixed-use-helpers";

// ──────────────────────────────────────────
// 상수
// ──────────────────────────────────────────

const MIXED_USE_EFFECTIVE_DATE = new Date("2022-01-01");

// ──────────────────────────────────────────
// 메인 함수
// ──────────────────────────────────────────

/**
 * 검용주택 분리계산 메인 함수.
 *
 * @param transferPrice - 총 양도가액 (원)
 * @param transferDate  - 양도일
 * @param asset         - 검용주택 자산 입력
 * @param rates         - Supabase에서 preload된 세율 맵
 */
export function calcMixedUseTransferTax(
  transferPrice: number,
  transferDate: Date,
  asset: MixedUseAssetInput,
  rates: TaxRatesMap,
): MixedUseGainBreakdown {
  // STEP 1: 2022.1.1 이전 양도일 거부
  if (transferDate < MIXED_USE_EFFECTIVE_DATE) {
    return buildRejectionResult(
      "2022.1.1 이전 양도분은 검용주택 분리계산 범위 외입니다. 단일 자산 모드로 재계산하세요.",
    );
  }

  const warnings: string[] = collectWarnings(asset);
  const steps: MixedUseStep[] = [];

  // 누진세율 brackets (DB 세율)
  const { brackets } = parseRatesFromMap(rates);

  // 파생값 (면적 비율)
  const derived = computeDerivedAreas(asset);

  // STEP 2: 양도가액 안분
  const apportionment = apportionTransferPrice(transferPrice, asset, derived);
  steps.push(buildApportionmentStep(apportionment));

  // STEP 3: 주택부분 환산취득가액 (§97 또는 §164⑤ PHD)
  const housingAcqResult = calcHousingEstimatedAcq(
    apportionment.housingTransferPrice,
    asset,
    derived,
  );

  // STEP 4: 주택 양도차익 (토지/건물 분리)
  const housingGainSplit = calcHousingGainSplit(
    apportionment.housingTransferPrice,
    housingAcqResult,
    asset,
    derived,
    transferDate,
  );

  // STEP 5·6: 12억 초과 비과세 안분 + 주택부수토지 배율초과 분리
  const excessResult = calcExcessLandRatio(asset, derived);
  const housingPart = buildHousingPart(
    apportionment,
    housingAcqResult,
    housingGainSplit,
    excessResult,
    asset.residencePeriodYears,
  );
  steps.push(buildHousingStep(housingPart, apportionment));

  // STEP 7: 상가부분 환산취득가액 + 양도차익
  const commercialGainSplit = calcCommercialGainSplit(
    apportionment.commercialTransferPrice,
    asset,
    derived,
    transferDate,
  );
  const commercialPart = buildCommercialPart(commercialGainSplit);
  steps.push(buildCommercialStep(commercialPart, apportionment));

  // STEP 8: 비사업용토지 부분 (배율초과 시)
  const nonBusinessLandPart = buildNonBusinessPart(
    housingPart,
    excessResult,
    housingGainSplit.landHoldingYears,
  );
  if (nonBusinessLandPart) {
    steps.push(buildNonBusinessStep(nonBusinessLandPart, excessResult, derived));
  }

  // STEP 9: 합산 세액
  const total = buildTotalTax(
    housingPart.incomeAmount,
    commercialPart.incomeAmount,
    nonBusinessLandPart?.incomeAmount ?? 0,
    brackets,
  );
  steps.push(buildTotalStep(total));

  // 계산 경로 메타 (학습·검증용)
  const calculationRoute = buildCalculationRoute(asset, housingPart, excessResult);

  return {
    splitMode: "post-2022",
    apportionment,
    housingPart,
    commercialPart,
    nonBusinessLandPart,
    total,
    steps,
    calculationRoute,
    warnings,
  };
}

// ──────────────────────────────────────────
// 계산 경로 메타 빌더
// ──────────────────────────────────────────

function buildCalculationRoute(
  asset: MixedUseAssetInput,
  housingPart: ReturnType<typeof buildHousingPart>,
  excessResult: ReturnType<typeof calcExcessLandRatio>,
): MixedUseCalculationRoute {
  const acqHousing = asset.acquisitionStandardPrice.housingPrice;
  const housingAcqPriceSource =
    asset.usePreHousingDisclosure
      ? ("phd_auto" as const)
      : acqHousing && acqHousing > 0
        ? ("direct_input" as const)
        : ("missing" as const);

  const acquisitionConversionRoute = asset.usePreHousingDisclosure
    ? ("phd_corrected" as const)
    : ("section97_direct" as const);

  const housingDeductionTableReason =
    housingPart.longTermDeductionTable === 2
      ? `거주 ${asset.residencePeriodYears}년 ≥ 2년 → 표2 (보유×4% + 거주×4%, 최대 80%)`
      : `거주 ${asset.residencePeriodYears}년 < 2년 → 표1 (보유×2%, 최대 30%)`;

  const zoneLabel = asset.zoneType ?? "residential";
  const metroLabel = asset.isMetropolitanArea === false ? "수도권 외" : "수도권";
  const landMultiplierReason = `${metroLabel} ${zoneLabel} → ${excessResult.multiplier}배 (시행령 §168의12)`;

  const highValueRule = housingPart.isExempt
    ? ("below_threshold_exempt" as const)
    : ("above_threshold_prorated" as const);

  return {
    housingAcqPriceSource,
    acquisitionConversionRoute,
    housingDeductionTableReason,
    landMultiplierReason,
    highValueRule,
  };
}

// ──────────────────────────────────────────
// 경고 수집
// ──────────────────────────────────────────

function collectWarnings(asset: MixedUseAssetInput): string[] {
  const warnings: string[] = [];
  if (asset.usePreHousingDisclosure) {
    warnings.push(
      "검용주택의 PHD 3-시점 환산 적합성은 사례별 검토가 필요합니다. 이미지5 사례는 단순 §97 환산 사용.",
    );
  }
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

function buildRejectionResult(warning: string): MixedUseGainBreakdown {
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
    },
    nonBusinessLandPart: null,
    total: {
      aggregateIncome: 0,
      basicDeduction: 0,
      taxBase: 0,
      taxByBasicRate: 0,
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

function buildApportionmentStep(a: MixedUseApportionment): MixedUseStep {
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

function buildHousingStep(
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

function buildCommercialStep(
  c: ReturnType<typeof buildCommercialPart>,
  a: MixedUseApportionment,
): MixedUseStep {
  return {
    id: "step-7-commercial",
    title: "상가부분",
    legalBasis: MIXED_USE.APPORTIONMENT,
    values: [
      { label: "상가 환산취득가액", value: c.estimatedAcquisitionPrice },
      { label: "상가 양도차익", value: c.transferGain },
      { label: `장기보유공제 (표1, ${(c.longTermDeductionRate * 100).toFixed(0)}%)`, value: c.longTermDeductionAmount },
      { label: "상가부분 양도소득금액", value: c.incomeAmount, isResult: true },
    ],
  };
}

function buildNonBusinessStep(
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

function buildTotalStep(t: ReturnType<typeof buildTotalTax>): MixedUseStep {
  return {
    id: "step-9-total",
    title: "합산 세액",
    legalBasis: "소득세법 §92~§107",
    values: [
      { label: "합산 양도소득금액", value: t.aggregateIncome },
      { label: "기본공제", value: t.basicDeduction },
      { label: "과세표준", value: t.taxBase },
      { label: "산출세액 (기본세율)", value: t.taxByBasicRate },
      { label: "비사업용토지 +10%p 가산세", value: t.nonBusinessSurcharge },
      { label: "양도소득세", value: t.transferTax },
      { label: "지방소득세 (10%)", value: t.localTax },
      { label: "총 납부세액", value: t.totalPayable, isResult: true },
    ],
  };
}
