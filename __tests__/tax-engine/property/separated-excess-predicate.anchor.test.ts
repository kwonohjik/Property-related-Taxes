/**
 * PSE-E1 — 요구 술어(`propertyLandSplitRequired(For)`)·한도 echo(`separatedAreaExcessOf`) anchor.
 * 계획서 §4.6 · K-1·K-10~K-12·K-15 · M-5·M-6·M-16. 술어와 엔진은 같은 `classifySeparateTaxation` 경로를 읽는다 — 술어가 던진 입력은 엔진도 던진다.
 */
import { describe, it, expect } from "vitest";
import { separatedAreaExcessOf } from "../../../lib/tax-engine/separate-taxation";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";
import {
  propertyLandSplitRequired,
  propertyLandSplitRequiredFor,
  PROPERTY_LAND_SPLIT_TRANSFER_REASON_LABEL,
} from "../../../lib/tax-engine/property-land-split-tax";
import type { PropertyTaxInput } from "../../../lib/tax-engine/types/property.types";
import { FACTORY, PASTURE } from "./fixtures/separated-excess-zero-cases";

const F_OVER = { ...FACTORY, factoryTotalLandArea: 15000 };
const P_OVER = { ...PASTURE, pastureTotalLandArea: 2000 };
const req = (item: Parameters<typeof propertyLandSplitRequiredFor>[0]["separateTaxationItem"]) =>
  propertyLandSplitRequiredFor({ landTaxType: "separated", separateTaxationItem: item, targetDate: "2026-06-01" });
const NONE = { otherSeparate: false, otherComprehensive: false };
const COMP_ONLY = { otherSeparate: false, otherComprehensive: true };

describe("separatedAreaExcessOf — 판정 echo (K-15)", () => {
  it("공장 15,000㎡ → 기준 12,000 · 인정 12,000 · 초과 3,000", () => {
    expect(separatedAreaExcessOf(F_OVER)).toEqual({ kind: "factory", totalArea: 15000, standardArea: 12000, recognizedArea: 12000, excessArea: 3000 });
  });
  it("목장 2,000㎡ → 기준 625 · 초과 1,375", () => {
    expect(separatedAreaExcessOf(P_OVER)).toEqual({ kind: "pasture", totalArea: 2000, standardArea: 625, recognizedArea: 625, excessArea: 1375 });
  });
  it("한도 안(8,000㎡)은 값을 돌려주되 초과 0", () => {
    expect(separatedAreaExcessOf(FACTORY)?.excessArea).toBe(0);
  });
  it.each([
    ["농지", { isFarmland: true }],
    ["보전산지", { isProtectedForest: true }],
    ["염전", { isSaltField: true }],
    ["터미널", { isTerminalOrParking: true }],
    ["회원제 골프장", { isGolfCourse: true, golfCourseType: "member" as const }],
    ["고급오락장", { isHighClassEntertainment: true }],
    ["시지역 그 밖 공장(urban)", { ...F_OVER, factoryLocation: "urban" as const }],
    ["허가 미이행 공장", { ...F_OVER, factoryIsUnpermitted: true }],
    ["도시지역 목장 · 1989 이후 소유", { ...P_OVER, pastureIsUrbanArea: true, pastureOwnedBefore1990: false }],
  ])("한도 없음·분리과세 비해당 → null: %s", (_n, item) => {
    expect(separatedAreaExcessOf(item)).toBeNull();
  });
  it("판정이 던지는 입력(면적·연면적 미입력)·빈 입력 → null", () => {
    expect(separatedAreaExcessOf({ ...F_OVER, factoryTotalLandArea: undefined })).toBeNull();
    expect(separatedAreaExcessOf({ ...F_OVER, factoryFloorArea: 0 })).toBeNull();
    expect(separatedAreaExcessOf({ ...P_OVER, pastureLivestockCount: 0 })).toBeNull();
    expect(separatedAreaExcessOf(undefined)).toBeNull();
  });
});

describe("요구 술어 — 분리과세 (K-1·K-10~K-12 · M-5·M-6)", () => {
  it("공장·목장 초과 > 0 → 종합합산 칸만(별도합산 칸 없음)", () => {
    expect(req(F_OVER)).toEqual(COMP_ONLY);
    expect(req(P_OVER)).toEqual(COMP_ONLY);
  });
  it("초과 0·한도 없는 유형·분리과세 비해당 → 요구 없음 (M-5: 항상 true 금지)", () => {
    expect(req(FACTORY)).toEqual(NONE);
    expect(req(PASTURE)).toEqual(NONE);
    expect(req({ isFarmland: true })).toEqual(NONE);
    expect(req({ ...F_OVER, factoryLocation: "urban" })).toEqual(NONE);
    expect(req(undefined)).toEqual(NONE);
  });
  it("정확히 기준면적(12,000㎡) → 초과 0 → 요구 없음", () => {
    expect(req({ ...FACTORY, factoryTotalLandArea: 12000 })).toEqual(NONE);
  });
  it("판정이 던지는 입력 → 요구 없음이되 엔진도 던진다(침묵 0원 경로 없음 — M-16)", () => {
    const bad = { ...F_OVER, factoryFloorArea: 0 };
    expect(req(bad)).toEqual(NONE);
    expect(() =>
      calculatePropertyTax({ objectType: "land", landTaxType: "separated", publishedPrice: 1_500_000_000, targetDate: "2026-06-01", separateTaxationItem: bad } as PropertyTaxInput),
    ).toThrow();
    const noTotal = { ...P_OVER, pastureTotalLandArea: undefined };
    expect(req(noTotal)).toEqual(NONE);
    expect(() =>
      calculatePropertyTax({ objectType: "land", landTaxType: "separated", publishedPrice: 100_000_000, targetDate: "2026-06-01", separateTaxationItem: noTotal } as PropertyTaxInput),
    ).toThrow();
  });
  it("다른 유형 불변 — 별도합산 항목 없음·종합합산 직접·주택", () => {
    expect(propertyLandSplitRequiredFor({ landTaxType: "separate_aggregate" })).toEqual(NONE);
    expect(propertyLandSplitRequiredFor({ landTaxType: "comprehensive_aggregate" })).toEqual({ otherSeparate: false, otherComprehensive: true });
    expect(propertyLandSplitRequiredFor({ landTaxType: undefined, separateTaxationItem: F_OVER })).toEqual(NONE);
  });
  it("propertyLandSplitRequired 단독 — 분리과세는 excessArea만 본다", () => {
    expect(propertyLandSplitRequired({ landTaxType: "separated", excessArea: 0.01 })).toEqual(COMP_ONLY);
    expect(propertyLandSplitRequired({ landTaxType: "separated", excessArea: 0 })).toEqual(NONE);
    expect(propertyLandSplitRequired({ landTaxType: "separated" })).toEqual(NONE);
  });
});

describe("이관 사유 라벨 — 별도합산 전용 area_excess와 구분 (M-13)", () => {
  it("분리과세 전용 사유 2종은 칙 §50·영 §102 근거를 말하고 area_excess와 다르다", () => {
    const L = PROPERTY_LAND_SPLIT_TRANSFER_REASON_LABEL;
    expect(L.factory_area_excess).toContain("공장입지기준면적");
    expect(L.pasture_area_excess).toContain("가축별 기준면적");
    expect(L.factory_area_excess).not.toBe(L.area_excess);
    expect(L.pasture_area_excess).not.toBe(L.area_excess);
  });
});
