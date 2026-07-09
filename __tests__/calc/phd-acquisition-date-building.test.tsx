/**
 * anchor: PHD 3시점 취득 기준시점 = 건물 취득일(§164⑤ 주택 환산·건물 위치지수·신축연도 이후).
 *
 * "토지·건물 취득일 다름"(토지 2013·건물 2014)일 때, 취득 공시지가 연도(위치지수·건물 std valuationYear 구동)가
 * 토지 취득일(2013)이 아니라 건물 취득일(2014)로 자동 추천돼야 한다.
 * 계획서: docs/02-design/features/phd-acquisition-date-building-vs-land.plan.md
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PreHousingDisclosureSection } from "../../components/calc/transfer/PreHousingDisclosureSection";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

describe("PHD 취득 기준시점 — 건물 취득일 기준", () => {
  it("토지≠건물 취득일: 취득 공시지가 연도 = 건물 취득연도(2014), 토지 취득연도(2013) 아님", () => {
    const asset = {
      ...makeDefaultAsset(1),
      acquisitionDate: "2014-09-14", // 건물 취득일(사용승인일)
      landAcquisitionDate: "2013-06-01", // 토지 취득일(별도)
      phdLandPriceYearAtAcq: "", // 자동 추천 사용
      phdLandPriceYearAtAcqIsManual: false,
    };
    render(
      <PreHousingDisclosureSection asset={asset} transferDate="2025-09-01" onChange={() => {}} />,
    );

    // 취득 블록 공시지가 연도 추천값 = 2014(건물). 2013(토지)이 아님.
    // "(자동)" 추천 포맷으로 한정 — 주택가격 조회(StandardPriceInput) 연도 드롭다운의
    // 비선택 <option>(전 연도 나열, 2013 포함)에 오매칭되지 않도록.
    expect(screen.queryByText(/2013년 \(자동\)/)).toBeNull();
    expect(screen.getAllByText(/2014년 \(자동\)/).length).toBeGreaterThan(0);
  });
});
