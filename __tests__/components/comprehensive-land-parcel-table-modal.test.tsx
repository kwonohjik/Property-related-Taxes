/**
 * LandParcelTableView · LandParcelEditor — 토지 필지 테이블+모달 전환 RTL.
 *
 * Plan: docs/00-pm/comprehensive-land-parcel-table-modal.plan.md §7
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { LandParcelTableView } from "../../components/calc/comprehensive/LandParcelTableView";
import { LandParcelEditor } from "../../components/calc/comprehensive/LandParcelEditor";
import type { LandParcelForm } from "../../lib/stores/comprehensive-wizard-store";

afterEach(cleanup);

function parcel(over: Partial<LandParcelForm> = {}): LandParcelForm {
  return {
    id: "p1",
    jurisdiction: "서초구",
    name: "서초-1",
    jibun: "",
    area: "200",
    shareRatio: "50",
    officialPricePerSqm: "4300000",
    priorOfficialPricePerSqm: "",
    ...over,
  };
}

describe("LandParcelTableView", () => {
  it("필지 행에 시군구·면적·지분·공시지가 렌더", () => {
    render(
      <LandParcelTableView parcels={[parcel()]} kind="aggregate" selectedParcelId={null} onSelect={() => {}} />,
    );
    const row = screen.getByTestId("land-aggregate-parcel-row-p1");
    expect(within(row).getByText("필지 1")).toBeInTheDocument();
    expect(within(row).getByText("서초구")).toBeInTheDocument();
    expect(within(row).getByText("200㎡")).toBeInTheDocument();
    expect(within(row).getByText("50%")).toBeInTheDocument();
    expect(within(row).getByText("4,300,000")).toBeInTheDocument();
  });

  it("행 클릭 → onSelect(id)", () => {
    const onSelect = vi.fn();
    render(
      <LandParcelTableView parcels={[parcel()]} kind="aggregate" selectedParcelId={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("land-aggregate-parcel-row-p1"));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("0필지 → null (렌더 없음)", () => {
    const { container } = render(
      <LandParcelTableView parcels={[]} kind="aggregate" selectedParcelId={null} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("LandParcelEditor", () => {
  const baseProps = {
    parcel: parcel(),
    kind: "aggregate" as const,
    refDate: "2022-06-01",
    priorYear: "2021",
    onUpdate: () => {},
  };

  it("시군구 입력 → onUpdate({ jurisdiction })", () => {
    const onUpdate = vi.fn();
    render(<LandParcelEditor {...baseProps} priorMode="none" onUpdate={onUpdate} />);
    fireEvent.change(screen.getByTestId("land-aggregate-parcel-jurisdiction"), {
      target: { value: "강남구" },
    });
    expect(onUpdate).toHaveBeenCalledWith({ jurisdiction: "강남구" });
  });

  it("priorMode='none' → 직전 공시지가 필드 미노출", () => {
    render(<LandParcelEditor {...baseProps} priorMode="none" />);
    expect(screen.queryByTestId("land-aggregate-parcel-prior-price")).toBeNull();
  });

  it("priorMode='auto' → 직전 공시지가 필드 노출", () => {
    render(<LandParcelEditor {...baseProps} priorMode="auto" />);
    expect(screen.getByTestId("land-aggregate-parcel-prior-price")).toBeInTheDocument();
  });
});
