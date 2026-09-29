/**
 * @vitest-environment jsdom
 *
 * anchor(⑤⑦⑧) — 명부 행의 **합가 전 보유 쪽** 입력·표시 (2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-merge-house-link.plan.md` 2단계.
 *
 * - ⑤ 편집 창: 합가 전 취득이면 2지선다, 합가 후 취득이면 선택지 없이 「합가 후 취득」
 * - ⑦ 명부 표: 행마다 배지(판정 메뉴만)
 * - 판정 메뉴에서 「배우자 단독 보유」 칩(중과 축)을 숨긴다 — 계산기는 그대로
 * - ⑧ 보유자 미입력 경고(차단 아님)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { HouseEntryEditor } from "@/components/calc/transfer/HouseEntryEditor";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { radioValues, checkedRadioValue } from "../components/_helpers/radio-values";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const house = (acquisitionDate: string, over: Partial<HouseEntry> = {}): HouseEntry => ({
  id: "h1",
  region: "capital",
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});

const MARRIAGE = { kind: "marriage" as const, mergeDate: "2020-01-01" };

describe("MO-1 편집 창(⑤)", () => {
  it("혼인 전 취득 → 배우자 쪽 / 양도자 쪽 두 값을 고를 수 있고, 고른 값이 체크된다", () => {
    const { container } = render(
      <HouseEntryEditor
        house={house("2018-01-01", { mergeOrigin: "counterpart_side" })}
        onUpdate={() => {}}
        mergeContext={MARRIAGE}
      />,
    );
    expect(radioValues(container, "merge-origin-")).toEqual(["counterpart_side", "seller_side"]);
    expect(checkedRadioValue(container, "merge-origin-")).toBe("counterpart_side");
    expect(screen.getByText("배우자 쪽")).toBeTruthy();
  });

  it("선택하면 onUpdate가 mergeOrigin 값을 넘긴다", () => {
    const onUpdate = vi.fn();
    render(<HouseEntryEditor house={house("2018-01-01")} onUpdate={onUpdate} mergeContext={MARRIAGE} />);
    fireEvent.click(screen.getByTestId("merge-origin-seller"));
    expect(onUpdate).toHaveBeenCalledWith({ mergeOrigin: "seller_side" });
  });

  it("혼인 후 취득 → 선택지 없이 「혼인 후 취득」 안내(날짜가 먼저)", () => {
    const { container } = render(
      <HouseEntryEditor
        house={house("2022-06-01", { mergeOrigin: "counterpart_side" })}
        onUpdate={() => {}}
        mergeContext={MARRIAGE}
      />,
    );
    expect(screen.getByTestId("house-merge-origin-after").textContent).toContain("혼인으로 들어온 주택이 아니라");
    expect(radioValues(container, "merge-origin-")).toEqual([]);
  });

  it("동거봉양이면 「합친 가족 쪽」 라벨 · 조사 「합가로」", () => {
    render(
      <HouseEntryEditor
        house={house("2022-06-01")}
        onUpdate={() => {}}
        mergeContext={{ kind: "parental_care", mergeDate: "2020-01-01" }}
      />,
    );
    expect(screen.getByTestId("house-merge-origin-after").textContent).toContain("합가로 들어온 주택이 아니라");
  });

  it("mergeContext가 없으면(계산기) 블록 자체가 없다", () => {
    render(<HouseEntryEditor house={house("2018-01-01")} onUpdate={() => {}} showSpouseOwned />);
    expect(screen.queryByTestId("house-merge-origin")).toBeNull();
    // 계산기의 중과 축 칩은 그대로다
    expect(screen.getByText("배우자 단독 보유 주택")).toBeTruthy();
  });
});

function calcForm(h: HouseEntry): TransferFormData {
  return { ...createDefaultTransferFormData(), houses: [h], marriageDate: "2020-01-01" };
}

describe("MO-2 명부 표(⑦) · 배우자 칩 숨김", () => {
  it("판정 메뉴 모드 — 행 배지가 합가 전 보유 쪽을 말하고, 편집 창에 배우자 칩이 없다", () => {
    render(
      <HousesListSection
        form={calcForm(house("2018-01-01", { mergeOrigin: "counterpart_side" }))}
        onChange={() => {}}
        hideSpouseOwned
        mergeContext={MARRIAGE}
      />,
    );
    const badge = screen.getByTestId("house-merge-badge-h1");
    expect(badge.getAttribute("data-side")).toBe("counterpart_side");
    expect(badge.textContent).toBe("배우자 쪽");

    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(screen.queryByText("배우자 단독 보유 주택")).toBeNull();
    expect(screen.getByTestId("house-merge-origin")).toBeTruthy();
  });

  it("혼인 후 취득 행은 배지가 「혼인 후 취득」 · 미입력 행은 「미입력」", () => {
    const { rerender } = render(
      <HousesListSection form={calcForm(house("2022-06-01"))} onChange={() => {}} mergeContext={MARRIAGE} />,
    );
    expect(screen.getByTestId("house-merge-badge-h1").getAttribute("data-side")).toBe("after_merge");
    rerender(<HousesListSection form={calcForm(house("2018-01-01"))} onChange={() => {}} mergeContext={MARRIAGE} />);
    expect(screen.getByTestId("house-merge-badge-h1").getAttribute("data-side")).toBe("unset");
  });

  it("계산기 모드(두 prop 없음) — 배지 없음 · 편집 창에 배우자 칩 그대로", () => {
    render(<HousesListSection form={calcForm(house("2018-01-01"))} onChange={() => {}} />);
    expect(screen.queryByTestId("house-merge-badge-h1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
    expect(screen.getByText("배우자 단독 보유 주택")).toBeTruthy();
    expect(screen.queryByTestId("house-merge-origin")).toBeNull();
  });
});

function judgmentForm(h: HouseEntry, over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-03-01",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" }],
    houses: [h],
    marriageDate: "2020-01-01",
    ...over,
  };
}

describe("MO-3 판정 메뉴 배선 — Step2가 두 prop을 넘긴다", () => {
  it("합가일이 있으면 명부 배지가 뜬다", () => {
    render(<Step2 form={judgmentForm(house("2018-01-01"))} onChange={() => {}} />);
    expect(screen.getByTestId("house-merge-badge-h1")).toBeTruthy();
  });

  it("합가일이 없으면 배지가 없다", () => {
    render(<Step2 form={judgmentForm(house("2018-01-01"), { marriageDate: "" })} onChange={() => {}} />);
    expect(screen.queryByTestId("house-merge-badge-h1")).toBeNull();
  });
});

describe("MO-4 ⑧ 보유자 미입력 경고 — 차단하지 않는다", () => {
  const warned = (f: OneHouseJudgmentFormData) =>
    validateStep2(f).filter((e) => e.field === "houses.0.mergeOrigin");

  it("혼인 전 취득 · 미입력 → warning 1건(error 아님)", () => {
    const w = warned(judgmentForm(house("2018-01-01")));
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe("warning");
  });

  it("입력했거나 · 혼인 후 취득이거나 · 합가일이 없으면 경고 없음", () => {
    expect(warned(judgmentForm(house("2018-01-01", { mergeOrigin: "seller_side" })))).toHaveLength(0);
    expect(warned(judgmentForm(house("2022-06-01")))).toHaveLength(0);
    expect(warned(judgmentForm(house("2018-01-01"), { marriageDate: "" }))).toHaveLength(0);
  });
});
