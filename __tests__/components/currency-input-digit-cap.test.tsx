/**
 * 금액 칸 자릿수 상한(15자리)과 400 문구 — 계획서 docs/00-pm/remaining-4-measurements.plan.md §D · Q-50 a · Q-51 a.
 * 안전 정수(9,007,199,254,740,991 · 16자리)를 넘는 금액은 ⑧을 지나 ⑫ 400(Zod 4 `.int()` = safeint)이었고, 309자리 이상은 `Infinity` → JSON `null`이었다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { CurrencyInput, MAX_AMOUNT_DIGITS } from "@/components/calc/inputs/CurrencyInput";
import { formatFieldErrors, translateMessage } from "@/lib/calc/transfer-tax-error-format";

afterEach(cleanup);

describe("CurrencyInput 자릿수 상한(Q-50 a)", () => {
  it("상한은 15자리 — 안전 정수(16자리) 아래", () => {
    expect(MAX_AMOUNT_DIGITS).toBe(15);
    expect(Number("9".repeat(MAX_AMOUNT_DIGITS))).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });
  it("20자리를 붙여 넣으면 앞 15자리만 받는다", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<CurrencyInput label="양도가액" value="" onChange={onChange} />);
    fireEvent.change(getByRole("textbox"), { target: { value: "12345678901234567890" } });
    expect(onChange).toHaveBeenLastCalledWith("123456789012345");
  });
  it("콤마가 섞여도 숫자 자릿수로 센다 · 15자리 이하는 그대로", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<CurrencyInput label="양도가액" value="" onChange={onChange} />);
    fireEvent.change(getByRole("textbox"), { target: { value: "999,999,999,999,999" } });
    expect(onChange).toHaveBeenLastCalledWith("999999999999999");
  });
  it("음수 허용 칸은 부호를 빼고 15자리", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<CurrencyInput label="소득금액" value="" onChange={onChange} allowNegative />);
    fireEvent.change(getByRole("textbox"), { target: { value: "-12345678901234567890" } });
    expect(onChange).toHaveBeenLastCalledWith("-123456789012345");
  });
});

describe("400 문구(Q-51 a)", () => {
  it("와이어 경로 세 곳이 한국어 라벨로 나온다", () => {
    const text = formatFieldErrors(
      {
        totalSalePrice: ["Too big: expected int to be <=9007199254740991"],
        "inheritedAcquisition.reportedValue": ["Too big: expected int to be <=9007199254740991"],
        "burdenedGiftInfo.mortgageDebtAmount": ["Too big: expected int to be <=9007199254740991"],
      },
      "입력값이 올바르지 않습니다",
    );
    expect(text).toContain("• 양도가액 합계(함께 양도): 값이 너무 큽니다");
    expect(text).toContain("• 상속·증여 평가액(상속세·증여세 신고가액): 값이 너무 큽니다");
    expect(text).toContain("• 부담부증여 채무액(근저당): 값이 너무 큽니다");
    expect(text).not.toMatch(/burdenedGiftInfo|inheritedAcquisition|totalSalePrice/);
  });
  it("Infinity → null 은 「숫자가 너무 크거나 올바르지 않습니다」(종전 「예상 자료형 number, 입력값 null」)", () => {
    expect(translateMessage("Invalid input: expected number, received null")).toBe("숫자가 너무 크거나 올바르지 않습니다");
    expect(translateMessage("Invalid input: expected string, received number")).toBe("예상 자료형 string, 입력값 number");
  });
});
