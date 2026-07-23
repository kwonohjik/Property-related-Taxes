/**
 * anchor: PHD 3시점 일괄 산출 — Phase 2 겸용(Option B)
 *  - housing 3시점(부분 1개=단일 point / 2개↑=compositeParts 합산)
 *  - commercial 양도시에만(취득·최초공시 상가는 배치 미산출)
 *  - ≤2000 취득: 단일 부분 acqBase 지원, 다부분 미지원(C1)
 *
 * 기대값은 매직넘버 대신 calcBuildingStandardPrice 직접호출 등가성으로 고정.
 */
import { describe, it, expect } from "vitest";
import { computePhdThreePointStdPrice } from "../../lib/calc/phd-building-std-batch";
import { calcBuildingStandardPrice } from "../../lib/tax-engine/building-standard-price";

// 시점별 구조·용도(≥2003 안정 체계 — 3시점 동일 usageNo). 주택 usageNo=2.
const tp = (usageNo: number) => ({ structureKey: "rc", usageNo });
const H = (floorArea: number) => ({
  floorArea,
  category: "housing" as const,
  acquisition: tp(2),
  firstDisclosure: tp(2),
  transfer: tp(2),
});
// Case B 상가(취득·최초공시 미지정 — 양도만). usageNo=41.
const C = (floorArea: number) => ({
  floorArea,
  category: "commercial" as const,
  transfer: tp(41),
});

const ACQ = { year: 2014, landPricePerM2: 2_360_000 };
const FIRST = { year: 2016, landPricePerM2: 2_369_000 };
const TRANSFER = { year: 2025, landPricePerM2: 3_486_000 };

// 시점별 part → 양도 시점 flat(구조·용도 3시점 동일이라 등가 비교에 transfer 사용)
const flat = (p: { floorArea: number; transfer: { structureKey: string; usageNo: number } }) => ({
  structureKey: p.transfer.structureKey,
  usageNo: p.transfer.usageNo,
  floorArea: p.floorArea,
});

// 엔진 직접호출 — 복합/단일 valuation
function directComposite(parts: { structureKey: string; usageNo: number; floorArea: number }[], year: number, land: number, builtYear: number) {
  if (parts.length === 1) {
    return calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: parts[0].floorArea,
      builtYear,
      valuationYear: year,
      valuation: { structureKey: parts[0].structureKey, usageNo: parts[0].usageNo, landPricePerM2: land },
    }).valuation?.standardPrice;
  }
  return calcBuildingStandardPrice({
    taxType: "inheritance_gift",
    floorArea: parts.reduce((s, p) => s + p.floorArea, 0),
    builtYear,
    valuationYear: year,
    valuation: { structureKey: parts[0].structureKey, usageNo: parts[0].usageNo, landPricePerM2: land },
    compositeParts: parts.map((p) => ({ structureKey: p.structureKey, usageNo: p.usageNo, floorArea: p.floorArea })),
  }).compositeTotal;
}

