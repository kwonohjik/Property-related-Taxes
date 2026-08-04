/**
 * anchor: MultiPointBuildingStdPriceModal — 주택 연면적 자동채움(housingFloorAreaPrefill).
 *
 * 겸용주택 주택분 3시점 일괄 계산 모달을 열 때, 상위 화면에서 입력한 주택 전용면적이
 * 첫 부분(주택) 연면적에 자동으로 채워져야 한다(handleOpen 시드). 미주입 시 빈 값(종전).
 *
 * 계획서: docs/02-design/features/mixed-use-phd-commercial-gating-fix.plan.md
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MultiPointBuildingStdPriceModal } from "../../components/calc/building-std-price/MultiPointBuildingStdPriceModal";

afterEach(cleanup);

const points = [
  { key: "acquisition" as const, label: "취득시", year: 2003, landPricePerM2: "" },
  { key: "firstDisclosure" as const, label: "최초공시일", year: 2006, landPricePerM2: "" },
  { key: "transfer" as const, label: "양도시", year: 2025, landPricePerM2: "" },
];

describe("MultiPointBuildingStdPriceModal — 주택 연면적 자동채움", () => {
  it("housingFloorAreaPrefill 주입 시 모달 열면 첫 부분 연면적에 자동 채움", () => {
    render(
      <MultiPointBuildingStdPriceModal points={points} onApply={() => {}} housingFloorAreaPrefill="80.5" />,
    );
    // 모달 열기 (런처 버튼)
    fireEvent.click(screen.getByText("3시점 건물기준시가 일괄 계산"));
    // 연면적 필드에 80.5 자동 채움
    expect(screen.getByDisplayValue("80.5")).toBeTruthy();
  });

  it("겸용(enableCommercial): 상가 행도 상가 연면적으로 함께 시드 — 주택 면적 잔존 버그 방지", () => {
    render(
      <MultiPointBuildingStdPriceModal
        points={points}
        onApply={() => {}}
        enableCommercial
        commercialAcqFirstMode
        housingFloorAreaPrefill="37.79"
        commercialFloorAreaPrefill="80.23"
      />,
    );
    fireEvent.click(screen.getByText("3시점 주택·상가 건물기준시가 일괄 계산"));
    // 주택 행 37.79 + 상가 행 80.23 — 각 행이 자기 자산 면적으로 시작
    expect(screen.getByDisplayValue("37.79")).toBeTruthy();
    expect(screen.getByDisplayValue("80.23")).toBeTruthy();
  });

  it("비겸용: commercialFloorAreaPrefill 주입해도 상가 행 미시드 (주택 단독 종전 동작)", () => {
    render(
      <MultiPointBuildingStdPriceModal
        points={points}
        onApply={() => {}}
        housingFloorAreaPrefill="37.79"
        commercialFloorAreaPrefill="80.23"
      />,
    );
    fireEvent.click(screen.getByText("3시점 건물기준시가 일괄 계산"));
    expect(screen.getByDisplayValue("37.79")).toBeTruthy();
    expect(screen.queryByDisplayValue("80.23")).toBeNull();
  });

  it("housingFloorAreaPrefill 미주입 시 연면적 빈 값 (종전 동작)", () => {
    render(<MultiPointBuildingStdPriceModal points={points} onApply={() => {}} />);
    fireEvent.click(screen.getByText("3시점 건물기준시가 일괄 계산"));
    expect(screen.queryByDisplayValue("80.5")).toBeNull();
    // 연면적 placeholder 필드는 존재하되 값 없음
    expect(screen.getByPlaceholderText("연면적")).toBeTruthy();
  });
});
