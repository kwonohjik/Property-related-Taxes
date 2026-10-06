/**
 * 주식 양도소득세 — 자본조정(무상증자·무상감자) 환산주식수 모듈 (R-2 PR-2 잔여)
 *
 * 법령 근거:
 *   소득세법 §17②2호 단서 가목 — 「상법」 §459① 자본준비금 전입 (의제배당 제외 · 범위 소령 §27④)
 *   소득세법 §17②2호 단서 나목 — 재평가적립금 전입 (의제배당 제외)
 *   소득세법 §17②2호 본문 — 잉여금 자본전입 (의제배당) · §17②1호 — 감자·소각으로 취득하는 금전 등 (의제배당)
 *   소득세법 시행령 §27② — 무상주 1주당 환산 · 양도소득세 집행기준 97-163-10 — 무상감자
 *
 * 분기 매트릭스 (4-state):
 *   bonus_capital_reserve     → 양도세 처리 (단가 희석)     count *= (1 + ratio)
 *   bonus_retained_earnings   → 배당소득 도메인 (skip)
 *   reduction_proportional    → 양도세 처리 (단가 상승)     count *= (1 - ratio)
 *   reduction_capital_return  → 배당소득 도메인 (skip)
 *
 * 원칙: 총 취득원가 불변. 1주당 단가만 변동.
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";

type CapitalAdjustmentType = NonNullable<StockTransferInput["capitalAdjustments"]>[number]["type"];

export interface CapitalAdjustmentApplied {
  type: CapitalAdjustmentType;
  eventDate: Date;
  ratio: number;
  beforeShares: number;
  afterShares: number;
  skipped: boolean;
  reason?: string;
}

export interface CapitalAdjustmentResult {
  baseShareCount: number;
  adjustedShareCount: number;
  baseTotalCost: number;
  /** 환산 후 1주당 단가 = floor(totalCost / adjustedShareCount) */
  adjustedPerShareCost: number;
  applied: CapitalAdjustmentApplied[];
  warnings: string[];
  appliedRules: string[];
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 시계열 자본조정 적용 — 발생일 오름차순 정렬 후 순차 적용.
 *
 * 총 취득원가(`baseTotalCost`)는 불변. 주식수만 변동.
 * 1주당 단가는 마지막에 `floor(totalCost / adjustedShareCount)`로 산정.
 *
 * 양도차익 계산 시 `baseTotalCost`만 사용 (1주당 환산 단가는 표시 전용).
 */
export function adjustShareCountAndCost(
  baseShareCount: number,
  baseTotalCost: number,
  adjustments: NonNullable<StockTransferInput["capitalAdjustments"]>,
): CapitalAdjustmentResult {
  const warnings: string[] = [];
  const appliedRules: string[] = [];
  const applied: CapitalAdjustmentApplied[] = [];

  if (baseShareCount <= 0) {
    return {
      baseShareCount,
      adjustedShareCount: baseShareCount,
      baseTotalCost,
      adjustedPerShareCost: 0,
      applied,
      warnings: ["baseShareCount <= 0 — 자본조정 미적용"],
      appliedRules,
    };
  }

  // 시계열 오름차순 정렬
  const sorted = [...adjustments].sort(
    (a, b) => a.eventDate.getTime() - b.eventDate.getTime(),
  );

  let count = baseShareCount;

  for (const adj of sorted) {
    const before = count;
    let skipped = false;
    let reason: string | undefined;

    switch (adj.type) {
      case "bonus_capital_reserve":
        count = Math.floor(count * (1 + adj.ratio));
        appliedRules.push(STOCK.SECTION_17_2_2_A_PROVISO_CAPITAL_RESERVE);
        appliedRules.push(STOCK.DECREE_27_2_BONUS_PER_SHARE);
        break;
      case "reduction_proportional":
        count = Math.floor(count * (1 - adj.ratio));
        appliedRules.push(`형식감자 (의제배당 비대상) — ${STOCK.EXEC_STANDARD_97_163_10}`);
        break;
      case "bonus_retained_earnings":
        skipped = true;
        reason = "이익잉여금 무상증자 — 의제배당 (소득세법 §17②2호 본문) — 배당소득 도메인에서 별도 처리";
        warnings.push(`${formatDate(adj.eventDate)}: ${reason}`);
        break;
      case "reduction_capital_return":
        skipped = true;
        reason = "자본환급 무상감자 — 의제배당 (소득세법 §17②1호) — 배당소득 도메인에서 별도 처리";
        warnings.push(`${formatDate(adj.eventDate)}: ${reason}`);
        break;
    }

    applied.push({
      type: adj.type,
      eventDate: adj.eventDate,
      ratio: adj.ratio,
      beforeShares: before,
      afterShares: count,
      skipped,
      reason,
    });
  }

  if (count <= 0) {
    warnings.push(`자본조정 적용 후 주식수가 ${count}주 — 입력 비율을 확인하세요.`);
  }

  const adjustedPerShareCost = count > 0 ? Math.floor(baseTotalCost / count) : 0;

  return {
    baseShareCount,
    adjustedShareCount: count,
    baseTotalCost,
    adjustedPerShareCost,
    applied,
    warnings,
    appliedRules,
  };
}
