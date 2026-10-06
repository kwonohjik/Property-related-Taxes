/**
 * ⑫ 분할·다건 lot — 의제취득일 전 매수 ① 비교 입력 refine (영 §176의2④1호)
 *
 * ⑧ validate(`stock-transfer-tax-validate-pre-deemed-lots.ts`)와 **같은 검사 함수**(`checkPreDeemedLotClause1`)를 쓴다 —
 * UI 통과 ↔ ⑫ 차단 모순 금지. `stock-transfer-tax-refines.ts` 가 509줄이라 형제 파일로 둔다.
 */

import type { z } from "zod";
import { coerceDates } from "./date-coerce";
import { STOCK_DATE_FIELDS } from "./stock-transfer-date-fields";
import { buildEngineInput } from "./stock-transfer-engine-input";
import { checkPreDeemedLotClause1 } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1-check";

export function refinePreDeemedLotClause1(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
  is94_4: boolean,
): void {
  if (!data.preDeemedLotClause1) return;
  let issues: ReturnType<typeof checkPreDeemedLotClause1>;
  try {
    issues = checkPreDeemedLotClause1(buildEngineInput(coerceDates({ ...data }, [...STOCK_DATE_FIELDS])), is94_4);
  } catch {
    // 날짜 변환 실패 등 — 다른 refine·필드 오류가 먼저 사유를 알린다
    return;
  }
  for (const issue of issues) {
    ctx.addIssue({
      code: "custom",
      path: issue.field === "transferStdPricePerShare" ? ["transferLots", issue.transferLotIndex ?? 0, issue.field] : [issue.field],
      message: issue.message,
    });
  }
}
