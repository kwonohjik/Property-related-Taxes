/**
 * anchor: 합산배제 추징 계산기 엔진 — 이자 구간·기산일 이월·§10③ 추징 배제 (종합부동산세법 §17⑤1호 · 시행령 §10)
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §5.1·§5.2·§5.6 (Q-1~Q-12 확정)
 *
 * ## 손계산 규약
 * 이자 = 경감세액 × 일수 × N / 100,000 (구간마다 원 미만 절사 후 합산 — Q-1). 일수는 [기산일, 고지일] 양끝 포함.
 * 기산일 = 납부기한(12.15.)에 국세기본법 §5①(토·일·공휴일이면 다음날)을 적용한 기한의 다음 날(Q-2).
 * 구간: ~2019.2.11. N=30 · 2019.2.12.~2022.2.14. N=25 · 2022.2.15.~ N=22 (부칙<제29524호> §4 · <제32425호> §5).
 * 시료 값은 엔진과 무관한 epoch-day 정수 계산(BigInt)으로 따로 재계산해 대조했다(2026-11-17).
 */
import { describe, it, expect } from "vitest";
import {
  calculateRecaptureAnnualInterest,
  recaptureInterestStart,
} from "@/lib/tax-engine/comprehensive-recapture-interest";
import { calculatePostManagementPenalty } from "@/lib/tax-engine/comprehensive-tax";
import { calculateRecapture, evaluateRecaptureExemption } from "@/lib/tax-engine/comprehensive-recapture";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";
import type { RecaptureExemptionInput } from "@/lib/tax-engine/types/comprehensive-recapture.types";

const d = (s: string) => new Date(s); // UTC 자정

/** 한 해 이자만 본다 */
function one(taxYear: number, amount: number, notice: string) {
  return calculateRecaptureAnnualInterest([{ taxYear, amount }], d(notice));
}

describe("이자 구간 분할 — 율 경계 (Q-1)", () => {
  // 2021년분: 12.15.(수) → 기산일 2021-12-16
  it("A1: 고지 2022-02-14(개정 전날) — 61일 전부 25구간 = 15,250", () => {
    // 2021-12-16~12-31 16일 + 1월 31일 + 2월 14일 = 61일 · 1,000,000 × 61 × 25 / 100,000 = 15,250
    const { annualInterest: [a] } = one(2021, 1_000_000, "2022-02-14");
    expect(a.interestFrom).toBe("2021-12-16");
    expect(a.days).toBe(61);
    expect(a.segments).toEqual([{ from: "2021-12-16", to: "2022-02-14", days: 61, ratePer100k: 25, interest: 15_250 }]);
    expect(a.interest).toBe(15_250);
  });

  it("A2: 고지 2022-02-15(개정일) — 마지막 하루만 22구간 = 15,250 + 220 = 15,470", () => {
    const { annualInterest: [a] } = one(2021, 1_000_000, "2022-02-15");
    expect(a.days).toBe(62);
    expect(a.segments.map((g) => [g.days, g.ratePer100k, g.interest])).toEqual([[61, 25, 15_250], [1, 22, 220]]);
    expect(a.interest).toBe(15_470);
  });

  // 2017년분: 12.15.(금) → 기산일 2017-12-16
  it("B1: 고지 2019-02-11(25구간 시행 전날) — 423일 전부 30구간 = 1,269,000", () => {
    // 2017-12-16~12-31 16일 + 2018년 365일 + 2019-01 31일 + 2019-02-01~11 11일 = 423일 · 10,000,000 × 423 × 30 / 100,000
    const { annualInterest: [a] } = one(2017, 10_000_000, "2019-02-11");
    expect(a.days).toBe(423);
    expect(a.segments).toHaveLength(1);
    expect(a.interest).toBe(1_269_000);
  });

  it("B2: 고지 2019-02-12(시행일) — 마지막 하루만 25구간 = 1,269,000 + 2,500 = 1,271,500", () => {
    const { annualInterest: [a] } = one(2017, 10_000_000, "2019-02-12");
    expect(a.days).toBe(424);
    expect(a.segments.map((g) => [g.days, g.ratePer100k, g.interest])).toEqual([[423, 30, 1_269_000], [1, 25, 2_500]]);
    expect(a.interest).toBe(1_271_500);
  });

  it("C: 3구간 · 구간마다 절사 — 3,333,333원 · 2017-12-16~2022-03-01 = 1,349,831 (연도 합계에서 1회 절사하면 1,349,833)", () => {
    // 423일 × 30: 3,333,333 × 423 × 30 / 100,000 = 422,999.9… → 422,999
    // 1,099일 × 25 (2019-02-12~2022-02-14): → 915,833.1… → 915,833
    // 15일 × 22 (2022-02-15~03-01): → 10,999.99… → 10,999   합 1,349,831
    // 1회 절사: floor((423×30 + 1,099×25 + 15×22) × 3,333,333 / 100,000) = floor(1,349,833.26…) = 1,349,833
    const { annualInterest: [a], notices } = one(2017, 3_333_333, "2022-03-01");
    expect(a.segments.map((g) => [g.days, g.ratePer100k, g.interest])).toEqual([
      [423, 30, 422_999],
      [1_099, 25, 915_833],
      [15, 22, 10_999],
    ]);
    expect(a.days).toBe(1_537);
    expect(a.interest).toBe(1_349_831);
    expect(notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_SEGMENT_FLOOR_NOTICE);
  });

  it("구간이 하나뿐이면 구간별 절사 확인 필요 안내를 붙이지 않는다", () => {
    expect(one(2023, 1_000_000, "2024-12-01").notices).toEqual([]);
  });

  it("고지일이 기산일보다 앞서면 일수 0·구간 없음·이자 0 (G-22 5와 같은 경계)", () => {
    const { annualInterest: [a] } = one(2024, 1_000_000, "2024-12-16"); // 2024 기산일은 2024-12-17
    expect(a).toMatchObject({ interestFrom: "2024-12-17", days: 0, interest: 0, segments: [] });
    // 고지일 = 기산일이면 양끝 산입으로 1일
    expect(one(2024, 1_000_000, "2024-12-17").annualInterest[0].days).toBe(1);
  });
});

