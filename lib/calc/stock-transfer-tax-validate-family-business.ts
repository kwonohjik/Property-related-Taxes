/**
 * ⑧ 주식 양도 — 가업상속공제 자산 의제 취득가액(소득세법 §97의2④) 입력 검증
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.4(⑧) · Q-10
 *
 * 두 단계다.
 *   1. 필수 입력 누락(`stockFbInputGaps`) — 빈칸과 0을 구분해 필드별 사유를 알린다(자동 채움 금지).
 *   2. 공용 술어 — ④ body → `coerceDates` → `buildEngineInput`을 거친 **진짜 엔진 입력**에
 *      `stockFamilyBusinessInputError`를 건다. 엔진 throw · ⑩ refine과 같은 함수라
 *      「UI 통과 ↔ 서버 차단」 모순이 구조적으로 생기지 않는다(선례 `stock-transfer-tax-validate-pre-deemed-lots.ts`).
 *
 * 술어(`allowsStockFamilyBusiness`)를 통과하지 못한 폼은 검증하지 않는다 — 잔존값 inert(계획서 Q-10).
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";
import { buildStockTransferApiBody } from "./stock-transfer-tax-api";
import { isStockFbOn, stockFbInputGaps, stockFbRateEra } from "./stock-family-business";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { stockFamilyBusinessInputError } from "@/lib/tax-engine/stock-transfer/stock-family-business-input-check";

/** 값 관계 오류(분자 > 분모 등)가 가리킬 입력칸 — 양도일 era의 분자 칸 */
function relationErrorField(form: StockTransferFormData): string {
  return stockFbRateEra(form.transferDate) === "corporate_business_assets" ? "fbCorpNonBusinessAssets" : "fbDeductionAmount";
}

export function validateStockFamilyBusiness(form: StockTransferFormData): StockValidationError[] {
  if (!isStockFbOn(form)) return [];

  const gaps = stockFbInputGaps(form);
  if (gaps.length > 0) return gaps.map((g) => ({ field: g.field, message: g.message, severity: "error" as const }));

  let error: string | null;
  try {
    error = stockFamilyBusinessInputError(
      buildEngineInput(coerceDates(buildStockTransferApiBody(form), [...STOCK_DATE_FIELDS])),
    );
  } catch {
    // 입력 도중(날짜 미완성 등) — 각 단계의 필드 오류가 먼저 사유를 보여준다
    return [];
  }
  return error ? [{ field: relationErrorField(form), message: `가업상속공제 — ${error}`, severity: "error" as const }] : [];
}
