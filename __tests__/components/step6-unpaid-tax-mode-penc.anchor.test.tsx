/**
 * @vitest-environment jsdom
 *
 * anchor: PEN-C — 「가산세 계산하기」·기납부세액 자동기입·직접 입력은 미납세액을 **직접 입력(manual)**으로
 * 싣고, 자동 모드에서는 입력 칸을 숨긴다 (⑤ Step6 · 「가산세 계산하기」 흐름 · ⑧ step 3).
 *
 * 종전: 완납(기납부 ≥ 결정세액)이면 `"0"`을 저장했는데 route가 0을 「결정세액 전액 미납」으로 바꿔
 * 완납인데 납부지연가산세가 붙었다(route 쪽 anchor: `__tests__/api/transfer.route.unpaid-tax-mode-penc.anchor.test.ts`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/calc/transfer-tax-api", () => ({ callTransferTaxAPI: vi.fn() }));

import { Step6 } from "@/app/calc/transfer-tax/steps/Step6";
import { runPenaltyCalc } from "@/app/calc/transfer-tax/transfer-calc-actions";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { patchInvalidatesDeterminedTax } from "@/app/calc/transfer-tax/transfer-penalty-invalidation";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const form = (o: Partial<TransferFormData> = {}): TransferFormData => ({
  ...createDefaultTransferFormData(),
  enablePenalty: true,
  filingType: "correct",
  paymentDeadline: "2024-05-31",
  ...o,
});

describe("⑤ Step6 — 미납세액 산정 모드", () => {
  it("모드 부재 + 0(기본) → 「자동」이 선택되고 입력 칸은 숨는다", () => {
    render(<Step6 form={form()} onChange={vi.fn()} determinedTax={null} />);
    expect((screen.getByRole("radio", { name: /자동/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText("미납·미달납부세액")).toBeNull();
  });

  it("모드 부재 + 양수(종전 저장 폼) → 「직접 입력」으로 보이고 값이 남는다", () => {
    render(<Step6 form={form({ unpaidTax: "5000000" })} onChange={vi.fn()} determinedTax={null} />);
    expect((screen.getByRole("radio", { name: /직접 입력/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("미납·미달납부세액")).toBeTruthy();
  });

  it("「직접 입력」 선택 → unpaidTaxMode manual", () => {
    const onChange = vi.fn();
    render(<Step6 form={form()} onChange={onChange} determinedTax={null} />);
    fireEvent.click(screen.getByRole("radio", { name: /직접 입력/ }));
    expect(onChange).toHaveBeenCalledWith({ unpaidTaxMode: "manual" });
  });

  it("🔴 기납부세액 자동기입(완납) → unpaidTax \"0\" + manual (종전: \"0\"만 저장돼 자동으로 읽혔다)", () => {
    const onChange = vi.fn();
    render(<Step6 form={form()} onChange={onChange} determinedTax={30_000_000} />);
    const input = screen
      .getByText("기납부세액")
      .closest("div")
      ?.parentElement?.querySelector<HTMLInputElement>('input[inputmode], input[type="text"]');
    fireEvent.change(input!, { target: { value: "40,000,000" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ unpaidTax: "0", unpaidTaxMode: "manual" }),
    );
  });
});

describe("「가산세 계산하기」 흐름 — 산출 미납세액을 manual로 싣는다", () => {
  it("🔴 완납(기납부 ≥ 결정세액) → 두 번째 호출이 unpaidTax \"0\" + manual · 저장도 manual", async () => {
    const api = vi.mocked(callTransferTaxAPI);
    api.mockReset();
    api.mockResolvedValue({ mode: "single", result: { determinedTax: 30_000_000, penaltyDetail: { totalPenalty: 0 } } } as never);
    const setUnpaidTax = vi.fn();
    await runPenaltyCalc(form({ priorPaidTax: "40,000,000" }), {
      setDeterminedTax: vi.fn(),
      setUnpaidTax,
      setPenaltyResult: vi.fn(),
      setError: vi.fn(),
    });
    expect(setUnpaidTax).toHaveBeenCalledWith("0");
    expect(api.mock.calls[1][0]).toMatchObject({ unpaidTax: "0", unpaidTaxMode: "manual" });
  });
});

describe("⑧ step 3 — 직접 입력의 빈 칸은 차단", () => {
  it("manual + 빈칸 → 오류 · manual + 0 → 통과 · 모드 부재 + 빈칸 → 통과(자동)", () => {
    const msgs = (o: Partial<TransferFormData>) => collectStepIssues(3, form(o)).map((i) => i.message);
    expect(msgs({ unpaidTaxMode: "manual", unpaidTax: "" })).toContain("미납·미달납부세액을 입력하세요 (완납이면 0).");
    expect(msgs({ unpaidTaxMode: "manual", unpaidTax: "0" })).toEqual([]);
    expect(msgs({ unpaidTax: "" })).toEqual([]);
  });

  it("모드 변경은 결정세액을 낡게 하지 않는다 (가산세 전용 키)", () => {
    expect(patchInvalidatesDeterminedTax({ unpaidTaxMode: "manual" })).toBe(false);
  });
});
