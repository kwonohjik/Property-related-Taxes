/**
 * P6 ①②③ + 술어 — 파트 환산 플래그(`partEstimated`)의 폼 타입·초기값·normalize/migrate와 `partDonorEstimated` 술어.
 *
 * 술어는 ⑤(토글·분자 칸)·④(전송)·⑧(검증)이 같이 읽는 단일 소스다. 자산 전체 이월과세의 `useEstimatedAcquisition`·`estimationMode`는 읽지 않는다(잔재 비누출).
 */
import { describe, it, expect } from "vitest";
import { partDonorEstimated } from "@/lib/calc/transfer-land-part-cause";
import { CARRYOVER_DEFAULTS, migrateCarryoverFields, migrateSplitPartCarryoverFields, normalizeCarryoverForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { cAsset } from "./_helpers/split-carryover-c-form";
import { aAsset, A_LAND_CARRYOVER } from "./_helpers/split-carryover-a-form";
import { bAsset, B_CARRYOVER } from "./_helpers/split-carryover-b-form";

const EST = { partEstimated: true };

describe("①② 폼 타입·초기값", () => {
  it("기본값은 OFF — 신규 자산·신규 서브폼 모두", () => {
    expect(CARRYOVER_DEFAULTS.partEstimated).toBe(false);
    expect(makeDefaultAsset(1).carryover?.partEstimated).toBe(false);
    expect(makeDefaultAsset(1).landCarryover?.partEstimated).toBe(false);
  });
});

describe("③ normalize·migrate — 구 세션·이력에는 새 플래그가 없다 = OFF", () => {
  it("normalizeCarryoverForm: 없으면 false · true만 true · 형이 틀리면 false", () => {
    expect(normalizeCarryoverForm({}).partEstimated).toBe(false);
    expect(normalizeCarryoverForm(undefined).partEstimated).toBe(false);
    expect(normalizeCarryoverForm({ partEstimated: true }).partEstimated).toBe(true);
    expect(normalizeCarryoverForm({ partEstimated: "true" }).partEstimated).toBe(false);
    expect(normalizeCarryoverForm({ partEstimated: 1 }).partEstimated).toBe(false);
  });
  it("migrateSplitPartCarryoverFields(토지 서브폼)·migrateCarryoverFields(건물 서브폼)가 값을 보존하거나 OFF로 채운다", () => {
    const a: Record<string, unknown> = { landCarryover: { partEstimated: true }, acquisitionCause: "carryover_gift", carryover: { partEstimated: true } };
    migrateSplitPartCarryoverFields(a);
    migrateCarryoverFields(a);
    expect((a.landCarryover as { partEstimated: boolean }).partEstimated).toBe(true);
    expect((a.carryover as { partEstimated: boolean }).partEstimated).toBe(true);
    const old: Record<string, unknown> = { landCarryover: { donorAcquisitionPrice: "1" }, acquisitionCause: "carryover_gift", carryover: { donorAcquisitionPrice: "1" } };
    migrateSplitPartCarryoverFields(old);
    migrateCarryoverFields(old);
    expect((old.landCarryover as { partEstimated: boolean }).partEstimated).toBe(false);
    expect((old.carryover as { partEstimated: boolean }).partEstimated).toBe(false);
  });
});

describe("술어 partDonorEstimated", () => {
  const cLand = (over: Record<string, unknown> = {}) => ({ ...cAsset().landCarryover, ...over });
  const cBuilding = (over: Record<string, unknown> = {}) => ({ ...cAsset().carryover, ...over });

  it("C — 파트마다 따로 켠다", () => {
    expect(partDonorEstimated(cAsset())).toEqual({ land: false, building: false });
    expect(partDonorEstimated(cAsset({ landCarryover: cLand(EST) }))).toEqual({ land: true, building: false });
    expect(partDonorEstimated(cAsset({ carryover: cBuilding(EST) }))).toEqual({ land: false, building: true });
    expect(partDonorEstimated(cAsset({ landCarryover: cLand(EST), carryover: cBuilding(EST) }))).toEqual({ land: true, building: true });
  });
  it("A는 토지만 · B는 건물만 읽는다 — 다른 서브폼의 플래그 잔재는 무시", () => {
    expect(partDonorEstimated(aAsset("purchase", { landCarryover: { ...A_LAND_CARRYOVER, ...EST }, carryover: { ...B_CARRYOVER, ...EST } }))).toEqual({ land: true, building: false });
    expect(partDonorEstimated(bAsset({ carryover: { ...B_CARRYOVER, ...EST }, landCarryover: { ...A_LAND_CARRYOVER, ...EST } }))).toEqual({ land: false, building: true });
  });
  it("파트 이월과세가 아니면(토글 OFF·소유자 분리·부담부증여·함께 양도 자산) 플래그가 켜져 있어도 거짓", () => {
    const on = { landCarryover: cLand(EST), carryover: cBuilding(EST) };
    expect(partDonorEstimated(cAsset({ ...on, carryoverDonorSplit: false }))).toEqual({ land: false, building: false });
    expect(partDonorEstimated(cAsset({ ...on, selfOwns: "building_only" }))).toEqual({ land: false, building: false });
    expect(partDonorEstimated(cAsset({ ...on, transferType: "burdened_gift" }))).toEqual({ land: false, building: false });
    expect(partDonorEstimated(cAsset(on), { isNonPrimary: true })).toEqual({ land: false, building: false });
  });
  it("자산 전체 환산 필드(useEstimatedAcquisition·estimationMode)는 읽지 않는다 — 옛 이력 잔재 비누출", () => {
    const legacy = { useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "1,000" };
    expect(partDonorEstimated(cAsset({ landCarryover: cLand(legacy), carryover: cBuilding(legacy) }))).toEqual({ land: false, building: false });
  });
});
