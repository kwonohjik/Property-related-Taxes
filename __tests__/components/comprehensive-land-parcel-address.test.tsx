/**
 * LandParcelEditor — 주소 검색 → jibun 설정 + 시군구 자동 채움 RTL.
 *
 * Plan: docs/00-pm/comprehensive-land-parcel-address-search.plan.md §B·6
 * AddressSearch는 vi.mock 스텁(클릭 시 onChange 발화) — Vworld 외부 API 비의존.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// AddressSearch 모듈 mock — 선택 시 송파구 주소로 onChange 발화하는 버튼
vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: ({ onChange }: { onChange: (v: { road: string; jibun: string; building: string; detail: string; lng: string; lat: string }) => void }) => (
    <button
      type="button"
      data-testid="mock-address-pick"
      onClick={() =>
        // Vworld 실제 포맷: road=전체 도로명(시도·시군구), jibun=짧은 지번(시군구 없음)
        onChange({ road: "서울특별시 송파구 가락로 100", jibun: "석촌동 276-1", building: "", detail: "", lng: "", lat: "" })
      }
    >
      주소 선택(mock)
    </button>
  ),
}));

import { LandParcelEditor } from "../../components/calc/comprehensive/LandParcelEditor";
import type { LandParcelForm } from "../../lib/stores/comprehensive-wizard-store";

afterEach(cleanup);

function parcel(over: Partial<LandParcelForm> = {}): LandParcelForm {
  return {
    id: "p1",
    jurisdiction: "",
    name: "",
    jibun: "",
    area: "",
    shareRatio: "100",
    officialPricePerSqm: "",
    priorOfficialPricePerSqm: "",
    ...over,
  };
}

describe("LandParcelEditor 주소 검색", () => {
  const baseProps = {
    parcel: parcel(),
    kind: "aggregate" as const,
    refDate: "2022-06-01",
    priorYear: "2021",
    priorMode: "none" as const,
  };

  it("소재지 주소 검색 블록 렌더", () => {
    render(<LandParcelEditor {...baseProps} onUpdate={() => {}} />);
    expect(screen.getByTestId("land-aggregate-parcel-address")).toBeInTheDocument();
  });

  it("주소 선택 → jibun은 짧은 지번 저장, 시군구는 도로명에서 '송파구' 추출", () => {
    const onUpdate = vi.fn();
    render(<LandParcelEditor {...baseProps} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId("mock-address-pick"));
    expect(onUpdate).toHaveBeenCalledWith({
      jibun: "석촌동 276-1",
      jurisdiction: "송파구",
    });
  });
});
