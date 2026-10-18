/**
 * anchor: 「소득세법」 §104⑤2호 **단서**는 **2019.1.1. 이후 양도분**부터 적용한다 (A1 β, 2026-10-18 사용자 결정).
 *
 * 계획서: docs/02-design/features/transfer-104-5-2-proviso-era.plan.md
 *
 * [법령]
 *   · 2019.1.1. 시행본(법률 제16104호) §104⑤2호 단서 — 「둘 이상의 자산에 대하여 … 동일한 호의 세율이 적용되고,
 *     그 적용세율이 둘 이상인 경우 해당 자산에 대해서는 각 자산의 양도소득과세표준을 합산한 것에 대하여 …
 *     각 해당 호별 세율을 적용하여 산출한 세액 중에서 큰 산출세액의 합계액으로 한다.」
 *   · 같은 법 부칙 제2조② — 「이 법 중 양도소득세에 관한 개정규정은 이 법 시행 후 양도하는 분부터 적용한다.」
 *   · 2018.4.1. 시행본 §104⑤2호 — 「… 계산한 자산별 양도소득 산출세액 합계액」(단서 없음).
 *
 * [β] 2019.1.1. 전 양도분은 **둘 이상의 호에 해당하는 자산(파트)을 합산하지 않는다** — 자산마다 §104① 후단·⑦ 후단으로
 *   큰 세액을 정해 그대로 더한다. 단일 호 자산의 호별 합산(본문 · 기재부 재산세제과-536)은 그대로다.
 *
 * 세율: 연혁 폴백(`loadFallbackTransferRates(양도일)`) — 2018년 주택 1년 미만 40% · §104⑦3호 +20%p · 누진 42% 최고.
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { provisoMergeId } from "@/lib/tax-engine/transfer-tax-rate-clause";
import { buildPublicExpropriationParts } from "@/lib/tax-engine/public-expropriation-reduction";
import { baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

function item(id: string, t: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    transferDate: D(t),
    isOneHousehold: false,
    acquisitionPrice: 0,
    expenses: 0,
    ...o,
  };
}
/** 조정대상지역 3주택 중과 대상 주택 */
const house = (id: string, t: string, gain: number, acq: string) =>
  item(id, t, { propertyType: "housing", acquisitionDate: D(acq), transferPrice: gain, householdHousingCount: 3, isRegulatedArea: true });
const land = (id: string, t: string, gain: number, acq: string, nbl = false) =>
  item(id, t, { propertyType: "land", acquisitionDate: D(acq), transferPrice: gain, householdHousingCount: 0, isRegulatedArea: false, isNonBusinessLand: nbl });

function run(t: string, properties: TransferTaxItemInput[]) {
  return calculateTransferTaxAggregate(
    { taxYear: Number(t.slice(0, 4)), annualBasicDeductionUsed: 2_500_000, properties }, // 기본공제 소진 → 과세표준 = 양도소득금액
    loadFallbackTransferRates(D(t)),
  );
}

