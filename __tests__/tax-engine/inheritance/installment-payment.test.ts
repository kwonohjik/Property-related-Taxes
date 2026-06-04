/**
 * 연부연납 일정표 (상증법 §71·§72·§68·§69) anchor
 * 설계: docs/02-design/features/inheritance-installment-payment.design.md §6
 *
 * 앱 모델: 신고기한 기준 정확히 1년 간격(결정3), 분모 365 고정, 가산금 변동율 일수 안분.
 * 교재 사례(허가지연 1회분 455일)와 1회분 일수가 달라 1회분 값은 앱 모델 재산정값으로 동결(4.3).
 */
import { describe, it, expect } from "vitest";
import {
  calcInstallmentSchedule,
  isInstallmentEligible,
  CURRENT_SURCHARGE_RATE,
} from "@/lib/tax-engine/credits/installment-payment";

const findRow = (
  rows: ReturnType<typeof calcInstallmentSchedule>["rows"],
  no: number,
  segment: "general" | "family_business" = "general",
) => rows.find((r) => r.installmentNo === no && r.segment === segment);

describe("연부연납 일정표 — 적격 판정 (§71①)", () => {
  it("INS-01 결정세액 2천만원 이하 → 부적격", () => {
    expect(isInstallmentEligible(20_000_000)).toBe(false);
    const r = calcInstallmentSchedule({
      finalTax: 20_000_000,
      filingDeadline: new Date("2024-12-31"),
      requestedYears: 5,
      today: new Date("2024-01-01"),
    });
    expect(r.eligible).toBe(false);
    expect(r.rows).toHaveLength(0);
  });

  it("INS-02 경계 — 정확히 2천만원은 부적격, 초과는 적격", () => {
    expect(isInstallmentEligible(20_000_000)).toBe(false);
    expect(isInstallmentEligible(20_000_001)).toBe(true);
  });
});