describe("기산일 — 납부기한 12.15.의 토·일·공휴일 이월 (국세기본법 §5① · Q-2)", () => {
  it("2018: 12.15.(토)·12.16.(일) → 납부기한 12.17.(월) → 기산일 12.18. · 연속 휴일도 반복 이월", () => {
    const s = recaptureInterestStart(2018);
    expect([s.deadline.toISOString().slice(0, 10), s.from.toISOString().slice(0, 10), s.extended]).toEqual(["2018-12-17", "2018-12-18", true]);
  });

  it("2019·2024: 12.15.(일) → 납부기한 12.16.(월) → 기산일 12.17.", () => {
    for (const y of [2019, 2024]) {
      const s = recaptureInterestStart(y);
      expect([s.deadline.toISOString().slice(0, 10), s.from.toISOString().slice(0, 10)]).toEqual([`${y}-12-16`, `${y}-12-17`]);
    }
  });

  it("평일(2017 금 · 2021 수)은 이월 없음 — 기산일 12.16.", () => {
    expect(recaptureInterestStart(2017).extended).toBe(false);
    expect(recaptureInterestStart(2017).from.toISOString().slice(0, 10)).toBe("2017-12-16");
    expect(recaptureInterestStart(2021).from.toISOString().slice(0, 10)).toBe("2021-12-16");
  });

  it("2018년분 100만 · 고지 2024-12-01 = 516,170 (12.16. 고정이면 516,770 — 이월로 2일 × 30 × 1,000,000 / 100,000 = 600 감소)", () => {
    // 기산일 2018-12-18: 2018-12-18~2019-02-11 = 14 + 31 + 11 = 56일 × 30 = 16,800
    //                    2019-02-12~2022-02-14 = 1,099일 × 25 = 274,750
    //                    2022-02-15~2024-12-01 = 1,021일 × 22 = 224,620      → 516,170
    // (종전 12.16. 고정: 58일 × 30 = 17,400 → 516,770)
    const { annualInterest: [a], notices } = one(2018, 1_000_000, "2024-12-01");
    expect(a.paymentDeadline).toBe("2018-12-17");
    expect(a.interestFrom).toBe("2018-12-18");
    expect(a.segments.map((g) => [g.days, g.ratePer100k, g.interest])).toEqual([[56, 30, 16_800], [1_099, 25, 274_750], [1_021, 22, 224_620]]);
    expect(a.interest).toBe(516_170);
    expect(notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_DEADLINE_CARRY_NOTICE);
  });

  it("2019년분 100만 · 고지 2024-12-01 = 422,370 (12.16. 고정이면 422,620)", () => {
    // 기산일 2019-12-17: 2019-12-17~2022-02-14 = 791일 × 25 = 197,750 · 2022-02-15~2024-12-01 = 1,021일 × 22 = 224,620
    expect(one(2019, 1_000_000, "2024-12-01").annualInterest[0].interest).toBe(422_370);
  });

  it("2024년분 100만 · 고지 2025-12-01 = 77,000 (12.16. 고정이면 77,220)", () => {
    // 기산일 2024-12-17~2025-12-01 = 350일 × 22 = 77,000
    const { annualInterest: [a] } = one(2024, 1_000_000, "2025-12-01");
    expect(a.days).toBe(350);
    expect(a.interest).toBe(77_000);
  });

  it("공휴일 표 밖(2036)·예정 공휴일 해(2030)에는 확인 필요 안내를 붙인다 — 금액은 토·일 기준", () => {
    // 2036-12-15 월요일(이월 없음) · 표 밖 / 2030-12-15 일요일 → 12.17. 기산(예정 공휴일 해)
    expect(one(2036, 1_000_000, "2037-01-31").notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_HOLIDAY_TABLE_UNCOVERED_NOTICE);
    const n2030 = one(2030, 1_000_000, "2031-01-31");
    expect(n2030.notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_HOLIDAY_TABLE_PROVISIONAL_NOTICE);
    expect(n2030.annualInterest[0].interestFrom).toBe("2030-12-17");
    // 확정된 해(2021)는 표 한계 안내 없음
    expect(one(2021, 1_000_000, "2022-01-31").notices).toEqual([]);
  });
});

