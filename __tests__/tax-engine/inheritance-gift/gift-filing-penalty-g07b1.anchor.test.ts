/**
 * anchor: 🔴 G-07 B1 — 증여세 신고불성실가산세 (「국세기본법」 §47의2·§47의3)
 *
 * ## 조문 지형
 *
 * 「상속세 및 증여세법」 §78①②는 **삭제**됐다 — 상속·증여의 신고불성실은 국세기본법이
 * 유일 근거다. §47의2① 괄호가 제외하는 것은 교육세·농특세·**종부세**뿐이다.
 *
 * · **무신고** §47의2①2호 — 20%. base 는 「그 신고로 납부하여야 할 세액」 **전액**.
 * · **기한후신고 감면** §48②2호 — 1개월 50% · 3개월 30% · 6개월 20%.
 *   §47조의2 가산세**만** 대상이고, 「결정할 것을 미리 알고」 제출하면 배제된다.
 *   ⚠️ §48②**1호**(수정신고 90/75/50/30/20/10%)와 **표가 다르다**.
 * · **과소신고** §47의3①2호 — 10%. base 는 결정세액 − 당초 신고세액.
 * · 🔴 **§47의3④1호 적용제외 4사유** — 상속·증여 **전용**. 특히 「다」목(§60②③·§66 보충적
 *   평가액으로 과세표준 결정)은 이 앱이 정면으로 다루는 국면이라, 게이트가 없으면
 *   **없는 가산세가 붙는다**.
 *
 * ## 범위 (B1)
 *
 * 일반율만 — **부정행위 40%·역외 60%는 B2**, **납부지연 §47의4는 B3**다.
 *
 * @see docs/00-pm/inheritance-gift-penalty-g07.plan.md §8
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { resolveLateFilingReductionRate } from "@/lib/tax-engine/inheritance-gift-penalty";
import type { InheritanceGiftPenaltyInput } from "@/lib/tax-engine/inheritance-gift-penalty";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";
import { getGiftFilingDueDates } from "@/lib/calc/inheritance-gift-filing-deadline";

/** 직계비속 부동산 10억 · 증여일 2025-01-01 */
function gi(pen?: InheritanceGiftPenaltyInput, onTime = true): GiftTaxInput {
  return {
    giftDate: "2025-01-01",
    donorRelation: "lineal_descendant",
    donor: "mother",
    giftItems: [
      { id: "g1", category: "real_estate_apartment", name: "재산", marketValue: 1_000_000_000 },
    ],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_descendant" },
    creditInput: { isFiledOnTime: onTime },
    ...(pen ? { filingPenalty: pen } : {}),
  } as GiftTaxInput;
}

const LATE = (filed: string, notified?: boolean): InheritanceGiftPenaltyInput => ({
  filingStatus: "late",
  statutoryDeadline: "2025-04-30", // §68① 증여일 속한 달의 말일(1/31) + 3개월
  actualFilingDate: filed,
  ...(notified ? { priorAssessmentNotified: true } : {}),
});

describe("B1-0 대조군 — 입력이 없으면 종전 동작 그대로", () => {
  it("B1-0-1: ⛔ 가산세 키가 없으면 0이고 detail 도 없다", () => {
    const r = calcGiftTax(gi());
    expect(r.finalTax).toBe(218_250_000);
    expect(r.underreportPenalty).toBe(0);
    expect(r.filingPenaltyDetail).toBeUndefined();
    expect(r.totalPayableWithPenalty).toBeUndefined();
  });

  it("B1-0-2: ⛔ 정기신고 + 과소신고 아님 → 0 (양성 대조군)", () => {
    const r = calcGiftTax(gi({ filingStatus: "on_time" }));
    expect(r.underreportPenalty).toBe(0);
    expect(r.filingPenaltyDetail).toBeUndefined();
  });
});

