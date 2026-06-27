/**
 * 무체재산권 평가 — 상증법 §64·상증령 §59⑤·상증규 §19②③④ (집행기준 64-59-4)
 * 설계: docs/02-design/features/inheritance-gift-intangible-ip-valuation.engine.design.md
 * anchor: 국세청 특허권 평가사례 — 출원2015.7.1·평가2022.6.30·연15,000천원 → 106,550천원
 */
import { describe, it, expect } from "vitest";
import { parseISO } from "date-fns";
import {
  evaluateIntangibleIp,
  resolveIntangibleRemainingYears,
} from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const ip = (p: Partial<EstateItem>): EstateItem => ({
  id: "ip-1",
  category: "intangible_ip",
  name: "특허권",
  intangibleIpType: "patent",
  intangibleIncomeMode: "fixed",
  intangibleAnnualIncome: 15_000_000,
  intangibleRemainingYears: 13,
  ...p,
});

describe("evaluateIntangibleIp (§64·령§59⑤·규§19②)", () => {
  it("IP-1 특허 사례: 연15,000,000 · 잔존13 → 106,550,336 (교재 106,550천원)", () => {
    expect(evaluateIntangibleIp(ip({})).valuatedAmount).toBe(106_550_336);
  });
  it("IP-2 20년 한도: 잔존20 → 127,703,445", () => {
    expect(evaluateIntangibleIp(ip({ intangibleRemainingYears: 20 })).valuatedAmount).toBe(
      127_703_445,
    );
  });
  it("IP-3 잔존 0 → 0", () => {
    expect(evaluateIntangibleIp(ip({ intangibleRemainingYears: 0 })).valuatedAmount).toBe(0);
  });
  it("IP-9 avg3y: 직전3년 합계45,000,000 ÷ 3 → income15,000,000 → 106,550,336", () => {
    const r = evaluateIntangibleIp(
      ip({
        intangibleIncomeMode: "avg3y",
        intangibleAnnualIncome: undefined,
        intangiblePrior3yIncomeTotal: 45_000_000,
        intangiblePrior3yYears: 3,
      }),
    );
    expect(r.valuatedAmount).toBe(106_550_336);
  });
  it("IP-10 avg3y 3년 미달: 합계30,000,000 ÷ 2 → income15,000,000", () => {
    const r = evaluateIntangibleIp(
      ip({
        intangibleIncomeMode: "avg3y",
        intangibleAnnualIncome: undefined,
        intangiblePrior3yIncomeTotal: 30_000_000,
        intangiblePrior3yYears: 2,
      }),
    );
    expect(r.valuatedAmount).toBe(106_550_336);
  });
  it("IP-11 appraisal: 감정가액 직접(Σ 미적용)", () => {
    const r = evaluateIntangibleIp(
      ip({
        intangibleIncomeMode: "appraisal",
        intangibleAnnualIncome: undefined,
        intangibleAppraisedValue: 90_000_000,
      }),
    );
    expect(r.valuatedAmount).toBe(90_000_000);
    expect(r.method).toBe("appraisal");
  });
  it("IP-11b appraisal + §64 1호 byCost > 감정 → byCost·acquisition_cost (법 §64 본문 MAX)", () => {
    const r = evaluateIntangibleIp(
      ip({
        intangibleIncomeMode: "appraisal",
        intangibleAnnualIncome: undefined,
        intangibleAppraisedValue: 90_000_000,
        intangibleAcquisitionCost: 100_000_000,
      }),
    );
    expect(r.valuatedAmount).toBe(100_000_000);
    expect(r.method).toBe("acquisition_cost");
  });
  it("IP-13 §64 1호 > ②환산 → byCost 채택·method=acquisition_cost", () => {
    const r = evaluateIntangibleIp(ip({ intangibleAcquisitionCost: 200_000_000 }));
    expect(r.valuatedAmount).toBe(200_000_000);
    expect(r.method).toBe("acquisition_cost");
  });
  it("IP-14 §64 1호 < ②환산 → ②환산 채택", () => {
    const r = evaluateIntangibleIp(ip({ intangibleAcquisitionCost: 50_000_000 }));
    expect(r.valuatedAmount).toBe(106_550_336);
    expect(r.method).toBe("standard_price");
  });
});

describe("resolveIntangibleRemainingYears (규§19③ floor + 20년 한도)", () => {
  const V = parseISO("2022-06-30");
  it("IP-T1 특허 출원2015.7.1 → 13 (출원+20년 만료2035, floor)", () => {
    expect(
      resolveIntangibleRemainingYears({
        type: "patent",
        originDate: parseISO("2015-07-01"),
        valuationDate: V,
      }),
    ).toBe(13);
  });
  it("IP-T2 디자인 출원2015 → 출원+20년(현행 §91①)", () => {
    expect(
      resolveIntangibleRemainingYears({
        type: "design",
        originDate: parseISO("2015-07-01"),
        valuationDate: V,
      }),
    ).toBe(13);
  });
  it("IP-T3 저작권 사망2000 → 사망+70년 만료2070 → 20 cap", () => {
    expect(
      resolveIntangibleRemainingYears({
        type: "copyright",
        authorDeathDate: parseISO("2000-01-01"),
        valuationDate: V,
      }),
    ).toBe(20);
  });
  it("IP-T4 만료 초과 → 0", () => {
    expect(
      resolveIntangibleRemainingYears({
        type: "utility_model",
        originDate: parseISO("2000-01-01"), // +10년 만료2010 < 평가2022
        valuationDate: V,
      }),
    ).toBe(0);
  });
  it("IP-T5 override=25 → 20 cap / override=0 → 0", () => {
    expect(
      resolveIntangibleRemainingYears({ type: "patent", override: 25, valuationDate: V }),
    ).toBe(20);
    expect(
      resolveIntangibleRemainingYears({ type: "patent", override: 0, valuationDate: V }),
    ).toBe(0);
  });
  it("IP-T6 미입력(기산일 없음) → 0", () => {
    expect(resolveIntangibleRemainingYears({ type: "patent", valuationDate: V })).toBe(0);
  });
});
