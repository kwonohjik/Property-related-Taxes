/**
 * anchor — US-29 후속 W2: 지방소득세 가산세 2014~2017 기한 산정 + 2014 전 미산정 + 시기별 연혁.
 *
 * 값은 엔진 출력이 아니라 손계산(각 케이스 주석, 일수는 달력 계산)으로 먼저 정했다.
 * 법령(원문 실독 2026-11-10, 과거 시행본 efYd + 부칙): 지방세기본법 2014-01-01·2015-05-18·2016-01-01·2017-07-26·2018-01-01·2020-01-01 시행본,
 * 시행령 §33(2014-01-01·2015-05-18)·§34(2017-03-28·2018-01-01·2019-01-01) + 부칙, 지방세법 §103의5·§103의7 2014~2021 시행본 + 2019.12.31. 부칙.
 *  · 지방 법정기한이 2014-01-01 전 → 소득세 부가세 체계, 독립 가산세 미산정(고지)
 *  · 국세 기한 2020-03-01 전 → 지방 기한 = 소득세 기한 같은 날(+2개월 없음) · 이후 → +2개월
 *  · 납부불성실 이자율 1일 1만분의 3(10만분의 30) — 사유 발생 2019-01-01 전, 2022-06-07 이후 기간분 10만분의 22
 *  · 75% 한도: 부과일 2015-05-18 이후만
 *  · 감면 §57② 계단: 신고일 2017-03-28 전 / ~2019-12-31 / 2020-01-01 이후, 4호는 확정신고기한 2018-01-01 이후
 */
import { describe, it, expect } from "vitest";
import {
  computeAmendmentLocalPenalty,
  computeLocalDelayedPenalty,
  computeLocalIncomePenalty,
  localDeadlineOf,
  localIncomePenaltySteps,
  resolveLocalAmendmentReduction,
  resolveLocalNonFilingReduction,
} from "@/lib/tax-engine/transfer-tax-local-income-penalty";
import { calculateTransferTaxPenalty, type FilingPenaltyInput } from "@/lib/tax-engine/transfer-tax-penalty";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

const NONE = (statutory: string, actual: string, final = statutory): FilingPenaltyInput => ({
  determinedTax: 30_235_000,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
  filingType: "none",
  penaltyReason: "normal",
  lateFiling: { statutoryDeadline: D(statutory), actualFilingDate: D(actual), finalReturnDeadline: D(final) },
});

describe("W2 지방 법정기한 — 국세 기한 2020-03-01 전은 같은 날, 이후는 +2개월", () => {
  it("K-1: 2018-05-31 → 2018-05-31(+2개월 없음)", () => {
    expect(iso(localDeadlineOf(D("2018-05-31")).end)).toBe("2018-05-31");
  });
  it("K-2: 경계 — 2020-02-28(금)은 같은 날, 2020-03-02(월)는 +2개월 = 2020-05-02(토) → 05-04(월)", () => {
    expect(iso(localDeadlineOf(D("2020-02-28")).end)).toBe("2020-02-28");
    expect(iso(localDeadlineOf(D("2020-03-02")).end)).toBe("2020-05-04");
  });
  it("K-3: 토요일이면 §24① 다음 평일 — 2014-05-31(토) → 2014-06-02(월)", () => {
    const r = localDeadlineOf(D("2014-05-31"));
    expect(iso(r.end)).toBe("2014-06-02");
    expect(r.extended).toBe(true);
  });
});

