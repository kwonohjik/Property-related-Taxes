/**
 * 국외전출세 — 폼 → 엔진 입력 결함 판정 (⑧ validate의 단일 소스 · ⑫ Zod와 같은 판정)
 *
 * ⑧(클라이언트)과 ⑫(Zod 최상위 refine)이 **같은 body → 같은 매핑 → 같은 엔진 판정**을 쓴다.
 *   폼 → `buildExitTaxApiBody`(④) → `buildExitTaxEngineInput`(⑭ 매핑, route·Zod와 공용) → `findExitTaxInputProblem`(엔진)
 * 판정 코드를 화면에 다시 쓰지 않으므로 UI는 통과시키는데 API가 거부하는 모순(또는 반대)이 생기지 않는다.
 * 같은 폼의 body가 서버에 도달해 막히는 일을 클라이언트에서 미리 같은 문구로 막는 것이 목적이다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  findExitTaxInputProblem,
  type ExitTaxInputProblem,
} from "@/lib/tax-engine/stock-transfer/exit-tax-input-check";
import { buildExitTaxEngineInput } from "@/lib/api/stock-transfer-exit-tax-engine-input";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
import { buildExitTaxApiBody } from "./stock-transfer-tax-api-foreign-exit";

/** 엔진이 입력 결함으로 거부하면 그 사유, 아니면 null. 입력 결함이 아닌 오류(세율 누락 등)는 여기서 가리지 않는다. */
export function findExitTaxFormProblem(form: StockTransferFormData): ExitTaxInputProblem | null {
  let engineInput;
  try {
    engineInput = buildExitTaxEngineInput(buildExitTaxApiBody(form));
  } catch (err) {
    // 날짜 형식 오류 — Zod refine이 같은 사유로 400을 돌려주는 경우다
    return { message: err instanceof Error ? err.message : "날짜 형식이 올바르지 않습니다", path: "" };
  }
  try {
    return findExitTaxInputProblem(engineInput);
  } catch (err) {
    if (err instanceof TaxCalculationError) return null;
    throw err;
  }
}

/** 엔진 problem.path 가 가리키는 «단계» — 2단계(종목·외국인근로자)에서 막을지, 3단계(그 밖)에서 막을지 */
export function exitTaxProblemStep(problem: ExitTaxInputProblem): 2 | 3 {
  const p = problem.path;
  return p === "" || p.startsWith("holdings") || p.startsWith("foreignWorker") ? 2 : 3;
}

/** 엔진 problem.path → 폼 필드 키(검증 오류 → 입력칸 이동 앵커). 매핑이 없으면 가장 가까운 상위 입력 */
export function exitTaxProblemField(
  problem: ExitTaxInputProblem,
  form: StockTransferFormData,
  allocFallback: "etBasicDeductionAllocClause1" | "etBasicDeductionAllocClause2a" | "etBasicDeductionAllocClause2b",
): string {
  const parts = problem.path.split(".");
  if (parts[0] === "holdings") {
    if (parts.length === 1) return "etHoldings";
    const idx = (form.etHoldings ?? []).findIndex((h) => h.id === parts[1]);
    if (idx < 0) return "etHoldings";
    return parts[2] ? `etHoldings[${idx}].${parts[2]}` : `etHoldings[${idx}]`;
  }
  if (parts[0] === "foreignWorkerChecks" || parts[0] === "foreignWorkerStatus") return "etForeignWorkerStatus";
  if (parts[0] === "foreignWorkerFamilyKind") return "etForeignWorkerFamilyKind";
  if (parts[0] === "foreignWorkerStartDate") return "etForeignWorkerStartDate";
  if (parts[0] === "basicDeductionAllocation") {
    if (parts[1] === "clause1") return "etBasicDeductionAllocClause1";
    if (parts[1] === "clause2a") return "etBasicDeductionAllocClause2a";
    if (parts[1] === "clause2b") return "etBasicDeductionAllocClause2b";
    return allocFallback;
  }
  if (parts[0] === "actualTransferPricePerShare") return "etActualTransferPricePerShare";
  return "etHoldings";
}
