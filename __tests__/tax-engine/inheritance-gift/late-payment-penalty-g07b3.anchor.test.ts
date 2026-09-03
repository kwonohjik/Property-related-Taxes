/**
 * anchor: G-07 **B3** — 상속·증여 납부지연가산세 (「국세기본법」 §47의4)
 *
 * 계획서 `docs/00-pm/inheritance-gift-penalty-g07.plan.md` §8.3. **G-07의 마지막 파트**다.
 *
 * ## 고정하는 계약
 *
 * 1. **산정기간은 「법정납부기한의 다음 날부터 납부일의 전날까지」** — §47의4①1호.
 *    부동산 정본이 G-03 에서 정정한 그 산식을 그대로 쓴다(1일 지연은 기간 0일).
 * 2. **신고 상태와 독립** — §47의4①1호는 §47의2·§47의3을 요건으로 하지 않는다.
 *    정기·정확 신고를 했어도 납부가 늦으면 붙는다.
 * 3. 🔴 **§47의4③에 상속·증여 전용 적용제외가 둘 있다**:
 *    · **4호** 법인세 경정에 따른 증여의제이익 변경(부정행위로 인한 경정은 제외)
 *      — §47의3④1호 **라목과 같은 사실**이라 입력을 공유한다.
 *    · **6호** 기한 내 신고·**납부** 후 평가로 결정·경정 — 「납부」 요건이 추가돼
 *      다목(§47의3④1호) 입력으로 **대체할 수 없다**.
 * 4. ③은 감면(§48②)이 아니라 **적용 배제**다 — 감면율이 아니라 0이다.
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceGiftLatePayment } from "@/lib/tax-engine/inheritance-gift-penalty";
import type { InheritanceGiftPenaltyInput } from "@/lib/tax-engine/inheritance-gift-penalty";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { buildFilingForm9Data } from "@/lib/calc/filing-form-9-data";
import { validateInheritanceTaxInput } from "@/lib/calc/inheritance-validate";
import { EXAMPLE_INPUT } from "../inheritance/fixtures/comprehensive-case-pdf.fixture";

/** 기한 2025-04-30 · 미납 1억 */
function run(o: Partial<InheritanceGiftPenaltyInput> = {}) {
  return calcInheritanceGiftLatePayment({
    filingStatus: "on_time",
    unpaidTax: 100_000_000,
    paymentDeadline: "2025-04-30",
    ...o,
  });
}

describe("B3-1 산정기간 — 「납부기한 다음 날부터 납부일의 전날까지」 (§47의4①1호)", () => {
  it("B3-1-1: 🔴 기한 당일 납부 → 0일 → 가산세 없음", () => {
    const r = run({ actualPaymentDate: "2025-04-30" });
    expect(r.elapsedDays).toBe(0);
    expect(r.penalty).toBe(0);
  });

  it("B3-1-2: 🔴 1일 지연(다음 날 납부) → 기간이 0일이라 가산세 없음", () => {
    // 「다음 날부터 **전날까지**」라 5/1 납부는 [5/1, 4/30] = 공집합이다.
    const r = run({ actualPaymentDate: "2025-05-01" });
    expect(r.elapsedDays).toBe(0);
    expect(r.penalty).toBe(0);
  });

  it("B3-1-3: 🔴 2일 지연 → 1일 (경계 — G-03 이 정정한 그 지점)", () => {
    expect(run({ actualPaymentDate: "2025-05-02" }).elapsedDays).toBe(1);
  });

  it("B3-1-4: 100일째 납부 → 99일", () => {
    const r = run({ actualPaymentDate: "2025-08-08" }); // 4/30 + 100일
    expect(r.elapsedDays).toBe(99);
    // 미납 1억 × 99일 × 0.022% = 2,178,000
    expect(r.penalty).toBe(2_178_000);
    expect(r.unpaidTax).toBe(100_000_000);
  });

  it("B3-1-5: 🔑 이자율 구간 내역이 실린다 — 단일 이자율로 적으면 산식이 금액을 못 낸다", () => {
    const r = run({ actualPaymentDate: "2025-08-08" });
    expect(r.breakdown.length).toBeGreaterThan(0);
    const sum = r.breakdown.reduce((n, seg) => n + seg.amount, 0);
    expect(sum).toBe(r.penalty);
  });
});

