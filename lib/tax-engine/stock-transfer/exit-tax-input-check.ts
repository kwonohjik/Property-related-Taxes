/**
 * 국외전출세 — 입력 결함 판정 (⑧ 클라이언트 validate · ⑫ Zod가 같이 import하는 단일 소스)
 *
 * 엔진은 입력 결함을 `TaxCalculationError(INVALID_INPUT, { path })`로 던진다(자동 보정·안분 fallback 없음).
 * 그 판정을 ⑧·⑫가 다시 구현하면 한쪽만 막혀 API 직접 호출로 뚫리거나, UI 통과↔API 차단 모순이 생긴다
 * (계획서 engine.plan.md §5.1 ⑧↔⑫ 격자 패리티). 그래서 **엔진을 그대로 한 번 돌려** 던져지는 INVALID_INPUT을
 * 문제 1건으로 돌려준다 — 판정 코드는 엔진 안에만 있다.
 *
 * - `INVALID_INPUT`만 문제로 본다. 그 밖의 오류(세율 누락 등)는 호출자 입력 결함이 아니므로 다시 던진다.
 * - 요건 미충족(거주 5년 미만·비대주주)으로 조기 반환되는 입력은 엔진이 세액을 계산하지 않으므로 문제로 보지 않는다.
 * - 입력의 Date는 이미 `Date`여야 한다(route·⑧의 변환 후).
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §5.1
 */

import type { ExitTaxInput } from "./types/exit-tax.types";
import { calculateExitTax } from "./exit-tax";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

export type ExitTaxInputProblem = {
  message: string;
  /** 점 표기 경로(예: `holdings.f1.departureExchangeRate`) — 엔진이 싣지 않았으면 빈 문자열 */
  path: string;
};

/** 엔진이 입력 결함(`INVALID_INPUT`)으로 거부하면 그 사유, 아니면 null */
export function findExitTaxInputProblem(input: ExitTaxInput): ExitTaxInputProblem | null {
  try {
    calculateExitTax(input);
    return null;
  } catch (err) {
    if (err instanceof TaxCalculationError && err.code === TaxErrorCode.INVALID_INPUT) {
      const path = err.details?.path;
      return { message: err.message, path: typeof path === "string" ? path : "" };
    }
    throw err;
  }
}
