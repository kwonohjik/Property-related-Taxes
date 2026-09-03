/**
 * anchor: 🔴 G-43 — 겸용주택 경로가 가산세 **산출근거**를 화면까지 승계한다
 *
 * ## 종전 결함 (표시 축. 세액은 불변이었다)
 *
 * 겸용 경로는 `calculateTransferTaxPenalty`의 결과에서 합계만 꺼내고 상세를 버렸다
 * (`transfer-tax-mixed-use-totals.ts` — `penaltyTax: penalty?.totalPenalty ?? 0` 하나뿐).
 * 결과 화면은 상세를 `penaltyDetail`에서 읽으므로
 * (`TransferTaxResultView.tsx:395` · `FilingFormTableHelpers.ts:650`),
 * 겸용주택만 **가산세 금액은 뜨는데 세율·산정일수·기준금액 행이 하나도 없었다**.
 *
 * 형제 경로는 모두 싣는다 — `transfer-tax-loss-return.ts:158` · `-normal-return.ts:120·204` ·
 * `-multi-parcel-branch.ts:309` · `-redevelopment.ts:901`. 손실 경로 주석은 상세를 버리는 것
 * 자체를 결함으로 기록해 두었다: 「종전 조기반환은 §114조의2만 싣고 국기법 가산세를 통째로
 * 버렸다 — penaltyDetail이 undefined가 되어 산출근거 표시까지 사라졌다」.
 *
 * ## 법령
 *
 * 국세기본법 §47의2~§47의4 어디에도 **양도 자산의 종류에 따른 예외가 없다**.
 * 겸용주택이라는 이유로 근거를 숨길 조문상 이유가 없다.
 */

import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  mixedUseCase14,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../_helpers/mixed-use-fixture";

const rates = makeMockRates();

/** 무신고(20%) + 납부지연 — determinedTax·unpaidTax는 엔진이 집계값으로 주입한다. */
const PENALTY = {
  filingPenaltyDetails: {
    determinedTax: 0,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "none" as const,
    penaltyReason: "normal" as const,
  },
  delayedPaymentDetails: {
    unpaidTax: 0,
    paymentDeadline: new Date("2024-08-31"),
    actualPaymentDate: new Date("2024-12-31"),
  },
};

function run(withPenalty: boolean) {
  const asset = mixedUseCase14();
  const breakdown = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    withPenalty ? { ...asset, ...PENALTY } : asset,
    rates,
  );
  return { breakdown, result: mixedUseToFilingResult(breakdown) };
}

describe("G-43 겸용주택 가산세 산출근거", () => {
  it("MP-0: 대조군 — 가산세 입력이 없으면 상세도 없다", () => {
    const { breakdown, result } = run(false);
    expect(breakdown.total.penaltyTax).toBe(0);
    expect(breakdown.total.penaltyDetail).toBeUndefined();
    expect(result.penaltyDetail).toBeUndefined();
  });

  it("MP-1: 🔴 엔진이 상세를 버리지 않는다 — 합계와 자기일관", () => {
    const { breakdown } = run(true);
    expect(breakdown.total.penaltyTax).toBeGreaterThan(0);

    const d = breakdown.total.penaltyDetail;
    expect(d, "penaltyDetail이 버려졌다").toBeDefined();
    // 세액은 penaltyTax가 정본 — 상세는 그 값을 재현해야 한다(이중 진실 방지)
    expect(d!.totalPenalty).toBe(breakdown.total.penaltyTax);
  });

  it("MP-2: 🔴 어댑터가 결과뷰 슬롯으로 승계한다 — 화면 도달", () => {
    const { breakdown, result } = run(true);
    expect(result.penaltyDetail).toBeDefined();
    expect(result.penaltyDetail!.totalPenalty).toBe(breakdown.total.penaltyTax);

    // 결과뷰가 읽는 두 축이 실제로 채워져 있다
    expect(result.penaltyDetail!.filingPenalty).not.toBeNull();
    expect(result.penaltyDetail!.delayedPaymentPenalty).not.toBeNull();
  });

  it("MP-3: 산출근거가 조문대로다 — 무신고 20% · 산정일수는 납부일 전날까지", () => {
    const { breakdown } = run(true);
    const d = breakdown.total.penaltyDetail!;

    // 국세기본법 §47의2①2호 — 무신고 일반 20%
    const fp = d.filingPenalty!;
    expect(fp.penaltyRate).toBe(0.2);
    expect(fp.penaltyBase).toBe(breakdown.total.determinedTax);
    expect(fp.filingPenalty).toBe(Math.floor(breakdown.total.determinedTax * 0.2));

    // 국세기본법 §47의4①1호 — 2024-09-01 ~ 2024-12-30 = 121일
    const dp = d.delayedPaymentPenalty!;
    expect(dp.elapsedDays).toBe(121);
    expect(dp.unpaidTax).toBe(breakdown.total.determinedTax);

    // 표시 산식이 있어야 화면에 근거가 뜬다
    expect(fp.steps.length).toBeGreaterThan(0);
    expect(dp.steps.length).toBeGreaterThan(0);
  });

  it("MP-4: ⛔ 세액은 바뀌지 않는다 — 상세는 표시 전용 echo", () => {
    const { breakdown } = run(true);
    // 총 납부세액 = 결정세액 + 지방소득세 + 가산세 + 농특세 (상세를 다시 더하지 않는다)
    expect(breakdown.total.totalPayable).toBe(
      breakdown.total.determinedTax +
        breakdown.total.localTax +
        breakdown.total.penaltyTax +
        breakdown.total.ruralSurtax,
    );
  });
});
