/**
 * 1세대1주택 판정 — 요건 순차 검토(`requirementReview`)의 미충족 행 → **계산기 결과 고지** 1건.
 *
 * 계획서 `docs/00-pm/one-house-154-1-unmet-reason-calc.plan.md`(Q-A2 · Q 전부 권장안).
 *
 * 판정 메뉴는 이 검토를 카드(`OneHouseRequirementReviewCard`)로 그리지만, 계산기 결과는 `warnings`만 그려서
 * 1주택 · 일시적 2주택 · 합가가 과세로 끝나도 「어느 요건에서 떨어졌는지」가 하나도 나오지 않았다.
 *
 * 🔑 판정을 다시 하지 않는다 — 행의 `label`·`facts`·`note`를 문장으로 옮기기만 한다(판정 메뉴 카드와 같은 출처).
 * ⚠️ 보유 행(`holding`)의 `note`는 옮기지 않는다 — 그 문구는 삭제된 규정을 삭제 표시 없이 인용해
 *    #2872 리뷰 게이트가 계산기 고지에서 막았다(판정 메뉴 카드는 종전 그대로).
 * ⚠️ 기한 행의 「이 날까지 양도하면 충족」 문장은 뺀다 — 판정 메뉴는 판정 기준일로 이룰 수 없는 기한을 거르지만
 *    계산기에는 기준일이 없어 이미 지난 기한을 제안하게 된다(리뷰 게이트 R2 · 기한은 facts에 남는다).
 */
import { TRANSFER } from "../legal-codes";
import { MERGE_CONFIRM_NOTICE_PREFIX } from "./merge-confirm-warnings";
import { DOUBLE_MERGE_COMPOSITION_LABEL, REACHABLE_DEADLINE_NOTE_PATTERN } from "./requirement-review";
import type { OneHouseJudgment, OneHouseRequirementCheck, OneHouseRequirementReview } from "./types";

function headOf(review: OneHouseRequirementReview): string {
  switch (review.scheme) {
    case "154-1-one-house":
      return `1세대1주택 비과세(${TRANSFER.ONE_HOUSE_REQUIREMENT}①)`;
    case "155-1-temporary-two-house":
      return `일시적 2주택 비과세 특례(${TRANSFER.TEMPORARY_TWO_HOUSE}①)`;
    case "155-4-5-merge":
      // 합가 종류는 검토표가 고른 것(첫 행)을 그대로 읽는다 — 여기서 다시 고르지 않는다.
      if (review.items[0]?.label === DOUBLE_MERGE_COMPOSITION_LABEL) {
        return `혼인·동거봉양 이중 합가 비과세 특례(${TRANSFER.PARENTAL_CARE_MERGE_EXEMPT} · ${TRANSFER.MARRIAGE_MERGE_EXEMPT})`;
      }
      return review.items[0]?.legalBasis === TRANSFER.MARRIAGE_MERGE_EXEMPT
        ? `혼인 합가 비과세 특례(${TRANSFER.MARRIAGE_MERGE_EXEMPT})`
        : `동거봉양 합가 비과세 특례(${TRANSFER.PARENTAL_CARE_MERGE_EXEMPT})`;
  }
}

/** 행 note는 마침표로 끝난다 — 행을 「 · 」로 잇고 문장 끝에 마침표를 하나만 찍도록 뗀다. 보유 행 note는 싣지 않는다(머리 주석). */
function noteOf(item: OneHouseRequirementCheck): string | undefined {
  if (!item.note || item.id === "holding") return undefined;
  const note = item.note.replace(REACHABLE_DEADLINE_NOTE_PATTERN, "").trim().replace(/\.\s*$/, "");
  return note || undefined;
}

/** 합가 구성·직계존속 연령 「모름」 행 — `mergeConfirmWarnings`가 같은 원인을 이미 말했으면 뺀다(리뷰 게이트 R1). */
const MERGE_CONFIRM_ROW_IDS = new Set(["merge-composition", "merge-parent-age"]);
const isConfirmRow = (i: OneHouseRequirementCheck) =>
  MERGE_CONFIRM_ROW_IDS.has(i.id) && (i.status === "unchecked" || !!i.note?.includes("확인 필요"));

function rowOf(item: OneHouseRequirementCheck): string {
  const facts = item.facts.length > 0 ? `(${item.facts.map((f) => `${f.label} ${f.value}`).join(", ")})` : "";
  const note = noteOf(item);
  return `${item.label} ${item.status === "unchecked" ? "확인하지 않음" : "미충족"}${facts}${note ? ` — ${note}` : ""}`;
}

/**
 * 과세(비과세·부분 비과세 아님)이고 검토표에 미충족·미확인 행이 있을 때만 문장을 낸다.
 *
 * @param shown 이미 낸 결과 고지 — 같은 사유를 두 번 말하지 않는다(Q-5 a). 남는 행이 없으면 고지하지 않는다.
 *   - 행 note가 그 안에 그대로 있으면 그 행을 뺀다(예: §155① 취득 선후 사유는 `CALC_WARNING_UNMET_IDS`로 먼저 나간다).
 *   - 합가 「확인 필요」 고지(`MERGE_CONFIRM_NOTICE_PREFIX`)가 있으면 구성·연령 「모름」 행을 뺀다.
 */
export function requirementReviewUnmetNotice(
  judgment: Pick<OneHouseJudgment, "isExempt" | "isPartialExempt" | "requirementReview">,
  shown: readonly string[] = [],
): string | undefined {
  const review = judgment.requirementReview;
  if (!review || judgment.isExempt || judgment.isPartialExempt) return undefined;
  const mergeConfirmShown = shown.some((w) => w.startsWith(MERGE_CONFIRM_NOTICE_PREFIX));
  const alreadyShown = (i: OneHouseRequirementCheck) => {
    if (mergeConfirmShown && isConfirmRow(i)) return true;
    const note = noteOf(i);
    return !!note && shown.some((w) => w.includes(note));
  };
  const rows = review.items.filter((i) => (i.status === "unmet" || i.status === "unchecked") && !alreadyShown(i));
  if (rows.length === 0) return undefined;
  return `${headOf(review)}를 적용하지 않았습니다 — ${rows.map(rowOf).join(" · ")}.`;
}
