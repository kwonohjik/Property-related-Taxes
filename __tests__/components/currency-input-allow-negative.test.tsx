/**
 * CurrencyInput allowNegative 계약 (G-5 — 비상장주식 결손 순손익·음수 순자산·상장이익 결손 입력)
 *
 * 배경: 상증령 §56④(각 사업연도 소득금액)·§55①(순자산가액 유보/평가차액)·§31의3⑤(상장이익)의
 *   해당 입력은 음수(결손·△유보)가 정상값이며, Zod 스키마도 z.number()(signed)로 선언돼 있다
 *   (unlisted-stock-valuation-v2.schema.ts:59·107·108·122, gift-deemed-input.ts:330·337·427).
 *   그러나 CurrencyInput은 allowNegative 미전달 시 선행 `-`를 침묵 제거해 결손이 이익으로 부호가
 *   뒤집힌다. 본 테스트는 위젯 계약을 고정한다 — 각 폼 위젯은 signed 필드에 allowNegative를 전달해야 한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import {
  CurrencyInput,
  formatWithCommas,
  parseAmount,
} from "@/components/calc/inputs/CurrencyInput";

afterEach(cleanup);

describe("CurrencyInput allowNegative 계약 (G-5)", () => {
  it("formatWithCommas: 기본은 부호 제거, allowNegative=true는 부호 보존 + 콤마", () => {
    expect(formatWithCommas("-5000")).toBe("5,000"); // 기본: 부호 소실
    expect(formatWithCommas("-5000", true)).toBe("-5,000"); // 보존
    expect(formatWithCommas("-", true)).toBe("-"); // 전이 상태 유지
  });

  it("parseAmount: 음수 보존, 전이 상태 '-'는 0 가드(NaN 방지)", () => {
    expect(parseAmount("-5,000")).toBe(-5000);
    expect(parseAmount("-1,000,000,000")).toBe(-1_000_000_000);
    expect(parseAmount("-")).toBe(0);
  });

  it("위젯: allowNegative 미전달 시 음수 입력이 부호 소실 — 결손이 이익으로 뒤집힘(버그 재현)", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <CurrencyInput label="소득금액" value="" onChange={onChange} />,
    );
    fireEvent.change(getByRole("textbox"), { target: { value: "-5000" } });
    expect(onChange).toHaveBeenLastCalledWith("5000"); // △5000이 +5000으로 소실
  });

  it("위젯: allowNegative 전달 시 음수 보존", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <CurrencyInput label="소득금액" value="" onChange={onChange} allowNegative />,
    );
    fireEvent.change(getByRole("textbox"), { target: { value: "-5000" } });
    expect(onChange).toHaveBeenLastCalledWith("-5000");
  });
});
