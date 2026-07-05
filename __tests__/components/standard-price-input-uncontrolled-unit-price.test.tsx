/**
 * StandardPriceInput — 단가(pricePerSqm) uncontrolled fallback anchor (작업 2)
 *
 * 버그: 호출부가 pricePerSqm/onPricePerSqmChange를 전달하지 않으면(§66 자경 편입 등)
 *   조회된 단가가 onPricePerSqmChange?.() no-op으로 사라지고 단가칸이 항상 빈 placeholder였다.
 *   (조회 초록 안내는 뜨는데 단가칸은 "공시지가 단가"만 표시)
 *
 * 수정: internalArea와 대칭으로 internalPricePerSqm 내부 state fallback 추가 →
 *   uncontrolled 호출부에서도 조회·수동입력 단가가 칸에 표시되고 단가×면적 총액 자동계산 동작.
 *
 * 계획: docs/00-pm/transfer-self-farming-incorporation-ui-fixes.plan.md
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockLookup(price: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ price, year: "2022" }) }) as unknown as Response),
  );
}

describe("[UNIT-PRICE] StandardPriceInput uncontrolled 단가 fallback", () => {
  it("UP-1: pricePerSqm 미전달(uncontrolled) + land 조회 → 단가칸에 조회값 표시", async () => {
    mockLookup(36500);
    render(
      <StandardPriceInput
        propertyKind="land"
        totalPrice=""
        onTotalPriceChange={() => {}}
        area="661"
        jibun="경상남도 거제시 장승포동 24"
        referenceDate="2022-06-01"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /공시가격 조회/ }));

    // 단가칸(내부 state)에 조회 단가가 표시되어야 한다 (기존 버그: 항상 빈칸)
    await waitFor(() => expect(screen.getByDisplayValue("36,500")).toBeTruthy());
  });

  it("UP-2: uncontrolled 단가 수동입력 → 단가×면적 총액 자동계산", () => {
    const onTotal = vi.fn();
    render(
      <StandardPriceInput
        propertyKind="land"
        totalPrice=""
        onTotalPriceChange={onTotal}
        area="661"
        referenceDate="2022-06-01"
      />,
    );

    // 단가칸에 36500 입력 → floor(36500 × 661) = 24,126,500
    const unitInput = screen.getByPlaceholderText("공시지가 단가");
    fireEvent.change(unitInput, { target: { value: "36500" } });

    expect(screen.getByDisplayValue("36,500")).toBeTruthy();
    expect(onTotal).toHaveBeenCalledWith(String(36500 * 661));
  });
});
