/**
 * anchor — 상가 부수토지 초과분의 비사업용 파트 = **토지분 양도차익** (NBL2611-V5-BX01 · 로드맵 R14)
 *
 * ## 결함 (수정 전)
 *
 * STEP 0.62가 「초과 대지면적 ÷ 집합건물 전체 대지면적」을 상가 1호 **자산 전체**(구분소유 건물 + 대지권)의 비율로 주입했다.
 * 건물분 양도소득에도 §104①8호 +10%p가 붙었다. 비사업용 토지는 «토지»뿐이다(법 §104의3① · 저장소 M-12).
 *
 * ## Pre-Do 실측 (수정 전 master d543bfba6 — FAIL 상태)
 *
 * mock 세율 · 양도 12억 / 취득 6억 · 2014-06-01 → 2024-06-01(10년) · 기준 세액(초과 없음) 165,060,000.
 *
 * | 시료 | 수정 전 | 정답(독립 검산) | 과대 |
 * |---|---|---|---|
 * | 초과 0.75 · 토지 몫 60% | 179,370,000 | 165,060,000 | +14,310,000 |
 * | 초과 0.75 · 토지 몫 80% | 179,370,000 | 170,120,000 | +9,250,000 |
 * | 무허가 단서(전량) · 토지 몫 60% | 212,810,000 | 170,120,000 | +42,690,000 |
 * | 무허가 단서(전량) · 토지 몫 40% | 212,810,000 | 165,060,000 | +47,750,000 |
 *
 * (리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §1.8의 +14,310,000 · +42,690,000 · +47,750,000이 그대로 재현된다.)
 *
 * ## 독립 검산 — 3카드 다건 모델
 *
 * 정답은 이 엔진의 단건 경로가 아니라 **토지-비사업용 / 토지-사업용 / 건물 3자산을 따로 만들어 다건 엔진에 넣은 값**이다
 * (일반건물이 쓰는 카드 모델 — 각 카드가 독립 자산이라 건물에 중과가 붙을 수 없다). 비사업용 카드 금액 = 토지분 × 초과 비율.
 *
 * ## 실효 비율 ≈ 0.45 이하는 §104⑤ 1호(합산 누진)가 흡수한다
 *
 * 비사업용 파트가 자산 양도소득의 45% 이하면 파트별 합(2호)이 전체 누진(1호)을 넘지 못해 세액 차이가 0이다(리뷰 §1.8 «흡수 구간»).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const d = (s: string) => new Date(s);
const T = 1_200_000_000;
const A = 600_000_000;
const BASE_CALC = 165_060_000; // 초과 없는 같은 상가의 산출세액

const common = {
  isOneHousehold: false,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  acquisitionDate: d("2014-06-01"),
  transferDate: d("2024-06-01"),
};

/** 기준시가 4값 — 양도 당시 토지 몫 `tl`, 취득 당시 토지 몫 `al`(소수 → 10억 기준 정수) */
const std = (tl: number, al: number) => ({
  transferLandStd: Math.round(1e9 * tl),
  transferBuildingStd: Math.round(1e9 * (1 - tl)),
  acquisitionLandStd: Math.round(1e9 * al),
  acquisitionBuildingStd: Math.round(1e9 * (1 - al)),
});

/** 초과 0.75 — 전체 대지 2,400 · 바닥 200 · 상업 3배(기준 600㎡) */
const EXCESS_75 = { totalLandArea: 2400, totalBuildingFootprintArea: 200, zoneType: "commercial" };
/** 무허가 단서 — 배율 무관 전량 비사업용(초과 비율 1) */
const UNAPPROVED = { totalLandArea: 1200, totalBuildingFootprintArea: 200, unapprovedBuilding: true };

