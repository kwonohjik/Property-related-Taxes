/**
 * ⑫ 상속·증여 승계 입주권 — 취득가액은 「소득세법 시행령」 §163⑨ 평가액이다(⑧ `validateSuccessorRightAsset` 상속·증여 갈래의 거울).
 *
 * 단건 ④는 평가액을 §163⑨ 페이로드(`inheritedAcquisition.reportedValue`)로 싣고, 컴패니언 ④는 상속 평가액을
 * `inheritanceValuation.publishedValueAtInheritance`로 싣는다(#2761). 그 채널 없이 오면 엔진이 `acquisitionPrice`(단건)·
 * `fixedAcquisitionPrice`(컴패니언 상속 — 구 계약 `legacyFixed`)를 취득가액으로 썼다 — 승계 입주권에서 그 칸은 승계취득가액
 * (+ 추가분담금) 축이라 평가액이 아닌 값으로 계산됐다(실측: 단건 9억 133,060,000 · 1억 472,935,000 ↔ 평가액 3억 383,010,000 ·
 * 컴패니언 상속 1억 418,035,000 ↔ 331,770,000).
 *
 * ⚠️ **다건(`/api/calc/transfer/multi`)에는 걸지 않는다** — 다건 ④는 §163⑨ 페이로드 없이 `acquisitionPrice`에 증여 신고가액·상속 신고가액을
 *    싣는다(그 칸이 평가액이다). 컴패니언 증여는 `fixedAcquisitionPrice`가 곧 증여 신고가액이라(컴패니언 증여 arm이 요구) 따로 보지 않는다.
 * 부담부증여는 §159가 취득가액을 정한다(⑧ `isDeemedValueSuccessorRight`와 같은 제외).
 * 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` §9.
 */
import { z } from "zod";

type SuccessorDeemedLike = {
  isSuccessorRightToMoveIn?: boolean;
  acquisitionCause?: string;
  transferType?: string;
  burdenedGiftInfo?: unknown;
};

const isDeemedSuccessor = (d: SuccessorDeemedLike) =>
  d.isSuccessorRightToMoveIn === true &&
  (d.acquisitionCause === "gift" || d.acquisitionCause === "inheritance") &&
  d.transferType !== "burdened_gift" &&
  d.burdenedGiftInfo == null;

/** 단건 주 자산 — §163⑨ 페이로드의 평가액(①)이 있어야 한다. */
export function refineDeemedSuccessorRightPrimary(
  d: SuccessorDeemedLike & { inheritedAcquisition?: { reportedValue?: number } | null },
  ctx: z.RefinementCtx,
): void {
  if (!isDeemedSuccessor(d) || (d.inheritedAcquisition?.reportedValue ?? 0) > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["inheritedAcquisition", "reportedValue"],
    message: `${d.acquisitionCause === "gift" ? "증여" : "상속"}받은 승계 입주권은 ${d.acquisitionCause === "gift" ? "증여일" : "상속개시일"} 현재 평가액(inheritedAcquisition.reportedValue)이 취득가액입니다 — acquisitionPrice(승계취득가액)로는 계산하지 않습니다 (소득세법 시행령 §163⑨)`,
  });
}

/** 컴패니언 상속 — 상속개시일 평가액(`inheritanceValuation.publishedValueAtInheritance`)이 있어야 한다(구 계약 `fixedAcquisitionPrice`를 받지 않는다). */
export function refineDeemedSuccessorRightCompanion(
  c: SuccessorDeemedLike & { inheritanceValuation?: { publishedValueAtInheritance?: number } | null },
  ctx: z.RefinementCtx,
  prefix: (string | number)[],
): void {
  if (!isDeemedSuccessor(c) || c.acquisitionCause !== "inheritance") return;
  if ((c.inheritanceValuation?.publishedValueAtInheritance ?? 0) > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [...prefix, "inheritanceValuation", "publishedValueAtInheritance"],
    message: "상속받은 승계 입주권은 상속개시일 평가액(inheritanceValuation.publishedValueAtInheritance)이 취득가액입니다 — fixedAcquisitionPrice(승계취득가액)로는 계산하지 않습니다 (소득세법 시행령 §163⑨)",
  });
}
