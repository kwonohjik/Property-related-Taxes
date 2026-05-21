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
} from "../types/inheritance-gift.types";
import {
  FAMILY_BUSINESS_CAP_10Y,
  FAMILY_BUSINESS_CAP_20Y,
  FAMILY_BUSINESS_CAP_30Y,
  FAMILY_BUSINESS_OTHER_ESTATE_RATIO,
  FAMILY_BUSINESS_SCALE_THRESHOLD,
} from "../types/inheritance-gift.types";

/**
 * 영위 연수별 한도 (상증법 §18의2① 각 호).
 *
 * - undefined → 600억 fallback (legacy 단일 캡 / Phase E 직접입력 모드)
 * - 30년+ → 600억 (3호)
 * - 20~30 → 400억 (2호)
 * - 10~20 → 300억 (1호)
 * - 10년 미만 → 0 (자격 미충족)
 *
 * [[single-source-engine-helper]] [[feedback_ui_engine_dual_truth_avoidance]]
 * UI 미리보기·결과 카드·anchor 모두 본 헬퍼 import 강제. UI 자체 함수 금지.
 */
export function familyBusinessCap(operatingYears: number | undefined): FamilyBusinessCap {
  if (operatingYears == null) return FAMILY_BUSINESS_CAP_30Y;
  if (operatingYears >= 30) return FAMILY_BUSINESS_CAP_30Y;
  if (operatingYears >= 20) return FAMILY_BUSINESS_CAP_20Y;
  if (operatingYears >= 10) return FAMILY_BUSINESS_CAP_10Y;
  return 0;
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

  // 상증령 §15①3·②3 기업 규모 5천억 미만
  if (input.enterpriseSize === "sme") {
    if ((input.totalAssets ?? 0) >= FAMILY_BUSINESS_SCALE_THRESHOLD) {
      reasons.push("enterprise_size_exceeded");
    }
  } else {
    if ((input.averageRevenue3Y ?? 0) >= FAMILY_BUSINESS_SCALE_THRESHOLD) {
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
    if (!input.heirCEOWithinTwoYears) reasons.push("heir_ceo_not_scheduled");
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * EstateItem.familyBusinessCategory 자동 합산 (상증령 §15⑤).
 *
 * 사업무관자산 차감(§15⑤2호 가~마)은 본 PR 자동 계산 안 함.
 * 사용자가 EstateItem.marketValue에 차감 후 가액 직접 입력. (FB-8 후속 PR로 자동화 예정)
 */
export function deriveFamilyBusinessValue(estateItems: EstateItem[] | undefined): number {
  if (!estateItems) return 0;
  return estateItems
    .filter((item) => item.familyBusinessCategory !== undefined)
    .reduce((sum, item) => sum + (item.marketValue ?? 0), 0);
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
  const cap200pct = taxIfNoFBD * FAMILY_BUSINESS_OTHER_ESTATE_RATIO;
  const otherEstateNet = Math.max(0, (input.heirOtherEstateValue ?? 0) - (input.heirDebt ?? 0));
  return {
    taxIfNoFBD,
    cap200pct,
    otherEstateNet,
    exceeded: otherEstateNet > cap200pct,
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
}): Phase2FamilyBusinessResult {
  const { input, estateItems, familyBusinessValueOverride, taxIfNoFBD, lawRef } = args;

  // 1) 요건 판정
  const elig = evaluateFamilyBusinessEligibility(input);
  const reasons = [...elig.reasons];

  // 2) 200% 가드 (중견기업 한정)
  const guard = check200PercentGuard(input, taxIfNoFBD);
  if (guard?.exceeded) {
    reasons.push("medium_other_estate_exceeds_200pct");
  }

  // 3) 자격 충족 시 한도 결정, 미충족 시 0
  const finalEligible = reasons.length === 0;
  const cap: FamilyBusinessCap = finalEligible ? familyBusinessCap(input.operatingYears) : 0;

  // 4) 가액 결정 (manual > auto)
  const autoDerivedValue = deriveFamilyBusinessValue(estateItems);
  const manualValue = familyBusinessValueOverride;
  const finalValue = manualValue ?? autoDerivedValue;

  // 5) 공제액
  const deduction = cap > 0 ? Math.min(finalValue, cap) : 0;

  // 6) breakdown
  const breakdown = buildPhase2Breakdown({
    operatingYears: input.operatingYears,
    autoDerivedValue,
    manualValue,
    cap,
    deduction,
    guard,
    finalEligible,
    lawRef,
  });

  return {
    deduction,
    detail: {
      eligible: finalEligible,
      ineligibleReasons: reasons.length > 0 ? reasons : undefined,
      appliedCap: cap,
      operatingYears: input.operatingYears,
      autoDerivedValue,
      manualValue,
      finalValue,
      deduction,
      usedDirectInput: false,
      mediumGuard: guard,
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
  return {
    deduction: capped,
    detail: {
      eligible: true,
      appliedCap: cap,
      operatingYears: 0,
      finalValue: capped,
      deduction: capped,
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
        usedDirectInput: false,
        breakdown: [],
      },
    };
  }
  const cap = familyBusinessCap(operatingYears);
  const deduction = Math.min(familyBusinessValue, cap);
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
}) {
  const { operatingYears, autoDerivedValue, manualValue, cap, deduction, guard, finalEligible, lawRef } = args;
  const steps: Array<{ label: string; amount: number; lawRef?: string }> = [];

  if (autoDerivedValue > 0) {
    steps.push({ label: "가업상속재산가액 (EstateItem 자동합산)", amount: autoDerivedValue });
  }
  if (manualValue !== undefined) {
    steps.push({ label: "가업상속재산가액 (사용자 override)", amount: manualValue });
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
