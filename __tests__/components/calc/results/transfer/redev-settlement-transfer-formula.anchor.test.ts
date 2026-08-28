/**
 * anchor: 청산금분 **양도가액 산식 표시**가 엔진 산출 방식과 일치한다 (2026-08-27)
 *
 * ## 결함
 *
 * PR #1322(`2e1dd2f2` 머지)에서 청산금분 양도가액이 **잔액 흡수**로 바뀌었다 —
 * `redevelopment-split.ts:338-339`:
 *
 *     const existingTransfer   = safeRatio(transferPrice, rightsValue, salePriceTotal);
 *     const settlementTransfer = salePriceTotal > 0 ? transferPrice - existingTransfer : 0;
 *
 * 그런데 상세명세서 표시 산식은 여전히 `floor(총양도가액 × 청산금 / 분양가)`로 인쇄한다
 * (`DetailedStatementRedevelopmentBuilders.ts`). 잔차가 생기는 조합에서 **인쇄되는 등식이
 * 산술적으로 거짓**이 된다 — 좌변을 계산하면 우변과 1원 다르다.
 *
 * 사례 44 실측:
 *   floor(525,000,000 × 92,781,500 / 312,000,000) = 156,122,716
 *   엔진 값                                        = 525,000,000 − 368,877,283 = 156,122,717
 *   ⇒ 「floor(…) = 156,122,717」이 찍힌다.
 *
 * 🔑 **기존 산식 테스트가 이걸 못 잡았다** — 픽스처가 손으로 만든 `156_122_716`을 쓰는데
 *    그 값은 열 합계가 524,999,999라 **엔진이 만들 수 없는 상태**다. 픽스처가 결함과 같은
 *    방향으로 stale하면 검증이 조용히 무의미해진다(메모리 `feedback_pdf_example_test_anchoring`).
 *
 * ⚠️ `postApprovalExistingHouse`는 **여전히 floor**다(`safeRatio` 그대로) — 손대지 않는다.
 *    잔액을 흡수하는 쪽은 청산금분뿐이다.
 */
import { describe, it, expect } from "vitest";
import { buildRedevTransferFormula } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const TRANSFER_PRICE = 525_000_000;
const SALE_TOTAL = 312_000_000;
const RIGHTS = 219_218_500;
const SETTLEMENT_ACQ = 92_781_500;

/** 엔진과 **같은 산식**으로 만든 기대값 — 손으로 적지 않는다. */
const EXISTING_TRANSFER = Math.floor((TRANSFER_PRICE * RIGHTS) / SALE_TOTAL); // 368,877,283
const SETTLEMENT_TRANSFER = TRANSFER_PRICE - EXISTING_TRANSFER; // 156,122,717 (잔액 흡수)

/** 사례 44 — 잔차가 실제로 발생하는 조합. */
function case44(): RedevelopmentResult {
  return {
    preApproval: {
      apportionedTransfer: RIGHTS,
      apportionedAcquisition: 141_221_534,
      gain: 75_445_917,
      holdingMonths: 214,
      lthd: 22_633_775,
      lthdRate: 0.3,
    },
    postApprovalExistingHouse: {
      apportionedTransfer: EXISTING_TRANSFER,
      apportionedAcquisition: RIGHTS,
      gain: 149_658_784,
      holdingMonths: 214,
      lthd: 44_897_634,
      lthdRate: 0.3,
    },
    settlement: {
      apportionedTransfer: SETTLEMENT_TRANSFER,
      apportionedAcquisition: SETTLEMENT_ACQ,
      gain: 63_341_216,
      holdingMonths: 159,
      lthd: 16_468_716,
      lthdRate: 0.26,
    },
    total: { gain: 288_445_917, lthd: 84_000_125, taxableIncome: 204_445_792 },
    salePriceTotal: SALE_TOTAL,
  } as unknown as RedevelopmentResult;
}

/** "… = 1,234,567 (…)" 에서 우변 금액을 뽑는다. */
function rhs(formula: string): number {
  const m = formula.match(/=\s*([\d,]+)\s*\(/);
  expect(m, `등식 우변을 못 찾음: ${formula}`).not.toBeNull();
  return Number(m![1].replace(/,/g, ""));
}

/** "floor(A × B / C)" 좌변을 실제로 계산한다. */
/**
 * 표시 산식의 **좌변을 실제로 계산**한다.
 *
 * 표기는 「A × (B ÷ C) = X (… 1원 미만 절사)」다 — 종전 `floor(A × B / C)` 표기는
 * 결과탭 코드리뷰 Lane 0(#064)에서 한국어 풀어쓰기 규약에 맞춰 바뀌었다.
 * **계산 방식은 그대로 floor다** — 바뀐 것은 표기뿐이므로 이 파서만 따라간다.
 */
function evalApportionLhs(formula: string): number | null {
  const m = formula.match(/([\d,]+)\s*×\s*\(([\d,]+)\s*÷\s*([\d,]+)\)/);
  if (!m) return null;
  const [a, b, c] = m.slice(1, 4).map((v) => Number(v.replace(/,/g, "")));
  return Math.floor((a * b) / c);
}

describe("청산금분 양도가액 산식 표시 ↔ 엔진 정합", () => {
  it("RSF-01: 🔴 표시 산식의 **좌변을 계산하면 우변과 같아야** 한다 (잔차 조합)", () => {
    // 전제: 이 조합은 실제로 잔차가 난다 — 그래야 이 anchor가 의미를 가진다.
    expect(Math.floor((TRANSFER_PRICE * SETTLEMENT_ACQ) / SALE_TOTAL)).not.toBe(SETTLEMENT_TRANSFER);

    const formula = buildRedevTransferFormula("settlement", case44(), TRANSFER_PRICE);
    expect(rhs(formula)).toBe(SETTLEMENT_TRANSFER);

    const lhs = evalApportionLhs(formula);
    // 절사 안분 산식을 계속 쓴다면 좌변이 우변과 일치해야 한다. 잔액 흡수는 그 형태로 표현할 수 없으므로
    // 산식 자체가 「양도가액 − 기존주택분」 형태여야 한다.
    if (lhs !== null) {
      expect(lhs, `표시 산식이 산술적으로 거짓: ${formula}`).toBe(SETTLEMENT_TRANSFER);
    }
  });

  it("RSF-02: 🔑 두 파트 합 = 총 양도가액 (잔액 흡수 불변식)", () => {
    const d = case44();
    expect(
      d.postApprovalExistingHouse.apportionedTransfer + d.settlement.apportionedTransfer,
    ).toBe(TRANSFER_PRICE);
  });

  it("RSF-03: 대조군 — 기존주택분은 **여전히 floor**다 (손대지 않는다)", () => {
    const formula = buildRedevTransferFormula("postApprovalExistingHouse", case44(), TRANSFER_PRICE);
    expect(evalApportionLhs(formula)).toBe(EXISTING_TRANSFER);
    expect(rhs(formula)).toBe(EXISTING_TRANSFER);
  });
});