describe("W2 납부지연가산세 — 2014~2017 기한 산정", () => {
  it("P-1: 2017 기한이 2018-01-01을 걸침 — 기한 2017-05-31(수), 납부 2018-03-31: 6/1~3/31 = 304일 → 1,000만원 × 304 × 30 / 100,000 = 912,000 (단일 구간 — 시행령 §34는 2018.1.1. 문구만 바뀌어 이자율 경계 아님)", () => {
    const r = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2017-05-31"), paymentDate: D("2018-03-31") });
    expect(r.breakdown).toEqual([{ ratePer100k: 30, days: 304, amount: 912_000 }]);
    expect(r).toMatchObject({ days: 304, penalty: 912_000, capApplied: false, capInEffect: true });
    expect(r.basis).toBe("지방세기본법 §55 · 지방세기본법 시행령 §34①");
  });
  it("P-2: 2016 기한 → 2022 납부(30 → 22 구간) — 기한 2016-05-31(화), 납부 2022-06-30: 30구간 2016-06-01~2022-06-06 = 2,197일 × 3,000 = 6,591,000 + 22구간 06-07~06-30 = 24일 × 2,200 = 52,800 → 6,643,800", () => {
    const r = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2016-05-31"), paymentDate: D("2022-06-30") });
    expect(r.breakdown).toEqual([
      { ratePer100k: 30, days: 2197, amount: 6_591_000 },
      { ratePer100k: 22, days: 24, amount: 52_800 },
    ]);
    expect(r.days).toBe(2221);
    expect(r.penalty).toBe(6_643_800);
    expect(r.basis).toBe("구 지방세기본법 §53의4 · 구 지방세기본법 시행령 §33"); // 기한 2017-03-28 전 → 구 조문
  });
  it("P-3: 한도는 기간이 아니라 부과일 기준 — 기한 2014-05-30(금), 납부 2022-01-03(부과일 2015-05-18 이후): 2,775일 × 300 = 832,500 > 한도 750,000 → 750,000", () => {
    const r = computeLocalDelayedPenalty({ unpaidLocalTax: 1_000_000, nationalDeadline: D("2014-05-30"), paymentDate: D("2022-01-03") });
    expect(r).toMatchObject({ days: 2775, rawPenalty: 832_500, capInEffect: true, capApplied: true, capAmount: 750_000, penalty: 750_000 });
  });
  it("P-4: 한도 경계 — 납부일 2015-05-17은 한도 없음, 05-18은 한도 있음(2015.5.18. 개정 부칙 §3)", () => {
    const at = (s: string) => computeLocalDelayedPenalty({ unpaidLocalTax: 1_000_000, nationalDeadline: D("2014-05-30"), paymentDate: D(s) });
    expect(at("2015-05-17").capInEffect).toBe(false);
    expect(at("2015-05-18").capInEffect).toBe(true);
    // 2014-05-31 ~ 2015-05-17 = 352일 × 300 = 105,600 (한도 미적용이어도 금액은 이자율 × 일수)
    expect(at("2015-05-17")).toMatchObject({ days: 352, penalty: 105_600, capApplied: false });
  });
  it("P-5: 2014-01-01 경계 — 국세 기한 2013-12-31은 미산정, 2014-01-02(목)는 산정(01-03~01-12 = 10일 × 3,000 = 30,000)", () => {
    const before = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2013-12-31"), paymentDate: D("2014-06-30") });
    expect(before).toMatchObject({ unsupportedPeriod: true, unsupportedReason: "pre_2014_surtax", penalty: 0 });
    const from = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2014-01-02"), paymentDate: D("2014-01-12") });
    expect(from.unsupportedPeriod).toBeUndefined();
    expect(from).toMatchObject({ days: 10, penalty: 30_000 });
  });
  it("P-6: 이자율 25 경계(사유 발생 2019-01-01) — 기한 2018-12-31(월) 납부 2019-01-12: 01-01~01-12 = 12일 × 2,500 = 30,000 / 기한 2018-12-28(금) 납부 2018-12-31: 3일 × 3,000 = 9,000", () => {
    const r = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2018-12-31"), paymentDate: D("2019-01-12") });
    expect(r.breakdown).toEqual([{ ratePer100k: 25, days: 12, amount: 30_000 }]);
    const r2 = computeLocalDelayedPenalty({ unpaidLocalTax: 10_000_000, nationalDeadline: D("2018-12-28"), paymentDate: D("2018-12-31") });
    expect(r2.breakdown).toEqual([{ ratePer100k: 30, days: 3, amount: 9_000 }]);
  });
});

