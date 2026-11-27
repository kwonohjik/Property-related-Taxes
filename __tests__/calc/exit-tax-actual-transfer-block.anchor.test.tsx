/**
 * @vitest-environment jsdom
 *
 * 국외전출세 3단계 — 종목별 실제 양도 블록(⑤ · PR-7b) anchor
 *
 *   U-1 2026 출국 → 블록 없음 · 종전 «실양도 정보»(전역) 그대로
 *   U-2 2027 + 2호 과세(강제) → 종목별 토글만 — 전역 실양도·외국납부세액·원천징수 입력은 그려지지 않는다
 *   U-3 토글 ON → 국외는 외화+환율 칸(원화 단가 칸 없음) · 국내는 원화 칸 · 외국법인 발행에는 원천징수 칸 없음
 *   U-4 토글 OFF → 그 종목의 실제 양도 값 전부 초기화(null) · 다시 켜면 빈 입력
 *   U-5 제외 종목에는 토글이 없다
 *   U-6 1호뿐(2027) → 방식 선택 · 기본 전역 · 방식 전환은 값을 지우지 않는다
 *   U-7 반대 방식 값이 남아 있으면 안내 + 사용자가 누르는 «지우기»만 비운다
 *   U-8 외국납부세액 방식 전환은 안 쓰게 된 쪽만 비운다 · 토글 OFF는 전부 초기화
 */

import "fake-indexeddb/auto";
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { exitActual, exitForm, F1, F1_SOLD, H1 } from "../_helpers/exit-tax-2027-form";

afterEach(cleanup);

const seen: { form: StockTransferFormData } = { form: exitForm() };

function Harness({ initial }: { initial: StockTransferFormData }) {
  const [form, setForm] = useState(initial);
  return (
    <Step3
      form={form}
      onChange={(p) => {
        const next = { ...form, ...p };
        seen.form = next;
        setForm(next);
      }}
    />
  );
}

function mount(initial: StockTransferFormData) {
  seen.form = initial;
  return render(<Harness initial={initial} />);
}

const q = (c: HTMLElement, field: string) => c.querySelector(`[data-field="${field}"]`);
const input = (c: HTMLElement, field: string) => q(c, field)?.querySelector("input") as HTMLInputElement | null;
const soldSwitch = (name: string) => screen.getByRole("switch", { name: new RegExp(`${name}.*실제 양도함`) });
const at = (i = 0) => seen.form.etHoldings[i].actualTransfer;

describe("U-1 · U-2 블록 노출", () => {
  it("U-1 2026 출국 → 블록 없음 · 전역 «실양도 정보» 그대로", () => {
    const { container } = mount(exitForm({ etDepartureDate: "2026-09-01", etHoldings: [H1()] }));
    expect(container.querySelector('[data-testid="exit-actual-transfer-block"]')).toBeNull();
    expect(screen.queryAllByText("실양도 정보 — 경정청구용 (§118의12, 선택)")).toHaveLength(1);
    expect(screen.queryAllByText("외국납부세액 있음 (§118의13)")).toHaveLength(1);
  });

  it("U-2 2호 과세(강제) → 종목별 토글만 — 전역 입력 3곳이 없다", () => {
    const { container } = mount(exitForm());
    expect(container.querySelector('[data-testid="exit-actual-forced-note"]')).not.toBeNull();
    expect(screen.getAllByRole("switch", { name: /실제 양도함/ })).toHaveLength(1);
    expect(screen.queryAllByText("실양도 정보 — 경정청구용 (§118의12, 선택)")).toHaveLength(0);
    expect(screen.queryAllByText("외국납부세액 있음 (§118의13)")).toHaveLength(0);
    expect(screen.queryAllByText("비거주자 세액공제 (§118의14, 선택)")).toHaveLength(0);
    // 납부유예·보유현황 신고는 두 방식 모두에 있다
    expect(screen.queryAllByText("납부유예 신청 (§118의16)")).toHaveLength(1);
  });
});