describe("연부연납 일정표 — 일반 상속 (§68①·§72)", () => {
  // 교재 사례 가 구조(결정세액 6억·5년) + 앱 모델(미래율 1.8% 고정)
  const base = {
    finalTax: 600_000_000,
    filingDeadline: new Date("2024-12-31"),
    requestedYears: 5,
    futureSurchargeRate: 0.018,
    today: new Date("2024-01-01"), // 모든 납부일 > today → 미래율 적용
  };

  it("INS-03 회차·원금·deferredTotal 구조", () => {
    const r = calcInstallmentSchedule(base);
    expect(r.eligible).toBe(true);
    expect(r.appliedYears).toBe(5);
    expect(r.autoShortened).toBe(false);
    expect(r.rows).toHaveLength(6); // 회차 0~5
    expect(r.rows.every((x) => x.principal === 100_000_000)).toBe(true);
    expect(r.deferredTotal).toBe(500_000_000);
    expect(r.totalPrincipal).toBe(600_000_000);
    expect(findRow(r.rows, 0)!.surcharge).toBe(0); // 신고기한 즉납 — 가산금 없음
  });

  it("INS-03 가산금 — 잔액 × 율 (회차2·3·5 = 교재 사례 일치, 회차1·4 앱 모델)", () => {
    const r = calcInstallmentSchedule(base);
    // 회차1: 500M × 365/365 × 1.8% = 9,000,000 (앱 1년 모델 — 사례 11,219,170과 상이)
    expect(findRow(r.rows, 1)!.surcharge).toBe(9_000_000);
    // 회차2: 400M × 1.8% = 7,200,000 (사례 일치)
    expect(findRow(r.rows, 2)!.surcharge).toBe(7_200_000);
    // 회차3: 300M × 1.8% = 5,400,000 (사례 일치)
    expect(findRow(r.rows, 3)!.surcharge).toBe(5_400_000);
    // 회차4: 200M × 366/365 × 1.8% = 3,609,863 (2028 윤년 — 366일)
    expect(findRow(r.rows, 4)!.surcharge).toBe(3_609_863);
    // 회차5: 100M × 1.8% = 1,800,000 (사례 일치)
    expect(findRow(r.rows, 5)!.surcharge).toBe(1_800_000);
    expect(r.totalSurcharge).toBe(
      9_000_000 + 7_200_000 + 5_400_000 + 3_609_863 + 1_800_000,
    );
  });

  it("INS-04 일반 10년 — 회차 0~10, /(10+1)", () => {
    const r = calcInstallmentSchedule({
      finalTax: 550_000_000,
      filingDeadline: new Date("2025-06-30"),
      requestedYears: 10,
      today: new Date("2030-01-01"),
    });
    expect(r.appliedYears).toBe(10);
    expect(r.rows).toHaveLength(11);
    expect(r.rows.every((x) => x.principal === 50_000_000)).toBe(true);
    expect(r.totalPrincipal).toBe(550_000_000);
  });

  it("INS-05 1천만원 단서 자동단축 — 3천만원·10년요청 → 1년", () => {
    const r = calcInstallmentSchedule({
      finalTax: 30_000_000,
      filingDeadline: new Date("2024-12-31"),
      requestedYears: 10,
      today: new Date("2024-01-01"),
    });
    // y=2: 30M/3=10M (초과 아님 ✗), y=1: 30M/2=15M (>10M ✓) → 1년
    expect(r.appliedYears).toBe(1);
    expect(r.autoShortened).toBe(true);
    expect(r.rows).toHaveLength(2); // 회차 0~1
    expect(findRow(r.rows, 0)!.principal).toBe(15_000_000);
    expect(findRow(r.rows, 1)!.principal).toBe(15_000_000);
  });

  it("INS-11 잔액 흡수 — 나누어 떨어지지 않으면 마지막 회차가 잔액", () => {
    const r = calcInstallmentSchedule({
      finalTax: 100_000_001,
      filingDeadline: new Date("2025-06-30"),
      requestedYears: 5,
      today: new Date("2030-01-01"),
    });
    expect(r.appliedYears).toBe(5);
    const sumPrincipal = r.rows.reduce((a, x) => a + x.principal, 0);
    expect(sumPrincipal).toBe(100_000_001); // 합계 = 결정세액
    // floor(100,000,001/6)=16,666,666, 마지막 = 100,000,001 − 16,666,666×5
    expect(findRow(r.rows, 5)!.principal).toBe(100_000_001 - 16_666_666 * 5);
  });
});

describe("연부연납 가산금 — 변동율 일수 안분 (§69②)", () => {
  it("INS-06a 단일 율 구간(2025.3.21~ 3.1%) 정확 계산", () => {
    // filingDeadline 2025-06-30 → 회차1 2026-06-30, 전 구간 3.1% (경계 없음)
    const r = calcInstallmentSchedule({
      finalTax: 100_000_000,
      filingDeadline: new Date("2025-06-30"),
      requestedYears: 1,
      today: new Date("2030-01-01"),
    });
    // per=floor(100M/2)=50M, deferred=50M, 회차1 base=50M, days=365, 3.1%
    expect(findRow(r.rows, 1)!.surcharge).toBe(Math.floor(50_000_000 * 0.031));
  });

  it("INS-06b 가산율 변경일(2025.3.21) 가로지르는 회차 — 두 율 사이값", () => {
    // filingDeadline 2024-09-30 → 회차1 2025-09-30: 구간 2024.10~2025.9 에 2025.3.21(3.5→3.1) 경계 포함
    const r = calcInstallmentSchedule({
      finalTax: 100_000_000,
      filingDeadline: new Date("2024-09-30"),
      requestedYears: 1,
      today: new Date("2030-01-01"),
    });
    const sur = findRow(r.rows, 1)!.surcharge;
    const base = 50_000_000;
    // 전부 3.5% 가정값 > 실제 > 전부 3.1% 가정값 (블렌딩 증명)
    const flat35 = Math.floor((base * 365 * 0.035) / 365);
    const flat31 = Math.floor((base * 365 * 0.031) / 365);
    expect(sur).toBeLessThan(flat35);
    expect(sur).toBeGreaterThan(flat31);
  });

  it("INS-07 미래 회차 — 사용자 입력율 적용", () => {
    const r = calcInstallmentSchedule({
      finalTax: 100_000_000,
      filingDeadline: new Date("2024-12-31"),
      requestedYears: 1,
      futureSurchargeRate: 0.05,
      today: new Date("2024-06-01"), // 회차1(2025-12-31) > today → 미래율
    });
    // 회차1 base 50M, days 365, 5% → 2,500,000
    expect(findRow(r.rows, 1)!.surcharge).toBe(2_500_000);
  });
});

