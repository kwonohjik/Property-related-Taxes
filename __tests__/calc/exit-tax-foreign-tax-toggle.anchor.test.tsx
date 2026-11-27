/**
 * @vitest-environment jsdom
 *
 * 국외전출세 3단계 「외국납부세액 있음 (§118의13)」 토글 anchor
 *
 * ## 왜
 *
 * 토글이 `checked = !!etForeignTaxPaid`(값에서 파생)인데 `onCheckedChange(true)`는 아무 일도
 * 하지 않아, 켜도 입력칸이 마운트되지 않았다. 끌 때는 원화·배제 사유만 지워 외화·환율이 남았고
 * API 변환은 토글과 무관하게 외화·환율을 body 에 넣어, 꺼진 것처럼 보이는 폼의 숨은 값이
 * 엔진에 도달할 수 있었다.
 *
 * 켜짐 여부는 값과 **별개 필드** `etHasForeignTax` 로 저장하고, ④ API 변환·⑧ validate 가 같은 규칙을 쓴다.
 */

import "fake-indexeddb/auto";
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { buildExitTaxApiBody } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { validateStep3ExitTax } from "@/lib/calc/stock-transfer-tax-validate-exit";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";

afterEach(cleanup);

const exitForm = (o: Partial<StockTransferFormData> = {}): StockTransferFormData =>
  ({
    ...createInitialStockFormData(),
    marketType: "exit_tax",
    etYearsResidentLast10: "10",
    etDepartureDate: "2026-09-01",
    etIsMajorShareholder: true,
    ...o,
  }) as StockTransferFormData;

/** 마지막으로 반영된 폼 — onChange(이벤트 핸들러) 안에서만 갱신한다 */
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
  render(<Harness initial={initial} />);
}

const toggle = () => screen.getByRole("switch", { name: /외국납부세액 있음/ });
const fieldCount = () => screen.queryAllByText("외국납부세액 (원화 환산)").length;

// 외국납부세액 5필드가 모두 초기값인가
const foreignTaxCleared = (f: StockTransferFormData) =>
  f.etForeignTaxPaid === "" &&
  f.etForeignTaxPaidForeign === "" &&
  f.etForeignTaxExchangeRate === "" &&
  f.etForeignTaxCurrencyCode === "USD" &&
  f.etForeignTaxExclusionReason === "none";

describe("FTC-1 토글 켜기·끄기 (⑤)", () => {
  it("FTC-1a 🔴 값이 비어 있어도 켜면 입력칸이 마운트된다", () => {
    mount(exitForm());
    expect(fieldCount()).toBe(0);
    fireEvent.click(toggle());
    expect(seen.form.etHasForeignTax).toBe(true);
    expect(fieldCount()).toBe(1);
    expect(screen.queryAllByText("외국납부세액 (외화)").length).toBe(1);
  });

  it("FTC-1b 🔴 끄면 원화·외화·환율·통화·배제 사유가 모두 초기값으로 돌아간다", () => {
    mount(
      exitForm({
          etHasForeignTax: true,
          etForeignTaxPaid: "30,000,000",
          etForeignTaxPaidForeign: "1000",
          etForeignTaxExchangeRate: "1350",
          etForeignTaxCurrencyCode: "EUR",
          etForeignTaxExclusionReason: "step_up",
        }),
    );
    expect(fieldCount()).toBe(1);
    fireEvent.click(toggle());
    expect(seen.form.etHasForeignTax).toBe(false);
    expect(foreignTaxCleared(seen.form)).toBe(true);
    expect(fieldCount()).toBe(0);
  });
});

