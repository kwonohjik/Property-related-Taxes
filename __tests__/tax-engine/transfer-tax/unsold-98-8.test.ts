// §98의8 준공후미분양 50% 공제 — evaluator 단위 anchor (A-1~A-11)
//
// 법령: 법 §98의8 ①~③ + 령 §98의7 ①~⑭ (조번호 어긋남 — KoreanLaw 2026-06-11 원문)
// 산식: 5년 내 = §95① 전액 / 5년 후 = 기준시가 안분 (령 §40① 준용) × 50%
import { describe, it, expect } from "vitest";
import {
  evaluateUnsold988,
  fullMonthsBetween,
  type Unsold988Input,
} from "@/lib/tax-engine/transfer-reductions/unsold-98-8";

/** A-1 기준 적격 입력 — 2015.6 계약·7월 취득, 임대 78개월, 2022.7 양도 (5년 후) */
function baseInput(overrides?: Partial<Unsold988Input>): Unsold988Input {
  return {
    transferDate: new Date("2022-07-01"),
    acquisitionDate: new Date("2015-07-01"),
    contractDate: new Date("2015-06-01"),
    acquisitionPrice: 550_000_000,
    exclusiveAreaSqm: 84.5,
    rentalStartDate: new Date("2016-01-01"),
    isUnsoldAfterCompletion: true,
    isFirstContract: true,
    isNotRecontract: true,
    transferIncome: 200_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAt5Years: 300_000_000,
    standardPriceAtTransfer: 400_000_000,
    ...overrides,
  };
}

