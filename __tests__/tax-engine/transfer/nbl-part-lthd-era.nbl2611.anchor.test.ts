/**
 * anchor — 부분 비사업용 자산의 **파트별 장기보유특별공제 연혁** (NBL2611-V5-G1 · 로드맵 R15)
 *
 * ## 결함 (수정 전 master 4edd5de1b — FAIL 상태)
 *
 * 2026-09 H-2가 구현한 «2016.1.1. 전 양도 비사업용 토지 장특 배제»(`isNblLthdExclusionEra`)와 «2016년 양도 2016.1.1. 기산 단서»는
 * **자산 단위**로 걸렸다. 한 필지 중 일부만 비사업용인 자산은 사업용분·상가 건물분까지 장특을 잃었다(과대 과세).
 * 법 §104⑤ 후단은 비사업용 토지와 그 외의 토지로 구분되는 한 필지를 «각각 별개의 자산»으로 본다.
 *
 * ## Pre-Do 실측 (수정 전 · mock 세율 · 양도 10억 / 취득 4억, 2004-01-01 취득)
 *
 * | 시료 | 수정 전 | 정답(독립 검산) | 과대 |
 * |---|---|---|---|
 * | 토지 비사업용 0.4 · 2015-06-01 양도 | 215,010,000 | 169,880,000 | +45,130,000 |
 * | 토지 비사업용 0.4 · 2016-06-01 양도(기산 단서) | 215,010,000 | 169,880,000 | +45,130,000 |
 *
 * ## 독립 검산 — 파트를 별 자산으로 쪼갠 다건 엔진 (C2 방식)
 *
 * 비사업용 파트(면적 비율 몫의 양도가·취득가)는 `isNonBusinessLand: true` 토지 카드, 나머지는 `false` 토지 카드로 만들어 다건 엔진에 넣은 값이
 * 정답이다 — 각 카드가 독립 자산이라 장특·세율을 자기 규칙으로 받는다. 단건 엔진이 같은 값을 내야 한다.
 *
 * ⛔ V5-G2(주택 split·§155⑳ 비사업용 파트에 구 §95② 배제 미적용)는 G-6(2026-07-30 «무시 확정·재제안 금지»)의 범위라 이 파일이 고정하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const d = (s: string) => new Date(s);
const T = 1_000_000_000;
const A = 400_000_000;

const land = (o: Partial<TransferTaxInput>): TransferTaxInput =>
  baseTransferInput({ propertyType: "land", isOneHousehold: false, householdHousingCount: 0, residencePeriodMonths: 0, ...o } as Partial<TransferTaxInput>);

/** 부분 비사업용 토지 단건 */
const partial = (acq: string, tr: string, ratio: number, o: Partial<TransferTaxInput> = {}) =>
  land({ isNonBusinessLand: true, nonBusinessLandAreaRatio: ratio, transferPrice: T, acquisitionPrice: A, acquisitionDate: d(acq), transferDate: d(tr), ...o });

/** 독립 검산 — 비사업용 파트 / 그 밖의 파트를 별 자산(두 카드)으로 다건 엔진에 넣는다. */
function oracle(acq: string, tr: string, ratio: number) {
  const nT = Math.floor(T * ratio);
  const nA = Math.floor(A * ratio);
  const cards = [
    { id: "N", nbl: true, t: nT, a: nA },
    { id: "B", nbl: false, t: T - nT, a: A - nA },
  ].map((c) => ({ ...land({ isNonBusinessLand: c.nbl, transferPrice: c.t, acquisitionPrice: c.a, acquisitionDate: d(acq), transferDate: d(tr) }), propertyId: c.id, propertyLabel: c.id }));
  const r = calculateTransferTaxAggregate({ properties: cards as unknown as TransferTaxItemInput[], taxYear: Number(tr.slice(0, 4)), annualBasicDeductionUsed: 0 }, rates);
  const lthdOf = (id: string) => (r as unknown as { properties: { propertyId: string; longTermHoldingDeduction: number }[] }).properties.find((p) => p.propertyId === id)!.longTermHoldingDeduction;
  return { determined: r.determinedTax, lthdN: lthdOf("N"), lthdB: lthdOf("B") };
}

