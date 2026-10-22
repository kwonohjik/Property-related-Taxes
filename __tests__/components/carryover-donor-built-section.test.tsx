/**
 * @vitest-environment jsdom
 *
 * ⑤ — 이월과세 «증여자가 신축·증축한 건물» 위젯 (소득세법 §114조의2, PR-2)
 *  · 노출 게이트(`donorBuiltApplicable`)와 렌더가 일치한다 — 엔진·⑫가 거부하는 조합에서는 칸이 없다
 *  · 구분 라디오는 value 를 본다(`radioValues`) · 신축·증축일은 증여자 취득일로 자동 채우지 않는다
 *  · 일체 주택만 건물분 입력(공시지가·면적·건물 기준시가 + 기존 양도가액 구분 섹션)이 있다
 */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { CarryoverDonorBuiltSection } from "@/components/calc/transfer/CarryoverDonorBuiltSection";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { donorBuiltApplicable } from "@/lib/calc/donor-built-scope";
import { radioValues, checkedRadioValue } from "./_helpers/radio-values";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

afterEach(cleanup);

function asset(over: Partial<AssetForm> = {}, co: Partial<CarryoverTaxationForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01",
      donorAcquisitionDate: "2022-01-10",
      useEstimatedAcquisition: true,
      estimationMode: "general",
      ...co,
    },
    ...over,
  } as AssetForm;
}

function mount(a: AssetForm) {
  const onChange = vi.fn();
  const onCarryoverChange = vi.fn();
  const view = render(
    <CarryoverDonorBuiltSection asset={a} transferDate="2026-03-01" onChange={onChange} onCarryoverChange={onCarryoverChange} />,
  );
  return { ...view, onChange, onCarryoverChange };
}

describe("노출 게이트 — 렌더와 술어가 일치한다", () => {
  it.each([
    ["일체 주택", {}, {}, true],
    ["비주택 건물", { assetKind: "building" as const }, {}, true],
    ["실가 승계", {}, { useEstimatedAcquisition: false }, false],
    ["PHD 환산", {}, { estimationMode: "phd" as const }, false],
    ["토지", { assetKind: "land" as const }, {}, false],
    ["상가", { assetKind: "commercial_building" as const }, {}, false],
    ["일반건물", { assetKind: "general_building" as const }, {}, false],
    ["입주권", { assetKind: "right_to_move_in" as const }, {}, false],
    ["겸용주택", { isMixedUseHouse: true }, {}, false],
    ["부담부증여", { transferType: "burdened_gift" as const }, {}, false],
    ["증여자 토지·건물 다른 날 취득(파트 이월과세)", { carryoverDonorSplit: true }, {}, false],
  ])("%s → %s", (_l, over, co, shown) => {
    const a = asset(over, co);
    expect(donorBuiltApplicable(a, { transferDate: "2026-03-01" })).toBe(shown);
    mount(a);
    expect(screen.queryByTestId("donor-built-toggle") !== null).toBe(shown);
  });
});

describe("토글·구분·일자", () => {
  it("토글을 켜면 donorBuilt:true 만 올린다 — 구분·일자·금액을 지어내지 않는다", () => {
    const { onCarryoverChange } = mount(asset());
    fireEvent.click(screen.getByRole("switch"));
    expect(onCarryoverChange).toHaveBeenCalledTimes(1);
    expect(onCarryoverChange).toHaveBeenCalledWith({ donorBuilt: true });
  });

  it("OFF 면 입력 칸이 없고 ON 이면 구분 라디오(값 new·extension)와 일자 칸이 있다", () => {
    mount(asset());
    expect(screen.queryByTestId("donor-built-fields")).toBeNull();
    cleanup();
    const { container, onCarryoverChange } = mount(asset({}, { donorBuilt: true, donorBuiltType: "new" }));
    expect(screen.getByTestId("donor-built-fields")).toBeTruthy();
    expect(radioValues(container, "donorBuiltType-")).toEqual(["new", "extension"]);
    expect(checkedRadioValue(container, "donorBuiltType-")).toBe("new");
    expect(screen.getByText("증여자의 신축 취득일")).toBeTruthy();
    // 마운트만으로 일자를 채우지 않는다 (증여자 취득일 자동 채움 금지)
    expect(onCarryoverChange).not.toHaveBeenCalled();
  });

  it("구분을 고르면 구분만 올린다 (신축일 자동 채움 없음)", () => {
    const { container, onCarryoverChange } = mount(asset({}, { donorBuilt: true }));
    const radio = container.querySelector('input[type="radio"][value="extension"]') as HTMLInputElement;
    fireEvent.click(radio);
    expect(onCarryoverChange).toHaveBeenCalledWith({ donorBuiltType: "extension" });
  });
});

