/**
 * F-1 anchor — 「양도일 의제를 적용했다」는 **실제로 적용된 경우에만** 표시되어야 한다.
 *
 * 🔴 결함 (critic:flow, 2026-09-10):
 *   `getPeriodJudgmentDate`(§168의14②)를 호출하는 것은 농지·임야·목장·별장·기타토지의
 *   지목별 judge뿐이다. **주택부수토지(`housing-land.ts`)와 건물부수토지
 *   (`building-site-land.ts`)는 부르지 않는다** — 이 둘의 판정축은 §168의12/§101①2호의
 *   **배율 × 정착면적**이지 §168의6 기간기준이 아니기 때문이다.
 *   그런데 `engine.ts`의 `assemble()`은 `input.deemedTransferReason`만 보고
 *   `deemedTransfer`를 무조건 실었고, `NonBusinessLandResultCard`가 그것을 받아
 *   「…을 양도일로 보아 **기간기준(§168의6)을 판정했습니다**」라고 **단정**했다.
 *   적용되지 않은 의제를 적용했다고 말한 것이다.
 *
 *   같은 결함의 ⑧ 반쪽(화면에 없는 칸을 요구)은 PR #1548에서 이미 닫았다(R11).
 *   그때 고친 층은 검증이었고 **이 표시를 만드는 층은 그대로였다**
 *   (memory `feedback_fixed_layer_vs_consumed_layer`).
 *
 * 🔴 두 번째 경로: **무조건 사업용 의제(§168의14③)** 가 성립하면 engine은 Step 2에서
 *   조기반환하므로 지목별 judge가 **아예 돌지 않는다**. 지목이 농지여도 기간기준 판정은
 *   일어나지 않았으므로 같은 단정이 허위가 된다
 *   (memory `feedback_early_return_branch_skips_pipeline_stages`).
 *
 * 대조군이 이 anchor의 핵심이다 — `deemedTransfer`를 통째로 지우는 것으로도
 * 「표시가 사라졌다」는 만족되므로, **실제로 소비하는 지목에서는 계속 실려야 한다**는
 * 짝을 함께 건다(memory `feedback_negative_anchor_needs_positive_twin`).
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { consumesPeriodJudgmentDate } from "@/lib/tax-engine/non-business-land/land-category";
import {
  DEFAULT_NON_BUSINESS_LAND_RULES,
  type NonBusinessLandInput,
} from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;

const DEEMED = {
  deemedTransferReason: "auction",
  deemedTransferDate: d("2019-01-01"),
} as Partial<NonBusinessLandInput>;

/** 농지 — 기간기준(§168의6)이 판정축이라 의제일을 **소비한다**. */
const farmland = (o: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput => ({
  landType: "farmland",
  landArea: 1000,
  zoneType: "management",
  acquisitionDate: d("2013-01-01"),
  transferDate: d("2024-01-01"),
  farmingSelf: true,
  farmerResidenceDistance: 0,
  businessUsePeriods: [{ startDate: d("2013-01-01"), endDate: d("2019-01-01"), usageType: "self" }],
  gracePeriods: [],
  ...o,
});

/** 주택부수토지 — 배율 × 정착면적이 판정축이라 의제일을 **소비하지 않는다**. */
const housingSite = (o: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput => ({
  landType: "housing_site",
  landArea: 300,
  zoneType: "general_residential",
  acquisitionDate: d("2015-01-01"),
  transferDate: d("2024-01-01"),
  housingFootprint: 100,
  isMetropolitanArea: true,
  businessUsePeriods: [],
  gracePeriods: [],
  ...o,
});

describe("F-1 술어 — consumesPeriodJudgmentDate", () => {
  it("F1-P1: 기간기준을 판정축으로 쓰는 지목은 소비한다", () => {
    for (const t of ["farmland", "paddy", "field", "orchard", "forest", "pasture", "villa_land", "other_land", "vacant_lot", "miscellaneous"] as const) {
      expect(consumesPeriodJudgmentDate(t)).toBe(true);
    }
  });

  it("F1-P2: 배율축(주택·건물 부수토지)은 소비하지 않는다", () => {
    expect(consumesPeriodJudgmentDate("housing_site")).toBe(false);
    expect(consumesPeriodJudgmentDate("building_site")).toBe(false);
  });

  it("F1-P3: 지목 미선택은 소비하지 않는다 (기간기준 자체가 없다)", () => {
    expect(consumesPeriodJudgmentDate(undefined)).toBe(false);
  });
});

describe("F-1 — 주택부수토지에 양도일 의제를 단정하지 않는다", () => {
  it("F1-1: 주택부수토지는 의제 사유·일자가 있어도 deemedTransfer를 싣지 않는다", () => {
    const r = judgeNonBusinessLand(housingSite(DEEMED), R);
    expect(r.deemedTransfer).toBeUndefined();
  });

  it("F1-2: [근거] 주택부수토지는 의제일이 있어도 판정이 전혀 달라지지 않는다", () => {
    const withDeemed = judgeNonBusinessLand(housingSite(DEEMED), R);
    const without = judgeNonBusinessLand(housingSite(), R);
    // 의제일을 실제로 소비했다면 보유기간이 5년 단축됐어야 한다. 동일하다는 것이
    // 「기간기준을 판정했습니다」가 허위였다는 증거다.
    expect(withDeemed.totalOwnershipDays).toBe(without.totalOwnershipDays);
    expect(withDeemed.isNonBusinessLand).toBe(without.isNonBusinessLand);
  });

  it("F1-3: [대조군] 농지는 계속 deemedTransfer를 싣는다 — 통째 삭제가 아니다", () => {
    const r = judgeNonBusinessLand(farmland(DEEMED), R);
    expect(r.deemedTransfer).toEqual({ reason: "auction", date: d("2019-01-01") });
  });

  it("F1-4: [대조군] 농지에서는 의제일이 실제로 보유기간을 단축한다", () => {
    const withDeemed = judgeNonBusinessLand(farmland(DEEMED), R);
    const without = judgeNonBusinessLand(farmland(), R);
    expect(withDeemed.totalOwnershipDays).toBeLessThan(without.totalOwnershipDays);
  });

  it("F1-5: [대조군] 별장 부수토지는 소비한다 — judgeVillaLand가 getPeriodJudgmentDate를 부른다", () => {
    const r = judgeNonBusinessLand(
      {
        landType: "villa_land",
        landArea: 300,
        zoneType: "management",
        acquisitionDate: d("2013-01-01"),
        transferDate: d("2024-01-01"),
        housingFootprint: 100,
        businessUsePeriods: [],
        gracePeriods: [],
        ...DEEMED,
      } as NonBusinessLandInput,
      R,
    );
    expect(r.deemedTransfer).toBeDefined();
  });
});

describe("F-1 — 무조건 사업용 의제로 조기반환하면 기간기준을 판정하지 않았다", () => {
  it("F1-6: 무조건 의제(§168의14③) 성립 시 deemedTransfer를 싣지 않는다", () => {
    const r = judgeNonBusinessLand(
      farmland({
        ...DEEMED,
        // §168의14③1의2호 — 직계존속·배우자 8년 재촌자경 상속·증여(양도 당시 도시지역 아님).
        unconditionalExemption: { isAncestor8YearFarming: true },
      }),
      R,
    );
    // 조기반환 경로 자체는 살아 있어야 한다 — Step 2에서 사업용 확정.
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.judgmentReason).toContain("무조건 의제");
    expect(r.deemedTransfer).toBeUndefined();
  });

  it("F1-7: [대조군] 같은 농지가 무조건 의제 없이는 deemedTransfer를 싣는다", () => {
    const r = judgeNonBusinessLand(farmland(DEEMED), R);
    expect(r.deemedTransfer).toBeDefined();
  });
});

describe("F-1 회귀 — 기존 축은 그대로", () => {
  it("F1-8: reason none이면 의제일이 있어도 싣지 않는다 (종전 규약)", () => {
    const r = judgeNonBusinessLand(
      farmland({ deemedTransferDate: d("2019-01-01") } as Partial<NonBusinessLandInput>),
      R,
    );
    expect(r.deemedTransfer).toBeUndefined();
  });
});
