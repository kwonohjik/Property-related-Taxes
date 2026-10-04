/**
 * ④ 의제취득일 전 매수 — 영 §176의2④ ② 입력 전송 (Z-1)
 *
 * 해당할 때만 싣는다 — stale 값(취득일을 바꾸기 전에 입력한 칸)이 의제 대상이 아닌 계산에 흘러가지 않게 한다.
 * `stock-transfer-tax-api.ts`가 750줄 위험구간이라 형제 파일로 분리했다(`-carryover.ts`와 같은 패턴).
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isBeforePpiSeries } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import { isPreDeemedPurchaseForm } from "./stock-transfer-section94-4-form";
import { parseFloatOrUndef } from "./stock-transfer-tax-api-parse";

export function appendPreDeemedBody(body: Record<string, unknown>, form: StockTransferFormData): void {
  if (!isPreDeemedPurchaseForm(form)) return;
  // 환산·매매사례 모드에서 ②를 함께 견주는 실가 — 실가 모드는 기존 실가 입력이 ②의 기준이다
  if ((form.acquisitionMode || "actual") !== "actual") {
    const actual = parseFloatOrUndef(form.preDeemedActualPricePerShare);
    if (actual !== undefined && actual > 0) body.preDeemedActualPricePerShare = actual;
  }
  // 1965.01 이전 취득 — PPI 계열 밖이라 직접 입력 배율(계획서 Q-4)
  if (isBeforePpiSeries(form.acquisitionDate)) {
    const ratio = parseFloatOrUndef(form.preDeemedPpiRatio);
    if (ratio !== undefined && ratio > 0) body.preDeemedPpiRatio = ratio;
  }
}
