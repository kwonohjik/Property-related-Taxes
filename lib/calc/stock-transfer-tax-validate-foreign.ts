/**
 * 주식 양도소득세 — 해외주식(PR-4A) 전용 Validation (14지점 ⑧)
 *
 * 분리 근거: stock-transfer-tax-validate.ts 791줄 → 800줄 정책 준수를 위해 분리
 *
 * 3중 패턴 강제 (feedback_validation_sync_8th_point):
 *   API 변환(buildForeignStockApiBody)·UI fallback과 동일 default를 여기서도 적용.
 *   - fgTransferPriceMode || "per_share"
 *   - acquisitionModeFS || "actual"
 *   - foreignTaxMethod || "credit"
 *   - hasForeignTax ?? false
 *   - transferCurrencyCode || "USD"
 *   - acquisitionCurrencyCode || "USD"
 *   - foreignTaxCurrencyCode || "USD"
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   환율·외화 단가 빈값은 미입력 오류로 차단. 자동 채우기 금지.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";

function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

function parseF(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// ============================================================
// Step 1 — 해외주식 시장 선택 시 추가 검증
// ============================================================

/**
 * Step 1 해외주식 추가 검증 (종목명·시장 이미 공통에서 검증됨)
 * — 거주기간 필수
 */
export function validateStep1Foreign(form: StockTransferFormData): StockValidationError[] {
  if (form.marketType !== "foreign_stock") return [];
  const errors: StockValidationError[] = [];

  // 거주기간 필수 (§118의2 납세의무 요건)
  if (isEmpty(form.yearsResidentInKorea)) {
    errors.push({
      field: "yearsResidentInKorea",
      message: "국내 거주 연수를 입력하세요 (§118의2 납세의무 요건 — 만 년 단위)",
      severity: "error",
    });
  } else {
    const years = parseF(form.yearsResidentInKorea);
    if (years < 0) {
      errors.push({
        field: "yearsResidentInKorea",
        message: "거주 연수는 0 이상이어야 합니다",
        severity: "error",
      });
    }
    // 5년 미만 경고 (§118의2) — 에러는 아님, 엔진이 not_liable 처리
    if (years >= 0 && years < 5) {
      errors.push({
        field: "yearsResidentInKorea",
        message: "국내 거주 기간이 5년 미만입니다. §118의2에 따라 납세의무가 없어 세액은 0으로 산출됩니다.",
        severity: "warning",
      });
    }
  }

  // 취득일·양도일 (해외주식도 필수)
  if (isEmpty(form.acquisitionDate)) {
    errors.push({ field: "acquisitionDate", message: "취득일을 입력하세요", severity: "error" });
  }
  if (isEmpty(form.transferDate)) {
    errors.push({ field: "transferDate", message: "양도일을 입력하세요", severity: "error" });
  }

  // 주식 수 필수
  if (isEmpty(form.shareCount)) {
    errors.push({ field: "shareCount", message: "양도 주식 수를 입력하세요", severity: "error" });
  } else {
    const cnt = parseInt(form.shareCount.replace(/,/g, ""), 10);
    if (isNaN(cnt) || cnt <= 0) {
      errors.push({ field: "shareCount", message: "양도 주식 수는 1 이상 정수여야 합니다", severity: "error" });
    }
  }

  return errors;
}

// ============================================================
// Step 2 — 해외주식 양도·취득가액·환율 검증
// ============================================================

/**
 * Step 2 해외주식 검증
 * - 통화 코드 필수 (3자 ISO)
 * - 환율 2종 필수 (>0)
 * - 양도가액 필수
 * - 취득가액 필수 (actual 모드)
 */
