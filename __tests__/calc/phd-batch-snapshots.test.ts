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

  it("≤2000 취득(C조건) — 취득 스냅샷 생략, 최초·양도 생성", () => {
    const input = { building: { builtYear: 1998, parts: [H(100)] }, acquisition: { year: 1998, landPricePerM2: 500_000 }, firstDisclosure: FIRST, transfer: TRANSFER };
    const snaps = phdBatchToSnapshots(input, PREFIX);
    expect(snaps[`${PREFIX}-acq`]).toBeUndefined();
    expect(snaps[`${PREFIX}-first`]).toBeDefined();
    expect(snaps[`${PREFIX}-transfer`]).toBeDefined();
  });
});
