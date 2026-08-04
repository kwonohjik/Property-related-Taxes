/**
 * PointBlock — 건물 기준시가 계산기 prefill 배선 anchor.
 *
 * 상위 화면(PHD·겸용)이 이미 가진 연면적·부수토지 면적을 계산기 모달에 시드해
 * 이중입력을 막는다. 상가·일반건물 블록의 `prefill={{ floorArea, landAreaM2 }}`와
 * 같은 계약인데 PointBlock 경로만 누락돼 있었다.
 *
 * ⚠️ splitMode에서는 주택·상가 계산기가 **각자 자기 면적**을 받아야 한다 —
 *    섞이면 다른 자산의 면적으로 기준시가를 산출한다.
 * ⚠️ 취득일·양도일은 시드하지 않는다(PointBlock은 시점별이라 최초공시 블록에
 *    취득일을 주입하면 모달이 잘못된 연도로 계산한다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { PointBlock } from "@/components/calc/transfer/ThreePointPointBlock";

const ADDR = {
  road: "서울특별시 서초구 남부순환로297나길 13",
  jibun: "방배동 593-64",
  building: "방배동 아파트",
  detail: "",
  lng: "126.993824",
  lat: "37.475198",
};

const BASE = {
  label: "③ 양도시 기준시가",
  referenceDate: "2026-05-01",
  selectedYear: "2026",
  isManual: false,
  onYearChange: () => {},
  landPricePerSqm: "",
  onLandPricePerSqmChange: () => {},
  buildingStdPrice: "",
  onBuildingStdPriceChange: () => {},
  stdPriceAddress: ADDR,
};

describe("PointBlock — 건물 기준시가 계산기 prefill", () => {
  it("일반 모드: 연면적·토지면적이 계산기 모달에 시드된다", async () => {
    render(
      <PointBlock
        {...BASE}
        landArea="78.01"
        housingFloorArea="283.06"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));
    expect(await screen.findByDisplayValue("283.06")).toBeTruthy();
    expect(screen.getByDisplayValue("78.01")).toBeTruthy();
  });

  it("splitMode: 상가 계산기는 상가 연면적·상가 부수토지를 받는다(주택 값 아님)", async () => {
    render(
      <PointBlock
        {...BASE}
        splitMode
        housingLandArea="50.00"
        commercialLandArea="28.01"
        housingFloorArea="200.00"
        commercialFloorArea="83.06"
        commercialBuildingStdPrice=""
        onCommercialBuildingStdPriceChange={() => {}}
      />,
    );
    // 계산기 버튼 2개(주택·상가) — 두 번째가 상가
    const buttons = screen.getAllByRole("button", { name: "건물 기준시가 계산" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(await screen.findByDisplayValue("83.06")).toBeTruthy();
    expect(screen.getByDisplayValue("28.01")).toBeTruthy();
    // 주택 값이 새어 들어오지 않는다
    expect(screen.queryByDisplayValue("200.00")).toBeNull();
    expect(screen.queryByDisplayValue("50.00")).toBeNull();
  });

  it("상위가 면적을 주지 않으면 시드하지 않는다(종전 동작)", async () => {
    render(<PointBlock {...BASE} />);
    fireEvent.click(screen.getByRole("button", { name: "건물 기준시가 계산" }));
    // 모달은 열리되 면적 칸은 빈 상태
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByDisplayValue("283.06")).toBeNull();
    expect(screen.queryByDisplayValue("78.01")).toBeNull();
  });
});
