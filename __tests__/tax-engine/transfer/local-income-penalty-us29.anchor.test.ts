/**
 * anchor — US-29 양도소득분 개인지방소득세 가산세(지방세기본법 §53 무신고 · §54 과소신고 · §55 납부지연 · §57② 감면).
 *
 * 값은 엔진 출력이 아니라 손계산(각 케이스 주석)으로 먼저 정했다.
 * 법령(원문 실독 2026-11-10): 지방세기본법 MST 290139 · 시행령 §34① MST 290497 · 지방세법 §103의5①·§103의7① MST 282559.
 *  · 지방 법정기한 = 국세 기한 + 2개월 → 지방세기본법 §24①(토·일·공휴일이면 다음 날)
 *  · §55①1호 일수 = 법정납부기한의 다음 날부터 자진납부일까지(납부일 포함), 1일 10만분의 22, 미납세액의 75% 한도
 *  · §57② 1호(수정신고 90/75/50/30/20/10%) · 2호(기한 후 신고 50/30/20%) · 4호(예정신고 이후 확정신고기한까지 50%)
 * 설계 가정: 지방소득세를 국세와 같은 날 신고·납부 / 기준세액 = 국세 기준 × 10% / 끝수 원 미만 절사.
 */
import { describe, it, expect } from "vitest";
import {
  computeLocalIncomePenalty,
  computeLocalDelayedPenalty,
  computeAmendmentLocalPenalty,
  localDeadlineOf,
  localIncomePenaltySteps,
  resolveLocalNonFilingReduction,
} from "@/lib/tax-engine/transfer-tax-local-income-penalty";
import { calculateTransferTaxPenalty, type FilingPenaltyInput } from "@/lib/tax-engine/transfer-tax-penalty";
import { computeAmendment } from "@/lib/tax-engine/transfer-tax-amendment";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate, type AggregateTransferInput, type TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const rates = makeMockRates();

const FILING_NONE: FilingPenaltyInput = {
  determinedTax: 30_235_000,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
  filingType: "none",
  penaltyReason: "normal",
  lateFiling: {
    statutoryDeadline: D("2026-05-31"),
    actualFilingDate: D("2027-05-31"),
    finalReturnDeadline: D("2027-05-31"),
  },
};
const DELAYED_S = {
  unpaidTax: 30_235_000,
  paymentDeadline: D("2026-05-31"),
  actualPaymentDate: D("2027-05-31"),
};

describe("US-29 지방 법정기한 — 국세 기한 + 2개월 → 지방세기본법 §24①", () => {
  it("L-1: 2026-05-31 + 2개월 = 2026-07-31(금) — 연장 없음", () => {
    const r = localDeadlineOf(D("2026-05-31"));
    expect(iso(r.end)).toBe("2026-07-31");
    expect(r.extended).toBe(false);
  });
  it("L-2: 2027-05-31 + 2개월 = 2027-07-31(토) → 2027-08-02(월)", () => {
    const r = localDeadlineOf(D("2027-05-31"));
    expect(iso(r.end)).toBe("2027-08-02");
    expect(r.extended).toBe(true);
  });
  it("L-3: 2025-06-15 + 2개월 = 2025-08-15(광복절·금) → 토 → 2025-08-18(월)", () => {
    expect(iso(localDeadlineOf(D("2025-06-15")).end)).toBe("2025-08-18");
  });
  it("L-4: 해당 일이 없으면 말일 — 2026-12-31 + 2개월 = 2027-02-28(일) → 03-01(월·삼일절) → 2027-03-02(화)", () => {
    expect(iso(localDeadlineOf(D("2026-12-31")).end)).toBe("2027-03-02");
  });
});

