/**
 * §168의14① 유예기간 judge 결선 — grace가 기간기준 사업용 일수에 가산되는지
 *
 * Pre-Do: 현재 judge들이 meetsPeriodCriteria에 6번째 인자(gracePeriods)를 미전달 →
 *          병합된 grace가 사장. 본 anchor는 grace 제공 시 effectiveBusinessDays 가산 +
 *          gracePeriodDays>0 + 판정 전환을 단언(현재 FAIL).
 *
 * 경로: 농지(도시지역 밖) — realFarming=overlap(재촌, 자경) partial 1년 → 기간기준 미충족(비사업용).
 *       직전 3년 전체를 덮는 유예기간 제공 시 직전3년 사업용일수 가산 → 사업용 전환.
 */
import { describe, it, expect } from "vitest";

import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput, GracePeriod } from "@/lib/tax-engine/non-business-land/types";

function farmlandInput(gracePeriods: GracePeriod[]): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: 1000,
    zoneType: "agriculture_forest", // 도시지역 밖 → 사용기준 충족 시 사업용
    acquisitionDate: new Date("2018-01-01"),
    transferDate: new Date("2026-06-01"),
    farmingSelf: true,
    farmerResidenceDistance: 10, // ≤30km → 재촌 (전체기간 거리 fallback)
    businessUsePeriods: [
      { startDate: new Date("2018-01-01"), endDate: new Date("2019-01-01"), usageType: "자경" }, // 자경 1년만
    ],
    gracePeriods,
  };
}

describe("[NBL-GRACE] §168의14① 유예기간 가산", () => {
  it("유예기간 미제공 → 기간기준 미충족·비사업용·gracePeriodDays 0 (baseline)", () => {
    const r = judgeNonBusinessLand(farmlandInput([]), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.gracePeriodDays).toBe(0);
  });

  it("유예기간(직전 3년 전체) 제공 → grace 가산 → 사업용 전환 + gracePeriodDays>0 + effectiveBusinessDays 증가", () => {
    const baseline = judgeNonBusinessLand(farmlandInput([]), DEFAULT_NON_BUSINESS_LAND_RULES);
    const grace: GracePeriod[] = [
      { reasonCode: "use_prohibited", startDate: new Date("2023-06-01"), endDate: new Date("2026-06-01") },
    ];
    const r = judgeNonBusinessLand(farmlandInput(grace), DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(r.gracePeriodDays).toBeGreaterThan(0); // 현재 0 (FAIL)
    expect(r.effectiveBusinessDays).toBeGreaterThan(baseline.effectiveBusinessDays); // 현재 동일 (FAIL)
    expect(r.isNonBusinessLand).toBe(false); // 현재 true — grace 미가산 (FAIL)
  });

  it("§83의5① 사유 grace(통합 채널)도 가산 → 사업용 전환 (구 unavoidableReasons 대체)", () => {
    // unavoidableReasons 채널 제거 후 gracePeriods 단일 채널로 일원화 (갭 3b)
    const grace: GracePeriod[] = [
      { reasonCode: "ownership_litigation", startDate: new Date("2023-06-01"), endDate: new Date("2026-06-01") },
    ];
    const r = judgeNonBusinessLand(farmlandInput(grace), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.gracePeriodDays).toBeGreaterThan(0);
    expect(r.isNonBusinessLand).toBe(false);
  });
});
