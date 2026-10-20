/**
 * leaf: `resolveMixedSaleSplit` — 겸용 일괄양도 양도가액 1차(토지:건물) · 2차(주택:상가) 안분.
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.2 · §9.1 R-1
 *
 * 공통 기준시가(사례 p.772 역산): 주택토지 30,000,000(=250,000×120㎡) · 주택건물 27,000,000 ·
 *   상가토지 70,000,000(=250,000×280㎡) · 상가건물 63,000,000 → 토지 100,000,000 : 건물 90,000,000
 *   기준시가 안분(200,000,000): 토지 105,263,157 / 건물 94,736,843
 */
import { describe, it, expect } from "vitest";
import {
  apportionBuildingDirect,
  apportionByParts,
  resolveMixedSaleSplit,
  splitLandBuildingToParts,
} from "@/lib/tax-engine/mixed-use-sale-split";
import type { MixedTransferStd4 } from "@/lib/tax-engine/types/transfer-mixed-use-sale-split.types";

const STD: MixedTransferStd4 = {
  housingLand: 30_000_000,
  housingBuilding: 27_000_000,
  commercialLand: 70_000_000,
  commercialBuilding: 63_000_000,
};
const TOTAL = 200_000_000;
const D2026 = new Date("2026-07-01");
const APPRAISAL = { land: 150_000_000, building: 100_000_000 };

function sum4(p: { housingLand: number; housingBuilding: number; commercialLand: number; commercialBuilding: number }) {
  return p.housingLand + p.housingBuilding + p.commercialLand + p.commercialBuilding;
}

describe("resolveMixedSaleSplit — 입력 유무", () => {
  it("[U-1] 구분가액·감정가액 모두 없음 → 현행 경로(no_input)", () => {
    expect(resolveMixedSaleSplit({ totalTransferPrice: TOTAL, transferDate: D2026, transferStd: STD })).toEqual({
      applies: false,
      reason: "no_input",
    });
  });

  it("[U-2] 감정가액 → 1차 120,000,000 / 80,000,000 → 2차 기준시가 비율 (사례 목표값)", () => {
    const r = resolveMixedSaleSplit({ totalTransferPrice: TOTAL, transferDate: D2026, appraisal: APPRAISAL, transferStd: STD });
    expect(r.applies).toBe(true);
    if (!r.applies) return;
    expect(r.echo.basis).toBe("appraisal");
    expect(r.echo.landBuilding).toEqual({ land: 120_000_000, building: 80_000_000 });
    expect(r.echo.parts).toEqual({
      housingLand: 36_000_000,
      commercialLand: 84_000_000,
      housingBuilding: 24_000_000,
      commercialBuilding: 56_000_000,
    });
    expect(r.echo.deemedUnclear).toBeUndefined();
  });

  it("[U-3] 감정가액 한쪽만 → 기준시가로 귀결 → 현행 경로(appraisal_incomplete) — 새 순서로 기준시가 안분하지 않는다", () => {
    const r = resolveMixedSaleSplit({
      totalTransferPrice: TOTAL, transferDate: D2026, appraisal: { land: 150_000_000, building: 0 }, transferStd: STD,
    });
    expect(r).toEqual({ applies: false, reason: "appraisal_incomplete", appraisalRejected: "incomplete" });
  });
});

