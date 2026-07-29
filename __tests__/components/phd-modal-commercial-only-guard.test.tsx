/**
 * anchor: 겸용 PHD 배치 모달 — 주택 행 부재 가드 (Case A).
 *
 * Case A(commercialAcqFirstMode)는 취득·최초공시 상가를 주택 행의 구조·용도로
 * 주입(재일46014-2396)하므로, 주택 행 없이 계산하면 양도시 상가만 silent 산출된다.
 * handleCalc 최상단 rows 기반 가드가 이를 구성 오류로 차단해야 한다.
 *
 * 계획서: docs/02-design/features/phd-mixed-modal-housing-row-guard.plan.md (F1·M2/M3)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PhdBuildingStdPriceModalButton } from "../../components/calc/building-std-price/PhdBuildingStdPriceModalButton";

afterEach(cleanup);

const points = [
  { key: "acquisition" as const, label: "취득시", year: 1985, landPricePerM2: "" },
  { key: "firstDisclosure" as const, label: "최초공시일", year: 2005, landPricePerM2: "" },
  { key: "transfer" as const, label: "양도시", year: 2026, landPricePerM2: "" },
];

const GUARD_ERROR = /주택 부분 행이 필요합니다/;
const BUILT_YEAR_ERROR = "신축연도를 입력하세요.";

/** Case A 결합 모달 렌더 + 열기 — 자동 시드로 주택+상가 2행 상태로 시작 */
function openCaseAModal() {
  render(
    <PhdBuildingStdPriceModalButton
      points={points}
      onApply={() => {}}
      enableCommercial
      commercialAcqFirstMode
      housingFloorAreaPrefill="37.79"
      commercialFloorAreaPrefill="80.23"
    />,
  );
  fireEvent.click(screen.getByText("3시점 주택·상가 건물기준시가 일괄 계산"));
}

describe("겸용 PHD 배치 모달 — 주택 행 부재 가드 (M2/M3)", () => {
  it("M2: 주택 행을 전부 상가로 전환 후 계산 → 가드 오류로 차단", () => {
    openCaseAModal();
    // 자동 시드 2행 중 주택 행(첫 행)의 chip을 상가로 전환 → 전 행 상가
    fireEvent.click(screen.getAllByRole("button", { name: "상가" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "3시점 계산하기" }));
    expect(screen.getByText(GUARD_ERROR)).toBeTruthy();
  });

  it("M3 회귀: 상가 행 삭제(주택만) 후 계산 → 가드 아닌 후속 검증(신축연도)으로 진행", () => {
    openCaseAModal();
    // 상가 행(둘째 행) 삭제 → 주택 행만 남김
    const deleteButtons = screen.getAllByRole("button", { name: "삭제" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: "3시점 계산하기" }));
    expect(screen.queryByText(GUARD_ERROR)).toBeNull();
    expect(screen.getByText(BUILT_YEAR_ERROR)).toBeTruthy(); // 가드 통과 증명
  });

  it("경계: 상가 전환으로 가드 오류 → 주택 복귀 시 가드 소멸", () => {
    openCaseAModal();
    fireEvent.click(screen.getAllByRole("button", { name: "상가" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "3시점 계산하기" }));
    expect(screen.getByText(GUARD_ERROR)).toBeTruthy();
    // 첫 행을 주택으로 복귀 → 가드 통과, 후속 검증(신축연도)으로 진행
    fireEvent.click(screen.getAllByRole("button", { name: "주택" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "3시점 계산하기" }));
    expect(screen.queryByText(GUARD_ERROR)).toBeNull();
    expect(screen.getByText(BUILT_YEAR_ERROR)).toBeTruthy();
  });
});
