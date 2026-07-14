/**
 * anchor: 겸용 PHD 3시점 일괄 계산 버튼 — Case B는 "주택 전용" 라벨.
 *
 * 겸용 상가(취득·양도)는 전용 ③ 상가 기준시가 섹션이 전담하므로, PHD 주택분 버튼은
 * Case B(용도변경 없음)에서 주택 전용이어야 한다("3시점 건물기준시가 일괄 계산").
 * Case A(splitMode·4부분 분리)만 "주택·상가" 유지.
 *
 * 계획서: docs/02-design/features/mixed-use-phd-commercial-gating-fix.plan.md (v2)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MixedUsePreHousingDisclosureSection } from "../../components/calc/transfer/mixed-use/MixedUsePreHousingDisclosureSection";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

const mixedBase = () => ({
  ...makeDefaultAsset(1),
  isMixedUseHouse: true as const,
  usePreHousingDisclosure: true,
  acquisitionDate: "2003-05-10",
  residentialFloorArea: "80",
  nonResidentialFloorArea: "40", // 유효 겸용 — 상가 면적 > 0
  mixedUseTotalLandArea: "100",
  phdFirstDisclosureDate: "2006-01-01",
});

const HOUSING_ONLY = "3시점 건물기준시가 일괄 계산";
const HOUSING_COMMERCIAL = "3시점 주택·상가 건물기준시가 일괄 계산";

describe("겸용 PHD 3시점 버튼 — Case B 주택 전용", () => {
  it("Case B(용도변경 없음): 버튼 라벨 = 주택 전용 ('주택·상가' 아님)", () => {
    const asset = {
      ...mixedBase(),
      hasPartialUsageChange: false, // splitMode=false → Case B
    };
    render(
      <MixedUsePreHousingDisclosureSection asset={asset} transferDate="2025-09-01" onChange={() => {}} />,
    );
    expect(screen.getByText(HOUSING_ONLY)).toBeTruthy();
    expect(screen.queryByText(HOUSING_COMMERCIAL)).toBeNull();
  });

  it("Case A(용도변경, 최초공시일<용도변경일): '주택·상가' 유지 (회귀 가드)", () => {
    const asset = {
      ...mixedBase(),
      hasPartialUsageChange: true,
      partialChangeDirection: "house_to_commercial" as const,
      partialChangeDate: "2010-06-01", // 최초공시(2006) < 용도변경(2010) → Case A
    };
    render(
      <MixedUsePreHousingDisclosureSection asset={asset} transferDate="2025-09-01" onChange={() => {}} />,
    );
    expect(screen.getByText(HOUSING_COMMERCIAL)).toBeTruthy();
    expect(screen.queryByText(HOUSING_ONLY)).toBeNull();
  });
});
