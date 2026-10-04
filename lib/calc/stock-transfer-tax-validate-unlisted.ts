/**
 * 주식 양도소득세 — Step 2 비상장 보충적 평가(소령 §165④) 검증군 (800줄 정책 분리)
 *
 * `stock-transfer-tax-validate-step2.ts`에서 추출 — 동작 변경 없음.
 * 비상장 본칙(환산) · 거래정지 우회(§165③) · 취득측 전용 경로(취득일 거래정지·매매사례)가 공유한다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";
import { calcSupplementaryPerShare } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { isTransferSupplementaryNonPositive } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";
import { shouldSkipNetIncome } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
import { adaptUnlistedFlatToApiBody } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
// §165④1호 괄호(2:3) 대상 법인 — 엔진과 같은 leaf(사용자 신고 · 다목 50% · 라목)
import { isReversalCorpForm } from "./stock-transfer-section94-4-form";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
// 필수 키 집합은 ⑫(`stock-transfer-tax-refines.ts`)와 공용 술어 — 한쪽만 고치면 3중 패턴이 깨진다.
import { requiredUnlistedValuationKeys } from "./stock-transfer-required-inputs";
import type { UnlistedValuationKey } from "./stock-transfer-required-inputs";

export function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

/**
 * 연혁 게이팅 기준일. 미입력·형식오류면 undefined → 호출부가 판정을 **건너뛴다**
 * (임의 기준일 fallback 금지 — 잘못된 시기의 법을 적용하게 된다).
 */
export function parseTransferDate(s: string | undefined): Date | undefined {
  if (isEmpty(s)) return undefined;
  const d = new Date(s!);
  return isNaN(d.getTime()) ? undefined : d;
}