describe("resolveMixedSaleSplit — 계약서 구분가액 · §100③", () => {
  it("[U-4] 30% 이내 → 구분가액 그대로, 2차만 기준시가 비율", () => {
    const r = resolveMixedSaleSplit({
      totalTransferPrice: TOTAL, transferDate: D2026, declared: { land: 110_000_000, building: 90_000_000 }, transferStd: STD,
    });
    expect(r.applies).toBe(true);
    if (!r.applies) return;
    expect(r.echo.basis).toBe("declared");
    expect(r.echo.deemedUnclear?.deemed).toBe(false);
    expect(r.echo.parts).toEqual({
      housingLand: 33_000_000,
      commercialLand: 77_000_000,
      housingBuilding: 27_000_000,
      commercialBuilding: 63_000_000,
    });
  });

  it("[U-5] 30% 이상 이탈 + 감정 없음 → 기준시가 → 현행 경로(deemed_to_std, R-1)", () => {
    const r = resolveMixedSaleSplit({
      totalTransferPrice: TOTAL, transferDate: D2026, declared: { land: 180_000_000, building: 20_000_000 }, transferStd: STD,
    });
    expect(r.applies).toBe(false);
    if (r.applies) return;
    expect(r.reason).toBe("deemed_to_std");
    expect(r.deemedUnclear?.deemed).toBe(true);
    expect(r.deemedUnclear?.detail.buildingOver).toBe(true);
  });

  it("[U-6] 30% 이상 이탈 + 감정 있음 → 감정 비율이 비교 기준이자 적용 basis", () => {
    const r = resolveMixedSaleSplit({
      totalTransferPrice: TOTAL, transferDate: D2026, declared: { land: 180_000_000, building: 20_000_000 },
      appraisal: APPRAISAL, transferStd: STD,
    });
    expect(r.applies).toBe(true);
    if (!r.applies) return;
    expect(r.echo.basis).toBe("appraisal");
    expect(r.echo.deemedUnclear?.deemed).toBe(true);
    expect(r.echo.landBuilding).toEqual({ land: 120_000_000, building: 80_000_000 });
  });

  it("[U-6b] 감정 있음 + 구분가액이 감정 비율 30% 이내 → 구분가액 채택(감정은 비교 기준일 뿐)", () => {
    // 감정 안분 120/80 대비 125/75: 토지 4.2% · 건물 6.25%
    const r = resolveMixedSaleSplit({
      totalTransferPrice: TOTAL, transferDate: D2026, declared: { land: 125_000_000, building: 75_000_000 },
      appraisal: APPRAISAL, transferStd: STD,
    });
    expect(r.applies && r.echo.basis).toBe("declared");
    expect(r.applies && r.echo.landBuilding).toEqual({ land: 125_000_000, building: 75_000_000 });
  });

  it("[U-7] 2016.1.1. 전 양도 → §100③ 없음 → 이탈해도 구분가액 그대로", () => {
    const r = resolveMixedSaleSplit({
      totalTransferPrice: TOTAL, transferDate: new Date("2015-12-31"), declared: { land: 180_000_000, building: 20_000_000 },
      transferStd: STD,
    });
    expect(r.applies && r.echo.basis).toBe("declared");
    expect(r.applies && r.echo.deemedUnclear?.detail.era).toBe("none");
  });

  it("[U-8] 2016~2024 양도 + §166⑧ 예외 입력 → 단서 시행 전이라 무시 → 의제 발동", () => {
    const r = resolveMixedSaleSplit({
      totalTransferPrice: TOTAL, transferDate: new Date("2024-12-31"), declared: { land: 180_000_000, building: 20_000_000 },
      exemption: "other_law", transferStd: STD,
    });
    expect(r.applies).toBe(false);
    if (r.applies) return;
    expect(r.reason).toBe("deemed_to_std");
    expect(r.deemedUnclear?.detail.exemptionIgnoredByEra).toBe("other_law");
  });

  it("[U-9] 2025.1.1. 이후 + §166⑧ 예외 → 의제 면제 → 구분가액 그대로", () => {
    const r = resolveMixedSaleSplit({
      totalTransferPrice: TOTAL, transferDate: D2026, declared: { land: 180_000_000, building: 20_000_000 },
      exemption: "demolished_land_only", transferStd: STD,
    });
    expect(r.applies && r.echo.basis).toBe("declared");
    expect(r.applies && r.echo.deemedUnclear?.detail.exemptionApplied).toBe("demolished_land_only");
  });

  it("[U-10] 구분가액 합 ≠ 양도가액 → 차단(조용히 보정하지 않는다)", () => {
    expect(() =>
      resolveMixedSaleSplit({
        totalTransferPrice: TOTAL, transferDate: D2026, declared: { land: 110_000_000, building: 80_000_000 }, transferStd: STD,
      }),
    ).toThrow(/구분가액 합/);
  });
});

describe("2차 비율 — 토지·건물 축이 각자의 기준시가를 쓴다", () => {
  it("[U-14] 토지 주택:상가(40:60) ≠ 건물 주택:상가(20:70) — 사례 기준시가는 두 비율이 같아 축 혼동을 못 잡는다", () => {
    const std2: MixedTransferStd4 = {
      housingLand: 40_000_000, housingBuilding: 20_000_000, commercialLand: 60_000_000, commercialBuilding: 70_000_000,
    };
    const r = resolveMixedSaleSplit({ totalTransferPrice: TOTAL, transferDate: D2026, appraisal: APPRAISAL, transferStd: std2 });
    expect(r.applies && r.echo.parts).toEqual({
      housingLand: 48_000_000,          // 120,000,000 × 40/100
      commercialLand: 72_000_000,
      housingBuilding: 17_777_777,      // floor(80,000,000 × 20/90)
      commercialBuilding: 62_222_223,   // 잔액 흡수
    });
  });
});

describe("4파트 분배 helper", () => {
  it("[U-11] 4파트 합 = 총액 (홀수 총액 · 잔액 흡수)", () => {
    const parts = splitLandBuildingToParts({ land: 120_000_001, building: 79_999_999 }, STD);
    expect(sum4(parts)).toBe(200_000_000);
  });

  it("[U-12] 공통 양도비 → 4파트 양도가액 비율(§100② 후단)", () => {
    const parts = { housingLand: 36_000_000, housingBuilding: 24_000_000, commercialLand: 84_000_000, commercialBuilding: 56_000_000 };
    expect(apportionByParts(1_000_000, parts)).toEqual({
      housingLand: 180_000,
      housingBuilding: 120_000,
      commercialLand: 420_000,
      commercialBuilding: 280_000,
    });
    expect(sum4(apportionByParts(999_999, parts))).toBe(999_999);
  });

  it("[U-13] 건물 귀속 양도비 → 주택건물:상가건물 (토지 몫 없음) — 사례 철거비 700,000", () => {
    expect(apportionBuildingDirect(1_000_000, 24_000_000, 56_000_000)).toEqual({ land: 300_000, building: 700_000 });
    expect(apportionBuildingDirect(0, 24_000_000, 56_000_000)).toEqual({ land: 0, building: 0 });
  });
});
