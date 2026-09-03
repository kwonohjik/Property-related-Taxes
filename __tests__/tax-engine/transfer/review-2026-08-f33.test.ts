/**
 * F33 — 양도차손 조기반환 경로도 국세기본법 §47의2~§47의4 가산세를 계산·합산해야 한다.
 *
 * 근거: 「소득세법」 §92③3호 — 「양도소득 총결정세액: … 양도소득 결정세액에 제114조의2,
 * 제115조 및 「국세기본법」 제47조의2부터 제47조의4까지에 따른 가산세를 더하여 계산」.
 * 종전 조기반환(`transfer-tax.ts` transferGain ≤ 0)은 §114조의2만 싣고 국기법 가산세를
 * 통째로 버려 `penaltyDetail`이 undefined였고 `totalTax`에도 반영되지 않았다.
 *
 * 결정세액이 0이어도 base가 양수일 수 있는 축:
 *   · §47의3① 「초과신고한 환급세액」 — `filingPenaltyDetails.excessRefundAmount`
 *   · §47의4①1·2호 「납부하지 아니한 세액」 — `delayedPaymentDetails.unpaidTax`(사용자 직접 입력)
 * 조심 2012서2857(2013.2.12.) — 통산으로 세액이 소멸해도 그 이전의 과소신고·미납분 가산세는 유지된다.
 *
 * ⚠️ 지방소득세 base는 §114조의2분만이다(정상 경로 `transfer-tax-finalize.ts` STEP 10과 동일 축).
 * 기대값은 전부 엔진을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

/** §47의3①(초과환급 5천만) + §47의4①(미납 3천만 · 1년 지연) */
const PENALTY_INPUTS = {
  filingPenaltyDetails: {
    determinedTax: 0,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 50_000_000,
    interestSurcharge: 0,
    filingType: "under" as const,
    penaltyReason: "normal" as const,
  },
  delayedPaymentDetails: {
    unpaidTax: 30_000_000,
    paymentDeadline: new Date("2024-08-31"),
    actualPaymentDate: new Date("2025-08-31"),
  },
};

const lossLand = (extra: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 200_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2019-06-01"),
    transferDate: new Date("2024-06-01"),
    ...extra,
  });

describe("F33 — 양도차손 조기반환 경로의 신고불성실·납부지연 가산세", () => {
  it("차손 + 초과환급·미납 입력: 가산세가 penaltyDetail·totalTax에 실린다", () => {
    const r = calculateTransferTax(lossLand(PENALTY_INPUTS), mockRates);

    // 조기반환 경로임을 고정 (본세는 0)
    expect(r.transferGain).toBe(0);
    expect(r.determinedTax).toBe(0);
    expect(r.calculatedTax).toBe(0);

    // 본체: 종전에는 undefined / 0이었다.
    expect(r.penaltyDetail).toBeDefined();
    expect(r.penaltyDetail!.filingPenalty?.penaltyBase).toBe(50_000_000);
    expect(r.penaltyDetail!.filingPenalty?.filingPenalty).toBe(5_000_000);
    expect(r.penaltyDetail!.delayedPaymentPenalty?.delayedPaymentPenalty).toBe(2_402_400);
    expect(r.penaltyDetail!.totalPenalty).toBe(7_402_400);
    expect(r.totalTax).toBe(7_402_400);

    // 지방소득세 base는 §114조의2분만 — 국기법 가산세는 base에 들어가지 않는다.
    expect(r.penaltyTax).toBe(0);
    expect(r.localIncomeTax).toBe(0);

    // 산출근거 step도 함께 복구된다.
    const labels = r.steps.map((s) => s.label);
    expect(labels).toContain("가산세 합계");
    expect(labels).toContain("신고불성실가산세 (10%)");
    // G-03: 산정일수 364일(납부일 전날까지) · G-04: 이자율 표기를 4자리로 통일
    expect(labels).toContain("납부지연가산세 (364일 × 0.0220%)");
  });

  it("같은 가산세 입력의 이익 케이스와 값이 일치한다 (차손이라는 이유만으로 사라지지 않는다)", () => {
    const gain = calculateTransferTax(
      lossLand({ transferPrice: 600_000_000, ...PENALTY_INPUTS }),
      mockRates,
    );
    const loss = calculateTransferTax(lossLand(PENALTY_INPUTS), mockRates);

    expect(gain.determinedTax).toBe(83_990_000);
    expect(gain.penaltyDetail!.totalPenalty).toBe(7_402_400);
    expect(loss.penaltyDetail!.totalPenalty).toBe(gain.penaltyDetail!.totalPenalty);
  });

  it("납부지연만 입력한 차손: §47의4 축 단독으로도 반영된다", () => {
    const r = calculateTransferTax(
      lossLand({ delayedPaymentDetails: PENALTY_INPUTS.delayedPaymentDetails }),
      mockRates,
    );
    expect(r.penaltyDetail).toBeDefined();
    expect(r.penaltyDetail!.filingPenalty).toBeNull();
    expect(r.penaltyDetail!.totalPenalty).toBe(2_402_400);
    expect(r.totalTax).toBe(2_402_400);
  });

  it("가산세 미입력 차손: 종전 동작 보존 (penaltyDetail 없음 · totalTax 0)", () => {
    const r = calculateTransferTax(lossLand(), mockRates);
    expect(r.penaltyDetail).toBeUndefined();
    expect(r.totalTax).toBe(0);
    expect(r.steps.map((s) => s.label)).toEqual(["양도차익 계산"]);
  });
});
