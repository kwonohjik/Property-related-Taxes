/**
 * PSE-E0 — 분리과세(공장용지·목장용지) 면적 한도 초과분 → 종합합산 이관 세액 anchor.
 * 계획서: docs/01-plan/features/property-separated-excess-transfer.engine.plan.md (§3 Pre-Do 표 · §6 케이스 K-1~K-19).
 *
 * 구성
 *  1. 회귀 0 — 초과 0 입력은 PSE 구현 전 master(f6a059725)의 결과와 **바이트 동일**(골든 JSON).
 *  2. 오라클 — F-1·F-1u·F-2·P-1·P-2. 기대값은 계획서 §3.2의 손계산 값(누진 구간 250,000 + 0.5%·합산 몫)이며 엔진 출력으로 만들지 않는다.
 *     PSE-E0 시점에는 이관분 세액이 없어 **빨강으로 시작**한다 — PSE-E2에서 초록이 된다.
 */
import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";
import type { PropertyTaxInput } from "../../../lib/tax-engine/types/property.types";
import golden from "./fixtures/separated-excess-zero-golden.json";
import { FACTORY, PASTURE, ZERO_EXCESS_CASES } from "./fixtures/separated-excess-zero-cases";

const BASE = { objectType: "land", landTaxType: "separated", targetDate: "2026-06-01" } as const;

/** F: 산업단지 공장 15,000㎡ · ㎡당 100,000원 = 15억 — 기준 12,000㎡(인정 12억) · 초과 3,000㎡(3억) */
const F_ITEM = { ...FACTORY, factoryTotalLandArea: 15000 };
const F = (over: Partial<PropertyTaxInput> = {}) =>
  calculatePropertyTax({ ...BASE, publishedPrice: 1_500_000_000, separateTaxationItem: F_ITEM, ...over } as PropertyTaxInput);

/** P: 목장 2,000㎡ · ㎡당 50,000원 = 1억 — 기준 625㎡(인정 31,250,000) · 초과 1,375㎡(68,750,000) */
const P_ITEM = { ...PASTURE, pastureTotalLandArea: 2000 };
const P = (over: Partial<PropertyTaxInput> = {}) =>
  calculatePropertyTax({ ...BASE, publishedPrice: 100_000_000, separateTaxationItem: P_ITEM, ...over } as PropertyTaxInput);

describe("PSE-E0 회귀 0 — 초과 0 입력은 구현 전 결과와 바이트 동일", () => {
  it("골든 입력 목록과 골든 키가 같다(누락·추가 방지)", () => {
    expect(Object.keys(golden).sort()).toEqual(Object.keys(ZERO_EXCESS_CASES).sort());
  });

  for (const [name, input] of Object.entries(ZERO_EXCESS_CASES)) {
    it(`K-1 ${name}`, () => {
      const now = JSON.parse(JSON.stringify(calculatePropertyTax(input)));
      expect(now).toStrictEqual((golden as Record<string, unknown>)[name]);
      expect("landSplit" in now).toBe(false);
    });
  }
});

describe("PSE-E0 오라클 — 이관분 세액(손계산 값 · 구현 전 빨강)", () => {
  it("K-2 F-1 공장 초과 3,000㎡ · 타 0 — 분리과세분 1,680,000 + 이관분 800,000 = 2,480,000 / 총 2,976,000", () => {
    const r = F({ otherComprehensiveValue: 0 });
    expect(r.determinedTax).toBe(2_480_000);
    expect(r.surtax.localEducationTax).toBe(496_000);
    expect(r.totalPayable).toBe(2_976_000);
  });

  it("K-3 F-1u 도시지역 — 도시지역분 = 자기 과세표준 1,050,000,000 × 0.14% = 1,470,000 → 총 4,446,000", () => {
    const r = F({ otherComprehensiveValue: 0, isUrbanArea: true });
    expect(r.surtax.urbanAreaTax).toBe(1_470_000);
    expect(r.totalSurtax).toBe(1_966_000);
    expect(r.totalPayable).toBe(4_446_000);
  });

  it("K-4 F-2 타 종합합산 2억 — 합산 5억 → 과표 3.5억 → 합산세 1,500,000 → 이 필지 몫 900,000 → 본세 2,580,000 / 총 3,096,000", () => {
    const r = F({ otherComprehensiveValue: 200_000_000 });
    expect(r.determinedTax).toBe(2_580_000);
    expect(r.totalPayable).toBe(3_096_000);
  });

  it("K-5 P-1 목장 초과 1,375㎡ · 타 0 — 15,312 + 96,250 = 111,562 / 총 133,874", () => {
    const r = P({ otherComprehensiveValue: 0 });
    expect(r.determinedTax).toBe(111_562);
    expect(r.totalPayable).toBe(133_874);
  });

  it("K-6 P-2 타 종합합산 2억 — 몫 176,671 → 본세 191,983 / 총 230,379", () => {
    const r = P({ otherComprehensiveValue: 200_000_000 });
    expect(r.determinedTax).toBe(191_983);
    expect(r.totalPayable).toBe(230_379);
  });
});