describe("G1-1 — 비사업용이 아닌 파트는 장특을 잃지 않는다 (2016.1.1. 전 양도)", () => {
  it("2015-06-01 양도 · 비사업용 0.4 — 사업용분 장특 108,000,000, 비사업용분 0 → 169,880,000 (수정 전 215,010,000)", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2015-06-01", 0.4), rates);
    const o = oracle("2004-01-01", "2015-06-01", 0.4);
    expect(o.determined).toBe(169_880_000); // 독립 검산
    expect(r.determinedTax).toBe(o.determined);
    expect(r.longTermHoldingDeduction).toBe(o.lthdN + o.lthdB);
    expect(r.longTermHoldingDeduction).toBe(108_000_000);
    expect(r.nblPartLthd).toMatchObject({
      nonBusinessGain: 240_000_000,
      businessGain: 360_000_000,
      nonBusinessDeduction: 0,
      businessDeduction: 108_000_000,
      nonBusinessExclusionReason: "non_business_land_pre_2016",
      nonBusinessAnchoredTo2016: false,
    });
    // 자산 전체 배제 사유는 싣지 않는다(파트 echo가 말한다)
    expect(r.lthdExclusionReason).toBeUndefined();
  });

  it("비사업용 0.7 — 비사업용 파트가 커도(§104⑤ 2호가 이기는 구간) 같은 파트 모델이 독립 검산과 일치", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2015-06-01", 0.7), rates);
    expect(r.determinedTax).toBe(oracle("2004-01-01", "2015-06-01", 0.7).determined);
  });

  it("비사업용 0.2 — 합산 누진(1호)이 이기는 구간도 일치", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2015-06-01", 0.2), rates);
    expect(r.determinedTax).toBe(oracle("2004-01-01", "2015-06-01", 0.2).determined);
  });

  it("2011년 양도(구 §104①4~10호 괄호기)도 같은 파트 규칙", () => {
    const r = calculateTransferTax(partial("2001-01-01", "2011-06-01", 0.4), rates);
    expect(r.determinedTax).toBe(oracle("2001-01-01", "2011-06-01", 0.4).determined);
    expect(r.nblPartLthd?.nonBusinessDeduction).toBe(0);
  });

  it("경계: 2015-12-31 양도 — 비사업용 파트만 배제", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2015-12-31", 0.4), rates);
    expect(r.determinedTax).toBe(oracle("2004-01-01", "2015-12-31", 0.4).determined);
    expect(r.nblPartLthd?.nonBusinessExclusionReason).toBe("non_business_land_pre_2016");
  });
});

describe("G1-2 — 2016년 양도 기산 단서(§95④)는 비사업용 파트에만", () => {
  it("2016-06-01 양도 · 2004 취득 — 사업용분은 취득일 기산 장특, 비사업용분은 2016.1.1. 기산(보유 3년 미달 0) → 169,880,000 (수정 전 215,010,000)", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2016-06-01", 0.4), rates);
    const o = oracle("2004-01-01", "2016-06-01", 0.4);
    expect(o.determined).toBe(169_880_000);
    expect(r.determinedTax).toBe(o.determined);
    expect(r.nblPartLthd).toMatchObject({ nonBusinessDeduction: 0, businessDeduction: 108_000_000, nonBusinessAnchoredTo2016: true });
    // 배제가 아니라 보유기간 미달 — 사유 echo 없음
    expect(r.nblPartLthd?.nonBusinessExclusionReason).toBeUndefined();
    expect(r.lthdExclusionReason).toBeUndefined();
  });

  it("파트 몫 합이 자산 공제와 같다 — 장특은 단일 값(합)이고 파트 echo는 그 분해다", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2016-06-01", 0.4), rates);
    expect(r.nblPartLthd!.businessDeduction + r.nblPartLthd!.nonBusinessDeduction).toBe(r.longTermHoldingDeduction);
    expect(r.nblPartLthd!.businessGain + r.nblPartLthd!.nonBusinessGain).toBe(r.taxableGain);
  });
});

