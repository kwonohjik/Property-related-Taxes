/**
 * 환산취득가액 부동소수 1원 과소 — 자산 전체 이월과세(S2)·다건 표시 fallback(S5) anchor (2026-10-21)
 *
 * 계획: docs/00-pm/estimated-acquisition-float-precision.plan.md §2(P 모양)·§3(#2·#18)
 *
 * 옛 식 `Math.floor(a * b / c)`는 `a * b`가 `Number.MAX_SAFE_INTEGER`를 넘으면 곱 자체가 반올림돼
 * 참값이 정수일 때 1원 과소가 난다. 기대값은 BigInt 정수 나눗셈의 참값이다.
 *   · S2  1,879,616,249 × 678,235,448 ÷ 738,389,368 = 1,726,490,689  (옛 식 1,726,490,688 — 곱 1.27×10^18 > 2^53)
 *   · S5  S2와 같은 입력(양도가 × 취득시 ÷ 양도시) — 표시 fallback도 1,726,490,689 (옛 식 1,726,490,688)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveDisplayAcquisitionAndExpense } from "@/lib/tax-engine/transfer-tax-aggregate-display-echo";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const exact = (a: number, b: number, c: number) => Number((BigInt(a) * BigInt(b)) / BigInt(c));

describe("참값 검산", () => {
  it("S2·S5 입력의 옛 식과 참값", () => {
    expect(exact(1_879_616_249, 678_235_448, 738_389_368)).toBe(1_726_490_689);
    expect(Math.floor((1_879_616_249 * 678_235_448) / 738_389_368)).toBe(1_726_490_688); // 옛 식 — 전제 고정
    expect(1_879_616_249 * 678_235_448).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
  });
});

describe("S2 자산 전체 이월과세 × 기준시가 직접 입력 환산 (transfer-tax-carryover.ts)", () => {
  function carryoverInput(): TransferTaxInput {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_879_616_249,
      transferDate: new Date("2025-06-30"),
      acquisitionDate: new Date("2023-01-10"),
      acquisitionPrice: 0,
      acquisitionCause: "carryover_gift",
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 678_235_448,
      standardPriceAtTransfer: 738_389_368,
      isOneHousehold: false,
      householdHousingCount: 2,
      carryoverTaxation: {
        giftRegistryDate: new Date("2023-01-10"),
        donorAcquisitionDate: new Date("2010-05-21"),
        useEstimatedAcquisition: true,
        giftTaxAmount: 30_000_000,
        giftDateValuation: 1_000_000_000,
      },
    } as Partial<TransferTaxInput>);
  }

  it("시나리오 A 증여자 환산취득가액 = 1,726,490,689 (옛 1,726,490,688)", () => {
    const d = calculateTransferTax(carryoverInput(), rates).carryoverTaxationDetail!;
    expect(d.scenarioA.acquisitionPrice).toBe(1_726_490_689);
    // 환산 근거 echo는 입력 그대로다 — 값만 정확해진다.
    expect(d.scenarioA.estimatedStdPriceAtAcquisition).toBe(678_235_448);
    expect(d.scenarioA.estimatedStdPriceAtTransfer).toBe(738_389_368);
  });

  it("시나리오 A 양도차익은 참값 취득가액과 정합한다 (양도가 − 취득가 − 개산공제 − 증여세 상당액) — 양도차익 경로는 이미 정본 헬퍼라 수정 전에도 통과", () => {
    const d = calculateTransferTax(carryoverInput(), rates).carryoverTaxationDetail!;
    const lump = Math.floor((678_235_448 * 3) / 100); // 개산공제 3% (§163⑥)
    expect(d.scenarioA.transferGain).toBe(1_879_616_249 - 1_726_490_689 - lump - d.scenarioA.giftTaxAddedToExpense);
  });
});

describe("S5 다건 합산 표시 fallback (estimatedBase 부재 시) — resolveDisplayAcquisitionAndExpense", () => {
  const singleInput = baseTransferInput({
    propertyType: "land",
    transferPrice: 1_879_616_249,
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 678_235_448,
    standardPriceAtTransfer: 738_389_368,
  } as Partial<TransferTaxInput>);

  it("estimatedBase가 없으면 환산 재산식으로 표시한다 — 1,726,490,689 (옛 1,726,490,688)", () => {
    const result = {
      usedEstimatedAcquisition: true,
      estimatedBase: undefined,
      transferGain: 100_000_000,
      isExempt: false,
    } as unknown as TransferTaxResult;
    const r = resolveDisplayAcquisitionAndExpense({ result, singleInput });
    expect(r.acquisitionPrice).toBe(1_726_490_689);
    expect(r.necessaryExpense).toBe(1_879_616_249 - 1_726_490_689 - 100_000_000);
  });

  it("estimatedBase가 있으면 그 값이 정본이다 (fallback 우회) — 회귀 가드", () => {
    const result = {
      usedEstimatedAcquisition: true,
      estimatedBase: 5_000_000,
      transferGain: 100_000_000,
      isExempt: false,
    } as unknown as TransferTaxResult;
    expect(resolveDisplayAcquisitionAndExpense({ result, singleInput }).acquisitionPrice).toBe(5_000_000);
  });

  it("양도시 기준시가 0이면 0 — 분모 0 방어선 유지", () => {
    const result = { usedEstimatedAcquisition: true, estimatedBase: undefined, transferGain: 0, isExempt: false } as unknown as TransferTaxResult;
    const zero = { ...singleInput, standardPriceAtTransfer: 0 } as TransferTaxInput;
    expect(resolveDisplayAcquisitionAndExpense({ result, singleInput: zero }).acquisitionPrice).toBe(0);
  });
});