describe("computePhdThreePointStdPrice — 겸용 Option B", () => {
  it("A1: 층별 구조 다부분 housing 3시점 산출 + 취득/최초공시 commercial 미산출", () => {
    const parts = [H(120), H(80)];
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 2010, parts },
      acquisition: ACQ,
      firstDisclosure: FIRST,
      transfer: TRANSFER,
    });
    expect(r.acquisition?.housing).toBeGreaterThan(0);
    expect(r.firstDisclosure?.housing).toBeGreaterThan(0);
    expect(r.transfer?.housing).toBeGreaterThan(0);
    // commercial 없음
    expect(r.acquisition?.commercial).toBeUndefined();
    expect(r.firstDisclosure?.commercial).toBeUndefined();
    expect(r.transfer?.commercial).toBeUndefined();
    // 엔진 복합 등가성
    expect(r.transfer?.housing).toBe(directComposite(parts.map(flat), 2025, TRANSFER.landPricePerM2, 2010));
    expect(r.acquisition?.housing).toBe(directComposite(parts.map(flat), 2014, ACQ.landPricePerM2, 2010));
  });

  it("A2: 단일 부분 housing = 단일 valuation point 등가(Phase 1 회귀)", () => {
    const parts = [H(100)];
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 2010, parts },
      transfer: TRANSFER,
    });
    expect(r.transfer?.housing).toBe(directComposite(parts.map(flat), 2025, TRANSFER.landPricePerM2, 2010));
    expect(r.transfer?.housing).toBeGreaterThan(0);
  });

  it("A3: ≤2000 취득 + housing 다부분(단일 산정기준율 그룹) → 복합 acqBase 산출(Phase 2B 배치 확장)", () => {
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 1998, parts: [H(120), H(80)] },
      acquisition: { year: 1998, landPricePerM2: 500_000 },
      firstDisclosure: FIRST,
      transfer: TRANSFER,
    });
    // 배치 엔진 확장(acqBaseStdPrice 복합 위임) — 단일 구조그룹(rc) 다부분도 산정기준율 산출.
    expect(r.acquisition?.housing).toBeGreaterThan(0);
    expect(r.unsupported.some((u) => u.point === "acquisition" && u.category === "housing")).toBe(false);
    expect(r.firstDisclosure?.housing).toBeGreaterThan(0);
    expect(r.transfer?.housing).toBeGreaterThan(0);
  });

  it("A4: commercial 부분 → 양도시에만 산출, 취득/최초공시 commercial undefined", () => {
    const commercialParts = [C(80)];
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 2010, parts: [H(120), C(80)] },
      acquisition: ACQ,
      firstDisclosure: FIRST,
      transfer: TRANSFER,
    });
    expect(r.transfer?.commercial).toBeGreaterThan(0);
    expect(r.transfer?.commercial).toBe(directComposite(commercialParts.map(flat), 2025, TRANSFER.landPricePerM2, 2010));
    expect(r.acquisition?.commercial).toBeUndefined();
    expect(r.firstDisclosure?.commercial).toBeUndefined();
    // housing은 3시점
    expect(r.acquisition?.housing).toBeGreaterThan(0);
    expect(r.transfer?.housing).toBeGreaterThan(0);
  });

  it("A5: Case A — 상가.acquisition/firstDisclosure=주택 구조·용도 시 취득·최초공시 상가 = 주택 용도지수(재일46014-2396)", () => {
    // 양도시 상가 용도(#14, 용도지수가 주택 #2와 명확히 다름)이나 취득·최초공시 당시엔 주택(#2)이었음
    const COMM = 14;
    const commercialCaseA = {
      floorArea: 80,
      category: "commercial" as const,
      transfer: tp(COMM),
      acquisition: tp(2), // 당시 주택 용도
      firstDisclosure: tp(2),
    };
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 2010, parts: [H(120), commercialCaseA] },
      acquisition: ACQ,
      firstDisclosure: FIRST,
      transfer: TRANSFER,
    });
    // 취득·최초공시 상가 산출됨(주택 용도 #2로 평가)
    expect(r.acquisition?.commercial).toBeGreaterThan(0);
    expect(r.firstDisclosure?.commercial).toBeGreaterThan(0);
    // 등가: 취득·최초공시 상가 = 상가면적을 주택 용도(#2)로 valuation
    expect(r.acquisition?.commercial).toBe(
      directComposite([{ structureKey: "rc", usageNo: 2, floorArea: 80 }], 2014, ACQ.landPricePerM2, 2010),
    );
    expect(r.firstDisclosure?.commercial).toBe(
      directComposite([{ structureKey: "rc", usageNo: 2, floorArea: 80 }], 2016, FIRST.landPricePerM2, 2010),
    );
    // 양도 상가 = 상가 용도(#14) 그대로
    expect(r.transfer?.commercial).toBe(
      directComposite([{ structureKey: "rc", usageNo: COMM, floorArea: 80 }], 2025, TRANSFER.landPricePerM2, 2010),
    );
    // mapping 실증: 취득 상가(주택 용도 #2) ≠ 상가 용도(#14)로 평가한 값
    const acqAsCommercial = directComposite([{ structureKey: "rc", usageNo: COMM, floorArea: 80 }], 2014, ACQ.landPricePerM2, 2010);
    expect(r.acquisition?.commercial).not.toBe(acqAsCommercial);
  });

  it("A6(회귀): 상가 acquisition/firstDisclosure 미지정(Case B·단독) → 취득·최초공시 상가 미산출", () => {
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 2010, parts: [H(120), C(80)] }, // C=취득·최초공시 시점 미지정
      acquisition: ACQ,
      firstDisclosure: FIRST,
      transfer: TRANSFER,
    });
    expect(r.acquisition?.commercial).toBeUndefined();
    expect(r.firstDisclosure?.commercial).toBeUndefined();
    expect(r.transfer?.commercial).toBeGreaterThan(0); // 양도만
  });
});

