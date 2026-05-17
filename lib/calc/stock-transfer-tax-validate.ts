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
 *   - bookLost ?? false
 *   - isElectronicFiling ?? false
 *   - isFraudulent ?? false
 *   - isInternationalTransaction ?? false
 *   - realEstateGroupBasicDeductionUsed ?? 0
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback).
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

export interface StockValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

function parseF(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseI(s: string): number {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

// ============================================================
// Step별 validation (마법사 단계 진입 전 검증)
// ============================================================

/**
 * Step 1 검증 — 시장·대주주·취득원인·일자·수량
 */
export function validateStep1(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 시장 분류 필수
  if (!form.marketType) {
    errors.push({ field: "marketType", message: "시장 유형을 선택하세요", severity: "error" });
  }

  // 외국법인 차단
  if ((form.marketType as string) === "out_of_scope_foreign") {
    errors.push({
      field: "marketType",
      message: "해외주식(§94①3 다목)은 별도 도메인입니다. 이 계산기는 국내주식만 지원합니다.",
      severity: "error",
    });
  }

  // 기타자산: 과점주주 or 부동산과다보유 최소 1개 필수
  if (form.marketType === "other_asset") {
    if (!form.isQualifyingBlockShareholder && !form.isHeavyRealEstateForRate) {
      errors.push({
        field: "otherAsset",
        message: "기타자산은 §94①4 다목(과점주주) 또는 라목(부동산과다보유법인) 중 하나 이상 해당해야 합니다",
        severity: "error",
      });
    }
  }

  // 대주주 판정 — 지분·시총 최소 1개 입력 필요
  if (form.isMajorShareholder) {
    const hasAny =
      parseF(form.selfShareRatio) > 0 ||
      parseI(form.selfMarketCap) > 0 ||
      parseF(form.combinedShareRatio) > 0 ||
      parseI(form.combinedMarketCap) > 0;
    if (!hasAny) {
      errors.push({
        field: "majorShareholder",
        message: "대주주인 경우 지분율 또는 시가총액을 1개 이상 입력하세요 (시행령 §157)",
        severity: "error",
      });
    }
  }

  // 취득일 필수
  if (isEmpty(form.acquisitionDate)) {
    errors.push({ field: "acquisitionDate", message: "취득일을 입력하세요", severity: "error" });
  }

  // 양도일 필수
  if (isEmpty(form.transferDate)) {
    errors.push({ field: "transferDate", message: "양도일을 입력하세요", severity: "error" });
  }

  // 양도일 < 취득일 — 음수 보유기간
  if (!isEmpty(form.acquisitionDate) && !isEmpty(form.transferDate)) {
    const acqDate = new Date(form.acquisitionDate);
    const trnDate = new Date(form.transferDate);
    if (trnDate < acqDate) {
      errors.push({
        field: "transferDate",
        message: "양도일이 취득일보다 이전입니다. 일자를 확인하세요",
        severity: "error",
      });
    }
  }

  // 주식수 필수
  if (isEmpty(form.shareCount) || parseI(form.shareCount) <= 0) {
    errors.push({ field: "shareCount", message: "양도 주식수를 입력하세요", severity: "error" });
  }

  // 발행주식총수 필수
  if (isEmpty(form.totalIssuedShares) || parseI(form.totalIssuedShares) <= 0) {
    errors.push({ field: "totalIssuedShares", message: "발행주식 총수를 입력하세요", severity: "error" });
  }

  // 취득원인 보조 일자 검증 (3중 패턴: acquisitionCause || "purchase")
  const acquisitionCause = form.acquisitionCause || "purchase";
  if (acquisitionCause === "inheritance" && isEmpty(form.decedentAcquisitionDate)) {
    errors.push({
      field: "decedentAcquisitionDate",
      message: "상속의 경우 피상속인 취득일을 입력하세요 (§104②1 — 단기 30% 기산점)",
      severity: "error",
    });
  }
  if (acquisitionCause === "merger_split" && isEmpty(form.preMergerAcquisitionDate)) {
    errors.push({
      field: "preMergerAcquisitionDate",
      message: "합병·분할의 경우 종전 주식 취득일을 입력하세요 (§104②3)",
      severity: "error",
    });
  }

  // 3년 누적 양도 비율 > 1 금지
  const cumRatio = parseF(form.cumulativeTransferRatio);
  if (form.cumulativeTransferRatio && cumRatio > 1) {
    errors.push({
      field: "cumulativeTransferRatio",
      message: "3년 누적 양도 비율은 100%를 초과할 수 없습니다",
      severity: "error",
    });
  }

  return errors;
}

/**
 * Step 2 검증 — 양도가액·취득가액·환산 입력
 */
export function validateStep2(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 3중 패턴 fallback
  const transferPriceMode = form.transferPriceMode || "actual";
  const acquisitionMode = form.acquisitionMode || "actual";

  // ── 양도가액 ──
  if (transferPriceMode === "actual") {
    if (isEmpty(form.perShareTransferPrice) || parseI(form.perShareTransferPrice) <= 0) {
      errors.push({ field: "perShareTransferPrice", message: "1주당 양도가액을 입력하세요", severity: "error" });
    }
  } else if (transferPriceMode === "exchange") {
    const prop = parseI(form.exchangePropertyValue);
    const debt = parseI(form.exchangeDebtRelief);
    const cash = parseI(form.exchangeCash);
    if (prop <= 0 && debt <= 0 && cash <= 0) {
      errors.push({
        field: "exchange",
        message: "교환 양도가액: 부동산 가액·채무면제액·현금 중 1개 이상 양수로 입력하세요",
        severity: "error",
      });
    }
  }

  // ── 취득가액 ──
  if (acquisitionMode === "actual") {
    if (isEmpty(form.perShareAcquisitionPrice) || parseI(form.perShareAcquisitionPrice) < 0) {
      errors.push({ field: "perShareAcquisitionPrice", message: "1주당 취득가액을 입력하세요", severity: "error" });
    }
  } else if (acquisitionMode === "estimated") {
    // 상장 환산 — 양도일 직전 1개월 평균 필수
    const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    if (isListed) {
      if (isEmpty(form.transferDatePriceAvg1Month)) {
        errors.push({
          field: "transferDatePriceAvg1Month",
          message: "양도일 직전 1개월 종가 평균을 입력하세요 (§99①3)",
          severity: "error",
        });
      }
      // 취득 후 상장 ON 시 상장일 정보 + 취득연도 데이터 필수
      if (form.acquiredBeforeListing) {
        if (isEmpty(form.listingDate)) {
          errors.push({ field: "listingDate", message: "상장일을 입력하세요 (소령 §165⑤)", severity: "error" });
        }
        if (isEmpty(form.listingDatePriceAvg1Month)) {
          errors.push({
            field: "listingDatePriceAvg1Month",
            message: "상장일 직전 1개월 종가 평균을 입력하세요",
            severity: "error",
          });
        }
        // 취득연도 순손익가치·순자산가치 필수 (비상장 보충 평가)
        if (isEmpty(form.acquisitionYearNetIncomePerShare)) {
          errors.push({
            field: "acquisitionYearNetIncomePerShare",
            message: "취득연도 1주당 순손익가치를 입력하세요",
            severity: "error",
          });
        }
        if (isEmpty(form.acquisitionYearNetAssetPerShare)) {
          errors.push({
            field: "acquisitionYearNetAssetPerShare",
            message: "취득연도 1주당 순자산가치를 입력하세요",
            severity: "error",
          });
        }
        // 상장연도 데이터도 필수
        if (isEmpty(form.listingYearNetIncomePerShare)) {
          errors.push({
            field: "listingYearNetIncomePerShare",
            message: "상장연도 1주당 순손익가치를 입력하세요",
            severity: "error",
          });
        }
        if (isEmpty(form.listingYearNetAssetPerShare)) {
          errors.push({
            field: "listingYearNetAssetPerShare",
            message: "상장연도 1주당 순자산가치를 입력하세요",
            severity: "error",
          });
        }
      }
    } else {
      // 비상장 보충적 평가
      if (isEmpty(form.transferYearNetIncomePerShare)) {
        errors.push({
          field: "transferYearNetIncomePerShare",
          message: "양도연도 1주당 순손익가치를 입력하세요 (소령 §165⑤)",
          severity: "error",
        });
      }
      if (isEmpty(form.transferYearNetAssetPerShare)) {
        errors.push({
          field: "transferYearNetAssetPerShare",
          message: "양도연도 1주당 순자산가치를 입력하세요",
          severity: "error",
        });
      }
    }
  } else if (acquisitionMode === "face_value") {
    // 장부분실 ↔ 액면가 동시 강제 (3중 패턴: bookLost ?? false)
    if (!form.bookLost) {
      errors.push({
        field: "bookLost",
        message: "액면가 모드는 장부분실(§99①4) 확인이 필수입니다",
        severity: "error",
      });
    }
    if (isEmpty(form.faceValuePerShare) || parseI(form.faceValuePerShare) <= 0) {
      errors.push({ field: "faceValuePerShare", message: "1주당 액면가를 입력하세요", severity: "error" });
    }
  } else if (acquisitionMode === "sale_case") {
    // 매매사례가액 — 상장 시장에서는 불가 (8차 추가)
    const isListed = ["kospi", "kosdaq", "konex"].includes(form.marketType);
    if (isListed) {
      errors.push({
        field: "acquisitionMode",
        message: "매매사례가액은 비상장주식에만 적용 가능합니다 (상장주식 선택 불가)",
        severity: "error",
      });
    }
    if (isEmpty(form.perShareAcquisitionPrice)) {
      errors.push({ field: "perShareAcquisitionPrice", message: "1주당 매매사례가액을 입력하세요", severity: "error" });
    }
  }

  // 장부분실 단독 선언 금지 (액면가 모드와 세트)
  if (form.bookLost && acquisitionMode !== "face_value") {
    errors.push({
      field: "bookLost",
      message: "장부분실은 취득가액 모드 '액면가'와 함께 사용해야 합니다 (§99①4)",
      severity: "warning",
    });
  }

  return errors;
}

/**
 * Step 3 검증 — 필요경비·신고
 */
export function validateStep3(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 3중 패턴 fallback
  const acquisitionMode = form.acquisitionMode || "actual";
  const expenseMode = form.expenseMode || "actual";

  // 개산공제 모드 경고 — 환산/액면가 아닌 경우
  if (expenseMode === "estimated" && !["estimated", "face_value"].includes(acquisitionMode)) {
    errors.push({
      field: "expenseMode",
      message: "개산공제(§163⑥)는 환산취득가액 또는 액면가 모드에서 주로 사용됩니다",
      severity: "warning",
    });
  }

  // 신고일 필수
  if (isEmpty(form.filingDate)) {
    errors.push({ field: "filingDate", message: "신고일을 입력하세요", severity: "error" });
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
 * 특정 step의 에러 개수 (StepIndicator 배지용)
 */
export function getStepErrorCount(form: StockTransferFormData, step: number): number {
  switch (step) {
    case 0: return validateStep1(form).filter((e) => e.severity === "error").length;
    case 1: return validateStep2(form).filter((e) => e.severity === "error").length;
    case 2: return validateStep3(form).filter((e) => e.severity === "error").length;
    default: return 0;
  }
}
