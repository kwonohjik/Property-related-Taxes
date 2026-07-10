/**
 * BuildingStdPriceForm — 공시지가 추천연도가 실제 이벤트 일자(공시일 5.31 기준)를 반영 (anchor).
 *
 * 버그: 양도/취득/평가 공시지가 필드가 referenceDate를 landRefDate(연도)="YYYY-06-01"로 합성해
 * 실제 일자(양도일 등)를 무시 → 공시일(5.31) 전 양도인데도 해당연도 공시지가를 추천했다.
 *
 * 정정: 완성형 이벤트 일자를 referenceDate로 사용(landRefFromEvent) → 공시일 이하는 전년도 추천.
 * 근거: feedback_standard_price_year_164_3_prior · lib/utils/land-price-year.ts.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { BuildingStdPriceForm } from "@/components/calc/building-std-price/BuildingStdPriceForm";

describe("BuildingStdPriceForm — 공시지가 추천연도(공시일 5.31 기준)", () => {
  it("양도일 2026-02-25(공시일 전): 양도 공시지가 연도 자동 = 2025(전년도)", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        onResult={() => {}}
        initialForm={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionYear: "1997", // 취득은 2001 고정(구별 위해)
          transferYear: "2026",
          eventDate: "2026-02-25", // 공시일(5.31) 전 → 전년도
        }}
      />,
    );
    // 양도 공시지가 연도 자동 추천 = 2025
    expect(screen.getByText("2025년 (자동)")).toBeTruthy();
    // 2026 자동 추천은 없어야 함(버그 시 2026)
    expect(screen.queryByText("2026년 (자동)")).toBeNull();
  });

  it("양도일 미입력 + 양도연도 2026: 연도만으로 fallback → 2026(자동)", () => {
    render(
      <BuildingStdPriceForm
        lockedTaxType="transfer"
        onResult={() => {}}
        initialForm={{
          floorArea: "283.06",
          landAreaM2: "78.01",
          acquisitionYear: "1997",
          transferYear: "2026",
          // eventDate 미입력 → landRefDate("2026")="2026-06-01" → 2026
        }}
      />,
    );
    expect(screen.getByText("2026년 (자동)")).toBeTruthy();
    expect(screen.queryByText("2025년 (자동)")).toBeNull();
  });
});
