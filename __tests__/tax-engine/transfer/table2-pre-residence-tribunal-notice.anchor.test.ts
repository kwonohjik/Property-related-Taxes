/**
 * anchor — 표2 대상 판정의 취득 전 동일세대 거주 통산은 유지하고, 증여만 조심 2025서3843 확인 필요를 고지한다 (2026-10-27 — #2608 되돌림)
 *
 * 계획서 `docs/00-pm/table2-pre-acquisition-residence-conflict.plan.md` §10. 대법원 2025두34935는 표2 **거주기간별 공제율** 사건이었다
 * (같은 사건으로 보이는 조심 2023서0505 — 처분청이 대상 판정 통산으로 보유분 표2를 인정하고 거주 공제율만 부인). 대상 판정 통산은
 * 기획재정부 재산세제과-720(상속)·사전-2025-법규재산-0506 질의1(증여·상속)을 따른다.
 *
 * | # | 주장 |
 * |---|---|
 * | H | 동일세대 상속 — 표2 32%(통산) · 심판례 고지 없음(재산세제과-720 정면) |
 * | CA | 이월과세 A — 증여 전 24개월 통산으로 표2 40% · 심판례 고지(공제율 문구는 「증여일 이후 본인 거주」 + 사전-2025-법규재산-1126) · 본인 24개월이면 고지 없음 |
 * | CR | 이월과세 A 공제율 — 보유분은 증여자 취득일부터(§95④ 단서), 거주분은 증여일 이후 본인 거주만(1126) |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TRIBUNAL = "조심 2025서3843";

describe("H — 동일세대 상속: 대상 판정 통산 유지 · 고지 없음", () => {
  const inh = (over: Partial<TransferTaxInput> = {}) =>
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionCause: "inheritance",
      acquisitionDate: D("2017-09-15"),
      decedentAcquisitionDate: D("2010-02-02"),
      transferDate: D("2026-02-16"),
      transferPrice: 1_300_000_000,
      acquisitionPrice: 400_000_000,
      expenses: 0,
      wasRegulatedAtAcquisition: true,
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: D("2010-02-02"),
      decedentCohabitationResidenceMonths: 24,
      residencePeriodMonths: 0,
      ...over,
    });
  it("상속 전 동거 24개월 · 본인 0 → 표2 32% · 총세액 5,969,191 · 심판례·판례 고지 없음", () => {
    const r = calculateTransferTax(inh(), rates);
    expect(r.longTermHoldingRate).toBeCloseTo(0.32, 10);
    expect(r.totalTax).toBe(5_969_191);
    expect((r.warnings ?? []).some((w) => w.includes(TRIBUNAL) || w.includes("2025두34935"))).toBe(false);
  });
});

describe("CA — 이월과세 시나리오 A: 증여 전 거주 통산 + 심판례 고지", () => {
  const run = (prior: number | undefined, own: number) => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: false,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: own,
        isRegulatedArea: false,
        acquisitionCause: "carryover_gift",
        transferPrice: 2_000_000_000,
        transferDate: D("2025-06-15"),
        acquisitionDate: D("2021-03-02"),
        regionCode: "4143010100",
        carryoverTaxation: {
          useEstimatedAcquisition: false,
          giftTaxAmount: 0,
          giftRegistryDate: D("2021-03-02"),
          donorAcquisitionDate: D("2012-01-10"),
          donorAcquisitionPrice: 300_000_000,
          giftDateValuation: 900_000_000,
          donorRelation: "lineal",
          donorSameHouseholdContinuous: true,
          donorHouseholdHoldingStartDate: D("2012-01-10"),
          donorPriorHouseholdResidenceMonths: prior,
        } as never,
      }),
      rates,
    );
    return { r, w: (r.warnings ?? []).filter((x) => x.includes(TRIBUNAL)) };
  };
  it("증여 전 24개월 · 본인 0 → A 표2 40% · 136,260,000 · 심판례 고지(공제율은 증여일 이후 본인 거주)", () => {
    const { r, w } = run(24, 0);
    expect(r.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect(r.longTermHoldingRate).toBeCloseTo(0.4, 10);
    expect(r.determinedTax).toBe(136_260_000);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("증여 전 동일세대로 거주한 24개월");
    expect(w[0]).toContain("증여일 이후 본인 거주만 반영");
    expect(w[0]).toContain("사전-2025-법규재산-1126");
  });
  it("[짝] 본인 거주 24개월이면 통산이 결론을 가르지 않아 고지 없음 · 입력 0도 고지 없음", () => {
    expect(run(24, 24).w).toHaveLength(0);
    expect(run(0, 0).w).toHaveLength(0);
  });
});

describe("CR — 이월과세 A 공제율: 보유분 증여자 취득일 · 거주분 증여일 이후 본인 거주 (사전-2025-법규재산-1126)", () => {
  // 1126 사실(별도세대 직계존속 증여 · 수증자 증여 전부터 거주)과 같은 축 — 증여 전 거주는 표2 거주기간 공제율에 넣지 않는다.
  const rate = (prior: number | undefined, own: number) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", acquisitionPrice: 0, expenses: 0, useEstimatedAcquisition: false,
        isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: own, isRegulatedArea: false,
        acquisitionCause: "carryover_gift", transferPrice: 2_000_000_000, transferDate: D("2025-06-15"),
        acquisitionDate: D("2021-03-02"), regionCode: "4143010100",
        carryoverTaxation: {
          useEstimatedAcquisition: false, giftTaxAmount: 0, giftRegistryDate: D("2021-03-02"),
          donorAcquisitionDate: D("2012-01-10"), donorAcquisitionPrice: 300_000_000, giftDateValuation: 900_000_000,
          donorRelation: "lineal", donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D("2012-01-10"),
          donorPriorHouseholdResidenceMonths: prior,
        } as never,
      }),
      rates,
    );
  it("보유 13년(증여자 취득일부터)분 40% 상한 + 거주분은 증여 후 본인 0·24·48개월 → 0·8·16%p — 증여 전 24개월은 공제율에 안 들어간다", () => {
    const r0 = rate(24, 0);
    expect(r0.carryoverTaxationDetail!.adoptedScenario).toBe("A");
    expect(r0.longTermHoldingRate).toBeCloseTo(0.4, 10);
    expect(rate(24, 24).longTermHoldingRate).toBeCloseTo(0.48, 10);
    expect(rate(24, 48).longTermHoldingRate).toBeCloseTo(0.56, 10);
  });
});