describe("연부연납 — 가업상속 (§68②, 모드 A straight20)", () => {
  // 교재 사례 나: 납부세액 11억, 가업비율 40%
  const fbInput = {
    finalTax: 1_100_000_000,
    filingDeadline: new Date("2025-06-30"),
    requestedYears: 10,
    futureSurchargeRate: 0.018,
    today: new Date("2030-01-01"),
    familyBusiness: {
      familyBusinessValue: 440_000_000, // numer
      familyBusinessDeduction: 0,
      grossEstateValue: 1_100_000_000, // denom → 비율 40%
      mode: "straight20" as const,
    },
  };

  it("INS-09 가업분/일반분 세액 안분 + 매년 원금", () => {
    const r = calcInstallmentSchedule(fbInput);
    // 가업분세액 = 1,100M × 440M/1,100M = 440M → /21 = 20,952,380
    expect(findRow(r.rows, 1, "family_business")!.principal).toBe(
      Math.floor(440_000_000 / 21),
    );
    // 일반분세액 = 660M → /11 = 60,000,000
    expect(findRow(r.rows, 1, "general")!.principal).toBe(60_000_000);
    expect(r.totalPrincipal).toBe(1_100_000_000);
  });

  it("INS-10 결합 표 — 일반 10년 + 가업 20년, 최대 회차 20", () => {
    const r = calcInstallmentSchedule(fbInput);
    const maxNo = Math.max(...r.rows.map((x) => x.installmentNo));
    expect(maxNo).toBe(20); // 가업분 20년
    // 회차 11~20 에는 가업분만 존재(일반분 종료)
    expect(findRow(r.rows, 15, "general")).toBeUndefined();
    expect(findRow(r.rows, 15, "family_business")).toBeDefined();
    // 회차0 에는 두 세그먼트 모두 즉납분 존재
    expect(findRow(r.rows, 0, "general")).toBeDefined();
    expect(findRow(r.rows, 0, "family_business")).toBeDefined();
  });
});

