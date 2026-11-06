/**
 * UI — 보유 감면주택의 §99·§99의3 «유형» 칸 (리뷰 NH-23 · NH-24)
 * 유형이 기준일 칸을 정한다: 매수 = 최초 매매계약일 / 자기건설 = 사용승인일(취득일) / 종전(원시) §99의3 = 둘 + 3-state 두 칸.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpecialHouseExclusionItemFields } from "@/components/calc/transfer/SpecialHouseExclusionSection";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";

const base: SpecialHouseExclusionFormItem = {
  article: "new_99_3", houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: false,
};
const draw = (item: Partial<SpecialHouseExclusionFormItem>, onChange = vi.fn(), hideAcquisitionDate = false) => {
  render(<SpecialHouseExclusionItemFields item={{ ...base, ...item }} onChange={onChange} hideAcquisitionDate={hideAcquisitionDate} />);
  return onChange;
};

afterEach(cleanup);

describe("감면주택 유형 칸", () => {
  it("§99의3: 유형 4개 선택지를 보이고 유형 선택 전에는 기준일 칸을 보이지 않는다", () => {
    draw({});
    expect(screen.getByTestId("special-house-exclusion-kind")).toBeTruthy();
    for (const k of ["purchase", "self_built", "original_purchase", "original_self_built"]) {
      expect(screen.getByTestId(`special-house-exclusion-kind-${k}`)).toBeTruthy();
    }
    expect(screen.queryByText("감면주택 최초 매매계약일")).toBeNull();
    expect(screen.queryByText("감면주택 취득일")).toBeNull();
    expect(screen.queryByText("감면주택 사용승인일(취득일)")).toBeNull();
  });
  it("§99: 종전(원시) 유형은 고르지 못한다", () => {
    draw({ article: "new_99" });
    expect(screen.queryByTestId("special-house-exclusion-kind-original_purchase")).toBeNull();
    expect(screen.getByTestId("special-house-exclusion-kind-purchase")).toBeTruthy();
  });
  it("유형을 고르면 onChange(housingKind)", () => {
    const onChange = draw({});
    fireEvent.click(screen.getByTestId("special-house-exclusion-kind-self_built"));
    expect(onChange).toHaveBeenCalledWith({ housingKind: "self_built" });
  });
  it("매수 → 계약일 칸만 · 자기건설 → 사용승인일(취득일) 칸만", () => {
    draw({ housingKind: "purchase" });
    expect(screen.getByText("감면주택 최초 매매계약일")).toBeTruthy();
    expect(screen.queryByText("감면주택 취득일")).toBeNull();
  });
  it("자기건설 → 사용승인일(취득일) 칸만", () => {
    draw({ housingKind: "self_built" });
    expect(screen.getByText("감면주택 사용승인일(취득일)")).toBeTruthy();
    expect(screen.queryByText("감면주택 최초 매매계약일")).toBeNull();
  });
  it("명부 행(취득일 숨김)에서 자기건설이면 날짜 칸이 없다 — 취득일은 행 값", () => {
    draw({ housingKind: "self_built" }, vi.fn(), true);
    expect(screen.queryByText("감면주택 사용승인일(취득일)")).toBeNull();
  });
  it("종전(원시) 유형 → 계약일·취득일 + 수도권 밖·국민주택 3-state", () => {
    draw({ housingKind: "original_purchase" });
    expect(screen.getByText("감면주택 최초 매매계약일")).toBeTruthy();
    expect(screen.getByText("감면주택 취득일")).toBeTruthy();
    expect(screen.getByTestId("special-house-exclusion-original-outside")).toBeTruthy();
    expect(screen.getByTestId("special-house-exclusion-original-national")).toBeTruthy();
  });
  it("유형을 묻지 않는 조문(§98의3)에는 유형 칸이 없다", () => {
    draw({ article: "unsold_98_3" });
    expect(screen.queryByTestId("special-house-exclusion-kind")).toBeNull();
  });
});
