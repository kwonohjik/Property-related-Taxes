/**
 * ⑫ 부담부증여 × 토지·건물 소유자 분리 — 범위 밖 400 + 본인 몫 계약(비소유 파트 0) (계획서 `docs/00-pm/bg-owner-split-159.plan.md` §7 · PR-3).
 *
 * 범위 술어는 ⑤④⑧과 같은 `lib/calc/bg-owner-split-scope.ts`다(3중 패턴). 계약 판정은 엔진 `bgOwnerSplitContractViolation`과 같은 함수다 —
 * 엔진이 INVALID_INPUT으로 던지는 입력을 route가 400 필드 오류로 먼저 돌려준다(엔진이 0으로 바꾸지 않는다).
 * 단건·다건 공용 진입점(`refineHouseholdRequiredInputs`)과 컴패니언 항목이 부른다. 컴패니언은 함께 양도 묶음의 한 자산이라 늘 `bundled`다.
 */
import { z } from "zod";
import { bgOwnerSplitActiveBody, bgOwnerSplitUnsupportedBody, type BgOwnerSplitBody } from "@/lib/calc/bg-owner-split-scope";
import { bgOwnerSplitContractMessage, bgOwnerSplitContractViolation, type OwnerSplit } from "@/lib/tax-engine/burdened-gift-owner-split";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

export function refineBgOwnerSplit(
  data: BgOwnerSplitBody,
  ctx: z.RefinementCtx,
  basePath: (string | number)[] = [],
  opts?: { bundled?: boolean },
): void {
  const unsupported = bgOwnerSplitUnsupportedBody(data, opts);
  if (unsupported) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...basePath, "selfOwns"], message: unsupported });
    return;
  }
  if (!bgOwnerSplitActiveBody(data)) return;
  const owner = data.selfOwns as OwnerSplit;
  const violation = bgOwnerSplitContractViolation(owner, data.burdenedGiftInfo as NonNullable<TransferTaxInput["burdenedGiftInfo"]>);
  if (violation) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...basePath, ...violation.field.split(".")], message: bgOwnerSplitContractMessage(owner, violation.detail) });
  }
}
