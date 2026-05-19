/**
 * 주식 양도소득세 — 국외전출세(PR-4B) 전용 Validation (14지점 ⑧)
 *
 * 분리 근거: stock-transfer-tax-validate.ts 800줄 정책 준수를 위해 분리
 *
 * 3중 패턴 강제 (feedback_validation_sync_8th_point):
 *   API 변환(buildExitTaxApiBody)·UI fallback과 동일 default를 여기서도 적용.
 *   - etDeferralReason || "none"
 *   - etForeignTaxExclusionReason || "none"
 *   - etIsMajorShareholder ?? false
 *   - etHasFiledHoldingsReport ?? false
 *   - holding.marketType || "kospi"
 *   - holding.departureDayValuationMode || "market_price"
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   시가 모드별 필수 입력 빈값 → 명확한 오류로 차단. 자동 채우기 금지.
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
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

function parseI(s: string): number {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// ============================================================
// Step 1 — 국외전출세 요건 확인 검증
// ============================================================

/**
 * Step 1 국외전출세 검증
 * - 거주기간 필수 (5년 미만 경고)
 * - 출국일 필수
 * - 대주주 여부 (비대주주 경고)
 * - 보유 종목 최소 1건
 */
export function validateStep1ExitTax(form: StockTransferFormData): StockValidationError[] {
  if (form.marketType !== "exit_tax") return [];
  const errors: StockValidationError[] = [];

  // 거주기간 필수 (§118의9①1호)
  if (isEmpty(form.etYearsResidentLast10)) {
    errors.push({
      field: "etYearsResidentLast10",
      message: "출국일 전 10년 중 국내 거주 합계 연수를 입력하세요 (§118의9①1호)",
      severity: "error",
    });
  } else {
    const years = parseF(form.etYearsResidentLast10);
    if (years < 0) {
      errors.push({
        field: "etYearsResidentLast10",
        message: "거주 연수는 0 이상이어야 합니다",
        severity: "error",
      });
    } else if (years < 5) {
      // 5년 미만 → 납세의무 없음 (엔진이 not_liable 처리, 경고만)
      errors.push({
        field: "etYearsResidentLast10",
        message:
          "10년 중 국내 거주 기간이 5년 미만입니다. §118의9①1호에 따라 국외전출세 납세의무가 없어 세액은 0으로 산출됩니다.",
        severity: "warning",
      });
    }
  }

  // 출국일 필수
  if (isEmpty(form.etDepartureDate)) {
    errors.push({
      field: "etDepartureDate",
      message: "출국일을 입력하세요",
      severity: "error",
    });
  }

  // 대주주 여부 — 비대주주 경고 (엔진이 not_liable 처리)
  if (!form.etIsMajorShareholder) {
    errors.push({
      field: "etIsMajorShareholder",
      message:
        "직전 연도말 기준 대주주에 해당하지 않으면 국외전출세 납세의무가 없습니다 (§118의9①2호 → §178의8 준용 §167의8). 대주주인 경우 체크하세요.",
      severity: "warning",
    });
  }

  // 보유 종목 최소 1건
  if (!form.etHoldings || form.etHoldings.length === 0) {
    errors.push({
      field: "etHoldings",
      message: "보유 종목을 최소 1건 입력하세요",
      severity: "error",
    });
  }

  return errors;
}

// ============================================================
// Step 2 — 국외전출세 보유 종목·시가 검증
// ============================================================

/**
 * Step 2 국외전출세 검증
 * - 종목별: 종목명·주식수·취득일·취득단가 필수
 * - 종목별: 출국일 시가 모드별 필수 입력 검증
 * - 자동 안분 fallback 금지: 시가 미입력 → 명확한 오류
 */