describe("G1-3 — 규칙이 갈리지 않는 구간은 종전과 같다 (회귀 0)", () => {
  it("2016-03-01 취득 · 2016-12-01 양도 — 두 파트 모두 취득일 기산이라 파트 echo 없음", () => {
    const r = calculateTransferTax(partial("2016-03-01", "2016-12-01", 0.4), rates);
    expect(r.nblPartLthd).toBeUndefined();
  });

  it("2017-06-01 양도(단서 삭제) — 파트 echo 없음, 자산 단위 표1 그대로", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2017-06-01", 0.4), rates);
    expect(r.nblPartLthd).toBeUndefined();
    expect(r.determinedTax).toBe(oracle("2004-01-01", "2017-06-01", 0.4).determined);
  });

  it("현행(2024) 양도 — 파트 echo 없음 · 독립 검산과 일치(141,060,000)", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2024-06-01", 0.4), rates);
    expect(r.nblPartLthd).toBeUndefined();
    expect(r.determinedTax).toBe(141_060_000);
    expect(oracle("2004-01-01", "2024-06-01", 0.4).determined).toBe(141_060_000);
  });

  it("전량 비사업용(비율 1)은 종전대로 자산 전체 배제 — H-2 불변", () => {
    const r = calculateTransferTax(land({ isNonBusinessLand: true, transferPrice: T, acquisitionPrice: A, acquisitionDate: d("2004-01-01"), transferDate: d("2015-06-01") }), rates);
    expect(r.nblPartLthd).toBeUndefined();
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("non_business_land_pre_2016");
  });

  it("비사업용이 아닌 토지는 시기와 무관하게 배제되지 않는다", () => {
    const r = calculateTransferTax(land({ isNonBusinessLand: false, transferPrice: T, acquisitionPrice: A, acquisitionDate: d("2004-01-01"), transferDate: d("2015-06-01") }), rates);
    expect(r.nblPartLthd).toBeUndefined();
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("보유 3년 미만(사업용분도 장특 0) — 파트 echo는 있으나 공제 0, 세액은 파트 독립 검산과 일치", () => {
    const r = calculateTransferTax(partial("2013-01-01", "2015-06-01", 0.4), rates);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.determinedTax).toBe(oracle("2013-01-01", "2015-06-01", 0.4).determined);
  });

  it("양도차손 — 장특 대상 아님(파트 echo 없음)", () => {
    const r = calculateTransferTax(partial("2004-01-01", "2015-06-01", 0.4, { transferPrice: 300_000_000, acquisitionPrice: A }), rates);
    expect(r.nblPartLthd).toBeUndefined();
    expect(r.determinedTax).toBe(0);
  });
});