describe("§98의8 evaluator anchor", () => {
  it("A-1: 5년 후 양도 — 안분 0.5 × 50% = 50,000,000 차감", () => {
    const r = evaluateUnsold988(baseInput());
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(false);
    // (300M − 200M) / (400M − 200M) = 0.5 → 200M × 0.5 = 100M → × 50% = 50M
    expect(r.fiveYearRatio).toBeCloseTo(0.5, 10);
    expect(r.reducibleTransferIncome).toBe(50_000_000);
    expect(r.rentalMonths).toBe(78);
    expect(r.deductionRate).toBe(0.5);
  });

  it("A-2: 5년 내 양도(취득+5년 당일 포함) + 상속 합산으로 임대 60개월 — 전액 기준 × 50%", () => {
    // 5년 내 양도(2020-07-01 = 취득+5년 당일)와 임대 5년은 상속 합산 없이는 거의 배타적
    // (기산 = 등록 후 임대개시일): 임대 2016.1~2020.7 = 54개월 + 피상속인 6개월 = 60개월
    const r = evaluateUnsold988(
      baseInput({ transferDate: new Date("2020-07-01"), inheritedRentalMonths: 6 }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(true);
    expect(r.rentalMonths).toBe(60);
    // 200M 전액 × 50% = 100M
    expect(r.reducibleTransferIncome).toBe(100_000_000);
  });

  it("A-3: 취득가 6억 초과 (600,000,001) → PRICE_LIMIT_EXCEEDED (경계 600,000,000은 적격)", () => {
    const over = evaluateUnsold988(baseInput({ acquisitionPrice: 600_000_001 }));
    expect(over.isEligible).toBe(false);
    expect(over.ineligibleReasons.map((x) => x.code)).toContain("PRICE_LIMIT_EXCEEDED");
    const boundary = evaluateUnsold988(baseInput({ acquisitionPrice: 600_000_000 }));
    expect(boundary.isEligible).toBe(true);
  });

  it("A-4: 전용 135.01㎡ → AREA_LIMIT_EXCEEDED — 6억 이하여도 배제 (AND 조건. 135.00은 적격)", () => {
    const over = evaluateUnsold988(baseInput({ exclusiveAreaSqm: 135.01 }));
    expect(over.isEligible).toBe(false);
    expect(over.ineligibleReasons.map((x) => x.code)).toContain("AREA_LIMIT_EXCEEDED");
    const boundary = evaluateUnsold988(baseInput({ exclusiveAreaSqm: 135 }));
    expect(boundary.isEligible).toBe(true);
  });

  it("A-5: 계약일 2014.12.31 / 2016.1.1 → OUT_OF_CONTRACT_PERIOD (2015.1.1·12.31 경계 적격)", () => {
    for (const d of ["2014-12-31", "2016-01-01"]) {
      const r = evaluateUnsold988(baseInput({ contractDate: new Date(d) }));
      expect(r.isEligible).toBe(false);
      expect(r.ineligibleReasons.map((x) => x.code)).toContain("OUT_OF_CONTRACT_PERIOD");
    }
    for (const d of ["2015-01-01", "2015-12-31"]) {
      expect(evaluateUnsold988(baseInput({ contractDate: new Date(d) })).isEligible).toBe(true);
    }
  });

  it("A-6: 임대 기산 = 등록 후 개시일 — 2021.2.1 양도 시 59개월 → RENTAL_PERIOD_SHORT", () => {
    // 임대개시 2016.3.1 (등록 후) → 2021.2.1 = 59개월 (등록 전 임대분 미산입 — 령 §98의5⑤1호)
    const r = evaluateUnsold988(
      baseInput({
        rentalStartDate: new Date("2016-03-01"),
        rentalEndDate: new Date("2021-02-01"),
      }),
    );
    expect(r.isEligible).toBe(false);
    expect(r.rentalMonths).toBe(59);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("RENTAL_PERIOD_SHORT");
  });

  it("A-7: A-6 + 피상속인 1개월 합산 → 60개월 적격 (령 §98의5⑤2호)", () => {
    const r = evaluateUnsold988(
      baseInput({
        rentalStartDate: new Date("2016-03-01"),
        rentalEndDate: new Date("2021-02-01"),
        inheritedRentalMonths: 1,
      }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.rentalMonths).toBe(60);
  });

  it("A-8: 준공후미분양 미확인 / 최초계약 미확인 / 재계약 배제 → 각 코드", () => {
    expect(
      evaluateUnsold988(baseInput({ isUnsoldAfterCompletion: false })).ineligibleReasons.map((x) => x.code),
    ).toContain("NOT_UNSOLD_AFTER_COMPLETION");
    expect(
      evaluateUnsold988(baseInput({ isFirstContract: false })).ineligibleReasons.map((x) => x.code),
    ).toContain("NOT_FIRST_CONTRACT");
    expect(
      evaluateUnsold988(baseInput({ isNotRecontract: false })).ineligibleReasons.map((x) => x.code),
    ).toContain("RECONTRACT_EXCLUDED");
  });

  it("A-9: 비거주자 → NOT_RESIDENT", () => {
    const r = evaluateUnsold988(baseInput({ isResident: false }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("NOT_RESIDENT");
  });

  it("A-10: 5년 후 양도 + 기준시가 미입력 → MISSING_STD_PRICE (자동 안분 금지)", () => {
    const r = evaluateUnsold988(baseInput({ standardPriceAt5Years: undefined }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("MISSING_STD_PRICE");
  });

  it("A-11: 양도일 ≤ 취득일 → TRANSFER_BEFORE_ACQUISITION", () => {
    const r = evaluateUnsold988(baseInput({ transferDate: new Date("2015-07-01") }));
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x) => x.code)).toContain("TRANSFER_BEFORE_ACQUISITION");
  });

  it("부호 (−,+) → 차감 0 / (+,−) → 50%만 차감 (부호 정책 §99의3 동형)", () => {
    const negPos = evaluateUnsold988(baseInput({ standardPriceAt5Years: 150_000_000 }));
    expect(negPos.isEligible).toBe(true);
    expect(negPos.reducibleTransferIncome).toBe(0);
    const posNeg = evaluateUnsold988(
      baseInput({ standardPriceAt5Years: 300_000_000, standardPriceAtTransfer: 150_000_000 }),
    );
    // (+,−) 전액 감면 선례 → base = 200M → × 50% = 100M
    expect(posNeg.reducibleTransferIncome).toBe(100_000_000);
  });

  it("fullMonthsBetween — 월 경계·일 미달 절사", () => {
    expect(fullMonthsBetween(new Date("2016-01-01"), new Date("2022-07-01"))).toBe(78);
    expect(fullMonthsBetween(new Date("2016-01-15"), new Date("2016-02-14"))).toBe(0);
    expect(fullMonthsBetween(new Date("2016-01-15"), new Date("2016-02-15"))).toBe(1);
    expect(fullMonthsBetween(new Date("2016-02-01"), new Date("2016-01-01"))).toBe(0);
  });
});
