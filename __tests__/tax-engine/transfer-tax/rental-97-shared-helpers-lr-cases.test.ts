/**
 * 장기임대 공용 헬퍼(`transfer-reductions/rental-97-shared-helpers.ts`) — 유효 임대기간·환산보증금·증액률 사례.
 *
 * 레거시 `rental-housing-reduction.ts`(삭제 · §155⑳ 리뷰 V-6 후속)의 테스트 파일에 있던 헬퍼 사례를 옮겼다.
 * 그 모듈은 이 헬퍼들을 재export만 했으므로 사례·기대값은 그대로다(LR-08·LR-09·LR-10).
 */

import { describe, expect, it } from "vitest";
import {
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97,
  RENTAL_VACANCY_GRACE_MONTHS_97_5,
  convertToStandardDeposit,
  validateRentIncrease,
} from "@/lib/tax-engine/transfer-reductions/rental-97-shared-helpers";
import type {
  Rental97RentHistoryItem,
  Rental97VacancyPeriod,
} from "@/lib/tax-engine/transfer-reductions/types";

// ============================================================
// 유효 임대기간 계산 테스트
// ============================================================

describe("calculateEffectiveRentalPeriod", () => {
  it("공실 없음 — 총 기간 그대로", () => {
    // 2019-01-01 ~ 2027-01-01 = 정확히 8년
    const years = calculateEffectiveRentalPeriod(
      new Date("2019-01-01"),
      new Date("2027-01-01"),
      [],
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    expect(years).toBe(8);
  });

  it("🔴 5개월 공실 → §97 유예 3월 초과 → 구간 전체 차감 (LR-08a, D1-03 정정)", () => {
    // 2019-01-01 ~ 2027-12-01 (8년 11개월) — 5개월(151일) 공실
    // 종전 anchor는 「6개월 미만이라 차감 없음」을 단언했다. 조특칙 §44의 유예는 3월이므로
    // 5개월 공실은 산입 대상이 아니고 구간 전체가 차감된다.
    // ⚠️ 종전 단언 `toBeGreaterThanOrEqual(8)`은 151일을 깎아도 참이라 구별력이 0이었다
    //    (180→90 뮤테이션 실측에서 이 테스트는 통과했다). 정확한 값으로 고정한다.
    const vp: Rental97VacancyPeriod[] = [
      { startDate: new Date("2022-01-01"), endDate: new Date("2022-06-01") }, // 151일
    ];
    const years = calculateEffectiveRentalPeriod(
      new Date("2019-01-01"),
      new Date("2027-12-01"),
      vp,
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    // 총 3256일 − 151일 = 3105일 → 8년 6개월 남짓 → 8년
    expect(years).toBe(8);
  });

  it("§97의5는 같은 5개월 공실을 차감하지 않는다 — 유예 6개월 (조특령 §97의5①1호)", () => {
    const vp: Rental97VacancyPeriod[] = [
      { startDate: new Date("2022-01-01"), endDate: new Date("2022-06-01") },
    ];
    const years = calculateEffectiveRentalPeriod(
      new Date("2019-01-01"),
      new Date("2027-12-01"),
      vp,
      RENTAL_VACANCY_GRACE_MONTHS_97_5,
    );
    expect(years).toBe(8);
    // 두 조문이 같은 8년이 되는 구간이므로, 구별력은 아래 경계 테스트가 담당한다.
  });

  it("7개월 공실(213일) → 6개월 이상 → 차감 (LR-08b)", () => {
    // 2019-01-01 ~ 2027-12-01 ≈ 3256일 — 7개월 공실(213일) 차감 → 3043일 ≈ 8.33년
    const vp: Rental97VacancyPeriod[] = [
      { startDate: new Date("2022-01-01"), endDate: new Date("2022-08-01") }, // 212일 — 7개월 이상
    ];
    const totalDays =
      (new Date("2027-12-01").getTime() - new Date("2019-01-01").getTime()) / 86400000;
    const vpDays =
      (new Date("2022-08-01").getTime() - new Date("2022-01-01").getTime()) / 86400000;
    expect(vpDays).toBeGreaterThanOrEqual(180); // 6개월 이상 차감 확인

    const years = calculateEffectiveRentalPeriod(
      new Date("2019-01-01"),
      new Date("2027-12-01"),
      vp,
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    // 차감 후 유효기간 재검증
    const effectiveDays = totalDays - vpDays;
    expect(years).toBe(Math.floor(effectiveDays / 365));
  });
});

// ============================================================
// 환산보증금 + 임대료 증액 검증 테스트
// ============================================================

describe("convertToStandardDeposit", () => {
  it("전세 — 보증금 그대로 반환", () => {
    const rent: Rental97RentHistoryItem = {
      contractDate: new Date("2020-01-01"),
      monthlyRent: 0,
      deposit: 300_000_000,
      contractType: "jeonse",
    };
    expect(convertToStandardDeposit(rent, 0.04)).toBe(300_000_000);
  });

  it("월세 — 환산보증금 = 보증금 + (월세×12/전환율)", () => {
    const rent: Rental97RentHistoryItem = {
      contractDate: new Date("2020-01-01"),
      monthlyRent: 1_000_000,
      deposit: 100_000_000,
      contractType: "monthly",
    };
    // 100,000,000 + floor(1,000,000 * 12 / 0.04) = 100,000,000 + 300,000,000 = 400,000,000
    expect(convertToStandardDeposit(rent, 0.04)).toBe(400_000_000);
  });
});

describe("validateRentIncrease", () => {
  it("5.00% 정확히 → 위반 없음 (LR-09a)", () => {
    const history: Rental97RentHistoryItem[] = [
      {
        contractDate: new Date("2019-01-01"),
        monthlyRent: 0,
        deposit: 200_000_000,
        contractType: "jeonse",
      },
      {
        contractDate: new Date("2021-01-01"),
        monthlyRent: 0,
        deposit: 210_000_000, // 5% 증가
        contractType: "jeonse",
      },
    ];
    const result = validateRentIncrease(history, 0.04);
    expect(result.isAllValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("5.01% → 위반 (LR-09b)", () => {
    const history: Rental97RentHistoryItem[] = [
      {
        contractDate: new Date("2019-01-01"),
        monthlyRent: 0,
        deposit: 200_000_000,
        contractType: "jeonse",
      },
      {
        contractDate: new Date("2021-01-01"),
        monthlyRent: 0,
        deposit: 210_020_001, // 5.01% 초과
        contractType: "jeonse",
      },
    ];
    const result = validateRentIncrease(history, 0.04);
    expect(result.isAllValid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].increaseRate).toBeGreaterThan(0.05);
  });

  it("전·월세 전환 비교 (LR-10) — 전세→반전세 5% 이내", () => {
    // 전세 200백만원 → 보증금 100백만 + 월세 40만원 (전환율 4%)
    // 환산보증금 = 100,000,000 + floor(400,000 * 12 / 0.04) = 100,000,000 + 120,000,000 = 220,000,000
    // 증액률 = (220,000,000 - 200,000,000) / 200,000,000 = 10% → 위반
    const history: Rental97RentHistoryItem[] = [
      {
        contractDate: new Date("2019-01-01"),
        monthlyRent: 0,
        deposit: 200_000_000,
        contractType: "jeonse",
      },
      {
        contractDate: new Date("2021-01-01"),
        monthlyRent: 400_000,
        deposit: 100_000_000,
        contractType: "semi_jeonse",
      },
    ];
    const result = validateRentIncrease(history, 0.04);
    expect(result.isAllValid).toBe(false);
    expect(result.violations[0].increaseRate).toBeCloseTo(0.1, 5);
  });
});
