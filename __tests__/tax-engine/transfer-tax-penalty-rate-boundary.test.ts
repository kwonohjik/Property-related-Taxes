/**
 * 납부지연가산세 이자율 개정 시행일 경계 기간분할 회귀 테스트
 *
 * 국세기본법 시행령 §27의4 이자율 이력:
 *   ~2019-02-11 : 0.03%  (0.0003)
 *   2019-02-12 ~ 2022-02-14 : 0.025% (0.00025)
 *   2022-02-15 ~ : 0.022% (0.00022)
 *
 * 산정기간이 시행일 경계를 straddle 하면 각 구간 일수 × 해당 시행일 이자율을 합산.
 * (경과조치 가정: 시행일 이후 기간분에 신율)
 *
 * 🔴 G-03 (2026-09-03): 산정기간은 「법정납부기한의 **다음 날**부터 납부일의 **전날**까지」다
 * (국세기본법 §47의4①1호). 종전 기댓값은 종기를 납부일 당일로 잡아 하루 과다했다.
 *
 * 🔴 G-33 (2026-09-03): 종전에는 **0.022% 구간 2건**만 있어 0.03%(2019-02-11 이전) 구간과
 * 2019-02-12 경계가 전 저장소 무커버리지였다. 실측으로 확인했다 —
 * `DAILY_PENALTY_RATE_2016`을 0.0003 → 0.0004로 바꿔도 가산세 관련 217건이 전부 통과했고,
 * 그 상수는 도달 가능해 세액을 552,000 → 736,000으로 바꿨다(즉 안전망만 없었다).
 * 아래 B-1~B-3이 그 구간을 고정한다.
 */

import { describe, it, expect } from "vitest";
import {
  calculateDelayedPaymentPenalty,
  formatDelayedPaymentFormula,
  formatDelayedPaymentLabel,
} from "@/lib/tax-engine/transfer-tax-penalty";

const unpaidTax = 10_000_000;

