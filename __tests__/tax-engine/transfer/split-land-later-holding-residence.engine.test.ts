/**
 * 분리취득 — 토지를 건물보다 **나중에** 취득한 주택의 토지 파트 거주기간별 공제율 (역방향 · 계획서 split-land-residence-rate-4289 §8) · 엔진·leaf 직접
 *
 * 시료 S2: 건물 2010-03-01 매수 · 토지 2020-03-01 매수 · 2025-01-15 양도 20억(토지 14억·건물 6억) · 1세대 1주택 · 비조정.
 *   토지 보유 = 2020-03-01 ~ 2025-01-15 = 58개월(4년) · 건물 보유 14년.
 * 손계산(`makeMockRates()` = 2024 누진표): 양도차익 토지 14억−9억 = 5억 · 건물 6억−1억 = 5억 → 12억 초과분 안분(×8/20) → 과세 양도차익 토지 2억·건물 2억.
 *   건물 파트: 표2 보유 14년 40% + 거주 14년 40% = 80%(입력 178개월) → 160,000,000
 *   토지 파트(현행 — 거주 14년 전부): 40%가 아니라 보유 4년 16% + 거주 14년 40% = 56% → 112,000,000 → 과세표준 125,500,000 → ×35% − 15,440,000 = 28,485,000
 *   토지 파트(역방향 — 거주 = 토지 보유기간 중): 보유 4년 16% + 거주 4년 16% = 32% → 64,000,000
 *     → 과세 양도소득금액 400,000,000 − 224,000,000 − 기본공제 2,500,000 = 173,500,000 → ×38% − 19,940,000 = 45,990,000
 *   (c) 직접 60개월: 건물 보유 14년 40% + 거주 5년 20% = 60% → 120,000,000 · 토지 32% → 64,000,000 → 213,500,000 → ×38% − 19,940,000 = 61,190,000
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import {
  collectLandHoldingResidenceIssues,
  landAcquiredAfterBuilding,
  landHoldingMonthsOf,
  resolveLandHoldingResidence,
  LAND_HOLDING_RESIDENCE_GATE_MESSAGE,
  LAND_HOLDING_RESIDENCE_INVALID_MESSAGE,
  LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE,
} from "@/lib/tax-engine/transfer-land-holding-residence";
import { calcSplitCarryoverScenarios } from "@/lib/tax-engine/transfer-tax-split-carryover";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

const s2 = (o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 2_000_000_000,
    transferDate: D("2025-01-15"),
    acquisitionDate: D("2010-03-01"),
    landAcquisitionDate: D("2020-03-01"),
    isOneHousehold: true,
    householdHousingCount: 1,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landTransferPrice: 1_400_000_000,
    buildingTransferPrice: 600_000_000,
    landStandardPriceAtTransfer: 1_400_000_000,
    buildingStandardPriceAtTransfer: 600_000_000,
    landAcquisitionPrice: 900_000_000,
    buildingAcquisitionPrice: 100_000_000,
    residencePeriodMonths: 178,
    acquisitionPrice: 0,
    expenses: 0,
    ...o,
  });
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(s2(o), makeMockRates());
const capNote = (r: ReturnType<typeof run>) => (r.warnings ?? []).filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));

describe("S2 엔진 직접 — 직접 입력은 토지 보유 개월로 상한(Q-5-1 b)", () => {
  it("(a) 직접 178개월: 토지 32%(보유 4년 16% + 거주 4년 16%) · 건물 80% · 45,990,000 · 고지 1건 · 파트 거주 연수 4/14", () => {
    const r = run();
    expect(r.calculatedTax).toBe(45_990_000);
    expect(r.taxBase).toBe(173_500_000);
    expect(r.longTermHoldingDeduction).toBe(224_000_000);
    const { land, building } = r.splitDetail!;
    expect(land.longTermRate).toBeCloseTo(0.32, 10);
    expect(land.longTermDeduction).toBe(64_000_000);
    expect(land.holdingDeductionRate).toBe(0.16);
    expect(land.residenceDeductionRate).toBe(0.16);
    expect(building.longTermRate).toBeCloseTo(0.8, 10);
    expect(building.longTermDeduction).toBe(160_000_000);
    expect(land.residenceYears).toBe(4);
    expect(building.residenceYears).toBe(14);
    expect(land.holdingResidenceCap).toEqual({ directMonths: 178, cappedMonths: 58, landHoldingMonths: 58 });
    const n = capNote(r);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("58개월");
    expect(n[0]).toContain("거주 178개월 → 토지분 58개월");
    expect(n[0]).toContain("2025두34935");
    expect(n[0]).toContain("확인 필요");
    // 사실만 쓴다 — 유리·불리·절감 표현 없음
    expect(n[0]).not.toMatch(/유리|불리|절감|절세/);
  });

  it("산식 문구가 파트별 거주 연수를 말한다 — 토지 「거주 4년×4% = 16%」 · 건물 「거주 14년×4% = 40%」 (자기모순 문장 없음)", () => {
    const lthd = run().steps.filter((s) => /장기보유|거주 기간분/.test(s.label)).map((s) => s.formula).join(" | ");
    expect(lthd).toContain("거주 4년×4% = 16%");
    expect(lthd).toContain("거주 14년×4% = 40%");
    expect(lthd).not.toContain("거주 14년×4% = 16%");
  });

  it("(b) 구간 입력 — ④가 겹침 58개월을 싣는다: 같은 32% · 45,990,000 · 상한 고지 없음", () => {
    const r = run({ landHoldingResidenceMonths: 58 });
    expect(r.calculatedTax).toBe(45_990_000);
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(r.splitDetail!.land.residenceYears).toBe(4);
    expect(r.splitDetail!.land.holdingResidenceCap).toBeUndefined();
    expect(capNote(r)).toHaveLength(0);
    // 건물은 거주 합계(178개월) 그대로
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.8, 10);
  });

  it("(b2) 구간 입력 — 토지 취득 전에만 거주한 구간(겹침 0): 토지 거주분 없음 — 토지 16% · 건물 거주 합계 그대로", () => {
    const r = run({ residencePeriodMonths: 60, landHoldingResidenceMonths: 0 });
    // 건물 60% = 보유 14년 40% + 거주 5년 20% · 토지 보유 4년 16% + 거주 0
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.16, 10);
    expect(r.splitDetail!.land.residenceDeductionRate).toBe(0);
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.6, 10);
    expect(capNote(r)).toHaveLength(0);
  });

  it("(c) 직접 60개월: 현행 토지 36% → min(60, 58) = 58개월 = 4년 → 32% · 61,190,000 · 고지 1건", () => {
    const r = run({ residencePeriodMonths: 60 });
    expect(r.calculatedTax).toBe(61_190_000);
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.32, 10);
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.6, 10);
    expect(r.splitDetail!.land.residenceYears).toBe(4);
    expect(r.splitDetail!.building.residenceYears).toBe(5);
    expect(capNote(r)).toHaveLength(1);
  });

  it("상한이 깎아도 연수가 같으면(직접 59개월 → 58개월 = 둘 다 4년) 공제율이 같아 고지하지 않는다 — 세액은 58개월과 같다", () => {
    const r59 = run({ residencePeriodMonths: 59 });
    const r58 = run({ residencePeriodMonths: 58 });
    expect(capNote(r59)).toHaveLength(0);
    expect(r59.splitDetail!.land.holdingResidenceCap).toBeUndefined();
    expect(r59.splitDetail!.land.residenceYears).toBe(4);
    expect(r59.calculatedTax).toBe(r58.calculatedTax);
    expect(r59.splitDetail!.land.longTermRate).toBeCloseTo(r58.splitDetail!.land.longTermRate, 12);
  });

  it("거주가 토지 보유기간보다 짧은 직접 입력(24개월): 상한 미적용 · 고지 없음 · 토지 24%(16% + 거주 2년 8%) · 76,390,000", () => {
    const r = run({ residencePeriodMonths: 24 });
    expect(r.calculatedTax).toBe(76_390_000);
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.24, 10);
    expect(r.splitDetail!.land.residenceYears).toBe(2);
    expect(capNote(r)).toHaveLength(0);
  });

  it("거주 0개월: 표1(8%) — 종전과 같다 · 고지 없음", () => {
    const r = run({ residencePeriodMonths: 0 });
    expect(r.calculatedTax).toBe(104_260_000);
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.08, 10);
    expect(capNote(r)).toHaveLength(0);
  });

  it("표2 대상 판정(거주 2년)은 바꾸지 않는다 — 건물 거주 178개월이 대상을 열고, 토지 거주분이 0으로 줄어도 건물은 표2 그대로(구간 겹침 0 · 거주 60개월)", () => {
    const r = run({ residencePeriodMonths: 60, landHoldingResidenceMonths: 0 });
    // 토지 거주 0이어도 표2 대상(건물 거주 5년) — 토지는 표2 보유분 16%(표1 8%가 아니다)
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.16, 10);
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.6, 10);
  });
});

describe("짝 — 이 규칙이 걸리지 않는 입력은 종전과 같다", () => {
  it("토지가 건물과 같은 날 취득: 상한 없음 — 토지 보유 14년 40% + 거주 14년 40% = 80%", () => {
    const r = run({ landAcquisitionDate: D("2010-03-01") });
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.8, 10);
    expect(r.splitDetail!.land.residenceYears).toBe(14);
    expect(r.splitDetail!.land.holdingResidenceCap).toBeUndefined();
    expect(capNote(r)).toHaveLength(0);
  });

  it("토지가 건물보다 먼저 취득(2000-03-01): 상한 없음 — 거주 14년 그대로(통칙 95-0…1 표1·표2 큰 쪽 80%)", () => {
    const r = run({ landAcquisitionDate: D("2000-03-01") });
    expect(r.splitDetail!.land.residenceYears).toBe(14);
    expect(r.splitDetail!.land.holdingResidenceCap).toBeUndefined();
    expect(capNote(r)).toHaveLength(0);
  });

  it("소유자 분리(토지만 본인)는 범위 밖 — 상한을 걸지 않는다", () => {
    const sp = run({ selfOwns: "land_only" });
    expect(sp.splitDetail!.land.holdingResidenceCap).toBeUndefined();
    expect(capNote(sp)).toHaveLength(0);
  });

  it("2009~2019 양도(표2 보유 연 8% 한 열 · 거주분 없음): 세액·공제율이 상한 유무와 무관 · 고지 없음", () => {
    for (const transferDate of ["2015-06-30", "2019-12-31"]) {
      const base = { acquisitionDate: D("2000-03-01"), landAcquisitionDate: D("2010-03-01"), transferDate: D(transferDate) };
      const direct = run({ ...base, residencePeriodMonths: 178 });
      const exact = run({ ...base, residencePeriodMonths: 178, landHoldingResidenceMonths: 0 });
      expect(direct.calculatedTax, transferDate).toBe(exact.calculatedTax);
      expect(capNote(direct), transferDate).toHaveLength(0);
    }
  });

  it("2020 양도(보유 연 8% 한 열 · 거주 2년이 대상 판정만 가른다): 대상 판정은 건물 거주 그대로 — 토지 거주 상한이 세액을 바꾸지 않는다", () => {
    const base = { acquisitionDate: D("2000-03-01"), landAcquisitionDate: D("2012-03-01"), transferDate: D("2020-06-15") };
    const direct = run({ ...base, residencePeriodMonths: 178 });
    const exact = run({ ...base, residencePeriodMonths: 178, landHoldingResidenceMonths: 0 });
    expect(direct.calculatedTax).toBe(exact.calculatedTax);
    expect(capNote(direct)).toHaveLength(0);
    expect(direct.splitDetail!.land.longTermRate).toBeCloseTo(exact.splitDetail!.land.longTermRate, 12);
  });
});

describe("§155⑳ 거주주택 특례(A) — 일반 경로와 같은 leaf (on = off)", () => {
  const unit = {
    businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general" as const,
    rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
    standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
  };
  const rentalA = { applyException: true, scenario: "A", rentalUnits: [unit] };
  const withRhe = (o: Partial<TransferTaxInput> = {}) =>
    run({ buildingFootprintArea: 60, acquisitionArea: 100, appurtenantLandZone: "non_urban", annualBasicDeductionUsed: 0, ...o } as Partial<TransferTaxInput>);
  const rheOn = (o: Partial<TransferTaxInput> = {}) => withRhe({ rentalHousingException: rentalA, ...o } as Partial<TransferTaxInput>);

  it("직접 178 · 60 · 구간 58 · 24 모두 특례 on = off — 산출세액·토지 공제율·파트 거주 연수가 같다(⑳ 경로가 토지 보유기간 중 거주를 쓴다)", () => {
    for (const o of [{}, { residencePeriodMonths: 60 }, { landHoldingResidenceMonths: 58 }, { landHoldingResidenceMonths: 24 }, { residencePeriodMonths: 24 }] as Partial<TransferTaxInput>[]) {
      const off = withRhe(o);
      const on = rheOn(o);
      expect(on.calculatedTax, JSON.stringify(o)).toBe(off.calculatedTax);
      expect(on.splitDetail!.land.longTermRate, JSON.stringify(o)).toBeCloseTo(off.splitDetail!.land.longTermRate, 12);
      expect(on.splitDetail!.land.residenceYears, JSON.stringify(o)).toBe(off.splitDetail!.land.residenceYears);
    }
    expect(rheOn().calculatedTax).toBe(45_990_000);
  });

  it("고지 — 직접 입력이 공제율을 바꿨으면 on도 1건(중복 없음) · 구간 입력·연수 불변이면 없음", () => {
    expect(capNote(rheOn())).toHaveLength(1);
    expect(capNote(rheOn({ residencePeriodMonths: 60 }))).toHaveLength(1);
    expect(capNote(rheOn({ landHoldingResidenceMonths: 58 }))).toHaveLength(0);
    expect(capNote(rheOn({ residencePeriodMonths: 59 }))).toHaveLength(0);
    expect(capNote(rheOn({ residencePeriodMonths: 24 }))).toHaveLength(0);
  });
});

describe("함께 양도 부수토지 카드(L-1b) — 카드를 주택보다 나중에 취득: 같은 규칙(분리취득 토지 파트와 parity)", () => {
  /** 일괄양도 companion 부수토지 — 1세대1주택 · 양도 9억 / 취득 1억 / 양도일 2024-06-01. 주택(primary) 보유 178개월. */
  const card = (acq: string, residMonths: number): TransferTaxInput =>
    baseTransferInput({
      propertyType: "land",
      landNature: "appurtenant_to_housing",
      oneHouseUnitRole: "appurtenant_land",
      transferPrice: 900_000_000,
      acquisitionPrice: 100_000_000,
      acquisitionDate: D(acq),
      transferDate: D("2024-06-01"),
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: residMonths,
      primaryContextForCompanionRate: { propertyType: "housing", holdingMonths: 178, buildingFootprintArea: 100, isUrbanArea: true },
    });
  const runCard = (acq: string, res: number) => calculateTransferTax(card(acq, res), makeMockRates());

  it("카드 2020-03-01(보유 51개월 = 4년): 거주 178개월 → min(178, 51) = 4년 → 표2 보유 14년 40% + 거주 4년 16% = 56%(직전 80%) · 고지 1건", () => {
    const r = runCard("2020-03-01", 178);
    expect(r.longTermHoldingRate).toBeCloseTo(0.56, 10);
    expect(capNote(r)).toHaveLength(1);
    expect(capNote(r)[0]).toContain("거주 178개월 → 토지분 51개월");
  });

  it("카드가 주택보다 먼저(2000-03-01): 상한 없음 — 표2 보유 14년 40% + 거주 14년 40% = 80% · 고지 없음", () => {
    const r = runCard("2000-03-01", 178);
    expect(r.longTermHoldingRate).toBeCloseTo(0.8, 10);
    expect(capNote(r)).toHaveLength(0);
  });

  it("거주가 카드 보유기간보다 짧으면(24개월) 상한 미적용 · 연수가 같으면(51 → 4년 = 4년) 고지 없음", () => {
    expect(capNote(runCard("2020-03-01", 24))).toHaveLength(0);
    expect(capNote(runCard("2020-03-01", 51))).toHaveLength(0);
    expect(runCard("2020-03-01", 24).longTermHoldingRate).toBeCloseTo(0.48, 10); // 14년 40% + 2년 8%
  });
});

