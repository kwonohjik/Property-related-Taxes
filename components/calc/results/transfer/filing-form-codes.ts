/**
 * 신고서 코드 칸 — 단일 소스 (화면 신고서 표 · 결과 PDF 공용).
 *
 * 정본: 「소득세법 시행규칙」 [별지 제84호서식] <개정 2026. 3. 20.> 작성방법 · [별지 제84호서식 부표 1] <개정 2024. 3. 22.> 작성방법
 * (KoreanLaw get_annexes bylSeq 008400 원문 대조, 2026-11-09).
 *
 *   · 본지 ③ 세율구분 코드 — 국내자산 6. 「조세특례제한법」 제98조(미분양주택에 대한 과세특례) | 1-92 | 20%
 *   · 부표1 ⑯ 장기보유특별공제(코드) — 작성방법 12. 코드 01~06
 *   · 부표1 ㉑ 감면종류 및 감면율 — 작성방법 16. 「양도소득세 감면규정 및 감면율을 적습니다」 — **코드표가 없는 자유 기재란**이다(코드 추정 금지).
 *   · 농어촌특별세 납부계산서 ㉒ 소득세 감면세액 — 금액 칸(코드 아님). 농특세 산출세액(㉔)의 과세표준이다.
 *
 * 규칙: 엔진이 낸 판정(echo)만 읽는다. 자산종류·기간으로 다시 유도하지 않는다. 단정할 수 없으면 `undefined`(→ 「-」).
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { SpecialRateBasis } from "@/lib/tax-engine/transfer-tax-rate-clause";
import { REDUCTION_TYPE_LABELS, UNKNOWN_REDUCTION_LABEL } from "@/lib/tax-engine/transfer-reduction-type-labels";
import { applyRate } from "@/lib/tax-engine/tax-utils";
import { isTable2Applied } from "./lthd-split-display";
import { incomeDeductionReducible, pickIncomeDeductionFormulaSource } from "./reduction-eligible-income";

// ─── ③ 세율구분 코드 — §104 밖 특례 ────────────────────────────

/** 별지84호 작성방법 「과세대상자산 및 세율」 국내자산 6. — `Record`라 새 표지가 늘면 컴파일러가 누락을 잡는다. */
export const SPECIAL_RATE_BASIS_CODE: Record<SpecialRateBasis, string> = {
  unsold_98: "1-92",
};

// ─── 부표1 ⑯ 장기보유특별공제(코드) ────────────────────────────

export type LthdFilingKind =
  | "one_house_table2"
  | "general_table1"
  | "excluded"
  | "rental_97_3"
  | "rental_97_4"
  | "unsold_98_2";

/** 부표1 작성방법 12. 표 — 코드 01~06 (원문 그대로). */
export const LTHD_FILING_CODE: Record<LthdFilingKind, string> = {
  one_house_table2: "01", // 1세대1주택 — 「소득세법」 제95조제2항 표2
  general_table1: "02", // 1세대1주택 외 — 표1
  excluded: "03", // 장기보유특별공제 적용배제 — 보유·거주기간 미충족 또는 미등기·중과대상 다주택 등
  rental_97_3: "04", // 장기일반민간임대주택(「조특법」 제97조의3)
  rental_97_4: "05", // 장기임대주택(「조특법」 제97조의4)
  unsold_98_2: "06", // 지방미분양주택 취득(「조특법」 제98조의2)
};

/**
 * 장특 코드 종류 — 엔진 echo에서 도출.
 * @param ambiguous 토지·건물 분리·겸용·재개발처럼 한 자산 안에서 표1·표2가 섞일 수 있는 결과 — 표 구분(01/02)을 단정하지 않는다.
 */
export function resolveLthdFilingKind(result: TransferTaxResult, ambiguous = false): LthdFilingKind | undefined {
  // §98의2 표2 보유기간별 공제율 — 엔진이 대체 적용했을 때(lthd982Echo.outcome)
  const echo982 = result.unsold982Detail?.lthd982Echo;
  if (echo982?.outcome === "table2_holding") return "unsold_98_2";
  if (result.longTermHoldingDeduction <= 0) {
    // 공제 0원 — 양도차익이 있어야 「배제」다(차손·비과세는 칸이 의미 없다).
    return result.taxableGain > 0 ? "excluded" : undefined;
  }
  const r97 = result.rental97LthdDetail as
    | { isEligible?: boolean; effectCategory?: string; specialApplied?: boolean; replacedBy982Deduction?: number }
    | undefined;
  if (r97?.isEligible === true && r97.replacedBy982Deduction === undefined) {
    if (r97.effectCategory === "long_term_holding_special" && r97.specialApplied !== false) return "rental_97_3";
    if (r97.effectCategory === "long_term_holding_additional") return "rental_97_4";
  }
  if (ambiguous) return undefined;
  // 표2 여부는 화면 신고서 표가 쓰는 것과 같은 술어(엔진 sub-step 우선). 신호가 없으면 표1.
  return isTable2Applied(result.steps, false) ? "one_house_table2" : "general_table1";
}

