/**
 * 겸용주택(1세대 1주택 + 상가) 양도소득세 분리계산 오케스트레이터
 *
 * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분:
 *   주택연면적 ≥ 상가연면적이라도 주택부분/상가부분/비사업용토지 강제 분리.
 *
 * 설계 문서: docs/02-design/features/transfer-tax-mixed-use-house.engine.design.md
 */

import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "./transfer-tax-helpers";
import { computeAmendment } from "./transfer-tax-amendment";
import type { AmendmentInput } from "./types/transfer-amendment.types";
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
  computeAcqDerivedAreas,
  apportionTransferPrice,
  apportionAcquisitionPrice,
  calcHousingEstimatedAcq,
  calcHousingGainSplit,
  calcCommercialGainSplit,
  calcExcessLandRatio,
  buildHousingPart,
  buildCommercialPart,
  buildNonBusinessPart,
  buildTotalTax,
} from "./transfer-tax-mixed-use-helpers";
import {
  calcUsagePeriodInfo,
  applyUsagePeriodSplit,
} from "./transfer-tax-mixed-use-period-split";

// ──────────────────────────────────────────
// 상수
// ──────────────────────────────────────────

const MIXED_USE_EFFECTIVE_DATE = new Date("2022-01-01");

// ──────────────────────────────────────────
// 메인 함수
// ──────────────────────────────────────────

/**
 * 겸용주택 분리계산 메인 함수.
 *
 * @param transferPrice - 총 양도가액 (원)
 * @param transferDate  - 양도일
 * @param asset         - 겸용주택 자산 입력
 * @param rates         - Supabase에서 preload된 세율 맵
 * @param amendment     - 수정신고·경정청구 (국세기본법 §45·§45의2). 신고서 단위(폼-전역) — 자산-수준 아님.
 *                        미전달 시 기존 경로 불변. 2022.1.1 이전 양도(거부) 경로에는 부착하지 않음.
 */