describe("D: calculatePostManagementPenalty 위임 — 추징 계산기와 같은 이자", () => {
  it("G-22 격자(2021·2022·2023 각 100만 · 고지 2024-12-01) — 개정값 239,870 · 157,740 · 77,440 = 475,050", () => {
    const rows = [2021, 2022, 2023].map((taxYear) => ({ taxYear, amount: 1_000_000 }));
    const r = calculatePostManagementPenalty({ violationDate: d("2024-06-01"), annualExcludedTax: rows, noticeDate: d("2024-12-01") });
    expect(r.interestAmount).toBe(475_050);
    const c = calculateRecapture({ noticeDate: d("2024-12-01"), rows, exemption: { reason: "other" } });
    expect(c.interestAmount).toBe(r.interestAmount);
    expect(c.annualInterest).toEqual(r.annualInterest);
    expect(c.totalPayable).toBe(3_475_050);
  });

  it("2018년분이 걸리면 위임 경로도 이월을 따른다(516,170)", () => {
    const r = calculatePostManagementPenalty({
      violationDate: d("2024-06-01"),
      annualExcludedTax: [{ taxYear: 2018, amount: 1_000_000 }],
      noticeDate: d("2024-12-01"),
    });
    expect(r.interestAmount).toBe(516_170);
    expect(r.notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_DEADLINE_CARRY_NOTICE);
  });
});

// ── E. §10③ 추징 배제 ──────────────────────────────────────────────────────

/** 8호 장기일반(public_support_purchase 아닌 private_purchase_long) · 임대 기산 2015-03-01 · 의무 10년(등록 신청 2020-08-20 → 8.18. 이후) */
const rent5 = (ceased: string, over: Partial<Extract<RecaptureExemptionInput, { reason: "rent_over_5pct" }>> = {}): RecaptureExemptionInput => ({
  reason: "rent_over_5pct",
  registrationType: "private_purchase_long",
  rentalStartDate: d("2015-03-01"),
  rentalApplicationDate: d("2020-08-20"),
  rentalRegistrationDate: d("2020-09-01"),
  ceasedDate: d(ceased),
  ...over,
});
const NOTICE = d("2026-11-01");

