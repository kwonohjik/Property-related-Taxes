/**
 * anchor — 부담부증여 × 일체 주택 × 신축 — 「소득세법」 §114조의2 가산세 기준액에서 토지분 제외 (V-7 · PR-1 엔진)
 *
 * 계획서: docs/02-design/features/bg-housing-114-2-building-base.plan.md (Q-1~Q-4 a)
 * 조문 「해당 건물의 감정가액 또는 환산취득가액」의 100분의 5. 건물분 = 주택공시가격 × 건물기준시가 ÷ (토지공시가격 + 건물기준시가)(일반 양도 선례 Q-2 확정 산식).
 *
 * 손계산 (모두 수정 前 = 주택 전체 값)
 *  · 본인 신축 K-5 (`burdened-gift-114-2-penalty.test.ts` 시료: 채무 안분 양도가 200M · 주택 H_acq 100M · H_T 400M)
 *      L_acq = 500,000 × 120㎡ = 60M · N 40M → B_acq = 100M − ⌊100M × 60/100⌋ = 40M / L_T 240M · N_T 160M → B_tr = 160M · S_b = 200M − ⌊200M × 240/400⌋ = 80M
 *      base = 80M × 40M ÷ 160M = 20,000,000 (수정 前 50,000,000) · 가산세 1,000,000 (수정 前 2,500,000)
 *  · 본인 신축 K-7 (감정가액 총액 300M · 건물 자리 취득가액 = 300M × 0.4 = 120M)
 *      건물 감정가액 150M 직접 → 120M × 150/300 = 60,000,000 / 없으면 취득 당시 비율 → 300M − ⌊300M × 60/100⌋ = 120M → 120M × 120/300 = 48,000,000 (수정 前 120,000,000)
 *  · 당초 증여자 신축 K-5 (`carryover-donor-built-bg.anchor.test.ts` 시료: 채무 안분 양도가 500M · 당초 증여자 H_acq 150M · H_T 800M)
 *      L_acq = 1,000,000 × 100㎡ = 100M · N 60M → B_acq = 150M − ⌊150M × 100/160⌋ = 56,250,000 / L_T 500M · N_T 300M → B_tr = 800M − 500M = 300M · S_b = 500M − ⌊500M × 500/800⌋ = 187,500,000
 *      base = 187,500,000 × 56,250,000 ÷ 300,000,000 = 35,156,250 (수정 前 93,750,000) · 가산세 1,757,812 (수정 前 4,687,500)
 *  · 당초 증여자 신축 K-7 (당초 증여자 감정가액 200M · A 건물 자리 취득가액 125M) → 건물분 200M − ⌊200M × 100/160⌋ = 75M → 125M × 75/200 = 46,875,000 (수정 前 125,000,000)
 * 입력이 없으면 막는다(PR-2 엄격화 · Q-3 a) — PR-1(#2916)까지는 종전 base였다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

describe("본인 신축 (isSelfBuilt) × 일체 주택", () => {
  const info = (over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo =>
    ({
      valuationMode: "sangjeungbeop_market", acquisitionMethod: "converted", marketValueAtTransfer: 500_000_000,
      lendingDepositTotal: 0, mortgageDebtAmount: 200_000_000, annualRentTotal: 0, mortgageSetAmount: 200_000_000,
      landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 400_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 100_000_000,
      ...over,
    }) as BurdenedGiftInfo;
  const SPLIT = { landPricePerSqmAtAcquisition: 500_000, landArea: 120, buildingStdPriceAtAcquisition: 40_000_000, landStdPriceAtTransfer: 240_000_000, buildingStdPriceAtTransfer: 160_000_000 };
  const run = (i: BurdenedGiftInfo, extra: Partial<TransferTaxInput> = {}) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferDate: D("2024-03-01"), acquisitionDate: D("2021-01-01"), transferPrice: 0, acquisitionPrice: 0, expenses: 0,
        useEstimatedAcquisition: false, transferType: "burdened_gift", isOneHousehold: false, householdHousingCount: 2,
        isSelfBuilt: true, buildingType: "new", constructionDate: D("2021-01-01"), burdenedGiftInfo: i, ...extra,
      }),
      rates,
    );

  it("K-5: base 20,000,000 · 가산세 1,000,000 (수정 前 50,000,000 · 2,500,000) · 입력 없으면 막는다", () => {
    expect(() => run(info())).toThrow(/selfBuiltHousing/);
    const on = run(info(), { selfBuiltHousing: SPLIT });
    expect([on.penaltyBase, on.penaltyTax]).toEqual([20_000_000, 1_000_000]);
    expect(on.transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice).toBe(50_000_000); // 양도차익은 그대로
  });
  it("K-7: 건물 감정가액 직접 60,000,000 · 없으면 취득 당시 비율 48,000,000 (수정 前 120,000,000)", () => {
    const k7 = info({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 300_000_000 });
    expect(() => run(k7)).toThrow(/selfBuiltHousing/);
    expect(run(k7, { selfBuiltHousing: { buildingAppraisalValue: 150_000_000 } }).penaltyBase).toBe(60_000_000);
    expect(run(k7, { selfBuiltHousing: SPLIT }).penaltyBase).toBe(48_000_000);
  });
  it("입력이 모자라면 던진다(조용히 무시하지 않는다) · 증축이면 받지 않는다", () => {
    expect(() => run(info(), { selfBuiltHousing: { ...SPLIT, landStdPriceAtTransfer: undefined } })).toThrow(/양도 당시 토지 기준시가/);
    expect(() => run(info(), { selfBuiltHousing: SPLIT, buildingType: "extension", extensionFloorArea: 90, extensionStdPriceAtAcquisition: 10_000_000 })).toThrow(/증축/);
  });
});

describe("가산세 창 밖(5년 경과)이면 입력 없이도 계산된다 — 엄격화는 가산세가 붙을 때만", () => {
  it("본인 신축 K-5 · 양도 2026-03-01(신축 2021-01-01부터 5년 초과)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferDate: D("2026-03-01"), acquisitionDate: D("2021-01-01"), transferPrice: 0, acquisitionPrice: 0, expenses: 0,
        useEstimatedAcquisition: false, transferType: "burdened_gift", isOneHousehold: false, householdHousingCount: 2,
        isSelfBuilt: true, buildingType: "new", constructionDate: D("2021-01-01"),
        burdenedGiftInfo: {
          valuationMode: "sangjeungbeop_market", acquisitionMethod: "converted", marketValueAtTransfer: 500_000_000, lendingDepositTotal: 0, mortgageDebtAmount: 200_000_000,
          annualRentTotal: 0, mortgageSetAmount: 200_000_000, landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 400_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 100_000_000,
        } as BurdenedGiftInfo,
      }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });
});

describe("당초 증여자 신축 (이월과세 A · carryoverDonorBasis.donorBuilt.housing) × 일체 주택", () => {
  type Method = "appraisal" | "converted";
  const HOUSING = { landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 60_000_000, landStdPriceAtTransfer: 500_000_000, buildingStdPriceAtTransfer: 300_000_000 };
  const info = (method: Method, housing?: typeof HOUSING): BurdenedGiftInfo =>
    ({
      valuationMode: "sangjeungbeop_market", marketValueAtTransfer: 800_000_000, acquisitionMethod: method,
      lendingDepositTotal: 300_000_000, mortgageDebtAmount: 200_000_000, annualRentTotal: 0,
      landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 800_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 400_000_000,
      actualAcquisitionTotal: 600_000_000,
      carryoverDonorBasis: {
        landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 150_000_000,
        ...(method === "appraisal" ? { presumedBuildingAcquisitionPrice: 200_000_000, presumedLandAcquisitionPrice: 0 } : {}),
        donorBuilt: { buildingType: "new", constructionDate: D("2022-01-10"), ...(housing ? { housing } : {}) },
      },
    }) as BurdenedGiftInfo;
  const run = (i: BurdenedGiftInfo) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferType: "burdened_gift", acquisitionCause: "carryover_gift",
        carryoverTaxation: { giftRegistryDate: D("2023-06-01"), donorAcquisitionDate: D("2000-06-01"), donorAcquisitionPrice: 100_000_000, useEstimatedAcquisition: false, giftTaxAmount: 0, giftDateValuation: 600_000_000 },
        burdenedGiftInfo: i, transferDate: D("2026-02-16"), acquisitionDate: D("2023-06-01"), transferPrice: 0, acquisitionPrice: 0, expenses: 0,
        useEstimatedAcquisition: false, isOneHousehold: false, householdHousingCount: 2,
      } as Partial<TransferTaxInput>),
      rates,
    );

  it("K-5: base 35,156,250 · 가산세 1,757,812 (수정 前 93,750,000 · 4,687,500) · echo도 같은 값", () => {
    expect(() => run(info("converted"))).toThrow(/donorBuilt\.housing/);
    const on = run(info("converted", HOUSING));
    expect(on.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect([on.penaltyBase, on.penaltyTax]).toEqual([35_156_250, 1_757_812]);
    expect(on.carryoverTaxationDetail!.donorBuiltPenalty).toMatchObject({ applied: true, base: 35_156_250, penalty: 1_757_812 });
  });
  it("K-7: base 46,875,000 (수정 前 125,000,000)", () => {
    expect(() => run(info("appraisal"))).toThrow(/donorBuilt\.housing/);
    const on = run(info("appraisal", HOUSING));
    expect([on.penaltyBase, on.penaltyTax]).toEqual([46_875_000, 2_343_750]);
  });
});
