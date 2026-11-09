/**
 * anchor — US-29 겸용주택 경로의 지방소득세 가산세(지방세기본법 §53·§55) 배선.
 *
 * 손계산(G-43 시료: 무신고 20% + 납부지연, 기한 2024-08-31 → 납부 2024-12-31, 날짜 입력 `lateFiling` 없음)
 *  · 지방 기준 = 국세 기준(penaltyBase) × 10% (원 미만 절사) → 무신고 20% (기한 후 신고 날짜가 없어 §57② 감면 없음)
 *  · 지방 법정납부기한 = 2024-08-31 + 2개월 = 2024-10-31(목) → 다음 날 11-01 ~ 12-31 = 30 + 31 = 61일
 *  · 납부지연 = 지방 미납(국세 미납 × 10%) × 61 × 22 / 100,000
 *  totalPayable = 기존 합계 + 지방 가산세
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../_helpers/mixed-use-identity-std";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { makeMockRates } from "../_helpers/mock-rates";
import { mixedUseCase14, CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE } from "../_helpers/mixed-use-fixture";

const rates = makeMockRates();
const PENALTY = {
  filingPenaltyDetails: {
    determinedTax: 0, reductionAmount: 0, priorPaidTax: 0, originalFiledTax: 0,
    excessRefundAmount: 0, interestSurcharge: 0, filingType: "none" as const, penaltyReason: "normal" as const,
  },
  delayedPaymentDetails: {
    unpaidTax: 0,
    paymentDeadline: new Date("2024-08-31"),
    actualPaymentDate: new Date("2024-12-31"),
  },
};
const run = (on: boolean) => {
  const a = mixedUseCase14();
  return calcMixedUseTransferTax(CASE14_TRANSFER_PRICE, CASE14_TRANSFER_DATE, on ? { ...a, ...PENALTY } : a, rates);
};

describe("US-29 겸용주택 지방소득세 가산세", () => {
  it("MU-0: 가산세 OFF — 키 없음", () => {
    expect(run(false).total.localIncomePenalty).toBeUndefined();
  });
  it("MU-1: 지방 무신고 20% + 납부지연 61일 — 손계산과 일치, totalPayable에 가산", () => {
    const off = run(false);
    const on = run(true);
    const pd = on.total.penaltyDetail!;
    const localFilingBase = Math.floor(pd.filingPenalty!.penaltyBase / 10);
    const localUnpaid = Math.floor(pd.delayedPaymentPenalty!.unpaidTax / 10);
    const filing = Math.floor(localFilingBase * 0.2);
    const delayed = Math.floor((localUnpaid * 61 * 22) / 100_000);
    const l = on.total.localIncomePenalty!;
    expect(l.filing!.penalty).toBe(filing);
    expect(l.delayed).toMatchObject({ localDeadline: "2024-10-31", days: 61 });
    expect(l.delayed!.penalty).toBe(delayed);
    expect(l.total).toBe(filing + delayed);
    expect(on.total.localTax).toBe(off.total.localTax); // 본세 불변
    expect(on.total.totalPayable).toBe(off.total.totalPayable + on.total.penaltyTax + l.total);
  });
  it("MU-2: 어댑터가 결과뷰 슬롯으로 승계하고 totalTax와 자기일관", () => {
    const on = run(true);
    const r = mixedUseToFilingResult(on);
    expect(r.localIncomePenalty?.total).toBe(on.total.localIncomePenalty!.total);
    expect(r.totalTax).toBe(on.total.totalPayable);
  });
});