describe("증축 · 일체 주택 칸", () => {
  it("증축이면 바닥면적·증축 부분 기준시가 칸이 있고 신축이면 없다 (긍정 짝)", () => {
    mount(asset({}, { donorBuilt: true, donorBuiltType: "extension" }));
    expect(screen.getByTestId("donor-built-ext-area")).toBeTruthy();
    expect(screen.getByTestId("donor-built-ext-std")).toBeTruthy();
    expect(screen.getByText("증여자의 증축 완공일")).toBeTruthy();
    cleanup();
    mount(asset({}, { donorBuilt: true, donorBuiltType: "new" }));
    expect(screen.queryByTestId("donor-built-ext-area")).toBeNull();
  });

  it("일체 주택에는 건물분 입력 + 양도가액 구분 섹션이 있고, 비주택 건물에는 없다 (긍정 짝)", () => {
    mount(asset({}, { donorBuilt: true, donorBuiltType: "new" }));
    expect(screen.getByTestId("donor-built-housing")).toBeTruthy();
    expect(screen.getByTestId("donor-built-land-area")).toBeTruthy();
    expect(screen.getByTestId("donor-built-building-std")).toBeTruthy();
    expect(screen.getByTestId("sale-split-mode")).toBeTruthy(); // 기존 LandBuildingSaleSplitSection 재마운트(Q-6 b)
    cleanup();
    mount(asset({ assetKind: "building" }, { donorBuilt: true, donorBuiltType: "new" }));
    expect(screen.queryByTestId("donor-built-housing")).toBeNull();
    expect(screen.queryByTestId("sale-split-mode")).toBeNull();
  });

  it("입력은 이월과세 서브폼 키로 올라간다 (건물 기준시가 · 토지 면적)", () => {
    const { onCarryoverChange } = mount(asset({}, { donorBuilt: true, donorBuiltType: "new" }));
    fireEvent.change(screen.getByTestId("donor-built-building-std"), { target: { value: "60000000" } });
    expect(onCarryoverChange).toHaveBeenCalledWith({ donorBuiltBuildingStdAtAcq: "60000000" });
    fireEvent.change(screen.getByTestId("donor-built-land-area"), { target: { value: "100" } });
    expect(onCarryoverChange).toHaveBeenCalledWith({ donorBuiltLandArea: "100" });
  });
});

describe("이월과세 블록에 마운트된다 (CarryoverGiftBlock ② 환산 입력 다음)", () => {
  const block = (a: AssetForm) =>
    render(<CarryoverGiftBlock asset={a} transferDate="2026-03-01" onChange={vi.fn()} />);
  it("환산(일반 기준시가) 이월과세 카드에는 토글이 있고, 실가 승계 카드에는 없다", () => {
    block(asset());
    expect(screen.getByTestId("donor-built-toggle")).toBeTruthy();
    cleanup();
    block(asset({}, { useEstimatedAcquisition: false }));
    expect(screen.queryByTestId("donor-built-toggle")).toBeNull();
  });
  it("함께 양도 자산(첫 자산이 아님)도 같은 술어로 노출된다", () => {
    render(<CarryoverGiftBlock asset={asset()} transferDate="2026-03-01" onChange={vi.fn()} isNonPrimaryAsset />);
    expect(screen.getByTestId("donor-built-toggle")).toBeTruthy();
  });
});
