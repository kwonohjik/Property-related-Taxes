/**
 * NBL2611 A1 — 비사업용 토지 결과 카드 anchor (V5-H 배너 장특 문구 · V10-P 기간 분석 거짓 표시).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { nblExclusionBannerText } from "@/components/calc/results/transfer/nbl-surcharge-exclusion-label";

afterEach(() => cleanup());
const d = (iso: string) => new Date(iso);

function otherLand(transferDate: string): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 500,
    zoneType: "general_residential",
    acquisitionDate: d("2008-01-01"),
    transferDate: d(transferDate),
    otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false },
    businessUsePeriods: [],
    gracePeriods: [],
  };
}

describe("NBL2611-V5-H 비사업용 배너 — 장특 문구는 longTermDeductionExcluded echo로 분기", () => {
  it("2016.1.1. 전 양도: 엔진 echo=true → 「표1 적용」 고정 문구가 나오지 않고 배제를 알린다", () => {
    const j = judgeNonBusinessLand(otherLand("2015-06-01"), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.surcharge.longTermDeductionExcluded).toBe(true);
    const { container } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).not.toContain("장기보유특별공제 표1 적용");
    expect(container.textContent).toContain("장기보유특별공제 배제");
  });

  it("현행 양도: echo=false → 「표1 적용」 (기존 문구 유지)", () => {
    const j = judgeNonBusinessLand(otherLand("2024-06-01"), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(j.surcharge.longTermDeductionExcluded).toBe(false);
    const { container } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).toContain("비사업용 토지 — 기본세율 +10%p 중과 (장기보유특별공제 표1 적용).");
  });

  it("중과배제(위기취득) 배너도 같은 echo로 가른다", () => {
    expect(nblExclusionBannerText("crisis_acquisition", true)).not.toContain("표1 적용");
    expect(nblExclusionBannerText("crisis_acquisition", true)).toContain("장기보유특별공제 배제");
    expect(nblExclusionBannerText("crisis_acquisition", false)).toContain("장기보유특별공제 표1 적용");
    expect(nblExclusionBannerText("crisis_acquisition")).toContain("장기보유특별공제 표1 적용");
  });

  it("NBL2611-V5-G1 — 한 필지 중 일부만 비사업용이면 배제는 비사업용 파트에만 걸리고 그 밖의 파트는 표1 적용을 알린다", () => {
    const partial = nblExclusionBannerText("crisis_acquisition", true, 0.4);
    expect(partial).toContain("비사업용 파트의 장기보유특별공제 배제");
    expect(partial).toContain("그 밖의 파트는 표1 적용");
    // 전량(비율 1)·비율 미지정은 종전 문구
    expect(nblExclusionBannerText("crisis_acquisition", true, 1)).not.toContain("비사업용 파트의");
    expect(nblExclusionBannerText("crisis_acquisition", true)).not.toContain("비사업용 파트의");
  });
});

describe("NBL2611-V10-P 기간 분석 — 판정하지 않은 기간을 사업용 100%로 보이지 않는다", () => {
  it("주택부수토지(배율 판정): 기간 분석 블록 대신 «기간기준 미반영» 고지", () => {
    const j = judgeNonBusinessLand(
      {
        landType: "housing_site",
        landArea: 1000,
        zoneType: "general_residential",
        acquisitionDate: d("2014-01-01"),
        transferDate: d("2024-01-01"),
        housingFootprint: 100,
        businessUsePeriods: [],
        gracePeriods: [],
      },
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(j.effectiveBusinessDays).toBe(j.totalOwnershipDays); // 엔진이 채우는 값(= 100% 표시의 원인)
    const { container, queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).not.toContain("사업용 사용일수");
    expect(container.textContent).not.toContain("사업용 비율");
    expect(queryByTestId("nbl-period-skipped-notice")).not.toBeNull();
  });

  it("기타토지(양도일 상태를 전 기간에 적용): 사업용 100% 표시값을 보이지 않고 사실을 밝힌다 (B2 — 엔진 echo 기반으로 A1 임시 고지를 대체)", () => {
    const j = judgeNonBusinessLand(otherLand("2024-06-01"), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(j.periodEvaluation?.basis).toBe("state_at_transfer");
    const { container, queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).not.toContain("사업용 사용일수");
    expect(queryByTestId("nbl-period-state-at-transfer-notice")).not.toBeNull();
  });

  it("농지(기간기준 판정 지목)는 기간 분석을 그대로 보여 주고 고지를 달지 않는다", () => {
    const j = judgeNonBusinessLand(
      {
        landType: "farmland",
        landArea: 1000,
        zoneType: "agriculture_forest",
        acquisitionDate: d("2015-01-01"),
        transferDate: d("2024-01-01"),
        farmingSelf: true,
        businessUsePeriods: [],
        gracePeriods: [],
      } as NonBusinessLandInput,
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    const { container, queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(container.textContent).toContain("기간 분석");
    expect(queryByTestId("nbl-period-skipped-notice")).toBeNull();
    expect(queryByTestId("nbl-period-state-at-transfer-notice")).toBeNull();
  });
});