describe("leaf — 게이트·검증", () => {
  it("landAcquiredAfterBuilding: 엄격 비교(같은 날 아님) · 소유자 분리 제외 · 날짜 빈칸 false", () => {
    expect(landAcquiredAfterBuilding({ landAcquisitionDate: "2020-03-01", buildingAcquisitionDate: "2010-03-01" })).toBe(true);
    expect(landAcquiredAfterBuilding({ landAcquisitionDate: "2010-03-01", buildingAcquisitionDate: "2010-03-01" })).toBe(false);
    expect(landAcquiredAfterBuilding({ landAcquisitionDate: "2010-03-02", buildingAcquisitionDate: "2010-03-01" })).toBe(true);
    expect(landAcquiredAfterBuilding({ landAcquisitionDate: "2020-03-01", buildingAcquisitionDate: "2010-03-01", selfOwns: "land_only" })).toBe(false);
    expect(landAcquiredAfterBuilding({ landAcquisitionDate: "2020-03-01", buildingAcquisitionDate: "2010-03-01", selfOwns: "both" })).toBe(true);
    expect(landAcquiredAfterBuilding({ landAcquisitionDate: undefined, buildingAcquisitionDate: "2010-03-01" })).toBe(false);
  });

  it("landHoldingMonthsOf: 2020-03-01 ~ 2025-01-15 = 58 · 응당일 전날 완성(2020-03-01 ~ 2025-02-28 = 60)", () => {
    expect(landHoldingMonthsOf(D("2020-03-01"), D("2025-01-15"))).toBe(58);
    expect(landHoldingMonthsOf(D("2020-03-01"), D("2025-02-28"))).toBe(60);
    expect(landHoldingMonthsOf("2020-03-01", "2025-01-15")).toBe(58);
  });

  it("resolveLandHoldingResidence: 직접 입력은 min · 구간 입력은 그 값 · 걸리지 않으면 입력 그대로", () => {
    const base = { landAcquisitionDate: D("2020-03-01"), acquisitionDate: D("2010-03-01"), transferDate: D("2025-01-15") };
    expect(resolveLandHoldingResidence({ ...base, residencePeriodMonths: 178 }, "both")).toEqual({ applies: true, months: 58, capped: true, landHoldingMonths: 58 });
    expect(resolveLandHoldingResidence({ ...base, residencePeriodMonths: 30 }, "both")).toEqual({ applies: true, months: 30, capped: false, landHoldingMonths: 58 });
    expect(resolveLandHoldingResidence({ ...base, residencePeriodMonths: 178, landHoldingResidenceMonths: 40 }, "both")).toEqual({ applies: true, months: 40, capped: false, landHoldingMonths: 58 });
    expect(resolveLandHoldingResidence({ ...base, residencePeriodMonths: 178 }, "land_only")).toEqual({ applies: false, months: 178, capped: false });
    expect(resolveLandHoldingResidence({ ...base, landAcquisitionDate: D("2000-03-01"), residencePeriodMonths: 178 }, "both")).toEqual({ applies: false, months: 178, capped: false });
  });

  const facts = (o: Record<string, unknown>) =>
    ({
      isSplitable: true,
      hasLandAcquisitionDate: true,
      hasLandDecedentAcquisitionDate: false,
      landMode: "actual",
      landAcquisitionDate: "2020-03-01",
      buildingAcquisitionDate: "2010-03-01",
      residencePeriodMonths: 178,
      ...o,
    }) as Parameters<typeof collectLandHoldingResidenceIssues>[0];

  it("값이 없으면 걸리지 않는다 · 값이 있고 정상이면 통과", () => {
    expect(collectLandHoldingResidenceIssues(facts({}))).toEqual([]);
    expect(collectLandHoldingResidenceIssues(facts({ landHoldingResidenceMonths: 0 }))).toEqual([]);
    expect(collectLandHoldingResidenceIssues(facts({ landHoldingResidenceMonths: 178 }))).toEqual([]);
  });

  it("게이트 — 토지가 나중 취득이 아니면(같은 날·먼저·소유자 분리·분리 대상 아님) 막는다", () => {
    for (const o of [
      { landAcquisitionDate: "2010-03-01" },
      { landAcquisitionDate: "2000-03-01" },
      { selfOwns: "land_only" },
      { isSplitable: false },
    ]) {
      const [issue] = collectLandHoldingResidenceIssues(facts({ landHoldingResidenceMonths: 10, ...o }));
      expect(issue?.field, JSON.stringify(o)).toBe("landHoldingResidenceMonths");
      expect(issue?.message, JSON.stringify(o)).toBe(LAND_HOLDING_RESIDENCE_GATE_MESSAGE);
    }
  });

  it("값 — 음수·소수는 막고, 거주 합계를 넘으면 막는다(합계가 오지 않은 호출부는 이 검사를 하지 않는다)", () => {
    expect(collectLandHoldingResidenceIssues(facts({ landHoldingResidenceMonths: -1 }))[0]?.message).toBe(LAND_HOLDING_RESIDENCE_INVALID_MESSAGE);
    expect(collectLandHoldingResidenceIssues(facts({ landHoldingResidenceMonths: 1.5 }))[0]?.message).toBe(LAND_HOLDING_RESIDENCE_INVALID_MESSAGE);
    expect(collectLandHoldingResidenceIssues(facts({ landHoldingResidenceMonths: 179 }))[0]?.message).toBe(LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE);
    expect(collectLandHoldingResidenceIssues(facts({ landHoldingResidenceMonths: 179, residencePeriodMonths: undefined }))).toEqual([]);
  });

  it("엔진 진입 게이트 — 걸리지 않는 입력에 값이 오면 throw(조용히 버리지 않는다)", () => {
    expect(() => run({ landAcquisitionDate: D("2010-03-01"), landHoldingResidenceMonths: 10 })).toThrow(LAND_HOLDING_RESIDENCE_GATE_MESSAGE);
    expect(() => run({ landHoldingResidenceMonths: 179 })).toThrow(LAND_HOLDING_RESIDENCE_EXCEEDS_MESSAGE);
    expect(() => run({ landHoldingResidenceMonths: 58 })).not.toThrow();
  });
});

