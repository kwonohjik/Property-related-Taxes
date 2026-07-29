/**
 * anchor: PHD 3시점 **취득 부수토지 개별공시지가** 추천 연도 = 토지 취득일(§166⑥).
 *
 * 2026-07-11 정정(B안): 이 필드는 부수토지 기준시가(= 공시지가 × 면적, land value)용이므로
 * 토지 취득일 기준이어야 한다. 건물 위치지수용 공시지가가 아니다(그건 건물 std 모달에서 별도).
 * §164⑤(2001.1.1 이전 건물 std 환산)는 이 필드와 무관.
 *
 * 이전(2026-07-07)에는 건물 취득일로 통일했으나, 부수토지 공시지가를 건물 신축시점으로 구하는 것은
 * 오류라는 사용자 판단으로 토지 취득일로 재정정. 건물 std/batch/신축연도는 여전히 건물 취득일(별도).
 * 계획서: docs/02-design/features/phd-acquisition-date-building-vs-land.plan.md
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PreHousingDisclosureSection } from "../../components/calc/transfer/PreHousingDisclosureSection";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

describe("PHD 취득 부수토지 공시지가 — 토지 취득일 기준", () => {
  it("토지≠건물 취득일: 취득 부수토지 공시지가 연도 = 토지 취득연도(2013), 건물 취득연도(2014) 아님", () => {
    const asset = {
      ...makeDefaultAsset(1),
      acquisitionDate: "2014-09-14", // 건물 취득일(사용승인일) — 건물 std/batch용
      landAcquisitionDate: "2013-06-01", // 토지 취득일(별도) — 부수토지 공시지가용
      phdLandPriceYearAtAcq: "", // 자동 추천 사용
      phdLandPriceYearAtAcqIsManual: false,
    };
    render(
      <PreHousingDisclosureSection asset={asset} transferDate="2025-09-01" onChange={() => {}} />,
    );

    // 취득 부수토지 공시지가 연도 추천 = 2013(토지). 건물 취득연도(2014) 아님.
    // "(자동)" 추천 포맷으로 한정 — 주택가격 조회(StandardPriceInput) 연도 드롭다운의
    // 비선택 <option>(전 연도 나열)에 오매칭되지 않도록.
    expect(screen.getAllByText(/2013년 \(자동\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2014년 \(자동\)/)).toBeNull();
  });

  it("토지·건물 취득일 동일(토글 OFF): landAcquisitionDate 미설정 → 건물 취득일 fallback", () => {
    const asset = {
      ...makeDefaultAsset(1),
      acquisitionDate: "2014-09-14",
      landAcquisitionDate: "", // 토지·건물 취득일 동일 → fallback
      phdLandPriceYearAtAcq: "",
      phdLandPriceYearAtAcqIsManual: false,
    };
    render(
      <PreHousingDisclosureSection asset={asset} transferDate="2025-09-01" onChange={() => {}} />,
    );
    // fallback = acquisitionDate(2014) → 2014 추천
    expect(screen.getAllByText(/2014년 \(자동\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2013년 \(자동\)/)).toBeNull();
  });
});
