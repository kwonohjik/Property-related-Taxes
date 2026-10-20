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
 *
 * 2026-10-20 — 상속 3년은 «양도일이 3년 안이면 전 기간»이 아니라 상속개시일부터 3년의 **기간**으로 센다
 * (계획서 `docs/00-pm/nbl-farmland-inherit-inong-3y.plan.md` Q-5 b). 윤년 결함의 자리는 3년 구간의 끝
 * (`threeYearsFrom` — 달력 기준 addYears)으로 옮겼다. 그래서 「정확히 3년 경과 → 비사업용」은 더 이상 성립하지 않는다
 * (3년 구간이 보유기간 전부라 사업용) — 구간 끝이 달력 기준인지를 직접 본다. 시료의 취득일은 상속개시일과 같게 맞췄다
 * (매퍼는 상속개시일 = 취득일로 싣는다 — 종전 시료의 취득일 2015는 그 불변식을 어겼다).
 */
import { describe, it, expect } from "vitest";
import { judgeForest } from "@/lib/tax-engine/non-business-land/forest";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { threeYearsFrom } from "@/lib/tax-engine/non-business-land/utils/period-math";

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
    acquisitionDate: forestInheritanceDate,
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
        (s) => s.id === "forest_public_business" && s.detail.includes("부터 3년을 사업용 기간으로 셈"),
      ),
    ).toBe(true);
  });

  it("3년 구간의 끝은 달력 기준: 상속 2019-03-01 → 2022-03-01 (1,095일 뒤인 2022-02-28이 아니다)", () => {
    expect(threeYearsFrom(d("2019-03-01")).end).toEqual(d("2022-03-01"));
  });

  it("비윤년 대조: 상속 2020-03-01, 양도 2023-02-27 → 3년 미경과 → 사업용(구·신 동일)", () => {
    const r = judgeForest(
      inheritedForestBase(d("2020-03-01"), d("2023-02-27")),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(
      r.steps.some(
        (s) => s.id === "forest_public_business" && s.detail.includes("부터 3년을 사업용 기간으로 셈"),
      ),
    ).toBe(true);
  });
});
