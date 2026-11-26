/**
 * ⑩ 주식 양도 — 가업상속공제 자산 취득가액 특례(소득세법 §97의2④) cross-field refine
 *
 * 엔진 진입 throw(`stock-family-business.ts`)와 **같은 술어**(`stockFamilyBusinessInputError`)를 부른다 —
 * 3중 일치(엔진 · ⑩ · 다음 PR의 ⑧). 문구는 술어가 정하고 여기서는 접두 `가업상속공제 — `만 붙인다.
 *
 * 매도 lot 배정 결과에 의존하는 검사(가업 lot이 법정량 시대가 다른 양도일의 매도에 배정되는 경우)는
 * 정적으로 알 수 없어 여기에 없다 — 엔진이 throw한다(계획서 §7.7 L-b).
 */

import type { z } from "zod";
import { toOptionalDate } from "./date-coerce";
import {
  stockFamilyBusinessInputError,
  type StockFamilyBusinessCheck,
} from "@/lib/tax-engine/stock-transfer/stock-family-business-input-check";

type FbRefineData = Omit<StockFamilyBusinessCheck, "transferDate"> & { transferDate?: unknown };

export function refineStockFamilyBusiness(data: FbRefineData, ctx: z.RefinementCtx): void {
  const hasFbLot = (data.acquisitionLots ?? []).some((l) => l.familyBusinessInheritance !== undefined);
  if (!data.familyBusinessInheritance && !hasFbLot) return;
  // 날짜 형식 오류는 `requiredDateSchema`·엔진 변환이 사유를 알린다 — 여기서는 시대 검사만 건너뛴다
  const error = stockFamilyBusinessInputError({ ...data, transferDate: toOptionalDate(data.transferDate) });
  if (!error) return;
  ctx.addIssue({
    code: "custom",
    // 단건 축 입력이 없으면 lot 축 오류다
    path: [data.familyBusinessInheritance && !hasFbLot ? "familyBusinessInheritance" : "acquisitionLots"],
    message: `가업상속공제 — ${error}`,
  });
}
