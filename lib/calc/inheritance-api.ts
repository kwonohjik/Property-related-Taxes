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
 * if (!res.ok) setError(formatInheritanceApiError(res.data)); // ← InheritanceTaxFormErrors
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
    // §9②2호: 봉안시설·자연장지 별도 금액 (신규 경로)
    funeralBonganExpense: input.funeralBonganExpense,
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
    // 감정평가수수료 공제 (§25①2호·§20의3) — ⑬ body 명시 (누락 시 침묵 strip)
    appraisalFee: input.appraisalFee,
    // 신고·납부 가산세 (국기법 §47의2·§47의4) — ⑫Zod·⑭Route 둘 다 이 키를 기다린다.
    // 2026-09-11까지 여기서만 빠져 있어 가산세가 조용히 0이었다.
    filingPenalty: input.filingPenalty,
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
//
// 🔴 IG-157: 여기 있던 일반 포매터(`iss.path.join(".")` 원문 출력)는 제거했다.
// 유일한 호출부였던 `InheritanceTaxForm`이 상속세 «특화» 포매터
// (`components/calc/InheritanceTaxFormErrors.ts`의 `formatInheritanceApiError` —
// 한국어 라벨 치환 + `n번` 순번)로 넘어갔기 때문이다. 증여세도 같은 관례를 따른다
// (`components/calc/gift/gift-api-error-format.ts` ← `GiftTaxForm`).
// 남겨 두면 「내부 식별자 화면 노출 금지」를 깨는 경로가 다시 붙을 수 있다.
