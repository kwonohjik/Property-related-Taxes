/**
 * anchor: §168의9①2호 단서의 「도시지역」은 **보전녹지지역을 제외**한다
 *
 * 발견 E3-04 (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 「소득세법 시행령」 §168조의9①2호 verbatim (KoreanLaw `get_law_text(mst=262425)` 직접 확인 2026-09-02):
 *   「…다만, 「국토의 계획 및 이용에 관한 법률」에 따른 도시지역(**같은 법 시행령 제30조의 규정에
 *    따른 보전녹지지역을 제외한다**. 이하 이 호에서 같다) 안의 임야로서 도시지역으로 편입된 날부터
 *    3년이 경과한 임야를 제외한다.」
 *
 * 종전에는 `ZoneType`·UI 어디에도 보전녹지 구분이 없어 사용자가 고를 수 있는 값이 「녹지지역」뿐이었고,
 * 그런데도 `urban-area.ts`의 주석은 「보전녹지 제외」라고 **구현된 것처럼 단언**했다.
 * 즉 오계산이라기보다 **미구현을 구현으로 적은 주석↔구현 드리프트**였다.
 *
 * 「지방세법 시행령」 §101② 배율표는 녹지지역을 세분하지 않으므로(7배 단일) 배율 축에서는
 * `green`으로 흡수한다.
 */
import { describe, it, expect } from "vitest";
import { judgeForest } from "@/lib/tax-engine/non-business-land/forest";
import { isUrbanForForest, isUrbanForHousing } from "@/lib/tax-engine/non-business-land/urban-area";
import { getZoneAreaMultiplier } from "@/lib/tax-engine/local-tax-zone-multiplier";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);
const RULES = DEFAULT_NON_BUSINESS_LAND_RULES;

/** 산림경영계획 인가 시업중 임야 — 2012 편입 후 3년 경과라 지역기준이 실제로 걸린다 */
function siupForest(zoneType: NonBusinessLandInput["zoneType"]): NonBusinessLandInput {
  return {
    landType: "forest",
    landArea: 5000,
    zoneType,
    acquisitionDate: d("2010-01-01"),
    transferDate: d("2024-01-01"),
    landLocation: { sigunguCode: "11680" },
    forestDetail: { hasForestPlan: true },
    urbanIncorporationDate: d("2012-01-01"),
    businessUsePeriods: [],
    gracePeriods: [],
  };
}

describe("[E3-04] 보전녹지지역 임야", () => {
  it("🔴 보전녹지 시업중 임야 → 지역기준 밖 → 사업용", () => {
    const r = judgeForest(siupForest("conservation_green"), RULES);
    expect(r.isBusiness).toBe(true);
  });

  it("일반 녹지(생산·자연)는 종전대로 도시지역 → 3년 경과로 비사업용 (과소적용 방지)", () => {
    const r = judgeForest(siupForest("green"), RULES);
    expect(r.isBusiness).toBe(false);
  });

  it("leaf — 보전녹지는 임야 도시지역이 아니다", () => {
    expect(isUrbanForForest("conservation_green")).toBe(false);
    expect(isUrbanForForest("green")).toBe(true);
  });

  it("주택부수토지 §168의12에는 보전녹지 세분이 없다 — 녹지로 취급", () => {
    expect(isUrbanForHousing("conservation_green")).toBe(true);
  });

  it("「지방세법 시행령」 §101② 배율표도 세분이 없다 — 녹지 7배로 흡수", () => {
    expect(getZoneAreaMultiplier("conservation_green")?.multiplier).toBe(
      getZoneAreaMultiplier("green")?.multiplier,
    );
  });
});
