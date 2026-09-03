/**
 * anchor: 🔴 G-07 B1 — 상속세 신고불성실가산세 (「국세기본법」 §47의2·§47의3)
 *
 * ## 조문 지형 (증여와 동일 — 「상속세 및 증여세법」에 근거가 없다)
 *
 * 「상속세 및 증여세법」 §78①②는 **삭제**됐다(현행 §78③~⑮는 공익법인 축). 상속·증여의
 * 신고불성실은 「국세기본법」이 유일 근거다. §47의2① 괄호가 제외하는 것은
 * 교육세·농특세·**종부세**뿐이므로 상속세는 대상이다.
 *
 * · 무신고 §47의2①2호 20% — base 는 「그 신고로 납부하여야 할 세액」 **전액**
 * · 기한후신고 감면 §48②2호 — 1개월 50% · 3개월 30% · 6개월 20%
 * · 과소신고 §47의3①2호 10% — base 는 결정세액 − 당초 신고세액
 * · §47의3④1호 적용제외 4사유 (상속·증여 전용)
 *
 * ## ⭐ 결정 1 — **신고 단위 1회**다
 *
 * 상속인별로 안분하지 않는다. §47의2①의 base 는 「그 신고로 납부하여야 할 세액」이고
 * 상속세는 **1건의 신고**이므로 가산세도 그 신고에 1회 붙는다. ⇒ `inheritance-allocation.ts`
 * (상속인별 배부표)는 **무변경**이며, 이 파일이 그 사실을 지킨다(B1-I-5).
 *
 * ## 범위 (B1)
 *
 * 일반율만 — **부정행위 40%·역외 60%는 B2**, **납부지연 §47의4는 B3**다.
 *
 * @see docs/00-pm/inheritance-gift-penalty-g07.plan.md §8
 * @see __tests__/tax-engine/inheritance-gift/gift-filing-penalty-g07b1.anchor.test.ts (증여 대칭)
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { buildFilingForm9Data } from "@/lib/calc/filing-form-9-data";
import { getInheritanceFilingDueDates } from "@/lib/calc/inheritance-gift-filing-deadline";
import { EXAMPLE_INPUT } from "../inheritance/fixtures/comprehensive-case-pdf.fixture";
import type { InheritanceTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { InheritanceGiftPenaltyInput } from "@/lib/tax-engine/inheritance-gift-penalty";

/** 종합사례 PDF 고정 입력 — 결정세액이 anchor 19,000건과 같은 축이라 회귀 감지력이 높다 */
function inh(pen?: InheritanceGiftPenaltyInput, onTime = true): InheritanceTaxInput {
  return {
    ...EXAMPLE_INPUT,
    creditInput: { ...EXAMPLE_INPUT.creditInput, isFiledOnTime: onTime },
    ...(pen ? { filingPenalty: pen } : {}),
  };
}

/** §67① 상속개시일이 속한 달의 말일 + 6개월 (EXAMPLE_INPUT.deathDate 기준) */
const DEADLINE = getInheritanceFilingDueDates(EXAMPLE_INPUT.deathDate, "resident").filing;

const LATE = (filed: string, notified?: boolean): InheritanceGiftPenaltyInput => ({
  filingStatus: "late",
  statutoryDeadline: DEADLINE,
  actualFilingDate: filed,
  ...(notified ? { priorAssessmentNotified: true } : {}),
});

describe("B1-I-0 대조군 — 입력이 없으면 종전 동작 그대로", () => {
  it("B1-I-0-1: ⛔ 가산세 키가 없으면 0이고 detail·총액 모두 없다", () => {
    const r = calcInheritanceTax(inh());
    expect(r.finalTax).toBe(1_033_760_232);
    expect(r.underreportPenalty).toBe(0);
    expect(r.filingPenaltyDetail).toBeUndefined();
    expect(r.totalPayableWithPenalty).toBeUndefined();
  });

  it("B1-I-0-2: ⛔ 정기신고 + 과소신고 아님 → 0 (양성 대조군)", () => {
    const r = calcInheritanceTax(inh({ filingStatus: "on_time" }));
    expect(r.underreportPenalty).toBe(0);
    expect(r.filingPenaltyDetail).toBeUndefined();
  });
});

describe("B1-I-1 무신고 — 국세기본법 §47의2①2호 20%", () => {
  /** 무신고면 §69 신고세액공제(3%)가 빠져 결정세액이 커진다 */
  const r = calcInheritanceTax(inh({ filingStatus: "none" }, false));

  it("B1-I-1-1: 🔴 결정세액 전액 × 20%", () => {
    expect(r.finalTax).toBe(1_065_732_198);
    expect(r.filingPenaltyDetail!.penaltyBase).toBe(1_065_732_198);
    expect(r.filingPenaltyDetail!.penaltyRate).toBe(0.2);
    expect(r.underreportPenalty).toBe(213_146_439);
  });

  it("B1-I-1-2: 총 납부세액 = 결정세액 + 가산세 (finalTax 는 결정세액 그대로)", () => {
    expect(r.totalPayableWithPenalty).toBe(1_278_878_637);
    // 🔑 별지9호 ㉔·연부연납(§71)·분납(§70②) base 축을 지킨다
    expect(r.finalTax).toBe(1_065_732_198);
  });

  it("B1-I-1-3: ⛔ 무신고는 §48②2호 감면 대상이 아니다 (기한후신고가 아니다)", () => {
    expect(r.filingPenaltyDetail!.reductionRate).toBe(0);
    expect(r.filingPenaltyDetail!.grossPenalty).toBe(r.underreportPenalty);
  });
});

