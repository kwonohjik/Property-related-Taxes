/**
 * NBL raw → 엔진 input 변환 헬퍼 ⑭ — buildNblEngineInput
 *
 * Plan: docs/00-pm/nbl-detailed-input-restoration.plan.md §6 Anchor-1
 * Pre-Do(TDD): 헬퍼·모듈 부재 → import 실패(현재 FAIL). 구현(T5) 후 PASS.
 * 검증: raw(문자열 날짜) → nested sub-object + Date 객체.
 */
import { describe, it, expect } from "vitest";

import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";

describe("[NBL-REQ] buildNblEngineInput — raw → 엔진 input(nested + Date)", () => {
  it("forest raw → forestDetail + gracePeriods(Date)", () => {
    const raw = {
      nblUseDetailedJudgment: true,
      nblLandType: "forest",
      nblZoneType: "agriculture_forest",
      acquisitionArea: "1000",
      acquisitionDate: "2018-01-01",
      transferDate: "2026-06-01",
      nblForestHasPlan: true,
      nblBusinessUsePeriods: [],
      nblResidenceHistories: [],
      nblGracePeriods: [
        { reasonCode: "other_justifiable", anchorDate: "2022-07-01", endDate: "2023-06-30", description: "질병" },
      ],
    };
    const input = buildNblEngineInput(raw as never);
    expect(input).toBeDefined();
    expect(input!.landType).toBe("forest");
    expect(input!.landArea).toBe(1000);
    expect(input!.forestDetail?.hasForestPlan).toBe(true);
    expect(input!.gracePeriods[0]?.startDate).toBeInstanceOf(Date);
    expect(input!.acquisitionDate).toBeInstanceOf(Date);
  });

  it("undefined raw → undefined", () => {
    expect(buildNblEngineInput(undefined)).toBeUndefined();
  });

  it("other_land raw → otherLand.relatedBusinessType + standardAreaLimit (갭 3a ⑫⑬⑭ 침묵 strip 방지)", () => {
    const raw = {
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "2000",
      acquisitionDate: "2014-01-01",
      transferDate: "2024-01-01",
      nblOtherPropertyTaxType: "comprehensive",
      nblOtherRelatedBusinessType: "parking_attached",
      nblOtherStandardAreaLimit: "1200",
      nblBusinessUsePeriods: [],
      nblResidenceHistories: [],
      nblGracePeriods: [],
    };
    const input = buildNblEngineInput(raw as never);
    expect(input).toBeDefined();
    expect(input!.otherLand?.relatedBusinessType).toBe("parking_attached");
    expect(input!.otherLand?.standardAreaLimit).toBe(1200);
  });

  it("other_land raw → 자동산식 면적인자(hatchang maxAnnualArea·youth youthCapacity·garage minGarageArea)", () => {
    const raw = {
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "1500",
      acquisitionDate: "2014-01-01",
      transferDate: "2024-01-01",
      nblOtherPropertyTaxType: "comprehensive",
      nblOtherRelatedBusinessType: "hatchang",
      nblOtherMaxAnnualArea: "1000",
      nblOtherYouthCapacity: "10",
      nblOtherMinGarageArea: "400",
      nblBusinessUsePeriods: [],
      nblResidenceHistories: [],
      nblGracePeriods: [],
    };
    const input = buildNblEngineInput(raw as never);
    expect(input!.otherLand?.maxAnnualArea).toBe(1000);
    expect(input!.otherLand?.youthCapacity).toBe(10);
    expect(input!.otherLand?.minGarageArea).toBe(400);
  });
});
