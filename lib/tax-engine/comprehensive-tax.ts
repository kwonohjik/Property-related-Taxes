/**
 * 종합부동산세 계산 엔진 (Pure Engine)
 *
 * 2-레이어 아키텍처 Layer 2:
 *   DB 직접 호출 없음 — 세율 데이터는 매개변수로 전달
 *
 * 계산 순서 (주택분):
 *   Step 0. applyAggregationExclusion()     — 합산배제 판정
 *   Step 1. 공시가격 합산 (합산배제 후)
 *   Step 2. 기본공제 차감 (9억/12억)
 *   Step 3. 공정시장가액비율 적용 (60%)
 *   Step 4. 과세표준 → 만원 미만 절사
 *   Step 5. 누진세율 7단계 → 산출세액 (§8④ 의제·주택 수 제외 반영)
 *   Step 6. 재산세 비율 안분 공제 (§9③ — 핵심!)            ★ GAP-1: 세액공제보다 선적용
 *   Step 7. 1세대1주택 세액공제 (고령자 + 장기보유, 최대 80%, §9⑥⑧)
 *           — §8④ 의제 시 §9⑦⑨ 공시가격 안분 적용
 *   Step 8. 세부담 상한 적용
 *   Step 9. 농어촌특별세 (결정세액 × 20%)
 *
 * 서브모듈:
 *   합산배제        → comprehensive-exclusion.ts
 *   1세대1주택·상한  → comprehensive-tax-helpers.ts
 *   종합합산 토지    → comprehensive-land-aggregate.ts
 *   별도합산 토지    → comprehensive-separate-land.ts
 */

import { applyRate, truncateToTenThousand } from "./tax-utils";
import { COMPREHENSIVE_CONST } from "./legal-codes";
import {
  getComprehensiveParams,
  isComprehensiveYearSupported,
  isMultiHouseRate,
  getPropertyFmrForProration,
  COMPREHENSIVE_MIN_SUPPORTED_YEAR,
} from "./data/comprehensive-historical";
import { calculatePropertyTax, calcHousingTax } from "./property-tax";
import { calcMultiFamilyHousingTax } from "./multi-family-housing-tax";
import { buildHousingPropertyTaxWithCap } from "./comprehensive-housing-tax-cap";
import { resolveCorporateHousingClass } from "./comprehensive-corporate-class";
import type { CorporateHousingClass } from "./types/comprehensive-corporate.types";
import { calculateSeparateAggregateLandTax } from "./comprehensive-separate-land";
import {
  buildAggregateLandFromParcels,
  buildSeparateLandFromParcels,
} from "./comprehensive-land-adapter";
import {
  applyAggregationExclusion,
  validateRentalExclusion,
  validateOtherExclusion,
} from "./comprehensive-exclusion";
import {
  getSeniorRate,
  getLongTermRate,
  applyOneHouseDeduction,
  applyTaxCap,
  calculatePropertyTaxCreditProration,
  calculatePostManagementPenalty,
  applyEffectiveFactor,
  toAppurtenantFraction,
} from "./comprehensive-tax-helpers";
import {
  calcAggregateLandTaxBase,
  calcAggregateLandTaxAmount,
  applyAggregateLandTaxCap,
  calculateAggregateLandTax,
} from "./comprehensive-land-aggregate";
import {
  calcPreviousYearEquivalent,
  getHousingTaxCapPct,
} from "./comprehensive-prior-year";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  ComprehensiveBracket,
  ComprehensiveTaxInput,
  ComprehensiveTaxResult,
  OneHouseDeductionResult,
  PropertyForExclusion,
} from "./types/comprehensive.types";

// ============================================================
// 주택분 누진세율 7단계 (종합부동산세법 §9①)
// ============================================================

/**
 * 주택분 누진세율 적용 (종합부동산세법 §9①) — 연도별 세율표를 매개변수로 받음.
 * 세율표는 getComprehensiveParams(year)의 general/multi 중 호출부가 선택해 전달.
 */
export function calcHousingTaxAmount(
  taxBase: number,
  brackets: ComprehensiveBracket[],
): {
  calculatedTax: number;
  appliedRate: number;
  progressiveDeduction: number;
} {
  if (taxBase <= 0) {
    return { calculatedTax: 0, appliedRate: brackets[0].rate, progressiveDeduction: 0 };
  }

  // 세율 × 과세표준은 분수 정수 연산. rate(예: 0.036)를 float로 곱하면
  // floor 시 1원 부족(49,679,999.99→49,679,999). rate×1000 정수로 분수 연산.
  // (종부세 주택 세율은 최대 소수 3자리 — 0.006~0.060. memory feedback_applyrate_fractional_rate_one_won_error)
  const taxAtRate = (base: number, rate: number): number =>
    Math.floor((base * Math.round(rate * 1000)) / 1000);

  const target =
    brackets.find((b) => taxBase <= b.limit) ?? brackets[brackets.length - 1];
  return {
    calculatedTax: Math.max(taxAtRate(taxBase, target.rate) - target.deduction, 0),
    appliedRate: target.rate,
    progressiveDeduction: target.deduction,
  };
}

