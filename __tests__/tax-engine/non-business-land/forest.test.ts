/**
 * Phase C-2 유닛 테스트 — forest.ts (PDF p.1700)
 */
import { describe, it, expect } from "vitest";
import { judgeForest } from "@/lib/tax-engine/non-business-land/forest";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "forest",
    landArea: 5000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    landLocation: { sigunguCode: "11680" },
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("C-2 임야 PDF p.1700 흐름도", () => {
  it("재촌(주민등록 O) 기간기준 충족 → 사업용", () => {
    const r = judgeForest(
      base({
        ownerProfile: {
          residenceHistories: [
            {
              sidoName: "서울",
              sigunguName: "강남구",
              sigunguCode: "11680",
              startDate: d("2014-01-01"),
              endDate: d("2024-01-01"),
              hasResidentRegistration: true,
            },
          ],
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("재촌 기간기준");
  });

  it("재촌이나 주민등록 없음 → 재촌 미인정", () => {
    const r = judgeForest(
      base({
        ownerProfile: {
          residenceHistories: [
            {
              sidoName: "서울",
              sigunguName: "강남구",
              sigunguCode: "11680",
              startDate: d("2014-01-01"),
              endDate: d("2024-01-01"),
              hasResidentRegistration: false, // 주민등록 X
            },
          ],
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // 주민등록 없으면 재촌 미인정 + 공익/사업관련 없음 → 비사업용
    expect(r.isBusiness).toBe(false);
  });

  it("재촌 X + 공익임야(개발제한구역 등) + 기간기준 충족 → 사업용", () => {
    const r = judgeForest(
      base({
        forestDetail: { isPublicInterest: true },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("공익");
  });

  it("임업후계자 보유 임야 + 기간기준 → 사업용 (지역기준 미적용)", () => {
    const r = judgeForest(
      base({
        forestDetail: { isForestSuccessor: true },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.steps.some((s) => s.id === "forest_siup_zone" && s.status === "NOT_APPLICABLE")).toBe(true);
  });

  it("시업중 임야(산림경영계획 인가만, 공익플래그 X) + 재촌 X + 도시지역 밖 → 사업용 (B1 회귀 §168조의9①2호가목)", () => {
    // '산림경영계획 인가'만 체크(isPublicInterest 미설정)한 시업중 임야는 재촌 여부와 무관하게
    // §168조의9①2호가목으로 사업용(도시지역 밖). 게이트에서 시업중을 누락하면 비사업용 오판.
    const r = judgeForest(
      base({
        forestDetail: { hasForestPlan: true },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("도시지역 밖");
    expect(r.steps.some((s) => s.id === "forest_siup_zone" && s.status === "PASS")).toBe(true);
  });

  it("특수산림사업지구 임야(공익플래그 X) + 재촌 X + 도시지역 밖 → 사업용 (B1 회귀 §168조의9①2호나목)", () => {
    const r = judgeForest(
      base({
        forestDetail: { isSpecialForestZone: true },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
  });

  it("시업중 임야 + 도시지역 內 + 편입 5년 경과 → 비사업용 (지역기준 적용)", () => {
    const r = judgeForest(
      base({
        zoneType: "general_residential",
        forestDetail: { isPublicInterest: true, hasForestPlan: true },
        urbanIncorporationDate: d("2018-01-01"),
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // 공익(PASS) + 시업중(지역기준 적용) + 도시지역(일반주거) + 유예 외(6년 경과)
    expect(r.isBusiness).toBe(false);
    expect(r.reason).toContain("유예 외");
  });
});