describe("B1-1 무신고 — 국세기본법 §47의2①2호 20%", () => {
  /** 무신고면 §69 신고세액공제(3%)가 빠져 결정세액이 225,000,000이 된다 */
  const r = calcGiftTax(gi({ filingStatus: "none" }, false));

  it("B1-1-1: 🔴 결정세액 전액 × 20% (리뷰 §G-07 재현값)", () => {
    expect(r.finalTax).toBe(225_000_000);
    expect(r.filingPenaltyDetail!.penaltyBase).toBe(225_000_000);
    expect(r.filingPenaltyDetail!.penaltyRate).toBe(0.2);
    expect(r.underreportPenalty).toBe(45_000_000);
  });

  it("B1-1-2: 총 납부세액 = 결정세액 + 가산세", () => {
    expect(r.totalPayableWithPenalty).toBe(270_000_000);
    // 🔑 finalTax 는 **결정세액 그대로**다 — 별지9호 ㉔·연부연납 base 축을 지킨다
    expect(r.finalTax).toBe(225_000_000);
  });

  it("B1-1-3: ⛔ 무신고는 §48②2호 감면 대상이 아니다 (기한후신고가 아니다)", () => {
    expect(r.filingPenaltyDetail!.reductionRate).toBe(0);
    expect(r.filingPenaltyDetail!.grossPenalty).toBe(r.underreportPenalty);
  });
});

describe("B1-2 기한후신고 감면 — 국세기본법 §48②2호", () => {
  it.each([
    ["2025-05-20", 0.5, 22_500_000, "1개월 이내 50%"],
    ["2025-07-20", 0.3, 31_500_000, "1~3개월 30%"],
    ["2025-10-20", 0.2, 36_000_000, "3~6개월 20%"],
    ["2025-12-20", 0, 45_000_000, "6개월 초과 감면 없음"],
  ])("B1-2-1: 신고일 %s → 감면 %s (%s — %s)", (filed, rate, penalty) => {
    const r = calcGiftTax(gi(LATE(filed as string), false));
    expect(r.filingPenaltyDetail!.grossPenalty).toBe(45_000_000);
    expect(r.filingPenaltyDetail!.reductionRate).toBe(rate);
    expect(r.underreportPenalty).toBe(penalty);
  });

  it("B1-2-2: 🔴 「결정할 것을 미리 알고」 신고하면 감면 배제 (§48②2호 괄호)", () => {
    const on = calcGiftTax(gi(LATE("2025-05-20"), false));
    const off = calcGiftTax(gi(LATE("2025-05-20", true), false));
    expect(on.underreportPenalty).toBe(22_500_000);
    expect(off.underreportPenalty).toBe(45_000_000);
  });

  it("B1-2-3: ⚠️ §48②**1호**(수정신고) 표와 혼용하지 않는다 — 1개월은 90%가 아니라 50%", () => {
    expect(resolveLateFilingReductionRate("2025-04-30", "2025-05-20", false)).toBe(0.5);
    expect(resolveLateFilingReductionRate("2025-04-30", "2025-05-20", false)).not.toBe(0.9);
    // 2년 구간(§48②1호 바목 10%)은 이 표에 없다 — 6개월 초과는 0이다
    expect(resolveLateFilingReductionRate("2025-04-30", "2026-04-20", false)).toBe(0);
  });

  it("B1-2-4: 🔑 법정신고기한은 §68① 단일 소스에서 나온다 (달의 말일 + 3개월)", () => {
    // 증여일 2025-01-01 → 그 달 말일 2025-01-31 + 3개월 = 2025-04-30
    expect(getGiftFilingDueDates("2025-01-01")?.filing).toBe("2025-04-30");
  });
});