describe("B3-2 게이트 — 입력이 없으면 만들지 않는다", () => {
  it("B3-2-1: 미납세액이 없으면 0", () => {
    expect(run({ unpaidTax: 0, actualPaymentDate: "2025-08-08" }).penalty).toBe(0);
  });

  it("B3-2-2: 🔑 법정납부기한이 없으면 0 — ⑧ validate 가 사전 차단한다", () => {
    expect(
      calcInheritanceGiftLatePayment({
        filingStatus: "on_time",
        unpaidTax: 100_000_000,
        actualPaymentDate: "2025-08-08",
      }).penalty,
    ).toBe(0);
  });

  it("B3-2-3: ⛔ 부정형 날짜는 0 (방어적)", () => {
    expect(run({ paymentDeadline: "2025-13-99" }).penalty).toBe(0);
  });
});

describe("B3-3 🔑 신고 상태와 독립이다 (§47의2·§47의3을 요건으로 하지 않는다)", () => {
  it.each(["on_time", "late", "none"] as const)(
    "B3-3-1: %s — 세 상태 모두에서 같은 금액이 나온다",
    (filingStatus) => {
      const r = run({ filingStatus, actualPaymentDate: "2025-08-08" });
      expect(r.penalty).toBe(2_178_000);
    },
  );

  it("B3-3-2: 🔴 정기·정확 신고(과소신고 아님)에도 붙는다 — 가장 흔한 사안이다", () => {
    const r = run({
      filingStatus: "on_time",
      isUnderReported: false,
      actualPaymentDate: "2025-08-08",
    });
    expect(r.penalty).toBe(2_178_000);
  });
});