describe("US-29 앵커 S — 무신고 · 2027-05-31 신고·납부 (리뷰 사례)", () => {
  /*
   * 손계산: 결정세액 30,235,000 → 지방 기준 3,023,500
   *  무신고 20% = 604,700. 지방 예정기한 2026-07-31, 확정기한 2027-08-02. 신고일 2027-05-31은 확정기한 이내 → §57②4호가목 50%.
   *   (2호 기한 후 신고는 예정기한+6개월=2027-01-31 초과라 해당 없음) → 604,700 − 302,350 = 302,350
   *  납부지연: 2026-08-01 ~ 2027-05-31 = 304일 → 3,023,500 × 304 × 22 / 100,000 = 202,211.68 → 202,211 (75% 한도 2,267,625 이내)
   *  합계 504,561
   */
  const pen = calculateTransferTaxPenalty({ filing: FILING_NONE, delayedPayment: DELAYED_S });
  const local = computeLocalIncomePenalty(FILING_NONE, pen)!;

  it("S-1: 무신고가산세 302,350 (감면 50% · 4호가목)", () => {
    expect(local.filing).toMatchObject({
      kind: "non_filing",
      base: 3_023_500,
      grossPenalty: 604_700,
      reductionRate: 0.5,
      reductionAmount: 302_350,
      penalty: 302_350,
    });
    expect(local.filing!.reductionBasis).toBe("지방세기본법 §57②4호가목");
    expect(local.localPreliminaryDeadline).toBe("2026-07-31");
    expect(local.localFinalDeadline).toBe("2027-08-02");
  });
  it("S-2: 납부지연가산세 202,211 · 304일 · 지방 법정납부기한 2026-07-31", () => {
    expect(local.delayed).toMatchObject({
      unpaidLocalTax: 3_023_500,
      localDeadline: "2026-07-31",
      days: 304,
      penalty: 202_211,
      capApplied: false,
    });
  });
  it("S-3: 합계 504,561 · 총부담 48,694,218 + 504,561 = 49,198,779", () => {
    expect(local.total).toBe(504_561);
    expect(48_694_218 + local.total).toBe(49_198_779);
  });
  it("S-4: 산출근거 단계 — 합계 + 무신고 + 납부지연", () => {
    const steps = localIncomePenaltySteps(local);
    expect(steps.map((s) => s.label)).toEqual([
      "지방소득세 가산세",
      "지방소득세 무신고가산세",
      "지방소득세 납부지연가산세 (304일)",
    ]);
    expect(steps[0].amount).toBe(504_561);
    expect(steps[2].formula).toContain("3,023,500 × 304일 × 0.022%");
  });
  it("S-5: 감면 없는 같은 자산(기한 후 날짜 입력 없음) — 무신고 604,700 그대로", () => {
    const f = { ...FILING_NONE, lateFiling: undefined };
    const l = computeLocalIncomePenalty(f, calculateTransferTaxPenalty({ filing: f, delayedPayment: DELAYED_S }))!;
    expect(l.filing!.penalty).toBe(604_700);
    expect(l.total).toBe(604_700 + 202_211);
  });
  it("S-6: 가산세 입력이 없으면 undefined (기존 결과 불변)", () => {
    expect(computeLocalIncomePenalty(undefined, undefined)).toBeUndefined();
  });
});