describe("U-3 · U-4 · U-5 종목 토글", () => {
  it("U-3 국외주식(외국법인 발행): 외화 단가+환율 · 원화 단가·원천징수 칸 없음", () => {
    const { container } = mount(exitForm({ etHoldings: [F1()] }));
    fireEvent.click(soldSwitch("F1 국외주식"));
    expect(at()).toEqual(exitActual());
    expect(input(container, "etHoldings[0].actualTransfer.shareCount")).not.toBeNull();
    expect(input(container, "etHoldings[0].actualTransfer.priceForeign")).not.toBeNull();
    expect(input(container, "etHoldings[0].actualTransfer.exchangeRate")).not.toBeNull();
    expect(q(container, "etHoldings[0].actualTransfer.pricePerShare")).toBeNull();
    expect(q(container, "etHoldings[0].actualTransfer.domesticSourceTaxWithheld")).toBeNull();
  });

  it("U-3 내국법인 발행 국외주식은 원천징수 칸이 열린다 · 국내 종목은 원화 단가", () => {
    const a = mount(exitForm({ etHoldings: [F1({ isListedForeignCorp: false, actualTransfer: F1_SOLD })] }));
    expect(q(a.container, "etHoldings[0].actualTransfer.domesticSourceTaxWithheld")).not.toBeNull();
    cleanup();
    const b = mount(
      exitForm({
        etActualTransferMode: "per_holding",
        etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "10" }) })],
      }),
    );
    expect(q(b.container, "etHoldings[0].actualTransfer.pricePerShare")).not.toBeNull();
    expect(q(b.container, "etHoldings[0].actualTransfer.priceForeign")).toBeNull();
    expect(q(b.container, "etHoldings[0].actualTransfer.domesticSourceTaxWithheld")).not.toBeNull();
  });

  it("U-4 토글 OFF → null(값 전부 초기화) · 다시 켜면 빈 입력", () => {
    const filled = exitActual({
      ...F1_SOLD,
      foreignTaxInput: "foreign",
      foreignTaxPaidForeign: "100",
      foreignTaxExchangeRate: "1300",
    });
    mount(exitForm({ etHoldings: [F1({ actualTransfer: filled })] }));
    fireEvent.click(soldSwitch("F1 국외주식"));
    expect(at()).toBeNull();
    fireEvent.click(soldSwitch("F1 국외주식"));
    expect(at()).toEqual(exitActual());
  });

  it("U-5 제외 종목(5억 이하 국외)에는 토글이 없다 · 과세 종목만", () => {
    const small = F1({ departureDayPriceForeign: "100", perShareAcquisitionPriceForeign: "40" });
    mount(exitForm({ etActualTransferMode: "per_holding", etHoldings: [H1(), small] }));
    expect(screen.getAllByRole("switch", { name: /실제 양도함/ })).toHaveLength(1);
    expect(screen.getByRole("switch", { name: /H1 코스닥.*실제 양도함/ })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /F1 국외주식.*실제 양도함/ })).toBeNull();
  });

  it("U-5 제외 종목에 입력이 남아 있으면 지우기 안내만 — 버튼이 그 종목만 비운다", () => {
    const small = F1({
      departureDayPriceForeign: "100",
      perShareAcquisitionPriceForeign: "40",
      actualTransfer: exitActual({ shareCount: "10" }),
    });
    const { container } = mount(exitForm({ etActualTransferMode: "per_holding", etHoldings: [H1(), small] }));
    expect(container.querySelector('[data-testid="exit-actual-excluded-f1"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이 종목 입력 지우기" }));
    expect(at(1)).toBeNull();
  });
});

