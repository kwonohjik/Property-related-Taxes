/**
 * ⑧ 분할·다건 lot — 의제취득일 전 매수 ① 비교 입력 검증 (영 §176의2④1호 · 계획서 stock-lot-pre-deemed-clause1)
 *
 * ⑫ Zod refine(`stock-transfer-tax-refines-lot-clause1.ts`)와 **같은 검사 함수**(`checkPreDeemedLotClause1`)를 쓴다 —
 * 폼을 ④ 와 같은 경로(`buildStockTransferApiBody` → `coerceDates` → `buildEngineInput`)로 엔진 입력으로 바꿔 넘기므로
 * UI 통과 ↔ ⑫ 차단 모순이 구조적으로 생기지 않는다. step2(분할은 조기 반환 앞 · lots-only 는 lot 블록)가 부른다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";
import { buildStockTransferApiBody } from "./stock-transfer-tax-api";
import { isLotsModeForm, isSection94_4Form, preDeemedLotIndexesForm } from "./stock-transfer-section94-4-form";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { checkPreDeemedLotClause1 } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1-check";

export function validatePreDeemedLotClause1(form: StockTransferFormData): StockValidationError[] {
  const mode = form.preDeemedLotClause1Mode;
  if (!isLotsModeForm(form) || (mode !== "estimated" && mode !== "sale_case")) return [];
  // 의제 대상 lot 이 없으면 ④ 가 싣지 않는다 — 막을 것이 없다(카드도 사라진다)
  if (preDeemedLotIndexesForm(form).length === 0) return [];

  let issues: ReturnType<typeof checkPreDeemedLotClause1>;
  try {
    issues = checkPreDeemedLotClause1(
      buildEngineInput(coerceDates(buildStockTransferApiBody(form), [...STOCK_DATE_FIELDS])),
      isSection94_4Form(form),
    );
  } catch {
    // 입력 도중(날짜 미완성 등) — 각 단계의 필드 오류가 먼저 사유를 보여준다
    return [];
  }
  return issues.map((issue) => ({
    // lots-only 의 매도 lot 은 합성 1건 — 입력 칸은 폼 전역 양도 당시 기준시가다
    field:
      issue.field === "transferStdPricePerShare"
        ? form.lotsMode === "split"
          ? `transferLots[${issue.transferLotIndex ?? 0}].transferStdPricePerShare`
          : "transferDatePriceAvg1Month"
        : issue.field,
    message: issue.message,
    severity: "error" as const,
  }));
}
