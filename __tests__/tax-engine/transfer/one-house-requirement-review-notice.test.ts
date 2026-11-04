/**
 * `requirementReviewUnmetNotice` 단위 — 검토 행 → 계산기 고지 문장(`docs/00-pm/one-house-154-1-unmet-reason-calc.plan.md` B-2).
 */
import { describe, expect, it } from "vitest";
import { requirementReviewUnmetNotice } from "@/lib/tax-engine/one-house/requirement-review-notice";
import { DOUBLE_MERGE_COMPOSITION_LABEL } from "@/lib/tax-engine/one-house/requirement-review";
import { MERGE_CONFIRM_NOTICE_PREFIX } from "@/lib/tax-engine/one-house/merge-confirm-warnings";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { OneHouseRequirementCheck, OneHouseRequirementReview } from "@/lib/tax-engine/one-house/types";

const row = (o: Partial<OneHouseRequirementCheck>): OneHouseRequirementCheck => ({
  id: "x", label: "요건", status: "met", facts: [], legalBasis: TRANSFER.ONE_HOUSE_REQUIREMENT, ...o,
});
const taxed = (review: OneHouseRequirementReview) => ({ isExempt: false, isPartialExempt: false, requirementReview: review });

describe("requirementReviewUnmetNotice", () => {
  it("비과세 · 부분 비과세 · 검토 없음 · 미충족 행 없음 → 고지 없음", () => {
    const review: OneHouseRequirementReview = { scheme: "154-1-one-house", items: [row({ status: "unmet" })] };
    expect(requirementReviewUnmetNotice({ ...taxed(review), isExempt: true })).toBeUndefined();
    expect(requirementReviewUnmetNotice({ ...taxed(review), isPartialExempt: true })).toBeUndefined();
    expect(requirementReviewUnmetNotice({ isExempt: false, isPartialExempt: false })).toBeUndefined();
    expect(requirementReviewUnmetNotice(taxed({ scheme: "154-1-one-house", items: [row({}), row({ status: "waived" }), row({ status: "not_required" })] }))).toBeUndefined();
  });

  it("미확인 행은 「확인하지 않음」 · 행 note는 싣되 보유 행 note는 싣지 않는다 · 마침표 하나", () => {
    const n = requirementReviewUnmetNotice(taxed({
      scheme: "155-4-5-merge",
      items: [
        row({ id: "merge-composition", label: "합가 전 각자 1주택", status: "unchecked", facts: [{ label: "세대 주택 수", value: "2채" }], note: "확인 필요.", legalBasis: TRANSFER.MARRIAGE_MERGE_EXEMPT }),
        row({ id: "holding", label: "보유기간 2년 이상", status: "unmet", note: "보유 행 문구." }),
      ],
    }));
    expect(n).toBe(
      `혼인 합가 비과세 특례(${TRANSFER.MARRIAGE_MERGE_EXEMPT})를 적용하지 않았습니다 — 합가 전 각자 1주택 확인하지 않음(세대 주택 수 2채) — 확인 필요 · 보유기간 2년 이상 미충족.`,
    );
  });

  it("합가 머리말은 첫 행 근거 조문으로 고른다 — 동거봉양", () => {
    const n = requirementReviewUnmetNotice(taxed({
      scheme: "155-4-5-merge",
      items: [row({ status: "unmet", legalBasis: TRANSFER.PARENTAL_CARE_MERGE_EXEMPT })],
    }));
    expect(n?.startsWith(`동거봉양 합가 비과세 특례(${TRANSFER.PARENTAL_CARE_MERGE_EXEMPT})를`)).toBe(true);
  });

  it("이미 낸 고지에 행 note가 그대로 있으면 그 행을 뺀다 — 남는 행이 없으면 고지하지 않는다(Q-5 a)", () => {
    const review: OneHouseRequirementReview = {
      scheme: "155-1-temporary-two-house",
      items: [
        row({ id: "one-year", label: "종전주택을 먼저 취득한 뒤 신규주택 취득", status: "unmet", note: "순서 사유." }),
        row({ id: "holding", label: "종전주택 보유기간 2년 이상", status: "unmet" }),
      ],
    };
    const shown = ["일시적 2주택을 적용하지 않았습니다 — 순서 사유."];
    expect(requirementReviewUnmetNotice(taxed(review), shown)).toBe(
      `일시적 2주택 비과세 특례(${TRANSFER.TEMPORARY_TWO_HOUSE}①)를 적용하지 않았습니다 — 종전주택 보유기간 2년 이상 미충족.`,
    );
    expect(requirementReviewUnmetNotice(taxed({ ...review, items: [review.items[0]] }), shown)).toBeUndefined();
  });

  it("이중 합가는 머리말에 두 합가를 함께 적는다(R3)", () => {
    const n = requirementReviewUnmetNotice(taxed({
      scheme: "155-4-5-merge",
      items: [row({ id: "merge-composition", label: DOUBLE_MERGE_COMPOSITION_LABEL, status: "unmet", legalBasis: TRANSFER.MARRIAGE_MERGE_EXEMPT })],
    }));
    expect(n?.startsWith(`혼인·동거봉양 이중 합가 비과세 특례(${TRANSFER.PARENTAL_CARE_MERGE_EXEMPT} · ${TRANSFER.MARRIAGE_MERGE_EXEMPT})를`)).toBe(true);
  });

  it("「…까지 양도하면 충족」 문장은 빼고 나머지 note는 남긴다 · 그 문장뿐이면 note 없음(R2)", () => {
    const review = (note: string): OneHouseRequirementReview => ({
      scheme: "155-1-temporary-two-house",
      items: [row({ id: "disposal-deadline", label: "기한 내 양도", status: "unmet", note })],
    });
    expect(requirementReviewUnmetNotice(taxed(review("2023-01-02까지 양도하면 이 요건을 충족합니다. 기한이 늘었습니다.")))).toBe(
      `일시적 2주택 비과세 특례(${TRANSFER.TEMPORARY_TWO_HOUSE}①)를 적용하지 않았습니다 — 기한 내 양도 미충족 — 기한이 늘었습니다.`,
    );
    expect(requirementReviewUnmetNotice(taxed(review("2023-01-02까지 양도하면 이 요건을 충족합니다.")))).toBe(
      `일시적 2주택 비과세 특례(${TRANSFER.TEMPORARY_TWO_HOUSE}①)를 적용하지 않았습니다 — 기한 내 양도 미충족.`,
    );
  });

  it("합가 확인 필요 고지가 있으면 구성·연령 「모름」 행만 뺀다 — 확정 불성립 구성 행은 남긴다(R1)", () => {
    const shown = [`${MERGE_CONFIRM_NOTICE_PREFIX}보유자를 고르세요.`];
    const items = [
      row({ id: "merge-composition", label: "구성", status: "unmet", note: "불성립으로 판정했습니다 — 확인 필요: 고르세요." }),
      row({ id: "merge-parent-age", label: "연령", status: "unmet", note: "불성립으로 판정했습니다 — 확인 필요: 연령." }),
    ];
    expect(requirementReviewUnmetNotice(taxed({ scheme: "155-4-5-merge", items }), shown)).toBeUndefined();
    expect(requirementReviewUnmetNotice(taxed({ scheme: "155-4-5-merge", items: [row({ id: "merge-composition", label: "구성", status: "unmet", note: "이미 2주택이었습니다." })] }), shown)).toBe(
      `동거봉양 합가 비과세 특례(${TRANSFER.PARENTAL_CARE_MERGE_EXEMPT})를 적용하지 않았습니다 — 구성 미충족 — 이미 2주택이었습니다.`,
    );
    expect(requirementReviewUnmetNotice(taxed({ scheme: "155-4-5-merge", items }))).toContain("구성 미충족");
  });
});

