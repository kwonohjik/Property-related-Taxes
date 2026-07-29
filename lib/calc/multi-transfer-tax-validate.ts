/**
 * 다건 양도소득세 폼 검증
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { ALL_INCOME_DEDUCTION_IDS } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import { validateStep } from "./transfer-tax-validate";

/**
 * 다건 합산 엔진(`calculateTransferTaxAggregate`)이 미지원하는 감면 조문 집합 (2026-06-12 리뷰 H-1).
 *
 * 차감형(income_deduction)·세액감면형(tax_amount)·세율특칙(§98 flat 20%·§98의3계 단기 배제)은
 * 단건 엔진의 STEP 4.6·7·8 내부에서 적용되는데, aggregate가 `income = taxableGain − lthd`로
 * 양도소득금액을 재산정하고 세율군을 재계산하면서 차감·감면·농특세·세율특칙이 전부 소실된다
 * (probe 실측: 단건 17,254,000 vs 다건 94,897,000). 침묵 오산보다 명시 차단이 안전.
 */
const MULTI_UNSUPPORTED_REDUCTION_TYPES: ReadonlySet<string> = new Set(ALL_INCOME_DEDUCTION_IDS);

/** 단건 자산의 필수 입력 완성도 검사 (0~100 정수) */
export function calcPropertyCompletion(form: PropertyItem["form"]): number {
  const primary = form.assets?.[0];
  const checks = [
    !!primary?.assetKind,
    !!(form.contractTotalPrice && parseAmount(form.contractTotalPrice) > 0),
    !!form.transferDate,
    !!primary?.acquisitionDate,
    !!(
      primary?.useEstimatedAcquisition
        ? primary.standardPriceAtAcq && primary.standardPriceAtTransfer
        : true
    ),
    !!form.householdHousingCount,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/**
 * 다건(연간 합산) 경로가 정확히 계산할 수 없는 고급 모드를 명시 차단.
 *
 * 합산 엔진(`calculateTransferTaxAggregate`)은 자산별로 단건 엔진(`calculateTransferTax`)을
 * 그대로 호출한다. 그러나 다음 모드는 단건 API route(`/api/calc/transfer`)가 **별도 dispatch**
 * (겸용주택·일반건물·부담부증여 §159 등)로 처리하거나 전용 sub-object를 요구하는데,
 * 다건 변환(`buildPropertyPayload`)이 그 sub-object를 구성하지 않아 일반 양도로 잘못 계산된다.
 * 침묵 오산보다 명시 차단이 안전하다(법령 정확성 최우선).
 *
 * @returns 차단 사유 문자열, 지원 모드면 null
 */
export function validateMultiSupportedMode(form: PropertyItem["form"]): string | null {
  const a = form.assets?.[0];
  if (!a) return null;

  if (a.transferType === "burdened_gift" || a.acquisitionCause === "burdened_gift") {
    return "부담부증여(소령 §159)는 단건 계산기에서만 지원됩니다.";
  }
  if (a.assetKind === "redevelopment_apt") {
    return "재개발·재건축(시행령 §166)은 단건 계산기에서만 지원됩니다.";
  }
  if (a.assetKind === "housing" && a.isMixedUseHouse) {
    return "겸용주택 분리계산은 단건 계산기에서만 지원됩니다.";
  }
  if (a.assetKind === "general_building" || a.assetKind === "commercial_building") {
    return "일반건물·상업용건물(토지·건물 일괄/환산취득가)은 단건 계산기에서만 지원됩니다.";
  }
  if (a.acquisitionCause === "carryover_gift") {
    return "배우자등 이월과세(§97의2)는 단건 계산기에서만 지원됩니다.";
  }
  if (
    a.acquisitionCause === "inheritance" &&
    parseAmount(a.publishedValueAtInheritance ?? "0") <= 0
  ) {
    // (b) 다건은 상속세 신고가액(publishedValueAtInheritance)을 취득가액으로 직접 사용.
    // 신고가액이 확정되면 허용하고, 공란이면 보충적평가 자동조회·환산 등 단건 전용 산정 경로가
    // 필요한데 다건 route 미지원 → 취득가액 0 과대과세되므로 신고가액 확정 전까지만 차단.
    return "상속 취득가액(신고가액)을 입력하거나 단건 계산기를 사용하세요. 보충적평가 자동조회·환산취득가는 단건 계산기에서만 지원됩니다.";
  }
  if (a.usePreHousingDisclosure) {
    return "개별주택가격 미공시 환산취득가(§164⑤)는 단건 계산기에서만 지원됩니다.";
  }
  if (a.parcelMode && a.assetKind === "land") {
    return "다필지 토지는 단건 계산기에서만 지원됩니다.";
  }
  if (a.familyBusinessInheritance !== undefined) {
    return "가업상속공제(§97의2④) 의제 취득가액은 단건 계산기에서만 지원됩니다.";
  }
  if (a.hasSeperateLandAcquisitionDate) {
    return "토지·건물 취득일 분리(§166⑥)는 단건 계산기에서만 지원됩니다.";
  }
  // 차감형·세액감면형·세율특칙 감면 (§98~§99의2 미분양·신축 시리즈) — 다건 합산 미지원 (H-1)
  const blockedReduction = (a.reductions ?? []).find((r) =>
    MULTI_UNSUPPORTED_REDUCTION_TYPES.has(r.type),
  );
  if (blockedReduction) {
    return "미분양·신축주택 감면(조특법 §98~§99의2 시리즈)은 단건 계산기에서만 지원됩니다. 합산 계산에서는 차감·세액감면이 반영되지 않습니다.";
  }
  // 모드 2 — 보유 감면주택 주택수 제외(§89①3호 의제)도 단건 전용
  if ((form.specialHouseExclusions?.length ?? 0) > 0) {
    return "보유 감면주택 주택수 제외(§89①3호 의제)는 단건 계산기에서만 지원됩니다.";
  }
  if ((form.assets?.length ?? 0) > 1) {
    return "한 건 내 다자산 일괄양도는 단건 계산기에서만 지원됩니다.";
  }
  return null;
}

/** 건별 편집이 최소 조건을 충족하는지 (다음 단계 이동 가능 여부) */
export function isPropertyReady(item: PropertyItem): boolean {
  // Step1↔Step3 통합 후 4단계 구조: Step 0(자산·취득) ~ Step 2(감면) 검증.
  // Step 3(가산세)은 선택이므로 제외.
  for (let step = 0; step <= 2; step++) {
    if (validateStep(step, item.form) !== null) return false;
  }
  return true;
}

/** 전체 다건 공통 설정 검증 */
export function validateMultiSettings(form: MultiTransferFormData): string | null {
  if (form.properties.length === 0) return "양도 건을 1건 이상 추가하세요.";
  if (form.properties.length > 20) return "최대 20건까지 동시 양도 계산을 지원합니다.";
  if (!form.taxYear || form.taxYear < 2000) return "과세연도를 확인하세요.";

  // 모든 건의 양도일이 taxYear 내에 있어야 함
  for (const p of form.properties) {
    if (!p.form.transferDate) continue;
    const year = new Date(p.form.transferDate).getFullYear();
    if (year !== form.taxYear) {
      return `"${p.propertyLabel}"의 양도일(${p.form.transferDate})이 과세연도(${form.taxYear})와 다릅니다.`;
    }
  }

  // 다건 합산이 정확히 계산할 수 없는 고급 모드 명시 차단 (침묵 오산 방지)
  for (const p of form.properties) {
    const unsupported = validateMultiSupportedMode(p.form);
    if (unsupported) {
      return `"${p.propertyLabel}": ${unsupported}`;
    }
  }

  const used = parseAmount(form.annualBasicDeductionUsed);
  if (used > 2_500_000) return "연간 기사용 기본공제는 250만원을 초과할 수 없습니다.";

  // [B8] 신고서 단위 수정신고·경정청구 검증 (단건 transfer-tax-validate step3 amendment 블록 이식)
  if (form.amendmentMode) {
    if (parseAmount(form.originalDeterminedTax) <= 0) return "당초 결정세액을 입력하세요.";
    // 경정청구 후발적 사유 → 사유 안 날 필수 (§45의2② 3개월 기산)
    if (
      form.correctionKind === "refund_claim" &&
      form.claimReasonType === "posterior" &&
      !form.posteriorEventDate
    ) {
      return "후발적 사유를 안 날을 입력하세요.";
    }
    if (form.applyUnderReportingPenalty && form.underReductionMode === "auto_48_2") {
      if (!form.statutoryFilingDeadline) return "§48② 자동감면 산정을 위해 법정신고기한을 입력하세요.";
      if (!form.amendedFilingDate) return "§48② 자동감면 산정을 위해 수정신고일을 입력하세요.";
    }
    if (form.applyLatePaymentPenalty) {
      if (!form.statutoryFilingDeadline) return "납부지연가산세 산정을 위해 법정신고기한을 입력하세요.";
      if (!form.amendedPaymentDate)
        return "납부지연가산세 산정을 위해 수정신고 납부(예정)일을 입력하세요.";
    }
  }

  return null;
}

/** 모든 건의 최소 조건 충족 여부 */
export function areAllPropertiesReady(properties: PropertyItem[]): boolean {
  return properties.every(isPropertyReady);
}
