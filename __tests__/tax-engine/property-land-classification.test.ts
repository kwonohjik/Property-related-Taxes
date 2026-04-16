/**
 * 재산세 토지 3분류 판정 테스트 (P2-12)
 *
 * T01: 자경농지 → 분리과세 0.07%
 * T02: 나대지 → 종합합산
 * T03: 상업지역 영업용 건물 부속토지 → 별도합산
 * T04: 별도합산 한도 초과 → split
 * T05: 회원제 골프장 → 분리과세 4%
 * T06: 공장(산업단지) → 분리과세 0.2%
 * T07: 별도합산 기준면적 경계값 정확성
 */

import { describe, it, expect } from "vitest";
import {
  classifySeparateTaxationLand,
  classifySeparateAggregate,
  classifyLand,
} from "../../lib/tax-engine/property-land-classification";
import type { LandInput } from "../../lib/tax-engine/types/property-object.types";

const BASE_LAND: LandInput = {
  landArea: 200,
  landUse: "대",
  zoningDistrict: "commercial",
  isFarmland: false,
};

describe("classifySeparateTaxationLand — 분리과세 판정", () => {
  it("T01: 자경농지 (농업인 + 직접 경작) → 분리과세 0.07%", () => {
    const result = classifySeparateTaxationLand({
      ...BASE_LAND,
      isFarmland: true,
      isSelfCultivated: true,
      isFarmer: true,
      landUse: "전",
    });
    expect(result.isSeparate).toBe(true);
    expect(result.subtype).toBe("farmland_self_cultivated");
    expect(result.rate).toBe(0.0007);
  });

  it("T01-a: 농지이나 자경 아님 → 분리과세 아님", () => {
    const result = classifySeparateTaxationLand({
      ...BASE_LAND,
      isFarmland: true,
      isSelfCultivated: false,
      landUse: "전",
    });
    expect(result.isSeparate).toBe(false);
  });

  it("T05: 회원제 골프장 → 분리과세 4%", () => {
    const result = classifySeparateTaxationLand({
      ...BASE_LAND,
      isMemberGolf: true,
      landUse: "golf_course",
    });
    expect(result.isSeparate).toBe(true);
    expect(result.subtype).toBe("golf_course");
    expect(result.rate).toBe(0.04);
  });

  it("T06: 산업단지 공장용지 → 분리과세 0.2%", () => {
    const result = classifySeparateTaxationLand({
      ...BASE_LAND,
      isIndustrialDistrict: true,
      landUse: "factory",
    });
    expect(result.isSeparate).toBe(true);
    expect(result.subtype).toBe("factory_site_industrial");
    expect(result.rate).toBe(0.002);
  });
});

describe("classifySeparateAggregate — 별도합산 기준면적", () => {
  it("T03: 상업지역(배율 3배) 토지 200m², 건물 바닥 100m² → 인정 200m², 초과 0", () => {
    // 기준면적 = 100 × 3 = 300m² > 토지 200m² → 전체 별도합산
    const result = classifySeparateAggregate({
      ...BASE_LAND,
      landArea: 200,
      buildingFloorArea: 100,
      zoningDistrict: "commercial",
    });
    expect(result.isSeparateAggregate).toBe(true);
    expect(result.recognizedArea).toBe(200);
    expect(result.excessArea).toBe(0);
    expect(result.multiplier).toBe(3);
  });

  it("T07: 경계값 — 토지=기준면적 정확히 일치 시 초과 0", () => {
    // 기준 = 100 × 3 = 300m² = 토지 300m²
    const result = classifySeparateAggregate({
      ...BASE_LAND,
      landArea: 300,
      buildingFloorArea: 100,
      zoningDistrict: "commercial",
    });
    expect(result.recognizedArea).toBe(300);
    expect(result.excessArea).toBe(0);
  });

  it("T04: 상업지역 토지 400m², 건물 100m² → 인정 300m², 초과 100m²", () => {
    const result = classifySeparateAggregate({
      ...BASE_LAND,
      landArea: 400,
      buildingFloorArea: 100,
      zoningDistrict: "commercial",
    });
    expect(result.recognizedArea).toBe(300);
    expect(result.excessArea).toBe(100);
  });
});

describe("classifyLand — 4단계 오케스트레이터", () => {
  it("T01: 자경농지 → 분리과세 (우선순위 1위)", () => {
    const result = classifyLand({
      ...BASE_LAND,
      isFarmland: true,
      isSelfCultivated: true,
      isFarmer: true,
      landUse: "전",
    });
    expect(result.primary).toBe("separate_taxation");
    expect(result.separateTaxationType).toBe("farmland_self_cultivated");
    expect(result.separateTaxationRate).toBe(0.0007);
  });

  it("T02: 나대지 (건물 없음) → 종합합산", () => {
    const result = classifyLand({
      ...BASE_LAND,
      landUse: "잡종지",
      buildingFloorArea: 0,
    });
    expect(result.primary).toBe("general_aggregate");
  });

  it("T03: 상업지역 영업용 부속토지 (한도 내) → 별도합산", () => {
    const result = classifyLand({
      ...BASE_LAND,
      landArea: 200,
      buildingFloorArea: 100,
      zoningDistrict: "commercial",
    });
    expect(result.primary).toBe("separate_aggregate");
  });

  it("T04: 상업지역 영업용 부속토지 (한도 초과) → split", () => {
    const result = classifyLand({
      ...BASE_LAND,
      landArea: 400,
      buildingFloorArea: 100,
      zoningDistrict: "commercial",
    });
    expect(result.primary).toBe("split");
    expect(result.separateAggregateArea).toBe(300);
    expect(result.generalAggregateArea).toBe(100);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("T05: 회원제 골프장 → 분리과세 4% (분리과세가 별도합산보다 우선)", () => {
    const result = classifyLand({
      ...BASE_LAND,
      isMemberGolf: true,
      landUse: "golf_course",
      buildingFloorArea: 500,
    });
    expect(result.primary).toBe("separate_taxation");
    expect(result.separateTaxationRate).toBe(0.04);
  });
});
