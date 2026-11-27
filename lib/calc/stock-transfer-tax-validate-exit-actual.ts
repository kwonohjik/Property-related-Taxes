/**
 * 국외전출세 — 종목별 실제 양도 입력 Validation (14지점 ⑧ · PR-7b) — `validateStep3ExitTax`가 부른다
 *
 * 3중 패턴: ④(`buildExitTaxHoldingActualBody`)·UI와 같은 default·같은 게이트를 쓴다.
 *   - `foreignTaxInput || "none"` · `foreignTaxCurrencyCode || "USD"`
 *   - 원천징수액 입력칸은 `holdingAllowsDomesticWithholding`(엔진 `isDomesticIssuer`와 같은 기준)일 때만 — UI·④·여기가 한 함수다
 *   - 입력 방식(모드)은 `previewExitTaxActualMode`(엔진 분류 helper)가 정한다 — 화면·④·여기가 한 판정을 본다
 *
 * 역할 분담: 이 파일은 «칸 단위 필수 입력»과 «방식 충돌»(전역 ↔ 종목별 값이 함께 남음)만 본다. 주식 수 범위·실제 양도일 순서·제외 종목 입력·
 * 환율 자릿수는 엔진 판정(`findExitTaxFormProblem` — ⑫ Zod와 단일 소스)이 같은 사유로 막는다(호출자가 칸 오류가 없을 때 돌린다).
 *
 * 방식 충돌은 조용히 지우지 않는다 — 엔진이 두 방식의 동시 입력을 거부하므로 ⑧도 같은 판정으로 막고 어느 쪽을 비울지 안내한다.
 * (④는 모드가 다른 값을 body에 싣지 않으므로 이 충돌은 엔진까지 가지 않는다 — 그래서 ⑧이 형식 검사로 따로 막는다.)
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";
import type { ExitTaxActualModeInfo } from "./stock-transfer-exit-tax-actual-mode";
import {
  hasGlobalActualInput,
  holdingAllowsDomesticWithholding,
} from "./stock-transfer-exit-tax-actual-mode";

function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

function parseF(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export function validateExitTaxActualTransfer(
  form: StockTransferFormData,
  info: ExitTaxActualModeInfo,
): StockValidationError[] {
  const errors: StockValidationError[] = [];
  const holdings = form.etHoldings ?? [];

  // ── 전역 방식인데 종목별 입력이 남음 ──
  if (info.mode === "global") {
    holdings.forEach((h, i) => {
      if (!h.actualTransfer) return;
      errors.push({
        field: `etHoldings[${i}].actualTransfer`,
        message: info.selectable
          ? `종목 ${i + 1}(${h.stockName || "이름 없음"}): 종목별 실제 양도 입력이 남아 있는데 지금은 종목 공통(전역) 입력 방식입니다 — 두 방식은 함께 쓸 수 없습니다. 입력 방식을 종목별로 바꾸거나 종목별 입력을 지우세요`
          : `종목 ${i + 1}(${h.stockName || "이름 없음"}): 종목별 실제 양도 입력이 남아 있지만 이 출국일·종목 구성에서는 종목 공통(전역) 입력만 씁니다 — 종목별 입력을 지우세요`,
        severity: "error",
      });
    });
    return errors;
  }

  // ── 종목별 방식인데 전역 입력이 남음 ──
  if (hasGlobalActualInput(form)) {
    errors.push({
      field: "etActualTransferMode",
      message:
        "종목 공통(전역) 경정청구 입력(실양도일·실양도 단가·외국납부세액·원천징수액)이 남아 있는데 지금은 종목별 입력 방식입니다 — 두 방식은 함께 쓸 수 없습니다. 전역 입력을 지우세요",
      severity: "error",
    });
  }

  // ── 종목별 칸 단위 필수 입력 ──
  holdings.forEach((h, i) => {
    const a = h.actualTransfer;
    // 제외 종목의 입력은 엔진 판정이 사유와 함께 막는다(칸 오류를 겹쳐 보이지 않는다)
    if (!a || !info.taxedIds.has(h.id)) return;
    const prefix = `종목 ${i + 1}(${h.stockName || "이름 없음"})`;
    const at = (key: string) => `etHoldings[${i}].actualTransfer.${key}`;

    if (isEmpty(a.shareCount) || parseF(a.shareCount) <= 0) {
      errors.push({ field: at("shareCount"), message: `${prefix}: 실제 양도 주식 수를 입력하세요 (1 이상)`, severity: "error" });
    }

    if (h.marketType === "foreign_stock") {
      if (isEmpty(a.priceForeign) || parseF(a.priceForeign) <= 0) {
        errors.push({ field: at("priceForeign"), message: `${prefix}: 1주당 실제 양도가(외화)를 입력하세요`, severity: "error" });
      }
      if (isEmpty(a.exchangeRate) || parseF(a.exchangeRate) <= 0) {
        errors.push({
          field: at("exchangeRate"),
          message: `${prefix}: 실제 양도일 기준환율(원/외화)을 입력하세요 — 대체 환율을 쓰지 않습니다`,
          severity: "error",
        });
      }
    } else if (isEmpty(a.pricePerShare) || parseF(a.pricePerShare) <= 0) {
      errors.push({ field: at("pricePerShare"), message: `${prefix}: 1주당 실제 양도가(원)를 입력하세요`, severity: "error" });
    }

    const taxInput = a.foreignTaxInput || "none"; // 3중 패턴 default
    if (taxInput === "krw" && (isEmpty(a.foreignTaxPaid) || parseF(a.foreignTaxPaid) <= 0)) {
      errors.push({ field: at("foreignTaxPaid"), message: `${prefix}: 외국납부세액(원화)을 입력하세요 (§118의13①)`, severity: "error" });
    }
    if (taxInput === "foreign") {
      if (isEmpty(a.foreignTaxPaidForeign) || parseF(a.foreignTaxPaidForeign) <= 0) {
        errors.push({ field: at("foreignTaxPaidForeign"), message: `${prefix}: 외국납부세액(외화)을 입력하세요 (§118의13①)`, severity: "error" });
      }
      if (isEmpty(a.foreignTaxExchangeRate) || parseF(a.foreignTaxExchangeRate) <= 0) {
        errors.push({
          field: at("foreignTaxExchangeRate"),
          message: `${prefix}: 외국납부세액 납세일 기준환율(원/외화)을 입력하세요 (소득세법 시행령 §178의5)`,
          severity: "error",
        });
      }
    }

    if (!isEmpty(a.domesticSourceTaxWithheld)) {
      if (!holdingAllowsDomesticWithholding(h)) {
        errors.push({
          field: at("domesticSourceTaxWithheld"),
          message: `${prefix}: 외국법인이 발행한 국외주식에는 비거주자 원천징수액(§118의14①)을 입력할 수 없습니다 — 입력값을 지우세요. 외국정부에 낸 세액은 외국납부세액(§118의13①)으로 입력합니다`,
          severity: "error",
        });
      } else if (parseF(a.domesticSourceTaxWithheld) < 0) {
        errors.push({
          field: at("domesticSourceTaxWithheld"),
          message: `${prefix}: 비거주자 원천징수액은 0 이상이어야 합니다 (§118의14)`,
          severity: "error",
        });
      }
    }
  });

  return errors;
}
