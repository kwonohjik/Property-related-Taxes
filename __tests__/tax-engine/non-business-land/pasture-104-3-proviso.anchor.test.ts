/**
 * anchor: 목장용지 — 「소득세법」 §104의3①3호 각 목 외 부분 **단서**는 3호 전체에서 제외한다
 *
 * 발견 V7-b (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 결함: `judgePasture`가 단서 판정(`isRelatedPasture`)을 `if (!r1.meets)` 블록 **안에서만**
 *       호출해, 축산업 영위 기간기준을 **충족한** 목장은 단서를 건너뛰고 기준면적·도시지역
 *       판정으로 직행했다. 결과는 「축산업을 영위하면 오히려 비사업용, 영위하지 않으면 사업용」
 *       이라는 역전이다(실측 총부담세액 +76,548,532원 / +53,507,025원, 납세자 불리).
 *
 * 법령(KoreanLaw 본문 확인): §104의3①3호 「목장용지로서 다음 각 목의 어느 하나에 해당하는 것.
 *   **다만**, … 거주 또는 사업과 직접 관련이 있다고 인정할 만한 상당한 이유가 있는 목장용지로서
 *   대통령령으로 정하는 것은 제외한다.」 — 단서는 가목(기준면적 초과·도시지역)을 포함한 3호 전체에서
 *   제외한다. 시행령 §168의10②(1호 상속 3년·2호 종중·3호 사회복지법인등)이 그 「대통령령으로 정하는 것」.
 *
 * 종중(2호)은 Step 2 무조건 의제가 선점해 가려져 있었으나 1호·3호는 그대로 노출됐다.
 */
import { describe, it, expect } from "vitest";
import { judgePasture } from "@/lib/tax-engine/non-business-land/pasture";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

const d = (s: string) => new Date(s);

/** 축산업을 **영위하는** 목장 — 기준면적을 초과하도록 면적을 크게 잡는다 */
function operatingPasture(overrides: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "pasture",
    landArea: 15_000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    businessUsePeriods: [],
    gracePeriods: [],
    pasture: {
      isLivestockOperator: true,
      livestockType: "hanwoo_breeding",
      livestockCount: 1,
      hasFacility: true,
    },
    ...overrides,
  } as NonBusinessLandInput;
}

describe("[V7-b] §104의3①3호 단서는 축산업 영위 여부와 무관하게 적용된다", () => {
  it("🔴 축산 영위 + 상속 3년 이내 + 기준면적 초과 → 사업용 (§168의10②1호)", () => {
    const r = judgePasture(
      operatingPasture({
        pasture: {
          isLivestockOperator: true,
          livestockType: "hanwoo_breeding",
          livestockCount: 1,
          hasFacility: true,
          inheritanceDate: d("2022-06-01"), // 양도일까지 3년 미경과
        },
      } as Partial<NonBusinessLandInput>),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined();
  });

  it("🔴 축산 영위 + 사회복지법인등 직접 사용 + 도시지역 편입 경과 → 사업용 (§168의10②3호)", () => {
    const r = judgePasture(
      operatingPasture({
        zoneType: "commercial",
        urbanIncorporationDate: d("2015-01-01"),
        landArea: 50,
        pasture: {
          isLivestockOperator: true,
          livestockType: "hanwoo_breeding",
          livestockCount: 1,
          hasFacility: true,
          isSpecialOrgUse: true,
        },
      } as Partial<NonBusinessLandInput>),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
  });

  it("단서 사유가 없으면 종전대로 기준면적 초과분이 비사업용으로 안분된다 (과대적용 방지)", () => {
    const r = judgePasture(operatingPasture(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning).toBeDefined();
  });

  it("축산 미영위 + 단서 사유 → 종전 경로도 그대로 사업용 (회귀 방지)", () => {
    const r = judgePasture(
      operatingPasture({
        pasture: { isLivestockOperator: false, inheritanceDate: d("2022-06-01") },
      } as Partial<NonBusinessLandInput>),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
  });
});
