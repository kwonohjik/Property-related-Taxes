/**
 * anchor — 겸용주택 1세대1주택: 토지를 건물보다 **나중에** 취득했으면 주택분 토지의 거주기간별 공제율은 토지 보유기간 중 거주만 센다
 * (계획서 split-land-residence-rate-4289 §8 · 분리취득 토지 파트와 같은 leaf `resolveMixedLandHoldingResidence`).
 *
 * 시료: 건물 2010-03-01 · 토지 2020-03-01 · 양도 2025-01-15 25억 · 주택 150㎡ > 상가 100㎡ · 거주 14년(직접) — 토지 보유 58개월(4년) · 건물 보유 14년.
 *   현행(직전): 토지 56%(보유 4년 16% + 거주 14년 40%) · 건물 80% · 결정세액 55,034,457
 *   수정: 토지 32%(16% + 거주 4년 16%) · 건물 80%(불변) — 직접 입력은 min(14, 4)년 + 확인 필요 고지, 구간 입력은 ④ 겹침 연수(고지 없음).
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calc } from "../_helpers/mixed-use-identity-std";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import {
  LAND_HOLDING_RESIDENCE_INVALID_MESSAGE,
  LAND_HOLDING_RESIDENCE_MIXED_EXCEEDS_MESSAGE,
  LAND_HOLDING_RESIDENCE_MIXED_GATE_MESSAGE,
  mixedLandHoldingResidenceIssue,
  resolveMixedLandHoldingResidence,
} from "@/lib/tax-engine/transfer-land-holding-residence";

const rates = makeMockRates();
const TD = D("2025-01-15");
function D(s: string) {
  return new Date(s);
}
const asset = (over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput => ({
  isMixedUseHouse: true,
  residentialFloorArea: 150,
  nonResidentialFloorArea: 100,
  buildingFootprintArea: 100,
  totalLandArea: 200,
  landAcquisitionDate: D("2020-03-01"),
  buildingAcquisitionDate: D("2010-03-01"),
  transferStandardPrice: { housingPrice: 500_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
  acquisitionStandardPrice: { housingPrice: 350_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_500_000, landPricePerSqmAtBuildingAcq: 1_400_000 },
  residencePeriodYears: 14,
  isMetropolitanArea: true,
  zoneType: "residential",
  isOneHouseExempt: true,
  ...over,
});
const run = (o: Partial<MixedUseAssetInput> = {}) => calc(2_500_000_000, TD, asset(o), rates);
const capNote = (r: ReturnType<typeof run>) => r.warnings.filter((w) => w.includes("토지 보유기간 중 거주만 셉니다"));
const land = (r: ReturnType<typeof run>) => r.housingPart.partLthd!.land;
const building = (r: ReturnType<typeof run>) => r.housingPart.partLthd!.building;

describe("겸용 주택분 토지 — 나중 취득 + 거주", () => {
  it("직접 14년: 토지 32% · 건물 80%(불변) · 고지 1건(입력 168개월 → 58개월) · 결정세액 59,768,490(현행 55,034,457)", () => {
    const r = run();
    expect(land(r).longTermRate).toBeCloseTo(0.32, 10);
    expect(building(r).longTermRate).toBeCloseTo(0.8, 10);
    const n = capNote(r);
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("입력 168개월 → 58개월");
    expect(n[0]).toContain("확인 필요");
    expect(n[0]).not.toMatch(/유리|불리|절감|절세/);
    // 손계산: 토지 과세 양도차익 51,908,261 × 32% = 16,610,643(현행 56% = 29,068,626) → 과세표준 197,301,203 + 12,457,983 = 209,759,186
    //   × 38% − 19,940,000 = 59,768,490 (현행 197,301,203 × 38% − 19,940,000 = 55,034,457)
    expect(land(r).longTermDeduction).toBe(16_610_643);
    expect(r.total.taxBase).toBe(209_759_186);
    expect(r.total.determinedTax).toBe(59_768_490);
  });

  it("구간 입력 겹침 4년(= floor(58 ÷ 12)): 같은 토지 32% · 고지 없음 · 세액 같음", () => {
    const r = run({ landHoldingResidencePeriodYears: 4 });
    expect(land(r).longTermRate).toBeCloseTo(0.32, 10);
    expect(building(r).longTermRate).toBeCloseTo(0.8, 10);
    expect(capNote(r)).toHaveLength(0);
    expect(r.total.determinedTax).toBe(59_768_490);
  });

  it("구간 입력 겹침 0(토지 취득 전에만 거주): 토지 16%(보유분만) · 건물 80%(표2 대상 판정·건물분 불변)", () => {
    const r = run({ landHoldingResidencePeriodYears: 0 });
    expect(land(r).longTermRate).toBeCloseTo(0.16, 10);
    expect(building(r).longTermRate).toBeCloseTo(0.8, 10);
    expect(capNote(r)).toHaveLength(0);
  });

  it("거주가 토지 보유보다 짧은 직접 입력(3년): 상한 미적용 · 토지 28%(16% + 12%) · 고지 없음", () => {
    const r = run({ residencePeriodYears: 3 });
    expect(land(r).longTermRate).toBeCloseTo(0.28, 10);
    expect(capNote(r)).toHaveLength(0);
  });

  it("상한이 깎아도 연수가 같으면(직접 4년 = 보유 4년) 고지 없음 · 토지 32%", () => {
    const r = run({ residencePeriodYears: 4 });
    expect(land(r).longTermRate).toBeCloseTo(0.32, 10);
    expect(capNote(r)).toHaveLength(0);
  });

  it("짝 — 토지가 먼저·같은 날 취득: 상한 없음(거주 14년 그대로 — 토지 80%) · 고지 없음", () => {
    for (const d of ["2000-03-01", "2010-03-01"]) {
      const r = run({ landAcquisitionDate: D(d) });
      expect(land(r).longTermRate, d).toBeCloseTo(0.8, 10);
      expect(capNote(r), d).toHaveLength(0);
    }
  });

  it("비과세 요건 미충족(1세대1주택 아님 — 표1): 토지 표1이라 거주와 무관 · 고지 없음", () => {
    const r = run({ isOneHouseExempt: false });
    expect(capNote(r)).toHaveLength(0);
  });
});

describe("검증 — 엔진 입구(⑫와 같은 leaf)", () => {
  it("토지가 나중이 아닌데 값이 오면 throw · 거주 연수 합계 초과·음수·소수는 throw", () => {
    expect(() => run({ landAcquisitionDate: D("2000-03-01"), landHoldingResidencePeriodYears: 2 })).toThrow(LAND_HOLDING_RESIDENCE_MIXED_GATE_MESSAGE);
    expect(() => run({ landHoldingResidencePeriodYears: 15 })).toThrow(LAND_HOLDING_RESIDENCE_MIXED_EXCEEDS_MESSAGE);
    expect(() => run({ landHoldingResidencePeriodYears: -1 })).toThrow(LAND_HOLDING_RESIDENCE_INVALID_MESSAGE);
    expect(() => run({ landHoldingResidencePeriodYears: 1.5 })).toThrow(LAND_HOLDING_RESIDENCE_INVALID_MESSAGE);
    expect(() => run({ landHoldingResidencePeriodYears: 14 })).not.toThrow();
  });
  it("leaf: mixedLandHoldingResidenceIssue / resolveMixedLandHoldingResidence", () => {
    const a = { residencePeriodYears: 14, landAcquisitionDate: D("2020-03-01"), buildingAcquisitionDate: D("2010-03-01") };
    expect(mixedLandHoldingResidenceIssue(a)).toBeUndefined();
    expect(resolveMixedLandHoldingResidence(a, TD)).toEqual({ years: 4, cap: { directMonths: 168, cappedMonths: 58, landHoldingMonths: 58 } });
    expect(resolveMixedLandHoldingResidence({ ...a, landHoldingResidencePeriodYears: 2 }, TD)).toEqual({ years: 2 });
    expect(resolveMixedLandHoldingResidence({ ...a, landAcquisitionDate: D("2000-03-01") }, TD)).toEqual({ years: 14 });
  });
});
