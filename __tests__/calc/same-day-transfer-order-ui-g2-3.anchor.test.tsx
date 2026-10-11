/**
 * G2-3 UI anchor (결정 #40) — 명부 행 「같은 날 양도 · 양도 순서」 칸·배지·고지·결과 표시.
 * 계산기(`HousesListSection`)와 판정 메뉴 2단계(`Step2`)가 같은 편집 창을 쓴다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { SameDayOrderLine } from "@/components/calc/results/transfer/SameDayOrderLine";
import { HouseEntrySameDaySection } from "@/components/calc/transfer/HouseEntrySameDaySection";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeOneHouseJudgmentSummary } from "@/lib/calc/one-house-exemption-validate";
import { makeHouse } from "./one-house-rulings/harness";

afterEach(cleanup);

const text = (c: HTMLElement) => (c.textContent ?? "").replace(/\s+/g, " ");
const openEditor = () => fireEvent.click(screen.getByRole("button", { name: "주택 1 편집" }));
const TD = "2025-06-01";

function judgmentForm(over: Record<string, unknown> = {}, kind = "housing"): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f, isOneHousehold: true, transferDate: TD, contractTotalPrice: "800000000",
    assets: [{ ...f.assets[0], assetKind: kind, acquisitionDate: "2015-01-01" }], presaleRights: [], houses: [], ...over,
  } as unknown as OneHouseJudgmentFormData;
}
function calcForm(over: Record<string, unknown> = {}, kind = "housing") {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.transferDate = TD;
  f.assets[0] = { ...f.assets[0], assetKind: kind as never, acquisitionDate: "2015-01-01" };
  return Object.assign(f, { presaleRights: [], houses: [], householdHousingCount: "1", ...over });
}
const ROW = (over: Record<string, unknown> = {}) => makeHouse("b", { region: "non_capital", acquisitionDate: "2018-01-01", ...over });

describe("편집 창 칸 — 두 단계(표시 → 순서)", () => {
  it("주택 양도: 계산기·판정 메뉴 모두 칸이 있다 / 입주권 양도에는 없다(§89①4호에는 닿지 않는 규정)", () => {
    const a = render(<HousesListSection form={calcForm({ houses: [ROW()] })} onChange={() => {}} />);
    openEditor();
    expect(screen.queryByTestId("house-same-day-section")).not.toBeNull();
    a.unmount();
    const b = render(<Step2 form={judgmentForm({ houses: [ROW()] })} onChange={() => {}} />);
    openEditor();
    expect(screen.queryByTestId("house-same-day-section")).not.toBeNull();
    b.unmount();
    render(<HousesListSection form={calcForm({ houses: [ROW()] }, "right_to_move_in")} onChange={() => {}} />);
    openEditor();
    expect(screen.queryByTestId("house-same-day-section")).toBeNull();
  });

  it("토글을 켜면 표시만 쓰고, 순서를 고르면 순서를 쓰고, 끄면 둘 다 지운다(미러링 아닌 onChange)", () => {
    const patches: Record<string, unknown>[] = [];
    const { rerender } = render(<HouseEntrySameDaySection house={ROW() as never} onUpdate={(p) => patches.push(p)} />);
    fireEvent.click(document.querySelector('[data-testid="house-same-day-toggle"] [data-slot="switch"]') ?? screen.getByRole("switch"));
    expect(patches.at(-1)).toEqual({ soldSameDay: true });
    rerender(<HouseEntrySameDaySection house={ROW({ soldSameDay: true }) as never} onUpdate={(p) => patches.push(p)} />);
    fireEvent.click(screen.getByTestId("house-same-day-first"));
    expect(patches.at(-1)).toEqual({ sameDayTransferOrder: "first" });
    rerender(<HouseEntrySameDaySection house={ROW({ soldSameDay: true, sameDayTransferOrder: "first" }) as never} onUpdate={(p) => patches.push(p)} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(patches.at(-1)).toEqual({ soldSameDay: undefined, sameDayTransferOrder: undefined });
  });
});

describe("명부 표 배지·고지", () => {
  it("먼저 양도 선택: 「주택 수 제외」 배지, 고지 없음", () => {
    render(<HousesListSection form={calcForm({ houses: [ROW({ soldSameDay: true, sameDayTransferOrder: "first" })] })} onChange={() => {}} />);
    expect(screen.getByTestId("house-same-day-badge-b").textContent).toContain("주택 수 제외");
    expect(screen.queryByTestId("same-day-order-notice")).toBeNull();
  });
  it("순서 미선택 + 세대 주택 2채: 산입 배지와 §154⑨ 고지(확인 필요)", () => {
    render(<HousesListSection form={calcForm({ houses: [ROW({ soldSameDay: true })], householdHousingCount: "2" })} onChange={() => {}} />);
    expect(screen.getByTestId("house-same-day-badge-b").textContent).toContain("순서 미선택");
    const n = screen.getByTestId("same-day-order-notice").textContent ?? "";
    expect(n).toContain("§154⑨");
    expect(n).toContain("확인 필요");
  });
  it("긍정 짝: 나중에 양도 선택이면 산입 배지만 있고 고지는 없다", () => {
    render(<HousesListSection form={calcForm({ houses: [ROW({ soldSameDay: true, sameDayTransferOrder: "later" })] })} onChange={() => {}} />);
    expect(screen.getByTestId("house-same-day-badge-b").textContent).toContain("나중에 양도 선택");
    expect(screen.queryByTestId("same-day-order-notice")).toBeNull();
  });
  it("머리글: 「선택」이 아니라 양도일 현재 기준이다 — 계산기·판정 메뉴 같은 머리글(#41)", () => {
    const a = render(<HousesListSection form={calcForm()} onChange={() => {}} />);
    expect(text(a.container)).toContain("(양도일 현재 보유 기준)");
    expect(text(a.container)).not.toContain("선택)");
    a.unmount();
    const b = render(<Step2 form={judgmentForm()} onChange={() => {}} />);
    expect(text(b.container)).toContain("(양도일 현재 보유 기준)");
  });
});

describe("결과·사이드바 표시", () => {
  it("결과 줄: 선택으로 뺀 주택을 근거 조문(§154⑨ · 중과 §167의3⑥)과 함께 보인다", () => {
    const f = calcForm({ houses: [ROW({ soldSameDay: true, sameDayTransferOrder: "first" })] });
    render(<SameDayOrderLine form={f} />);
    const t = screen.getByTestId("same-day-excluded").textContent ?? "";
    expect(t).toContain("보유 주택 1(취득일 2018-01-01)");
    expect(t).toContain("소득세법 시행령 §154⑨");
    expect(t).toContain("소득세법 시행령 §167의3⑥");
  });
  it("긍정 짝: 선택이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<SameDayOrderLine form={calcForm({ houses: [ROW()] })} />);
    expect(container.innerHTML).toBe("");
  });
  it("판정 사이드바: 세대 보유 주택 수는 명부보다 적고, 제외 행 수를 따로 보인다", () => {
    const f = judgmentForm({ houses: [ROW({ soldSameDay: true, sameDayTransferOrder: "first" })] });
    const items = computeOneHouseJudgmentSummary(f);
    expect(items.find((i) => i.label === "세대 보유 주택 수")?.value).toBe("1채");
    expect(items.find((i) => i.label.includes("§154⑨"))?.value).toBe("1채");
    expect(computeOneHouseJudgmentSummary(judgmentForm({ houses: [ROW()] })).some((i) => i.label.includes("§154⑨"))).toBe(false);
  });
});
