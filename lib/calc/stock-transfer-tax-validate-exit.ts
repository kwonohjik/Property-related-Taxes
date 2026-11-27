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
 *   - holding.departureDayValuationMode || "market_price" (국외주식 행은 "foreign_market_price")
 *   - holding.isListedForeignCorp ?? true · countryCode || "US" · foreignCurrencyCode || "USD" (④와 동일 — 계산 무영향·표시용은 검증하지 않는다)
 *   - etForeignWorkerStatus || "none"
 *
 * 2027.1.1. 이후 출국분: 입력 결함 판정은 **엔진**이 한다(`findExitTaxFormProblem` — ⑫ Zod와 같은 단일 소스).
 *   이 파일은 «칸 단위 필수 입력»(빈 값·형식)만 직접 검사하고, 통과한 뒤 엔진 판정을 한 번 더 돌려 같은 사유로 막는다.
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   시가 모드별 필수 입력 빈값 → 명확한 오류로 차단. 자동 채우기 금지.
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
 */

import type { ExitTaxHoldingForm, StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";
import { isExitTaxFrom2027 } from "@/lib/tax-engine/data/exit-tax-2027-era";
import { isForeignValuationMode } from "@/lib/tax-engine/stock-transfer/exit-tax-fx";
import { EXIT_TAX_MAJOR_SHAREHOLDER_FOREIGN_NOTE } from "./exit-tax-2027-copy";
import {
  exitTaxProblemField,
  exitTaxProblemStep,
  findExitTaxFormProblem,
} from "./stock-transfer-exit-tax-input-problem";
import { previewExitTaxBuckets } from "./stock-transfer-tax-api-foreign-exit";

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
        "직전 연도말 기준 대주주에 해당하지 않으면 국외전출세 납세의무가 없습니다 (§118의9①2호 → §178의8 준용 §167의8). 대주주인 경우 체크하세요." +
        // 2027.1.1. 이후 출국분 — UI 토글 설명과 같은 문구 상수(`exit-tax-2027-copy`)
        (isExitTaxFrom2027(form.etDepartureDate) ? ` ${EXIT_TAX_MAJOR_SHAREHOLDER_FOREIGN_NOTE}.` : ""),
      severity: "warning",
    });
  }

  /**
   * 🔑 **「보유 종목 최소 1건」은 Step2 로 갔다**(2026-09-17 단계 재배치).
   *   매트릭스가 2단계 화면에 있으므로 1단계에서 막으면 **「+ 종목 추가」가 없는 화면에서**
   *   사용자가 풀 수 없다 ([[feedback_required_field_needs_an_input_path]]).
   *   계획서: `docs/00-pm/exit-tax-wizard-step-realign.plan.md` §2 · Q-1 · anchor EX-5.
   */

  return errors;
}

// ============================================================
// 2027.1.1. 이후 출국분 — 국외주식 종목 · 외국인근로자 · 엔진 판정 (⑧)
// ============================================================

/**
 * 국외주식 외화 경로 종목 1건의 칸 단위 검증. 환율·외화 단가 빈값은 **대체하지 않고 차단**한다(자동 환산·보간 없음).
 * 환율 소수 자릿수·원화/외화 혼용 같은 «판정»은 엔진(`findExitTaxFormProblem`)이 한다 — 여기서 다시 구현하지 않는다.
 * 시가 > 0 / 취득단가 ≥ 0 은 국내 원화 경로(위)와 같은 규칙이다(UI 쪽 입력 완결성 — 엔진은 0도 받는다).
 */
function validateForeignHoldingRow(
  h: ExitTaxHoldingForm,
  i: number,
  prefix: string,
  departureDate: string,
): StockValidationError[] {
  const errors: StockValidationError[] = [];
  const at = (key: keyof ExitTaxHoldingForm) => `etHoldings[${i}].${key}`;
  if (isEmpty(h.departureDayPriceForeign) || parseF(h.departureDayPriceForeign) <= 0) {
    errors.push({
      field: at("departureDayPriceForeign"),
      message: `${prefix}: 출국일 시가(외화 1주당)를 입력하세요 — 자동 환산·안분 불가, 직접 입력 필수`,
      severity: "error",
    });
  }
  if (isEmpty(h.departureExchangeRate) || parseF(h.departureExchangeRate) <= 0) {
    errors.push({
      field: at("departureExchangeRate"),
      message: `${prefix}: 출국일 기준환율(원/외화)을 입력하세요 — 대체 환율을 쓰지 않습니다`,
      severity: "error",
    });
  }
  if (isEmpty(h.perShareAcquisitionPriceForeign) || parseF(h.perShareAcquisitionPriceForeign) < 0) {
    errors.push({
      field: at("perShareAcquisitionPriceForeign"),
      message: `${prefix}: 취득가액(외화 1주당)을 입력하세요`,
      severity: "error",
    });
  }
  if (isEmpty(h.acquisitionExchangeRate) || parseF(h.acquisitionExchangeRate) <= 0) {
    errors.push({
      field: at("acquisitionExchangeRate"),
      message: `${prefix}: 취득일 기준환율(원/외화)을 입력하세요 — 대체 환율을 쓰지 않습니다`,
      severity: "error",
    });
  }
  // 취득일이 출국일보다 늦을 수 없다(두 날짜가 모두 있을 때만 — 빈 날짜는 각 칸 검증이 잡는다). ISO 문자열 비교는 `YYYY-MM-DD` 고정 형식이라 안전하다
  if (!isEmpty(h.acquisitionDate) && !isEmpty(departureDate) && h.acquisitionDate > departureDate) {
    errors.push({
      field: at("acquisitionDate"),
      message: `${prefix}: 취득일이 출국일보다 늦습니다`,
      severity: "error",
    });
  }
  return errors;
}