describe("US-29 수정신고 v2 — 당초 20,000,000 → 30,235,000, 수정신고·납부 2027-11-30", () => {
  /*
   * 손계산: 추가 본세 10,235,000 → 지방 1,023,500. 지방 확정기한 2027-08-02(2027-07-31 토 → §24①).
   *  §54① 10% = 102,350. 수정신고 2027-11-30: 기한+3개월=2027-11-02 초과, +6개월=2028-02-02 이내 → §57②1호다목 50% → 51,175
   *  §55 납부지연: 2027-08-03 ~ 2027-11-30 = 120일 → 1,023,500 × 120 × 22 / 100,000 = 27,020.4 → 27,020
   *  합 78,195
   */
  const base = {
    originalDeterminedTax: 20_000_000,
    applyUnderReportingPenalty: true,
    underReportingReason: "normal" as const,
    underReductionMode: "auto_48_2" as const,
    statutoryFilingDeadline: D("2027-05-31"),
    amendedFilingDate: D("2027-11-30"),
    applyLatePaymentPenalty: true,
    amendedPaymentDate: D("2027-11-30"),
  };
  it("A-1: 102,350 → 51,175 · 27,020 · 합 78,195", () => {
    const d = computeAmendment(base, 30_235_000);
    const l = d.localIncomePenalty!;
    expect(l.filing).toMatchObject({ base: 1_023_500, grossPenalty: 102_350, reductionRate: 0.5, penalty: 51_175 });
    expect(l.filing!.reductionBasis).toBe("지방세기본법 §57②1호다목");
    expect(l.delayed).toMatchObject({ days: 120, localDeadline: "2027-08-02", penalty: 27_020 });
    expect(l.total).toBe(78_195);
    // 국세 총 납부세액·추가 지방소득세는 불변
    expect(d.additionalLocalIncomeTax).toBe(1_023_500);
    expect(d.steps.some((s) => s.label === "지방소득세 가산세" && s.amount === 78_195)).toBe(true);
  });
  it("A-2: 가산세 선택이 모두 꺼져 있으면 키가 없다", () => {
    const d = computeAmendment({ ...base, applyUnderReportingPenalty: false, applyLatePaymentPenalty: false }, 30_235_000);
    expect(d.localIncomePenalty).toBeUndefined();
  });
  it("A-3: 수정신고일이 지방 법정신고기한 이내(국세 기한은 도과) — 과소신고·납부지연 모두 0", () => {
    const l = computeAmendment({ ...base, amendedFilingDate: D("2027-07-15"), amendedPaymentDate: D("2027-07-15") }, 30_235_000).localIncomePenalty!;
    expect(l.filing).toBeUndefined();
    expect(l.delayed!.penalty).toBe(0);
    expect(l.total).toBe(0);
  });
  it("A-4: §57②1호 계단 경계 — 기한 2027-08-02 + 1개월 = 09-02(가목 90%) / 09-03(나목 75%)", () => {
    const at = (s: string) => computeAmendmentLocalPenalty({
      additionalTax: 10_235_000, applyUnderReportingPenalty: true, underReportingReason: "normal", underExempt: false,
      autoReduction: true, nationalDeadline: D("2027-05-31"), amendedFilingDate: D(s), applyLatePaymentPenalty: false,
    })!.filing!;
    expect(at("2027-09-02")).toMatchObject({ reductionRate: 0.9, reductionAmount: 92_115, penalty: 10_235 });
    expect(at("2027-09-03")).toMatchObject({ reductionRate: 0.75, reductionAmount: 76_762, penalty: 25_588 });
    expect(at("2027-11-02").reductionRate).toBe(0.75); // +3개월
    expect(at("2027-11-03").reductionRate).toBe(0.5);
    expect(at("2028-02-02").reductionRate).toBe(0.5); // +6개월
    expect(at("2028-02-03").reductionRate).toBe(0.3);
    expect(at("2029-08-02").reductionRate).toBe(0.1); // +24개월
    expect(at("2029-08-03")).toMatchObject({ reductionRate: 0, penalty: 102_350 }); // 2년 초과
  });
  it("A-5: 경정 예고 후 수정신고면 감면 없음", () => {
    const l = (o: object) => computeAmendment({ ...base, ...o }, 30_235_000).localIncomePenalty!.filing!;
    expect(l({ priorAssessmentNotified: true })).toMatchObject({ reductionRate: 0, penalty: 102_350 });
  });
  it("A-6: 정당한 사유 면제(exempt)면 지방 과소신고가산세도 부과하지 않는다", () => {
    const d = computeAmendment({ ...base, underReductionMode: "exempt" }, 30_235_000);
    expect(d.localIncomePenalty!.filing).toBeUndefined();
    expect(d.localIncomePenalty!.delayed!.penalty).toBe(27_020);
  });
});