const cb = (cal: object, o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({ ...common, propertyType: "commercial_building", transferPrice: T, acquisitionPrice: A, commercialAppurtenantLand: cal, ...o } as Partial<TransferTaxInput>);

/**
 * 독립 검산 — 토지(비사업용) / 토지(사업용) / 건물을 **세 자산**으로 만들어 다건 엔진에 넣는다.
 * `tl`·`al` = 토지 몫(양도·취득), `fr` = 토지분 중 비사업용 몫(초과 면적 비율).
 */
function oracleDetermined(tl: number, al: number, fr: [number, number], extra: Partial<TransferTaxInput> = {}): number {
  const Tl = Math.floor(T * tl);
  const Al = Math.floor(A * al);
  const nT = Math.floor((Tl * fr[0]) / fr[1]);
  const nA = Math.floor((Al * fr[0]) / fr[1]);
  const cards = [
    { id: "N", type: "land", nbl: true, t: nT, a: nA },
    { id: "L", type: "land", nbl: false, t: Tl - nT, a: Al - nA },
    { id: "B", type: "building", nbl: false, t: T - Tl, a: A - Al },
  ]
    .filter((c) => c.t > 0 || c.a > 0)
    .map((c) => baseTransferInput({ ...common, propertyId: c.id, propertyLabel: c.id, propertyType: c.type, isNonBusinessLand: c.nbl, transferPrice: c.t, acquisitionPrice: c.a, ...extra } as Partial<TransferTaxInput>));
  return calculateTransferTaxAggregate({ properties: cards as unknown as TransferTaxItemInput[], taxYear: 2024, annualBasicDeductionUsed: 0 }, rates).determinedTax;
}

describe("BX01-1 — 건물분에는 +10%p가 붙지 않는다 (단건)", () => {
  it("초과 0.75 · 토지 몫 60% → 실효 0.45 — 합산 누진이 흡수해 초과 없는 세액과 같다 (수정 전 +14,310,000)", () => {
    const r = calculateTransferTax(cb({ ...EXCESS_75, partBasis: std(0.6, 0.6) }), rates);
    expect(r.calculatedTax).toBe(BASE_CALC);
    expect(oracleDetermined(0.6, 0.6, [3, 4])).toBe(BASE_CALC); // 독립 검산
    // 파트 echo — 토지분 360,000,000 · 건물분 240,000,000 · 비사업용 파트 = 토지분 × 0.75 = 270,000,000
    expect(r.commercialNblPart).toMatchObject({ landGain: 360_000_000, buildingGain: 240_000_000, nonBusinessGain: 270_000_000, totalGain: 600_000_000, applied: true });
    expect(r.commercialNblPart?.injected.nonBusinessLandPartShare).toEqual({ numerator: 270_000_000, denominator: 600_000_000 });
  });

  it("초과 0.75 · 토지 몫 80% → 실효 0.60 — 토지분에만 중과 170,120,000 (수정 전 179,370,000)", () => {
    const r = calculateTransferTax(cb({ ...EXCESS_75, partBasis: std(0.8, 0.8) }), rates);
    expect(r.calculatedTax).toBe(170_120_000);
    expect(oracleDetermined(0.8, 0.8, [3, 4])).toBe(170_120_000);
  });

  it("무허가 단서 · 토지 몫 60% → 비사업용 파트 = 토지분 전부 — 170,120,000 (수정 전 212,810,000)", () => {
    const r = calculateTransferTax(cb({ ...UNAPPROVED, partBasis: std(0.6, 0.6) }), rates);
    expect(r.calculatedTax).toBe(170_120_000);
    expect(oracleDetermined(0.6, 0.6, [1, 1])).toBe(170_120_000);
  });

  it("무허가 단서 · 토지 몫 40% → 실효 0.40 — 흡수되어 중과 없음 165,060,000 (수정 전 212,810,000)", () => {
    const r = calculateTransferTax(cb({ ...UNAPPROVED, partBasis: std(0.4, 0.4) }), rates);
    expect(r.calculatedTax).toBe(BASE_CALC);
    expect(oracleDetermined(0.4, 0.4, [1, 1])).toBe(BASE_CALC);
  });

  it("양도·취득 몫이 달라 토지·건물 양도차익 비율이 가액 비율과 다르다 — 양도 70% / 취득 40% (토지 차익 600M · 건물 차익 0)", () => {
    // 토지 양도 840M − 취득 240M = 600M, 건물 양도 360M − 취득 360M = 0. 스칼라(초과비율 × 가액 몫)로는 이 차이를 못 잡는다.
    const r = calculateTransferTax(cb({ ...EXCESS_75, partBasis: std(0.7, 0.4) }), rates);
    expect(r.commercialNblPart).toMatchObject({ landGain: 600_000_000, buildingGain: 0, nonBusinessGain: 450_000_000 });
    expect(r.calculatedTax).toBe(oracleDetermined(0.7, 0.4, [3, 4]));
  });
});

describe("BX01-2 — 양도차손·혼재 부호 경계", () => {
  it("토지분 양도차손이면 비사업용 파트에 소득이 없다 — 중과하지 않고 echo에 사유가 남는다", () => {
    // 토지 양도 240M − 취득 360M = −120M, 건물 960M − 240M = 720M. 총 600M.
    const r = calculateTransferTax(cb({ ...EXCESS_75, partBasis: std(0.2, 0.6) }), rates);
    expect(r.commercialNblPart).toMatchObject({ landGain: -120_000_000, nonBusinessGain: 0, applied: false });
    expect(r.commercialNblPart?.injected).toEqual({ isNonBusinessLand: false });
    expect(r.calculatedTax).toBe(BASE_CALC); // 초과 없는 같은 상가와 같다 — 자산 단위 장특·세율(기존 단건 규약)
  });

  it("건물분 양도차손 + 무허가 단서 — 비사업용 파트가 자산 양도차익을 넘으면 전량 비사업용(비율 1)으로 둔다", () => {
    // 토지 1,080M − 240M = 840M, 건물 120M − 360M = −240M. 총 600M < 토지분 840M.
    const r = calculateTransferTax(cb({ ...UNAPPROVED, partBasis: std(0.9, 0.4) }), rates);
    expect(r.commercialNblPart).toMatchObject({ landGain: 840_000_000, buildingGain: -240_000_000, nonBusinessGain: 840_000_000 });
    expect(r.commercialNblPart?.injected).toEqual({ isNonBusinessLand: true, nonBusinessLandAreaRatio: 1 });
  });
});

describe("BX01-3 — 필수 입력(자동 안분 fallback 금지)", () => {
  it("초과분이 있는데 partBasis가 없으면 엔진이 거부한다", () => {
    expect(() => calculateTransferTax(cb({ ...EXCESS_75 }), rates)).toThrow(/토지·건물 기준시가 4값/);
    expect(() => calculateTransferTax(cb({ ...UNAPPROVED }), rates)).toThrow(/자동 안분하지 않습니다/);
  });

  it("초과분이 없으면 partBasis를 쓰지 않는다 — 입력해도 세액·echo 불변", () => {
    const within = { totalLandArea: 1200, totalBuildingFootprintArea: 200, zoneType: "green" };
    const a = calculateTransferTax(cb(within), rates);
    const b = calculateTransferTax(cb({ ...within, partBasis: std(0.6, 0.6) }), rates);
    expect(b.calculatedTax).toBe(a.calculatedTax);
    expect(b.commercialNblPart).toBeUndefined();
  });

  it("기준시가 합이 0이면 거부한다", () => {
    expect(() => calculateTransferTax(cb({ ...EXCESS_75, partBasis: { ...std(0.6, 0.6), acquisitionLandStd: 0, acquisitionBuildingStd: 0 } }), rates)).toThrow(/합이 0보다/);
  });
});

describe("BX01-4 — 필요경비·환산 모드도 같은 규칙", () => {
  it("자본적지출은 취득 당시 비율, 양도비는 양도가액 비율로 나눈다 (실가 모드)", () => {
    // 자본적지출 50M(취득 토지 몫 40%) + 양도비 30M(양도 토지 몫 80%) → 토지분 경비 20M + 24M = 44M
    const r = calculateTransferTax(cb({ ...EXCESS_75, partBasis: std(0.8, 0.4) }, { capitalExpenditure: 50_000_000, transferExpense: 30_000_000 }), rates);
    expect(r.commercialNblPart?.expenses).toEqual({ land: 44_000_000, building: 36_000_000 });
    // 양도 960M−취득 240M−경비 44M = 676M · 건물 240M−360M−36M = −156M · 총 520M
    expect(r.commercialNblPart).toMatchObject({ landGain: 676_000_000, buildingGain: -156_000_000, totalGain: 520_000_000 });
  });

  it("§97②2호 단서(swap)·환산 모드는 같은 입력의 실가 표현과 세액이 같다 — 환산취득가·개산공제를 그대로 토지분·건물분으로 나눈다", () => {
    // 환산: 양도 12억 · 취득시 호별총액 / 양도시 호별총액 비율. 같은 결과를 실가(취득가·개산공제)로 표현하면 세액이 같아야 한다.
    const est = calculateTransferTax(
      cb(
        { ...EXCESS_75, partBasis: std(0.8, 0.8) },
        {
          useEstimatedAcquisition: true,
          acquisitionPrice: 0,
          commercialBuildingValuation: {
            isPreDisclosure: false,
            exclusiveArea: 100,
            commonArea: 50,
            landArea: 30,
            unitPriceAtTransfer: 8_000_000,
            unitPriceAtAcquisition: 4_000_000,
            landPriceAtTransfer: 1_000_000,
            landPriceAtAcquisition: 500_000,
          },
        } as Partial<TransferTaxInput>,
      ),
      rates,
    );
    const detail = est.commercialBuildingValuationDetail!;
    const asActual = calculateTransferTax(
      cb(
        { ...EXCESS_75, partBasis: std(0.8, 0.8) },
        { acquisitionPrice: detail.estimatedAcquisitionTotal, expenses: detail.estimatedDeductionTotal },
      ),
      rates,
    );
    expect(est.calculatedTax).toBe(asActual.calculatedTax);
    expect(est.commercialNblPart?.landGain).toBe(asActual.commercialNblPart?.landGain);
    // 개산공제는 취득 당시 비율(80%)로 나뉜다
    expect(est.commercialNblPart?.expenses.land).toBe(Math.floor((detail.estimatedDeductionTotal * 0.8)));
  });
});

describe("BX01-5 — 다건(일괄) 입구도 같은 파트 규칙을 쓴다", () => {
  const plain = (): TransferTaxItemInput =>
    ({ ...baseTransferInput({ ...common, propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 200_000_000 }), propertyId: "L1", propertyLabel: "L1" }) as unknown as TransferTaxItemInput;
  const agg = (cal: object) =>
    calculateTransferTaxAggregate(
      { properties: [{ ...cb(cal), propertyId: "CB1", propertyLabel: "CB1" } as unknown as TransferTaxItemInput, plain()], taxYear: 2024, annualBasicDeductionUsed: 0 },
      rates,
    );

  it("무허가 단서 · 토지 몫 60%: 단건과 같은 파트 — 다건 결정세액이 수정 전(건물분까지 중과)보다 작고 3카드 독립 검산과 같다", () => {
    const got = agg({ ...UNAPPROVED, partBasis: std(0.6, 0.6) }).determinedTax;
    // 같은 번들을 3카드(토지-비사업용·토지-사업용·건물) + 일반 토지로 만든 독립 검산
    const cards = [
      { id: "N", type: "land", nbl: true, t: Math.floor(T * 0.6), a: Math.floor(A * 0.6) },
      { id: "B", type: "building", nbl: false, t: T - Math.floor(T * 0.6), a: A - Math.floor(A * 0.6) },
    ].map((c) => baseTransferInput({ ...common, propertyId: c.id, propertyLabel: c.id, propertyType: c.type, isNonBusinessLand: c.nbl, transferPrice: c.t, acquisitionPrice: c.a } as Partial<TransferTaxInput>));
    const oracle = calculateTransferTaxAggregate({ properties: [...cards, baseTransferInput({ ...common, propertyId: "L1", propertyLabel: "L1", propertyType: "land", transferPrice: 300_000_000, acquisitionPrice: 200_000_000 } as Partial<TransferTaxInput>)] as unknown as TransferTaxItemInput[], taxYear: 2024, annualBasicDeductionUsed: 0 }, rates).determinedTax;
    expect(got).toBe(oracle);
  });

  it("다건 재계산은 단건 echo(injected)를 그대로 쓴다 — 건물분 양도차손 + 전량 비사업용이면 비율 1", () => {
    const r = agg({ ...UNAPPROVED, partBasis: std(0.9, 0.4) });
    expect(r.properties[0].surchargeRate ?? 0).toBeGreaterThan(0);
  });

  it("초과 없는 상가는 다건에서도 중과가 붙지 않는다 (회귀 가드)", () => {
    const r = agg({ totalLandArea: 300, totalBuildingFootprintArea: 200, zoneType: "general_residential", partBasis: std(0.6, 0.6) });
    expect(r.properties[0].surchargeRate ?? 0).toBe(0);
  });
});
