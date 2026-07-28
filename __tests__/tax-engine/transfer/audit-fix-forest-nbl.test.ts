/**
 * 감사 확정 결함 회귀 테스트
 * ref: forest.ts:53 — 상속 3년 이내 임야(§168조의9③7호) 판정을
 *      differenceInDays(...)/365 < 3 (1095일 기준)으로 계산해 윤년(2.29) 포함 구간에서
 *      1일 짧게 인정 → 3년 만기 직전 양도가 '경과'로 오판되어 사업용→비사업용 중과.
 *      달력연 비교(input.transferDate < addYears(inheritanceDate, 3))로 정정.
 *
 * 법령: 소득세법 시행령 §168조의9③7호 — "상속개시일부터 3년이 경과하지 아니한 임야"
 *
 * 기대값 도출(법령 독립):
 *   - 상속 2019-03-01 → 만 3년 경과일 = 2022-03-01(달력연). 그 전 = 3년 미경과(사업용 의제).
 *     · 양도 2022-02-28: 아직 3년 미경과 → 의제 적용(사업용). (구코드: 구간에 2020-02-29 포함,
 *       differenceInDays=1095, 1095/365=3.0, 3.0<3=false → 잘못 배제)
 *     · 양도 2022-03-01: 만 3년 경과 → 의제 미적용(비사업용).
 *   - 비윤년 대조: 상속 2020-03-01, 양도 2023-02-27 → 3년 미경과 → 의제 적용(구·신 동일).
 */
import { describe, it, expect } from "vitest";
import { judgeForest } from "@/lib/tax-engine/non-business-land/forest";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

// 재촌 미충족(주민등록/거주이력 없음)으로 두어 상속 3년 이내 게이트(Step 3-1-1)에 도달시킨다.
// 소유기간 판정은 이 결함과 무관하므로, 취득일을 충분히 앞(2015)으로 두어 전체기간 기준을 확실히 충족시켜
// '상속 3년 이내' 의제 분기의 결과만 관찰한다.
function inheritedForestBase(
  forestInheritanceDate: Date,
  transferDate: Date,
): NonBusinessLandInput {
  return {
    landType: "forest",
    landArea: 5000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2015-01-01"),
    transferDate,
    landLocation: { sigunguCode: "11680" },
    businessUsePeriods: [],
    gracePeriods: [],
    forestDetail: {
      inheritedForestWithin3Years: true,
      forestInheritanceDate,
    },
  };
}

describe("감사 결함 forest.ts:53 — 상속 3년 이내 임야 윤년 off-by-one", () => {
  it("윤년 경계: 상속 2019-03-01, 양도 2022-02-28 → 3년 미경과 → 사업용(의제 적용)", () => {
    const r = judgeForest(
      inheritedForestBase(d("2019-03-01"), d("2022-02-28")),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(
      r.steps.some(
        (s) => s.id === "forest_public_business" && s.detail.includes("상속 3년 이내"),
      ),
    ).toBe(true);
  });

  it("정확히 3년 경과: 상속 2019-03-01, 양도 2022-03-01 → 의제 미적용 → 비사업용", () => {
    const r = judgeForest(
      inheritedForestBase(d("2019-03-01"), d("2022-03-01")),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
  });

  it("비윤년 대조: 상속 2020-03-01, 양도 2023-02-27 → 3년 미경과 → 사업용(구·신 동일)", () => {
    const r = judgeForest(
      inheritedForestBase(d("2020-03-01"), d("2023-02-27")),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(
      r.steps.some(
        (s) => s.id === "forest_public_business" && s.detail.includes("상속 3년 이내"),
      ),
    ).toBe(true);
  });
});