// ============================================================
// T-11: 메인 통합 계산 함수
// ============================================================

export function calculateComprehensiveTax(
  input: ComprehensiveTaxInput,
  rates?: TaxRatesMap,
): ComprehensiveTaxResult {
  const warnings: string[] = [];

  const assessmentDateStr = input.targetDate ?? `${input.assessmentYear}-06-01`;
  const assessmentDate = new Date(assessmentDateStr);

  // ── 납세의무자 유형 (§9②) — 미입력 시 개인 (기존 동작 보존) ──
  // 법인은 1세대1주택 관련 입력(isOneHouseOwner·birthDate·acquisitionDate)이
  // store에 잔존해도 전부 무시 (3중 패턴 1차 방어 — 법령상 해당 없음)
  const taxpayerType = input.taxpayerType ?? "individual";
  const isCorporate = taxpayerType !== "individual";
  // §9② class 도출 (시행령 §4의4) — 세부유형+조건 → corporate_general/public/special (단일 진실)
  const corporateClass: CorporateHousingClass | undefined = isCorporate
    ? resolveCorporateHousingClass(input.corporateHousingType ?? "general_corp", {
        corpHoldsOnlyPublicPurposeHousing: input.corpHoldsOnlyPublicPurposeHousing,
        corpHoldsQualifyingRentalHousingOnly: input.corpHoldsQualifyingRentalHousingOnly,
        corpMeetsSocialEnterpriseRequirements: input.corpMeetsSocialEnterpriseRequirements,
      })
    : undefined;

  // ── §10의2 부부 공동명의 1주택자 특례 — 1세대1주택자 의제 (§10의2③) ──
  // 법인이면 무시. isOneHouseOwner와 상호배타는 Zod refine이 차단 (방어적 OR 처리).
  const isJointApplied = !isCorporate && input.isJointOwnershipSpecialCase === true;

  // ── Step 0: 합산배제 판정 ──
  const propertiesForExclusion: PropertyForExclusion[] = input.properties.map((p) => ({
    propertyId: p.propertyId,
    assessedValue: p.assessedValue,
    area: p.area ?? 0,
    location: p.location ?? "metro",
    exclusionType: p.exclusionType ?? "none",
    rentalInfo: p.rentalInfo ? { ...p.rentalInfo, assessmentDate } : undefined,
    otherInfo: p.otherInfo,
  }));

  const aggregationExclusion = applyAggregationExclusion(
    propertiesForExclusion,
    assessmentDate,
  );

  // 합산배제 의무임대기간 미충족 경고 전파 (시행령 §3① — 사후 추징 위험)
  // 내부 propertyId 노출 금지 → "임대주택 N번째" 순번 접두 부착 (코어 메시지는 ExclusionResult.warnings에 보존)
  aggregationExclusion.propertyResults.forEach((r, idx) => {
    if (r.warnings && r.warnings.length > 0) {
      for (const w of r.warnings) {
        warnings.push(`임대주택 ${idx + 1}번째: ${w}`);
      }
    }
  });

  // ── Step 1: 개별 주택 재산세 자동 계산 + 합산배제 기록 ──
  const exclusionMap = new Map(
    aggregationExclusion.propertyResults.map((r) => [r.propertyId, r]),
  );
  const propertyResults: ComprehensiveTaxResult["properties"] = [];
  let totalPropertyTaxAmount = 0;  // ⓐ: 부과세액 합계 (determinedTax, 감면후)
  let totalAssessedValueFromLoop = 0;
  // A 지점: 감면후 유효 공시가격 합산 (과세표준·②ⓒ 분모용)
  // 합산배제 전 전체 합산 (합산배제 판정 후 Step 2에서 exclusion 차감)
  let effectiveTotalFromLoop = 0;

  for (const prop of input.properties) {
    totalAssessedValueFromLoop += prop.assessedValue;
    const rate = (prop.reductionRate ?? 0);
    const ratio = prop.ownershipRatio;
    // 사례6: 건물·부속토지 시가표준액 비율 안분 분수 (미입력 시 undefined → 비율 1)
    const appurtenant = toAppurtenantFraction(prop.appurtenantSplit);
    // D-1 (A-1 지점): 감면후·지분후·안분후 유효 공시가격 = floor(assessedValue × effectiveFactor(rate, ratio) × 안분)
    // effectiveFactor = ownershipRatio × (1 − reductionRate) × (시가표준액 안분). 기본값: ratio=1(단독), rate=0(감면없음), 안분=1
    // 합산배제 요건 판정은 원공시(assessedValue) 기준 — R-5 분리 유지
    const effectiveAssessedValue = applyEffectiveFactor(prop.assessedValue, rate, ratio, appurtenant);
    effectiveTotalFromLoop += effectiveAssessedValue;

    const exclusionResult = exclusionMap.get(prop.propertyId);
    const isExcluded = exclusionResult?.isExcluded ?? false;

    let propTax = 0;
    // D-2 (B 지점): 지분후·감면후·안분후 실부과 재산세 = 비율 안분 공제 ⓐ
    let imposedTax: number;
    // 트랙 A: 다가구 구별 면적안분 echo (floorUnits 입력 시만 — 결과 카드 ⑦)
    let multiFamilyBreakdown: ComprehensiveTaxResult["properties"][number]["multiFamilyBreakdown"];
    // 트랙 B: 주택 세부담상한 echo (priorAssessedValue 입력 시만 — 결과 카드 ⑦)
    let housingTaxCapDetail: ComprehensiveTaxResult["properties"][number]["housingTaxCapDetail"];
    if (prop.propertyTaxAmount !== undefined) {
      // 사례7·8·9: 재산세 부과세액 직접입력. 이미 감면·지분·세부담상한(105/110/130%)·
      // 다가구 면적안분이 반영된 고지서 실부과액 → applyEffectiveFactor 후곱 금지(이중적용 방지).
      // 자동계산 propTax는 산출 생략 (override 경로는 effectiveFactor와 직교).
      imposedTax = prop.propertyTaxAmount;
    } else if (
      prop.floorUnits &&
      prop.floorUnits.length > 0 &&
      prop.priorAssessedValue != null
    ) {
      // R-6 결합 (사례789엔 미발생, 가드): 다가구 Σ를 당해 표준세율로 삼아 §122 세부담상한 적용.
      const isOneHouseholdForProp =
        !isCorporate && input.isOneHouseOwner && input.properties.length === 1;
      const mf = calcMultiFamilyHousingTax(
        prop.assessedValue,
        prop.floorUnits,
        isOneHouseholdForProp,
        assessmentDateStr,
        rates,
      );
      multiFamilyBreakdown = mf.perUnit;
      const cap = buildHousingPropertyTaxWithCap(
        mf.total,
        prop.priorAssessedValue,
        input.assessmentYear,
        prop.assessedValue,
        isOneHouseholdForProp,
        `${input.assessmentYear - 1}-06-01`,
        rates,
      );
      propTax = cap.cappedTax;
      imposedTax = applyEffectiveFactor(propTax, rate, ratio, appurtenant);
      housingTaxCapDetail = { ...cap, imposedTax };
    } else if (prop.priorAssessedValue != null) {
      // 트랙 B (사례8·9): 주택 세부담상한 §122 단서. 당해 표준세율(감면전) → min(직전표준 × 105/110/130%)
      //   → 감면·지분 후곱. 시행령 §118 제3호(당해 감면을 직전에도 적용)와 대수적 동일.
      const isOneHouseholdForProp =
        !isCorporate && input.isOneHouseOwner && input.properties.length === 1;
      let curStd = 0;
      try {
        curStd = calculatePropertyTax(
          {
            objectType: "housing",
            publishedPrice: prop.assessedValue,
            isOneHousehold: isOneHouseholdForProp,
            targetDate: assessmentDateStr,
          },
          rates,
        ).determinedTax;
      } catch {
        warnings.push(
          `주택(${prop.propertyId}) 재산세 계산 오류 — 비율 안분 공제에서 제외됩니다.`,
        );
      }
      const cap = buildHousingPropertyTaxWithCap(
        curStd,
        prop.priorAssessedValue,
        input.assessmentYear,
        prop.assessedValue,
        isOneHouseholdForProp,
        `${input.assessmentYear - 1}-06-01`,
        rates,
      );
      propTax = cap.cappedTax;
      imposedTax = applyEffectiveFactor(propTax, rate, ratio, appurtenant);
      housingTaxCapDetail = { ...cap, imposedTax };
    } else if (prop.floorUnits && prop.floorUnits.length > 0) {
      // 트랙 A (사례7): 다가구 1동 통합공시를 구별 면적안분 후 누진세율 개별 적용·합산.
      // calculatePropertyTax 단일 경로 재사용 → FMR·누진·주택 세부담상한 패스스루 일치(drift 0).
      const isOneHouseholdForProp =
        !isCorporate && input.isOneHouseOwner && input.properties.length === 1;
      const mf = calcMultiFamilyHousingTax(
        prop.assessedValue,
        prop.floorUnits,
        isOneHouseholdForProp,
        assessmentDateStr,
        rates,
      );
      propTax = mf.total;
      multiFamilyBreakdown = mf.perUnit;
      // 통합공시(100% 지분) 기준 → 지분·감면·시가표준액 안분 후 곱 (단일 경로와 동일)
      imposedTax = applyEffectiveFactor(propTax, rate, ratio, appurtenant);
    } else {
      try {
        const ptResult = calculatePropertyTax(
          {
            objectType: "housing",
            publishedPrice: prop.assessedValue,
            // 재산세 1세대1주택 특례세율은 개인 전용 — 법인은 일반세율
            isOneHousehold: !isCorporate && input.isOneHouseOwner && input.properties.length === 1,
            targetDate: assessmentDateStr,
          },
          rates,
        );
        propTax = ptResult.determinedTax;
      } catch {
        warnings.push(
          `주택(${prop.propertyId}) 재산세 계산 오류 — 비율 안분 공제에서 제외됩니다.`,
        );
      }

      // propTax는 100% 지분 기준 determinedTax — 지분·감면·시가표준액 안분을 후 곱으로 결합
      // (사례6: 100% 재산세 2,970,000 × (토지 8억/전체 10억) = 부과 2,376,000)
      imposedTax = applyEffectiveFactor(propTax, rate, ratio, appurtenant);
    }
    // 합산배제 주택은 비율안분 합계에 포함하지 않음
    if (!isExcluded) {
      totalPropertyTaxAmount += imposedTax;
    }

    propertyResults.push({
      propertyId: prop.propertyId,
      assessedValue: prop.assessedValue,
      isExcluded,
      // 감면후 실부과 재산세 — 최상위 totalPropertyTax("재산세 참고")·grandTotal 집계용
      propertyTax: imposedTax,
      multiFamilyBreakdown,
      housingTaxCapDetail,
    });
  }

  // ── Step 2: 합산배제 후 공시가격 합산 ──
  const totalAssessedValue = totalAssessedValueFromLoop;
  const includedAssessedValue = totalAssessedValue - aggregationExclusion.totalExcludedValue;
  // A 지점 계속: 합산배제 후 감면후 유효 공시가격
  // 합산배제된 주택의 effectiveAssessedValue도 빼야 하는데, 합산배제는 원공시 기준이므로
  // effectiveTotalFromLoop에서 합산배제 주택의 effectiveAssessedValue를 빼야 함.
  // 단순 근사: 합산배제 totalExcludedValue는 원공시 기준 — 감면후 effectiveTotalFromLoop에서
  // 합산배제된 주택들의 effectiveAssessedValue를 별도로 차감.
  let effectiveExcludedValue = 0;
  for (const prop of input.properties) {
    const exclusionResult = exclusionMap.get(prop.propertyId);
    if (exclusionResult?.isExcluded) {
      // D-3 (A-2 지점): 합산배제 주택도 지분·감면·시가표준액 안분 결합 effectiveFactor 적용
      // ★ 누락 시 합산배제+지분 동시 케이스에서 effectiveIncludedAssessedValue 과대 계산 오류
      effectiveExcludedValue += applyEffectiveFactor(
        prop.assessedValue,
        prop.reductionRate,
        prop.ownershipRatio,
        toAppurtenantFraction(prop.appurtenantSplit),
      );
    }
  }
  // 감면후 합산배제 후 과세 공시가격 (과세표준·②ⓒ 분모에 사용)
  const effectiveIncludedAssessedValue = effectiveTotalFromLoop - effectiveExcludedValue;

  // ── §8④ 1세대1주택자 의제 특례 (per-property section8para4Type) ──
  //   합산배제(§8②) 주택은 §8④ 대상 아님 → excludedIdSet 제외 (D2-8). 의제는 개인 전용.
  const excludedIdSet = new Set(
    aggregationExclusion.propertyResults
      .filter((r) => r.isExcluded)
      .map((r) => r.propertyId),
  );
  const s84Properties = input.properties.filter(
    (p) => (p.section8para4Type ?? "none") !== "none" && !excludedIdSet.has(p.propertyId),
  );
  // 일반주택(특례 미지정·합산배제 제외) 수
  const normalHouseCount = aggregationExclusion.includedCount - s84Properties.length;
  // §8④ 의제 성립: 법 §8④ 본문 "1주택과 … 함께 소유" — 일반주택 정확히 1채 + 특례주택 ≥ 1 (개인 전용).
  //   지정만으로 의제하지 않음 (13단계 STEP 6 #5).
  const isSection8para4Applied =
    !isCorporate && s84Properties.length > 0 && normalHouseCount === 1;
  if (!isCorporate && s84Properties.length > 0 && normalHouseCount !== 1) {
    warnings.push(
      "§8④ 1세대1주택자 의제는 일반주택 1채와 특례주택을 함께 소유한 경우에만 적용됩니다. 현재 구성은 의제 요건 미충족으로 의제는 미적용됩니다(상속주택 등 시행령 §4의3③ 주택 수 제외는 별도 적용).",
    );
  }
  // 1세대1주택자 취급 여부 (기본공제 §8①1호 + 세액공제 §9⑤~⑨ 공통 게이트)
  const oneHouseTreatment =
    !isCorporate && (input.isOneHouseOwner || isJointApplied || isSection8para4Applied);
  // §8④ 특례주택 공시 합산 (§9⑦⑨ 안분 분자 = includedAssessedValue − 이 값)
  const excludedAssessedValueS84 = s84Properties.reduce(
    (s, p) => s + p.assessedValue,
    0,
  );
  // 세율 주택 수 (령 §4의3③3호): 나목(상속) 무전제 제외 · 라마목(2·4호) 의제 성립 시 제외
  //   1호(부속토지)·법인은 미제외 (R-8·R-9). 가목(합산배제)은 includedCount에서 이미 빠짐.
  const s84InheritedCount = s84Properties.filter(
    (p) => p.section8para4Type === "inherited_house",
  ).length;
  const s84ConditionalCount = s84Properties.filter(
    (p) =>
      p.section8para4Type === "temporary_two_house" ||
      p.section8para4Type === "regional_low_price",
  ).length;
  const rateHouseCount = isCorporate
    ? aggregationExclusion.includedCount
    : aggregationExclusion.includedCount -
      s84InheritedCount -
      (isSection8para4Applied ? s84ConditionalCount : 0);

  // ── 연도별 세법 파라미터 로드 (과세귀속연도 기준) ──
  const yearParams = getComprehensiveParams(input.assessmentYear);
  if (!isComprehensiveYearSupported(input.assessmentYear)) {
    warnings.push(
      `${input.assessmentYear}년 귀속은 미지원 연도입니다 — ${COMPREHENSIVE_MIN_SUPPORTED_YEAR}년 이후 기준으로 계산하세요. (현행 세법으로 계산됨)`,
    );
  }

  // ── Step 3: 기본공제 차감 (연도별 일반/1세대1주택 + 법인 분기) ──
  //   corporate_special: 0원 (§8①2호 — 구법 §8① 괄호 "제9조제2항 각 호의 세율이 적용되는 경우는 제외")
  //   corporate_general·corporate_public: 일반 공제 (1세대1주택 경로 차단)
  //   oneHouseTreatment: 1세대1주택 또는 §10의2 부부 특례 의제 → §8①1호 공제 (12억/11억)
  const basicDeduction =
    corporateClass === "corporate_special"
      ? 0
      : isCorporate
        ? yearParams.basicDeductionGeneral
        : oneHouseTreatment
          ? yearParams.basicDeductionOneHouse
          : yearParams.basicDeductionGeneral;
  // A 지점: 감면후 유효 공시가격 기준으로 기본공제 차감 (과세표준 산정)
  const afterBasicDeduction = Math.max(effectiveIncludedAssessedValue - basicDeduction, 0);

  // ── Step 4: 공정시장가액비율 (연도별) + 만원 미만 절사 ──
  const fairMarketRatio = yearParams.fairMarketRatioHousing;
  const taxBase = truncateToTenThousand(Math.floor(afterBasicDeduction * fairMarketRatio));

  const isSubjectToHousingTax = taxBase > 0;
  if (!isSubjectToHousingTax) {
    warnings.push("주택분 종합부동산세 납세의무가 없습니다 (기본공제 이하).");
  }

  // ── Step 5: 세율 — 연도별 + 다주택 중과 판정 + 법인 분기 (§9①·§9②) ──
  //   다주택 = 합산배제 제외 후 과세대상 주택 수 ≥ 3 (≤2022는 조정대상지역 2주택도 포함)
  //   법인 §9②3호 가/나목 판정도 동일 기준 (구법 §10이 상한 분기를 "§9①2호 적용대상"으로
  //   정의한 것과 동일 축 — Phase 0 축자 확인)
  const useMultiRate = isMultiHouseRate(
    input.assessmentYear,
    rateHouseCount, // §8④ 의제·상속주택 주택 수 제외 반영 (령 §4의3③3호) — R-8·R-9
    input.isMultiHouseInAdjustedArea ?? false,
  );

  let calculatedTax: number;
  let appliedRate: number;
  let progressiveDeduction: number;
  let isMultiHouseRateApplied = false;

  if (corporateClass === "corporate_special") {
    // §9②3호: 단일 비례세율 (누진공제 없음) — 가목 2주택 이하 / 나목 3주택 이상(≤2022 조정 2주택 포함)
    // 2021·2022 = 3.0%/6.0% (구법 §9②) / 2023~ = 2.7%/5.0%
    // 분수 정수 연산: rate × 1000을 정수화 후 ×/÷ (float 직접 곱 floor 1원 부족 방지)
    const corporateRate = useMultiRate
      ? yearParams.corporateRate3HouseOrMore
      : yearParams.corporateRate2HouseOrLess;
    calculatedTax = Math.floor((taxBase * Math.round(corporateRate * 1000)) / 1000);
    appliedRate = corporateRate;
    progressiveDeduction = 0;
  } else if (corporateClass === "corporate_general") {
    // §9②1호 (공공주택사업자 등): 주택 수 무관 §9①1호 general 표 고정
    ({ calculatedTax, appliedRate, progressiveDeduction } =
      calcHousingTaxAmount(taxBase, yearParams.housingBracketsGeneral));
  } else {
    // 개인 + §9②2호 공익법인등: §9① 각호 (주택 수 분기)
    const brackets = useMultiRate
      ? yearParams.housingBracketsMulti
      : yearParams.housingBracketsGeneral;
    ({ calculatedTax, appliedRate, progressiveDeduction } =
      calcHousingTaxAmount(taxBase, brackets));
    isMultiHouseRateApplied = useMultiRate;
  }

  // ── Step 5.5: 직전연도 종합부동산세상당액 (세부담상한 — 시행령 §5②, 별지 5호서식 부표) ──
  //   previousYearAuto 입력 시에만 산출. previousYearTotalTax(직접입력)와 상호배타(Zod refine).
  const previousYearEquivalent =
    !isCorporate && input.previousYearAuto
      ? calcPreviousYearEquivalent(input.previousYearAuto, input.assessmentYear)
      : undefined;

  // ── Step 6: 재산세 비율 안분 공제 (종합부동산세법 §9③·시행령 §4의3) ──
  //   ★ GAP-1: §9⑥⑧ "제1항·제3항·제4항에 따라 산출된 세액" → 재산세 공제(§9③)를 세액공제(§9⑥)보다 선적용.
  //
  // ⑤ = 종부세 과세표준 × 재산세FMR × 0.4% (주택 최고세율, 누진공제 없음)
  //   = taxBase × propertyFMR × 0.004 (분수 정수: taxBase × round(FMR×100) × 4 / 100_000)
  //   (× 0.004 float 직접 곱 시 floor 1원 부족 — memory feedback_applyrate_fractional_rate_one_won_error)
  //
  // ★ 재산세 FMR 연도·1세대1주택 분기 (지방세법 시행령 §109①2호 단서):
  //   2022 1세대1주택(주택 1채) = 45%, 그 외 60%. 게이트는 재산세 부과(:169 isOneHousehold)와 동일 —
  //   ⓐ(부과)와 ⑤⑥(표준세율 상당액)의 FMR 정합 보장 (사례12 ⑤=432,000·⑥=2,070,000).
  const isOneHouseSingleForFmr =
    !isCorporate && input.isOneHouseOwner && input.properties.length === 1;
  const propertyFMR = getPropertyFmrForProration(input.assessmentYear, isOneHouseSingleForFmr);
  // 0.004 = 4/1000, propertyFMR = 60/100 → 합산 numerator = taxBase × 60 × 4 / 100_000
  const numeratorStdTaxEq = Math.floor(
    (taxBase * Math.round(propertyFMR * 100) * 4) / 100_000,
  );
  // ⑥ = 주택을 합산하여 주택분 재산세 표준세율로 계산한 재산세상당액 (시행령 §4의3)
  //   = (합산배제 후 공시가격 합산 × 재산세 FMR 60%) 과표에 일반 표준세율 누진 1회 적용
  //   ★ Σ 각 주택별 세액이 아님 — 국세청 작성방법 ⑦ 및 사례5 실측
  //     (17억 × 60% × 0.4% − 630,000 = 3,450,000. Σ per-house는 3,120,000으로 불일치)
  //     1주택은 양 방식 동치 — 사례1 anchor 504,000 무변경.
  // A 지점: ②ⓒ 분모(총표준세율재산세액)도 감면후 유효 공시가격 기준 (교재 사례2 ②ⓒ 1,170,000 = 7.5억×60%×표준세율)
  const aggregatedPropertyTaxBase = Math.floor(
    (effectiveIncludedAssessedValue * Math.round(propertyFMR * 100)) / 100,
  );
  const denominatorStdTax = calcHousingTax(
    aggregatedPropertyTaxBase,
    effectiveIncludedAssessedValue,
    false, // 일반 표준세율 강제 — 특례세율 배제
  ).tax;
  // ⓐ = 부과세액 합계. G-5: 직전연도 자동계산 시 구 §122 단서 Min 적용
  //   (§9③ 괄호 "§122에 따라 세부담 상한을 적용받는 경우 그 상한 세액").
  //   ⓐ = min(부과 재산세, 직전 재산세상당액 × §122 구간 상한율). 2024+ 폐지 → null이면 미적용.
  let aValue = totalPropertyTaxAmount;
  // 교재 ②ⓐ echo: §122 단서 상한율 (자동모드만 산정 — 비자동/2024+ 폐지 시 null)
  // §122 구간 판정: 감면후 유효 공시가격 기준 (과세표준과 동일 축)
  let priorPropertyTaxCapPct: number | null = null;
  // 직전공시 2단계 통합(comprehensive-prior-year-2step): 주택별 priorAssessedValue가 있으면
  //   주택별 §122(buildHousingPropertyTaxWithCap → housingTaxCapDetail)가 이미 totalPropertyTaxAmount에
  //   §122 상한을 주택별로 정확히 반영. 이때 집계 §122 단서를 또 적용하면 이중이며,
  //   집계 직전 재산세상당액(previousYearEquivalent.propertyTaxEquiv)은 reductionRate를 스칼라
  //   (properties[0])로만 반영해 다주택+감면에서 ⓐ를 왜곡(교재 사례8 16,747,099 → 17,001,297).
  //   → 주택별 §122가 하나라도 적용되면 집계 단서 스킵(주택별이 정확). 종부세 §10(prevTotalForCap)은 별개 유지.
  const hasHouseLevelCap = input.properties.some((p) => p.priorAssessedValue != null);
  if (previousYearEquivalent && !hasHouseLevelCap) {
    priorPropertyTaxCapPct = getHousingTaxCapPct(input.assessmentYear, effectiveIncludedAssessedValue);
    if (priorPropertyTaxCapPct !== null) {
      aValue = Math.min(
        aValue,
        Math.floor((previousYearEquivalent.propertyTaxEquiv * priorPropertyTaxCapPct) / 100),
      );
    }
  }
  // 공제 상한 = 산출세액(calculatedTax — §9③ 공제는 산출세액에서)
  const propertyTaxCredit = calculatePropertyTaxCreditProration(
    aValue,
    numeratorStdTaxEq,
    denominatorStdTax,
    calculatedTax,
  );
  // 교재 p.186~187 카드 echo (계산 무변경 — 이미 산출된 중간값 노출)
  propertyTaxCredit.propertyFairMarketRatio = propertyFMR;
  propertyTaxCredit.propertyTaxBaseAmount = aggregatedPropertyTaxBase;
  propertyTaxCredit.priorPropertyTaxCapPct = priorPropertyTaxCapPct;
  const taxAfterPropertyCredit = Math.max(
    calculatedTax - propertyTaxCredit.creditAmount,
    0,
  );

  // ── Step 7: 1세대1주택 세액공제 (§9⑤~⑨ — 재산세 공제 후 세액 기준) ──
  //   §8④ 의제 시 §9⑦⑨ 공시가격 안분: 공제 = floor(base × main/total × 합산공제율).
  let oneHouseDeduction: OneHouseDeductionResult | undefined = undefined;
  let section8para4Detail: ComprehensiveTaxResult["section8para4Detail"] = undefined;

  if (
    // 1세대1주택 세액공제(§9⑤~⑨) — 개인 1세대1주택·§10의2 부부 특례·§8④ 의제 (신청인 기준, 령 §5의2⑧)
    oneHouseTreatment &&
    isSubjectToHousingTax &&
    input.birthDate &&
    input.acquisitionDate
  ) {
    // §8④ 의제 성립 시만 안분 (일반 1세대1주택·부부특례는 비율 1 — 안분 생략)
    const apportionment =
      isSection8para4Applied && excludedAssessedValueS84 > 0
        ? {
            mainHouseAssessedValue: includedAssessedValue - excludedAssessedValueS84,
            totalAssessedValue: includedAssessedValue,
          }
        : undefined;
    oneHouseDeduction = applyOneHouseDeduction(
      taxAfterPropertyCredit,
      input.birthDate,
      input.acquisitionDate,
      assessmentDate,
      apportionment,
    );
  }

  // §8④ 의제 echo (성립 시 — 결과뷰 배지·안분 산식)
  if (isSection8para4Applied) {
    section8para4Detail = {
      appliedTypes: Array.from(
        new Set(s84Properties.map((p) => p.section8para4Type ?? "none")),
      ),
      mainHouseAssessedValue: includedAssessedValue - excludedAssessedValueS84,
      excludedAssessedValue: excludedAssessedValueS84,
    };
  }

  const comprehensiveTaxAfterCredit = Math.max(
    taxAfterPropertyCredit - (oneHouseDeduction?.deductionAmount ?? 0),
    0,
  );

  // ── Step 8: 세부담 상한 (연도별 — ≤2022 다주택 300% / 2023~ 단일 150%) ──
  //   §9②3호 법인은 상한 배제 (§10 단서 — 구법·현행 동일, 전년도 세액 입력해도 미적용)
  const capRate =
    useMultiRate && yearParams.taxCapRateMultiHouseAdjusted !== undefined
      ? yearParams.taxCapRateMultiHouseAdjusted
      : yearParams.taxCapRateGeneral;
  // 세부담상한 전년도 총세액: 직접입력 우선, 없으면 직전연도 자동계산 결과(시행령 §5②)
  const prevTotalForCap = input.previousYearTotalTax ?? previousYearEquivalent?.total;
  const taxCap =
    corporateClass === "corporate_special"
      ? undefined
      : applyTaxCap(
          comprehensiveTaxAfterCredit,
          aValue, // ⓐ(Min 후) — 별지5호 ⑲ = ⑧(ⓐ) + ⑬(taxBeforeCap) 정합
          prevTotalForCap,
          capRate,
        );

  if (prevTotalForCap === undefined && corporateClass !== "corporate_special") {
    warnings.push(
      "전년도 재산세·종부세 고지서의 합계 세액을 입력하시면 세부담 상한이 자동 적용됩니다.",
    );
  }

  const determinedHousingTax = taxCap ? taxCap.cappedTax : comprehensiveTaxAfterCredit;

  // ── 서식 칸 echo ──
  // 3호부표 ⑤·5호 ③ 1세대1주택 추가공제 = 기본공제 − 일반공제 (1세대1주택 취급 시만)
  const oneHouseExtraDeduction = oneHouseTreatment
    ? Math.max(basicDeduction - yearParams.basicDeductionGeneral, 0)
    : undefined;
  // 별지5호 ⑲ 해당연도 총세액상당액 = ⓐ + 세부담상한 전 종부세액 (taxCap 산정 시만)
  const currentYearTotalEquivalent = taxCap
    ? aValue + comprehensiveTaxAfterCredit
    : undefined;

  // ── Step 9: 농어촌특별세 ──
  const housingRuralSpecialTax = Math.floor(
    determinedHousingTax * COMPREHENSIVE_CONST.RURAL_SPECIAL_TAX_RATE,
  );
  const totalHousingTax = determinedHousingTax + housingRuralSpecialTax;

  // ── Step A: 종합합산 토지분 (토지 FMR 연도별 — 시행령 §2의4②: 2021=95%, 2022~=100%) ──
  //   필지 모드(landAggregateParcels) 우선 — 지자체 합산 재산세(§122 Min) + 직전연도 상당액 자동계산 후
  //   기존 calculateAggregateLandTax 시그니처 무변경 호출 + 분해 echo 부착 (어댑터).
  const aggregateLandTax = input.landAggregateParcels?.length
    ? buildAggregateLandFromParcels(
        input.landAggregateParcels,
        input.assessmentYear,
        yearParams.fairMarketRatioLand,
        input.landAggregatePreviousYearTotalTax,
      )
    : input.landAggregate
      ? calculateAggregateLandTax(input.landAggregate, yearParams.fairMarketRatioLand)
      : undefined;

  // ── Step B: 별도합산 토지분 (토지 FMR 연도별 동일 + §15② 세부담상한 G-3) ──
  const separateLandTax = input.landSeparateParcels?.length
    ? buildSeparateLandFromParcels(
        input.landSeparateParcels,
        input.assessmentYear,
        yearParams.fairMarketRatioLand,
        input.landSeparatePreviousYearTotalTax,
      )
    : input.landSeparate && input.landSeparate.length > 0
      ? calculateSeparateAggregateLandTax(input.landSeparate, yearParams.fairMarketRatioLand)
      : undefined;

  // ── 최종 합계 ──
  const totalPropertyTaxFinal = propertyResults.reduce(
    (sum, p) => sum + p.propertyTax,
    0,
  );
  const grandTotal =
    totalHousingTax +
    totalPropertyTaxFinal +
    (aggregateLandTax?.totalTax ?? 0) +
    (separateLandTax?.totalTax ?? 0);

  if (isJointApplied) {
    warnings.push(
      "§10의2 부부 공동명의 1주택자 특례 적용 — 주택 공시가격은 배우자 지분 합산(전체 금액) 기준이며, 세액공제는 납세의무자(합의로 정한 자)의 연령·보유기간 기준입니다. 특례 신청 기한은 해당 연도 9월 16일~30일입니다.",
    );
  } else if (!isCorporate) {
    warnings.push(
      "본 계산은 개인 단독명의 기준입니다. 부부 공동명의 1주택이면 1단계에서 §10의2 특례 신청 여부를 선택할 수 있습니다.",
    );
  } else if (corporateClass === "corporate_general" || corporateClass === "corporate_public") {
    warnings.push(
      "§9②1·2호 법인 — 시행령 §4의4②에 따라 §8③ 보유현황 신고기간에 관할세무서장에게 서류를 제출해야 합니다(최초 제출 다음 연도부터 변동이 없으면 생략 가능).",
    );
  }

  return {
    aggregationExclusion,
    properties: propertyResults,
    totalAssessedValue,
    includedAssessedValue,
    effectiveIncludedAssessedValue,  // T-04 echo: 감면후 과세 공시가격 합산 (부표3 ③칸)
    basicDeduction,
    fairMarketRatio,
    taxBase,
    isSubjectToHousingTax,
    appliedRate,
    progressiveDeduction,
    calculatedTax,
    isMultiHouseRateApplied,
    oneHouseExtraDeduction,
    taxAfterPropertyCredit,
    taxBeforeCap: comprehensiveTaxAfterCredit,
    currentYearTotalEquivalent,
    oneHouseDeduction,
    section8para4Detail,
    propertyTaxCredit,
    taxCap,
    previousYearEquivalent,
    determinedHousingTax,
    housingRuralSpecialTax,
    totalHousingTax,
    totalPropertyTax: totalPropertyTaxFinal,
    aggregateLandTax,
    separateLandTax,
    grandTotal,
    assessmentDate: assessmentDateStr,
    isOneHouseOwner: input.isOneHouseOwner,
    taxpayerType,
    corporateHousingType: input.corporateHousingType,
    corporateHousingClass: corporateClass,
    isJointOwnershipApplied: isJointApplied,
    warnings,
    appliedLawDate: assessmentDateStr,
  };
}

// ============================================================
// 하위 호환 re-export — 기존 import 경로 유지
// ============================================================

export {
  validateRentalExclusion,
  validateOtherExclusion,
  applyAggregationExclusion,
} from "./comprehensive-exclusion";

export {
  getSeniorRate,
  getLongTermRate,
  applyOneHouseDeduction,
  applyTaxCap,
  calculatePropertyTaxCreditProration,
  calculatePostManagementPenalty,
} from "./comprehensive-tax-helpers";

export {
  calcAggregateLandTaxBase,
  calcAggregateLandTaxAmount,
  applyAggregateLandTaxCap,
  calculateAggregateLandTax,
} from "./comprehensive-land-aggregate";
