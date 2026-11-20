// @vitest-environment jsdom
/**
 * NBL2611-B3 (V2-C1) — 유예기간을 판정에 쓴 기타토지는 결과 카드가 그 사실을 엔진 echo(`periodEvaluation.graceJudged`)로 밝힌다.
 * 유예 입력이 없으면 문구가 없다(거짓 금지).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES, type NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

afterEach(cleanup);
const d = (s: string) => new Date(`${s}T00:00:00Z`);

const bare = (gracePeriods: NonBusinessLandInput["gracePeriods"]): NonBusinessLandInput => ({
  landType: "other_land", landArea: 1000, zoneType: "commercial",
  acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
  otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false },
  businessUsePeriods: [], gracePeriods,
});

describe("기간 분석 — 기타토지 유예 판정 echo", () => {
  it("유예로 사업용이 되면 일수와 「충족」을 밝힌다", () => {
    const j = judgeNonBusinessLand(bare([{ reasonCode: "use_prohibited", startDate: d("2014-01-02"), endDate: d("2024-01-01") }]), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(j.isNonBusinessLand).toBe(false);
    const { getByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    const t = getByTestId("nbl-period-grace-judged-notice").textContent ?? "";
    expect(t).toContain(`${j.gracePeriodDays.toLocaleString()}일`);
    expect(t).toContain("충족하여");
  });

  it("유예가 모자라 비사업용이 유지되면 「충족하지 않습니다」", () => {
    const j = judgeNonBusinessLand(bare([{ reasonCode: "use_prohibited", startDate: d("2023-01-02"), endDate: d("2024-01-01") }]), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(j.isNonBusinessLand).toBe(true);
    const { getByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(getByTestId("nbl-period-grace-judged-notice").textContent).toContain("충족하지 않습니다");
  });

  it("유예 입력이 없으면 문구가 없다", () => {
    const j = judgeNonBusinessLand(bare([]), DEFAULT_NON_BUSINESS_LAND_RULES);
    const { queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(queryByTestId("nbl-period-grace-judged-notice")).toBeNull();
  });
});
