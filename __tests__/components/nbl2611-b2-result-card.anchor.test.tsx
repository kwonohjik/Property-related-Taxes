// @vitest-environment jsdom
/**
 * NBL2611-B2 (R06) — 결과 카드는 고정 문구가 아니라 엔진 echo에서 파생한다.
 *   V10-P  「기간 분석」은 `periodEvaluation`, 면적 안분 근거는 `areaProportioning.legalBasis`
 *   V10-K  판정 사유·단계에 enum 원문이 보이지 않는다
 *   V4-R · V8-VL04 · V2-C2  고지가 주의사항에 나온다
 * echo가 없는 이력 복원 결과(옛 저장분)는 단계 id 추정으로 종전과 같게 보인다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES, type NonBusinessLandInput, type NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { NBL } from "@/lib/tax-engine/legal-codes";
import { NBL_VILLA_LAND_SCOPE_NOTICE, NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { resolvePeriodEvaluation } from "@/lib/tax-engine/non-business-land/period-evaluation";

afterEach(cleanup);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);

const housing = (over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput => ({
  landType: "housing_site", landArea: 1000, zoneType: "general_residential",
  acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
  housingFootprint: 100, isMetropolitanArea: false, businessUsePeriods: [], gracePeriods: [], ...over,
});

const separateOther = (): NonBusinessLandInput => ({
  landType: "other_land", landArea: 300, zoneType: "general_residential",
  acquisitionDate: d("2008-01-01"), transferDate: d("2024-06-01"),
  otherLand: { propertyTaxType: "separate", hasBuilding: true, buildingFloorArea: 100, buildingStandardValue: 50_000_000, landStandardValue: 100_000_000, isRelatedToResidenceOrBusiness: false },
  businessUsePeriods: [], gracePeriods: [],
});

describe("V10-P — 기간 분석은 echo로 분기한다", () => {
  it("주택부수토지(not_judged): 일수·비율을 보이지 않고 영 §168의12 배율 판정임을 밝힌다", () => {
    const j = judgeNonBusinessLand(housing(), R);
    const { container, getByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).not.toContain("사업용 사용일수");
    const n = getByTestId("nbl-period-skipped-notice").textContent ?? "";
    expect(n).toContain(NBL.CRITERIA);
    expect(n).toContain(NBL.HOUSING_MULTIPLIER);
  });

  it("별도합산 기타토지(사업용)도 «사업용 비율 100%»를 보이지 않는다 — 전 기간 일괄 적용 사실만", () => {
    const j = judgeNonBusinessLand(separateOther(), R);
    expect(j.isNonBusinessLand).toBe(false);
    const { container, queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).not.toContain("사업용 비율");
    expect(queryByTestId("nbl-period-state-at-transfer-notice")).not.toBeNull();
  });

  it("별장 농어촌주택 경로(전 기간 일괄): 일수·비율 숨김 + 별장 부속토지 범위 고지가 주의사항에 있다 (V8-VL04)", () => {
    const j = judgeNonBusinessLand(
      {
        landType: "villa_land", landArea: 500, zoneType: "agriculture_forest",
        acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
        villa: { villaUsePeriods: [{ startDate: d("2014-01-02"), endDate: d("2024-01-01"), usageType: "별장" }], isEupMyeon: true, isRuralHousing: true, buildingFloorArea: 140, attachedLandArea: 600, combinedStdValue: 180_000_000, isInRestrictedArea: false },
        businessUsePeriods: [], gracePeriods: [],
      },
      R,
    );
    const { container } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).not.toContain("사업용 비율");
    expect(container.textContent).toContain(NBL_VILLA_LAND_SCOPE_NOTICE);
    expect(container.textContent).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  });

  it("농지(usage_periods)는 기간 분석 표를 그대로 보인다", () => {
    const j = judgeNonBusinessLand(
      { landType: "farmland", landArea: 1000, zoneType: "agriculture_forest", acquisitionDate: d("2015-01-01"), transferDate: d("2024-01-01"), farmingSelf: true, businessUsePeriods: [], gracePeriods: [] } as NonBusinessLandInput,
      R,
    );
    const { container } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).toContain("기간 분석");
    expect(container.textContent).toContain("사업용 사용일수");
  });
});

describe("V10-P — 면적 안분 근거는 echo", () => {
  it("주택부수토지 초과분: 근거에 영 §168의12가 나온다 (종전 고정 문구에는 없었다)", () => {
    const j = judgeNonBusinessLand(housing(), R);
    const { container } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).toContain(`면적 안분 근거: ${NBL.HOUSING_MULTIPLIER}`);
  });

  it("건물 부수토지 배율 초과(기타토지): 근거에 「지방세법 시행령」 §101①2호 본문이 나온다", () => {
    const o = separateOther();
    o.landArea = 1000;
    const j = judgeNonBusinessLand(o, R);
    const { container } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).toContain(`면적 안분 근거: ${NBL.BUILDING_SITE_MULTIPLIER}`);
  });

  it("legalBasis echo가 없는 이력 복원 결과는 일반 안내로 대체한다", () => {
    const j = judgeNonBusinessLand(housing(), R);
    const legacy: NonBusinessLandJudgment = { ...j, areaProportioning: { ...j.areaProportioning!, legalBasis: undefined } };
    const { container } = render(<NonBusinessLandResultCard judgment={legacy} />);
    expect(container.textContent).not.toContain("면적 안분 근거:");
    expect(container.textContent).toContain("기준면적 초과분");
  });
});

describe("V10-K — 사유·단계에 enum 원문이 없다", () => {
  it("별도합산 기타토지 결과 카드 전체에 separate·special_sum·comprehensive가 보이지 않는다", () => {
    const { container } = render(<NonBusinessLandResultCard judgment={judgeNonBusinessLand(separateOther(), R)} />);
    expect(container.textContent).not.toMatch(/\b(separate|special_sum|comprehensive)\b/);
    expect(container.textContent).toContain(NBL.OTHER_LAND_PROPERTY_TAX_EXCLUSION);
  });
});

describe("이력 복원(echo 없음) — 단계 id 추정이 종전과 같다", () => {
  it.each([
    ["housing", housing(), "not_judged"],
    ["other_land", separateOther(), "state_at_transfer"],
  ] as const)("%s", (_n, input, basis) => {
    const j = judgeNonBusinessLand(input, R);
    const { periodEvaluation: _drop, ...legacy } = j;
    void _drop;
    expect(resolvePeriodEvaluation(legacy).basis).toBe(basis);
    const { container } = render(<NonBusinessLandResultCard judgment={legacy as NonBusinessLandJudgment} />);
    expect(container.textContent).not.toContain("사업용 사용일수");
  });
});