describe("A1 β — 2019.1.1. 전 양도분: 복수 호 자산은 합산하지 않는다", () => {
  it("E-1: 1년 미만 3주택 2채, 승자가 갈린다(2018-10-01) — 12,000,000 + 154,600,000 = 166,600,000 (단서 172,600,000)", () => {
    // B 30,000,000: ①3호 40% 12,000,000 > ⑦3호 누진+20%p 9,420,000
    // C 300,000,000: ⑦3호 0.38 × 3억 − 19,400,000 + 60,000,000 = 154,600,000 > ①3호 120,000,000
    const T = "2018-10-01";
    const r = run(T, [house("B", T, 30_000_000, "2018-01-15"), house("C", T, 300_000_000, "2018-01-15")]);
    expect(r.calculatedTaxByGroups).toBe(166_600_000);
    expect(r.calculatedTax).toBe(166_600_000);
  });

  it("E-3: 1년 미만 2채(둘 다 ⑦ 승) + 장기 ⑦3호 1채 — 96,600,000 + 154,600,000 + 40,100,000 = 291,300,000 (단서 314,700,000)", () => {
    const T = "2018-10-01";
    const r = run(T, [
      house("B", T, 200_000_000, "2018-01-15"),
      house("C", T, 300_000_000, "2018-01-15"),
      house("D", T, 100_000_000, "2010-01-01"),
    ]);
    expect(r.calculatedTax).toBe(291_300_000);
  });

  it("E-4: 단기 비사업용 토지 2필지(2017-10-01) — 12,000,000 + 124,600,000 = 136,600,000 (단서 139,600,000)", () => {
    const T = "2017-10-01";
    const r = run(T, [land("Na", T, 30_000_000, "2016-03-01", true), land("Nb", T, 300_000_000, "2016-03-01", true)]);
    expect(r.calculatedTax).toBe(136_600_000);
  });

  it("E-5: 1~2년 사업용 토지 10억 × 2(2018-10-01) — 2호는 800,000,000으로 내려가지만 §104⑤1호 804,600,000이 이긴다(최종 불변)", () => {
    const T = "2018-10-01";
    const r = run(T, [land("L1", T, 1_000_000_000, "2017-03-01"), land("L2", T, 1_000_000_000, "2017-03-01")]);
    expect(r.calculatedTaxByGroups).toBe(800_000_000);
    expect(r.calculatedTaxByGeneral).toBe(804_600_000);
    expect(r.calculatedTax).toBe(804_600_000);
  });

  it("E-5b: 단일 호 자산의 호별 합산(본문 · 예규 536)은 2019 전에도 그대로 — 장기 ⑦3호 2채는 합산 1회", () => {
    // 0.40 × 4억 − 25,400,000 + 0.20 × 4억 = 214,600,000 (자산별 합이면 40,100,000 + 96,600,000 = 136,700,000)
    const T = "2018-10-01";
    const r = run(T, [house("D1", T, 100_000_000, "2010-01-01"), house("D2", T, 300_000_000, "2010-01-01")]);
    expect(r.calculatedTaxByGroups).toBe(214_600_000);
  });

  it("E-6: B를 승자 전환점(99,333,339 → 99,333,340) 양쪽에서 계산해도 1원 차이로 세액이 뛰지 않는다", () => {
    const T = "2018-10-01";
    const at = (b: number) =>
      run(T, [house("B", T, b, "2018-01-15"), house("C", T, 300_000_000, "2018-01-15")]).calculatedTax;
    expect(at(99_333_339)).toBe(194_333_335);
    expect(at(99_333_340) - at(99_333_339)).toBeLessThanOrEqual(2);
  });
});

describe("A1 β — 2019.1.1. 이후 양도분은 단서(합산 후 호별 MAX)를 유지한다", () => {
  it("E-2: E-1과 같은 구조, 2019-01-02 양도 — 합산 3억 3천만 ⑦3호 172,600,000", () => {
    const T = "2019-01-02";
    const r = run(T, [house("B", T, 30_000_000, "2018-01-15"), house("C", T, 300_000_000, "2018-01-15")]);
    expect(r.calculatedTax).toBe(172_600_000);
  });

  it("E-7: 경계 — 2018-12-31 양도는 β, 2019-01-01 양도는 단서", () => {
    const pair = (t: string) => run(t, [house("B", t, 30_000_000, "2018-03-01"), house("C", t, 300_000_000, "2018-03-01")]).calculatedTax;
    expect(pair("2018-12-31")).toBe(166_600_000);
    expect(pair("2019-01-01")).toBe(172_600_000);
  });
});