describe("US-29 납부지연가산세 §55 — 일수·이자율 구간·한도", () => {
  it("D-1: 납부일이 지방 기한과 같으면 0일, 다음 날이면 1일(납부일 포함) — 3,023,500 × 1 × 22 / 100,000 = 665", () => {
    const r0 = computeLocalDelayedPenalty({ unpaidLocalTax: 3_023_500, nationalDeadline: D("2026-05-31"), paymentDate: D("2026-07-31") });
    const r1 = computeLocalDelayedPenalty({ unpaidLocalTax: 3_023_500, nationalDeadline: D("2026-05-31"), paymentDate: D("2026-08-01") });
    expect(r0).toMatchObject({ days: 0, penalty: 0 });
    expect(r1).toMatchObject({ days: 1, penalty: 665 });
  });
  it("D-2: 2022-06-07 전후 구간 — 기한 2022-02-28, 납부 2022-07-07, 1,000만원: 98일 × 25 + 31일 × 22 = 245,000 + 68,200", () => {
    const r = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2021-12-31"), paymentDate: D("2022-07-07") });
    expect(r.breakdown).toEqual([
      { ratePer100k: 25, days: 98, amount: 245_000 },
      { ratePer100k: 22, days: 31, amount: 68_200 },
    ]);
    expect(r.days).toBe(129);
    expect(r.penalty).toBe(313_200);
  });
  it("D-3: 2018년 기한 — 1만분의 3(10만분의 30): 기한 2018-05-31, 납부 2018-06-30 = 30일 → 1,000만원 × 30 × 30 / 100,000 = 90,000", () => {
    // W2 정정: 2020-03-01 전 국세 기한은 지방 기한이 +2개월이 아니라 같은 날이다(지방세법 §103의5①·§103의7① 2018 시행본).
    // 종전 입력은 국세 기한 2018-03-31 + 2개월이었다 — 지방 기한 2018-05-31이 되도록 국세 기한을 2018-05-31로 둔다(값 불변).
    const r = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2018-05-31"), paymentDate: D("2018-06-30") });
    expect(r.breakdown).toEqual([{ ratePer100k: 30, days: 30, amount: 90_000 }]);
    expect(r.penalty).toBe(90_000);
  });
  it("D-4: 2016-12-31 기한은 이제 산정한다(W2, 종전엔 unsupportedPeriod) — 1만분의 3", () => {
    // 지방 기한 = 소득세 기한 같은 날 2016-12-31(토) → §24① 2017-01-02(월, 임시공휴일은 공휴일 표 밖). 다음 날 01-03 ~ 2017-06-30 = 179일
    // 1,000만원 × 179 × 30 / 100,000 = 537,000
    const r = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2016-12-31"), paymentDate: D("2017-06-30") });
    expect(r.unsupportedPeriod).toBeUndefined();
    expect(r.localDeadline).toBe("2017-01-02");
    expect(r.breakdown).toEqual([{ ratePer100k: 30, days: 179, amount: 537_000 }]);
    expect(r.penalty).toBe(537_000);
  });
  it("D-5: 미납세액의 75% 한도", () => {
    const r = computeLocalDelayedPenalty({ unpaidLocalTax: 1_000_000, nationalDeadline: D("2022-12-31"), paymentDate: D("2035-01-01") });
    expect(r.rawPenalty).toBeGreaterThan(750_000);
    expect(r).toMatchObject({ capApplied: true, capAmount: 750_000, penalty: 750_000 });
  });
});

describe("US-29 무신고 §57② 감면 — 2호 계단과 4호가목", () => {
  const red = (filing: string, withFinal = true) =>
    resolveLocalNonFilingReduction({
      prelimDeadline: D("2026-07-31"),
      finalDeadline: withFinal ? D("2027-08-02") : undefined,
      filingDate: D(filing),
    });
  it("R-1: 기한 내 신고는 무신고가 아니다", () => {
    expect(red("2026-07-31").rate).toBe(0);
  });
  it("R-2: 4호 없이 2호만 — 1개월(08-31) 50% / 3개월(10-31) 30% / 6개월(2027-01-31) 20% / 초과 0", () => {
    expect(red("2026-08-31", false)).toMatchObject({ rate: 0.5, ref: "지방세기본법 §57②2호가목" });
    expect(red("2026-09-01", false)).toMatchObject({ rate: 0.3, ref: "지방세기본법 §57②2호나목" });
    expect(red("2026-10-31", false).rate).toBe(0.3);
    expect(red("2026-11-01", false)).toMatchObject({ rate: 0.2, ref: "지방세기본법 §57②2호다목" });
    expect(red("2027-01-31", false).rate).toBe(0.2);
    expect(red("2027-02-01", false).rate).toBe(0);
  });
  it("R-3: 4호가목 — 지방 확정신고기한(2027-08-02)까지는 50%, 하루 지나면 0", () => {
    expect(red("2027-08-02")).toMatchObject({ rate: 0.5, ref: "지방세기본법 §57②4호가목" });
    expect(red("2027-08-03").rate).toBe(0);
    // 국세 확정기한(2027-05-31)과 지방 확정기한(2027-08-02) 사이 신고도 4호 대상이다
    expect(red("2027-06-15").rate).toBe(0.5);
  });
  it("R-4: 경정할 것을 미리 알고 신고하면 감면 없음", () => {
    expect(resolveLocalNonFilingReduction({ prelimDeadline: D("2026-07-31"), finalDeadline: D("2027-08-02"), filingDate: D("2026-08-15"), notified: true }).rate).toBe(0);
  });
});

