/**
 * 분할·다건 lot 의제취득일 전 매수 — 결과 echo(`preDeemedLotsDetail`) · 안내 문구 조립
 *
 * `stock-transfer-tax.ts`(800줄 정책 — 750줄 위험구간)가 커지지 않도록 조립만 떼어냈다.
 * 값은 전부 엔진이 계산한 것의 echo 다 — 화면이 matched[] 에서 역산하지 않게 한다.
 */

import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import { stockDeemedAcquisitionDate } from "./stock-deemed-acquisition-date";
import type { PreDeemedLotSettlement } from "./stock-pre-deemed-lot-clause1";
import type { LotMatchingDetail, StockTransferResult } from "./types/stock-transfer.types";

type Detail = NonNullable<StockTransferResult["preDeemedLotsDetail"]>;

const n = (v: number) => v.toLocaleString("ko-KR");

export function buildPreDeemedLotsDetail(args: {
  is94_4: boolean;
  lots: Detail["lots"];
  summary: LotMatchingDetail["preDeemedClause1Summary"];
  settlement: PreDeemedLotSettlement | undefined;
}): { detail?: Detail; warnings: string[] } {
  const { is94_4, lots, summary, settlement } = args;
  if (lots.length === 0) return { warnings: [] };

  const detail: Detail = {
    deemedDate: stockDeemedAcquisitionDate(is94_4),
    lots,
    ...(summary
      ? {
          clause1: {
            method: summary.method,
            deemedStdPerShare: summary.deemedStdPerShare,
            soldShares: summary.soldShares,
            clause1Shares: summary.clause1Shares,
            otherShares: summary.otherShares,
            clause1Amount: summary.clause1Amount,
            ...(summary.unresolvedShares !== undefined ? { unresolvedShares: summary.unresolvedShares } : {}),
            pooled: summary.pooled,
            ...(settlement ? { settlement } : {}),
          },
        }
      : {}),
  };

  // 단위는 문장 머리에 한 번만(feedback_no_won_suffix)
  const tag = `${STOCK.ENFORCEMENT_DECREE_176_2_4_PRE_DEEMED}1호`;
  const warnings: string[] = [];
  if (summary?.unresolvedShares) {
    warnings.push(
      `${tag} — 양도 당시 기준시가가 없어 ① 환산을 산정하지 못한 매도 ${n(Math.floor(summary.unresolvedShares))}주는 ② 취득 당시 실가 + 생산자물가상승분으로 계산했습니다.`,
    );
  }
  if (summary?.pooled) {
    warnings.push(
      `${tag} — 이동평균법은 ① 환산이 매도 건마다 달라 풀 평균 단가가 매도마다 달라질 수 있고, ① 채택분은 매도분이 풀을 소진하는 비율로 안분했습니다(주식수 소수 가능).`,
    );
  }
  if (summary && summary.clause1Shares > 0 && settlement) {
    warnings.push(
      `${tag} — ① 의제취득일 현재 가액 채택 ${n(Math.floor(summary.clause1Shares))}주 / 매도 ${n(summary.soldShares)}주(단위: 원): ` +
        `필요경비는 ① 채택분은 개산공제(의제취득일 기준시가 ${n(settlement.estimatedBase)} × 1% = ${n(settlement.estimatedDeduction)} — ${STOCK.ENFORCEMENT_DECREE_163_6_4_ESTIMATED_EXPENSE}), ` +
        `그 외는 실비(자본적지출·양도비 ${n(settlement.otherSideActual)})입니다. ` +
        `입력 실비 ${n(settlement.totalActualExpenses)}는 양도 주식수 비례로 귀속했습니다(귀속 기준에 대한 법령상 명문은 없습니다).`,
    );
    if (settlement.swapApplied) {
      warnings.push(
        `§97②2호 단서 적용 — ① 채택분의 (환산취득가액 + 개산공제) ${n(settlement.swapComparison?.estimatedSide ?? 0)}보다 ` +
          `귀속 실비 ${n(settlement.clause1SideActual)}가 커 후자를 필요경비로 합니다. 해당 환산취득가액 ${n(settlement.swapRemovedAcquisition)}은 양도차익 계산에서 차감되지 않습니다.`,
      );
    }
  }
  return { detail, warnings };
}