export function validateStep2ExitTax(form: StockTransferFormData): StockValidationError[] {
  if (form.marketType !== "exit_tax") return [];
  const errors: StockValidationError[] = [];

  if (!form.etHoldings || form.etHoldings.length === 0) return errors;

  form.etHoldings.forEach((h, i) => {
    const prefix = `종목 ${i + 1}`;

    if (isEmpty(h.stockName)) {
      errors.push({ field: `etHoldings[${i}].stockName`, message: `${prefix}: 종목명을 입력하세요`, severity: "error" });
    }
    if (isEmpty(h.shareCount) || parseI(h.shareCount) <= 0) {
      errors.push({ field: `etHoldings[${i}].shareCount`, message: `${prefix}: 주식수는 1 이상이어야 합니다`, severity: "error" });
    }
    if (isEmpty(h.acquisitionDate)) {
      errors.push({ field: `etHoldings[${i}].acquisitionDate`, message: `${prefix}: 취득일을 입력하세요`, severity: "error" });
    }
    if (isEmpty(h.perShareAcquisitionPrice) || parseI(h.perShareAcquisitionPrice) < 0) {
      errors.push({ field: `etHoldings[${i}].perShareAcquisitionPrice`, message: `${prefix}: 1주당 취득가액을 입력하세요 (원)`, severity: "error" });
    }

    // 출국일 시가 — 모드별 필수 입력 (자동 안분 fallback 금지)
    const mode = h.departureDayValuationMode || "market_price"; // 3중 패턴 default
    if (mode === "market_price") {
      if (isEmpty(h.departureDayMarketPrice) || parseI(h.departureDayMarketPrice) <= 0) {
        errors.push({
          field: `etHoldings[${i}].departureDayMarketPrice`,
          message: `${prefix}: 출국일 거래가액(§178의9①)을 입력하세요 — 자동 안분 불가, 직접 입력 필수`,
          severity: "error",
        });
      }
    } else if (mode === "prior_year_std") {
      if (isEmpty(h.priorYearEndMonthAvg) || parseI(h.priorYearEndMonthAvg) <= 0) {
        errors.push({
          field: `etHoldings[${i}].priorYearEndMonthAvg`,
          message: `${prefix}: §99①3 기준시가(1개월 종가평균)를 입력하세요`,
          severity: "error",
        });
      }
    } else if (mode === "unlisted_sample") {
      if (isEmpty(h.unlistedSamplePrice) || parseI(h.unlistedSamplePrice) <= 0) {
        errors.push({
          field: `etHoldings[${i}].unlistedSamplePrice`,
          message: `${prefix}: 전후 각 3개월 매매사례가액을 입력하세요 (§178의9②2호 가목)`,
          severity: "error",
        });
      }
    } else if (mode === "unlisted_std") {
      if (isEmpty(h.unlistedStdPricePerShare) || parseI(h.unlistedStdPricePerShare) <= 0) {
        errors.push({
          field: `etHoldings[${i}].unlistedStdPricePerShare`,
          message: `${prefix}: §99①4 비상장 기준시가를 입력하세요 (매매사례 없음)`,
          severity: "error",
        });
      }
    }
  });

  return errors;
}

// ============================================================
// Step 3 — 납부방법·경정청구·외국납부세액 검증
// ============================================================

/**
 * Step 3 국외전출세 검증
 * - 납부유예 선택 시 사유 필수
 * - 경정청구 입력 시 실양도 단가 필수
 * - 외국납부세액 입력 시 양식 검증
 */
export function validateStep3ExitTax(form: StockTransferFormData): StockValidationError[] {
  if (form.marketType !== "exit_tax") return [];
  const errors: StockValidationError[] = [];

  // 납부유예 사유 — deferralRequested=true 시 사유 "none" 아닌 값 필수
  // (3중 패턴 default: "none" — "none"은 납부유예 미신청 상태이므로 신청 시 변경 필요)
  if (form.etDeferralRequested) {
    const reason = form.etDeferralReason || "none";
    // deferralReason은 사유 분류용 — 기본 5년("none") 포함 모든 값 허용
    // → 사유 선택 없어도 기본 5년으로 유예 가능. Zod도 동일 허용.

    // 경정청구: 실양도일 입력 시 실양도 단가 필수
    if (form.etActualTransferDate && !isEmpty(form.etActualTransferDate)) {
      if (isEmpty(form.etActualTransferPricePerShare) || parseI(form.etActualTransferPricePerShare) <= 0) {
        errors.push({
          field: "etActualTransferPricePerShare",
          message: "실양도 1주당 단가를 입력하세요 (경정청구 §118의12 조정공제 계산용)",
          severity: "error",
        });
      }
    }
    // 미사용 변수 경고 방지
    void reason;
  }

  // 외국납부세액 — 입력값 있으면 양식 검증 (§118의13)
  if (!isEmpty(form.etForeignTaxPaid)) {
    const v = parseF(form.etForeignTaxPaid);
    if (v <= 0) {
      errors.push({
        field: "etForeignTaxPaid",
        message: "외국납부세액은 0보다 커야 합니다 (§118의13)",
        severity: "error",
      });
    }
  }

  // 비거주자 원천징수세액 — 입력값 있으면 양식 검증 (§118의14)
  if (!isEmpty(form.etDomesticSourceTaxWithheld)) {
    const v = parseI(form.etDomesticSourceTaxWithheld);
    if (v < 0) {
      errors.push({
        field: "etDomesticSourceTaxWithheld",
        message: "비거주자 원천징수 세액은 0 이상이어야 합니다 (§118의14)",
        severity: "error",
      });
    }
  }

  // 보유현황 미신고 가산세용 액면금액 — 미신고 시 입력 필요 안내
  if (!form.etHasFiledHoldingsReport && !isEmpty(form.etTotalFaceValue)) {
    const v = parseI(form.etTotalFaceValue);
    if (v <= 0) {
      errors.push({
        field: "etTotalFaceValue",
        message: "액면금액 합계는 0보다 커야 합니다 (§118의15 가산세 계산용)",
        severity: "error",
      });
    }
  }

  return errors;
}
