/**
 * 선박 소방분(지역자원시설세) anchor — A-1 Pre-Do
 *
 * 지방세법 §146③1호: "건축물 또는 선박"의 시가표준액 6구간 초과누진.
 * §146④: 제3항 선박 = §104 5호. 화재위험 중과(§146③2호·2의2호)는 "건축물"만.
 *
 * 현재: vessel → regionalResourceTax 0 (V-2·V-3·V-4·V-5 실패해야 정상)
 */

import { describe, it, expect } from "vitest";
import { calcSurtax } from "../../../lib/tax-engine/property-tax-surtax";
import { PROPERTY } from "../../../lib/tax-engine/legal-codes";

describe("A-1: 선박 소방분 §146③1호 — 현재 0 → 구현 후 산출", () => {
  it("V-2 선박 시가표준액 50,000,000 → 35,100 (24,100 + 11,000,000×10/10,000)", () => {
    const { surtax } = calcSurtax(0, 0, 50_000_000, "vessel", false);
    expect(surtax.regionalResourceTax).toBe(35_100);
  });

  it("V-1 하한 경계 6,000,000 → 2,400 (6,000,000×4/10,000)", () => {
    const { surtax } = calcSurtax(0, 0, 6_000_000, "vessel", false);
    expect(surtax.regionalResourceTax).toBe(2_400);
  });

  it("V-3 최고구간 100,000,000 → 92,300 (49,100 + 36,000,000×12/10,000)", () => {
    const { surtax } = calcSurtax(0, 0, 100_000_000, "vessel", false);
    expect(surtax.regionalResourceTax).toBe(92_300);
  });

  it("V-4 legalBasis에 §146(REGIONAL_RESOURCE_TAX) 포함", () => {
    const { legalBasis } = calcSurtax(0, 0, 50_000_000, "vessel", false);
    expect(legalBasis).toContain(PROPERTY.REGIONAL_RESOURCE_TAX);
  });

  it("V-5 화재위험 중과는 선박 미적용(×1) — fireHazardClass 전달해도 무영향", () => {
    const { surtax } = calcSurtax(0, 0, 50_000_000, "vessel", false, "large_fire_hazard");
    expect(surtax.regionalResourceTax).toBe(35_100); // ×3 아님
    expect(surtax.fireHazardMultiplier).toBeUndefined();
  });

  it("V-6 항공기는 소방분 비대상(0 유지) — §146④은 선박만", () => {
    const { surtax } = calcSurtax(0, 0, 50_000_000, "aircraft", false);
    expect(surtax.regionalResourceTax).toBe(0);
  });

  it("V-7 건축물 회귀 — 50,000,000 → 35,100 불변", () => {
    const { surtax } = calcSurtax(0, 0, 50_000_000, "building", false);
    expect(surtax.regionalResourceTax).toBe(35_100);
  });
});
