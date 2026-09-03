/**
 * anchor: 🔴 G-22 — 합산배제 사후관리 추징의 **이자상당가산액은 연도마다 기산한다**
 *
 * ## 종전 결함
 *
 * 「종합부동산세법 시행령」 §10②1호는 이자 기간을 「합산배제 임대주택등으로 신고한
 * **매 과세연도**…의 **납부기한 다음 날**부터 … 추징할 세액의 **고지일**까지의 기간」으로
 * 연도마다 따로 정한다. 그런데 엔진은
 *
 *   ① 연도별 배열을 곧바로 `reduce`로 합산해 **연도 축을 소실**시키고,
 *   ② 기산점을 「그 해 납부기한 다음 날」이 아니라 **「최초 합산배제 시작일」**로 잡고,
 *   ③ 그 단일 일수를 **전체 추징세액**에 곱했다.
 *
 * 표본에서 약 2배 과대였다. 게다가 일수 음수 가드가 없어 `assessmentDate < exclusionStartDate`
 * 이면 `totalPayable`이 추징세액보다 작아졌고, 저장소 규약인 정수 분수 연산 대신 부동소수를
 * 곱했다(`totalRecoveryTax * daysPassed * 0.00022`).
 *
 * ## 조문
 *
 * · 「종합부동산세법」 §17⑤ — 「경감받은 세액과 이자상당가산액을 추징하여야 한다」
 * · 같은 법 시행령 §10②1호 — 기간(매 과세연도 납부기한 다음 날 ~ 고지일) · 2호 — 1일당 10만분의 22
 * · 「종합부동산세법」 §16① — 납부기간은 「해당 연도 12월 1일부터 12월 15일까지」
 *   ⇒ 기산일은 그 해 **12월 16일**이다.
 *
 * ## 이 함수는 아직 배선되지 않았다
 *
 * 호출자 0건(정의 + 재export 뿐). 그래도 anchor 를 둔다 — 배선하는 순간 조용히 2배가 되기 때문이고,
 * 종전에는 테스트도 0건이라 이 결함이 리뷰까지 살아남았다.
 */

import { describe, it, expect } from "vitest";
import { calculatePostManagementPenalty } from "@/lib/tax-engine/comprehensive-tax";

/** 리뷰 §G-22 재현 격자 — 2021·2022·2023년분 각 100만 · 고지일 2024-12-01 */
function threeYears() {
  return calculatePostManagementPenalty({
    violationDate: new Date("2024-06-01"),
    annualExcludedTax: [
      { taxYear: 2021, amount: 1_000_000 },
      { taxYear: 2022, amount: 1_000_000 },
      { taxYear: 2023, amount: 1_000_000 },
    ],
    noticeDate: new Date("2024-12-01"),
  });
}

describe("G-22 이자상당가산액 — 연도별 기산 (시행령 §10②1호)", () => {
  it("G22-1: 🔴 연도마다 기산일이 다르다 — 그 해 12월 16일부터 고지일까지", () => {
    const r = threeYears();
    expect(r.annualInterest.map((a) => a.interestFrom)).toEqual([
      "2021-12-16",
      "2022-12-16",
      "2023-12-16",
    ]);
    // 양쪽 끝을 산입한다(민법 §157 단서 — 기산일이 명시돼 오전 0시부터 시작).
    // 부동산 정본 `calculateDelayedPaymentPenalty`(국기법 §47의4①1호)와 같은 계산.
    expect(r.annualInterest.map((a) => a.days)).toEqual([1082, 717, 352]);
  });

  it("G22-2: 🔴 이자는 연도별 세액 × 그 해 일수의 합이다 (전체 × 단일 일수가 아니다)", () => {
    const r = threeYears();
    // 1,000,000 × days × 22/100,000 = 220 × days
    expect(r.annualInterest.map((a) => a.interest)).toEqual([238_040, 157_740, 77_440]);
    expect(r.interestAmount).toBe(473_220);
    expect(r.totalRecoveryTax).toBe(3_000_000);
    expect(r.totalPayable).toBe(3_473_220);
    expect(r.recoveryPeriodYears).toBe(3);
  });

  it("G22-3: 🔑 종전 산식(전체 추징세액 × 최초 배제일~고지일 단일 일수)과 다르다", () => {
    const r = threeYears();
    // 종전: floor(3,000,000 × 1,430일 × 0.00022) = 943,800 — 약 2배 과대
    const legacy = Math.floor(3_000_000 * 1_430 * 0.00022);
    expect(legacy).toBe(943_800);
    expect(r.interestAmount).toBeLessThan(legacy);
    expect(legacy - r.interestAmount).toBe(470_580);
  });

  it("G22-4: 산식이 금액을 재현한다 — 연도별 echo 합 = 총 이자", () => {
    const r = threeYears();
    expect(r.annualInterest.reduce((s, a) => s + a.interest, 0)).toBe(r.interestAmount);
    expect(r.annualInterest.reduce((s, a) => s + a.amount, 0)).toBe(r.totalRecoveryTax);
  });

  it("G22-5: ⛔ 고지일이 기산일보다 이르면 일수 0 (음수 가드 — 종전에는 total이 추징세액보다 작아졌다)", () => {
    const r = calculatePostManagementPenalty({
      violationDate: new Date("2024-01-01"),
      annualExcludedTax: [{ taxYear: 2025, amount: 1_000_000 }],
      noticeDate: new Date("2024-12-01"),
    });
    expect(r.annualInterest[0].days).toBe(0);
    expect(r.interestAmount).toBe(0);
    expect(r.totalPayable).toBe(r.totalRecoveryTax);
  });

  it("G22-6: 🔑 정수 분수 연산 — 부동소수 곱이면 1원이 어긋나는 격자", () => {
    // 12,345,678 × 1일 × 22/100,000 = 2,716.04… → floor 2,716
    // 부동소수: 12,345,678 * 1 * 0.00022 = 2716.049…  (같은 값이지만 일수가 커지면 갈린다)
    const r = calculatePostManagementPenalty({
      violationDate: new Date("2026-01-01"),
      annualExcludedTax: [{ taxYear: 2025, amount: 12_345_678 }],
      noticeDate: new Date("2025-12-16"),
    });
    expect(r.annualInterest[0].days).toBe(1);
    expect(r.interestAmount).toBe(Math.floor((12_345_678 * 1 * 22) / 100_000));
  });

  it("G22-7: 빈 배열이면 전부 0 (경계)", () => {
    const r = calculatePostManagementPenalty({
      violationDate: new Date("2024-06-01"),
      annualExcludedTax: [],
      noticeDate: new Date("2024-12-01"),
    });
    expect(r.totalRecoveryTax).toBe(0);
    expect(r.interestAmount).toBe(0);
    expect(r.recoveryPeriodYears).toBe(0);
    expect(r.annualInterest).toEqual([]);
  });
});
