/**
 * 가업상속공제 (상증법 §18의2 + 상증령 §15) — 정밀화 엔진 (Phase A·B)
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - 상증법 §18의2 mst=276123 (시행 2026-01-02)
 *   - 상증령 §15 mst=283637 (시행 2026-02-27)
 *
 * 800줄 정책으로 inheritance-deductions.ts에서 sibling 분리.
 *
 * 계획서: docs/00-pm/inheritance-family-business-deduction-expansion.plan.md (v3)
 * 디자인: docs/02-design/features/inheritance-family-business-deduction/inheritance-family-business-deduction.engine.design.md (v2)
 *
 * Phase F (사후관리·추징)는 본 PR scope 외 — 별도 PR (inheritance-family-business-postmanage).
 */

import type {
  EstateItem,
  FamilyBusinessCap,
  FamilyBusinessDeductionDetail,
  FamilyBusinessIneligibleReason,
  FamilyBusinessInheritanceInput,
  FamilyBusinessMediumGuard,
  FamilyBusinessUnit,
  MultipleFamilyBusinessResult,
} from "../types/inheritance-gift.types";
import {
  FAMILY_BUSINESS_CAP_10Y,
  FAMILY_BUSINESS_CAP_20Y,
  FAMILY_BUSINESS_CAP_30Y,
  FAMILY_BUSINESS_OTHER_ESTATE_RATIO,
  FAMILY_BUSINESS_SCALE_THRESHOLD,
} from "../types/inheritance-gift.types";
import { calcCorporateStockAdjustedValue } from "../property-valuation-corporate";
import { resolveEstateItemValue } from "../valuation/resolve-estate-item-value";

// 요건 자동판정(Phase 1) — re-export로 import 사이트 단일화 (eligibility-autoderive)
export {
  calcInheritanceFilingDeadline,
  deriveFBHeirIsAdult,
  deriveFBHeirOfficerByDeadline,
  deriveFBHeirCEOWithinTwoYears,
  deriveFBHeirEngagement,
  suggestFBOperatingYears,
  resolveFamilyBusinessRequirements,
  resolveFamilyBusinessHeirId,
  deriveFBDecedentShareholding,
  getShareThresholdByDate,
  deriveFBDecedentCEO,
} from "./family-business-autoderive";

/** 개정연혁 한도 상수 (계획서 §5-6, PDF 378·381p) */
const FB_CAP_200: FamilyBusinessCap = 20_000_000_000; // 200억
const FB_CAP_300: FamilyBusinessCap = 30_000_000_000; // 300억
const FB_CAP_500: FamilyBusinessCap = 50_000_000_000; // 500억

/**
 * 영위 연수별 한도 (상증법 §18의2① 각 호 + 개정연혁, 계획서 §5-6).
 *
 * deathDate(상속개시일) 미입력 시 **현행(2023.1.1.~)** 기본 — 기존 동작 100% 보존(회귀 0).
 *   - 2023.1.1.~ : 10~20 300억 / 20~30 400억 / 30+ 600억
 *   - 2018.1.1.~2022.12.31 : 10~20 200억 / 20~30 300억 / 30+ 500억
 *   - 2014.1.1.~2017.12.31 : 10~15 200억 / 15~20 300억 / 20+ 500억 (구간 경계 다름)
 *   - 2014.1.1. 이전 : 미모델 → 현행 fallback (회귀 0)
 * - undefined operatingYears → 600억 fallback (legacy 단일 캡 / Phase E 직접입력 모드)
 * - 10년 미만 → 0 (자격 미충족)
 *
 * [[single-source-engine-helper]] [[feedback_ui_engine_dual_truth_avoidance]] [[feedback_historical_tax_tables]]
 * UI 미리보기·결과 카드·anchor 모두 본 헬퍼 import 강제. UI 자체 함수 금지.
 */
