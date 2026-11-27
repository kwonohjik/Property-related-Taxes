/**
 * @vitest-environment jsdom
 *
 * 국외전출세 납부유예 OFF — 이자 일수·이율이 숨은 값으로 body에 실리지 않는다 (14지점 점검 F5)
 *
 * 토글 OFF는 사유만 지우고 일수·1일당 이자율은 남겼고, ④는 토글과 무관하게 둘을 body에 넣었다.
 * 엔진은 deferralRequested=false면 이자를 계산하지 않아 세액 영향은 없지만, 꺼진 폼의 값이 서버로 나간다(#3707과 같은 원칙).
 */
import "fake-indexeddb/auto";
import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { buildExitTaxApiBody } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { validateStep3ExitTax } from "@/lib/calc/stock-transfer-tax-validate-exit";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { exitForm } from "../_helpers/exit-tax-2027-form";

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
const toggle = () => screen.getByRole("switch", { name: /납부유예 신청/ });

describe("F5 ④ — 납부유예 OFF면 이자 키를 body에서 뺀다", () => {
  const stale = { etDeferralInterestDays: "365", etDeferralInterestDailyRate: "0.000022" };

  it("OFF + 남은 값 → body에 deferralInterest* 키 없음", () => {
    const body = buildExitTaxApiBody(exitForm({ etDeferralRequested: false, ...stale })) as Record<string, unknown>;
    expect("deferralInterestDays" in body).toBe(false);
    expect("deferralInterestDailyRate" in body).toBe(false);
  });

  it("ON + 값 → body에 그대로 실린다(회귀)", () => {
    const body = buildExitTaxApiBody(exitForm({ etDeferralRequested: true, ...stale })) as Record<string, unknown>;
    expect(body.deferralInterestDays).toBe(365);
    expect(body.deferralInterestDailyRate).toBe(0.000022);
  });

  it("OFF 폼의 한쪽만 남은 이자 칸은 ⑧이 막지 않는다(숨은 값이라 body에도 없다)", () => {
    const f = exitForm({ etDeferralRequested: false, etDeferralInterestDays: "365" });
    expect(validateStep3ExitTax(f).filter((e) => e.severity === "error")).toEqual([]);
  });
});

describe("F5 ⑤ — OFF 전환 시 이자 칸도 초기화", () => {
  it("ON(일수·이율 입력) → OFF 클릭 → 사유·일수·이율이 모두 초기값", () => {
    seen.form = exitForm({
      etDeferralRequested: true,
      etDeferralReason: "study_abroad",
      etDeferralInterestDays: "365",
      etDeferralInterestDailyRate: "0.000022",
    });
    render(<Harness initial={seen.form} />);
    fireEvent.click(toggle());
    expect(seen.form.etDeferralRequested).toBe(false);
    expect(seen.form.etDeferralReason).toBe("none");
    expect(seen.form.etDeferralInterestDays).toBe("");
    expect(seen.form.etDeferralInterestDailyRate).toBe("");
  });

  it("OFF → ON 은 값을 건드리지 않는다", () => {
    seen.form = exitForm({ etDeferralRequested: false });
    render(<Harness initial={seen.form} />);
    fireEvent.click(toggle());
    expect(seen.form.etDeferralRequested).toBe(true);
    expect(seen.form.etDeferralInterestDays).toBe("");
  });
});
