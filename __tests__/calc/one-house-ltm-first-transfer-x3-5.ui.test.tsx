/**
 * @vitest-environment jsdom
 *
 * X3-5 ⑤ — §155의2② 칩을 켜면 같은 카드에서 「먼저 양도하는 주택」을 묻는다(합가일 칸이 열리지 않아도).
 * 값은 합가일 칸 아래 토글과 같은 필드(`isFirstTransferredInMerge`) — 서로 복사하지 않는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const form = (over: Partial<OneHouseJudgmentFormData>): OneHouseJudgmentFormData => {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    transferDate: "2025-05-01",
    longTermMortgageSpecial: true,
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01" }],
    ...over,
  } as OneHouseJudgmentFormData;
};

describe("X3-5 ⑤ — 장기저당 카드의 「먼저 양도」 토글", () => {
  it("동거봉양 합가 칩이 꺼져 있으면 없고 켜져 있으면 있다", () => {
    render(<Step3 form={form({ longTermMortgageParentalCareMerge: false })} onChange={() => {}} />);
    expect(screen.queryByTestId("ltm-first-transferred-in-merge")).toBeNull();
    cleanup();
    render(<Step3 form={form({ longTermMortgageParentalCareMerge: true })} onChange={() => {}} />);
    expect(screen.getByTestId("ltm-first-transferred-in-merge")).toBeTruthy();
  });

  it("토글하면 isFirstTransferredInMerge를 켠다(합가일 칸과 같은 필드)", () => {
    const onChange = vi.fn();
    render(<Step3 form={form({ longTermMortgageParentalCareMerge: true })} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("ltm-first-transferred-in-merge"));
    expect(onChange).toHaveBeenCalledWith({ isFirstTransferredInMerge: true });
  });
});
