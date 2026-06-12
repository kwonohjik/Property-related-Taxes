/**
 * 분할 매수 모드 — lot별 자본조정(무상증자·형식감자) 전처리 (A-2)
 *
 * 법령:
 *   소득세법 §17②2호 가목 — 자본준비금 자본전입(무상증자) 의제배당 제외 → 양도세 처리(단가 희석)
 *   소득세법 §17②2호 본문 — 잉여금 자본전입(무상증자) 의제배당 → skip(배당소득 도메인)
 *   소득세법 §17②1호 — 자본환급 감자(금전 취득) 의제배당 → skip
 *   양도세 집행기준 97-163-12(국세청 집행기준·법령 아님) — 무상주 1주당 환산·취득시기=원주
 *
 * 단일 모드(stock-capital-adjustments.ts)는 폼 전역에 적용·표시 전용(총원가 불변 → 차익 무영향).
 * 분할 모드는 **발생일 이전 보유 lot만** 희석 → 매칭(allocateLots)·차익에 반영.
 *
 * 각 lot 총취득원가 불변. 보유기간(§104②)은 lot.acquisitionDate 보존으로 원주 통산.
 */

import type { StockTransferInput, AcquisitionLot } from "./types/stock-transfer.types";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

type CapitalAdjustment = NonNullable<StockTransferInput["capitalAdjustments"]>[number];

export interface LotCapitalAdjustmentDetail {
  lotId?: string;
  beforeShares: number;
  afterShares: number;
  /** lot 총취득원가 (불변) */
  baseTotalCost: number;
  /** 환산 후 1주당 단가 = floor(baseTotalCost / afterShares) */
  adjustedPerShareCost: number;
  /** 적용된(skip 아닌) 조정 유형 */
  appliedTypes: CapitalAdjustment["type"][];
  /** skip 사유 (의제배당·발생일≤취득일) */
  skippedReasons: string[];
}

export interface LotCapitalAdjustmentsResult {
  adjustedLots: AcquisitionLot[];
  /** 전 lot 포함 (무영향 lot은 before==after) */
  perLotApplied: LotCapitalAdjustmentDetail[];
  warnings: string[];
  appliedRules: string[];
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * lot별 자본조정 적용 — 발생일 이전 보유 lot만 시계열 순차 희석.
 *
 * @param lots 매수 lot 배열
 * @param adjustments 자본조정 이벤트 (종목 전체 — 폼 전역)
 */
export function applyCapitalAdjustmentsToLots(
  lots: AcquisitionLot[],
  adjustments: CapitalAdjustment[],
): LotCapitalAdjustmentsResult {
  const warnings: string[] = [];
  const appliedRules: string[] = [];
  const perLotApplied: LotCapitalAdjustmentDetail[] = [];

  // 시계열 오름차순 정렬
  const sorted = [...adjustments].sort(
    (a, b) => a.eventDate.getTime() - b.eventDate.getTime(),
  );

  const adjustedLots = lots.map((lot) => {
    const baseTotalCost = lot.shareCount * lot.perShareAcquisitionPrice; // 불변 기준
    let shares = lot.shareCount;
    const appliedTypes: CapitalAdjustment["type"][] = [];
    const skippedReasons: string[] = [];

    for (const adj of sorted) {
      // ★ 경계 `>`: 발생일 이후 취득 lot은 이미 증자 후 주식 매입 → 미적용
      if (adj.eventDate.getTime() <= lot.acquisitionDate.getTime()) {
        const reason = `${formatDate(adj.eventDate)}: 발생일 ≤ 매수 lot 취득일 — 종전 보유자에게만 영향 (미적용)`;
        skippedReasons.push(reason);
        continue;
      }
      switch (adj.type) {
        case "bonus_capital_reserve":
          shares = Math.floor(shares * (1 + adj.ratio));
          appliedTypes.push(adj.type);
          if (!appliedRules.includes(STOCK.SECTION_17_2_2_A_PROVISO_CAPITAL_RESERVE))
            appliedRules.push(STOCK.SECTION_17_2_2_A_PROVISO_CAPITAL_RESERVE);
          if (!appliedRules.includes(STOCK.EXEC_STANDARD_97_163_12))
            appliedRules.push(STOCK.EXEC_STANDARD_97_163_12);
          break;
        case "reduction_proportional":
          shares = Math.floor(shares * (1 - adj.ratio));
          appliedTypes.push(adj.type);
          if (!appliedRules.includes(STOCK.EXEC_STANDARD_97_163_12))
            appliedRules.push(STOCK.EXEC_STANDARD_97_163_12);
          break;
        case "bonus_retained_earnings": {
          const reason = `${formatDate(adj.eventDate)}: 이익잉여금 무상증자 — 의제배당 (소득세법 §17②2호 본문) — 배당소득 도메인 별도 처리`;
          skippedReasons.push(reason);
          warnings.push(reason);
          break;
        }
        case "reduction_capital_return": {
          const reason = `${formatDate(adj.eventDate)}: 자본환급 무상감자 — 의제배당 (소득세법 §17②1호) — 배당소득 도메인 별도 처리`;
          skippedReasons.push(reason);
          warnings.push(reason);
          break;
        }
      }
    }

    if (shares <= 0) {
      warnings.push(
        `매수 lot(${lot.id ?? "?"}) 자본조정 후 주식수 ${shares}주 — 비율을 확인하세요.`,
      );
    }

    const adjustedPerShareCost = shares > 0 ? Math.floor(baseTotalCost / shares) : 0;

    perLotApplied.push({
      lotId: lot.id,
      beforeShares: lot.shareCount,
      afterShares: shares,
      baseTotalCost,
      adjustedPerShareCost,
      appliedTypes,
      skippedReasons,
    });

    if (shares === lot.shareCount && appliedTypes.length === 0) {
      // 무영향 lot — 원본 그대로
      return lot;
    }
    return {
      ...lot,
      shareCount: shares,
      perShareAcquisitionPrice: adjustedPerShareCost,
    };
  });

  return { adjustedLots, perLotApplied, warnings, appliedRules };
}
