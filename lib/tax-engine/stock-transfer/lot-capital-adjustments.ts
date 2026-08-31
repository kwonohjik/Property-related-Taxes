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
  /**
   * §97의2①1호 이월과세 lot의 **증여자** 총취득원가 (불변).
   * `donorAcquisitionPrice`가 있는 lot에서만 채워진다 — 매칭이 실제로 쓰는 단가가 이쪽이라
   * 위 `baseTotalCost`(수증 당시 평가액 기준)만 표시하면 화면과 계산이 갈린다.
   */
  donorBaseTotalCost?: number;
  /** 환산 후 증여자 1주당 단가 = floor(donorBaseTotalCost / afterShares) */
  adjustedDonorPerShareCost?: number;
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

    /**
     * §97의2①1호 승계 단가도 **같은 희석**을 받는다.
     *
     * 매칭 3종은 이월과세 lot의 1주당 단가로 `resolveLotAcquisitionPrice`(= `donorAcquisitionPrice`)를
     * 쓴다. 주식수만 늘리고 이 값을 그대로 두면 「희석 후 주식수 × 희석 전 증여자 단가」가 되어
     * 증여자 총취득원가가 배율만큼 어긋난다 — 무상증자는 과소, 형식감자는 과대(불리)로 갈린다.
     * 집행기준 97-163-12의 「총취득원가 불변」은 승계 원가에도 그대로 적용된다.
     *
     * `donorGiftTaxableValue`·`donorCapitalExpenditure`는 **총액** 필드라 대상이 아니다
     * (`accrueLotCarryoverExpense`가 `matchedShares / lot.shareCount`로 안분하므로 불변).
     */
    const donorBaseTotalCost =
      lot.donorAcquisitionPrice !== undefined
        ? lot.shareCount * lot.donorAcquisitionPrice
        : undefined;
    const adjustedDonorPerShareCost =
      donorBaseTotalCost !== undefined
        ? shares > 0
          ? Math.floor(donorBaseTotalCost / shares)
          : 0
        : undefined;

    perLotApplied.push({
      lotId: lot.id,
      beforeShares: lot.shareCount,
      afterShares: shares,
      baseTotalCost,
      adjustedPerShareCost,
      donorBaseTotalCost,
      adjustedDonorPerShareCost,
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
      ...(adjustedDonorPerShareCost !== undefined
        ? { donorAcquisitionPrice: adjustedDonorPerShareCost }
        : {}),
    };
  });

  return { adjustedLots, perLotApplied, warnings, appliedRules };
}