describe("E: §10③1호 — 최소 임대의무기간이 지난 뒤 5% 요건 불충족", () => {
  it("기산 2015-03-01 + 10년 = 2025-03-01 당일 위반 → 추징하지 않음 (경계 포함 — V-4)", () => {
    const r = evaluateRecaptureExemption(rent5("2025-03-01"), NOTICE);
    expect(r).toMatchObject({ exempt: true, clause: "10③1호", legalBasis: COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_RENT_5PCT });
    expect(r.notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_NOTICE_1HO_BOUNDARY);
  });

  it("하루 전 2025-02-28 위반 → 의무기간 안이라 추징", () => {
    const r = evaluateRecaptureExemption(rent5("2025-02-28"), NOTICE);
    expect(r).toMatchObject({ exempt: false, clause: null, failReasons: [COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_1HO_PERIOD_NOT_MET] });
  });

  it("7호·8호 등록 신청 2020-08-17 이전이면 의무 8년(2023-03-01 경계), 신청일을 모르고 등록이 8.18. 이후면 10년 + 확인 필요", () => {
    const pre = { rentalApplicationDate: d("2020-08-17"), rentalRegistrationDate: d("2020-08-17") };
    expect(evaluateRecaptureExemption(rent5("2023-03-01", pre), NOTICE).exempt).toBe(true);
    expect(evaluateRecaptureExemption(rent5("2023-02-28", pre), NOTICE).exempt).toBe(false);
    const unknown = rent5("2025-03-01", { rentalApplicationDate: undefined });
    expect(evaluateRecaptureExemption(unknown, NOTICE).notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_NOTICE_APPLICATION_UNKNOWN);
  });

  it("5% 요건이 없는 호(미분양매입 6호)는 §10③1호 대상이 아니다", () => {
    const r = evaluateRecaptureExemption(rent5("2030-01-01", { registrationType: "unsold_purchase" }), NOTICE);
    expect(r).toMatchObject({ exempt: false, failReasons: [COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_1HO_NOT_TARGET] });
  });

  it("건설임대 1호(5년): 기산 2015-03-01 + 5년 = 2020-03-01 경계", () => {
    const t = { registrationType: "private_construction" as const };
    expect(evaluateRecaptureExemption(rent5("2020-03-01", t), NOTICE).exempt).toBe(true);
    expect(evaluateRecaptureExemption(rent5("2020-02-29", t), NOTICE).exempt).toBe(false);
  });

  it("시기 — 고지일 2020-02-11 이전이면 적용 안 함, 2020-02-11부터 적용 (Q-5)", () => {
    const t = { registrationType: "private_construction" as const };
    expect(evaluateRecaptureExemption(rent5("2020-03-01", t), d("2020-02-10")).failReasons).toEqual([COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_1HO_NOT_IN_FORCE]);
    expect(evaluateRecaptureExemption(rent5("2020-03-01", t), d("2020-02-11")).exempt).toBe(true);
  });

  it("단기민간임대 6년(10호) — 고지일 2025-06-03 이전이면 적용 안 함, 2025-06-04부터 적용 + 납세의무 성립 기준 확인 필요", () => {
    const t = { registrationType: "private_short_term_6y_construction" as const, rentalStartDate: d("2018-01-01") };
    expect(evaluateRecaptureExemption(rent5("2024-01-01", t), d("2025-06-03")).failReasons).toEqual([COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_1HO_6Y_NOT_IN_FORCE]);
    const ok = evaluateRecaptureExemption(rent5("2024-01-01", t), d("2025-06-04"));
    expect(ok.exempt).toBe(true); // 2018-01-01 + 6년 = 2024-01-01
    expect(ok.notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_NOTICE_6Y_ERA_UNCLEAR);
  });
});

