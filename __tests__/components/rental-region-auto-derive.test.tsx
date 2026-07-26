/**
 * @vitest-environment jsdom
 *
 * RentalUnitCard — 소재 지역 주소 자동판별 RTL.
 * 계획서: docs/02-design/features/transfer-rental-region-auto-derive.plan.md §7-2
 *
 * AddressSearch는 vi.mock 스텁(pnu 동반 onChange). 시나리오는 가목(showRegion·showAddress=true).
 *  R-1: 주소 미검색(regionCode="") → 수동 라디오 노출, 배지 없음
 *  R-2: 서울 주소 선택(pnu 11…) → "수도권 · 주소 자동판별" 배지, 라디오 사라짐
 *  R-3: 부산 주소 선택(pnu 26…) → "비수도권 · 주소 자동판별" 배지
 *  R-4: "직접 지정" 클릭 → regionCode 리셋 → 수동 라디오 복귀
 *  R-5: 주소 clear(jibun:""·pnu:"") → 자동배지 사멸 → 라디오 복귀(stale 방지)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";

// AddressSearch mock — 서울/부산/clear 3버튼(pnu 동반)
vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: ({ onChange }: { onChange: (v: Record<string, string>) => void }) => (
    <>
      <button
        type="button"
        data-testid="pick-seoul"
        onClick={() =>
          onChange({ road: "", jibun: "서울 강남구 역삼동 1", building: "", detail: "", lng: "", lat: "", pnu: "1168010100" })
        }
      >
        seoul
      </button>
      <button
        type="button"
        data-testid="pick-busan"
        onClick={() =>
          onChange({ road: "", jibun: "부산 해운대구 우동 1", building: "", detail: "", lng: "", lat: "", pnu: "2635010100" })
        }
      >
        busan
      </button>
      <button
        type="button"
        data-testid="pick-clear"
        onClick={() => onChange({ road: "", jibun: "", building: "", detail: "", lng: "", lat: "", pnu: "" })}
      >
        clear
      </button>
    </>
  ),
}));

import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

type RentalUnit = AssetForm["rentalHousingException"]["rentalUnits"][number];

// 가목(purchase·장기·등록 2020.7.11 이전) → showRegion·showAddress=true
// (factory 기본 rentalCategory=long_general·rentalAcquisitionType=purchase 사용, 등록일만 override)
function makeGaUnit(): RentalUnit {
  return {
    ...makeDefaultRentalUnit(),
    businessRegistrationDate: "2015-01-01",
    rentalRegistrationDate: "2015-01-01",
  };
}

function Harness({ initial }: { initial: RentalUnit }) {
  const [unit, setUnit] = useState<RentalUnit>(initial);
  return (
    <RentalUnitCard unit={unit} index={0} onChange={setUnit} onRemove={() => {}} canRemove={false} />
  );
}

describe("RentalUnitCard 소재 지역 주소 자동판별", () => {
  it("R-1: 주소 미검색 → 수동 라디오 노출, 배지 없음", () => {
    render(<Harness initial={makeGaUnit()} />);
    expect(screen.queryByTestId("rental-region-badge-0")).toBeNull();
    expect(document.querySelector('input[name="rental-region-0"]')).not.toBeNull();
  });

  it("R-2: 서울 주소 선택 → 수도권 자동판별 배지, 라디오 사라짐", () => {
    render(<Harness initial={makeGaUnit()} />);
    fireEvent.click(screen.getByTestId("pick-seoul"));
    const badge = screen.getByTestId("rental-region-badge-0");
    expect(badge.textContent).toContain("수도권");
    expect(badge.textContent).toContain("자동판별");
    expect(document.querySelector('input[name="rental-region-0"]')).toBeNull();
  });

  it("R-3: 부산 주소 선택 → 비수도권 자동판별 배지", () => {
    render(<Harness initial={makeGaUnit()} />);
    fireEvent.click(screen.getByTestId("pick-busan"));
    expect(screen.getByTestId("rental-region-badge-0").textContent).toContain("비수도권");
  });

  it("R-4: '직접 지정' 클릭 → 수동 라디오 복귀", () => {
    render(<Harness initial={makeGaUnit()} />);
    fireEvent.click(screen.getByTestId("pick-seoul"));
    expect(screen.getByTestId("rental-region-badge-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("rental-region-manual-0"));
    expect(screen.queryByTestId("rental-region-badge-0")).toBeNull();
    expect(document.querySelector('input[name="rental-region-0"]')).not.toBeNull();
  });

  it("R-5: 주소 clear → 자동배지 사멸 → 라디오 복귀(stale 방지)", () => {
    render(<Harness initial={makeGaUnit()} />);
    fireEvent.click(screen.getByTestId("pick-seoul"));
    expect(screen.getByTestId("rental-region-badge-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("pick-clear"));
    expect(screen.queryByTestId("rental-region-badge-0")).toBeNull();
    expect(document.querySelector('input[name="rental-region-0"]')).not.toBeNull();
  });
});