export function validateStep2Foreign(form: StockTransferFormData): StockValidationError[] {
  if (form.marketType !== "foreign_stock") return [];
  const errors: StockValidationError[] = [];

  // 3중 패턴 default (API/validate/UI 동일)
  const fgTransferPriceMode = form.fgTransferPriceMode || "per_share";
  const acquisitionModeFS = form.acquisitionModeFS || "actual";

  // ── 양도 통화·환율 ──
  if (isEmpty(form.transferCurrencyCode)) {
    errors.push({ field: "transferCurrencyCode", message: "양도 통화를 선택하세요", severity: "error" });
  }

  if (isEmpty(form.transferExchangeRate)) {
    errors.push({
      field: "transferExchangeRate",
      message: "양도일 기준환율을 입력하세요 (§178의5) — 자동 안분 불가, 직접 입력 필수",
      severity: "error",
    });
  } else {
    const rate = parseF(form.transferExchangeRate);
    if (rate <= 0) {
      errors.push({ field: "transferExchangeRate", message: "양도일 기준환율은 0보다 커야 합니다", severity: "error" });
    }
  }

  // ── 양도가액 ──
  if (fgTransferPriceMode === "per_share") {
    if (isEmpty(form.perShareTransferPriceForeign)) {
      errors.push({
        field: "perShareTransferPriceForeign",
        message: "1주당 양도가액 (외화)을 입력하세요",
        severity: "error",
      });
    } else {
      const v = parseF(form.perShareTransferPriceForeign);
      if (v < 0) {
        errors.push({ field: "perShareTransferPriceForeign", message: "1주당 양도가액은 0 이상이어야 합니다", severity: "error" });
      }
    }
  } else {
    // total 모드
    if (isEmpty(form.totalTransferPriceForeign)) {
      errors.push({
        field: "totalTransferPriceForeign",
        message: "총 양도가액 (외화)을 입력하세요",
        severity: "error",
      });
    } else {
      const v = parseF(form.totalTransferPriceForeign);
      if (v <= 0) {
        errors.push({ field: "totalTransferPriceForeign", message: "총 양도가액은 0보다 커야 합니다", severity: "error" });
      }
    }
  }

  // ── 취득 통화·환율 ──
  if (isEmpty(form.acquisitionCurrencyCode)) {
    errors.push({ field: "acquisitionCurrencyCode", message: "취득 통화를 선택하세요", severity: "error" });
  }

  if (isEmpty(form.acquisitionExchangeRate)) {
    errors.push({
      field: "acquisitionExchangeRate",
      message: "취득일 기준환율을 입력하세요 (§178의5) — 자동 안분 불가, 직접 입력 필수",
      severity: "error",
    });
  } else {
    const rate = parseF(form.acquisitionExchangeRate);
    if (rate <= 0) {
      errors.push({ field: "acquisitionExchangeRate", message: "취득일 기준환율은 0보다 커야 합니다", severity: "error" });
    }
  }

  // ── 취득가액 (actual 모드) ──
  if (acquisitionModeFS === "actual") {
    if (isEmpty(form.perShareAcquisitionPriceForeign)) {
      errors.push({
        field: "perShareAcquisitionPriceForeign",
        message: "1주당 취득가액 (외화)을 입력하세요",
        severity: "error",
      });
    } else {
      const v = parseF(form.perShareAcquisitionPriceForeign);
      if (v < 0) {
        errors.push({ field: "perShareAcquisitionPriceForeign", message: "1주당 취득가액은 0 이상이어야 합니다", severity: "error" });
      }
    }
  }

  return errors;
}

// ============================================================
// Step 3 — 해외주식 외국납부세액 검증
// ============================================================

/**
 * Step 3 해외주식 검증
 * - hasForeignTax=true 시 납부세액·통화·환율 필수
 */
export function validateStep3Foreign(form: StockTransferFormData): StockValidationError[] {
  if (form.marketType !== "foreign_stock") return [];
  const errors: StockValidationError[] = [];

  if (form.hasForeignTax) {
    // 납부세액 필수
    if (isEmpty(form.foreignTaxPaidForeign)) {
      errors.push({
        field: "foreignTaxPaidForeign",
        message: "외국에서 납부한 세액 (외화)을 입력하세요 (§118의6)",
        severity: "error",
      });
    } else {
      const v = parseF(form.foreignTaxPaidForeign);
      if (v <= 0) {
        errors.push({ field: "foreignTaxPaidForeign", message: "외국납부세액은 0보다 커야 합니다", severity: "error" });
      }
    }

    // 통화코드 필수
    if (isEmpty(form.foreignTaxCurrencyCode)) {
      errors.push({ field: "foreignTaxCurrencyCode", message: "외국납부세액 통화를 선택하세요", severity: "error" });
    }

    // 환율 필수
    if (isEmpty(form.foreignTaxExchangeRate)) {
      errors.push({
        field: "foreignTaxExchangeRate",
        message: "납세일 기준환율을 입력하세요 (§178의5) — 자동 안분 불가",
        severity: "error",
      });
    } else {
      const rate = parseF(form.foreignTaxExchangeRate);
      if (rate <= 0) {
        errors.push({ field: "foreignTaxExchangeRate", message: "납세일 기준환율은 0보다 커야 합니다", severity: "error" });
      }
    }
  }

  return errors;
}