describe("E: §10③2호 — 민간임대주택법 §6①11호·⑤에 따른 등록 말소", () => {
  const cancelled = (cancelClause: "6①11호" | "6⑤" | "other"): RecaptureExemptionInput => ({ reason: "registration_cancelled", cancelClause });

  it("§6⑤ 자동말소 → 추징하지 않음 · §6①11호 자진말소도 동일", () => {
    const r = evaluateRecaptureExemption(cancelled("6⑤"), NOTICE);
    expect(r).toMatchObject({ exempt: true, clause: "10③2호", legalBasis: COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_CANCELLATION });
    expect(r.notices).toEqual(expect.arrayContaining([COMPREHENSIVE_EXCL.RECAPTURE_NOTICE_2HO_TARGET_HOUSING, COMPREHENSIVE_EXCL.RECAPTURE_NOTICE_ERA_UNCLEAR]));
    expect(evaluateRecaptureExemption(cancelled("6①11호"), NOTICE).exempt).toBe(true);
  });

  it("그 밖의 말소 → 추징", () => {
    expect(evaluateRecaptureExemption(cancelled("other"), NOTICE)).toMatchObject({ exempt: false, failReasons: [COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_2HO_NOT_CLAUSE] });
  });

  it("시기 — 고지일 2020-10-06 이전이면 적용 안 함, 2020-10-07부터 적용 (Q-5)", () => {
    expect(evaluateRecaptureExemption(cancelled("6⑤"), d("2020-10-06")).failReasons).toEqual([COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_23HO_NOT_IN_FORCE]);
    expect(evaluateRecaptureExemption(cancelled("6⑤"), d("2020-10-07")).exempt).toBe(true);
  });
});

describe("E: §10③3호 — 정비사업·리모델링으로 새로 취득한 주택", () => {
  const replaced = (
    newHousing: Partial<Extract<RecaptureExemptionInput, { reason: "replacement_housing" }>["newHousing"]>,
    originalKind: "short_term" | "other" = "other",
  ): RecaptureExemptionInput => ({
    reason: "replacement_housing",
    cause: "redevelopment_reconstruction",
    originalKind,
    newHousing: { completionDate: d("2021-01-01"), isApartment: false, registeredAsRental: true, application: null, ...newHousing },
  });

  it("가목: 당초 단기 · 2020-08-01 단기 등록 신청 · 준공 2021-01-01 → 추징하지 않음", () => {
    const r = evaluateRecaptureExemption(replaced({ application: { kind: "short_term", date: d("2020-08-01") } }, "short_term"), NOTICE);
    expect(r).toMatchObject({ exempt: true, clause: "10③3호 가목", legalBasis: COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_REPLACEMENT_HOUSING });
  });

  it("가목 경계: 신청일 2020-07-11 포함 · 2020-07-10은 불성립", () => {
    expect(evaluateRecaptureExemption(replaced({ application: { kind: "long_general_apartment_purchase", date: d("2020-07-11") } }), NOTICE).exempt).toBe(true);
    expect(evaluateRecaptureExemption(replaced({ application: { kind: "short_term", date: d("2020-07-10") } }), NOTICE).failReasons).toEqual([COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_3HO_NO_ITEM]);
  });

  it("나목: 아파트 · 미등록 → 추징하지 않음 / 등록했으면 불성립 / 아파트 아니면 불성립", () => {
    expect(evaluateRecaptureExemption(replaced({ isApartment: true, registeredAsRental: false }), NOTICE)).toMatchObject({ exempt: true, clause: "10③3호 나목" });
    expect(evaluateRecaptureExemption(replaced({ isApartment: true, registeredAsRental: true }), NOTICE).exempt).toBe(false);
    expect(evaluateRecaptureExemption(replaced({ isApartment: false, registeredAsRental: false }), NOTICE).exempt).toBe(false);
  });

  it("나목 괄호: 당초가 단기민간임대면 아파트가 아니어도(모든 주택) 미등록이면 성립", () => {
    expect(evaluateRecaptureExemption(replaced({ isApartment: false, registeredAsRental: false }, "short_term"), NOTICE)).toMatchObject({ exempt: true, clause: "10③3호 나목" });
  });

  it("단서: 준공 2020-01-10 → 6개월이 되는 날 2020-07-10(이전) → 불성립 / 준공 2020-01-11 → 2020-07-11 → 성립", () => {
    const na = { isApartment: true, registeredAsRental: false };
    expect(evaluateRecaptureExemption(replaced({ ...na, completionDate: d("2020-01-10") }), NOTICE).failReasons).toEqual([COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_3HO_BEFORE_PROVISO]);
    expect(evaluateRecaptureExemption(replaced({ ...na, completionDate: d("2020-01-11") }), NOTICE).exempt).toBe(true);
  });

  it("시기 — 고지일 2020-10-06 이전이면 적용 안 함", () => {
    expect(evaluateRecaptureExemption(replaced({ isApartment: true, registeredAsRental: false }), d("2020-10-06")).failReasons).toEqual([COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_23HO_NOT_IN_FORCE]);
  });
});