describe("US-29 부정행위·과소신고(원 신고 경로)", () => {
  it("F-1: 무신고 부정행위 40% — 지방 기준 3,023,500 × 40% = 1,209,400 (감면 없음 입력)", () => {
    const f: FilingPenaltyInput = { ...FILING_NONE, lateFiling: undefined, penaltyReason: "fraudulent" };
    const l = computeLocalIncomePenalty(f, calculateTransferTaxPenalty({ filing: f }))!;
    expect(l.filing).toMatchObject({ rate: 0.4, grossPenalty: 1_209_400, penalty: 1_209_400 });
  });
  it("F-2: 과소신고 10% — 결정 30,000,000 − 당초신고 20,000,000 = 1,000만 → 지방 100만 × 10% = 100,000", () => {
    const f: FilingPenaltyInput = { ...FILING_NONE, determinedTax: 30_000_000, originalFiledTax: 20_000_000, filingType: "under", lateFiling: undefined };
    const l = computeLocalIncomePenalty(f, calculateTransferTaxPenalty({ filing: f }))!;
    expect(l.filing).toMatchObject({ kind: "under_filing", base: 1_000_000, penalty: 100_000 });
  });
  it("F-3: 과소신고 가목·나목 — 부정분 400만 · 나머지 600만 → 지방 40만 × 40% + 60만 × 10% = 160,000 + 60,000", () => {
    const f: FilingPenaltyInput = {
      ...FILING_NONE, determinedTax: 30_000_000, originalFiledTax: 20_000_000, filingType: "under",
      penaltyReason: "fraudulent", fraudulentPortion: 4_000_000, lateFiling: undefined,
    };
    const l = computeLocalIncomePenalty(f, calculateTransferTaxPenalty({ filing: f }))!;
    expect(l.filing).toMatchObject({ fraudBase: 400_000, normalBase: 600_000, penalty: 220_000 });
  });
  it("F-5: 국세 예정신고기한(2026-05-31)은 넘겼지만 지방 예정신고기한(2026-07-31) 이내(2026-07-15) 신고·납부 — 지방 가산세 0", () => {
    const f: FilingPenaltyInput = {
      ...FILING_NONE,
      lateFiling: { statutoryDeadline: D("2026-05-31"), actualFilingDate: D("2026-07-15"), finalReturnDeadline: D("2027-05-31") },
    };
    const pen = calculateTransferTaxPenalty({
      filing: f,
      delayedPayment: { unpaidTax: 30_235_000, paymentDeadline: D("2026-05-31"), actualPaymentDate: D("2026-07-15") },
    });
    expect(pen.totalPenalty).toBeGreaterThan(0); // 국세는 기한 후 신고·납부 — 국세 가산세는 있다
    const l = computeLocalIncomePenalty(f, pen)!;
    expect(l.filing).toBeUndefined();
    expect(l.delayed!.penalty).toBe(0);
    expect(l.total).toBe(0);
  });
  it("F-4: 정상 신고(correct) + 납부지연만 — 무신고·과소신고 없이 납부지연만", () => {
    const f: FilingPenaltyInput = { ...FILING_NONE, filingType: "correct", lateFiling: undefined };
    const l = computeLocalIncomePenalty(f, calculateTransferTaxPenalty({ filing: f, delayedPayment: DELAYED_S }))!;
    expect(l.filing).toBeUndefined();
    expect(l.total).toBe(202_211);
  });
});

