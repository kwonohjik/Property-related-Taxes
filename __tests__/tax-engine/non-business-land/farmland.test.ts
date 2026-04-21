/**
 * Phase C-1 유닛 테스트 — farmland.ts (PDF p.1698)
 */
import { describe, it, expect } from "vitest";
import { judgeFarmland } from "@/lib/tax-engine/non-business-land/farmland";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: 1000,
    zoneType: "agriculture_forest", // 도시지역 外
    acquisitionDate: d("2015-01-01"),
    transferDate: d("2024-01-01"),
    farmingSelf: true,
    landLocation: { sigunguCode: "11680" },
    ownerLocation: { sigunguCode: "11680" },
    ownerProfile: {
      residenceHistories: [
        {
          sidoName: "서울",
          sigunguName: "강남구",
          sigunguCode: "11680",
          startDate: d("2015-01-01"),
          endDate: d("2024-01-01"),
          hasResidentRegistration: true,
        },
      ],
    },
    businessUsePeriods: [{ startDate: d("2015-01-02"), endDate: d("2024-01-01"), usageType: "자경" }],
    gracePeriods: [],
    ...partial,
  };
}

describe("C-1 농지 PDF p.1698 흐름도", () => {
  it("재촌·자경 전기간 + 도시지역 밖 → 사업용", () => {
    const r = judgeFarmland(base(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("도시지역 밖");
  });

  it("재촌 미충족 + 사용의제 없음 → 비사업용", () => {
    const r = judgeFarmland(
      base({
        ownerProfile: {
          residenceHistories: [
            {
              sidoName: "부산",
              sigunguName: "해운대",
              sigunguCode: "26440",
              startDate: d("2015-01-01"),
              endDate: d("2024-01-01"),
              hasResidentRegistration: true,
            },
          ],
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.reason).toContain("사용기준 미충족");
  });

  it("주말농장 사용의제 + 도시지역 밖 → 사업용 (deemed 모드)", () => {
    const r = judgeFarmland(
      base({
        farmingSelf: false,
        landArea: 800,
        businessUsePeriods: [],
        farmlandDeeming: { isWeekendFarm: true },
        acquisitionDate: d("2010-01-01"),
        transferDate: d("2020-01-01"),
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("도시지역 밖");
    expect(r.steps.some((s) => s.id === "farmland_deeming" && s.status === "PASS")).toBe(true);
  });

  it("재촌·자경 + 도시지역 內 + 편입유예 3년 내 → 사업용", () => {
    const r = judgeFarmland(
      base({
        zoneType: "general_residential",
        urbanIncorporationDate: d("2022-06-01"),
        transferDate: d("2024-06-01"), // 편입 후 2년 → 유예 내
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("편입유예 내");
  });

  it("재촌·자경 + 도시지역 內 + 편입유예 초과 → 비사업용", () => {
    const r = judgeFarmland(
      base({
        zoneType: "general_residential",
        urbanIncorporationDate: d("2017-01-01"),
        transferDate: d("2024-01-01"), // 편입 후 7년
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.reason).toContain("편입유예 외");
  });

  it("6개월 재촌·자경 + 도시지역 內 → 편입유예 요건(1년) 미충족 → 비사업용", () => {
    const r = judgeFarmland(
      base({
        zoneType: "general_residential",
        acquisitionDate: d("2023-01-01"),
        transferDate: d("2023-07-01"), // 6개월만 재촌자경
        urbanIncorporationDate: d("2023-06-01"),
        ownerProfile: {
          residenceHistories: [
            {
              sidoName: "서울",
              sigunguName: "강남구",
              sigunguCode: "11680",
              startDate: d("2023-01-01"),
              endDate: d("2023-07-01"),
              hasResidentRegistration: true,
            },
          ],
        },
        businessUsePeriods: [{ startDate: d("2023-01-02"), endDate: d("2023-07-01"), usageType: "자경" }],
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // 6개월 동안 전체 보유 → 100% → 기간기준 ratio 통과. 그러나 편입유예 요건(1년 재촌자경) 미충족.
    // 도시지역 內 이므로 편입유예 검사 → 1년 미달 → 비사업용
    expect(r.isBusiness).toBe(false);
    expect(r.reason).toContain("편입유예 요건");
  });
});