export function resolveLthdFilingCode(result: TransferTaxResult, ambiguous = false): string | undefined {
  const kind = resolveLthdFilingKind(result, ambiguous);
  return kind ? LTHD_FILING_CODE[kind] : undefined;
}

// ─── 부표1 ㉑ 감면종류 및 감면율 (자유 기재) ────────────────────

function pct(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

/**
 * 감면 규정(라벨)과, 엔진이 echo한 감면율이 있을 때만 그 율.
 * 감면율 echo가 없는 조문(§69·§77 계열 등)은 율을 적지 않는다 — 추정 금지(확인 필요).
 */
export function resolveFilingReductionKind(result: TransferTaxResult): string | undefined {
  const deduction = incomeDeductionReducible(result);
  if (!(result.reductionAmount > 0 || deduction > 0)) return undefined;
  // 소득금액 차감방식(§90②)·§98 시리즈 하이브리드 5년 이내 세액감면은 조문별 detail이 규정(id)과 감면율(`taxReductionRate`)을 싣는다.
  const src = pickIncomeDeductionFormulaSource(result) as
    | { id?: string; isEligible?: boolean; taxReductionRate?: number; reductionAmount?: number }
    | undefined;
  if (src && src.isEligible !== false && (deduction > 0 || (src.reductionAmount ?? 0) > 0)) {
    const label = REDUCTION_TYPE_LABELS[src.id ?? ""];
    if (label) return src.taxReductionRate && src.taxReductionRate > 0 ? `${label} ${pct(src.taxReductionRate)}` : label;
  }
  // 엔진 라벨(`reductionType`)은 등록 라벨일 때만 쓴다 — 미등록 id가 화면·PDF에 새지 않게 「기타 감면」으로 떨어뜨린다.
  const label = result.reductionType
    ? Object.values(REDUCTION_TYPE_LABELS).includes(result.reductionType)
      ? result.reductionType
      : UNKNOWN_REDUCTION_LABEL
    : undefined;
  if (!label) return undefined;
  // §97 계열 세액감면은 감면율(50%/100%)을 detail이 싣는다. 그 밖의 조문(§69·§77 계열 등)은 율 echo가 없어 적지 않는다(확인 필요).
  const r97 = result.rental97TaxDetail as { isEligible?: boolean; effectCategory?: string; reductionRate?: number } | undefined;
  const rate = r97?.isEligible === true && r97.effectCategory === "tax_amount" ? r97.reductionRate : undefined;
  return rate && rate > 0 ? `${label} ${pct(rate)}` : label;
}

// ─── 농어촌특별세 납부계산서 ㉒ 소득세 감면세액 ──────────────────

/**
 * ㉒ 소득세 감면세액 = 농특세 과세 대상 감면세액(⑪ 세액감면 + 소득금액 차감방식의 환산 감면세액).
 * 합이 엔진 농특세 총액과 맞을 때(`감면세액 × 20% = 농특세`)만 값을 낸다 — 맞지 않으면 비운다(비과세 조문·세액공제형 농특세가 섞인 경우 등, 확인 필요).
 */
export function resolveRuralSurtaxReductionBase(result: TransferTaxResult): number | undefined {
  const surtax = result.ruralSurtax ?? 0;
  if (surtax <= 0) return undefined;
  const incomeDeductionTax = [
    result.new993Detail, result.new99Detail, result.unsold988Detail, result.unsold987Detail, result.unsold992Detail,
    result.unsold983Detail, result.unsold985Detail, result.unsold986Detail, result.unsold982Detail, result.unsold984Detail, result.unsold98Detail,
  ].reduce((s, d) => s + ((d as { taxReductionForRuralSurtax?: number } | undefined)?.taxReductionForRuralSurtax ?? 0), 0);
  // 하이브리드 5년 내 세액감면 detail의 `taxReductionForRuralSurtax`는 ⑪ 감면세액과 같은 금액이라 합산하면 두 번 센다 —
  // 어느 조합이 엔진 농특세와 맞는지 검산해 맞는 것만 쓴다(후보 순서: ⑪ 단독 → 차감형 환산액 단독 → 합).
  const candidates = [result.reductionAmount, incomeDeductionTax, result.reductionAmount + incomeDeductionTax];
  return candidates.find((c) => c > 0 && applyRate(c, 0.2) === surtax);
}