describe("US-29 경로별 배선 — 총 납부세액에 가산", () => {
  it("W-1 재개발 경로(사례 44): 국세 가산세 11,167,322 위에 지방 20% 1,116,732 — 총 72,587,597 → 73,704,329", async () => {
    const { case44RedevelopmentInfo } = await import("../transfer-tax/redevelopment/_helpers");
    const filing: FilingPenaltyInput = {
      determinedTax: 55_836_614, reductionAmount: 0, priorPaidTax: 0, originalFiledTax: 0,
      excessRefundAmount: 0, interestSurcharge: 0, filingType: "none", penaltyReason: "normal",
    };
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt", transferPrice: 525_000_000, transferDate: new Date("2026-02-16"),
        acquisitionDate: new Date("2005-04-09"), acquisitionPrice: 0, expenses: 0, useEstimatedAcquisition: true,
        isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
        redevelopment: case44RedevelopmentInfo(), filingPenaltyDetails: filing,
      }),
      rates,
    );
    // 55,836,614 × 10% = 5,583,661.4 → 5,583,661 × 20% = 1,116,732.2 → 1,116,732
    expect(r.localIncomePenalty?.total).toBe(1_116_732);
    expect(r.localIncomeTax).toBe(5_583_661); // 본세는 불변
    expect(r.totalTax).toBe(72_587_597 + 1_116_732);
  });

  it("W-2 단건 정상 경로: 가산세 OFF면 키 없음 · ON이면 totalTax = 구성요소 합", () => {
    const taxable = {
      propertyType: "land" as const, transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
      isOneHousehold: false, householdHousingCount: 0,
    };
    const off = calculateTransferTax(baseTransferInput(taxable), rates);
    expect(off.determinedTax).toBeGreaterThan(0);
    expect(off.localIncomePenalty).toBeUndefined();
    const filing: FilingPenaltyInput = {
      determinedTax: off.determinedTax, reductionAmount: 0, priorPaidTax: 0, originalFiledTax: 0,
      excessRefundAmount: 0, interestSurcharge: 0, filingType: "none", penaltyReason: "normal",
    };
    const on = calculateTransferTax(baseTransferInput({ ...taxable, filingPenaltyDetails: filing }), rates);
    // 단건 입력은 determinedTax를 그대로 쓴다 — 기준 = 결정세액의 10% × 20%
    const expected = Math.floor(Math.floor(off.determinedTax * 0.1) * 0.2);
    expect(on.localIncomePenalty?.total).toBe(expected);
    expect(on.totalTax).toBe(on.determinedTax + on.localIncomeTax + on.penaltyDetail!.totalPenalty + expected);
  });

  it("W-3 다건 집계(자산별): 기준 1억 → 국세 무신고 2,000만 + 지방 1,000만 × 20% = 200만 → 총액 차이 22,000,000", () => {
    const mk = (extra: Partial<TransferTaxItemInput>): AggregateTransferInput => ({
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          ...(baseTransferInput() as unknown as TransferTaxItemInput),
          propertyId: "A", propertyLabel: "토지 A",
          propertyType: "land", transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
          acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
          isOneHousehold: false, householdHousingCount: 0,
          ...extra,
        },
      ],
    });
    const r0 = calculateTransferTaxAggregate(mk({}), rates);
    const r1 = calculateTransferTaxAggregate(
      mk({
        filingPenaltyDetails: {
          determinedTax: 100_000_000, reductionAmount: 0, priorPaidTax: 0, originalFiledTax: 0,
          excessRefundAmount: 0, interestSurcharge: 0, filingType: "none", penaltyReason: "normal",
        },
      }),
      rates,
    );
    expect(r0.localIncomePenalty).toBeUndefined();
    expect(r1.localIncomePenalty).toBe(2_000_000);
    expect(r1.properties[0].localIncomePenalty?.total).toBe(2_000_000);
    expect(r1.totalTax - r0.totalTax).toBe(20_000_000 + 2_000_000);
  });
});