describe("B1-I-2 기한후신고 감면 — 국세기본법 §48②2호", () => {
  it("B1-I-2-0: 🔑 법정신고기한이 상속개시일에서 파생된다 (§67① 2023-03-05 → 2023-09-30)", () => {
    expect(DEADLINE).toBe("2023-09-30");
  });

  it.each([
    ["2023-10-20", 0.5, 106_573_220, "1개월 이내 50%"],
    ["2023-12-20", 0.3, 149_202_508, "1~3개월 30%"],
    ["2024-03-20", 0.2, 170_517_152, "3~6개월 20%"],
    ["2024-05-20", 0, 213_146_439, "6개월 초과 감면 없음"],
  ])("B1-I-2-1: 신고일 %s → 감면 %s (%s)", (filed, rate, penalty) => {
    const r = calcInheritanceTax(inh(LATE(filed as string), false));
    expect(r.filingPenaltyDetail!.grossPenalty).toBe(213_146_439);
    expect(r.filingPenaltyDetail!.reductionRate).toBe(rate);
    expect(r.underreportPenalty).toBe(penalty);
  });

  it("B1-I-2-2: 🔴 「결정할 것을 미리 알고」 신고하면 감면 배제 (§48②2호 괄호)", () => {
    const on = calcInheritanceTax(inh(LATE("2023-10-20"), false));
    const off = calcInheritanceTax(inh(LATE("2023-10-20", true), false));
    expect(on.underreportPenalty).toBe(106_573_220);
    expect(off.underreportPenalty).toBe(213_146_439);
  });

  it("B1-I-2-3: 🔑 법정신고기한은 §67① 단일 소스에서 나온다 (달의 말일 + 6개월)", () => {
    expect(getInheritanceFilingDueDates("2025-01-10", "resident").filing).toBe("2025-07-31");
    // §67④ 비거주자는 9개월 — 같은 상속개시일에서 기한이 달라진다
    expect(getInheritanceFilingDueDates("2025-01-10", "non_resident").filing).toBe("2025-10-31");
  });

  it("B1-I-2-4: 🔴 §67④ 비거주자 9개월이 감면 구간을 실제로 바꾼다 (구별력)", () => {
    // 2024-01-20 신고 — 거주자(기한 2023-09-30)는 3~6개월(20%),
    //                    비거주자(§67④ 기한 2023-12-31)는 1개월 이내(50%)
    const nonResidentDeadline = getInheritanceFilingDueDates(
      EXAMPLE_INPUT.deathDate,
      "non_resident",
    ).filing;
    expect(nonResidentDeadline).toBe("2023-12-31");
    const resident = calcInheritanceTax(
      inh({ filingStatus: "late", statutoryDeadline: DEADLINE, actualFilingDate: "2024-01-20" }, false),
    );
    const nonResident = calcInheritanceTax(
      inh(
        { filingStatus: "late", statutoryDeadline: nonResidentDeadline, actualFilingDate: "2024-01-20" },
        false,
      ),
    );
    expect(resident.filingPenaltyDetail!.reductionRate).toBe(0.2);
    expect(nonResident.filingPenaltyDetail!.reductionRate).toBe(0.5);
  });
});