// ─── 최초공시 ≤2000 산정기준율 환산 (plan: phd-3point-first-disclosure-pre2001) ───
// 2001년 체계 usageNo=1(단독주택·아파트) — 산정기준율 경로는 2001 지수표 사용.
describe("computePhdThreePointStdPrice — 최초공시 ≤2000 acqBase 환산", () => {
  const H2001 = (floorArea: number) => ({
    floorArea,
    category: "housing" as const,
    acquisition: tp(1),
    firstDisclosure: tp(1),
    transfer: tp(2), // 양도 2025 체계 주택
  });
  const LP2001 = 820_000; // 2001.1.1 기준 공시지가

  it("F1: 최초공시 1993(≤2000) → base2001 × 산정기준율(0.927) 산출 — 홈택스 취득경로 실측 교차값", () => {
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 1992, parts: [H2001(263.45)] },
      acquisition: { year: 1992, landPricePerM2: LP2001 },
      firstDisclosure: { year: 1993, landPricePerM2: 600_000 }, // 1993 공시지가는 건물 산출에 미사용
      transfer: TRANSFER,
      landPrice2001PerM2: LP2001,
    });
    // probe 실측 2026-07-23: perM2 328,000 × 263.45 × 0.927 floor
    expect(r.firstDisclosure?.housing).toBe(80_103_553);
    expect(r.unsupported.some((u) => u.point === "firstDisclosure")).toBe(false);
  });

  it("F2: 최초공시 ≤2000 + landPrice2001PerM2 부재 → unsupported(2001 공시지가 필요 사유)", () => {
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 1992, parts: [H2001(263.45)] },
      firstDisclosure: { year: 1993, landPricePerM2: 600_000 },
      transfer: TRANSFER,
    });
    expect(r.firstDisclosure?.housing).toBeUndefined();
    const u = r.unsupported.find((x) => x.point === "firstDisclosure" && x.category === "housing");
    expect(u?.reason).toContain("2001년 기준 공시지가");
  });

  it("F3(회귀): 취득 1992 acqBase — 홈택스 실측 일치값 81,399,727 (landPrice2001PerM2 존재해도 무영향)", () => {
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 1992, parts: [H2001(263.45)] },
      acquisition: { year: 1992, landPricePerM2: LP2001 },
      transfer: TRANSFER,
      landPrice2001PerM2: LP2001,
    });
    expect(r.acquisition?.housing).toBe(81_399_727);
  });

  it("F4: Case A 상가 — firstDisclosure ≤2000 주입 주택 용도로 acqBase 산출(엔진 직접호출 등가)", () => {
    const commercialCaseA = {
      floorArea: 80,
      category: "commercial" as const,
      transfer: tp(41),
      acquisition: tp(1), // 당시 주택 용도(2001 체계)
      firstDisclosure: tp(1),
    };
    const r = computePhdThreePointStdPrice({
      building: { builtYear: 1992, parts: [H2001(120), commercialCaseA] },
      firstDisclosure: { year: 1993, landPricePerM2: 600_000 },
      transfer: TRANSFER,
      landPrice2001PerM2: LP2001,
    });
    expect(r.firstDisclosure?.commercial).toBeGreaterThan(0);
    // 등가: 상가면적 80을 주택 용도(#1)로 acqBase(acquisitionYear=1993, 2001 공시지가)
    const direct = calcBuildingStandardPrice({
      taxType: "transfer",
      floorArea: 80,
      builtYear: 1992,
      acquisitionYear: 1993,
      transferYear: 2001,
      acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: LP2001 },
      transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: LP2001 },
    }).acquisition?.standardPrice;
    expect(r.firstDisclosure?.commercial).toBe(direct);
  });
});
