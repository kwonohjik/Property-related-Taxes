/**
 * PR-K — §54⑥ 평가심의위원회 신청 옵션 (70~130% 4방법)
 *
 * 법령: 상증령 §54⑥ + 상증령 §49의2 + 상증법 §67·§68 (KoreanLaw MCP 2026-05-24 검증)
 *
 * §54⑥ 요지:
 *   비상장주식 보유 법인이 §54① 또는 ② 보충적 평가가액의 100분의 70 ~ 100분의 130 범위 내에서
 *   납세자가 평가심의위원회에 신청한 평가가액으로 평가할 수 있다.
 *   - 신청 시 §49의2 절차 준용 (상속 §67 / 증여 §68 신고기한 종속)
 *   - 4가지 평가방법: 유사상장사례비교법(clm) · 현금흐름할인법(dcf) · 배당할인법(ddm) · 기타(other)
 *
 * 본 모듈은 **참고용 메타**로만 동작 — 본 결과(finalPerShareForReporting·totalValuation)는 무변경.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md
 */

// ─────────────────────────────────────────────────────────────────
// 공개 타입
// ─────────────────────────────────────────────────────────────────

/** §54⑥ 4가지 평가방법 enum */
export type EvaluationCommitteeMethod = "clm" | "dcf" | "ddm" | "other";

/** UI 한글 라벨 — Record로 모든 enum 키 강제 */
export const METHOD_LABEL: Record<EvaluationCommitteeMethod, string> = {
  clm: "유사상장사례비교법",
  dcf: "현금흐름할인법(DCF)",
  ddm: "배당할인법(DDM)",
  other: "기타 평가법",
};

/** §54⑥ 입력 */
export interface EvaluationCommitteeInput {
  /** 4가지 평가방법 중 1개 */
  method: EvaluationCommitteeMethod;
  /** 납세자가 신청한 1주당 평가가액 (보충적 70~130% 범위 강제) */
  taxpayerPerShareValuation: number;
  /** method="other" 시 평가법 사유·근거 (필수) */
  methodNotes?: string;
  /** 평가기관·기관명 (선택 — 신용평가전문기관 의뢰 시 §49의2⑨ 안내) */
  evaluatorOrganization?: string;
}

/** §54⑥ 경고 사유 */
export type EvaluationCommitteeWarningReason =
  | "out_of_range_below"             // 70% 미만 → 옵션 미적용
  | "out_of_range_above"             // 130% 초과 → 옵션 미적용
  | "zero_supplementary"             // 보충적 평가가액 0 → 범위 계산 불가
  | "other_method_missing_notes";    // method="other" + methodNotes 누락

/** §54⑥ 결과 */
export interface EvaluationCommitteeResult {
  /** 70~130% 범위 내 통과 여부 */
  isWithinRange: boolean;
  /** 보충적 평가가액 (§54①·② 의 ⑥ finalPerShareValue) */
  supplementary: number;
  /** 70% 하한 — Math.floor(supplementary * 0.7) */
  lower: number;
  /** 130% 상한 — Math.floor(supplementary * 1.3) */
  upper: number;
  /** 편차율 (decimal) — (taxpayer - supplementary) / supplementary. 예: -0.05 = -5.00% */
  deviationPct: number;
  /** 적용된 평가방법 enum */
  method: EvaluationCommitteeMethod;
  warnings: Array<{ reason: EvaluationCommitteeWarningReason; message: string }>;
  /** 법령 인용 근거 */
  appliedLegalBasis: string;
}

// ─────────────────────────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────────────────────────

/**
 * 70~130% 범위 검증.
 *
 * lower = Math.floor(supplementary * 0.7)
 * upper = Math.floor(supplementary * 1.3)
 * isWithinRange = lower <= taxpayer <= upper
 *
 * 경계: 70%·130% 정확값 = 포함.
 * supplementary <= 0 → isWithinRange=false, lower=upper=0.
 */
export function validatePerShareRange(
  supplementary: number,
  taxpayer: number,
): { isWithinRange: boolean; lower: number; upper: number; deviationPct: number } {
  if (supplementary <= 0) {
    return { isWithinRange: false, lower: 0, upper: 0, deviationPct: 0 };
  }
  const lower = Math.floor(supplementary * 0.7);
  const upper = Math.floor(supplementary * 1.3);
  const deviationPct = (taxpayer - supplementary) / supplementary;
  return {
    isWithinRange: taxpayer >= lower && taxpayer <= upper,
    lower,
    upper,
    deviationPct,
  };
}

// ─────────────────────────────────────────────────────────────────
// 평가 진입점
// ─────────────────────────────────────────────────────────────────

/**
 * §54⑥ 평가심의위원회 신청 옵션 평가.
 *
 * 입력 검증:
 *   1. supplementary <= 0 → warnings.zero_supplementary + isWithinRange=false
 *   2. method="other" + methodNotes 누락(빈 문자열 포함) → warnings.other_method_missing_notes
 *      (옵션은 적용 가능하나 사유 보완 필요)
 *   3. taxpayer < lower → warnings.out_of_range_below + isWithinRange=false
 *   4. taxpayer > upper → warnings.out_of_range_above + isWithinRange=false
 */
export function applyEvaluationCommittee(
  input: EvaluationCommitteeInput,
  supplementary: number,
): EvaluationCommitteeResult {
  const warnings: EvaluationCommitteeResult["warnings"] = [];
  const { isWithinRange, lower, upper, deviationPct } = validatePerShareRange(
    supplementary,
    input.taxpayerPerShareValuation,
  );

  if (supplementary <= 0) {
    warnings.push({
      reason: "zero_supplementary",
      message: "보충적 평가가액이 0 — §54⑥ 70~130% 범위 계산 불가",
    });
  } else if (input.taxpayerPerShareValuation < lower) {
    warnings.push({
      reason: "out_of_range_below",
      message: `신청 평가액(${input.taxpayerPerShareValuation}) < 70% 하한(${lower}) — §54⑥ 옵션 미적용`,
    });
  } else if (input.taxpayerPerShareValuation > upper) {
    warnings.push({
      reason: "out_of_range_above",
      message: `신청 평가액(${input.taxpayerPerShareValuation}) > 130% 상한(${upper}) — §54⑥ 옵션 미적용`,
    });
  }

  if (input.method === "other" && (!input.methodNotes || input.methodNotes.trim() === "")) {
    warnings.push({
      reason: "other_method_missing_notes",
      message: "method=\"other\" 선택 시 methodNotes(평가법 사유) 필수 — §49의2⑤2호",
    });
  }

  return {
    isWithinRange,
    supplementary,
    lower,
    upper,
    deviationPct,
    method: input.method,
    warnings,
    appliedLegalBasis: "상증령 §54⑥ + §49의2 (상증법 §67·§68 신고기한 종속)",
  };
}