describe("B1-I-3 과소신고 — 국세기본법 §47의3①2호 10%", () => {
  const UNDER: InheritanceGiftPenaltyInput = {
    filingStatus: "on_time",
    isUnderReported: true,
    originalFiledTax: 100_000_000,
  };

  it("B1-I-3-1: 🔴 base 는 결정세액 − 당초 신고세액이다 (결정세액 전액이 아니다)", () => {
    const r = calcInheritanceTax(inh(UNDER));
    expect(r.finalTax).toBe(1_033_760_232);
    expect(r.filingPenaltyDetail!.penaltyBase).toBe(933_760_232);
    expect(r.filingPenaltyDetail!.penaltyRate).toBe(0.1);
    expect(r.underreportPenalty).toBe(93_376_023);
    expect(r.totalPayableWithPenalty).toBe(1_127_136_255);
  });

  it("B1-I-3-2: 🔑 당초 신고세액이 base 를 실제로 움직인다 (구별력)", () => {
    const a = calcInheritanceTax(inh({ ...UNDER, originalFiledTax: 0 }));
    const b = calcInheritanceTax(inh({ ...UNDER, originalFiledTax: 500_000_000 }));
    expect(a.underreportPenalty).toBe(103_376_023);
    expect(b.underreportPenalty).toBe(53_376_023);
  });

  it.each([
    "ownership_dispute",
    "deduction_error",
    "supplementary_valuation",
    "corporate_adjustment",
  ] as const)("B1-I-3-3: 🔴 §47의3④1호 %s → 과소신고가산세 0", (reason) => {
    const r = calcInheritanceTax(inh({ ...UNDER, underReportExclusion: reason }));
    expect(r.underreportPenalty).toBe(0);
    expect(r.filingPenaltyDetail!.exclusionApplied).toBe(reason);
    // 적용제외로 0이 된 사실은 남긴다 — 화면이 이유를 설명해야 한다
    expect(r.filingPenaltyDetail!.steps.length).toBeGreaterThan(0);
    expect(r.totalPayableWithPenalty).toBeUndefined();
  });

  it("B1-I-3-4: ⛔ 적용제외는 **무신고에는 없다** (§47의3④1호는 과소신고 전용)", () => {
    const r = calcInheritanceTax(
      inh({ filingStatus: "none", underReportExclusion: "supplementary_valuation" }, false),
    );
    expect(r.underreportPenalty).toBe(213_146_439);
    expect(r.filingPenaltyDetail!.exclusionApplied).toBeUndefined();
  });
});

describe("B1-I-4 별지 제9호서식 ㊱·㊳", () => {
  const get = (rows: { number: string; amount: number }[], n: string) =>
    rows.find((x) => x.number === n)!.amount;

  it("B1-I-4-1: 🔴 ㊱ 신고불성실가산세 칸에 실린다", () => {
    const r = calcInheritanceTax(inh({ filingStatus: "none" }, false));
    const d = buildFilingForm9Data(r, EXAMPLE_INPUT.heirs, EXAMPLE_INPUT.deathDate);
    const rows = [...d.leftRows, ...d.rightRows];
    expect(get(rows, "㊱")).toBe(213_146_439);
    // ㊲ 납부지연가산세는 B3 — 아직 0이다
    expect(get(rows, "㊲")).toBe(0);
  });

  it("B1-I-4-2: 🔴 ㊳ = 결정세액(㉖ 차감 후) + ㊱ + ㊲ — 총 납부세액이 실린다", () => {
    const r = calcInheritanceTax(inh({ filingStatus: "none" }, false));
    const d = buildFilingForm9Data(r, EXAMPLE_INPUT.heirs, EXAMPLE_INPUT.deathDate);
    const rows = [...d.leftRows, ...d.rightRows];
    const deferred = r.culturalHeritageDeferredTax ?? 0;
    expect(get(rows, "㊳")).toBe(
      Math.max(0, r.finalTax - deferred) + get(rows, "㊱") + get(rows, "㊲"),
    );
    // ㊳는 총 납부세액이다 — 결정세액(finalTax)이 아니다
    expect(get(rows, "㊳")).not.toBe(r.finalTax);
  });

  it("B1-I-4-3: ㊱이 0이면 dash 로 돌아간다 (A안 규칙 유지)", () => {
    const r = calcInheritanceTax(inh());
    const d = buildFilingForm9Data(r, EXAMPLE_INPUT.heirs, EXAMPLE_INPUT.deathDate);
    const row = [...d.leftRows, ...d.rightRows].find((x) => x.number === "㊱")!;
    expect(row.amount).toBe(0);
    expect(row.display).toBe("dash");
  });
});

describe("B1-I-5 ⭐ 결정 1 — 가산세는 **신고 단위**다 (상속인별 안분 아님)", () => {
  /**
   * 🔑 배부표(`heirAllocationResult`)는 가산세 전후로 **완전히 동일**해야 한다.
   *    한 명이라도 값이 움직이면 「신고 단위 1회」 결정이 깨진 것이다.
   */
  it("B1-I-5-1: 🔴 무신고 가산세가 붙어도 상속인별 배부표는 불변이다", () => {
    const withoutPenalty = calcInheritanceTax(inh(undefined, false));
    const withPenalty = calcInheritanceTax(inh({ filingStatus: "none" }, false));
    expect(withPenalty.underreportPenalty).toBeGreaterThan(0);
    expect(withPenalty.heirAllocationResult).toEqual(withoutPenalty.heirAllocationResult);
    expect(withPenalty.summaryTable).toEqual(withoutPenalty.summaryTable);
  });

  it("B1-I-5-2: 🔴 상속인 수를 늘려도 가산세 총액은 그대로다 (인원 비례가 아니다)", () => {
    const one = calcInheritanceTax(inh({ filingStatus: "none" }, false));
    const heirs = EXAMPLE_INPUT.heirs;
    expect(heirs.length).toBeGreaterThan(1); // 종합사례는 다인(多人) 상속이다
    // 가산세 = 결정세액 × 20% — 상속인 수가 식에 들어가지 않는다
    expect(one.underreportPenalty).toBe(Math.floor(one.finalTax * 0.2));
  });
});
