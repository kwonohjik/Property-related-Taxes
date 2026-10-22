/**
 * ⑤ 렌더 — split 건물 파트 카드의 «증여자가 신축·증축한 건물입니까?» 토글 (PR-3, 소득세법 §114조의2)
 *
 * 불변식:
 *  · 건물 파트가 «환산취득가액»일 때만 건물 카드에 나온다(C·B) — 토지 카드·실가 입력·토지만 이월과세(A)에는 없다
 *  · 노출은 `donorBuiltPartApplicable` 하나(④ 전송·⑧ 필수와 같은 술어) — 렌더와 술어가 일치한다
 *  · 일체 주택 안분 입력(공시지가·면적·건물 기준시가·양도가액 구분)은 없다 — 파트별 기준시가가 이미 나뉘어 있다
 *  · 신축·증축일은 증여자 취득일로 자동 채우지 않는다 — 토글은 donorBuilt:true 만 올린다
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { SplitCarryoverParts } from "@/components/calc/transfer/SplitCarryoverParts";
import { LandCarryoverCard } from "@/components/calc/transfer/LandCarryoverCard";
import { donorBuiltPartApplicable } from "@/lib/calc/donor-built-part-scope";
import { cAsset } from "../calc/_helpers/split-carryover-c-form";
import { aAsset } from "../calc/_helpers/split-carryover-a-form";
import { bAsset } from "../calc/_helpers/split-carryover-b-form";
import { radioValues, checkedRadioValue } from "./_helpers/radio-values";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

afterEach(cleanup);

const withCo = (a: AssetForm, co: Partial<CarryoverTaxationForm>): AssetForm => ({ ...a, carryover: { ...a.carryover!, ...co } }) as AssetForm;
const EST: Partial<CarryoverTaxationForm> = { partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "30,000,000" };

function CHarness({ initial }: { initial: AssetForm }) {
  const [a, setA] = useState(initial);
  return <SplitCarryoverParts asset={a} onChange={(p) => setA((prev) => ({ ...prev, ...p }))} isAfter2024 giftTaxShareHint="" />;
}
function BHarness({ initial }: { initial: AssetForm }) {
  const [a, setA] = useState(initial);
  return <LandCarryoverCard asset={a} onChange={(p) => setA((prev) => ({ ...prev, ...p }))} transferDate="2025-06-30" part="building" />;
}

describe("노출 — 렌더와 술어가 일치한다", () => {
  it("C: 건물 환산 ON 이면 건물 카드 안에만 나온다(토지 환산을 켜도 토지 카드에는 없다)", () => {
    const base = withCo(cAsset(), EST);
    // 토지 파트도 환산을 켠다 — 건물 카드 가드가 없으면 토지 카드에도 토글이 나온다
    const a = { ...base, landCarryover: { ...base.landCarryover!, ...EST } } as AssetForm;
    expect(donorBuiltPartApplicable(a)).toBe(true);
    render(<CHarness initial={a} />);
    expect(screen.getByTestId("split-carryover-land-estimated-note")).toBeTruthy();
    expect(screen.getAllByTestId("donor-built-toggle")).toHaveLength(1);
    expect(within(screen.getByTestId("split-carryover-building-card")).getByTestId("donor-built-toggle")).toBeTruthy();
    expect(within(screen.getByTestId("split-carryover-land-card")).queryByTestId("donor-built-toggle")).toBeNull();
  });

  it("건물 파트가 실가 입력이면 토글이 없다 — 환산 토글을 켜야 나온다(OFF → ON 긍정 짝)", () => {
    render(<CHarness initial={cAsset()} />);
    expect(screen.queryByTestId("donor-built-toggle")).toBeNull();
    fireEvent.click(within(screen.getByTestId("split-carryover-building-estimated")).getByRole("switch"));
    expect(screen.getByTestId("donor-built-toggle")).toBeTruthy();
  });

  it("B(건물만 이월과세): 건물 카드에 나온다", () => {
    render(<BHarness initial={withCo(bAsset(), EST)} />);
    expect(screen.getByTestId("donor-built-toggle")).toBeTruthy();
  });

  it("A(토지만 이월과세): 건물 파트가 없어 토글이 없다 — 토지 환산이어도 마찬가지", () => {
    const a = aAsset("purchase", { landCarryover: { ...aAsset("purchase").landCarryover!, ...EST } });
    expect(donorBuiltPartApplicable(a)).toBe(false);
    render(<LandCarryoverCard asset={a} onChange={vi.fn()} transferDate="2025-06-30" />);
    expect(screen.queryByTestId("donor-built-toggle")).toBeNull();
  });

  it("엔진·⑫가 거부하는 조합은 비노출 — 토지 종류·부담부증여·겸용주택", () => {
    for (const over of [{ assetKind: "land" }, { transferType: "burdened_gift" }, { isMixedUseHouse: true }]) {
      const a = { ...withCo(cAsset(), EST), ...over } as AssetForm;
      expect(donorBuiltPartApplicable(a)).toBe(false);
      render(<CHarness initial={a} />);
      expect(screen.queryByTestId("donor-built-toggle")).toBeNull();
      cleanup();
    }
  });
});

describe("토글·구분·일자·증축", () => {
  it("토글을 켜면 donorBuilt:true 만 올린다 — 구분·일자·금액을 지어내지 않는다", () => {
    render(<CHarness initial={withCo(cAsset(), EST)} />);
    expect(screen.queryByTestId("donor-built-fields")).toBeNull();
    fireEvent.click(within(screen.getByTestId("donor-built-toggle")).getByRole("switch"));
    expect(screen.getByTestId("donor-built-fields")).toBeTruthy();
    // 마운트·토글만으로 일자 칸을 채우지 않는다 (증여자 취득일 자동 채움 금지)
    const dateCard = document.querySelector('[data-field="carryover.donorBuiltDate"]')!;
    expect(dateCard.querySelector("input")?.getAttribute("value") ?? "").toBe("");
  });

  it("ON 이면 구분 라디오(값 new·extension) · 증축을 고르면 바닥면적·증축 부분 기준시가 칸 · 일체 주택 안분 칸은 없다", () => {
    const { container } = render(<CHarness initial={withCo(cAsset(), { ...EST, donorBuilt: true, donorBuiltType: "new" })} />);
    expect(radioValues(container, "donorBuiltType-")).toEqual(["new", "extension"]);
    expect(checkedRadioValue(container, "donorBuiltType-")).toBe("new");
    expect(screen.queryByTestId("donor-built-ext-area")).toBeNull();
    fireEvent.click(container.querySelector('input[type="radio"][value="extension"]') as HTMLInputElement);
    expect(screen.getByTestId("donor-built-ext-area")).toBeTruthy();
    expect(screen.getByTestId("donor-built-ext-std")).toBeTruthy();
    expect(screen.queryByTestId("donor-built-housing")).toBeNull();
    expect(screen.queryByTestId("donor-built-land-area")).toBeNull();
  });

  it("설명은 건물 파트 환산취득가액·토지 파트 비대상을 말한다", () => {
    render(<CHarness initial={withCo(cAsset(), EST)} />);
    const t = screen.getByTestId("donor-built-toggle").textContent!;
    expect(t).toContain("건물 파트 환산취득가액의 5%");
    expect(t).toContain("토지 파트는 대상이 아닙니다");
  });

  it("카드 안의 환산 입력 → 증여자 신축 질문 → 자본적지출 순서(계산 순서 = 화면 순서)", () => {
    const { container } = render(<CHarness initial={withCo(cAsset(), EST)} />);
    const building = container.querySelector('[data-testid="split-carryover-building-card"]')!;
    const order = ["carryover.donorStandardPriceAtAcquisition", "carryover.donorBuilt", "carryover.donorCapitalExpenditure"].map((k) => {
      const el = building.querySelector(`[data-field="${k}"]`);
      expect(el, k).toBeTruthy();
      return el!;
    });
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
