/**
 * 분할 매수·분할 양도 — 결과 도착 전 **양도가액·취득가액 미리보기** (⑤ Step2 · ⑥ 사이드바 공용)
 *
 * 종전 사이드바는 `Σ(전 매수 lot 단가 × 수량)`을 「취득가액」으로 보여줬다 — 매도 수량·산정방법을
 * 무시하고 **팔지 않은 잔량의 원가까지** 더했다(계획서 `stock-split-lots-ui-bugfix.plan.md` D-3).
 *
 * 🔑 매칭을 여기서 다시 구현하지 않는다(single-source-engine-helper). 엔진 경로와 **같은 함수**를
 *    같은 순서로 부른다: ④ body → 날짜 강제 → ⑭ 엔진 input → 의제취득일 전 매수 lot ② → 자본조정 lot 희석 → `allocateLots`
 *    (`stock-transfer-tax.ts`의 split 분기와 동일). ⑫ Zod 는 거치지 않는다 — 입력 도중의 미리보기라
 *    검증 오류는 각 단계 validate 가 따로 보여준다.
 *
 * 입력이 덜 채워졌으면 `null` — 0원이나 부분 합계를 「취득가액」으로 보여주지 않는다.
 */

import { buildStockTransferApiBody } from "./stock-transfer-tax-api";
import { isSplitLotsMode } from "./stock-transfer-input-mode";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { allocateLots } from "@/lib/tax-engine/stock-transfer/lot-allocation";
import { applyCapitalAdjustmentsToLots } from "@/lib/tax-engine/stock-transfer/lot-capital-adjustments";
import { applyPreDeemedToLots } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import { buildPreDeemedLotClause1Context } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1";
import { isLotsModeForm, isSection94_4Form } from "./stock-transfer-section94-4-form";
import type { LotMatchingDetail } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

const toInt = (v: string | undefined) => parseInt((v ?? "").replace(/,/g, ""), 10) || 0;
const isFullDate = (v: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");

function isSplitInputComplete(form: StockTransferFormData): boolean {
  if (form.acquisitionLots.length === 0 || form.transferLots.length === 0) return false;
  const acqOk = form.acquisitionLots.every(
    (l) => isFullDate(l.acquisitionDate) && toInt(l.shareCount) > 0 && toInt(l.perShareAcquisitionPrice) > 0,
  );
  const trnOk = form.transferLots.every(
    (l) => isFullDate(l.transferDate) && toInt(l.shareCount) > 0 && toInt(l.perShareTransferPrice) > 0,
  );
  return acqOk && trnOk;
}

/**
 * 분할 양도가 아닌 lots-only(단일 양도 · 다건 취득) — 합성 매도 lot 1건의 입력이 다 찼는가.
 * 합성 매도 lot 은 ④ 가 폼 전역 양도 정보로 만든다(`stock-transfer-tax-api.ts` 합성 transferLots).
 */
function isLotsOnlyInputComplete(form: StockTransferFormData): boolean {
  if (form.acquisitionLots.length === 0) return false;
  const acqOk = form.acquisitionLots.every(
    (l) => isFullDate(l.acquisitionDate) && toInt(l.shareCount) > 0 && toInt(l.perShareAcquisitionPrice) > 0,
  );
  const priceOk =
    (form.transferActualInputMode || "total") === "total"
      ? toInt(form.transferTotalPrice) > 0
      : toInt(form.perShareTransferPrice) > 0;
  return acqOk && isFullDate(form.transferDate) && toInt(form.shareCount) > 0 && priceOk;
}

export function previewSplitAllocation(form: StockTransferFormData): LotMatchingDetail | null {
  // 분할 양도 + lots-only(다건 취득) 둘 다 같은 엔진 매칭을 쓴다 — 사이드바의 lots-only 가중평균 근사를 대체한다
  if (!isLotsModeForm(form)) return null;
  if (!(isSplitLotsMode(form) ? isSplitInputComplete(form) : isLotsOnlyInputComplete(form))) return null;

  let detail: LotMatchingDetail;
  try {
    const coerced = coerceDates(buildStockTransferApiBody(form), [...STOCK_DATE_FIELDS]);
    const input = buildEngineInput(coerced);
    // 엔진 split 분기와 같은 순서 — 의제취득일 전 매수 lot ②(영 §176의2④2호) + ① ctx → 자본조정 희석
    const is94_4 = isSection94_4Form(form);
    const clause1 = buildPreDeemedLotClause1Context(input, is94_4);
    const preDeemed = applyPreDeemedToLots(input.acquisitionLots ?? [], input.marketType, is94_4, clause1.ctx !== undefined);
    let lots = preDeemed.lots;
    if (input.capitalAdjustments && input.capitalAdjustments.length > 0) {
      lots = applyCapitalAdjustmentsToLots(lots, input.capitalAdjustments).adjustedLots;
    }
    detail = allocateLots(
      lots,
      input.transferLots ?? [],
      input.costAllocationMethod ?? "fifo",
      // 단기 30% 게이트는 sub-lot 세율만 가른다 — 양도가액·취득가액 합계와 무관하다
      false,
      input.isSmallMediumEnterprise,
      input.specificMatchings,
      preDeemed.applied ? clause1.ctx : undefined,
    );
  } catch {
    // 보조 입력(상속 피상속인 취득일 등)의 날짜가 입력 도중이면 강제 변환이 실패한다
    return null;
  }

  // 매도 수량 전부가 매칭됐을 때만 — 개별법 배정이 덜 됐거나 매도 > 보유면 부분 합계다
  const soldShares = detail.matched.reduce((s, m) => s + m.buyShares, 0);
  const transferShares = isSplitLotsMode(form)
    ? form.transferLots.reduce((s, l) => s + toInt(l.shareCount), 0)
    : toInt(form.shareCount);
  if (detail.matched.length === 0 || soldShares !== transferShares) return null;
  return detail;
}
