/**
 * ResidenceCheckPreviewCard UI anchor (UI-E2)
 *
 * 법령: 시행령 §16②1호나 + 옵션 A 정책 (`1e915f1`)
 * 계획서: docs/00-pm/inheritance-farming-ui-integration.plan.md §4-3·§4-5
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ResidenceCheckPreviewCard } from "@/components/calc/inheritance/ResidenceCheckPreviewCard";
import { FarmingEligibilitySection } from "@/components/calc/inheritance/FarmingEligibilitySection";
import type { FarmingResidenceCheckResult } from "@/lib/calc/farming-residence-check";

afterEach(() => cleanup());

function makeResult(over: Partial<FarmingResidenceCheckResult> = {}): FarmingResidenceCheckResult {
  return {
    decedentMet: false,
    heirMet: false,
    decedentAutoMet: null,
    heirAutoMet: null,
    decedentMatchKind: null,
    heirMatchKind: null,
    decedentMinDistanceKm: null,
    heirMinDistanceKm: null,
    ...over,
  };
}

describe("[E2] ResidenceCheckPreviewCard — 옵션 A 모순 안내", () => {
  it("E2-1: personal 모드 → 거주지 좌표 입력 영역 노출 + AddressSearch", () => {
    render(
      <FarmingEligibilitySection
        farming={{
          type: "personal",
          decedentEightYearFarming: false,
          decedentResidenceMet: false,
          heirIsAdult: false,
          heirTwoYearFarming: false,
          heirResidenceMet: false,
        }}
        estateItems={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/거주지 좌표 자동 검증/)).not.toBeNull();
    // A 작업 — Vworld 주소 검색 라벨 노출 (피상속인·상속인 2건 라벨 + AddressSearch 내부)
    expect(screen.queryAllByText(/Vworld 주소 검색/).length).toBeGreaterThanOrEqual(2);
    // "피상속인 거주지" / "상속인 거주지" 라벨 노출 (queryAllByText — 자격 미충족 미리보기와 multi-match 가능)
    expect(screen.queryAllByText(/피상속인 거주지/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/상속인 거주지/).length).toBeGreaterThan(0);
  });

  it("E2-2: corporate 모드 → 거주지 좌표 입력 영역 미렌더", () => {
    render(
      <FarmingEligibilitySection
        farming={{
          type: "corporate",
          decedentEightYearFarming: false,
          decedentResidenceMet: false,
          decedentCorporateMet: false,
          heirIsAdult: false,
          heirTwoYearFarming: false,
          heirResidenceMet: false,
          heirCorporateOfficer: false,
        }}
        estateItems={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/거주지 좌표 자동 검증/)).toBeNull();
  });

  it("E2-3: autoMet 양쪽 true → emerald 카드 (30km 이내)", () => {
    render(
      <ResidenceCheckPreviewCard
        result={makeResult({
          decedentAutoMet: true,
          heirAutoMet: true,
          decedentMinDistanceKm: 5.0,
          heirMinDistanceKm: 10.0,
        })}
      />,
    );
    expect(screen.queryByText(/자동 검증 \(Haversine 30km\)/)).not.toBeNull();
    // "30km 이내" 양쪽 노출
    expect(screen.queryAllByText(/30km 이내/).length).toBeGreaterThanOrEqual(2);
  });

  it("E2-4: 한쪽 autoMet=false → amber 카드", () => {
    render(
      <ResidenceCheckPreviewCard
        result={makeResult({
          decedentAutoMet: true,
          heirAutoMet: false,
          decedentMinDistanceKm: 5.0,
          heirMinDistanceKm: 50.0,
        })}
      />,
    );
    expect(screen.queryByText(/30km 초과/)).not.toBeNull();
  });

  it("E2-5: 양쪽 autoMet=false → rose 카드", () => {
    const { container } = render(
      <ResidenceCheckPreviewCard
        result={makeResult({
          decedentAutoMet: false,
          heirAutoMet: false,
          decedentMinDistanceKm: 100.0,
          heirMinDistanceKm: 200.0,
        })}
      />,
    );
    // rose tone class 검증
    expect(container.querySelector(".bg-rose-50")).not.toBeNull();
  });

  it("E2-6: autoMet 양쪽 null → gray 보류 안내", () => {
    render(<ResidenceCheckPreviewCard result={makeResult()} />);
    expect(screen.queryByText(/좌표 또는 자산 위치 미입력/)).not.toBeNull();
  });

  it("E2-7 (옵션 A): met=true + autoMet=false → 노란 경고 '명시 통과 / 자동 초과'", () => {
    render(
      <ResidenceCheckPreviewCard
        result={makeResult({
          decedentMet: true,
          decedentAutoMet: false,
          decedentMinDistanceKm: 50.0,
          heirAutoMet: null,
        })}
      />,
    );
    expect(
      screen.queryByText(/사용자 명시 통과 \/ 자동 30km 초과/),
    ).not.toBeNull();
  });

  it("E2-8 (옵션 A): met=false + autoMet=true → 파란 안내 '자동 30km 이내'", () => {
    render(
      <ResidenceCheckPreviewCard
        result={makeResult({
          decedentMet: false,
          decedentAutoMet: true,
          decedentMinDistanceKm: 5.0,
          heirAutoMet: null,
        })}
      />,
    );
    expect(
      screen.queryByText(/자동 30km 이내 통과 가능성/),
    ).not.toBeNull();
  });
});
