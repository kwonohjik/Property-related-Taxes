/**
 * anchor: PHD 3시점 일괄 산출 → 건물기준시가 계산서 스냅샷 재구성 라운드트립 등가.
 *
 * phdBatchToSnapshots(input, prefix)가 각 (시점,카테고리)마다 만든 BuildingStdPriceFormState를
 * toEngineInput → calcBuildingStandardPrice 로 재유도한 총액이,
 * computePhdThreePointStdPrice(input)가 산출한 금액과 **정확히 일치**해야 한다(자기일관성).
 * 규율 A(카테고리별 면적)·B(시점당 1스냅샷)·C(≤2000 생략)·D(Case A 당시 주택 용도) 포함.
 */
import { describe, it, expect } from "vitest";
import { computePhdThreePointStdPrice } from "../../lib/calc/phd-building-std-batch";
import { phdBatchToSnapshots } from "../../lib/calc/phd-batch-snapshots";
import { toEngineInput, type BuildingStdPriceFormState } from "../../lib/calc/building-std-price-form";
import { calcBuildingStandardPrice } from "../../lib/tax-engine/building-standard-price";

const tp = (usageNo: number) => ({ structureKey: "rc", usageNo });
const H = (floorArea: number) => ({
  floorArea,
  category: "housing" as const,
  acquisition: tp(2),
  firstDisclosure: tp(2),
  transfer: tp(2),
});
const C = (floorArea: number) => ({ floorArea, category: "commercial" as const, transfer: tp(41) });

const ACQ = { year: 2014, landPricePerM2: 2_360_000 };
const FIRST = { year: 2016, landPricePerM2: 2_369_000 };
const TRANSFER = { year: 2025, landPricePerM2: 3_486_000 };
const PREFIX = "bsp-asset-x-phd";

/** 스냅샷 재유도 총액 — 복합=compositeTotal / 단일=valuation.standardPrice */
function snapTotal(snap: BuildingStdPriceFormState | undefined): number | undefined {
  if (!snap) return undefined;
  const r = calcBuildingStandardPrice(toEngineInput(snap));
  return r.compositeTotal ?? r.valuation?.standardPrice;
}