/**
 * 외국인근로자(영 §178의8②2·3호) 칸 검증 — ④가 싣는 조건(출국일 2027.1.1. 이후 + 국외주식 종목 있음)과 **같은 조건**에서만 본다.
 * 가족이면 가족 구분·근로 개시일 필수(선택을 대신하지 않는다), 근로 개시일은 출국일보다 늦을 수 없다.
 */
function validateForeignWorker(form: StockTransferFormData): StockValidationError[] {
  const hasForeignRow = (form.etHoldings ?? []).some((h) => h.marketType === "foreign_stock");
  if (!isExitTaxFrom2027(form.etDepartureDate) || !hasForeignRow) return [];
  const status = form.etForeignWorkerStatus || "none"; // 3중 패턴 default
  if (status !== "foreign_worker_family") return [];
  const errors: StockValidationError[] = [];
  if (!form.etForeignWorkerFamilyKind) {
    errors.push({
      field: "etForeignWorkerFamilyKind",
      message: "외국인근로자의 배우자인지, 20세 이하 직계비속인지 선택하세요 (시행령 §178의8②3호)",
      severity: "error",
    });
  }
  if (isEmpty(form.etForeignWorkerStartDate)) {
    errors.push({
      field: "etForeignWorkerStartDate",
      message: "외국인근로자가 국내에서 근로를 제공하기 시작한 날을 입력하세요 — 이 날 전에 취득한 종목만 제외됩니다 (시행령 §178의8②3호)",
      severity: "error",
    });
  } else if (!isEmpty(form.etDepartureDate) && form.etForeignWorkerStartDate > form.etDepartureDate) {
    errors.push({
      field: "etForeignWorkerStartDate",
      message: "근로 개시일이 출국일보다 늦습니다",
      severity: "error",
    });
  }
  return errors;
}