describe("납부지연가산세 이자율 경계 기간분할", () => {
  it("2022-02-15 경계 straddle — 구간별 합산 (단일율과 상이)", () => {
    // 납부기한 2021-12-01, 납부 2022-06-01
    // 산정기간: 2021-12-02 ~ 2022-05-31 = 181일 (납부일 06-01의 전날까지)
    //   · 2021-12-02 ~ 2022-02-14 = 75일 → 0.025% (12월 30일 + 1월 31일 + 2월 14일)
    //   · 2022-02-15 ~ 2022-05-31 = 106일 → 0.022% (2월 14일 + 3월 31일 + 4월 30일 + 5월 31일)
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2021-12-01"),
      actualPaymentDate: new Date("2022-06-01"),
    });

    expect(result.elapsedDays).toBe(181);

    // breakdown: 두 구간
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0]).toMatchObject({
      dailyRate: 0.00025,
      days: 75,
      effectiveFrom: "2019-02-12",
    });
    expect(result.breakdown[1]).toMatchObject({
      dailyRate: 0.00022,
      days: 106,
      effectiveFrom: "2022-02-15",
    });

    // 구간별 가산세 (법령 이자율에서 독립 도출 — 분모 100,000 정수 분수연산)
    //   0.025% 구간: 10,000,000 × 75 × 25/100,000 = 187,500
    //   0.022% 구간: 10,000,000 × 106 × 22/100,000 = 233,200
    expect(result.breakdown[0].amount).toBe(187_500);
    expect(result.breakdown[1].amount).toBe(233_200);

    // 합계 = 420,700
    expect(result.delayedPaymentPenalty).toBe(420_700);

    // 대표 이자율 = 최신(납부일) 구간율
    expect(result.dailyRate).toBe(0.00022);

    // 단일율(구 방식) 398,200 대비 22,500 증가 — 경계 straddle 오산 교정
    // (구: 10,000,000 × 181 × 0.00022 = 398,200)
    expect(result.delayedPaymentPenalty).not.toBe(398_200);
  });

  it("경계 미포함 (전 구간 0.022%) — 단일 구간 동작 불변", () => {
    // 납부기한 2024-09-30, 납부 2024-10-30 → 산정 2024-10-01 ~ 2024-10-29 = 29일
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2024-09-30"),
      actualPaymentDate: new Date("2024-10-30"),
    });

    expect(result.elapsedDays).toBe(29);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]).toMatchObject({
      dailyRate: 0.00022,
      days: 29,
      effectiveFrom: "2022-02-15",
    });
    // 10,000,000 × 29 × 22/100,000 = 63,800
    expect(result.delayedPaymentPenalty).toBe(63_800);
    expect(result.dailyRate).toBe(0.00022);
  });

  // ── 🔴 G-33: 0.03% 구간 · 2019-02-12 경계 — 종전 무커버리지 ────────────────

  it("B-1 전 구간 0.03% (2019-02-11 이전) — 종전 무커버리지 구간", () => {
    // 납부기한 2018-06-30, 납부 2018-12-31 → 산정 2018-07-01 ~ 2018-12-30 = 183일
    //   (7월 31 + 8월 31 + 9월 30 + 10월 31 + 11월 30 + 12월 30)
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2018-06-30"),
      actualPaymentDate: new Date("2018-12-31"),
    });

    expect(result.elapsedDays).toBe(183);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]).toMatchObject({
      dailyRate: 0.0003,
      days: 183,
      effectiveFrom: "~2019-02-11",
    });
    // 10,000,000 × 183 × 30/100,000 = 549,000
    expect(result.delayedPaymentPenalty).toBe(549_000);
    expect(result.dailyRate).toBe(0.0003);
  });

  it("B-2 0.03% 구간 1일 — 정수 분수연산 (부동소수면 2,999로 1원 부족)", () => {
    // 🔴 G-15 판별 격자: `10,000,000 × 1 × 0.0003 = 2999.9999999999995` → floor 2,999.
    //    정수 분수연산(× 30 ÷ 100,000)이면 정확히 3,000.
    // 납부기한 2018-06-30, 납부 2018-07-02 → 산정 2018-07-01 ~ 2018-07-01 = 1일
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2018-06-30"),
      actualPaymentDate: new Date("2018-07-02"),
    });

    expect(result.elapsedDays).toBe(1);
    expect(result.delayedPaymentPenalty).toBe(3_000);
    expect(result.delayedPaymentPenalty).not.toBe(2_999);
  });

  it("B-3 2019-02-12 경계 straddle — 0.03% + 0.025% 합산", () => {
    // 납부기한 2019-01-31, 납부 2019-03-31 → 산정 2019-02-01 ~ 2019-03-30 = 58일
    //   · 2019-02-01 ~ 2019-02-11 = 11일 → 0.03%
    //   · 2019-02-12 ~ 2019-03-30 = 47일 → 0.025% (2월 17 + 3월 30)
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2019-01-31"),
      actualPaymentDate: new Date("2019-03-31"),
    });

    expect(result.elapsedDays).toBe(58);
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0]).toMatchObject({
      dailyRate: 0.0003,
      days: 11,
      effectiveFrom: "~2019-02-11",
    });
    expect(result.breakdown[1]).toMatchObject({
      dailyRate: 0.00025,
      days: 47,
      effectiveFrom: "2019-02-12",
    });
    // 10,000,000 × 11 × 30/100,000 = 33,000 · 10,000,000 × 47 × 25/100,000 = 117,500
    expect(result.breakdown[0].amount).toBe(33_000);
    expect(result.breakdown[1].amount).toBe(117_500);
    expect(result.delayedPaymentPenalty).toBe(150_500);
    // 대표 이자율은 납부일이 속한 마지막 구간율
    expect(result.dailyRate).toBe(0.00025);
  });

  // ── 🔴 G-04: 표시 산식이 표시 금액을 재현해야 한다 ─────────────────────────
  //
  // 종전 표시 계층(`transfer-tax-penalty-steps.ts` · `transfer-tax-aggregate.ts` ·
  // `transfer-tax-amendment.ts`)은 구간이 둘이어도 「미납세액 × 전체일수 × 대표 이자율」로
  // 적어, 산식을 그대로 계산하면 표시 금액이 나오지 않았다.

  it("F-1 구간이 둘 이상이면 산식을 구간별로 풀어 쓰고, 각 항의 합이 금액과 일치한다", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2019-01-31"),
      actualPaymentDate: new Date("2019-03-31"),
    });

    expect(formatDelayedPaymentLabel(result)).toBe("납부지연가산세 (총 58일 · 이자율 2구간)");

    const formula = formatDelayedPaymentFormula(result);
    expect(formula).toContain("~2019-02-11 시행분 11일 × 0.0300% = 33,000");
    expect(formula).toContain("2019-02-12 시행분 47일 × 0.0250% = 117,500");

    const parts = [...formula.matchAll(/= ([\d,]+)/g)].map((m) =>
      Number(m[1].replace(/,/g, "")),
    );
    expect(parts.reduce((a, b) => a + b, 0)).toBe(result.delayedPaymentPenalty);

    // 종전의 단일 이자율 표기(대표율 × 전체일수)를 명시적으로 배제한다
    expect(formula).not.toContain("58일 × 0.0250%");
  });

  it("F-2 단일 구간이면 종전 단일 이자율 표기를 유지한다", () => {
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2024-09-30"),
      actualPaymentDate: new Date("2024-10-30"),
    });
    expect(formatDelayedPaymentLabel(result)).toBe("납부지연가산세 (29일 × 0.0220%)");
    expect(formatDelayedPaymentFormula(result)).toBe("미납세액 10,000,000 × 29일 × 0.0220%");
  });
});