describe("U-6 · U-7 방식 선택과 충돌", () => {
  it("U-6 1호뿐(2027): 방식 선택이 보이고 기본은 전역 — 전역 입력칸이 그대로 있다", () => {
    const { container } = mount(exitForm({ etHoldings: [H1()] }));
    expect(container.querySelector('[data-testid="exit-actual-mode-radio"]')).not.toBeNull();
    expect(screen.queryAllByText("실양도 정보 — 경정청구용 (§118의12, 선택)")).toHaveLength(1);
    expect(screen.queryAllByRole("switch", { name: /실제 양도함/ })).toHaveLength(0);
  });

  it("U-6 종목별로 바꿔도 전역에 입력한 값은 지우지 않는다 — 충돌 안내 후 사용자가 지운다", () => {
    const { container } = mount(exitForm({ etHoldings: [H1()], etActualTransferPricePerShare: "40,000" }));
    const radios = container.querySelectorAll<HTMLInputElement>('input[name="etActualTransferMode"]');
    const perHolding = [...radios].find((r) => r.value === "per_holding")!;
    fireEvent.click(perHolding);
    expect(seen.form.etActualTransferMode).toBe("per_holding");
    expect(seen.form.etActualTransferPricePerShare).toBe("40,000"); // 조용히 지우지 않는다
    expect(container.querySelector('[data-testid="exit-actual-stale-global"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "종목 공통 입력 지우기" }));
    expect(seen.form.etActualTransferPricePerShare).toBe("");
    expect(seen.form.etHasForeignTax).toBe(false);
  });

  it("U-7 전역 방식 + 종목별 입력이 남음: 안내 → «종목별 입력 지우기»가 비운다", () => {
    const { container } = mount(
      exitForm({ etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "5" }) })] }),
    );
    expect(container.querySelector('[data-testid="exit-actual-stale-holding"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "종목별 입력 지우기" }));
    expect(at()).toBeNull();
  });

  it("U-7 2026 출국 + 종목별 입력이 남음: 선택 불가 안내가 뜬다", () => {
    const { container } = mount(
      exitForm({
        etDepartureDate: "2026-09-01",
        etHoldings: [H1({ actualTransfer: exitActual({ shareCount: "5" }) })],
      }),
    );
    expect(container.querySelector('[data-testid="exit-actual-stale-holding"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="exit-actual-mode-radio"]')).toBeNull();
  });
});

describe("U-8 외국납부세액(종목별)", () => {
  it("방식 전환은 안 쓰게 된 쪽만 비운다", () => {
    const { container } = mount(
      exitForm({
        etHoldings: [F1({ actualTransfer: { ...F1_SOLD, foreignTaxInput: "krw", foreignTaxPaid: "5,000,000" } })],
      }),
    );
    expect(input(container, "etHoldings[0].actualTransfer.foreignTaxPaid")).not.toBeNull();
    const radios = container.querySelectorAll<HTMLInputElement>('input[name^="exit-actual-foreign-tax-method"]');
    fireEvent.click([...radios].find((r) => r.value === "foreign")!);
    expect(at()?.foreignTaxInput).toBe("foreign");
    expect(at()?.foreignTaxPaid).toBe("");
    expect(at()?.shareCount).toBe("1,000"); // 다른 칸은 그대로
    expect(input(container, "etHoldings[0].actualTransfer.foreignTaxPaidForeign")).not.toBeNull();
    expect(input(container, "etHoldings[0].actualTransfer.foreignTaxExchangeRate")).not.toBeNull();
  });

  it("외국납부세액 토글 OFF → 방식·금액·환율·통화 전부 초기값", () => {
    mount(
      exitForm({
        etHoldings: [
          F1({
            actualTransfer: {
              ...F1_SOLD,
              foreignTaxInput: "foreign",
              foreignTaxPaidForeign: "100",
              foreignTaxExchangeRate: "1300",
              foreignTaxCurrencyCode: "EUR",
            },
          }),
        ],
      }),
    );
    fireEvent.click(screen.getByRole("switch", { name: /이 종목에 외국납부세액 있음/ }));
    expect(at()).toMatchObject({
      foreignTaxInput: "none",
      foreignTaxPaid: "",
      foreignTaxPaidForeign: "",
      foreignTaxExchangeRate: "",
      foreignTaxCurrencyCode: "USD",
      shareCount: "1,000",
    });
  });

  it("종목별 외국납부세액이 있을 때만 §118의13② 배제 사유 선택이 열린다", () => {
    const off = mount(exitForm({ etHoldings: [F1({ actualTransfer: F1_SOLD })] }));
    expect(q(off.container, "etForeignTaxExclusionReason")).toBeNull();
    cleanup();
    const on = mount(
      exitForm({ etHoldings: [F1({ actualTransfer: { ...F1_SOLD, foreignTaxInput: "krw", foreignTaxPaid: "1,000" } })] }),
    );
    expect(q(on.container, "etForeignTaxExclusionReason")).not.toBeNull();
  });
});