describe("A1 β — 단건 토지·건물 파트(§104⑤ 본문 후단 «별개의 자산»)도 같은 시행일을 따른다", () => {
  /** 주택 split — 토지 3천만·건물 3억, 둘 다 1년 미만 · 조정 3주택(파트 둘 다 {①3호, ⑦3호}). */
  const split = (t: string) =>
    baseTransferInput({
      propertyType: "housing", transferDate: D(t),
      acquisitionDate: D("2018-01-10"), landAcquisitionDate: D("2018-01-15"),
      transferPrice: 330_000_000, acquisitionPrice: 0,
      landTransferPrice: 30_000_000, buildingTransferPrice: 300_000_000,
      landStandardPriceAtTransfer: 30_000_000, buildingStandardPriceAtTransfer: 300_000_000,
      landAcquisitionPrice: 0, buildingAcquisitionPrice: 0, landAcqMode: "actual", buildingAcqMode: "actual",
      isSeparateAcquisition: true, isOneHousehold: false, householdHousingCount: 3, isRegulatedArea: true,
      expenses: 0, annualBasicDeductionUsed: 2_500_000,
    } as Partial<TransferTaxInput>);

  it("E-8: 2018-10-01 — 파트별 큰 세액의 합 166,600,000 (단서 172,600,000)", () => {
    const t = "2018-10-01";
    expect(calculateTransferTax(split(t), loadFallbackTransferRates(D(t))).calculatedTax).toBe(166_600_000);
  });

  it("E-8b: 2019-01-02 — 단서대로 172,600,000", () => {
    const t = "2019-01-02";
    expect(calculateTransferTax(split(t), loadFallbackTransferRates(D(t))).calculatedTax).toBe(172_600_000);
  });
});

describe("provisoMergeId — 합산 식별자만 갈라지고 호 키는 보존된다", () => {
  const multi = ["104-1-3", "104-7-3"] as const;
  it("2019 전 · 복수 호 → `키#단위`", () => {
    expect(provisoMergeId("104-1-3+104-7-3", multi, D("2018-12-31"), 4)).toBe("104-1-3+104-7-3#4");
  });
  it("2019 이후 · 복수 호 → 키 그대로(단서)", () => {
    expect(provisoMergeId("104-1-3+104-7-3", multi, D("2019-01-01"), 4)).toBe("104-1-3+104-7-3");
  });
  it("2019 전 · 단일 호 → 키 그대로(본문)", () => {
    expect(provisoMergeId("104-7-3", ["104-7-3"], D("2018-12-31"), 4)).toBe("104-7-3");
  });
  it("호 불명(후보 없음) → 키 그대로(`solo-*`는 이미 단위별)", () => {
    expect(provisoMergeId("solo-4", undefined, D("2018-12-31"), 4)).toBe("solo-4");
  });
});

describe("감면 파트 호(`partClauseBasisOf`)는 파트 묶음과 같은 식을 쓴다 (S-3 미러)", () => {
  // 토지·건물 파트가 둘 다 {①1호, ①2호}|40%(1~2년) — 단서 시행 후에는 한 묶음(호 = 자산 전체 → 싣지 않음),
  // 시행 전에는 파트마다 따로라 토지 파트의 호 = 토지 파트 자신이다.
  // ⚠️ §77은 「소급 2년 이전 취득」이 요건이라 실제 신고에서 두 파트가 모두 단기인 감면 자산은 나오지 않는다 —
  //    세 곳(다건 버킷 · 파트 묶음 · 감면 파트 호)이 같은 식을 쓰는지를 구조로 고정한다.
  const part = (kind: "land" | "building", tax: number, base: number) => ({
    kind, calculatedTax: tax, taxBase: base, appliedRate: 0.4, bucketFlatRate: 0.4,
    candidateClauses: ["104-1-1", "104-1-2"], allocatedBasicDeduction: 0,
  });
  const partTax = { chosen: "per_asset", parts: [part("land", 40_000_000, 100_000_000), part("building", 80_000_000, 200_000_000)] };
  const split = {
    land: { gain: 100_000_000, longTermDeduction: 0 },
    building: { gain: 200_000_000, longTermDeduction: 0 },
  };
  const input = (t: string) => ({
    isSeparateAcquisition: true, landAcquisitionDate: D("2017-03-01"), acquisitionDate: D("2017-04-01"),
    selfOwns: "both" as const, transferDate: D(t),
  });
  const build = (t: string) =>
    buildPublicExpropriationParts(input(t), split as never, partTax as never);

  it("2018-10-01 — 토지 파트의 호 = 토지 파트(40,000,000 / 100,000,000)", () => {
    expect(build("2018-10-01")?.land.clauseBasis).toEqual(
      expect.objectContaining({ calculatedTax: 40_000_000, taxBase: 100_000_000 }),
    );
  });
  it("2019-01-02 — 두 파트가 한 묶음이라 싣지 않는다", () => {
    expect(build("2019-01-02")?.land.clauseBasis).toBeUndefined();
  });
});
