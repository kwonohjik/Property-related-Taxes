/**
 * anchor(⑤) — 판정 단계 화면의 `menu` prop(계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.3 · P6a).
 *
 * - SM-1 ② 양도 대상: M1 양도 당시 기준시가 칸은 중과 메뉴에만 · 가액기준이면 필수 표시(⑧과 같은 술어)
 * - SM-2 ③ 보유 주택: 중과 메뉴는 양도 주택 자체 배제 섹션을 연다 · 1주택 메뉴(기본값)는 종전대로 닫는다
 * - SM-3 ③ 한시배제 창 안 안내는 중과 메뉴에만
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeHouse } from "./one-house-rulings/harness";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const ASAN = "4420010100";
const GANGNAM = "1168010100";

function form(regionCode: string, over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2021-06-01",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", regionCode }],
    ...over,
  } as OneHouseJudgmentFormData;
}
const m1 = (c: HTMLElement) => c.querySelector('[data-field="standardPriceAtTransfer"]');

describe("SM-1 — M1 양도 당시 기준시가 칸", () => {
  it("1주택 메뉴(기본값)에는 없다", () => {
    const { container } = render(<Step3 form={form(ASAN)} onChange={() => {}} />);
    expect(m1(container)).toBeNull();
  });
  it("중과 메뉴 · 가액기준 → 칸 + 필수 표시 + 3억 안내", () => {
    const { container } = render(<Step3 form={form(ASAN)} onChange={() => {}} menu="surcharge" />);
    expect(m1(container)).not.toBeNull();
    expect(m1(container)!.textContent).toMatch(/\*/);
    expect(m1(container)!.textContent).toMatch(/3억원 이하면 주택 수에 넣지 않습니다/);
  });
  it("중과 메뉴 · 지역기준 → 칸은 있되 선택 입력", () => {
    const { container } = render(<Step3 form={form(GANGNAM)} onChange={() => {}} menu="surcharge" />);
    expect(m1(container)).not.toBeNull();
    expect(m1(container)!.textContent).not.toMatch(/\*/);
  });
  it("중과 메뉴 · 입주권 양도 → 칸 없음(§104⑦은 주택 양도)", () => {
    const f = form(ASAN);
    f.assets = [{ ...f.assets[0], assetKind: "right_to_move_in" }];
    const { container } = render(<Step3 form={f} onChange={() => {}} menu="surcharge" />);
    expect(m1(container)).toBeNull();
  });
});

describe("SM-2 — 양도 주택 자체 배제 섹션", () => {
  const twoHouses = () => form(GANGNAM, { houses: [makeHouse("h1", { acquisitionDate: "2010-01-01", regionCode: GANGNAM, officialPrice: "500000000" })] });
  it("1주택 메뉴는 닫고 중과 메뉴는 연다", () => {
    render(<Step2 form={twoHouses()} onChange={() => {}} />);
    const closed = screen.queryAllByText(/저당권 실행/).length;
    cleanup();
    render(<Step2 form={twoHouses()} onChange={() => {}} menu="surcharge" />);
    expect(closed).toBe(0);
    expect(screen.queryAllByText(/저당권 실행/).length).toBeGreaterThan(0);
  });
});

describe("SM-3 — 한시배제 창 안 안내", () => {
  const inWindow = () =>
    form(GANGNAM, { transferDate: "2024-06-01", houses: [makeHouse("h1", { acquisitionDate: "2010-01-01", regionCode: GANGNAM, officialPrice: "500000000" })] });
  it("중과 메뉴에만 뜬다 · 창 밖이면 없다", () => {
    render(<Step2 form={inWindow()} onChange={() => {}} menu="surcharge" />);
    expect(screen.queryByTestId("surcharge-judgment-suspended-notice")).not.toBeNull();
    cleanup();
    render(<Step2 form={inWindow()} onChange={() => {}} />);
    expect(screen.queryByTestId("surcharge-judgment-suspended-notice")).toBeNull();
    cleanup();
    render(<Step2 form={form(GANGNAM)} onChange={() => {}} menu="surcharge" />);
    expect(screen.queryByTestId("surcharge-judgment-suspended-notice")).toBeNull();
  });
});