describe("W2 §57② 감면 — 신고일·확정신고기한 연혁", () => {
  it("R-1: 수정신고 계단 — 신고일 2017-03-28 전·후는 50/20/10(6개월 초과 1년 이내 20%), 2020-01-01 이후는 6개월 초과 1년 이내 30%", () => {
    // 기한 2016-05-31 + 6개월 = 2016-11-30. 수정신고 2016-12-01(6개월 초과, 1년 이내)
    expect(resolveLocalAmendmentReduction({ deadline: D("2016-05-31"), amendedDate: D("2016-12-01") })).toMatchObject({ rate: 0.2, ref: "구 지방세기본법 §54②1호" });
    expect(resolveLocalAmendmentReduction({ deadline: D("2016-05-31"), amendedDate: D("2016-11-30") }).rate).toBe(0.5);
    // 기한 2019-05-31 + 6개월 = 2019-11-30. 수정신고 2019-12-31(중간 시기) 20% / 2020-01-01(신 계단) 30%
    expect(resolveLocalAmendmentReduction({ deadline: D("2019-05-31"), amendedDate: D("2019-12-31") })).toMatchObject({ rate: 0.2, ref: "지방세기본법 §57②1호나목" });
    expect(resolveLocalAmendmentReduction({ deadline: D("2019-05-31"), amendedDate: D("2020-01-01") })).toMatchObject({ rate: 0.3, ref: "지방세기본법 §57②1호라목" });
  });
  it("R-2: 기한 후 신고 계단 — 신고일 2017-03-28 전은 1개월 50%뿐, ~2019-12-31은 6개월 20%, 2020-01-01 이후는 3개월 30%", () => {
    const red = (prelim: string, filing: string) => resolveLocalNonFilingReduction({ prelimDeadline: D(prelim), filingDate: D(filing) });
    expect(red("2016-05-31", "2016-06-30").rate).toBe(0.5);
    expect(red("2016-05-31", "2016-07-01").rate).toBe(0); // 1개월 초과 — 구 계단엔 없음
    // 신고일 경계 2017-03-28(구법 전부개정 시행, 2016.12.27. 부칙 §5): 예정기한 2017-01-31 + 1개월 = 02-28 초과
    expect(red("2017-01-31", "2017-03-27").rate).toBe(0);
    expect(red("2017-01-31", "2017-03-28")).toMatchObject({ rate: 0.2, ref: "지방세기본법 §57②2호나목" });
    expect(red("2017-04-30", "2017-05-30").rate).toBe(0.5);
    expect(red("2017-04-30", "2017-07-30")).toMatchObject({ rate: 0.2, ref: "지방세기본법 §57②2호나목" }); // 신 계단이면 3개월 이내 30%
    expect(red("2019-10-31", "2020-01-20")).toMatchObject({ rate: 0.3, ref: "지방세기본법 §57②2호나목" }); // 신고일 2020 이후 — 신 계단 30%
  });
  it("R-3: 4호 — 확정신고기한이 2017-12-31이면 없고 2018-01-02면 있다(2017.12.26. 부칙 §3)", () => {
    const red = (finalD: string) =>
      resolveLocalNonFilingReduction({ prelimDeadline: D("2017-04-28"), finalDeadline: D(finalD), filingDate: D("2017-11-15") });
    // 예정기한 2017-04-28 + 6개월(2017-10-28) 초과라 2호는 0 — 4호만이 감면 근거
    expect(red("2017-12-29").rate).toBe(0);
    expect(red("2018-01-02")).toMatchObject({ rate: 0.5, ref: "지방세기본법 §57②4호가목" });
  });
});