describe("G1-4 — 다건(일괄) 입구도 같은 파트 규칙·같은 세액", () => {
  const item = (o: Partial<TransferTaxInput>) => ({ ...o, propertyId: "P1", propertyLabel: "P1" }) as unknown as TransferTaxItemInput;
  const agg = (props: TransferTaxItemInput[], tr: string) => calculateTransferTaxAggregate({ properties: props, taxYear: Number(tr.slice(0, 4)), annualBasicDeductionUsed: 0 }, rates);

  it("부분 비사업용 단건 1건짜리 다건 = 단건 결정세액 (2015 · 2016)", () => {
    for (const tr of ["2015-06-01", "2016-06-01"]) {
      const single = calculateTransferTax(partial("2004-01-01", tr, 0.4), rates);
      expect(agg([item(partial("2004-01-01", tr, 0.4))], tr).determinedTax).toBe(single.determinedTax);
    }
  });

  it("부분 비사업용 + 일반 토지 2건 — 건별 판정 유지(다건 합 = 독립 검산 3카드)", () => {
    const tr = "2015-06-01";
    const plain = { ...land({ transferPrice: 300_000_000, acquisitionPrice: 100_000_000, acquisitionDate: d("2004-01-01"), transferDate: d(tr) }), propertyId: "L2", propertyLabel: "L2" } as unknown as TransferTaxItemInput;
    const got = agg([item(partial("2004-01-01", tr, 0.4)), plain], tr).determinedTax;
    const nT = Math.floor(T * 0.4);
    const nA = Math.floor(A * 0.4);
    const cards = [
      { id: "N", nbl: true, t: nT, a: nA },
      { id: "B", nbl: false, t: T - nT, a: A - nA },
    ].map((c) => ({ ...land({ isNonBusinessLand: c.nbl, transferPrice: c.t, acquisitionPrice: c.a, acquisitionDate: d("2004-01-01"), transferDate: d(tr) }), propertyId: c.id, propertyLabel: c.id }) as unknown as TransferTaxItemInput);
    expect(got).toBe(agg([...cards, plain], tr).determinedTax);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 상가(CB) — 비사업용 파트 = 토지분 양도차익 × 초과 비율. 건물분·사업용 토지분은 비사업용이 아니다.
// ─────────────────────────────────────────────────────────────────────────────
describe("G1-5 — 상가: 건물분·사업용 토지분은 2016.1.1. 전 양도에도 장특을 받는다", () => {
  const CT = 1_200_000_000;
  const CA = 600_000_000;
  const cbStd = (tl: number, al: number) => ({
    transferLandStd: Math.round(1e9 * tl),
    transferBuildingStd: Math.round(1e9 * (1 - tl)),
    acquisitionLandStd: Math.round(1e9 * al),
    acquisitionBuildingStd: Math.round(1e9 * (1 - al)),
  });
  const EXCESS_75 = { totalLandArea: 2400, totalBuildingFootprintArea: 200, zoneType: "commercial" };
  const cb = (acq: string, tr: string, cal: object): TransferTaxInput =>
    baseTransferInput({
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      acquisitionDate: d(acq),
      transferDate: d(tr),
      propertyType: "commercial_building",
      transferPrice: CT,
      acquisitionPrice: CA,
      commercialAppurtenantLand: cal,
    } as Partial<TransferTaxInput>);

  /** 독립 검산 — 토지(비사업용) / 토지(사업용) / 건물 3자산을 다건 엔진에 넣는다. `tl`·`al` = 토지 몫, `fr` = 토지분 중 비사업용 몫. */
  function cbOracle(acq: string, tr: string, tl: number, al: number, fr: [number, number]) {
    const Tl = Math.floor(CT * tl);
    const Al = Math.floor(CA * al);
    const nT = Math.floor((Tl * fr[0]) / fr[1]);
    const nA = Math.floor((Al * fr[0]) / fr[1]);
    const cards = [
      { id: "N", type: "land", nbl: true, t: nT, a: nA },
      { id: "L", type: "land", nbl: false, t: Tl - nT, a: Al - nA },
      { id: "B", type: "building", nbl: false, t: CT - Tl, a: CA - Al },
    ]
      .filter((c) => c.t > 0 || c.a > 0)
      .map((c) => ({ ...baseTransferInput({ isOneHousehold: false, householdHousingCount: 0, residencePeriodMonths: 0, acquisitionDate: d(acq), transferDate: d(tr), propertyType: c.type, isNonBusinessLand: c.nbl, transferPrice: c.t, acquisitionPrice: c.a } as Partial<TransferTaxInput>), propertyId: c.id, propertyLabel: c.id }));
    return calculateTransferTaxAggregate({ properties: cards as unknown as TransferTaxItemInput[], taxYear: Number(tr.slice(0, 4)), annualBasicDeductionUsed: 0 }, rates).determinedTax;
  }

  it("2015-06-01 양도 · 초과 0.75 · 토지 몫 80% — 건물분·사업용 토지분 장특 유지, 비사업용 파트만 배제", () => {
    const r = calculateTransferTax(cb("2004-06-01", "2015-06-01", { ...EXCESS_75, partBasis: cbStd(0.8, 0.8) }), rates);
    expect(r.nblPartLthd).toBeDefined();
    expect(r.nblPartLthd!.nonBusinessDeduction).toBe(0);
    expect(r.nblPartLthd!.businessDeduction).toBeGreaterThan(0);
    expect(r.determinedTax).toBe(cbOracle("2004-06-01", "2015-06-01", 0.8, 0.8, [3, 4]));
  });

  it("2016-06-01 양도 · 2004 취득 — 기산 단서는 비사업용 파트에만", () => {
    const r = calculateTransferTax(cb("2004-06-01", "2016-06-01", { ...EXCESS_75, partBasis: cbStd(0.8, 0.8) }), rates);
    expect(r.nblPartLthd?.nonBusinessAnchoredTo2016).toBe(true);
    expect(r.determinedTax).toBe(cbOracle("2004-06-01", "2016-06-01", 0.8, 0.8, [3, 4]));
  });

  it("무허가 단서(전량 비사업용 토지분) · 토지 몫 60% — 건물분(40%)은 장특 유지", () => {
    const r = calculateTransferTax(cb("2004-06-01", "2015-06-01", { totalLandArea: 1200, totalBuildingFootprintArea: 200, unapprovedBuilding: true, partBasis: cbStd(0.6, 0.6) }), rates);
    expect(r.determinedTax).toBe(cbOracle("2004-06-01", "2015-06-01", 0.6, 0.6, [1, 1]));
  });

  it("토지분 양도차손이라 비사업용 파트에 소득이 없으면(STEP 0.35가 isNonBusinessLand를 끈다) 건물 장특이 배제되지 않는다 — C2 남은 한계", () => {
    // 토지 양도 240M − 취득 360M = −120M (비사업용 파트 소득 없음). 종전 STEP 0.9 입력은 STEP 0.62가 켠 isNonBusinessLand=true를 들고 있어 자산 전체 배제(lthd=0).
    const r = calculateTransferTax(cb("2004-06-01", "2015-06-01", { ...EXCESS_75, partBasis: cbStd(0.2, 0.6) }), rates);
    expect(r.commercialNblPart?.applied).toBe(false);
    expect(r.lthdExclusionReason).toBeUndefined();
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("현행(2024) 양도는 종전과 같다 — 파트 echo 없음", () => {
    const r = calculateTransferTax(cb("2014-06-01", "2024-06-01", { ...EXCESS_75, partBasis: cbStd(0.8, 0.8) }), rates);
    expect(r.nblPartLthd).toBeUndefined();
    expect(r.determinedTax).toBe(cbOracle("2014-06-01", "2024-06-01", 0.8, 0.8, [3, 4]));
  });
  it("토지분·건물분 부호가 다르면(건물분 양도차손) 확인 필요 고지 — 같은 부호면 고지 없음 (C2 남은 한계 · 세액 불변)", () => {
    const UNAPPROVED = { totalLandArea: 1200, totalBuildingFootprintArea: 200, unapprovedBuilding: true };
    const mixed = calculateTransferTax(cb("2004-06-01", "2015-06-01", { ...UNAPPROVED, partBasis: cbStd(0.9, 0.4) }), rates);
    expect(mixed.commercialNblPart).toMatchObject({ applied: true, landGain: 840_000_000, buildingGain: -240_000_000 });
    expect(mixed.warnings?.some((w) => w.includes("부호가 달라"))).toBe(true);
    const same = calculateTransferTax(cb("2004-06-01", "2015-06-01", { ...UNAPPROVED, partBasis: cbStd(0.6, 0.6) }), rates);
    expect(same.warnings?.some((w) => w.includes("부호가 달라"))).toBe(false);
  });
});
