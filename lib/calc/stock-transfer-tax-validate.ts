/**
 * 주식 양도소득세 Validation (14지점 ⑧)
 *
 * UI 통과 ↔ validate 차단 모순 방지:
 *   API 변환·UI에서 적용하는 fallback과 동일 fallback을 여기서도 적용.
 *
 * 3중 패턴 적용 (feedback_validation_sync_8th_point):
 *   - acquisitionMode || "actual"
 *   - transferPriceMode || "actual"
 *   - acquisitionCause || "purchase"
 *   - filingType || "preliminary"
 *   - acquiredBeforeListing ?? false
 *   - tradingHaltAtTransfer ?? false
 *   - isVentureCompany ?? false
 *   - isKOTCTrading ?? false
 *   - isLargestShareholderGroup ?? false
 *   - isElectronicFiling ?? false
 *   - filingViolation || "none"
 *   - isFraudulent ?? false
 *   - isInternationalTransaction ?? false
 *   - realEstateGroupBasicDeductionUsed ?? 0
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback).
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  validateStep1Foreign,
  validateStep2Foreign,
  validateStep3Foreign,
} from "./stock-transfer-tax-validate-foreign";
import {
  validateStep1ExitTax,
  validateStep2ExitTax,
  validateStep3ExitTax,
} from "./stock-transfer-tax-validate-exit";
import { validateStep1Domestic } from "./stock-transfer-tax-validate-step1";
import { validateStep2Domestic } from "./stock-transfer-tax-validate-step2";

export interface StockValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

/** 통화 문자열("1,000,000") → 숫자. 빈값·비수치는 0 */
function amountOf(s: string | undefined): number {
  const n = Number((s ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ============================================================
// Step별 validation (마법사 단계 진입 전 검증)
// ============================================================

/**
 * Step 1 검증 — 시장·대주주·취득원인·일자·수량
 */
export function validateStep1(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 종목명 필수 (저장·이력·신고서 표시용 메타데이터)
  if (isEmpty(form.securityName)) {
    errors.push({ field: "securityName", message: "종목명을 입력하세요", severity: "error" });
  }

  // 시장 분류 필수
  if (!form.marketType) {
    errors.push({ field: "marketType", message: "시장 유형을 선택하세요", severity: "error" });
  }

  // 외국법인 차단 (레거시 enum 값 — 현재는 foreign_stock 사용)
  if ((form.marketType as string) === "out_of_scope_foreign") {
    errors.push({
      field: "marketType",
      message: "해외주식(§94①3 다목)은 별도 도메인입니다. 이 계산기는 국내주식만 지원합니다.",
      severity: "error",
    });
  }

  // PR-4A 해외주식 전용 Step1 검증 (validate-foreign.ts 분리)
  if (form.marketType === "foreign_stock") {
    errors.push(...validateStep1Foreign(form));
    // 해외주식은 대주주·기타자산·lot 분기 검증 스킵 (별도 도메인)
    return errors;
  }

  // PR-4B 국외전출세 전용 Step1 검증 (validate-exit.ts 분리)
  if (form.marketType === "exit_tax") {
    errors.push(...validateStep1ExitTax(form));
    // 국외전출세는 국내 대주주·기타자산·lot 분기 검증 스킵 (별도 도메인)
    return errors;
  }

  // 국내주식 본체 → validate-step1.ts (800줄 정책 분리)
  errors.push(...validateStep1Domestic(form));

  return errors;
}

/**
 * Step 2 검증 — 양도가액·취득가액·환산 입력
 */
export function validateStep2(form: StockTransferFormData): StockValidationError[] {
  // PR-4A 해외주식 → validate-foreign.ts (800줄 정책 분리)
  if (form.marketType === "foreign_stock") return validateStep2Foreign(form);
  // PR-4B 국외전출세 → validate-exit.ts (800줄 정책 분리)
  if (form.marketType === "exit_tax") return validateStep2ExitTax(form);
  // 국내주식 본체 → validate-step2.ts (800줄 정책 분리)
  return validateStep2Domestic(form);
}

/**
 * Step 3 검증 — 필요경비·신고
 */
export function validateStep3(form: StockTransferFormData): StockValidationError[] {
  // PR-4A 해외주식 → validate-foreign.ts
  if (form.marketType === "foreign_stock") return validateStep3Foreign(form);
  // PR-4B 국외전출세 → validate-exit.ts
  if (form.marketType === "exit_tax") return validateStep3ExitTax(form);

  const errors: StockValidationError[] = [];

  // 3중 패턴 fallback. 소령 §163⑥4 — expenseMode는 acquisitionMode에서 자동 도출.
  const acquisitionMode = form.acquisitionMode || "actual";
  // 장부분실 액면가(§99①4 후단)는 estimated 하위 토글(`acqFaceValueOnly`)이라 이미 포함된다.
  const isEstimatedAcq =
    acquisitionMode === "estimated" || acquisitionMode === "sale_case";
  const expenseMode: "actual" | "estimated" = isEstimatedAcq ? "estimated" : "actual";

  // 신고일 필수
  if (isEmpty(form.filingDate)) {
    errors.push({ field: "filingDate", message: "신고일을 입력하세요", severity: "error" });
  }

  // 부정행위·국제거래 가산세는 신고 위반이 전제 (Zod refine과 3중 동기 — 14지점 ⑧)
  const filingViolation = form.filingViolation || "none";
  if (filingViolation === "none" && (form.isFraudulent || form.isInternationalTransaction)) {
    errors.push({
      field: "filingViolation",
      message: "부정행위·국제거래 가산세는 신고 위반(과소신고 또는 무신고)이 전제됩니다. 신고 위반 여부를 선택하세요.",
      severity: "error",
    });
  }

  /**
   * 납부지연가산세(국세기본법 §47조의4①1호)는 **미납세액과 법정납부기한이 둘 다** 있어야
   * 계산된다 — 경과일수를 기한 다음 날부터 세기 때문이다. 기한 없이 미납세액만 넣으면
   * 엔진이 **조용히 0을 반환**하므로, 「입력했는데 안 잡힌다」가 되지 않게 여기서 막는다
   * (자동 fallback 금지 — 미입력은 검증 오류로 차단).
   */
  if (amountOf(form.unpaidTax) > 0 && isEmpty(form.paymentDeadline)) {
    errors.push({
      field: "paymentDeadline",
      message: "납부지연가산세를 계산하려면 법정납부기한을 입력하세요 (경과일수 기산점입니다).",
      severity: "error",
    });
  }

  return errors;
}

/**
 * 전체 단계 통합 검증 (계산 실행 전)
 */
export function validateAllSteps(form: StockTransferFormData): StockValidationError[] {
  return [
    ...validateStep1(form),
    ...validateStep2(form),
    ...validateStep3(form),
  ];
}

/**
 * ⑧ 다종목 — **확정한 종목 전부**를 계산 전에 검증한다.
 *
 * ## 왜 필요한가 (V-3 실측 2026-08-27)
 *
 * 종목 확정 게이트는 **종목명·시장 2개**뿐이다(사용자가 종목을 오가며 채우는 흐름을 막지
 * 않으려는 의도적 설계). 문제는 그 뒤였다 — 불완전한 종목이 목록에 남은 채 계산하면:
 *
 *   1. `buildStockTransferApiBody` 가 나머지를 기본값으로 채워 **Zod 가 통과**하고,
 *   2. 엔진에서 `transferDate.getTime is not a function` 으로 **터진다**(500).
 *
 * 사용자에게는 그냥 「계산 오류」라 **어느 종목이 문제인지 알 길이 없다**. 종목이 5건이면
 * 하나씩 지워 보는 수밖에 없다.
 *
 * ⇒ 계산 전에 **순번과 종목명으로 지목**해 막는다. 종목당 **첫 오류만** 보고한다 —
 *   한 종목이 오류 10건을 쏟으면 목록이 읽히지 않는다.
 *
 * ⚠️ 서버 방어는 별개다 — `stockTransferInputSchema` 의 날짜 칸이 빈 문자열을 거부한다(⑫).
 *   클라이언트 검증만 두면 API 를 직접 호출하는 경로가 그대로 500 을 만든다.
 */
export function validateFilingItems(
  forms: StockTransferFormData[],
): StockValidationError[] {
  const errors: StockValidationError[] = [];
  forms.forEach((form, i) => {
    const first = validateAllSteps(form).find((e) => e.severity === "error");
    if (!first) return;
    const label = form.securityName?.trim()
      ? `${i + 1}번째 종목 「${form.securityName.trim()}」`
      : `${i + 1}번째 종목`;
    errors.push({
      field: first.field,
      message: `${label}: ${first.message}`,
      severity: "error",
    });
  });

  errors.push(...validateForeignTaxMethodUnity(forms));
  return errors;
}

/**
 * §118의6① — 세액공제(1호)/필요경비 산입(2호)은 **과세기간(신고) 단위 택일**이다.
 *
 * 법문이 「다음 각 호의 방법 중 **하나를 선택**하여 적용할 수 있다」이고, 1호 산식의
 * A(국외 산출세액 합)·C(국외 양도소득금액 합)가 **과세기간 총량**이라 종목마다 갈리면
 * C의 구성이 명문 없이 정해진다(계획서 §4.2 · 2026-09-01 확정).
 *
 * ⚠️ 판정 대상은 **외국납부세액이 있는 국외 종목**뿐이다 — 세금을 내지 않은 종목의
 *    `foreignTaxMethod`는 아무 의미가 없어(폼 기본값 "credit") 섞였다고 막으면 오탐이다.
 *
 * 🔑 폼은 `carryFilingFields`로 이 값을 승계하므로 정상 흐름에서는 어긋나지 않는다.
 *    이 검증은 **stale sessionStorage·직접 API 호출** 같은 우회 경로를 막는 방어선이다
 *    (`feedback_new_asset_field_stale_sessionstorage_guard`).
 */
function validateForeignTaxMethodUnity(
  forms: StockTransferFormData[],
): StockValidationError[] {
  const methods = forms
    .filter((f) => f.marketType === "foreign_stock" && f.hasForeignTax)
    .map((f) => f.foreignTaxMethod || "credit");   // 3중 패턴 default
  if (new Set(methods).size <= 1) return [];
  return [
    {
      field: "foreignTaxMethod",
      message:
        "외국납부세액 처리 방법(세액공제 / 필요경비 산입)은 신고 전체에 하나만 고를 수 있습니다 " +
        "(소득세법 §118의6①). 종목마다 다르게 선택된 상태입니다 — 하나로 통일하세요.",
      severity: "error",
    },
  ];
}

/**
 * 화면 인덱스 → 그 단계의 검증 (**매핑 정본 1벌**).
 *
 * 🔑 인덱스 3(결과)은 **단계 검증 대상이 아니다.** 종전 오케스트레이터의 삼항은 여기서
 *    `validateStep3`으로 흘러내렸는데, 그것이 무해했던 것은 `validateStep3`이 경고를
 *    **하나도 만들지 않기** 때문일 뿐이었다(실측 — foreign·exit 변형 포함 0건).
 *    우연에 기대지 않도록 빈 배열로 못 박는다.
 *
 * 배지(`getStepErrorCount`)·차단(`handleNext`)·경고 배너가 **모두 이것을 쓴다**. 사본이
 * 갈리면 셋이 서로 다른 단계를 가리킨다. 판정 마법사의 동명 함수와 같은 규약이다.
 */
export function validateStepByIndex(
  form: StockTransferFormData,
  step: number,
): StockValidationError[] {
  switch (step) {
    case 0: return validateStep1(form);
    case 1: return validateStep2(form);
    case 2: return validateStep3(form);
    default: return [];
  }
}

/**
 * 특정 step의 에러 개수 (StepIndicator 배지용) — 경고는 세지 않는다(진행을 막지 않으므로).
 */
export function getStepErrorCount(form: StockTransferFormData, step: number): number {
  return validateStepByIndex(form, step).filter((e) => e.severity === "error").length;
}