describe("연부연납 — 가업상속 모드 B (grace10, §68①1호)", () => {
  // 가업비율 100% → 전액 가업분, 10년 거치 + 11회 분할(/11) 검증
  const grace = {
    finalTax: 1_100_000_000,
    filingDeadline: new Date("2025-06-30"),
    requestedYears: 10,
    futureSurchargeRate: 0.031,
    today: new Date("2010-01-01"), // 모든 회차 미래 → futureRate 3.1% 고정
    familyBusiness: {
      familyBusinessValue: 1_100_000_000,
      familyBusinessDeduction: 0,
      grossEstateValue: 1_100_000_000, // 비율 100% → fbTax = finalTax
      mode: "grace10" as const,
    },
  };

  it("INS-12 거치 0~9년차 원금 0, 첫 원금 10년차, 매년 = 대상/11", () => {
    const r = calcInstallmentSchedule(grace);
    const fb = r.rows.filter((x) => x.segment === "family_business");

    // 거치: 회차 0~9 원금 0
    for (let k = 0; k <= 9; k++) {
      expect(fb.find((x) => x.installmentNo === k)!.principal).toBe(0);
    }
    // 첫 원금 = 회차 10 (허가 후 10년이 되는 날, §71②1가)
    const per = Math.floor(1_100_000_000 / 11); // = 100,000,000
    expect(fb.find((x) => x.installmentNo === 10)!.principal).toBe(per);
    // 마지막 회차 20, 원금 분할 11회(10~20)
    expect(fb.find((x) => x.installmentNo === 20)!.principal).toBe(
      1_100_000_000 - per * 10,
    );
    // 원금 합계 = 가업분세액 전액
    const sumFb = fb.reduce((a, x) => a + x.principal, 0);
    expect(sumFb).toBe(1_100_000_000);
  });

  it("INS-13 거치기간에도 가산금(이자) 매년 계상 (실무 기준)", () => {
    const r = calcInstallmentSchedule(grace);
    const fb = r.rows.filter((x) => x.segment === "family_business");
    // 거치 회차(예: 5년차) — 원금 0 이지만 가산금 > 0 (잔액 전액 × 율)
    const grace5 = fb.find((x) => x.installmentNo === 5)!;
    expect(grace5.principal).toBe(0);
    expect(grace5.surcharge).toBeGreaterThan(0);
    // 5년차 가산금 = 1.1억×... 전액(11억) × 3.1% (단일 율 구간, 미래)
    expect(grace5.surcharge).toBe(Math.floor(1_100_000_000 * 0.031));
  });

  it("INS-14 최대 회차 20 (거치 10 + 납부 11회 = 20년차까지)", () => {
    const r = calcInstallmentSchedule(grace);
    const maxNo = Math.max(...r.rows.map((x) => x.installmentNo));
    expect(maxNo).toBe(20);
  });
});

describe("연부연납 — 가산율 연혁 + 신고기한 9개월(§67④)", () => {
  it("INS-15 현행 가산율 = 연 3.1% (국기칙 §19의3, 2025.3.21~)", () => {
    // 단일 율 구간(2025.3.21~)·미래 회차로 3.1% 적용 확인
    const r = calcInstallmentSchedule({
      finalTax: 100_000_000,
      filingDeadline: new Date("2026-06-30"),
      requestedYears: 1,
      today: new Date("2030-01-01"),
      // futureSurchargeRate 미지정 → CURRENT_SURCHARGE_RATE(0.031) 기본
    });
    expect(CURRENT_SURCHARGE_RATE).toBe(0.031);
    expect(findRow(r.rows, 1)!.surcharge).toBe(Math.floor(50_000_000 * 0.031));
  });

  it("INS-16 비거주자 신고기한 9개월 — filingDeadline 주입(말일+9개월)", () => {
    // 카드가 §67④로 9개월 산정한 filingDeadline을 엔진에 주입 → 회차0 = 그 일자
    const deadline9 = new Date("2025-03-31"); // 사망 2024-06 → 말일 2024-06-30 +9월 = 2025-03-31
    const r = calcInstallmentSchedule({
      finalTax: 600_000_000,
      filingDeadline: deadline9,
      requestedYears: 5,
      today: new Date("2024-01-01"),
    });
    expect(findRow(r.rows, 0)!.dueDate.getTime()).toBe(deadline9.getTime());
  });
});

describe("연부연납 — 기존 calcInstallmentPayment(증여세 공용) 보존 회귀", () => {
  it("증여세 5년 경로 시그니처·동작 유지", async () => {
    const { calcInstallmentPayment } = await import(
      "@/lib/tax-engine/credits/installment-payment"
    );
    const r = calcInstallmentPayment({ finalTax: 100_000_000, isFamilyBusiness: false });
    expect(r.eligible).toBe(true);
    expect(r.appliedYears).toBe(5); // 증여세 일반 5년 유지
  });

  it("CURRENT_SURCHARGE_RATE export = 3.1%", () => {
    expect(CURRENT_SURCHARGE_RATE).toBe(0.031);
  });
});
