/**
 * anchor: 겸용 PHD 3시점 일괄 계산 버튼 — Case B는 "주택 전용" 라벨.
 *
 * 겸용 상가(취득·양도)는 전용 ③ 상가 기준시가 섹션이 전담하므로, PHD 주택분 버튼은
 * Case B(용도변경 없음)에서 주택 전용이어야 한다("3시점 건물기준시가 일괄 계산").
 * Case A(splitMode·4부분 분리)는 상단 단일 버튼 대신 주택/상가 섹션 헤더 런처 2개(D1) —
 * 둘 다 동일 결합 모달(주택+상가 6값)을 연다.
 *
 * 계획서: docs/02-design/features/mixed-use-phd-commercial-gating-fix.plan.md (v2)
 *        docs/02-design/features/mixed-use-case-a-per-section-stdprice-calculator.plan.md (D1)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MixedUsePreHousingDisclosureSection } from "../../components/calc/transfer/mixed-use/MixedUsePreHousingDisclosureSection";
import { PreHousingDisclosureSection } from "../../components/calc/transfer/PreHousingDisclosureSection";
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

  it("Case A(용도변경, 최초공시일<용도변경일): 상단 단일 버튼 대신 주택/상가 섹션 런처 2개 (D1)", () => {
    const asset = {
      ...mixedBase(),
      hasPartialUsageChange: true,
      partialChangeDirection: "house_to_commercial" as const,
      partialChangeDate: "2010-06-01", // 최초공시(2006) < 용도변경(2010) → Case A
    };
    render(
      <MixedUsePreHousingDisclosureSection asset={asset} transferDate="2025-09-01" onChange={() => {}} />,
    );
    // 상단 단일 버튼(구 라벨 2종) 미노출 — asset-major 게이트
    expect(screen.queryByText(HOUSING_COMMERCIAL)).toBeNull();
    expect(screen.queryByText(HOUSING_ONLY)).toBeNull();
    // 주택/상가 섹션 헤더 런처 2개 — 둘 다 결합 모달 진입점
    expect(screen.getByTestId("phd-housing-stdprice-calc")).toBeTruthy();
    expect(screen.getByTestId("phd-commercial-stdprice-calc")).toBeTruthy();
    // 주택 런처 클릭 → 결합 모달(주택+상가 6값) 열림
    fireEvent.click(screen.getByTestId("phd-housing-stdprice-calc"));
    expect(screen.getByText("3시점 건물 기준시가 일괄 계산")).toBeTruthy();
  });

  it("Case A: 상가 런처도 동일 결합 모달을 연다 (D1)", () => {
    const asset = {
      ...mixedBase(),
      hasPartialUsageChange: true,
      partialChangeDirection: "house_to_commercial" as const,
      partialChangeDate: "2010-06-01",
    };
    render(
      <MixedUsePreHousingDisclosureSection asset={asset} transferDate="2025-09-01" onChange={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("phd-commercial-stdprice-calc"));
    expect(screen.getByText("3시점 건물 기준시가 일괄 계산")).toBeTruthy();
  });
});

describe("비겸용 PHD — 상단 단일 버튼 유지 (asset-major 게이트 회귀 가드)", () => {
  it("PreHousingDisclosureSection(layout 미전달): 상단 버튼 노출·섹션 런처 미노출", () => {
    const asset = {
      ...makeDefaultAsset(1),
      usePreHousingDisclosure: true,
      acquisitionDate: "2003-05-10",
      phdFirstDisclosureDate: "2006-01-01",
    };
    render(<PreHousingDisclosureSection asset={asset} transferDate="2025-09-01" onChange={() => {}} />);
    expect(screen.getByText(HOUSING_ONLY)).toBeTruthy();
    expect(screen.queryByTestId("phd-housing-stdprice-calc")).toBeNull();
    expect(screen.queryByTestId("phd-commercial-stdprice-calc")).toBeNull();
  });
});