describe("파트 이월과세 시나리오 — 이 규칙을 걸지 않는다(치환 날짜로 「토지가 나중」 비교가 달라진다)", () => {
  const GIFT = D("2023-03-01");
  const ct = (donor: Date) => ({
    giftRegistryDate: GIFT, donorAcquisitionDate: donor, donorAcquisitionPrice: 50_000_000, useEstimatedAcquisition: false,
    giftTaxAmount: 0, giftDateValuation: 100_000_000, donorRelation: "lineal" as const, exclusionDeclared: {},
  });
  const carryover = (): TransferTaxInput =>
    baseTransferInput({
      transferPrice: 1_200_000_000, transferDate: D("2025-06-30"), acquisitionPrice: 0, acquisitionDate: GIFT, isOneHousehold: false, householdHousingCount: 2,
      landAcquisitionDate: GIFT, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
      landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
      landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 100_000_000, acquisitionCause: "carryover_gift", landAcquisitionCause: "carryover_gift", isSeparateAcquisition: false,
      carryoverGiftEvent: { giftRegistryDate: GIFT, giftTaxCalculated: 0, giftTaxBase: 200_000_000 },
      landCarryoverTaxation: ct(D("1995-03-01")),
      buildingCarryoverTaxation: ct(D("2015-06-01")),
      residencePeriodMonths: 24,
    });

  it("해결자가 만든 모든 시나리오 입력에 skip 표지가 있고 값은 비어 있다 — skip이면 leaf는 걸리지 않는다", () => {
    const seen: TransferTaxInput[] = [];
    calcSplitCarryoverScenarios(carryover(), makeMockRates(), (i) => {
      seen.push(i);
      return { determinedTax: 1 } as never;
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const i of seen) {
      expect(i.landHoldingResidenceSkip).toBe(true);
      expect(i.landHoldingResidenceMonths).toBeUndefined();
    }
    const base = { residencePeriodMonths: 178, landAcquisitionDate: D("2020-03-01"), acquisitionDate: D("2010-03-01"), transferDate: D("2025-01-15") };
    expect(resolveLandHoldingResidence({ ...base, landHoldingResidenceSkip: true }, "both")).toEqual({ applies: false, months: 178, capped: false });
  });
});