export function parseF(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export function parseI(s: string): number {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * 비상장 보충적 평가 simple 모드 필수 필드 검증 (소령 §165④).
 * 비상장 본칙 분기 + 상장 거래정지 우회 분기(§165③) 공유 — 단일 소스.
 * - netAssetOnlyReason 있으면 NI 면제 / acqFaceValueOnly 있으면 취득연도 면제
 */
export const SIMPLE_FIELD_MESSAGE: Record<Exclude<UnlistedValuationKey, "acqFaceValuePerShare">, string> = {
  transferYearNetIncomePerShare: "양도연도 1주당 순손익가치를 입력하세요 (소령 §165④)",
  transferYearNetAssetPerShare: "양도연도 1주당 순자산가치를 입력하세요",
  acquisitionYearNetIncomePerShare: "취득연도 1주당 순손익가치를 입력하세요",
  acquisitionYearNetAssetPerShare: "취득연도 1주당 순자산가치를 입력하세요",
};

function validateUnlistedSimpleFields(
  form: StockTransferFormData,
  errors: StockValidationError[],
): void {
  for (const key of requiredUnlistedValuationKeys({
    scope: "both",
    niSkip: shouldSkipNetIncome(form),
    acqFaceValueOnly: form.acqFaceValueOnly === true,
  })) {
    // 액면가는 모드 공통 검사(`validateUnlistedValuationFields`)가 본다 — 여기는 1주당 평가값만.
    if (key === "acqFaceValuePerShare") continue;
    if (isEmpty(form[key])) errors.push({ field: key, message: SIMPLE_FIELD_MESSAGE[key], severity: "error" });
  }
}

/**
 * [C-2] 비상장 보충 평가 전체 모드 검증 (simple/full/사례49 + B-4 §165⑨).
 * 비상장 본칙 경로와 거래정지(양도) 우회 경로(§165③→§165④) 공유 — dual-truth 방지.
 */
export function validateUnlistedValuationFields(
  form: StockTransferFormData,
  errors: StockValidationError[],
): void {
  const niSkip = shouldSkipNetIncome(form);
  const valuationMode = form.unlistedValuationMode || "simple";
  const acqFaceValueOnly = form.acqFaceValueOnly === true;
  if (requiredUnlistedValuationKeys({ scope: "both", niSkip, acqFaceValueOnly }).includes("acqFaceValuePerShare")) {
    if (isEmpty(form.acqFaceValuePerShare) || parseI(form.acqFaceValuePerShare) <= 0) {
      errors.push({ field: "acqFaceValuePerShare", message: "취득시점 액면가를 입력하세요 (§99①4 후단)", severity: "error" });
    }
  }
  if (valuationMode === "simple") {
    validateUnlistedSimpleFields(form, errors);
  } else {
    if (!niSkip) {
      if (isEmpty(form.niShareCountEUTransfer) || parseI(form.niShareCountEUTransfer) <= 0) {
        errors.push({ field: "niShareCountEUTransfer", message: "양도연도 NI 사업연도말 발행주식수 필수 (full 모드)", severity: "error" });
      }
      if (!acqFaceValueOnly && (isEmpty(form.niShareCountEUAcq) || parseI(form.niShareCountEUAcq) <= 0)) {
        errors.push({ field: "niShareCountEUAcq", message: "취득연도 NI 사업연도말 발행주식수 필수 (full 모드)", severity: "error" });
      }
    }
    if (isEmpty(form.naShareCountEUTransfer) || parseI(form.naShareCountEUTransfer) <= 0) {
      errors.push({ field: "naShareCountEUTransfer", message: "양도연도 NA 사업연도말 발행주식수 필수 (full 모드)", severity: "error" });
    }
    if (!acqFaceValueOnly && (isEmpty(form.naShareCountEUAcq) || parseI(form.naShareCountEUAcq) <= 0)) {
      errors.push({ field: "naShareCountEUAcq", message: "취득연도 NA 사업연도말 발행주식수 필수 (full 모드)", severity: "error" });
    }
  }

  validateTransferSupplementaryPositive(form, errors, niSkip, valuationMode);

  // [B-4 §165⑨ 본체] 양도·취득 기준시가 동일 동일사업연도 토글 ON 시 (M-4 차단 / M-7 경고)
  if (form.unlistedSameBizYearToggle) {
    /**
     * 순자산 단독 평가(§165④3)면 순손익가치를 **아예 쓰지 않는다** — UI도 그 칸을 숨긴다.
     * 종전에는 전전연도 NI를 error로 필수화해 「화면엔 칸이 없는데 검증은 요구하는」 상태였다.
     * 엔진도 순자산 단독 경로에서는 전전연도를 순자산 단독으로 평가한다(양변 기준 일치).
     */
    if (!niSkip && isEmpty(form.prePriorYearNetIncomePerShare)) {
      errors.push({ field: "prePriorYearNetIncomePerShare", message: "전전사업연도 1주당 순손익가치를 입력하세요 (소칙 §81④ 1호 월할 가산)", severity: "error" });
    }
    if (isEmpty(form.prePriorYearNetAssetPerShare)) {
      errors.push({ field: "prePriorYearNetAssetPerShare", message: "전전사업연도 1주당 순자산가치를 입력하세요 (소칙 §81④ 1호 월할 가산)", severity: "error" });
    }
    const td = parseTransferDate(form.transferDate);
    if (valuationMode === "simple" && td) {
      const heavyRE = isReversalCorpForm(form);
      // 엔진 단일 진실 — 순자산 단독이면 엔진도 순자산 단독으로 양측을 비교한다.
      // 여기만 가중평균으로 재면 엔진은 「같다」, validate는 「다르다」가 되어 거짓 경고가 뜬다.
      const transferEval = calcSupplementaryPerShare(parseF(form.transferYearNetIncomePerShare), parseF(form.transferYearNetAssetPerShare), heavyRE, td, niSkip);
      const acqEval = calcSupplementaryPerShare(parseF(form.acquisitionYearNetIncomePerShare), parseF(form.acquisitionYearNetAssetPerShare), heavyRE, td, niSkip);
      if (transferEval > 0 && transferEval !== acqEval) {
        errors.push({ field: "unlistedSameBizYearToggle", message: "양도연도·취득연도 평가액이 달라 소칙 §81④ 월할 가산이 적용되지 않습니다. 토글을 해제하세요.", severity: "warning" });
      }
    }
  }
}

/**
 * Q-4b — 양도기준시가(1주당 보충평가액)가 0 이하면 환산 산식의 분모가 0이다. ⑫와 같은 술어·문구.
 * 입력이 비어 있으면 필수 오류가 따로 뜨므로 여기서는 보지 않는다. 결산서(full) 모드는 ④ 어댑터와 같은 집계로 잰다.
 */
function validateTransferSupplementaryPositive(
  form: StockTransferFormData,
  errors: StockValidationError[],
  niSkip: boolean,
  valuationMode: string,
): void {
  const td = parseTransferDate(form.transferDate);
  if (!td) return;
  if (valuationMode === "simple") {
    if (isEmpty(form.transferYearNetAssetPerShare)) return;
    if (!niSkip && isEmpty(form.transferYearNetIncomePerShare)) return;
    if (
      isTransferSupplementaryNonPositive(
        parseF(form.transferYearNetIncomePerShare),
        parseF(form.transferYearNetAssetPerShare),
        isReversalCorpForm(form),
        td,
        niSkip,
      )
    ) {
      errors.push({ field: "transferYearNetAssetPerShare", message: UNLISTED_MESSAGES.TRANSFER_STD_NON_POSITIVE, severity: "error" });
    }
    return;
  }
  if (parseI(form.naShareCountEUTransfer) <= 0) return;
  if (!niSkip && parseI(form.niShareCountEUTransfer) <= 0) return;
  const reduced = adaptUnlistedFlatToApiBody(form, { niSkip });
  if (isTransferSupplementaryNonPositive(reduced.transferNi, reduced.transferNa, isReversalCorpForm(form), td, niSkip)) {
    errors.push({ field: "naAssetTotalRow1EUTransfer", message: UNLISTED_MESSAGES.TRANSFER_STD_NON_POSITIVE, severity: "error" });
  }
}

/**
 * [C-1] 취득일 거래정지 — 취득측 보충 평가 필수 필드 검증 (소령 §165③·§165④).
 * validateUnlistedSimpleFields의 취득측 서브셋.
 * - netAssetOnlyReason 있으면 NI 면제
 * - acqFaceValueOnly 잔존값 **무관하게 필수** — UI(acquisitionSideOnly)도 무조건 렌더·엔진도 미참조 (3중 정합)
 */
export function validateAcquisitionSideUnlistedFields(
  form: StockTransferFormData,
  errors: StockValidationError[],
  basis: string = "취득일 거래정지 — 소령 §165③·§165④",
): void {
  for (const key of requiredUnlistedValuationKeys({
    scope: "acquisition",
    niSkip: shouldSkipNetIncome(form),
    acqFaceValueOnly: false, // 취득측 전용 경로는 액면가 토글을 읽지 않는다(위 주석)
  })) {
    if (key === "acquisitionYearNetIncomePerShare" && isEmpty(form.acquisitionYearNetIncomePerShare)) {
      errors.push({ field: key, message: `취득연도 1주당 순손익가치를 입력하세요 (${basis})`, severity: "error" });
    }
    if (key === "acquisitionYearNetAssetPerShare" && isEmpty(form.acquisitionYearNetAssetPerShare)) {
      errors.push({ field: key, message: `취득연도 1주당 순자산가치를 입력하세요 (${basis})`, severity: "error" });
    }
  }
}
