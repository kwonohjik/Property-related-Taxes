/**
 * 세부담 시뮬레이션(D3c · D8) — 순수 함수(계획서 `multi-house-surcharge-judgment-menu.plan.md` §4.7 · P8).
 *
 * 실제 엔진(`calculateTransferTax`)을 두 번 부른다(T4 — 근사 산식 `buildMultiHouseTaxSimulation`은 쓰지 않는다):
 * - A = 판정과 같은 엔진 입력 + 취득가액·필요경비
 * - B = A 입력 + `forceNoMultiHouseSurcharge: true` — 중과가 애초에 없는 세대 구성의 세액(T3 · 술어 최상단 게이트)
 *
 * 지원 범위(D8)는 매매로 취득한 주택을 실지거래가액으로 계산하는 경우다. 취득 원인은 화면이 막는다(`surchargeSimulationUnsupportedReason`) —
 * 판정 본문은 상속·증여 사실이 다 갖춰졌을 때만 원인을 실으므로, 여기서는 본문에 보이는 원인과 자산 종류만 다시 확인한다.
 * 연간 기본공제는 이 양도에 처음 쓰는 것으로 본다(판정 본문 `annualBasicDeductionUsed: 0`).
 */
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer-result.types";

export interface SurchargeSimulationInput {
  acquisitionPrice: number;
  /** 필요경비 합계(자본적지출액 + 양도비) */
  expenses: number;
}

/** 한쪽(A 또는 B)의 세액 — 엔진 결과 그대로 옮긴다(화면은 다시 계산하지 않는다) */
export interface SurchargeSimulationSide {
  /** 전액 비과세(§89①3호) — 세액 0 */
  isExempt: boolean;
  transferGain: number;
  longTermHoldingDeduction: number;
  longTermHoldingRate: number;
  basicDeduction: number;
  taxBase: number;
  /** 적용 세율(가산 포함) */
  appliedRate: number;
  /** 가산 세율 — 더하지 않았으면 null */
  surchargeRate: number | null;
  calculatedTax: number;
  reductionAmount: number;
  localIncomeTax: number;
  totalTax: number;
}

export type SurchargeSimulation =
  | {
      status: "computed";
      withSurcharge: SurchargeSimulationSide;
      withoutSurcharge: SurchargeSimulationSide;
      /** A − B (총 납부세액) */
      difference: number;
    }
  | { status: "unsupported"; reason: "not_purchase_housing" };

function sideOf(r: TransferTaxResult): SurchargeSimulationSide {
  return {
    isExempt: r.isExempt,
    transferGain: r.transferGain,
    longTermHoldingDeduction: r.longTermHoldingDeduction,
    longTermHoldingRate: r.longTermHoldingRate,
    basicDeduction: r.basicDeduction,
    taxBase: r.taxBase,
    appliedRate: r.appliedRate,
    surchargeRate: r.surchargeRate ? r.surchargeRate : null,
    calculatedTax: r.calculatedTax,
    reductionAmount: r.reductionAmount,
    localIncomeTax: r.localIncomeTax,
    totalTax: r.totalTax,
  };
}

export function runSurchargeSimulation(
  engineInput: TransferTaxInput,
  rates: TaxRatesMap,
  sim: SurchargeSimulationInput,
): SurchargeSimulation {
  if (engineInput.propertyType !== "housing" || (engineInput.acquisitionCause ?? "purchase") !== "purchase") {
    return { status: "unsupported", reason: "not_purchase_housing" };
  }
  const input: TransferTaxInput = {
    ...engineInput,
    acquisitionPrice: sim.acquisitionPrice,
    expenses: sim.expenses,
    useEstimatedAcquisition: false,
  };
  const a = calculateTransferTax(input, rates);
  const b = calculateTransferTax({ ...input, forceNoMultiHouseSurcharge: true }, rates);
  return {
    status: "computed",
    withSurcharge: sideOf(a),
    withoutSurcharge: sideOf(b),
    difference: a.totalTax - b.totalTax,
  };
}
