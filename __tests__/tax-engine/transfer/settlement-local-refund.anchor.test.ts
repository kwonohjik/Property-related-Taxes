/**
 * anchor: §111③ 정산 — 지방소득세 환급도 결과에 남는다 (2026-09-05 · 코드리뷰 Q27)
 *
 * ## 종전 결함 — 환급이 통째로 사라졌다
 *
 * 국세에는 `settlementRefund`가 있었지만 지방에는 **환급 필드 자체가 없었다**.
 * `settlementLocalPayable = max(0, 지방결정 − 지방기납부)`가 0으로 clamp되므로,
 * 기납부가 결정세액을 넘으면 지방분 환급액이 결과 화면에도 신고서 표에도 남지 않았다.
 *
 * 별지 제84호서식의 해당 칸은 「차감납부할세액(**환급세액**)」 **한 칸**이다 —
 * 행을 늘리지 않고 부호로 표현하므로(음수 = 환급), 표시부가 `payable − refund`를 쓴다.
 * 그러려면 엔진이 두 값을 **대칭으로** 실어야 한다.
 */
import { describe, it, expect } from "vitest";
import { computeSettlement } from "../../../lib/tax-engine/transfer-tax-settlement";

const BASE = {
  determinedTax: 10_000_000,
  penaltyTax: 0,
  localIncomeTax: 1_000_000,
  priorPaidTax: 0,
  priorPaidLocalTax: 0,
};

describe("computeSettlement — 지방소득세 환급 (§111③)", () => {
  it("🔴 지방 기납부 > 지방 결정 → settlementLocalRefund에 차액이 남는다", () => {
    const r = computeSettlement({ ...BASE, priorPaidLocalTax: 1_500_000 });
    expect(r.settlementLocalPayable).toBe(0); // clamp — 여기까지가 종전 전부였다
    expect(r.settlementLocalRefund).toBe(500_000);
  });

  it("표시부가 쓰는 부호 있는 정산액 = payable − refund (한 칸 서식)", () => {
    const refundCase = computeSettlement({ ...BASE, priorPaidLocalTax: 1_500_000 });
    expect(refundCase.settlementLocalPayable - refundCase.settlementLocalRefund).toBe(-500_000);

    const payCase = computeSettlement({ ...BASE, priorPaidLocalTax: 400_000 });
    expect(payCase.settlementLocalPayable - payCase.settlementLocalRefund).toBe(600_000);
  });

  it("국세와 대칭 — 둘 중 하나는 항상 0이다", () => {
    for (const priorPaidLocalTax of [0, 400_000, 1_000_000, 1_500_000]) {
      const r = computeSettlement({ ...BASE, priorPaidLocalTax });
      expect(
        Math.min(r.settlementLocalPayable, r.settlementLocalRefund),
        `기납부 ${priorPaidLocalTax}`,
      ).toBe(0);
    }
  });

  it("대조군 — 기납부가 결정세액과 같으면 양쪽 0 (환급도 납부도 없다)", () => {
    const r = computeSettlement({ ...BASE, priorPaidLocalTax: 1_000_000 });
    expect(r.settlementLocalPayable).toBe(0);
    expect(r.settlementLocalRefund).toBe(0);
  });

  it("settlementTotalDue는 clamp된 납부액만 더한다 (환급은 합계에 섞지 않는다)", () => {
    const r = computeSettlement({ ...BASE, priorPaidTax: 0, priorPaidLocalTax: 1_500_000 });
    expect(r.settlementTotalDue).toBe(r.settlementAdditionalPayable + r.settlementLocalPayable);
    expect(r.settlementTotalDue).toBe(10_000_000);
  });
});
