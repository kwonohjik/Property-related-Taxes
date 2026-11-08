/**
 * 양도세 ⑫ — 재개발·재건축 원조합원의 날짜 순서 (주 자산 · 함께 양도 컴패니언 공용).
 *
 * 종전 부동산(주택·토지만 출자 모두)의 취득일이 관리처분계획 인가일보다 늦은데 승계조합원 모드를 끈 입력은 모순이다 —
 * 인가일 뒤 취득은 «그 조합원으로부터 취득한 것»(승계조합원)이다. ⑧ `validateRedevelopmentAsset`과 같은 술어
 * (`redevOriginalMemberAcquiredAfterApproval`)를 건다. 주 자산 전용이던 블록(L19 #2987)을 옮겨 컴패니언도 부른다 — 컴패니언은
 * ⑧만 막고 ⑫ 거울이 없어 API 직접 호출이 원조합원 산식으로 200이었다.
 *
 * 승계 입주권(`isSuccessorRightToMoveIn`)은 ⑧도 별도 검증(`validateSuccessorRightAsset`)이라 제외한다.
 * 취득일은 ④가 싣는 자산 취득일(이월과세는 `carryoverAcquisitionDateFallback`)이라 ⑧이 읽는 `primaryAcquisitionDateOf`와 같은 값이다.
 */
import { z } from "zod";
import { redevOriginalMemberAcquiredAfterApproval } from "@/lib/calc/redev-original-member-order";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-house";

export function refineRedevOriginalMemberOrder(
  d: {
    redevelopment?: { isSuccessorMember?: boolean; approvalDate?: string } | null;
    isSuccessorRightToMoveIn?: boolean;
    acquisitionDate?: string;
  },
  ctx: z.RefinementCtx,
  /** 자산 객체의 경로 — 주 자산 `[]` · 컴패니언 `["companionAssets", i]` */
  basePath: (string | number)[],
): void {
  if (
    !d.redevelopment ||
    d.isSuccessorRightToMoveIn === true ||
    !redevOriginalMemberAcquiredAfterApproval({
      isSuccessorMember: d.redevelopment.isSuccessorMember,
      acquisitionDate: d.acquisitionDate,
      approvalDate: d.redevelopment.approvalDate,
    })
  )
    return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [...basePath, "redevelopment", "approvalDate"],
    message: `관리처분계획 인가일은 종전 부동산 취득일 이후일 수 없습니다 — 인가 뒤에 취득했으면 승계조합원(redevelopment.isSuccessorMember)으로 보내세요 (${REDEVELOPMENT.RIGHT_DEFINITION} · 사전-2019-법령해석재산-0649)`,
  });
}
