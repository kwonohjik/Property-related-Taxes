/**
 * 납부지연가산세 이자율 개정 시행일 경계 기간분할 회귀 테스트
 *
 * 국세기본법 시행령 §27의4 이자율 이력:
 *   ~2019-02-11 : 0.03%  (0.0003)
 *   2019-02-12 ~ 2022-02-14 : 0.025% (0.00025)
 *   2022-02-15 ~ : 0.022% (0.00022)
 *
 * 경과기간이 시행일 경계를 straddle 하면 각 구간 일수 × 해당 시행일 이자율을 합산.
 * (경과조치 가정: 시행일 이후 기간분에 신율)
 */

import { describe, it, expect } from "vitest";
import { calculateDelayedPaymentPenalty } from "@/lib/tax-engine/transfer-tax-penalty";

const unpaidTax = 10_000_000;

describe("납부지연가산세 이자율 경계 기간분할", () => {
  it("2022-02-15 경계 straddle — 구간별 합산 (단일율과 상이)", () => {
    // 납부기한 2021-12-01, 납부 2022-06-01
    // 경과기간: 2021-12-02 ~ 2022-06-01 = 182일
    //   · 2021-12-02 ~ 2022-02-14 (date < 2022-02-15) = 75일 → 0.025%
    //     (12월 30일 + 1월 31일 + 2월 14일)
    //   · 2022-02-15 ~ 2022-06-01 = 107일 → 0.022%
    //     (2월 14일 + 3월 31일 + 4월 30일 + 5월 31일 + 6월 1일)
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2021-12-01"),
      actualPaymentDate: new Date("2022-06-01"),
    });

    expect(result.elapsedDays).toBe(182);

    // breakdown: 두 구간
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0]).toMatchObject({
      dailyRate: 0.00025,
      days: 75,
      effectiveFrom: "2019-02-12",
    });
    expect(result.breakdown[1]).toMatchObject({
      dailyRate: 0.00022,
      days: 107,
      effectiveFrom: "2022-02-15",
    });

    // 구간별 가산세 (법령 이자율에서 독립 도출)
    //   0.025% 구간: 10,000,000 × 75 × 0.00025 = 187,500
    //   0.022% 구간: 10,000,000 × 107 × 0.00022 = 235,400
    expect(result.breakdown[0].amount).toBe(187_500);
    expect(result.breakdown[1].amount).toBe(235_400);

    // 합계 = 422,900
    expect(result.delayedPaymentPenalty).toBe(422_900);

    // 대표 이자율 = 최신(납부일) 구간율
    expect(result.dailyRate).toBe(0.00022);

    // 단일율(구 방식) 400,400 대비 22,500 증가 — 경계 straddle 오산 교정
    // (구: 10,000,000 × 182 × 0.00022 = 400,400)
    expect(result.delayedPaymentPenalty).not.toBe(400_400);
  });

  it("경계 미포함 (전 구간 0.022%) — 기존 단일율 동작 불변", () => {
    // 납부기한 2024-09-30, 납부 2024-10-30 = 30일, 전 기간 2022-02-15 이후
    const result = calculateDelayedPaymentPenalty({
      unpaidTax,
      paymentDeadline: new Date("2024-09-30"),
      actualPaymentDate: new Date("2024-10-30"),
    });

    expect(result.elapsedDays).toBe(30);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]).toMatchObject({
      dailyRate: 0.00022,
      days: 30,
      effectiveFrom: "2022-02-15",
    });
    // 10,000,000 × 30 × 0.00022 = 66,000
    expect(result.delayedPaymentPenalty).toBe(66_000);
    expect(result.dailyRate).toBe(0.00022);
  });
});
