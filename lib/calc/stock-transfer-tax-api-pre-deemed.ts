/**
 * ④ 의제취득일 전 매수 — 영 §176의2④ ② 입력 전송 (Z-1)
 *
 * 해당할 때만 싣는다 — stale 값(취득일을 바꾸기 전에 입력한 칸)이 의제 대상이 아닌 계산에 흘러가지 않게 한다.
 * `stock-transfer-tax-api.ts`가 750줄 위험구간이라 형제 파일로 분리했다(`-carryover.ts`와 같은 패턴).
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isBeforePpiSeries } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import { isPreDeemedLotClause1On, isPreDeemedPurchaseForm } from "./stock-transfer-section94-4-form";
import { parseFloatOrUndef, parseIntOrUndef } from "./stock-transfer-tax-api-parse";

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

/**
 * ④ 분할·다건 lot — 의제취득일 전 매수 ① 비교 입력 전송 (영 §176의2④1호 · 계획서 stock-lot-pre-deemed-clause1)
 *
 * 게이트(해당할 때만 — stale 값이 흘러가지 않게): lot 모드 ∧ ① 방식 선택 ∧ 의제 대상 lot ≥ 1.
 * 방식이 estimated 이면 의제취득일 종가평균(`acquisitionDatePriceAvg1Month`)과 매도 lot별 양도 당시 기준시가를,
 * sale_case 이면 매매사례가·사례일과 개산공제 base(취득측 순손익·순자산)를 싣는다.
 * ⚠️ `body.transferLots` 가 이미 만들어진 **뒤에** 불러야 한다(분할은 본체 끝, lots-only 는 합성 매도 lot 1건).
 */
export function appendPreDeemedLotClause1Body(body: Record<string, unknown>, form: StockTransferFormData): void {
  if (!isPreDeemedLotClause1On(form)) return;
  const mode = form.preDeemedLotClause1Mode as "estimated" | "sale_case";
  body.preDeemedLotClause1 = mode;

  if (mode === "estimated") {
    const deemedStd = parseIntOrUndef(form.acquisitionDatePriceAvg1Month);
    if (deemedStd !== undefined) body.acquisitionDatePriceAvg1Month = deemedStd;
    const trns = body.transferLots as Record<string, unknown>[] | undefined;
    if (!trns) return;
    if (form.lotsMode === "split") {
      form.transferLots.forEach((l, i) => {
        const std = parseFloatOrUndef(l.transferStdPricePerShare ?? "");
        if (std !== undefined && trns[i]) trns[i].transferStdPricePerShare = std;
      });
    } else {
      // lots-only — 합성 매도 lot 1건에 폼 전역 양도 당시 기준시가를 싣는다(별도 입력 없음)
      const std = parseFloatOrUndef(form.transferDatePriceAvg1Month);
      if (std !== undefined && trns[0]) trns[0].transferStdPricePerShare = std;
    }
    return;
  }

  const sample = parseIntOrUndef(form.acquisitionMarketSamplePrice);
  if (sample !== undefined) body.acquisitionMarketSamplePrice = sample;
  if (form.acquisitionMarketSampleDate) body.acquisitionMarketSampleDate = form.acquisitionMarketSampleDate;
  // 개산공제 base — 의제취득일 현재 §165④ 보충평가(취득측 순손익·순자산 직접 입력)
  const ni = parseFloatOrUndef(form.acquisitionYearNetIncomePerShare);
  const na = parseFloatOrUndef(form.acquisitionYearNetAssetPerShare);
  if (ni !== undefined) body.acquisitionYearNetIncomePerShare = ni;
  if (na !== undefined) body.acquisitionYearNetAssetPerShare = na;
}
