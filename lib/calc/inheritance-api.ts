/**
 * 상속세 계산 API 변환·호출 (#26 Phase G ④⑬ 동기화 지점)
 *
 * Layer 1 — 클라이언트↔API 변환 단일 진입점.
 *   - callInheritanceTaxAPI(input): fetch POST → /api/calc/inheritance
 *   - body spread: 신규 필드(presumedItems·debtItems·heirAllocations·beneficiaryType
 *     ·doneeId·corporateGiftComputedTax·legateeAmountNonHeir·priorGiftDeductionTotal
 *     ·spouseLegalShareOverride·disasterLossDeduction·familyBusinessDirectAmount
 *     ·cohabitDirectAmount·isHeir·isGenerationSkipBeneficiary·deemedCategory
 *     ·isFamilyBusinessAsset 등) 모두 명시.
 *   - formatInheritanceApiError(): API 오류 메시지 한국어 포맷.
 *
 * 종합사례 PDF 100% 재현 — 신규 필드 누락 방지 (14지점 ⑬ TypeScript 미감지 침묵 stripping 차단).
 */

import type {
  InheritanceTaxInput,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ────────────────────────────────────────────────────
// API 응답 타입
// ────────────────────────────────────────────────────

export interface InheritanceTaxApiSuccess {
  success: true;
  result: InheritanceTaxResult;
}

export interface InheritanceTaxApiIssue {
  path: string[];
  message: string;
  code: string;
}

export interface InheritanceTaxApiError {
  success?: false;
  error?: string;
  details?: Record<string, string[]>;
  issues?: InheritanceTaxApiIssue[];
  code?: string;
}

export type InheritanceTaxApiResponse =
  | InheritanceTaxApiSuccess
  | InheritanceTaxApiError;

// ────────────────────────────────────────────────────
// API 호출
// ────────────────────────────────────────────────────

/**
 * /api/calc/inheritance 호출 — 신규 필드 모두 명시 spread.
 *
 * @example
 * const res = await callInheritanceTaxAPI(buildInput(form));
 * if (!res.ok) setError(formatInheritanceApiError(res.data));
 * else setResult(res.data.result);
 */
export async function callInheritanceTaxAPI(
  input: InheritanceTaxInput,
): Promise<{
  ok: boolean;
  status: number;
  data: InheritanceTaxApiResponse;
}> {
  // 14지점 ⑬: body spread에 신규 필드 모두 포함 (누락 시 silent stripping)
  const body = {
    decedentType: input.decedentType,
    deathDate: input.deathDate,
    estateItems: input.estateItems,
    // legacy + 신규 (debtItems 우선)
    funeralExpense: input.funeralExpense ?? 0,
    funeralIncludesBongan: input.funeralIncludesBongan ?? false,
    debts: input.debts ?? 0,
    debtItems: input.debtItems,
    presumedItems: input.presumedItems,
    exemptions: input.exemptions,
    preGiftsWithin10Years: input.preGiftsWithin10Years,
    // B-6 (2026-06-01): heirs 통째 spread → isMinorOverride·isGenerationSkipBeneficiary 자동 포함
    heirs: input.heirs,
    deductionInput: input.deductionInput,
    creditInput: input.creditInput,
    valuationBaseDate: input.valuationBaseDate,
    // 레거시 전역 3필드 — deprecated. heirs[].isGenerationSkipBeneficiary 우선. 구 이력 하위호환.
    isGenerationSkip: input.isGenerationSkip,
    isMinorHeir: input.isMinorHeir,
    generationSkipAssetAmount: input.generationSkipAssetAmount,
  };

  const res = await fetch("/api/calc/inheritance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as InheritanceTaxApiResponse;
  return { ok: res.ok, status: res.status, data };
}

// ────────────────────────────────────────────────────
// 오류 메시지 포맷
// ────────────────────────────────────────────────────

export function formatInheritanceApiError(
  data: InheritanceTaxApiError,
): string {
  if (data.issues && data.issues.length > 0) {
    const messages = data.issues
      .slice(0, 5)
      .map((iss) => {
        const pathStr = iss.path.join(".") || "(루트)";
        return `${pathStr}: ${iss.message}`;
      })
      .join("\n");
    return `입력값이 올바르지 않습니다:\n${messages}${
      data.issues.length > 5 ? `\n... 외 ${data.issues.length - 5}건` : ""
    }`;
  }
  return data.error ?? "계산 요청 처리에 실패했습니다.";
}
