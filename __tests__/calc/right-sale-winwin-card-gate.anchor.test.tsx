/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 메뉴: **입주권 양도에는 §155의3 상생임대 칸이 없다** (M10 · 평가셋 G035).
 *
 * §89①4호 판정은 인가일 현재 기존주택 요건을 자기선언으로 받는다. 상생임대 칸이 입주권 양도에도 보이면
 * 입력해도 판정에 쓰이지 않아 사용자는 과세 결과를 받는다(서면-2024-법규재산-0802는 비과세). 칸을 숨기고
 * 자기선언 안내에 상생임대를 적는다 — ⑤·④·⑧이 같은 `judgmentSaleIsHousing` 게이트.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | W-1 | ⑤ | 주택 양도엔 칸이 있고 입주권 양도엔 없다 |
 * | W-2 | ④ | 입주권 양도면 남아 있는 상생임대 선언을 싣지 않는다 · 주택 양도면 싣는다 |
 * | W-3 | ⑧ | 입주권 양도면 상생임대 미입력 오류를 내지 않는다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep3 } from "@/lib/calc/one-house-exemption-validate";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

function form(assetKind: "housing" | "right_to_move_in"): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    transferDate: "2024-01-30",
    winWinRentalSpecial: true,
    winWinRentalContractDate: "2022-01-08",
    winWinRentalIncreaseRatePct: "0",
    winWinRentalPriorLeaseMonths: "24",
    winWinRentalLeaseMonths: "",
    assets: [{ ...f.assets[0], assetKind, acquisitionDate: "2019-09-10", ...(assetKind === "right_to_move_in" ? { redevSubject: "right" } : {}) }],
  } as OneHouseJudgmentFormData;
}

const winWinErrors = (f: OneHouseJudgmentFormData) =>
  validateStep3(f).filter((e) => e.field?.startsWith("winWinRental"));

describe("W-1 ⑤", () => {
  it("주택 양도엔 칸 · 입주권 양도엔 없음", () => {
    render(<Step3 form={form("housing")} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-win-win-rental")).toBeTruthy();
    cleanup();
    const r = render(<Step3 form={form("right_to_move_in")} onChange={() => {}} />);
    expect(screen.queryByTestId("one-house-win-win-rental")).toBeNull();
    expect(r.container.textContent).toMatch(/상생임대주택\(§155의3\) 요건을 갖춘 종전주택은 거주기간 제한 없음/);
  });
});

describe("W-2 ④ · W-3 ⑧", () => {
  it("입주권 양도면 싣지 않고 오류도 없다 · 주택 양도면 싣고 미입력 오류를 낸다", () => {
    expect((buildOneHouseExemptionApiBody(form("right_to_move_in")) as Record<string, unknown>).winWinRentalHouse).toBeUndefined();
    expect((buildOneHouseExemptionApiBody(form("housing")) as Record<string, unknown>).winWinRentalHouse).toBeDefined();
    expect(winWinErrors(form("right_to_move_in"))).toEqual([]);
    expect(winWinErrors(form("housing")).length).toBeGreaterThan(0);
  });
});
