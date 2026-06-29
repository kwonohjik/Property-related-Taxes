/**
 * NBL raw → 엔진 input 변환 헬퍼 ⑭ — buildNblEngineInput
 *
 * Plan: docs/00-pm/nbl-detailed-input-restoration.plan.md §6 Anchor-1
 * Pre-Do(TDD): 헬퍼·모듈 부재 → import 실패(현재 FAIL). 구현(T5) 후 PASS.
 * 검증: raw(문자열 날짜) → nested sub-object + Date 객체.
 */
import { describe, it, expect } from "vitest";

import { buildNblEngineInput, buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

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

  it("연환산 raw 운반(prefix-pick ⑬) + 당해/직전 영위일수·과세연도 도출", () => {
    // 클라 빌더: store 폼 → raw 평면. 신규 nbl* 필드가 prefix-pick으로 운반되어야 함.
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "land",
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "1000",
      acquisitionDate: "2018-01-01",
      nblOtherPropertyTaxType: "comprehensive",
      nblRevenueBusinessType: "vehicle_repair_academy",
      nblRevenueCurrentRevenue: "25000000",
      nblRevenueCurrentLandValue: "1000000000",
      nblRevenuePriorRevenue: "100000000",
      nblRevenuePriorLandValue: "1000000000",
      nblRevenueCurrentBusinessStartDate: "",
      nblRevenuePriorBusinessDays: "200",
    } as unknown as Parameters<typeof buildNonBusinessLandRaw>[0];

    const raw = buildNonBusinessLandRaw(asset, "2026-07-02"); // 1.1~7.2 초일산입 = 183일
    expect(raw).toBeDefined();
    // prefix-pick 운반 확인 (신규 2필드)
    expect(raw!.nblRevenuePriorBusinessDays).toBe("200");
    expect("nblRevenueCurrentBusinessStartDate" in raw!).toBe(true);

    const input = buildNblEngineInput(raw as never);
    expect(input!.revenueTest?.currentBusinessDays).toBe(183);
    expect(input!.revenueTest?.currentTaxYear).toBe(2026);
    expect(input!.revenueTest?.priorBusinessDays).toBe(200);
    expect(input!.revenueTest?.priorTaxYear).toBe(2025);
  });

  it("간주임대료·공통안분 raw 운반(⑬) + 율 해소(⑭) + 토글 게이트", () => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "land",
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "1000",
      acquisitionDate: "2018-01-01",
      nblOtherPropertyTaxType: "comprehensive",
      nblRevenueBusinessType: "parking_operation",
      nblRevenueCurrentRevenue: "0",
      nblRevenueCurrentLandValue: "1000000000",
      nblRevenueCurrentDeposit: "1000000000",
      nblRevenueCurrentRentDays: "365",
      nblRevenueCommonApportion: true,
      nblRevenueCommonRevenue: "100000000",
      nblRevenueOtherLandValue: "400000000",
    } as unknown as Parameters<typeof buildNonBusinessLandRaw>[0];

    const raw = buildNonBusinessLandRaw(asset, "2026-07-02");
    // prefix-pick 운반
    expect(raw!.nblRevenueCurrentDeposit).toBe("1000000000");
    expect(raw!.nblRevenueCommonApportion).toBe(true);

    const input = buildNblEngineInput(raw as never);
    // ⑭ 율 해소 — 2026 → 부가세칙 §47 현행 31/1000
    expect(input!.revenueTest?.currentDeemedRate).toEqual({ num: 31, den: 1000 });
    expect(input!.revenueTest?.currentDeposit).toBe(1_000_000_000);
    expect(input!.revenueTest?.currentRentDays).toBe(365);
    // 토글 ON → 공통 매핑
    expect(input!.revenueTest?.commonRevenue).toBe(100_000_000);
    expect(input!.revenueTest?.otherLandValue).toBe(400_000_000);
  });

  it("공통안분 토글 OFF → 공통 필드 미매핑(undefined)", () => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "land",
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      acquisitionArea: "1000",
      acquisitionDate: "2018-01-01",
      nblOtherPropertyTaxType: "comprehensive",
      nblRevenueBusinessType: "parking_operation",
      nblRevenueCurrentRevenue: "50000000",
      nblRevenueCurrentLandValue: "1000000000",
      nblRevenueCommonApportion: false,
      nblRevenueCommonRevenue: "100000000",
      nblRevenueOtherLandValue: "400000000",
    } as unknown as Parameters<typeof buildNonBusinessLandRaw>[0];

    const input = buildNblEngineInput(buildNonBusinessLandRaw(asset, "2026-07-02") as never);
    expect(input!.revenueTest?.commonRevenue).toBeUndefined();
    expect(input!.revenueTest?.otherLandValue).toBeUndefined();
  });
});