describe("B1-3 과소신고 — 국세기본법 §47의3①2호 10%", () => {
  const UNDER: InheritanceGiftPenaltyInput = {
    filingStatus: "on_time",
    isUnderReported: true,
    originalFiledTax: 50_000_000,
  };

  it("B1-3-1: 🔴 base 는 결정세액 − 당초 신고세액이다 (결정세액 전액이 아니다)", () => {
    const r = calcGiftTax(gi(UNDER));
    // 정기신고라 §69 공제가 살아 결정세액은 218,250,000
    expect(r.finalTax).toBe(218_250_000);
    expect(r.filingPenaltyDetail!.penaltyBase).toBe(168_250_000);
    expect(r.filingPenaltyDetail!.penaltyRate).toBe(0.1);
    expect(r.underreportPenalty).toBe(16_825_000);
    expect(r.totalPayableWithPenalty).toBe(235_075_000);
  });

  it("B1-3-2: 🔑 당초 신고세액이 base 를 실제로 움직인다 (구별력)", () => {
    const a = calcGiftTax(gi({ ...UNDER, originalFiledTax: 0 }));
    const b = calcGiftTax(gi({ ...UNDER, originalFiledTax: 100_000_000 }));
    expect(a.underreportPenalty).toBe(21_825_000);
    expect(b.underreportPenalty).toBe(11_825_000);
  });

  it.each([
    "ownership_dispute",
    "deduction_error",
    "supplementary_valuation",
    "corporate_adjustment",
  ] as const)("B1-3-3: 🔴 §47의3④1호 %s → 과소신고가산세 0", (reason) => {
    const r = calcGiftTax(gi({ ...UNDER, underReportExclusion: reason }));
    expect(r.underreportPenalty).toBe(0);
    expect(r.filingPenaltyDetail!.exclusionApplied).toBe(reason);
    // 적용제외로 0이 된 사실은 남긴다 — 화면이 이유를 설명해야 한다
    expect(r.filingPenaltyDetail!.steps.length).toBeGreaterThan(0);
    expect(r.totalPayableWithPenalty).toBeUndefined();
  });

  it("B1-3-4: ⛔ 적용제외는 **무신고에는 없다** (§47의3④1호는 과소신고 전용)", () => {
    const r = calcGiftTax(
      gi(
        {
          filingStatus: "none",
          underReportExclusion: "supplementary_valuation",
        },
        false,
      ),
    );
    expect(r.underreportPenalty).toBe(45_000_000);
    expect(r.filingPenaltyDetail!.exclusionApplied).toBeUndefined();
  });
});

describe("B1-4 별지 제10호서식 자기정합", () => {
  const get = (r: ReturnType<typeof calcGiftTax>, n: string) =>
    r.besshi10Rows.find((x) => x.number === n)!.amount;

  it("B1-4-1: 🔴 ㊺ = ㉞+㉟−㊱−㊲+㊷+㊸+㊹ — 가산세가 있어도 성립한다", () => {
    const r = calcGiftTax(gi({ filingStatus: "none" }, false));
    expect(get(r, "㊷")).toBe(45_000_000);
    expect(get(r, "㊺")).toBe(
      get(r, "㉞") + get(r, "㉟") - get(r, "㊱") - get(r, "㊲") + get(r, "㊷") + get(r, "㊸") + get(r, "㊹"),
    );
    // ㊺는 총 납부세액이다 — 결정세액(finalTax)이 아니다
    expect(get(r, "㊺")).toBe(270_000_000);
    expect(get(r, "㊺")).not.toBe(r.finalTax);
  });

  it("B1-4-2: ㊷가 0이면 dash 로 돌아간다 (A안 규칙 유지)", () => {
    const r = calcGiftTax(gi());
    const row = r.besshi10Rows.find((x) => x.number === "㊷")!;
    expect(row.amount).toBe(0);
    expect(row.display).toBe("dash");
  });

  it("B1-4-3: ㊷가 실리면 금액 표시가 된다", () => {
    const r = calcGiftTax(gi({ filingStatus: "none" }, false));
    expect(r.besshi10Rows.find((x) => x.number === "㊷")!.display).toBe("amount");
  });
});
