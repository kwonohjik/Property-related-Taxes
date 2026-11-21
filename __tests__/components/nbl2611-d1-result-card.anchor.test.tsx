// @vitest-environment jsdom
/**
 * NBL2611-D1 (R20) — 결과 카드는 엔진 echo로 사실을 밝힌다.
 *   Q-3a (나) 주택부수토지 배율 초과분에 유예를 판정에 쓰면 `graceJudged` 문구가 나오고, 「기간기준은 반영되지 않았습니다」(not_judged) 문구는 나오지 않는다.
 *   Q-4 (나) 당해 사업개시일로 사업 구간을 판정했으면 `businessStartJudged` 문구가 나온다. 쓰지 않았으면 문구가 없다(거짓 금지).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES as R, type NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

afterEach(cleanup);
const d = (s: string) => new Date(`${s}T00:00:00Z`);

const housing = (gracePeriods: NonBusinessLandInput["gracePeriods"]): NonBusinessLandInput => ({
  landType: "housing_site", landArea: 200, zoneType: "general_residential",
  acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
  housingFootprint: 20, isMetropolitanArea: false, businessUsePeriods: [], gracePeriods,
});
const GRACE = [{ reasonCode: "use_prohibited" as const, startDate: d("2014-01-02"), endDate: d("2024-01-01") }];

describe("주택부수토지 — 배율 초과분 유예 판정 echo", () => {
  it("유예로 사업용이 되면 유예 문구(충족)가 나오고 「기간기준 반영되지 않았습니다」는 나오지 않는다", () => {
    const j = judgeNonBusinessLand(housing(GRACE), R);
    expect(j.isNonBusinessLand).toBe(false);
    const { getByTestId, queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(getByTestId("nbl-period-grace-judged-notice").textContent).toContain("충족하여");
    expect(queryByTestId("nbl-period-skipped-notice")).toBeNull();
  });

  it("유예가 모자라 비사업용이 유지되면 「충족하지 않습니다」", () => {
    const j = judgeNonBusinessLand(housing([{ reasonCode: "use_prohibited", startDate: d("2023-01-02"), endDate: d("2024-01-01") }]), R);
    const { getByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(getByTestId("nbl-period-grace-judged-notice").textContent).toContain("충족하지 않습니다");
  });

  it("유예 입력이 없으면 종전 그대로 — 기간기준 미반영 고지", () => {
    const j = judgeNonBusinessLand(housing([]), R);
    const { getByTestId, queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(getByTestId("nbl-period-skipped-notice")).toBeTruthy();
    expect(queryByTestId("nbl-period-grace-judged-notice")).toBeNull();
  });
});

describe("기타토지 수입금액비율 — 당해 사업개시일 판정 echo", () => {
  const other = (start?: Date): NonBusinessLandInput => ({
    landType: "other_land", landArea: 1000, zoneType: "commercial",
    acquisitionDate: d("2014-01-01"), transferDate: d("2024-06-30"),
    otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false },
    revenueTest: { businessType: "parking_operation", currentRevenue: 20_000_000, currentLandValue: 100_000_000, currentBusinessStartDate: start },
    businessUsePeriods: [], gracePeriods: [],
  });

  it("개시일로 판정했으면 개시일·일수·결과 문구가 나온다", () => {
    const j = judgeNonBusinessLand(other(d("2024-03-01")), R);
    expect(j.isNonBusinessLand).toBe(true);
    const { getByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    const t = getByTestId("nbl-period-revenue-start-judged-notice").textContent ?? "";
    expect(t).toContain("2024-03-01");
    expect(t).toContain("121일");
    expect(t).toContain("충족하지 않습니다");
  });

  it("개시일이 없으면 문구가 없다", () => {
    const j = judgeNonBusinessLand(other(), R);
    const { queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(queryByTestId("nbl-period-revenue-start-judged-notice")).toBeNull();
  });
});