describe("phdBatchToSnapshots — 라운드트립 등가", () => {
  it("단독 단일 — 3시점 스냅샷 총액 = 배치값", () => {
    const input = { building: { builtYear: 2010, parts: [H(100)] }, acquisition: ACQ, firstDisclosure: FIRST, transfer: TRANSFER };
    const batch = computePhdThreePointStdPrice(input);
    const snaps = phdBatchToSnapshots(input, PREFIX);
    expect(snapTotal(snaps[`${PREFIX}-acq`])).toBe(batch.acquisition?.housing);
    expect(snapTotal(snaps[`${PREFIX}-first`])).toBe(batch.firstDisclosure?.housing);
    expect(snapTotal(snaps[`${PREFIX}-transfer`])).toBe(batch.transfer?.housing);
    expect(batch.transfer?.housing).toBeGreaterThan(0);
  });

  it("단독 복합(2부분, A조건 카테고리 면적) — compositeTotal 등가", () => {
    const parts = [H(120), H(80)];
    const input = { building: { builtYear: 2010, parts }, acquisition: ACQ, firstDisclosure: FIRST, transfer: TRANSFER };
    const batch = computePhdThreePointStdPrice(input);
    const snaps = phdBatchToSnapshots(input, PREFIX);
    expect(snaps[`${PREFIX}-transfer`]?.compositeMode).toBe(true);
    expect(snapTotal(snaps[`${PREFIX}-transfer`])).toBe(batch.transfer?.housing);
    expect(snapTotal(snaps[`${PREFIX}-acq`])).toBe(batch.acquisition?.housing);
  });

  it("겸용 Case B — 양도 상가 스냅샷만(취득·최초 상가 없음)", () => {
    const input = { building: { builtYear: 2010, parts: [H(120), C(80)] }, acquisition: ACQ, firstDisclosure: FIRST, transfer: TRANSFER };
    const batch = computePhdThreePointStdPrice(input);
    const snaps = phdBatchToSnapshots(input, PREFIX);
    expect(snapTotal(snaps[`${PREFIX}-transfer-commercial`])).toBe(batch.transfer?.commercial);
    expect(snaps[`${PREFIX}-acq-commercial`]).toBeUndefined();
    expect(snaps[`${PREFIX}-first-commercial`]).toBeUndefined();
    expect(snapTotal(snaps[`${PREFIX}-acq`])).toBe(batch.acquisition?.housing);
  });

  it("겸용 Case A — 취득·최초 상가 = 당시 주택 용도(D조건) 등가", () => {
    const COMM = 14;
    const commA = {
      floorArea: 80,
      category: "commercial" as const,
      transfer: tp(COMM),
      acquisition: tp(2), // 당시 주택 용도
      firstDisclosure: tp(2),
    };
    const input = { building: { builtYear: 2010, parts: [H(120), commA] }, acquisition: ACQ, firstDisclosure: FIRST, transfer: TRANSFER };
    const batch = computePhdThreePointStdPrice(input);
    const snaps = phdBatchToSnapshots(input, PREFIX);
    expect(snapTotal(snaps[`${PREFIX}-acq-commercial`])).toBe(batch.acquisition?.commercial);
    expect(snapTotal(snaps[`${PREFIX}-first-commercial`])).toBe(batch.firstDisclosure?.commercial);
    expect(snapTotal(snaps[`${PREFIX}-transfer-commercial`])).toBe(batch.transfer?.commercial);
    // 양도 상가는 상가 용도 그대로 → 취득 상가(주택용도)와 다름
    expect(batch.acquisition?.commercial).not.toBe(batch.transfer?.commercial);
  });

  it("F5: 최초공시 ≤2000 — transfer 모드 acqBase 스냅샷 생성 + 재유도 총액 = 배치값(2001 공시지가)", () => {
    const LP2001 = 820_000;
    const H2001 = { floorArea: 263.45, category: "housing" as const, acquisition: tp(1), firstDisclosure: tp(1), transfer: tp(2) };
    const input = {
      building: { builtYear: 1992, parts: [H2001] },
      acquisition: { year: 1992, landPricePerM2: LP2001 },
      firstDisclosure: { year: 1993, landPricePerM2: 600_000 },
      transfer: TRANSFER,
      landPrice2001PerM2: LP2001,
    };
    const batch = computePhdThreePointStdPrice(input);
    const snaps = phdBatchToSnapshots(input, PREFIX);
    const firstSnap = snaps[`${PREFIX}-first`];
    expect(firstSnap).toBeDefined();
    expect(firstSnap?.taxType).toBe("transfer");
    expect(firstSnap?.acquisitionYear).toBe("1993");
    expect(firstSnap?.acqLandPrice).toBe(String(LP2001)); // 1993 공시지가(600,000) 아님 — 2001 기준
    const r = calcBuildingStandardPrice(toEngineInput(firstSnap!));
    expect(r.acquisition?.standardPrice).toBe(batch.firstDisclosure?.housing);
    expect(batch.firstDisclosure?.housing).toBe(80_103_553);
  });

  it("≤2000 취득 주택분 단독 — transfer 모드 acqBase 스냅샷 생성(최초·양도는 valuation)", () => {
    const input = { building: { builtYear: 1998, parts: [H(100)] }, acquisition: { year: 1998, landPricePerM2: 500_000 }, firstDisclosure: FIRST, transfer: TRANSFER };
    const snaps = phdBatchToSnapshots(input, PREFIX);
    const acqSnap = snaps[`${PREFIX}-acq`];
    expect(acqSnap).toBeDefined();
    expect(acqSnap?.taxType).toBe("transfer");
    expect(acqSnap?.acquisitionYear).toBe("1998");
    expect(acqSnap?.transferYear).toBe("2001"); // dummy
    expect(snaps[`${PREFIX}-first`]).toBeDefined();
    expect(snaps[`${PREFIX}-transfer`]).toBeDefined();
  });

  it("≤2000 취득 주택분 — acqBase 스냅샷이 acqBaseConversion(산정기준율 환산) 노출", () => {
    const input = { building: { builtYear: 1998, parts: [H(100)] }, acquisition: { year: 1998, landPricePerM2: 500_000 }, firstDisclosure: FIRST, transfer: TRANSFER };
    const acqSnap = phdBatchToSnapshots(input, PREFIX)[`${PREFIX}-acq`]!;
    const r = calcBuildingStandardPrice(toEngineInput(acqSnap));
    // ※표 소스(자기일관): convertedTotal = 취득당시 standardPrice(산정기준율 적용값)
    expect(r.acqBaseConversion).toBeDefined();
    expect(r.acqBaseConversion?.convertedTotal).toBe(r.acquisition?.standardPrice);
    expect(r.acqBaseConversion?.acqBaseRate).toBe(r.acquisition?.acqBaseRate);
    // convertedTotal = floor(total2001 기준 × 산정기준율) — 산정기준율은 1보다 클 수도(예 1.019) 작을 수도 있음.
    expect(r.acqBaseConversion!.total2001).toBeGreaterThan(0);
    expect(r.acqBaseConversion!.convertedTotal).toBeGreaterThan(0);
  });

  it("≤2000 취득 상가 Case B(취득 미지정) — 생략(주택 단일은 생성)", () => {
    const commB = { building: { builtYear: 1998, parts: [H(120), C(80)] }, acquisition: { year: 1998, landPricePerM2: 500_000 }, firstDisclosure: FIRST, transfer: TRANSFER };
    expect(phdBatchToSnapshots(commB, PREFIX)[`${PREFIX}-acq-commercial`]).toBeUndefined(); // 상가 Case B(취득 미지정) 생략
    expect(phdBatchToSnapshots(commB, PREFIX)[`${PREFIX}-acq`]?.taxType).toBe("transfer"); // 주택 단일 생성
  });

  it("≤2000 취득 복합(다부분) — 배치 산출(acqBaseStdPrice 복합) + 라운드트립 등가", () => {
    const input = { building: { builtYear: 1998, parts: [H(120), H(80)] }, acquisition: { year: 1998, landPricePerM2: 500_000 }, firstDisclosure: FIRST, transfer: TRANSFER };
    const batch = computePhdThreePointStdPrice(input);
    // 배치 엔진 확장 — 다부분 취득<2001도 unsupported 아닌 값 산출(단일 산정기준율 그룹 rc)
    expect(batch.acquisition?.housing).toBeGreaterThan(0);
    const snap = phdBatchToSnapshots(input, PREFIX)[`${PREFIX}-acq`];
    expect(snap?.compositeMode).toBe(true);
    // 스냅샷 재유도(transfer 복합) = 배치 산출값 (자기일관 라운드트립). 취득당시 기준시가 = 산정기준율 적용 後.
    const r = calcBuildingStandardPrice(toEngineInput(snap!));
    expect(r.acqBaseConversion?.convertedTotal).toBe(batch.acquisition?.housing);
    // acquisitionComposite.total은 rate 적용 前(base2001) → convertedTotal보다 큼(rate<1) 또는 작음(rate>1)
    expect(r.acqBaseConversion!.total2001).toBe(r.acquisitionComposite?.total);
  });

  it("≤2000 취득 다그룹 복합(rc I + brick II) — 부분별 산정기준율 라운드트립 등가", () => {
    const parts = [
      { floorArea: 120, category: "housing" as const, acquisition: { structureKey: "rc", usageNo: 1 }, firstDisclosure: tp(2), transfer: tp(2) },
      { floorArea: 80, category: "housing" as const, acquisition: { structureKey: "brick", usageNo: 1 }, firstDisclosure: { structureKey: "brick", usageNo: 2 }, transfer: { structureKey: "brick", usageNo: 2 } },
    ];
    const input = { building: { builtYear: 1998, parts }, acquisition: { year: 1998, landPricePerM2: 500_000 }, firstDisclosure: FIRST, transfer: TRANSFER };
    const batch = computePhdThreePointStdPrice(input);
    expect(batch.acquisition?.housing).toBeGreaterThan(0); // 다그룹도 산출(부분별)
    const snap = phdBatchToSnapshots(input, PREFIX)[`${PREFIX}-acq`];
    const r = calcBuildingStandardPrice(toEngineInput(snap!));
    expect(r.acqBaseConversion?.convertedTotal).toBe(batch.acquisition?.housing); // 재유도=배치(자기일관)
    expect(r.acqBaseConversion?.acqBaseRate).toBeUndefined(); // 다그룹 → ※표 "부분별"
  });

  it("≤2000 취득 상가 Case A(당시 주택용도) 단일 — transfer acqBase 스냅샷 생성", () => {
    const commA = { floorArea: 80, category: "commercial" as const, transfer: tp(14), acquisition: tp(1), firstDisclosure: tp(2) };
    const input = { building: { builtYear: 1998, parts: [commA] }, acquisition: { year: 1998, landPricePerM2: 500_000 }, firstDisclosure: FIRST, transfer: TRANSFER };
    const snaps = phdBatchToSnapshots(input, PREFIX);
    const acqCommSnap = snaps[`${PREFIX}-acq-commercial`];
    expect(acqCommSnap).toBeDefined();
    expect(acqCommSnap?.taxType).toBe("transfer");
    expect(acqCommSnap?.acquisitionYear).toBe("1998");
    // 재유도 acqBaseConversion 자기일관
    const r = calcBuildingStandardPrice(toEngineInput(acqCommSnap!));
    expect(r.acqBaseConversion?.convertedTotal).toBe(r.acquisition?.standardPrice);
    expect(r.acqBaseConversion?.acqBaseRate).toBe(r.acquisition?.acqBaseRate);
  });
});
