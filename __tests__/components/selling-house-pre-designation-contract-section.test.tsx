/**
 * ⑤ 공고 전 매매계약 섹션(영 §167의10①11호 등) — 공고일 안내 · 토글 OFF 시 계약일 정리.
 * 노출 범위(⑤=④=⑧)는 `__tests__/lib/calc/pre-designation-contract-scope.test.ts`, 실브라우저는
 * `e2e/transfer-pre-designation-contract.spec.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SellingHousePreDesignationContractSection } from "@/components/calc/transfer/SellingHousePreDesignationContractSection";

afterEach(cleanup);

describe("SellingHousePreDesignationContractSection", () => {
  it("2017년 차수 — 공고일 2017.11.10.과 지정 효력일을 함께 안내한다(효력일과 다를 때)", () => {
    render(<SellingHousePreDesignationContractSection value={{}} onChange={() => {}} regionCode="1168010100" transferDate="2019-06-01" />);
    expect(screen.getByTestId("pre-designation-announcement").textContent).toContain("2017.11.10.");
    expect(screen.getByTestId("pre-designation-announcement").textContent).toContain("지정 효력 2017.8.3.");
  });

  it("재지정 구간(과천 2026) — 그 구간을 연 공고 2025.10.16.만 안내한다(효력일과 같다)", () => {
    render(<SellingHousePreDesignationContractSection value={{}} onChange={() => {}} regionCode="4129010100" transferDate="2026-08-01" />);
    const t = screen.getByTestId("pre-designation-announcement").textContent ?? "";
    expect(t).toContain("2025.10.16.");
    expect(t).not.toContain("지정 효력");
  });

  it("토글 OFF → 날짜 칸이 없다 · 토글을 끄면 계약일도 지운다(useEffect 미러링 없이 onChange 한 번)", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SellingHousePreDesignationContractSection value={{}} onChange={onChange} regionCode="1168010100" transferDate="2019-06-01" />,
    );
    expect(screen.queryByTestId("pre-designation-sale-contract-date")).toBeNull();
    rerender(
      <SellingHousePreDesignationContractSection
        value={{ saleDepositReceived: true, saleContractDate: "2017-07-01", isMortgageExecution: true }}
        onChange={onChange}
        regionCode="1168010100"
        transferDate="2019-06-01"
      />,
    );
    expect(screen.getByTestId("pre-designation-sale-contract-date")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ saleDepositReceived: false, saleContractDate: undefined, isMortgageExecution: true });
  });
});
