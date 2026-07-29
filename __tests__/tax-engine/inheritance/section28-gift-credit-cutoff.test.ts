/**
 * M-9: §28 증여세액공제 cutoff 필터 — 일(日) 단위 정합
 *
 * 수정 내용:
 *   differenceInYears(만 연수 절사) → isWithin13Cutoff 재사용 (H-1과 동일 단일 진실)
 *
 * 법령 근거:
 *   §28①: "제13조에 따라 상속재산에 가산한 증여재산에 대한 증여세액은 … 공제한다."
 *   → §28 eligible 집합 == §13 cutoff 내 집합
 *
 * KoreanLaw MCP 검증: §28① 본칙 (mst 276123, 2026-01-02 시행).
 *
 * 버그 패턴:
 *   구버전: differenceInYears(deathDate, giftDate) <= limitYears
 *           → 경계일 1~364일 이전 도과분까지 §28 credit에 잘못 포함
 *   신버전: isWithin13Cutoff(gift, deathDate) — 일(日) 단위
 *           → boundary = subYears(deathDate, limitYears)
 *           → giftDate >= boundary (경계일 포함) 만 eligible
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTaxCredits } from "@/lib/tax-engine/inheritance-gift-tax-credit";

describe("M-9: §28 증여세액공제 cutoff 필터 — 일(日) 단위 정합 (isWithin13Cutoff 재사용)", () => {
  /**
   * 공통 시나리오 파라미터:
   *   deathDate = "2026-05-21"
   *   비상속인(isHeir=false): boundary = subYears(2026-05-21, 5) = 2021-05-21
   *   상속인(isHeir=true):   boundary = subYears(2026-05-21, 10) = 2016-05-21
   *
   * 도과(경계일 전일) 증여: giftTaxPaid > 0 → §28 credit에 잘못 포함되는 버그 확인
   * 경계일 당일 증여 → §28 포함 회귀 확인
   *
   * 산출세액: 100_000_000  (1억)
   * 과세가액: 800_000_000  (8억 > 5억 → §28① 단서 미적용)
   * taxBase:  700_000_000  (7억)
   */
  const DEATH_DATE = "2026-05-21";
  const COMPUTED_TAX = 100_000_000;
  const TAXABLE_ESTATE = 800_000_000; // 8억 (>5억 → §28① 단서 미적용)
  const TAX_BASE = 700_000_000; // 7억

  // ── M9-PRE1: [Pre-Do anchor — 버그 드러내기]
  // 도과 비상속인 증여 (giftDate=2021-05-20, 경계 2021-05-21 전일)
  // 구버전 differenceInYears(2026-05-21, 2021-05-20)=5 → 5<=5 → 포함(버그)
  // 신버전 isWithin13Cutoff → isBefore(2021-05-20, 2021-05-21)=true → 제외(정합)
  it("[M9-PRE1] 도과 비상속인 증여(giftDate=2021-05-20, 경계=2021-05-21 전일) → §28 credit=0", () => {
    const result = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2021-05-20", // 도과 (boundary=2021-05-21 전일)
            isHeir: false,
            giftAmount: 100_000_000,
            giftTaxPaid: 3_000_000, // 납부세액 있음
          },
        ],
        isFiledOnTime: false, // 신고세액공제 제거(순수 §28 검증)
      },
      computedTax: COMPUTED_TAX,
      generationSkipSurcharge: 0,
      taxableEstateValue: TAXABLE_ESTATE,
      taxBase: TAX_BASE,
      deathDate: DEATH_DATE,
    });
    // 도과 → §13 합산 제외 → §28도 제외 → credit = 0
    expect(result.giftTaxCredit).toBe(0);
  });

  // ── M9-PRE2: [Pre-Do anchor — 버그 드러내기]
  // 도과 상속인 증여 (giftDate=2016-05-20, 경계=2016-05-21 전일)
  // 구버전 differenceInYears(2026-05-21, 2016-05-20)=10 → 10<=10 → 포함(버그)
  it("[M9-PRE2] 도과 상속인 증여(giftDate=2016-05-20, 경계=2016-05-21 전일) → §28 credit=0", () => {
    const result = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2016-05-20", // 도과 (10년 boundary=2016-05-21 전일)
            isHeir: true,
            giftAmount: 200_000_000,
            giftTaxPaid: 5_000_000, // 납부세액 있음
          },
        ],
        isFiledOnTime: false,
      },
      computedTax: COMPUTED_TAX,
      generationSkipSurcharge: 0,
      taxableEstateValue: TAXABLE_ESTATE,
      taxBase: TAX_BASE,
      deathDate: DEATH_DATE,
    });
    // 도과 → §13 합산 제외 → §28도 제외 → credit = 0
    expect(result.giftTaxCredit).toBe(0);
  });

  // ── M9-REG1: [회귀 anchor — 수정 후 경계일 당일 포함 유지]
  // 비상속인 5년 경계일 당일(2021-05-21) → §28 포함
  // giftTaxPaid=2_000_000, giftAmount=100M, taxBase=7억
  // ratioLimit = floor(100M × 100M / 700M) = floor(14_285_714.28) = 14_285_714
  // credit = min(2_000_000, 14_285_714) = 2_000_000
  it("[M9-REG1] 비상속인 5년 경계일 당일(2021-05-21) → §28 포함, credit=2,000,000", () => {
    const result = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2021-05-21", // 경계일 당일 → 포함
            isHeir: false,
            giftAmount: 100_000_000,
            giftTaxPaid: 2_000_000,
          },
        ],
        isFiledOnTime: false,
      },
      computedTax: COMPUTED_TAX,
      generationSkipSurcharge: 0,
      taxableEstateValue: TAXABLE_ESTATE,
      taxBase: TAX_BASE,
      deathDate: DEATH_DATE,
    });
    expect(result.giftTaxCredit).toBe(2_000_000);
  });

  // ── M9-REG2: [회귀 anchor — 상속인 10년 경계일 당일 포함]
  // 상속인 10년 경계일 당일(2016-05-21) → §28 포함
  // credit = min(5_000_000, floor(200M × 100M / 700M)) = min(5M, 28_571_428) = 5_000_000
  it("[M9-REG2] 상속인 10년 경계일 당일(2016-05-21) → §28 포함, credit=5,000,000", () => {
    const result = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2016-05-21", // 경계일 당일 → 포함
            isHeir: true,
            giftAmount: 200_000_000,
            giftTaxPaid: 5_000_000,
          },
        ],
        isFiledOnTime: false,
      },
      computedTax: COMPUTED_TAX,
      generationSkipSurcharge: 0,
      taxableEstateValue: TAXABLE_ESTATE,
      taxBase: TAX_BASE,
      deathDate: DEATH_DATE,
    });
    expect(result.giftTaxCredit).toBe(5_000_000);
  });

  // ── M9-SET: [§13 집합 일치 anchor]
  // 동일 priorGifts에서 §13 합산 집합 == §28 eligible 집합
  // 도과(2021-05-20) + 경계일(2021-05-21) 혼합 케이스
  // §13: 2021-05-21만 합산 → §28도 2021-05-21만 eligible
  it("[M9-SET] §13 합산 집합 == §28 eligible 집합 (도과 혼합 케이스)", () => {
    const result = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2021-05-20", // 도과 → §13 제외 → §28 제외
            isHeir: false,
            giftAmount: 100_000_000,
            giftTaxPaid: 3_000_000,
          },
          {
            giftDate: "2021-05-21", // 경계 → §13 포함 → §28 포함
            isHeir: false,
            giftAmount: 50_000_000,
            giftTaxPaid: 1_000_000,
          },
        ],
        isFiledOnTime: false,
      },
      computedTax: COMPUTED_TAX,
      generationSkipSurcharge: 0,
      taxableEstateValue: TAXABLE_ESTATE,
      taxBase: TAX_BASE,
      deathDate: DEATH_DATE,
    });
    // §28 eligible: 2021-05-21만 (giftTaxPaid=1M, giftAmount=50M)
    // ratioLimit = floor(50M × 100M / 700M) = floor(7_142_857.14) = 7_142_857
    // credit = min(1_000_000, 7_142_857) = 1_000_000
    expect(result.giftTaxCredit).toBe(1_000_000);
  });
});