/** 엔진 입력 결함 판정(⑫와 단일 소스)을 이 «단계»의 검증 오류로 바꾼다 — 단계 분배는 `exitTaxProblemStep` */
function engineProblemErrors(form: StockTransferFormData, step: 2 | 3): StockValidationError[] {
  const problem = findExitTaxFormProblem(form);
  if (!problem || exitTaxProblemStep(problem) !== step) return [];
  const taxed = previewExitTaxBuckets(form) ?? [];
  const allocFallback =
    taxed[0] === "clause2a"
      ? "etBasicDeductionAllocClause2a"
      : taxed[0] === "clause2b"
        ? "etBasicDeductionAllocClause2b"
        : "etBasicDeductionAllocClause1";
  return [{ field: exitTaxProblemField(problem, form, allocFallback), message: problem.message, severity: "error" }];
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

  // 🔑 게이트가 **매트릭스와 같은 단계**에 있다 — 이 화면에 「+ 종목 추가」가 있다(Q-1).
  if (!form.etHoldings || form.etHoldings.length === 0) {
    errors.push({
      field: "etHoldings",
      message: "보유 종목을 최소 1건 입력하세요",
      severity: "error",
    });
    return errors;
  }

  form.etHoldings.forEach((h, i) => {
    const prefix = `종목 ${i + 1}`;
    const isForeignRow = h.marketType === "foreign_stock";
    // 출국일 시가 — 모드별 필수 입력 (자동 안분 fallback 금지)
    const mode = h.departureDayValuationMode || (isForeignRow ? "foreign_market_price" : "market_price"); // 3중 패턴 default
    const foreignMode = isForeignValuationMode(mode);

    if (isEmpty(h.stockName)) {
      errors.push({ field: `etHoldings[${i}].stockName`, message: `${prefix}: 종목명을 입력하세요`, severity: "error" });
    }
    if (isEmpty(h.shareCount) || parseI(h.shareCount) <= 0) {
      errors.push({ field: `etHoldings[${i}].shareCount`, message: `${prefix}: 주식수는 1 이상이어야 합니다`, severity: "error" });
    }
    if (isEmpty(h.acquisitionDate)) {
      errors.push({ field: `etHoldings[${i}].acquisitionDate`, message: `${prefix}: 취득일을 입력하세요`, severity: "error" });
    }
    // 원화 취득단가 — 외화 경로 종목은 이 칸이 없다(④가 0으로 보낸다)
    if (!foreignMode && (isEmpty(h.perShareAcquisitionPrice) || parseI(h.perShareAcquisitionPrice) < 0)) {
      errors.push({ field: `etHoldings[${i}].perShareAcquisitionPrice`, message: `${prefix}: 1주당 취득가액을 입력하세요 (원)`, severity: "error" });
    }

    if (foreignMode) {
      errors.push(...validateForeignHoldingRow(h, i, prefix, form.etDepartureDate));
      return;
    }

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

  errors.push(...validateForeignWorker(form));
  // 칸 단위 결함이 없으면 엔진 판정(⑫ Zod와 같은 단일 소스)을 한 번 더 돌린다 — 종목·외국인근로자 사유만 이 단계에서 막는다
  if (!errors.some((e) => e.severity === "error")) errors.push(...engineProblemErrors(form, 2));

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
    // → 사유 선택 없어도 기본 5년으로 유예 가능(§118의16② 「5년(… 10년)」).
    //
    // ⚠️ 종전 주석은 「Zod도 동일 허용」이라고 **단언**했는데 **틀렸다** — Zod 는 `"none"`을
    //    거부해 토글을 켜면 계산이 실패했다. 확인되지 않은 단언이 주석으로 굳으면 그 갭을
    //    아무도 다시 보지 않는다. 지금은 양쪽 다 허용하고 anchor 가 고정한다
    //    (`__tests__/api/exit-tax-deferral-reason-zod.anchor.test.ts`).

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
    /**
     * §118의16④ 이자상당액 — **일수·이자율은 짝이다**.
     *
     * 엔진은 `days > 0 && rate > 0`일 때만 산출한다(`exit-tax.ts:414`). 한쪽만 넣으면 그 값이
     * body 까지 실려 가서 **조용히 무시**됐다 — 사용자는 입력했는데 서식에도 결과 카드에도
     * 흔적이 없다(실측: `[일수만] body days=365 rate=undefined → 31-E3 행 없음`).
     *
     * ⚠️ 비어 있는 쪽을 가리켜야 고칠 곳이 보인다 — 입력한 쪽을 탓하면 지우라는 뜻으로 읽힌다.
     * ⚠️ Zod(⑫)에는 넣지 않는다 — 종전 저장 이력에 한쪽만 있는 레코드가 있을 수 있고, 거기서
     *    막으면 「이력 복원 → 계산 실패」로 화면에서 고칠 기회를 잃는다.
     */
    const hasDays = !isEmpty(form.etDeferralInterestDays);
    const hasRate = !isEmpty(form.etDeferralInterestDailyRate);
    if (hasDays !== hasRate) {
      errors.push(
        hasDays
          ? {
              field: "etDeferralInterestDailyRate",
              message:
                "1일당 이자율을 입력하세요 — 일수만으로는 이자상당액이 산출되지 않습니다 (§118의16④·영 §178의12③)",
              severity: "error",
            }
          : {
              field: "etDeferralInterestDays",
              message:
                "납부유예 일수를 입력하세요 — 이자율만으로는 이자상당액이 산출되지 않습니다 (§118의16④·영 §178의12③)",
              severity: "error",
            },
      );
    }

    // 미사용 변수 경고 방지
    void reason;
  }

  // 외국납부세액 (§118의13) — 토글이 꺼져 있으면 검증하지 않는다(API 변환도 body 에서 제외).
  // 켜져 있으면 «원화 > 0» 또는 «외화 > 0 이고 환율 > 0» 중 하나 필수.
  if (form.etHasForeignTax) {
    const hasKrw = !isEmpty(form.etForeignTaxPaid);
    if (hasKrw && parseF(form.etForeignTaxPaid) <= 0) {
      errors.push({
        field: "etForeignTaxPaid",
        message: "외국납부세액은 0보다 커야 합니다 (§118의13)",
        severity: "error",
      });
    }
    const fxOk =
      !isEmpty(form.etForeignTaxPaidForeign) &&
      parseF(form.etForeignTaxPaidForeign) > 0 &&
      !isEmpty(form.etForeignTaxExchangeRate) &&
      parseF(form.etForeignTaxExchangeRate) > 0;
    if (!hasKrw && !fxOk) {
      errors.push({
        field: "etForeignTaxPaid",
        message:
          "외국납부세액을 입력하세요 — 원화 환산액, 또는 외화 금액과 납세일 기준환율을 함께 입력해야 합니다 (§118의13)",
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

  // 엔진 판정(⑫ Zod와 단일 소스) — 기본공제 배분·경정청구 범위 등 3단계 사유. 칸 단위 결함이 없을 때만 돌린다
  if (!errors.some((e) => e.severity === "error")) errors.push(...engineProblemErrors(form, 3));

  return errors;
}
