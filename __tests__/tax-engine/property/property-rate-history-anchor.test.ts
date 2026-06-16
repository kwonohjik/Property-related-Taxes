/**
 * 역사 세율표 현행값 일치 anchor — A-3 P1
 *
 * property-rate-history.ts 의 2005(현행) 세트가 엔진 현행 상수와 일치하는지 검증.
 * 드리프트(엔진 세율 개정 시 역사표 미갱신) 차단.
 */

import { describe, it, expect } from "vitest";
import {
  getPropertyRateSet,
  PROPERTY_RATE_HISTORY,
} from "../../../lib/tax-engine/data/property-rate-history";
import {
  PROPERTY_CONST,
  PROPERTY_SEPARATE_CONST,
} from "../../../lib/tax-engine/legal-codes";

describe("P1: 역사 세율표 — 현행값 일치 (드리프트 차단)", () => {
  const rs = getPropertyRateSet(2026);

  it("건축물 general·luxury — PROPERTY_CONST 일치", () => {
    expect(rs.buildingGeneral).toBe(PROPERTY_CONST.BUILDING_GENERAL_RATE); // 0.0025
    expect(rs.buildingLuxury).toBe(PROPERTY_CONST.BUILDING_LUXURY_RATE); // 0.04
  });

  it("건축물 factory 0.005 · 선박·항공기 0.003 (property-tax.ts 리터럴)", () => {
    expect(rs.buildingFactory).toBe(0.005);
    expect(rs.vesselAircraft).toBe(0.003);
  });

  it("종합합산 brackets·rates — COMPREHENSIVE_* 일치", () => {
    expect(rs.landComprehensive.bracket1).toBe(PROPERTY_CONST.COMPREHENSIVE_BRACKET_1); // 50M
    expect(rs.landComprehensive.bracket2).toBe(PROPERTY_CONST.COMPREHENSIVE_BRACKET_2); // 100M
    expect(rs.landComprehensive.rate1).toBe(PROPERTY_CONST.COMPREHENSIVE_RATE_1); // 0.002
    expect(rs.landComprehensive.rate2).toBe(PROPERTY_CONST.COMPREHENSIVE_RATE_2); // 0.003
    expect(rs.landComprehensive.rate3).toBe(PROPERTY_CONST.COMPREHENSIVE_RATE_3); // 0.005
  });

  it("별도합산 brackets·rates — PROPERTY_SEPARATE_CONST 일치", () => {
    expect(rs.landSeparateAggregate.bracket1).toBe(PROPERTY_SEPARATE_CONST.BRACKET_1); // 200M
    expect(rs.landSeparateAggregate.bracket2).toBe(PROPERTY_SEPARATE_CONST.BRACKET_2); // 1B
    expect(rs.landSeparateAggregate.rate1).toBe(PROPERTY_SEPARATE_CONST.RATE_1); // 0.002
    expect(rs.landSeparateAggregate.rate2).toBe(PROPERTY_SEPARATE_CONST.RATE_2); // 0.003
    expect(rs.landSeparateAggregate.rate3).toBe(PROPERTY_SEPARATE_CONST.RATE_3); // 0.004
  });

  it("분리과세 저율·일반·중과 (separate-taxation.ts RATE_LOW/STD/HEAVY)", () => {
    expect(rs.landSeparatedLow).toBe(0.0007);
    expect(rs.landSeparatedGeneral).toBe(0.002);
    expect(rs.landSeparatedHigh).toBe(0.04);
  });

  it("getPropertyRateSet — year 이하 최대 fromYear 선택", () => {
    expect(getPropertyRateSet(2026)).toBe(PROPERTY_RATE_HISTORY[2005]);
    expect(getPropertyRateSet(2005)).toBe(PROPERTY_RATE_HISTORY[2005]);
    // 기준연도 미만이어도 최소 엔트리 fallback (재산정은 통상 직전연도)
    expect(getPropertyRateSet(2000)).toBe(PROPERTY_RATE_HISTORY[2005]);
  });
});
