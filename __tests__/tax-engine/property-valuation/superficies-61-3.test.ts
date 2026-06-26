import { describe, it, expect } from "vitest";
import {
  evaluateSuperficies,
  resolveSuperficiesTenureYears,
} from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 지상권 보충적 평가 — 상증법 §61③ / 상증령 §51① / 상증칙 §16①②.
 * 산식: Σ(n=1..N) floor(income × 10ⁿ / 11ⁿ), income = floor(토지가액 × 2%), 할인율 10% 고정.
 * 잔존연수: 민법 §280·§281 준용 (㉠30/㉡15/㉢5년, 약정 시 max(약정,최단), 미약정 시 최단, 종류미정 15년), 1년 미만 절상.
 * 설계: docs/02-design/features/inheritance-superficies-supplemental-valuation.engine.design.md
 * anchor: 교재 사례(상증기준 61-51-2) — 공시 2,500,000/㎡ × 990㎡ × 2% = 49,500,000, 15년.
 */

const superficies = (p: Partial<EstateItem>): EstateItem => ({
  id: "su-1",
  name: "테스트 지상권",
  category: "superficies",
  superficiesLandStandardPrice: 2_500_000,
  superficiesLandArea: 990,
  superficiesAgreed: false,
  superficiesStructureType: "other_building",
  superficiesRemainingYears: 15,
  ...p,
});

describe("지상권 평가 (§61③·상증령§51·상증칙§16)", () => {
  it("[SU-C1] 교재: 토지 2,475,000,000 · income 49,500,000 · 15년 → 376,500,929", () => {
    const r = evaluateSuperficies(superficies({}));
    // 첫 항 검산: floor(49,500,000 / 1.1) = 45,000,000
    expect(r.valuatedAmount).toBe(376_500_929);
    expect(r.method).toBe("standard_price");
  });

  it("[SU-C7] 잔존연수 0 → 평가액 0 (만료 가드)", () => {
    expect(evaluateSuperficies(superficies({ superficiesRemainingYears: 0 })).valuatedAmount).toBe(0);
  });

  it("[SU-C8] 토지 입력 0 → 평가액 0", () => {
    expect(
      evaluateSuperficies(superficies({ superficiesLandStandardPrice: 0, superficiesLandArea: 0 })).valuatedAmount,
    ).toBe(0);
  });
});

describe("resolveSuperficiesTenureYears (민법 §280·§281)", () => {
  const D = (s: string) => new Date(s);
  const base = { setDate: D("2026-06-26"), valuationDate: D("2026-06-26") };

  it("[SU-C2] 약정 40년 · ㉠견고건물(최단30) → 40", () => {
    expect(resolveSuperficiesTenureYears({ agreed: true, structureType: "solid_building", agreedYears: 40, ...base })).toBe(40);
  });
  it("[SU-C3] 약정 10년 단축 · ㉠견고건물(최단30) → 30 연장", () => {
    expect(resolveSuperficiesTenureYears({ agreed: true, structureType: "solid_building", agreedYears: 10, ...base })).toBe(30);
  });
  it("[SU-C4] 미약정 · ㉢공작물 → 5", () => {
    expect(resolveSuperficiesTenureYears({ agreed: false, structureType: "non_building", ...base })).toBe(5);
  });
  it("[SU-C5] 미약정 · 종류미정 → 15 간주", () => {
    expect(resolveSuperficiesTenureYears({ agreed: false, structureType: "unspecified", ...base })).toBe(15);
  });
  it("[SU-C6] 설정 10년 경과 · 미약정 ㉡(15) → 잔존 5", () => {
    expect(resolveSuperficiesTenureYears({ agreed: false, structureType: "other_building", setDate: D("2016-06-26"), valuationDate: D("2026-06-26") })).toBe(5);
  });
  it("[SU-C6b] 1년 미만 단수 절상: 만료까지 14.3년 → 15", () => {
    // 설정 2016-03-01, ㉡15 → 만료 2031-03-01. 평가 2026-06-26 → 잔존 4년8개월 → 절상 5
    expect(resolveSuperficiesTenureYears({ agreed: false, structureType: "other_building", setDate: D("2016-03-01"), valuationDate: D("2026-06-26") })).toBe(5);
  });
  it("[SU-C7t] 만료 = 평가기준일 → 0", () => {
    expect(resolveSuperficiesTenureYears({ agreed: false, structureType: "other_building", setDate: D("2011-06-26"), valuationDate: D("2026-06-26") })).toBe(0);
  });
});
