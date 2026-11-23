/**
 * ⑤ 「영위 기간」 입력 미리보기 — **표시 전용**(저장·미러링 없음 · `useMemo`로 호출).
 * 계획서: docs/01-plan/features/nbl-state-history-e3-2-business-period.ui.plan.md §4.2-4
 *
 * 연도별 비율·통과는 엔진 leaf(`evaluateRevenueHistory`)가 만든다 — ⑦ 결과 표·판정과 **같은 함수**라 «입력 화면에서 본 판정 = 결과에서 판정한 것»이 보장된다.
 * 엔진 입력은 ④ 와이어와 같은 평면 레코드(`{ ...asset, ...revenuePeriodWireFields }`)에서 ⑭ 빌더(`buildRevenueTest`·`buildRevenueHistory`)로 만든다 — UI가 비율을 새로 계산하지 않는다.
 * 토글이 꺼졌거나 취득일·양도일·업종을 읽을 수 없으면 `null`.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { buildRevenueHistory } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { buildRevenueTest } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { evaluateRevenueHistory } from "@/lib/tax-engine/non-business-land/revenue-history";
import type { RevenueHistoryEvaluation } from "@/lib/tax-engine/non-business-land/revenue-history";
import { parseRawNumber } from "./non-business-land-request";
import { nblRevenuePeriodOn, revenuePeriodWireFields } from "./nbl-revenue-period-scope";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";

export function buildRevenuePeriodPreview(asset: AssetForm, transferDate: string | undefined): RevenueHistoryEvaluation | null {
  if (!nblRevenuePeriodOn(asset)) return null;
  const acq = toOptionalDate(nblAcquisitionDateOf(asset));
  const transfer = toOptionalDate(transferDate);
  if (!acq || !transfer) return null;
  const flat: Record<string, unknown> = { ...asset, ...revenuePeriodWireFields(asset, transferDate) };
  const rt = buildRevenueTest(flat, "other_land", parseRawNumber, toOptionalDate, transfer, acq);
  const history = buildRevenueHistory(flat, "other_land", parseRawNumber, toOptionalDate);
  if (!rt || !history) return null;
  return evaluateRevenueHistory(history, rt, acq, transfer);
}
