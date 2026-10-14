/**
 * 부담부증여 × 이월과세 × 취득가액 「매매사례가액(K-6)·감정가액(K-7)」 anchor
 *
 * 소법 §97의2①1호 — 취득가액은 **당초 증여자가 취득할 당시**의 §97①1호 금액(나목 포함).
 * 비교 대상인 양도인(증여받은 사람) 본인 쪽은 증여받은 자산이라 소령 §163⑨ — 증여일 상증법 평가액이 실지거래가액(가목).
 *  · 시나리오 A(이월과세 적용) = 당초 증여자의 매매사례가액·감정가액 × 채무비율, 필요경비는 개산공제(당초 증여자 취득시 기준시가 기준)
 *  · 시나리오 B(미적용)        = 양도인의 증여일 평가액(`actual*`) × 채무비율 — 방식 「actual」로 읽는다
 *
 * 입력 의미: `info.acquisitionMethod`(appraisal·salesCase)는 **당초 증여자 쪽** 방식이다.
 *   당초 증여자 값 = `carryoverDonorBasis.presumed*` · 양도인 증여일 평가액 = `actual*`.
 * 계획서: docs/00-pm/burdened-gift-presumed-blocked-combos.plan.md §2
 *
 * 픽스처 산수 (housing — 건물 통째):
 *   시가 C=800M · 채무 B=500M → 채무비율 0.625 · 양도가 500M
 *   당초 증여자 감정가액 200M → A 취득가액 125M · 개산공제 = 당초 증여자 취득시 기준시가 150M × 0.625 × 3% = 2,812,500
 *   양도인 증여일 평가액 600M → B 취득가액 375M
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

function info(over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market",
    marketValueAtTransfer: 800_000_000,
    acquisitionMethod: "appraisal",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 800_000_000,
    // 양도인 본인 취득시 기준시가
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 400_000_000,
    // 양도인의 증여일 상증법 평가액 — 시나리오 B (§163⑨ 가목)
    actualAcquisitionTotal: 600_000_000,
    carryoverDonorBasis: {
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 150_000_000,
      presumedBuildingAcquisitionPrice: 200_000_000,
      presumedLandAcquisitionPrice: 0,
    },
    ...over,
  };
}

function carryover(over: Record<string, unknown> = {}) {
  return {
    giftRegistryDate: new Date("2023-06-01"),
    donorAcquisitionDate: new Date("2000-06-01"),
    donorAcquisitionPrice: 100_000_000,
    useEstimatedAcquisition: false,
    giftTaxAmount: 0,
    giftDateValuation: 600_000_000,
    ...over,
  };
}

function run(i: BurdenedGiftInfo, extra: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferType: "burdened_gift",
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover(),
      burdenedGiftInfo: i,
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2023-06-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      ...extra,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("부담부증여 × 이월과세 × K-7 감정가액 (당초 증여자 값만 새 방식)", () => {
  it("[C-1] 시나리오 A = 당초 증여자 감정가액 200M × 0.625 = 125M (양도인 값 600M이 아니다)", () => {
    const d = run(info()).carryoverTaxationDetail!;
    expect(d.scenarioA.acquisitionPrice).toBe(125_000_000);
  });

  it("[C-2] 시나리오 B = 양도인 증여일 평가액 600M × 0.625 = 375M → 양도차익 125M", () => {
    const d = run(info()).carryoverTaxationDetail!;
    expect(d.scenarioB.transferGain).toBe(125_000_000);
  });

  it("[C-3] 양도인 증여일 평가액을 흔들면 B가 따라 움직인다 (감정가액으로 읽히지 않는다)", () => {
    const d = run(info({ actualAcquisitionTotal: 400_000_000 })).carryoverTaxationDetail!;
    expect(d.scenarioB.transferGain).toBe(250_000_000); // 500M − 400M × 0.625
  });

  it("[C-4] 당초 증여자 감정가액을 흔들면 A가 따라 움직이고 B는 그대로", () => {
    const base = run(info()).carryoverTaxationDetail!;
    const low = run(
      info({ carryoverDonorBasis: { landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 150_000_000, presumedBuildingAcquisitionPrice: 80_000_000, presumedLandAcquisitionPrice: 0 } }),
    ).carryoverTaxationDetail!;
    expect(low.scenarioA.acquisitionPrice).toBe(50_000_000);
    expect(low.scenarioB.transferGain).toBe(base.scenarioB.transferGain);
  });

  it("[C-5] 총액 입력(토지·건물 한 칸)도 당초 증여자 취득시 기준시가 비율로 나뉘어 같은 값", () => {
    const d = run(
      info({ carryoverDonorBasis: { landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 150_000_000, presumedAcquisitionTotal: 200_000_000 } }),
    ).carryoverTaxationDetail!;
    expect(d.scenarioA.acquisitionPrice).toBe(125_000_000);
  });

  it("[C-6] 매매사례가액도 같다", () => {
    const d = run(info({ acquisitionMethod: "salesCase" })).carryoverTaxationDetail!;
    expect(d.scenarioA.acquisitionPrice).toBe(125_000_000);
    expect(d.scenarioB.transferGain).toBe(125_000_000);
  });

  it("[C-7] 필요경비는 개산공제만 — 당초 증여자 취득시 기준시가 기준(A의 양도차익 = 500M − 125M − 2,812,500)", () => {
    const r = run(info());
    // 채택이 A든 B든 A 컬럼의 양도차익은 별도 결과에 없으므로 A 채택 시 최종값으로 확인한다 — A 채택 조건: A 세액 ≥ B 세액
    const d = r.carryoverTaxationDetail!;
    expect(d.adoptedScenario).toBe("A");
    expect(r.transferGain).toBe(500_000_000 - 125_000_000 - 2_812_500);
  });
});

describe("미입력 가드 — 양도인 값으로 fallback하지 않는다(A=B 무력화 방지)", () => {
  it("[G-1] 당초 증여자 감정가액 미입력 → 차단", () => {
    expect(() =>
      run(info({ carryoverDonorBasis: { landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 150_000_000 } })),
    ).toThrow(/당초 증여자의 감정가액/);
  });

  it("[G-2] 당초 증여자 취득시 기준시가(개산공제 base) 미입력 → 차단", () => {
    expect(() =>
      run(info({ carryoverDonorBasis: { presumedBuildingAcquisitionPrice: 200_000_000, presumedLandAcquisitionPrice: 0 } })),
    ).toThrow(/당초 증여자 취득 당시 토지·건물 기준시가/);
  });

  it("[G-3] 양도인 증여일 평가액(B) 미입력 → 차단", () => {
    expect(() => run(info({ actualAcquisitionTotal: undefined }))).toThrow(/양도인/);
  });

  it("[G-4] 신축 5년 이내 × 감정가액 × 이월과세 → §114조의2 base·기산 미정이라 차단", () => {
    expect(() =>
      run(info(), { isSelfBuilt: true, buildingType: "new", constructionDate: new Date("2024-01-01") }),
    ).toThrow(/제114조의2/);
  });

  it("[G-5] 신축이어도 매매사례가액이면 차단하지 않는다(조문에 없음)", () => {
    expect(() =>
      run(info({ acquisitionMethod: "salesCase" }), { isSelfBuilt: true, buildingType: "new", constructionDate: new Date("2024-01-01") }),
    ).not.toThrow();
  });
});