describe("W2 경로 — 무신고(2016) · 무신고(2017) · 수정신고 · 2013 미산정", () => {
  it("F-1: 2016 무신고 · 기한 후 신고 2016-06-20(1개월 이내) · 납부 2016-06-20 — 지방 기준 3,023,500: 20% 604,700 − 50% 302,350 = 302,350 + 납부지연 20일 × 3,023,500 × 30 / 100,000 = 18,141 → 320,491", () => {
    const filing = NONE("2016-05-31", "2016-06-20");
    const pen = calculateTransferTaxPenalty({
      filing,
      delayedPayment: { unpaidTax: 30_235_000, paymentDeadline: D("2016-05-31"), actualPaymentDate: D("2016-06-20") },
    });
    const l = computeLocalIncomePenalty(filing, pen)!;
    expect(l.filing).toMatchObject({ grossPenalty: 604_700, reductionRate: 0.5, penalty: 302_350, reductionBasis: "구 지방세기본법 §54②2호" });
    expect(l.filing!.basis).toBe("구 지방세기본법 §53의2 · 구 지방세기본법 §54②2호");
    expect(l.delayed).toMatchObject({ days: 20, penalty: 18_141 });
    expect(l.total).toBe(320_491);
    expect(l.assumptions.some((a) => a.includes("산출세액"))).toBe(true); // 2017년 전 기준 고지
  });
  it("F-2: 2017 무신고 · 기한 후 신고 2017-07-20(1개월 초과 3개월 이내) — 중간 계단 20%: 604,700 − 120,940 = 483,760 + 납부지연 50일 × 3,023,500 × 30 / 100,000 = 45,352 → 529,112", () => {
    const filing = NONE("2017-05-31", "2017-07-20");
    const pen = calculateTransferTaxPenalty({
      filing,
      delayedPayment: { unpaidTax: 30_235_000, paymentDeadline: D("2017-05-31"), actualPaymentDate: D("2017-07-20") },
    });
    const l = computeLocalIncomePenalty(filing, pen)!;
    expect(l.filing).toMatchObject({ reductionRate: 0.2, reductionAmount: 120_940, penalty: 483_760 });
    expect(l.filing!.basis).toBe("지방세기본법 §53 · 지방세기본법 §57②2호나목"); // 2017-03-28 이후 신 조문 번호
    expect(l.delayed).toMatchObject({ days: 50, penalty: 45_352 });
    expect(l.total).toBe(529_112);
  });
  it("F-3: 2015 기한 후 신고 1개월 이내 — 구 §54③ 동시 납부 요건 고지가 붙는다", () => {
    const filing = NONE("2015-06-01", "2015-06-20");
    const l = computeLocalIncomePenalty(filing, calculateTransferTaxPenalty({ filing }))!;
    expect(l.filing!.reductionRate).toBe(0.5);
    expect(l.assumptions.some((a) => a.includes("동시에 납부"))).toBe(true);
  });
  it("F-4: 수정신고 2016 — 추가 본세 10,235,000 → 지방 1,023,500: §54① 10% 102,350, 수정신고 2016-12-01(20%) → 81,880 + 납부지연", () => {
    const l = computeAmendmentLocalPenalty({
      additionalTax: 10_235_000, applyUnderReportingPenalty: true, underReportingReason: "normal", underExempt: false,
      autoReduction: true, nationalDeadline: D("2016-05-31"), amendedFilingDate: D("2016-12-01"), applyLatePaymentPenalty: false,
    })!;
    expect(l.filing).toMatchObject({ grossPenalty: 102_350, reductionRate: 0.2, reductionAmount: 20_470, penalty: 81_880 });
    expect(l.filing!.basis).toBe("구 지방세기본법 §53의3 · 구 지방세기본법 §54②1호");
  });
  it("U-1: 2013 기한 — 미산정 + 고지 (납부지연), 총 0원 · 산출근거에 0원 단계", () => {
    const filing = NONE("2013-05-31", "2013-06-20");
    const pen = calculateTransferTaxPenalty({
      filing,
      delayedPayment: { unpaidTax: 30_235_000, paymentDeadline: D("2013-05-31"), actualPaymentDate: D("2013-06-20") },
    });
    const l = computeLocalIncomePenalty(filing, pen)!;
    expect(l.total).toBe(0);
    expect(l.filing).toBeUndefined();
    expect(l.unsupportedReason).toBe("pre_2014_surtax");
    expect(l.delayed).toMatchObject({ unsupportedPeriod: true, penalty: 0 });
    expect(l.assumptions.some((a) => a.includes("소득세 부가세 체계") && a.includes("미산정"))).toBe(true);
    const steps = localIncomePenaltySteps(l);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ label: "지방소득세 가산세 (미산정)", amount: 0 });
    expect(steps[0].formula).toContain("구 지방세법상 소득세 부가세 체계(지방소득세 소득분)");
  });
  it("U-2: 수정신고도 2013 기한이면 미산정", () => {
    const l = computeAmendmentLocalPenalty({
      additionalTax: 10_235_000, applyUnderReportingPenalty: true, underReportingReason: "normal", underExempt: false,
      autoReduction: true, nationalDeadline: D("2013-05-31"), amendedFilingDate: D("2013-12-01"), applyLatePaymentPenalty: true,
    })!;
    expect(l).toMatchObject({ total: 0, unsupportedReason: "pre_2014_surtax" });
    expect(l.filing).toBeUndefined();
  });
  it("U-3: 2014년 상반기 기한은 산정하되 2013년 양도분 가능성 고지", () => {
    const filing = NONE("2014-05-30", "2014-06-10");
    const pen = calculateTransferTaxPenalty({
      filing,
      delayedPayment: { unpaidTax: 30_235_000, paymentDeadline: D("2014-05-30"), actualPaymentDate: D("2014-06-10") },
    });
    const l = computeLocalIncomePenalty(filing, pen)!;
    expect(l.total).toBeGreaterThan(0);
    expect(l.assumptions.some((a) => a.includes("2013년에 양도한 분"))).toBe(true);
  });
  it("U-4: 단건 엔진 합산 — 2013 기한이면 총 납부세액에 지방 가산세가 없다", () => {
    const rates = makeMockRates();
    const taxable = {
      propertyType: "land" as const, transferPrice: 500_000_000, acquisitionPrice: 300_000_000,
      acquisitionDate: new Date("2018-06-01"), transferDate: new Date("2024-06-01"),
      isOneHousehold: false, householdHousingCount: 0,
    };
    const off = calculateTransferTax(baseTransferInput(taxable), rates);
    const filing: FilingPenaltyInput = { ...NONE("2013-05-31", "2013-06-20"), determinedTax: off.determinedTax };
    const on = calculateTransferTax(
      baseTransferInput({
        ...taxable,
        filingPenaltyDetails: filing,
        delayedPaymentDetails: { unpaidTax: off.determinedTax, paymentDeadline: D("2013-05-31"), actualPaymentDate: D("2013-06-20") },
      }),
      rates,
    );
    expect(on.localIncomePenalty).toMatchObject({ total: 0, unsupportedReason: "pre_2014_surtax" });
    expect(on.totalTax).toBe(on.determinedTax + on.localIncomeTax + on.penaltyDetail!.totalPenalty);
  });
});
