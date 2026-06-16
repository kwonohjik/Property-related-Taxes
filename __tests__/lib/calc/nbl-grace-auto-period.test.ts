/**
 * 갭 3b — 부득이 사유 종료일 자동산정 end-to-end (raw → engine → judge)
 *
 * 기산일만 입력하면 form-mapper가 사유별 법정 종료일을 자동 산정해 gracePeriods에 반영.
 * 9호 멸실: 멸실일 + 5년. 단서: 매매업 매매용부동산은 1·2호 배제.
 */
import { describe, it, expect } from "vitest";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import {
  judgeNonBusinessLand,
  DEFAULT_NON_BUSINESS_LAND_RULES,
} from "@/lib/tax-engine/non-business-land";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;

function farmlandRaw(extra: Record<string, unknown>) {
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    acquisitionArea: "1000",
    acquisitionDate: "2018-01-01",
    transferDate: "2026-06-01",
    nblFarmingSelf: true,
    nblFarmerResidenceDistance: "10",
    nblBusinessUsePeriods: [{ startDate: "2018-01-01", endDate: "2019-01-01", usageType: "자경" }],
    nblResidenceHistories: [],
    ...extra,
  } as never;
}

describe("[NBL-GRACE-AUTO] 사유별 종료일 자동산정 end-to-end", () => {
  it("9호 멸실 — 기산일(멸실일)만 입력 → 종료일 멸실+5년 자동산정", () => {
    const input = buildNblEngineInput(
      farmlandRaw({
        nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2021-06-01" }],
      }),
    );
    expect(input).toBeDefined();
    expect(input!.gracePeriods.length).toBe(1);
    expect(input!.gracePeriods[0]?.startDate.toISOString().slice(0, 10)).toBe("2021-06-01");
    expect(input!.gracePeriods[0]?.endDate.toISOString().slice(0, 10)).toBe("2026-06-01"); // +5년
  });

  it("baseline(자경 1년·grace 없음) → 비사업용", () => {
    const input = buildNblEngineInput(farmlandRaw({ nblGracePeriods: [] }));
    const r = judgeNonBusinessLand(input!, R);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.gracePeriodDays).toBe(0);
  });

  it("9호 멸실 기산일만 입력 → grace 자동가산 → 사업용 전환", () => {
    const input = buildNblEngineInput(
      farmlandRaw({
        nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2021-06-01" }],
      }),
    );
    const r = judgeNonBusinessLand(input!, R);
    expect(r.gracePeriodDays).toBeGreaterThan(0);
    expect(r.isNonBusinessLand).toBe(false);
  });

  it("단서 — 매매업 매매용부동산은 1호(건축허가 제한) 가산 배제", () => {
    const withDealer = buildNblEngineInput(
      farmlandRaw({
        nblBusinessIsRealEstateDealer: true,
        nblGracePeriods: [{ reasonCode: "building_permit_restricted", anchorDate: "2021-06-01", endDate: "2026-06-01" }],
      }),
    );
    expect(withDealer!.gracePeriods.length).toBe(0); // 단서 배제

    const noDealer = buildNblEngineInput(
      farmlandRaw({
        nblBusinessIsRealEstateDealer: false,
        nblGracePeriods: [{ reasonCode: "building_permit_restricted", anchorDate: "2021-06-01", endDate: "2026-06-01" }],
      }),
    );
    expect(noDealer!.gracePeriods.length).toBe(1); // 대조: 정상 가산
  });
});
