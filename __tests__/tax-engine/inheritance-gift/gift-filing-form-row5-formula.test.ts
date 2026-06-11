/**
 * 별지 10호 ⑤ 합산과세표준 formula 표시 정합 anchor (R2 리뷰 후속)
 *
 * 배경: 종전 formula "① + ③ − ④"가 비과세(§46)·감정평가수수료(§55①) 차감을
 * 생략 — ①은 비과세 차감 전 가액이므로 비과세가 있으면 사용자가 formula대로
 * 계산 시 amount(엔진 taxBase)와 불일치했다. 표시 문자열만의 문제(amount는 정확).
 *
 * 정합 산식: ⑤ = (① − 비과세) − ② + ③ − ④ − 감정평가수수료
 * 표기 규칙: 비과세·수수료가 0이면 해당 항 생략 → "① − ② + ③ − ④"
 */
import { describe, it, expect } from "vitest";
import { buildFilingFormRows } from "@/lib/tax-engine/gift-filing-form-rows";

const BASE = {
  grossGiftValue: 300_000_000,
  debtAmount: 0,
  priorTotal: 0,
  totalDeduction: 50_000_000,
  taxBase: 250_000_000,
  bracketRateLabel: "20%",
  computedTax: 40_000_000,
  generationSkipDetail: null,
  priorGiftCreditDetail: null,
  reportingCredit: 1_200_000,
  finalTax: 38_800_000,
  hasPriorGifts: false,
};

function row5(rows: ReturnType<typeof buildFilingFormRows>) {
  const r = rows.find((x) => x.number === "⑤");
  expect(r).toBeDefined();
  return r!;
}

describe("별지 10호 ⑤ formula 표시 정합", () => {
  it("F5-1: 비과세·수수료 없음 → '① − ② + ③ − ④'", () => {
    const rows = buildFilingFormRows({ ...BASE });
    expect(row5(rows).formula).toBe("① − ② + ③ − ④");
  });

  it("F5-2: 비과세 있음 → '① − 비과세재산가액 − ② + ③ − ④'", () => {
    const rows = buildFilingFormRows({ ...BASE, exemptTotal: 10_000_000 });
    expect(row5(rows).formula).toBe("① − 비과세재산가액 − ② + ③ − ④");
  });

  it("F5-3: 감정평가수수료 있음 → '① − ② + ③ − ④ − 감정평가수수료'", () => {
    const rows = buildFilingFormRows({ ...BASE, appraisalFeeTotal: 5_000_000 });
    expect(row5(rows).formula).toBe("① − ② + ③ − ④ − 감정평가수수료");
  });

  it("F5-4: 비과세 + 수수료 동시 → 양쪽 모두 표기", () => {
    const rows = buildFilingFormRows({
      ...BASE,
      exemptTotal: 10_000_000,
      appraisalFeeTotal: 5_000_000,
    });
    expect(row5(rows).formula).toBe(
      "① − 비과세재산가액 − ② + ③ − ④ − 감정평가수수료",
    );
  });

  it("F5-5: exemptTotal=0 명시 전달 → 생략 (양수만 표기)", () => {
    const rows = buildFilingFormRows({ ...BASE, exemptTotal: 0, appraisalFeeTotal: 0 });
    expect(row5(rows).formula).toBe("① − ② + ③ − ④");
  });
});