export function familyBusinessCap(
  operatingYears: number | undefined,
  deathDate?: string,
): FamilyBusinessCap {
  if (operatingYears == null) return FAMILY_BUSINESS_CAP_30Y;
  if (operatingYears < 10) return 0;

  // 시기별 한도 (deathDate YYYY-MM-DD 사전순 비교)
  if (deathDate && deathDate >= "2018-01-01" && deathDate < "2023-01-01") {
    // 2018.1.1.~2022.12.31
    if (operatingYears >= 30) return FB_CAP_500;
    if (operatingYears >= 20) return FB_CAP_300;
    return FB_CAP_200;
  }
  if (deathDate && deathDate >= "2014-01-01" && deathDate < "2018-01-01") {
    // 2014.1.1.~2017.12.31 (15년 경계)
    if (operatingYears >= 20) return FB_CAP_500;
    if (operatingYears >= 15) return FB_CAP_300;
    return FB_CAP_200;
  }

  // 현행 (2023.1.1.~) — deathDate 미입력·2014 이전 default
  if (operatingYears >= 30) return FAMILY_BUSINESS_CAP_30Y;
  if (operatingYears >= 20) return FAMILY_BUSINESS_CAP_20Y;
  return FAMILY_BUSINESS_CAP_10Y;
}

/**
 * 복수가업 순차공제 (상증령 §15④ + 상증칙 §5, 2016.2.5.~ / PDF 378·379p — PR-4).
 *
 * 피상속인이 둘 이상의 독립된 가업을 영위한 경우:
 *   - **총한도** = 계속경영기간이 가장 긴 기업의 한도 (상증칙 §5 전단)
 *   - **순서** = 영위연수 내림차순 (긴 기업의 가업상속재산가액부터 순차 공제, 상증칙 §5 후단)
 *   - 각 기업 공제 = Min(잔여 총한도, 가업상속재산가액, 영위연수별 개별한도)  ← PDF 379p 표
 *   - 합계 ≤ 총한도
 *
 * deathDate 시기별 한도는 familyBusinessCap 재사용 (개정연혁 자동 반영, 회귀 0).
 * 정수 연산 — 입력 가액·한도 모두 원(정수), Min/뺄셈만 사용 (floor 불필요).
 *
 * [[single-source-engine-helper]] UI·결과카드·anchor 모두 본 헬퍼 import 강제.
 */
export function calcMultipleFamilyBusinessDeduction(
  units: FamilyBusinessUnit[],
  deathDate?: string,
): MultipleFamilyBusinessResult {
  // 영위연수 내림차순 안정 정렬 (동률이면 입력 순 유지)
  const sorted = units
    .map((u, i) => ({ u, i }))
    .sort((a, b) => b.u.operatingYears - a.u.operatingYears || a.i - b.i)
    .map(({ u }) => u);

  // 총한도 = 가장 긴 기업의 한도 (상증칙 §5)
  const longestYears = sorted.length > 0 ? sorted[0].operatingYears : 0;
  const totalCap = familyBusinessCap(longestYears, deathDate);

  let remaining: number = totalCap;
  const lineItems = sorted.map((u, idx) => {
    const individualCap = familyBusinessCap(u.operatingYears, deathDate);
    const remainingTotalCapBefore = remaining;
    const value = Math.max(0, u.value);
    const deduction = Math.max(0, Math.min(remainingTotalCapBefore, value, individualCap));
    remaining -= deduction;
    return {
      order: idx + 1,
      operatingYears: u.operatingYears,
      value: u.value,
      individualCap,
      remainingTotalCapBefore,
      deduction,
      label: u.label,
    };
  });

  const totalDeduction = lineItems.reduce((sum, li) => sum + li.deduction, 0);
  return { totalCap, lineItems, totalDeduction };
}

/**
 * 중견기업 매출 임계 — 상속개시일 시기별 (상증령 §15②3 개정연혁, 계획서 §5-6 / PDF 367p).
 *
 * deathDate 미입력·2011 이전 → 현행 5천억 fallback (회귀 0).
 *   2023.1.1.~ 5천억 / 2022 4천억 / 2014~2021 3천억 / 2013 2천억 / 2011~2012 1500억.
 * (중소기업 자산총액 5천억(§15①3)은 별도 — 본 헬퍼는 중견 매출 전용.)
 */
export function getMediumRevenueThresholdByDate(deathDate?: string): number {
  if (!deathDate) return FAMILY_BUSINESS_SCALE_THRESHOLD;
  if (deathDate >= "2023-01-01") return 500_000_000_000; // 5천억
  if (deathDate >= "2022-01-01") return 400_000_000_000; // 4천억
  if (deathDate >= "2014-01-01") return 300_000_000_000; // 3천억
  if (deathDate >= "2013-01-01") return 200_000_000_000; // 2천억
  if (deathDate >= "2011-01-01") return 150_000_000_000; // 1500억
  return FAMILY_BUSINESS_SCALE_THRESHOLD; // 2011 이전 미모델 → 현행 fallback
}