describe("calculateRecapture — 합계·배제·고지일 하한", () => {
  const rows = [{ taxYear: 2021, amount: 1_000_000 }, { taxYear: 2018, amount: 2_000_000 }];

  it("사유 없음: 연도별 이자 합 + 추징세액 합계 (G-22와 같은 계산)", () => {
    // 2018년분 200만 · 고지 2024-12-01 = 516,170 × 2 = 1,032,340 / 2021년분 100만 = 239,870
    const r = calculateRecapture({ noticeDate: d("2024-12-01"), rows, exemption: { reason: "other" } });
    expect(r.calculated).toBe(true);
    expect(r.exempt).toBe(false);
    expect(r.totalRecoveryTax).toBe(3_000_000);
    expect(r.interestAmount).toBe(239_870 + 1_032_340);
    expect(r.totalPayable).toBe(3_000_000 + 1_272_210);
    expect(r.recoveryPeriodYears).toBe(2);
    expect(r.annualInterest.map((a) => a.taxYear)).toEqual([2021, 2018]); // 입력 순서 유지
  });

  it("§10③ 배제면 추징세액·이자 모두 0 + 근거 echo (Q-7)", () => {
    const r = calculateRecapture({ noticeDate: NOTICE, rows, exemption: { reason: "registration_cancelled", cancelClause: "6⑤" } });
    expect(r).toMatchObject({
      calculated: true,
      exempt: true,
      totalRecoveryTax: 0,
      interestAmount: 0,
      totalPayable: 0,
      recoveryPeriodYears: 0,
      annualInterest: [],
    });
    expect(r.exemption).toMatchObject({ clause: "10③2호", legalBasis: COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_CANCELLATION });
  });

  it("사유를 입력했으나 불성립이면 추징 계산 + 불성립 사유·확인 필요 안내를 함께 낸다", () => {
    const r = calculateRecapture({ noticeDate: NOTICE, rows: [{ taxYear: 2023, amount: 1_000_000 }], exemption: { reason: "registration_cancelled", cancelClause: "other" } });
    expect(r.exempt).toBe(false);
    expect(r.exemption.failReasons).toEqual([COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_2HO_NOT_CLAUSE]);
    expect(r.totalRecoveryTax).toBe(1_000_000);
    expect(r.interestAmount).toBeGreaterThan(0);
    expect(r.notices).toContain(COMPREHENSIVE_EXCL.RECAPTURE_NOTICE_2HO_TARGET_HOUSING);
  });

  it("고지일 2009-02-04 전: 던지지 않고 failReasons — 2009-02-04 당일은 계산 (Q-6 — 거부는 Zod)", () => {
    const early = calculateRecapture({ noticeDate: d("2009-02-03"), rows: [{ taxYear: 2009, amount: 1 }], exemption: { reason: "other" } });
    expect(early).toMatchObject({ calculated: false, totalPayable: 0, failReasons: [COMPREHENSIVE_EXCL.RECAPTURE_NOTICE_BEFORE_INTEREST_RULE] });
    expect(calculateRecapture({ noticeDate: d("2009-02-04"), rows: [{ taxYear: 2008, amount: 1 }], exemption: { reason: "other" } }).calculated).toBe(true);
  });

  it("0원 행은 허용 — 이자 0 · 연수에는 포함", () => {
    const r = calculateRecapture({ noticeDate: d("2024-12-01"), rows: [{ taxYear: 2021, amount: 0 }], exemption: { reason: "other" } });
    expect(r).toMatchObject({ totalRecoveryTax: 0, interestAmount: 0, recoveryPeriodYears: 1 });
  });
});