// ============================================================
// §28① 단서 전단 — 증여세 부과제척기간 만료(국기법 §26의2④⑤) 배제
//   giftTaxTimeBarred=true인 사전증여는 공제 합계·§28② 한도 분자 양쪽에서 제외.
//   §13 가산은 유지(별도 상속 제척기간). KoreanLaw §28①·국기법 §26의2④⑤ 검증 2026-07-18.
// ============================================================
describe("§28① 단서 전단 — 제척기간 만료 증여세액공제 배제 (국기법 §26의2④⑤)", () => {
  const DEATH_DATE = "2026-05-21";
  const COMPUTED_TAX = 100_000_000;
  const TAXABLE_ESTATE = 800_000_000; // 8억 (>5억 → 후단 단서 미적용)
  const TAX_BASE = 700_000_000;
  const base = (over: object) => ({
    creditInput: { priorGifts: [], isFiledOnTime: false, ...over },
    computedTax: COMPUTED_TAX,
    generationSkipSurcharge: 0,
    taxableEstateValue: TAXABLE_ESTATE,
    taxBase: TAX_BASE,
    deathDate: DEATH_DATE,
  });

  it("[TB-2] §13 가산 상속인 증여 + 제척만료 → 증여세액공제 0 (mutation: flag 제거 시 500만)", () => {
    const r = calcInheritanceTaxCredits(
      base({
        priorGifts: [
          {
            giftDate: "2020-01-01", // 10년 이내 (§13 가산)
            isHeir: true,
            giftAmount: 200_000_000,
            giftTaxBase: 200_000_000,
            giftTaxPaid: 5_000_000,
            giftTaxTimeBarred: true, // 국기법 §26의2④⑤ 만료
          },
        ],
      }),
    );
    expect(r.giftTaxCredit).toBe(0);
  });

  it("[TB-1] 무회귀 — flag 미설정이면 기존 공제(500만) 그대로", () => {
    const r = calcInheritanceTaxCredits(
      base({
        priorGifts: [
          {
            giftDate: "2020-01-01",
            isHeir: true,
            giftAmount: 200_000_000,
            giftTaxBase: 200_000_000,
            giftTaxPaid: 5_000_000,
          },
        ],
      }),
    );
    // ratioLimit = floor(200M × 100M / 700M) = 28,571,428 > 5M → credit = 5M
    expect(r.giftTaxCredit).toBe(5_000_000);
  });

  it("[TB-3] 혼합 — 제척만료분만 제외, 나머지는 정상 공제 (합계·한도 분자 모두)", () => {
    const r = calcInheritanceTaxCredits(
      base({
        priorGifts: [
          {
            giftDate: "2020-01-01",
            isHeir: true,
            giftAmount: 200_000_000,
            giftTaxBase: 200_000_000,
            giftTaxPaid: 5_000_000,
            giftTaxTimeBarred: true, // 제외
          },
          {
            giftDate: "2021-01-01",
            isHeir: true,
            giftAmount: 100_000_000,
            giftTaxBase: 100_000_000,
            giftTaxPaid: 2_000_000, // 정상
          },
        ],
      }),
    );
    // 제척만료분 제외 → 합계 2M·분자 100M. ratioLimit=floor(100M×100M/700M)=14,285,714
    // credit = min(2M, 14.28M) = 2M (미제외 시 합계 7M·분자 300M → 7M)
    expect(r.giftTaxCredit).toBe(2_000_000);
  });

  it("[TB-4] 제척만료분이 유일 → 공제 0", () => {
    const r = calcInheritanceTaxCredits(
      base({
        priorGifts: [
          {
            giftDate: "2020-01-01",
            isHeir: true,
            giftAmount: 200_000_000,
            giftTaxPaid: 5_000_000,
            giftTaxTimeBarred: true,
          },
        ],
      }),
    );
    expect(r.giftTaxCredit).toBe(0);
  });

  it("[TB-5] 과세가액 ≤5억 + 제척만료 → 후단(5억) 단서 선행 배제 (공제 0)", () => {
    const r = calcInheritanceTaxCredits({
      creditInput: {
        priorGifts: [
          {
            giftDate: "2020-01-01",
            isHeir: true,
            giftAmount: 200_000_000,
            giftTaxPaid: 5_000_000,
            giftTaxTimeBarred: true,
          },
        ],
        isFiledOnTime: false,
      },
      computedTax: COMPUTED_TAX,
      generationSkipSurcharge: 0,
      taxableEstateValue: 400_000_000, // 4억 ≤ 5억 → 후단 단서
      taxBase: 300_000_000,
      deathDate: DEATH_DATE,
    });
    expect(r.giftTaxCredit).toBe(0);
  });
});