export function calcMixedUseTransferTax(
  transferPrice: number,
  transferDate: Date,
  asset: MixedUseAssetInput,
  rates: TaxRatesMap,
  amendment?: AmendmentInput,
): MixedUseGainBreakdown {
  // STEP 1: 2022.1.1 이전 양도일 거부
  if (transferDate < MIXED_USE_EFFECTIVE_DATE) {
    return buildRejectionResult(
      "2022.1.1 이전 양도분은 겸용주택 분리계산 범위 외입니다. 단일 자산 모드로 재계산하세요.",
    );
  }

  const warnings: string[] = collectWarnings(asset);
  const steps: MixedUseStep[] = [];

  // 누진세율 brackets + 기본공제 한도 (DB 세율)
  const { brackets, basicDeductionRules } = parseRatesFromMap(rates);

  // 파생값 (면적 비율)
  const derived = computeDerivedAreas(asset);
  // 보유 중 일부 용도변경 시 취득시 면적 파생값 (시행령 §166⑥)
  const acqDerived = computeAcqDerivedAreas(asset, derived);

  // STEP 2: 양도가액 안분
  const apportionment = apportionTransferPrice(transferPrice, asset, derived);
  steps.push(buildApportionmentStep(apportionment));

  // STEP 2.5: 매매 취득 실거래가 안분 (법 §100², R1) — useActualAcquisition일 때만.
  // 총 취득 실거래가를 취득시 기준시가 비율로 주택분/상가분에 안분(양도가액 안분의 취득시 미러).
  const acqApportionment = asset.useActualAcquisition
    ? apportionAcquisitionPrice(asset.acquisitionActualTotalPrice ?? 0, asset, acqDerived)
    : undefined;

  // STEP 3: 주택부분 환산취득가액 (§97 또는 §164⑤ PHD, 또는 실가 안분분)
  // PHD + 보유 중 용도변경 케이스에서 시점별 면적 분리를 위해 acqDerived도 전달
  const housingAcqResult = calcHousingEstimatedAcq(
    apportionment.housingTransferPrice,
    asset,
    derived,
    transferDate,
    acqDerived,
    acqApportionment?.housingAcqPrice,
  );

  // STEP 4: 주택 양도차익 (토지/건물 분리)
  const housingGainSplit = calcHousingGainSplit(
    apportionment.housingTransferPrice,
    housingAcqResult,
    asset,
    derived,
    transferDate,
    acqDerived,
  );

  // STEP 5·6: 12억 초과 비과세 안분 + 주택부수토지 배율초과 분리
  // 🚨 Critical: isOneHouseExempt 인자 전달 — 다주택자(false) 시 12억 비과세 미적용·표1
  const excessResult = calcExcessLandRatio(asset, derived);

  // STEP 7-prep: 상가부분 양도차익 (period-split에서도 housing 직전 commercial gain 필요)
  const commercialGainSplit = calcCommercialGainSplit(
    apportionment.commercialTransferPrice,
    asset,
    derived,
    transferDate,
    acqDerived,
    housingAcqResult,
    acqApportionment?.commercialAcqPrice,
  );

  // ─── 용도변경일 기반 LTHD 시간 비례 분할 (집행기준 89-154-24 취지) ───
  // partialUsageChange.usageChangeDate 입력 + 유효 시 period-split 모드로 LTHD 재계산.
  // 미입력·취득일 이전·양도일 이후이면 null 반환되어 표준 모드로 fallback.
  const acqDateForSplit =
    asset.landAcquisitionDate < asset.buildingAcquisitionDate
      ? asset.landAcquisitionDate
      : asset.buildingAcquisitionDate;
  const periodInfo = calcUsagePeriodInfo(
    acqDateForSplit,
    asset.partialUsageChange?.usageChangeDate,
    transferDate,
  );

  let housingPart: ReturnType<typeof buildHousingPart>;
  let commercialPart: ReturnType<typeof buildCommercialPart>;
  let usagePeriodSplit:
    | ReturnType<typeof applyUsagePeriodSplit>["usagePeriodSplit"]
    | undefined;

  // §154⑧3호 표2 '대상 판정'용 통산 거주 연수 — 미제공 시 실거주로 fallback(비상속·별도세대 = 실거주).
  const table2ResidenceYears = asset.table2ResidencePeriodYears ?? asset.residencePeriodYears;

  // Case A 4부분 안분 활성화 시 period-split 건너뛰기 — 엑셀 기준 전체 보유기간 단일 LTHD 적용.
  const skipPeriodSplitForFourPart = !!housingAcqResult.phdResult?.fourPartApportionment;
  if (periodInfo && asset.partialUsageChange && !skipPeriodSplitForFourPart) {
    const split = applyUsagePeriodSplit(
      housingGainSplit,
      commercialGainSplit,
      apportionment,
      excessResult,
      asset.residencePeriodYears,
      table2ResidenceYears,
      asset.isOneHouseExempt ?? true,
      periodInfo,
      asset.partialUsageChange.direction,
      housingAcqResult,
    );
    housingPart = split.housingPart;
    commercialPart = split.commercialPart;
    usagePeriodSplit = split.usagePeriodSplit;
  } else {
    housingPart = buildHousingPart(
      apportionment,
      housingAcqResult,
      housingGainSplit,
      excessResult,
      asset.residencePeriodYears,
      table2ResidenceYears,
      asset.isOneHouseExempt ?? true,  // 미주입 시 true (기존 backward compat)
    );
    commercialPart = buildCommercialPart(commercialGainSplit);
  }

  steps.push(buildHousingStep(housingPart, apportionment));
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
    basicDeductionRules.annualLimit,
  );
  steps.push(buildTotalStep(total));

  // 계산 경로 메타 (학습·검증용) — 표2 사유 표시는 게이트에 쓴 통산 값(table2ResidenceYears)을 그대로 주입
  // (재계산 시 게이트와 drift 위험 — feedback_engine_result_display_drift).
  const calculationRoute = buildCalculationRoute(
    asset,
    housingPart,
    excessResult,
    commercialPart,
    table2ResidenceYears,
  );

  // 보유 중 일부 용도변경 메타 (결과 카드 표시용)
  const partialUsageChange = asset.partialUsageChange
    ? {
        direction: asset.partialUsageChange.direction,
        acqResidentialArea:
          asset.partialUsageChange.acqResidentialArea
          ?? (asset.partialUsageChange.direction === "house_to_commercial"
              ? asset.residentialFloorArea + asset.nonResidentialFloorArea
              : 0),
        acqCommercialArea:
          asset.partialUsageChange.acqCommercialArea
          ?? (asset.partialUsageChange.direction === "house_to_commercial"
              ? 0
              : asset.residentialFloorArea + asset.nonResidentialFloorArea),
        isAreaCustomized:
          asset.partialUsageChange.acqResidentialArea !== undefined
          || asset.partialUsageChange.acqCommercialArea !== undefined,
        // PHD §164⑤ 환산 분기 — calcHousingEstimatedAcq 가 산출
        phdScopeBranch: housingAcqResult.phdScopeBranch,
      }
    : undefined;

  // 수정신고(경정)·경정청구 — 끝단 append (국세기본법 §45·§45의2).
  // 기준값은 total.transferTax(본세) — 단건 finalize의 determinedTax와 동일 축(지방소득세 제외).
  // amendment 없으면 undefined → 무영향(additive). finalize STEP 12.5 · redevelopment Step H.5와 동일 패턴.
  // ⚠️ buildRejectionResult 경로에는 부착하지 않는다 — 계산 불가 상태이지 '세액 0'이라는 유효한 결과가 아니다
  //    (determinedTax=0으로 부착 시 refundTax = 당초 전액 오표시).
  const amendmentDetail = amendment
    ? computeAmendment(amendment, total.transferTax)
    : undefined;

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
    partialUsageChange,
    usagePeriodSplit,
    amendmentDetail,
    // 상속 취득 게이트 echo (소령 §163⑨) — UI 재판정 방지용 단일 소스.
    acquisitionByInheritance: asset.acquisitionByInheritance,
    // §164⑨1호 공익수용 특례 산출근거 (계획 P7/D8) — 주택분(라목 총액)·상가분(가목 토지). 적용 시만.
    expropriationDetail:
      housingAcqResult.expropriationDetail || commercialGainSplit.expropriationDetail
        ? {
            housing: housingAcqResult.expropriationDetail,
            commercialLand: commercialGainSplit.expropriationDetail,
          }
        : undefined,
  };
}

// ──────────────────────────────────────────
// 계산 경로 메타 빌더
// ──────────────────────────────────────────

function buildCalculationRoute(
  asset: MixedUseAssetInput,
  housingPart: ReturnType<typeof buildHousingPart>,
  excessResult: ReturnType<typeof calcExcessLandRatio>,
  commercialPart: ReturnType<typeof buildCommercialPart>,
  // 표2 게이트에 실제로 쓴 통산 거주 연수 — 재계산 없이 주입받아 표시-계산 drift 차단.
  table2ResidenceYears: number,
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

  // 🚨 Critical: 다주택자(isOneHouseExempt === false) → non_one_house_full_taxation
  const isOneHouseExempt = asset.isOneHouseExempt ?? true;
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
function buildPartialUsageChangeReason(
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

function collectWarnings(asset: MixedUseAssetInput): string[] {
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