describe("B3-4 🔴 §47의4③ 적용제외 — 상속·증여 전용 두 호", () => {
  it("B3-4-1: 6호 — 기한 내 신고·납부 후 평가 경정이면 적용하지 않는다", () => {
    const r = run({ actualPaymentDate: "2025-08-08", paidOnTimeThenRevalued: true });
    expect(r.penalty).toBe(0);
    expect(r.exclusionApplied).toBe("revalued_after_timely_filing");
    expect(r.steps[0].legalBasis).toBe("국세기본법 §47의4③");
  });

  it("B3-4-2: 4호 — 법인세 경정에 따른 증여의제이익 변경 (§47의3④1호 라목과 같은 사실)", () => {
    const r = run({
      actualPaymentDate: "2025-08-08",
      underReportExclusion: "corporate_adjustment",
    });
    expect(r.penalty).toBe(0);
    expect(r.exclusionApplied).toBe("corporate_adjustment");
  });

  it("B3-4-3: 🔴 4호 단서 — 법인세 경정이 부정행위에 기인하면 적용제외가 성립하지 않는다", () => {
    const r = run({
      actualPaymentDate: "2025-08-08",
      underReportExclusion: "corporate_adjustment",
      corporateAdjustmentByFraud: true,
    });
    expect(r.exclusionApplied).toBeUndefined();
    expect(r.penalty).toBe(2_178_000);
  });

  it("B3-4-4: ⛔ 다른 적용제외 목(가·나·다)은 납부지연을 배제하지 않는다", () => {
    // §47의4③은 §47의3④1호와 **다른 목록**이다 — 가·나·다목은 여기 없다.
    for (const ex of ["ownership_dispute", "deduction_error", "supplementary_valuation"] as const) {
      const r = run({ actualPaymentDate: "2025-08-08", underReportExclusion: ex });
      expect(r.exclusionApplied, ex).toBeUndefined();
      expect(r.penalty, ex).toBe(2_178_000);
    }
  });

  it("B3-4-5: 6호가 4호보다 먼저 판정된다 (둘 다면 6호를 밝힌다)", () => {
    const r = run({
      actualPaymentDate: "2025-08-08",
      paidOnTimeThenRevalued: true,
      underReportExclusion: "corporate_adjustment",
    });
    expect(r.exclusionApplied).toBe("revalued_after_timely_filing");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 🔴 상속 축 — 뮤테이션이 찾은 구멍 3곳 (M9·M10·M11)
//
// B3 anchor 를 증여 route 로만 관통시켰더니 상속 쪽 세 지점이 **뮤테이션에 GREEN** 이었다:
//   M9  상속 엔진 결과에서 `latePaymentPenalty: 0` 으로 되돌려도 통과
//   M10 별지9호 ㊲ 를 상수 0 으로 되돌려도 통과
//   M11 ⑧ validate 의 「납부기한 미입력」 차단을 지워도 통과
// 세 지점을 각각 고정한다.
// ────────────────────────────────────────────────────────────────────────────

/** 상속 종합사례 픽스처 + 납부지연 축 (기한 2023-09-30 = §67① 신고기한) */
function inheritanceWithLate(fp: Partial<InheritanceGiftPenaltyInput> = {}) {
  return calcInheritanceTax({
    ...EXAMPLE_INPUT,
    filingPenalty: {
      filingStatus: "on_time",
      unpaidTax: 100_000_000,
      paymentDeadline: "2023-09-30",
      actualPaymentDate: "2024-01-07", // 산정기간 [2023-10-01, 2024-01-06] = 98일
      ...fp,
    },
  });
}

describe("B3-5 상속 엔진 결과 배선 (M9)", () => {
  it("B3-5-1: 🔴 `latePaymentPenalty` 가 실값으로 실린다", () => {
    const r = inheritanceWithLate();
    // 미납 1억 × 98일 × 0.022% = 2,156,000
    expect(r.latePaymentPenalty).toBe(2_156_000);
    expect(r.latePaymentPenaltyDetail!.elapsedDays).toBe(98);
  });

  it("B3-5-2: 🔑 `finalTax`(결정세액)는 불변 — 총액만 늘어난다", () => {
    const plain = calcInheritanceTax(EXAMPLE_INPUT);
    const late = inheritanceWithLate();
    expect(late.finalTax).toBe(plain.finalTax);
    expect(late.totalPayableWithPenalty).toBe(plain.finalTax + 2_156_000);
  });

  it("B3-5-3: 신고불성실과 **합산**된다 (두 축은 독립)", () => {
    const both = inheritanceWithLate({ isUnderReported: true, originalFiledTax: 100_000_000 });
    expect(both.underreportPenalty!).toBeGreaterThan(0);
    expect(both.latePaymentPenalty).toBe(2_156_000);
    expect(both.totalPayableWithPenalty).toBe(
      both.finalTax + both.underreportPenalty! + both.latePaymentPenalty!,
    );
  });
});

describe("B3-6 별지9호 ㊲ 배선 (M10)", () => {
  const form9 = (r: ReturnType<typeof calcInheritanceTax>) =>
    buildFilingForm9Data(r, EXAMPLE_INPUT.heirs, EXAMPLE_INPUT.deathDate);
  /** 표 행 — 좌·우를 합쳐 찾는다(㊲ 는 우측이다) */
  const cell = (r: ReturnType<typeof calcInheritanceTax>, n: string) => {
    const f = form9(r);
    return [...f.leftRows, ...f.rightRows].find((x) => x.number === n)!;
  };

  it("B3-6-1: 🔴 ㊲ 가 dash 에서 금액으로 바뀐다", () => {
    expect(cell(calcInheritanceTax(EXAMPLE_INPUT), "㊲").display).toBe("dash");
    const late = cell(inheritanceWithLate(), "㊲");
    expect(late.display).toBe("amount");
    expect(late.amount).toBe(2_156_000);
  });

  it("B3-6-2: 🔑 ㊳ 「납부할세액(합계액)」이 ㊲ 를 포함한다 — 산식이 금액을 재현한다", () => {
    const v = form9(inheritanceWithLate()).values;
    // ㊳ = max(0, ㉔ + ㉕ − ㉖ − ㉗) + ㊱ + ㊲
    expect(v["㊳"]).toBe(
      Math.max(0, v["㉔"] + v["㉕"] - v["㉖"] - v["㉗"]) + v["㊱"] + v["㊲"],
    );
    // ⛔ ㊲ 를 상수 0 으로 되돌리면 이 등식이 깨진다
    expect(v["㊲"]).toBe(2_156_000);
  });
});

describe("B3-7 ⑧ validate — 납부기한 미입력 차단 (M11)", () => {
  it("B3-7-1: 🔴 미납세액이 있는데 납부기한이 없으면 차단한다", () => {
    const msg = validateInheritanceTaxInput({
      ...EXAMPLE_INPUT,
      filingPenalty: { filingStatus: "on_time", unpaidTax: 100_000_000 },
    });
    expect(msg).toContain("법정납부기한");
    expect(msg).toContain("§47의4");
  });

  it("B3-7-2: ⛔ 기한이 있으면 통과한다 (양성 대조군)", () => {
    expect(
      validateInheritanceTaxInput({
        ...EXAMPLE_INPUT,
        filingPenalty: {
          filingStatus: "on_time",
          unpaidTax: 100_000_000,
          paymentDeadline: "2023-09-30",
        },
      }),
    ).toBeNull();
  });

  it("B3-7-3: ⛔ 미납세액이 0이면 기한이 없어도 통과한다", () => {
    expect(
      validateInheritanceTaxInput({
        ...EXAMPLE_INPUT,
        filingPenalty: { filingStatus: "on_time", unpaidTax: 0 },
      }),
    ).toBeNull();
  });
});
