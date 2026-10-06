/**
 * 분할·다건 lot ① 비교 입력 검증 — ⑧ validate(step2) 와 ⑫ Zod refine 이 **같은 함수**를 쓴다
 * (UI 통과 ↔ validate 차단 모순 금지 · feedback_validation_sync_8th_point).
 *
 * 입력은 엔진 입력(`StockTransferInput` — 날짜는 Date)이다. 호출 쪽 어댑터가 폼/body 를 같은 경로
 * (`buildEngineInput(coerceDates(...))`)로 변환해 넘긴다. 엔진 ctx 빌더가 «②만 적용»으로 떨어뜨리는 모든 사유를
 * 여기서는 **오류**로 막는다(조용히 ②만 계산되는 것이 아니라 사용자가 알게 한다 — 자동 fallback 금지).
 *
 * 「어느 매도 lot 에 양도 당시 기준시가가 필요한가」는 매칭 결과에 달려 있다 — 의제 lot 을 소진하는 매도 lot 만 필요하다.
 * 매칭을 다시 구현하지 않고 `allocateLots` 에 «호출 기록용 ctx» 를 넘겨 의제 lot 과 만난 매도 lot 을 모은다(single-source).
 */

import { allocateLots } from "./lot-allocation";
import { applyPreDeemedToLots } from "./stock-pre-deemed-acquisition";
import {
  isLotClause1MethodAllowed,
  PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE,
  PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE,
  PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE,
} from "./stock-pre-deemed-lot-clause1";
import { calcAcquisitionStdPerShareSupplementary } from "./stock-valuation-unlisted-single-side";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import type { StockTransferInput, TransferLot } from "./types/stock-transfer.types";

export type LotClause1IssueField =
  | "preDeemedLotClause1"
  | "acquisitionDatePriceAvg1Month"
  | "acquisitionMarketSamplePrice"
  | "acquisitionYearNetAssetPerShare"
  | "transferStdPricePerShare";

export interface LotClause1Issue {
  field: LotClause1IssueField;
  message: string;
  /** field === "transferStdPricePerShare" 일 때 — 입력 순서 매도 lot 인덱스 */
  transferLotIndex?: number;
}

export const PRE_DEEMED_LOT_DEEMED_STD_REQUIRED_MESSAGE =
  `① 환산취득가액 — 의제취득일 이전 1개월 종가평균(1주당)을 입력하세요 (소득세법 시행령 §176의2②1호 · §165③)`;
export const PRE_DEEMED_LOT_SAMPLE_REQUIRED_MESSAGE =
  `① 매매사례가액 — 의제취득일 전후 3개월 이내 매매사례 1주당 가액을 입력하세요 (${STOCK.ENFORCEMENT_DECREE_176_2_3_1_MARKET_SAMPLE})`;
export const PRE_DEEMED_LOT_SAMPLE_STD_REQUIRED_MESSAGE =
  `① 매매사례가액 — 개산공제의 기준인 의제취득일 현재 1주당 기준시가가 필요합니다. 취득측 순손익·순자산가치를 입력하세요 (${STOCK.ENFORCEMENT_DECREE_163_6_4_ESTIMATED_EXPENSE} · §165④)`;
export const preDeemedLotTransferStdMessage = (n: number): string =>
  `① 환산취득가액 — 매도 #${n}의 양도일 이전 1개월 종가평균(1주당 양도 당시 기준시가)을 입력하세요 (소득세법 시행령 §176의2②1호 · §165③)`;

/**
 * 의제 lot 을 소진하는 매도 lot 을 입력 순서 인덱스로 돌려준다 — 매칭은 엔진 `allocateLots` 그대로(호출 기록 ctx).
 * 자본조정이 있으면 희석 전 주식수라 매칭 단위가 갈려 호출 쪽에서 이미 차단한다(여기서는 희석하지 않는다).
 */
export function transferLotsTouchingPreDeemedLots(input: StockTransferInput, is94_4: boolean): number[] {
  const trns = input.transferLots ?? [];
  const lots = input.acquisitionLots ?? [];
  if (lots.length === 0 || trns.length === 0 || !input.costAllocationMethod) return [];
  const pre = applyPreDeemedToLots(lots, input.marketType, is94_4, true);
  if (!pre.applied) return [];
  const touched = new Set<TransferLot>();
  allocateLots(
    pre.lots,
    trns,
    input.costAllocationMethod,
    false,
    input.isSmallMediumEnterprise,
    input.specificMatchings,
    {
      method: "estimated",
      deemedStdPerShare: 1,
      clause1PerShare: (trn) => {
        touched.add(trn);
        return 1;
      },
    },
  );
  return trns.map((t, i) => (touched.has(t) ? i : -1)).filter((i) => i >= 0);
}

/** ①이 꺼져 있거나(미선택) 의제 lot 이 없으면 빈 배열 */
export function checkPreDeemedLotClause1(input: StockTransferInput, is94_4: boolean): LotClause1Issue[] {
  const method = input.preDeemedLotClause1;
  if (!method) return [];
  const lots = input.acquisitionLots ?? [];
  // 의제 대상 lot 이 없으면 비교할 것이 없다 — 오류가 아니다(④ 는 이 경우 싣지 않는다)
  const hasPreDeemed = applyPreDeemedToLots(lots, input.marketType, is94_4, true).applied;
  if (!hasPreDeemed) return [];

  const issues: LotClause1Issue[] = [];
  if (input.capitalAdjustments && input.capitalAdjustments.length > 0) {
    issues.push({ field: "preDeemedLotClause1", message: PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE });
    return issues;
  }
  const allowed = isLotClause1MethodAllowed(input.marketType, method);
  if (allowed === "unlisted_estimated") {
    issues.push({ field: "preDeemedLotClause1", message: PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE });
    return issues;
  }
  if (allowed === "listed_sale_case") {
    issues.push({ field: "preDeemedLotClause1", message: PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE });
    return issues;
  }

  if (method === "estimated") {
    if (!(Math.floor(input.acquisitionDatePriceAvg1Month ?? 0) > 0)) {
      issues.push({ field: "acquisitionDatePriceAvg1Month", message: PRE_DEEMED_LOT_DEEMED_STD_REQUIRED_MESSAGE });
    }
    const trns = input.transferLots ?? [];
    for (const i of transferLotsTouchingPreDeemedLots(input, is94_4)) {
      if (!(Math.floor(trns[i].transferStdPricePerShare ?? 0) > 0)) {
        issues.push({ field: "transferStdPricePerShare", message: preDeemedLotTransferStdMessage(i + 1), transferLotIndex: i });
      }
    }
    return issues;
  }

  // sale_case
  if (!(Math.floor(input.acquisitionMarketSamplePrice ?? 0) > 0)) {
    issues.push({ field: "acquisitionMarketSamplePrice", message: PRE_DEEMED_LOT_SAMPLE_REQUIRED_MESSAGE });
  }
  if (!(calcAcquisitionStdPerShareSupplementary(input).perShare > 0)) {
    issues.push({ field: "acquisitionYearNetAssetPerShare", message: PRE_DEEMED_LOT_SAMPLE_STD_REQUIRED_MESSAGE });
  }
  return issues;
}