/**
 * 가업상속 요건 판정 (상증법 §18의2 + 상증령 §15③).
 *
 * Short-circuit: 조세포탈·회계부정 형 확정 시 즉시 미충족 1건 반환 (§18의2⑧1호).
 * 그 외에는 미충족 사유 누적.
 *
 * businessType="individual" → 지분 요건 (decedentMajorShareholdingMet) skip.
 * spouseFulfillsRequirements=true → 상속인 요건 4종 skip (상증령 §15③2호 후단 간주).
 * decedentEarlyDeath=true → heir 2년 종사 요건 면제 (상증령 §15③2호 나 단서).
 */
export function evaluateFamilyBusinessEligibility(
  input: FamilyBusinessInheritanceInput,
): { eligible: boolean; reasons: FamilyBusinessIneligibleReason[] } {
  // §18의2⑧1호 short-circuit
  if (input.hasTaxFraudConviction) {
    return { eligible: false, reasons: ["tax_fraud_conviction"] };
  }

  const reasons: FamilyBusinessIneligibleReason[] = [];

  // §18의2① 가업 정의 — 10년 미만
  if (input.operatingYears < 10) reasons.push("operating_years_below_10");

  // 상증령 §15①1·②1 별표 업종
  if (!input.isEligibleIndustry) reasons.push("industry_not_eligible");

  // 상증령 §15①3·②3 기업 규모
  if (input.enterpriseSize === "sme") {
    // 중소기업 — 자산총액 5천억 미만 (§15①3, 현행)
    if ((input.totalAssets ?? 0) >= FAMILY_BUSINESS_SCALE_THRESHOLD) {
      reasons.push("enterprise_size_exceeded");
    }
  } else {
    // 중견기업 — 직전 3년 매출 평균 임계 (§15②3, 개정연혁 시기별: 계획서 §5-6)
    if ((input.averageRevenue3Y ?? 0) >= getMediumRevenueThresholdByDate(input.deathDate)) {
      reasons.push("enterprise_size_exceeded");
    }
  }

  // 피상속인 요건 — 상증령 §15③1호
  //   corporate 한정: 가목 지분 (decedentMajorShareholdingMet — UI가 isListedOnExchange hint로 40%/20% 판정)
  //   공통: 나목 대표이사 종사 (decedentCEORequirementMet)
  if (input.businessType === "corporate") {
    if (!input.decedentMajorShareholdingMet) reasons.push("decedent_majority_share_failed");
  }
  if (!input.decedentCEORequirementMet) reasons.push("decedent_ceo_requirement_failed");

  // 상속인 요건 — 상증령 §15③2호 (배우자 충족 간주 시 skip)
  if (!input.spouseFulfillsRequirements) {
    if (!input.heirIsAdult) reasons.push("heir_not_adult");
    // 2년 종사 — decedentEarlyDeath 시 면제 (나 단서)
    const engagementMet = input.heirTwoYearEngagement || input.decedentEarlyDeath === true;
    if (!engagementMet) reasons.push("heir_engagement_short");
    if (!input.heirOfficerByFilingDeadline) reasons.push("heir_officer_not_appointed");
    // 라목 (2년 내 대표이사 취임) — 기회발전특구 특례 적용 시 면제 (상증령 §15㉕)
    //   요건: 본사 특구 소재·이전 (1호) AND 상시근무인원 50%+ (2호) 모두 충족
    const ofzExempted = input.isInOpportunityDevelopmentZone === true
      && input.ofzWorkforceRatio50PlusMet === true;
    if (!ofzExempted && !input.heirCEOWithinTwoYears) reasons.push("heir_ceo_not_scheduled");
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * EstateItem.familyBusinessCategory 자동 합산 (상증령 §15⑤).
 *
 * §15⑤2호 사업무관자산 차감 (PR4): familyBusinessCategory==="corporate_stock" +
 *   corporateTotalAssets 입력 시 `calcCorporateStockAdjustedValue`로 차감
 *   (주식가액 × (총자산 − 사업무관자산) / 총자산). single-source — suggest와 동일 산식.
 * corporateTotalAssets 미입력 = 직접입력 모드(평가액에 차감 후 가액). 이중차감 가드:
 *   동일 입력에 차감 2회 적용 불가 (corporateTotalAssets 입력 여부로 모드 분기).
 * (J-1) raw 평가액 = resolveEstateItemValue — §60 평가 우선순위(시가→감정가→기준시가→비상장 V2).
 *   marketValue 외(감정가·기준시가·V2)로 평가한 가업자산이 0으로 누락되던 갭 해소. gross(차감 전) 반환.
 */
export function deriveFamilyBusinessValue(
  estateItems: EstateItem[] | undefined,
  deathDate?: string,
): number {
  if (!estateItems) return 0;
  return estateItems
    .filter((item) => item.familyBusinessCategory !== undefined)
    .reduce((sum, item) => {
      const raw = resolveEstateItemValue(item);
      // §15⑤2호 — 법인주식 + 총자산 입력 시 사업무관자산 차감 (과다현금 자동산정·제외 단서는 deathDate 시기별)
      if (item.familyBusinessCategory === "corporate_stock" && item.corporateTotalAssets) {
        return (
          sum +
          calcCorporateStockAdjustedValue(
            raw,
            item.corporateTotalAssets,
            item.corporateNonBusinessAssets,
            deathDate,
          ).adjustedValue
        );
      }
      return sum + raw;
    }, 0);
}

/**
 * §18의2② 중견기업 200% 가드 (상증령 §15⑥⑦).
 *
 * - enterpriseSize !== "medium" → undefined (가드 비활성)
 * - 가업상속인의 가업외 상속재산 net (= heirOtherEstateValue − heirDebt)
 *   가 가업상속공제 미적용 시 산출세액(taxIfNoFBD) × 200% 초과 시 exceeded=true → 공제 배제.
 *
 * taxIfNoFBD는 orchestrator에서 주입 (Phase F+ 정밀화 예정).
 */
export function check200PercentGuard(
  input: FamilyBusinessInheritanceInput,
  taxIfNoFBD: number,
): FamilyBusinessMediumGuard | undefined {
  if (input.enterpriseSize !== "medium") return undefined;
  const otherEstateNet = Math.max(0, (input.heirOtherEstateValue ?? 0) - (input.heirDebt ?? 0));

  // 안전장치 (계획서 §5-1): taxIfNoFBD가 orchestrator에서 미연동(≤0)이면 200% 비교가 무의미
  //   (cap200pct = 0 → otherEstateNet>0인 정상 입력이 전부 exceeded=true로 오배제됨).
  //   → 가드 비활성(active:false, exceeded 강제 false). 실연동(2-pass) 전까지 정상 입력 보호.
  if (taxIfNoFBD <= 0) {
    return { taxIfNoFBD, cap200pct: 0, otherEstateNet, exceeded: false, active: false };
  }

  const cap200pct = taxIfNoFBD * FAMILY_BUSINESS_OTHER_ESTATE_RATIO;
  return {
    taxIfNoFBD,
    cap200pct,
    otherEstateNet,
    exceeded: otherEstateNet > cap200pct,
    active: true,
  };
}

/**
 * 가업상속공제 Phase B 통합 — 요건판정 + 200% 가드 + 캡 적용.
 *
 * Orchestrator에서 호출. 직접입력 모드(Phase E)·legacy는 orchestrator 분기.
 */
export interface Phase2FamilyBusinessResult {
  deduction: number;
  detail: FamilyBusinessDeductionDetail;
}

export function calcFamilyBusinessDeductionPhase2(args: {
  input: FamilyBusinessInheritanceInput;
  estateItems: EstateItem[] | undefined;
  familyBusinessValueOverride?: number;
  taxIfNoFBD: number;
  lawRef: string;
  /** 요건 자동판정 메타 (resolveFamilyBusinessRequirements 결과) — detail.resolvedRequirements echo. */
  resolvedMeta?: FamilyBusinessDeductionDetail["resolvedRequirements"];
}): Phase2FamilyBusinessResult {
  const { input, estateItems, familyBusinessValueOverride, taxIfNoFBD, lawRef, resolvedMeta } = args;

  // 1) 요건 판정
  const elig = evaluateFamilyBusinessEligibility(input);
  const reasons = [...elig.reasons];

  // OFZ 특례 활성 여부 (상증령 §15㉕ — 결과 detail 메타 노출용)
  const ofzExemptionActive = input.isInOpportunityDevelopmentZone === true
    && input.ofzWorkforceRatio50PlusMet === true;

  // 2) 200% 가드 (중견기업 한정)
  const guard = check200PercentGuard(input, taxIfNoFBD);
  if (guard?.exceeded) {
    reasons.push("medium_other_estate_exceeds_200pct");
  }

  // 3) 자격 충족 시 한도 결정, 미충족 시 0
  const finalEligible = reasons.length === 0;
  const cap: FamilyBusinessCap = finalEligible
    ? familyBusinessCap(input.operatingYears, input.deathDate)
    : 0;

  // 4) 가액 결정 (manual > auto)
  const autoDerivedValue = deriveFamilyBusinessValue(estateItems, input.deathDate);
  const manualValue = familyBusinessValueOverride;
  const finalValue = manualValue ?? autoDerivedValue;

  // 4-1) 복수가업 순차공제 (상증령 §15④ + 상증칙 §5) — 추가 가업 입력 + 자격 충족 시
  //   주 가업(operatingYears + finalValue) + 추가 가업을 units로 모아 순차 공제.
  const additional = input.additionalFamilyBusinesses ?? [];
  const hasMultiple = finalEligible && additional.length > 0;
  let multipleBusinessDetail: MultipleFamilyBusinessResult | undefined;
  if (hasMultiple) {
    const units: FamilyBusinessUnit[] = [
      { operatingYears: input.operatingYears, value: finalValue, label: "주 가업" },
      ...additional.map((b) => ({
        operatingYears: b.operatingYears,
        value: b.businessValue,
        label: b.label,
      })),
    ];
    multipleBusinessDetail = calcMultipleFamilyBusinessDeduction(units, input.deathDate);
  }

  // 5) 공제액 — 복수가업이면 순차 합계, 단일이면 Min(가액, 한도)
  const deduction = multipleBusinessDetail
    ? multipleBusinessDetail.totalDeduction
    : cap > 0
      ? Math.min(finalValue, cap)
      : 0;

  // 5-0) 결과 표시용 한도·가액 — 복수가업: 총한도 / 전체 가업가액 합
  const effectiveCap: FamilyBusinessCap = multipleBusinessDetail
    ? multipleBusinessDetail.totalCap
    : cap;
  const effectiveFinalValue = multipleBusinessDetail
    ? multipleBusinessDetail.lineItems.reduce((s, li) => s + li.value, 0)
    : finalValue;

  // 5-1) 적용률 (소령 §163의2③ — Track 2/4 prefill). 복수가업은 전체 가업가액 합 기준 통일 산식.
  const appliedRate = effectiveFinalValue > 0 ? deduction / effectiveFinalValue : 0;

  // 6) breakdown
  const breakdown = buildPhase2Breakdown({
    operatingYears: input.operatingYears,
    autoDerivedValue,
    manualValue,
    cap: effectiveCap,
    deduction,
    guard,
    finalEligible,
    lawRef,
    multipleBusinessDetail,
  });

  return {
    deduction,
    detail: {
      eligible: finalEligible,
      ineligibleReasons: reasons.length > 0 ? reasons : undefined,
      appliedCap: effectiveCap,
      operatingYears: input.operatingYears,
      autoDerivedValue,
      manualValue,
      finalValue: effectiveFinalValue,
      deduction,
      appliedRate,
      usedDirectInput: false,
      mediumGuard: guard,
      multipleBusinessDetail,
      ofzExemptionActive: ofzExemptionActive || undefined,
      resolvedRequirements: resolvedMeta,
      breakdown,
    },
  };
}

/**
 * Phase E 직접입력 모드 — 요건 판정 우회, 600억 fallback 한도만 적용.
 */
export function calcFamilyBusinessDeductionDirect(
  directAmount: number,
  lawRef: string,
): Phase2FamilyBusinessResult {
  const cap = FAMILY_BUSINESS_CAP_30Y;
  const capped = Math.min(directAmount, cap);
  // 직접입력 모드 — finalValue = capped이므로 capped > 0이면 1.0 (전액 공제), 0이면 0
  const appliedRate = capped > 0 ? 1 : 0;
  return {
    deduction: capped,
    detail: {
      eligible: true,
      appliedCap: cap,
      operatingYears: 0,
      finalValue: capped,
      deduction: capped,
      appliedRate,
      usedDirectInput: true,
      breakdown: [
        { label: "가업상속공제 (직접 입력, 한도 600억)", amount: capped, lawRef },
      ],
    },
  };
}

/**
 * legacy — familyBusinessValue + familyBusinessYears 단독 사용 (Phase B 객체 미제공).
 * familyBusinessYears 미입력 시 600억 fallback (기존 동작 보존).
 */
export function calcFamilyBusinessDeductionLegacy(
  familyBusinessValue: number,
  operatingYears: number | undefined,
  lawRef: string,
  deathDate?: string,
): Phase2FamilyBusinessResult {
  if (familyBusinessValue <= 0) {
    return {
      deduction: 0,
      detail: {
        eligible: false,
        appliedCap: 0,
        operatingYears: operatingYears ?? 0,
        finalValue: 0,
        deduction: 0,
        appliedRate: 0,
        usedDirectInput: false,
        breakdown: [],
      },
    };
  }
  const cap = familyBusinessCap(operatingYears, deathDate);
  const deduction = Math.min(familyBusinessValue, cap);
  const appliedRate = familyBusinessValue > 0 ? deduction / familyBusinessValue : 0;
  return {
    deduction,
    detail: {
      eligible: cap > 0,
      ineligibleReasons: cap === 0 ? ["operating_years_below_10"] : undefined,
      appliedCap: cap,
      operatingYears: operatingYears ?? 0,
      manualValue: familyBusinessValue,
      finalValue: familyBusinessValue,
      deduction,
      appliedRate,
      usedDirectInput: false,
      breakdown: [
        { label: "가업상속재산가액 (legacy)", amount: familyBusinessValue },
        {
          label: `가업상속공제 (legacy ${operatingYears ?? "?"}년 / 한도 ${formatBillion(cap)})`,
          amount: deduction,
          lawRef,
        },
      ],
    },
  };
}

// ============================================================
// 내부 헬퍼
// ============================================================

function buildPhase2Breakdown(args: {
  operatingYears: number;
  autoDerivedValue: number;
  manualValue: number | undefined;
  cap: FamilyBusinessCap;
  deduction: number;
  guard: FamilyBusinessMediumGuard | undefined;
  finalEligible: boolean;
  lawRef: string;
  multipleBusinessDetail?: MultipleFamilyBusinessResult;
}) {
  const { operatingYears, autoDerivedValue, manualValue, cap, deduction, guard, finalEligible, lawRef, multipleBusinessDetail } = args;
  const steps: Array<{ label: string; amount: number; lawRef?: string }> = [];

  if (autoDerivedValue > 0) {
    steps.push({ label: "가업상속재산가액 (EstateItem 자동합산)", amount: autoDerivedValue });
  }
  if (manualValue !== undefined) {
    steps.push({ label: "가업상속재산가액 (사용자 override)", amount: manualValue });
  }

  // 복수가업 순차공제 (상증령 §15④ + 상증칙 §5) — 기업별 명세
  if (multipleBusinessDetail) {
    steps.push({
      label: `복수가업 총한도 (가장 긴 기업 → ${formatBillion(multipleBusinessDetail.totalCap)})`,
      amount: multipleBusinessDetail.totalCap,
      lawRef: "상증령 §15④ · 상증칙 §5",
    });
    for (const li of multipleBusinessDetail.lineItems) {
      steps.push({
        label: `${li.order}순위 ${li.label ?? `영위 ${li.operatingYears}년`} — Min(잔여 ${formatBillion(li.remainingTotalCapBefore)}, 가액 ${formatBillion(li.value)}, 개별한도 ${formatBillion(li.individualCap)})`,
        amount: li.deduction,
      });
    }
    steps.push({
      label: finalEligible ? "복수가업 공제 합계" : "가업상속공제 — 자격 미충족",
      amount: deduction,
    });
    return steps;
  }

  steps.push({
    label: `가업상속공제 한도 (영위 ${operatingYears}년 → ${formatBillion(cap)})`,
    amount: cap,
    lawRef,
  });
  if (guard?.exceeded) {
    steps.push({
      label: `§18의2② 200% 가드 — 외산 net ${guard.otherEstateNet.toLocaleString()} > 200% cap ${guard.cap200pct.toLocaleString()} → 공제 배제`,
      amount: 0,
      lawRef,
    });
  }
  steps.push({
    label: finalEligible ? "가업상속공제 적용액" : "가업상속공제 — 자격 미충족",
    amount: deduction,
  });
  return steps;
}

function formatBillion(amount: number): string {
  if (amount === 0) return "0";
  const eok = amount / 100_000_000;
  return `${eok.toLocaleString()}억`;
}