describe("FTC-2 API 변환 게이트 (④⑬)", () => {
  const withValues = {
    etForeignTaxPaid: "30,000,000",
    etForeignTaxPaidForeign: "1000",
    etForeignTaxExchangeRate: "1350",
    etForeignTaxCurrencyCode: "USD",
    etForeignTaxExclusionReason: "credit_allowed" as const,
  };

  it("FTC-2a 🔴 꺼짐이면 값이 남아 있어도 외국납부세액 키가 body 에 없다 (배제 사유는 Zod 필수라 none)", () => {
    const body = buildExitTaxApiBody(exitForm({ ...withValues, etHasForeignTax: false }));
    expect(body).not.toHaveProperty("foreignTaxPaid");
    expect(body).not.toHaveProperty("foreignTaxPaidForeign");
    expect(body).not.toHaveProperty("foreignTaxExchangeRate");
    expect(body).not.toHaveProperty("foreignTaxCurrencyCode");
    expect(body.foreignTaxExclusionReason).toBe("none");
  });

  it("FTC-2b 켜짐이면 모두 body 에 실린다", () => {
    const body = buildExitTaxApiBody(exitForm({ ...withValues, etHasForeignTax: true }));
    expect(body.foreignTaxPaid).toBe(30_000_000);
    expect(body.foreignTaxPaidForeign).toBe(1_000);
    expect(body.foreignTaxExchangeRate).toBe(1_350);
    expect(body.foreignTaxCurrencyCode).toBe("USD");
    expect(body.foreignTaxExclusionReason).toBe("credit_allowed");
  });
});

describe("FTC-3 validate (⑧)", () => {
  const errs = (o: Partial<StockTransferFormData>) =>
    validateStep3ExitTax(exitForm(o)).filter((e) => e.field === "etForeignTaxPaid");

  it("FTC-3a 꺼짐이면 값이 이상해도 검증하지 않는다", () => {
    expect(errs({ etHasForeignTax: false, etForeignTaxPaid: "0" })).toHaveLength(0);
  });
  it("FTC-3b 켜짐 + 값 전무 → 오류", () => {
    expect(errs({ etHasForeignTax: true })).toHaveLength(1);
  });
  it("FTC-3c 켜짐 + 원화 > 0 → 통과", () => {
    expect(errs({ etHasForeignTax: true, etForeignTaxPaid: "30,000,000" })).toHaveLength(0);
  });
  it("FTC-3d 켜짐 + 외화·환율 → 통과 (원화 비워도 됨)", () => {
    expect(
      errs({ etHasForeignTax: true, etForeignTaxPaidForeign: "1000", etForeignTaxExchangeRate: "1350" }),
    ).toHaveLength(0);
  });
  it("FTC-3e 켜짐 + 외화만(환율 없음) → 오류 · 원화 0 입력 → 오류", () => {
    expect(errs({ etHasForeignTax: true, etForeignTaxPaidForeign: "1000" })).toHaveLength(1);
    expect(errs({ etHasForeignTax: true, etForeignTaxPaid: "0" })).toHaveLength(1);
  });
});

describe("FTC-4 normalize 복원 (③)", () => {
  const norm = (o: Record<string, unknown>) =>
    normalizeStockFormData({ ...exitForm(), ...o, etHasForeignTax: undefined });

  it("FTC-4a 필드 없는 옛 저장분 — 원화 값이 있으면 켜짐", () => {
    expect(norm({ etForeignTaxPaid: "30,000,000" }).etHasForeignTax).toBe(true);
  });
  it("FTC-4b 외화+환율이 있으면 켜짐, 외화만이면 꺼짐", () => {
    expect(norm({ etForeignTaxPaidForeign: "1000", etForeignTaxExchangeRate: "1350" }).etHasForeignTax).toBe(true);
    expect(norm({ etForeignTaxPaidForeign: "1000" }).etHasForeignTax).toBe(false);
  });
  it("FTC-4c 값 전무 → 꺼짐 · 명시 저장값은 그대로", () => {
    expect(norm({}).etHasForeignTax).toBe(false);
    expect(
      normalizeStockFormData({ ...exitForm(), etHasForeignTax: true, etForeignTaxPaid: "" }).etHasForeignTax,
    ).toBe(true);
  });
});
