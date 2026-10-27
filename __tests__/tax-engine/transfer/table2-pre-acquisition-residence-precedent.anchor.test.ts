/**
 * anchor — 장기보유특별공제 표2 **대상 판정**에 취득 전 동일세대 거주를 통산하지 않는다 (대법원 2026.1.15. 선고 2025두34935 · 사용자 결정 2026-10-27 Q-1~Q-3)
 *
 * 계획서 `docs/00-pm/table2-pre-acquisition-residence-conflict.plan.md`. 판결은 표2의 거주기간을 「양도자가 양도자산인 주택의 취득일부터 양도일까지의
 * 보유기간 중 해당 주택에서 거주한 기간」으로 보고, 상속도 같다고 했다. 비과세 거주요건(§154①) 통산은 그대로다.
 * 예외(Q-2): 이월과세 시나리오 A는 보유기간이 증여자 취득일부터라(「소득세법」 §95④ 단서) 증여 전 거주를 표2 대상 판정에 통산하고 확인 필요를 고지한다.
 *
 * | # | 주장 |
 * |---|---|
 * | L | leaf — 이월과세 A만 증여 전 거주를 더한다 · 일반 증여·상속 전 동거는 더하지 않는다 |
 * | H2 | 상속 20억 · 상속 전 60개월 · 본인 12개월 → 표1 16% · 총세액 207,682,200(종전 표2 161,854,000) · 비과세 판정 불변 |
 * | CA | 이월과세 A — 증여 전 24개월로 표2(40%) · 확인 필요 고지 / 미답 고지 / 0·본인 24개월은 고지 없음 / 시나리오 B는 통산하지 않는다 |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { table2SubjectResidenceMonths } from "@/lib/tax-engine/one-house/residence-months";
import type { GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const PRECEDENT = "2025두34935";

describe("L — 표2 대상 판정 leaf", () => {
  const basis = (over: Partial<GiftHouseholdBasis> = {}): GiftHouseholdBasis => ({
    giftDate: D("2021-03-02"),
    donorAcquisitionDate: D("2012-01-10"),
    continuousSameHousehold: true,
    householdHoldingStartDate: D("2012-01-10"),
    priorHouseholdResidenceMonths: 24,
    ...over,
  });
  it("일반 증여(통산 성립 · 증여 전 24개월)는 더하지 않는다 · 이월과세 A는 더한다 · 사실이 없으면 본인 거주 그대로", () => {
    expect(table2SubjectResidenceMonths(12, basis())).toBe(12);
    expect(table2SubjectResidenceMonths(12, basis({ holdingAlreadyAtDonor: true }))).toBe(36);
    expect(table2SubjectResidenceMonths(12, undefined)).toBe(12);
  });
  it("이월과세 A라도 통산이 성립하지 않으면(별도세대) 더하지 않는다", () => {
    expect(table2SubjectResidenceMonths(0, basis({ holdingAlreadyAtDonor: true, continuousSameHousehold: false }))).toBe(0);
  });
});

describe("H2 — 동일세대 상속: 표2 대상 판정에 상속 전 동거를 통산하지 않는다", () => {
  const inh = (over: Partial<TransferTaxInput> = {}) =>
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionCause: "inheritance",
      acquisitionDate: D("2017-09-15"),
      decedentAcquisitionDate: D("2010-02-02"),
      transferDate: D("2026-02-16"),
      transferPrice: 2_000_000_000,
      acquisitionPrice: 400_000_000,
      expenses: 0,
      wasRegulatedAtAcquisition: true,
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationHoldingStartDate: D("2010-02-02"),
      decedentCohabitationResidenceMonths: 60,
      residencePeriodMonths: 12,
      ...over,
    });
  it("20억 · 상속 전 60개월 · 본인 12개월 → 표1 16% · 총세액 207,682,200 · 판례 고지", () => {
    const r = calculateTransferTax(inh(), rates);
    expect(r.taxableGain).toBe(640_000_000); // 비과세 판정(고가주택 부분과세)은 통산으로 그대로
    expect(r.longTermHoldingRate).toBeCloseTo(0.16, 10);
    expect(r.totalTax).toBe(207_682_200);
    expect((r.warnings ?? []).filter((w) => w.includes(PRECEDENT))).toHaveLength(1);
  });
  it("[짝] 동거 거주가 없으면(별도세대) 비과세부터 실패한다 — 통산은 비과세 쪽에서만 일한다", () => {
    const r = calculateTransferTax(inh({ decedentSameHouseholdBeforeInheritance: false }), rates);
    expect(r.taxableGain).toBeGreaterThan(640_000_000);
    expect((r.warnings ?? []).some((w) => w.includes(PRECEDENT))).toBe(false);
  });
});

describe("CA — 이월과세 시나리오 A: 증여 전 동일세대 거주를 표2 대상 판정에 통산(확인 필요)", () => {
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
    const d = r.carryoverTaxationDetail!;
    const w = (r.warnings ?? []).filter((x) => x.includes("표2(1세대1주택) 대상 판정"));
    return { r, d, w };
  };
  it("🔑 증여 전 24개월 · 본인 0 → A 채택 · 표2 40%(보유 10년 이상 40% · 거주분 0) · 총세액 136,260,000 · 확인 필요 고지", () => {
    const { r, d, w } = run(24, 0);
    expect(d.adoptedScenario).toBe("A");
    expect(r.longTermHoldingRate).toBeCloseTo(0.4, 10);
    expect(r.determinedTax).toBe(136_260_000);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("증여 전 같은 세대로 거주한 24개월");
    expect(w[0]).toContain("이월과세 사안은 다루지 않았고");
    expect(w[0]).toContain("확인이 필요합니다");
  });
  it("시나리오 B(증여일 기산)는 증여 전 거주를 표2에 통산하지 않는다 — 0개월과 같은 B 세액", () => {
    expect(run(24, 0).d.scenarioB.determinedTax).toBe(run(0, 0).d.scenarioB.determinedTax);
  });
  it("미답 → 통산하지 않고 표1 26% · 174,354,000 · 「입력되지 않아」 고지 / 0 → 고지 없음 / 본인 24개월 → 고지 없음", () => {
    const blank = run(undefined, 0);
    expect(blank.r.longTermHoldingRate).toBeCloseTo(0.26, 10);
    expect(blank.r.determinedTax).toBe(174_354_000);
    expect(blank.w).toHaveLength(1);
    expect(blank.w[0]).toContain("개월 수가 입력되지 않아");
    expect(run(0, 0).w).toHaveLength(0);
    expect(run(24, 24).w).toHaveLength(0);
    expect(run(undefined, 24).w).toHaveLength(0);
  });
});
