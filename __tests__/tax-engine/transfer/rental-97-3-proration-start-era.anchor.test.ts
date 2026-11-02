/**
 * anchor — 조특법 §97의3 임대기간 분 양도차익 안분 (PR-A: 계획서 #2·#4)
 *
 * 계획서: docs/01-plan/features/rental-97-3-review-fixes.plan.md §3.1·§3.2·§4.1·§4.2
 *
 * ## #2 — 안분 기산 = 의제 개시일 (R2-1~R2-5)
 * 조특령 §97의3④ 「…사업자등록과 …임대사업자등록을 하고 장기일반민간임대주택등으로 등록하여 임대하는 날부터
 * 임대를 개시한 것으로 보며」 + ⑤ 「C: 제2항에 따른 실제 임대기간의 개시일의 기준시가」.
 * 종전에는 임대기간 판정만 의제 개시일을 쓰고 안분은 원 입력 임대일을 써서, 취득일 = 임대일이면
 * 등록이 4년 늦어도 「취득 즉시 임대」 단축 분기로 비율 1이 됐다(공제 과다).
 *
 * ## #4 — 양도일 구간 (R4-1~R4-4)
 * 법 §97의3① 2020-01-01 시행본 「그 주택을 양도함으로써 발생하는 소득」(안분 없음) →
 * 2021-01-01 시행본(법률 제17759호) 「임대기간 중 발생하는 소득」 → 령 ⑤ 2021-02-17 신설(산식 없음) →
 * 2026-02-27 산식 명문화. 2020.12.31 이전 양도는 안분하지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import {
  resolveRental973ProrationEra,
  isRental973WholeGainEraString,
} from "@/lib/tax-engine/data/rental-97-3-proration-era";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);

/** evaluator 직접 호출용 공통 입력 — 취득·임대 2010-01-01, 기준시가 취득 3억 / 개시 4억 / 양도 9억 */
const BASE = {
  id: "rental_97_3" as const,
  acquisitionDate: D("2010-01-01"),
  rentalStartDate: D("2010-01-01"),
  transferDate: D("2025-06-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  officialPriceAtStart: 400_000_000,
  stdPriceAtAcquisition: 300_000_000,
  stdPriceAtTransfer: 900_000_000,
  region: "capital" as const,
  rentalContinuesToTransfer: true,
};

describe("#2 안분 기산 = 의제 개시일 (조특령 §97의3④·⑤)", () => {
  it("R2-1 등록·사업자등록 2014-01-01 → 비율 5/6 (종전 1)", () => {
    const r = evaluateRental973({ ...BASE, registrationDate: D("2014-01-01"), taxRegistrationDate: D("2014-01-01") } as Any) as Any;
    expect(r.isEligible).toBe(true);
    // (D 9억 − C 4억) / (D 9억 − E 3억)
    expect(r.rentalGainFraction).toEqual({ num: 500_000_000, den: 600_000_000 });
    expect(r.overrideRate).toBe(0.7);
  });

  it("R2-1 통합 — 2주택(표1 30%), 양도가 9억·취득가 3억: 장특 380,000,000 = 임대분 5억 × 70% + 비임대분 1억 × 30%", () => {
    const res = calculateTransferTax(
      baseTransferInput({
        transferPrice: 900_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("2010-01-01"),
        transferDate: D("2025-06-01"),
        householdHousingCount: 2,
        isOneHousehold: false,
        residencePeriodMonths: 0,
        standardPriceAtAcquisition: 300_000_000,
        standardPriceAtTransfer: 900_000_000,
        reductions: [
          {
            type: "rental_97_3",
            registrationDate: D("2014-01-01"),
            rentalStartDate: D("2010-01-01"),
            isTaxRegistered: true,
            taxRegistrationDate: D("2014-01-01"),
            isNationalHousingScale: true,
            officialPriceAtStart: 400_000_000,
            region: "capital",
            rentalContinuesToTransfer: true,
            rentIncreaseViolated: false,
          },
        ],
      } as Any),
      makeMockRates(),
    ) as Any;
    expect(res.longTermHoldingDeduction).toBe(380_000_000);
    expect(res.determinedTax ?? res.totalTax).toBe(62_710_000);
  });

  it("R2-2 대조 — 등록 2010-01-01(취득 즉시 등록) → 비율 1", () => {
    const r = evaluateRental973({ ...BASE, registrationDate: D("2010-01-01"), taxRegistrationDate: D("2010-01-01") } as Any) as Any;
    expect(r.isEligible).toBe(true);
    expect(r.rentalGainRatio).toBe(1);
  });

  it("R2-3 의제 개시일 > 취득일인데 기준시가 미입력 → MISSING_PRORATION_PRICES (종전: 적격·비율 1)", () => {
    const r = evaluateRental973({
      ...BASE,
      registrationDate: D("2014-01-01"),
      taxRegistrationDate: D("2014-01-01"),
      stdPriceAtAcquisition: undefined,
      stdPriceAtTransfer: undefined,
    } as Any) as Any;
    expect(r.isEligible).toBe(false);
    expect(r.ineligibleReasons.map((x: Any) => x.code)).toContain("MISSING_PRORATION_PRICES");
  });

  it("R2-4 경계 — 등록 = 취득일이면 비율 1, 하루 늦으면 기준시가 3점이 필요하다", () => {
    const noPrices = { stdPriceAtAcquisition: undefined, stdPriceAtTransfer: undefined };
    const same = evaluateRental973({ ...BASE, ...noPrices, registrationDate: D("2010-01-01"), taxRegistrationDate: D("2010-01-01") } as Any) as Any;
    expect(same.isEligible).toBe(true);
    expect(same.rentalGainRatio).toBe(1);
    const nextDay = evaluateRental973({ ...BASE, ...noPrices, registrationDate: D("2010-01-02"), taxRegistrationDate: D("2010-01-02") } as Any) as Any;
    expect(nextDay.isEligible).toBe(false);
    expect(nextDay.ineligibleReasons.map((x: Any) => x.code)).toContain("MISSING_PRORATION_PRICES");
  });

  it("R2-5 사업자등록일만 늦어도(2014) 의제 개시일로 안분한다", () => {
    const r = evaluateRental973({ ...BASE, registrationDate: D("2010-01-01"), taxRegistrationDate: D("2014-01-01") } as Any) as Any;
    expect(r.isEligible).toBe(true);
    expect(r.rentalGainFraction).toEqual({ num: 500_000_000, den: 600_000_000 });
  });
});

describe("#4 양도일 구간 (data/rental-97-3-proration-era.ts)", () => {
  it("경계 — 시행일 당일부터 신규 구간", () => {
    expect(resolveRental973ProrationEra(D("2020-12-31"))).toBe("whole_gain");
    expect(resolveRental973ProrationEra(D("2021-01-01"))).toBe("pre_decree");
    expect(resolveRental973ProrationEra(D("2021-02-16"))).toBe("pre_decree");
    expect(resolveRental973ProrationEra(D("2021-02-17"))).toBe("no_formula");
    expect(resolveRental973ProrationEra(D("2026-02-26"))).toBe("no_formula");
    expect(resolveRental973ProrationEra(D("2026-02-27"))).toBe("formula");
  });

  it("클라이언트 문자열 판정이 엔진과 같은 경계를 쓴다", () => {
    expect(isRental973WholeGainEraString("2020-12-31")).toBe(true);
    expect(isRental973WholeGainEraString("2021-01-01")).toBe(false);
    expect(isRental973WholeGainEraString("")).toBe(false);
  });

  /** 2020.12.31 양도가 8년 임대가 되도록 2012-06-01 개시·등록 (정상 입력으로는 도달하기 어려운 구간 — 계획서 V-5) */
  const OLD = {
    ...BASE,
    acquisitionDate: D("2011-06-01"),
    rentalStartDate: D("2012-06-01"),
    registrationDate: D("2012-06-01"),
    taxRegistrationDate: D("2012-06-01"),
  };

  it("R4-1 양도 2020-12-31 → 안분 없음(비율 1), 기준시가 미입력이어도 적격 · prorationEra whole_gain", () => {
    const r = evaluateRental973({
      ...OLD,
      transferDate: D("2020-12-31"),
      stdPriceAtAcquisition: undefined,
      stdPriceAtTransfer: undefined,
    } as Any) as Any;
    expect(r.isEligible).toBe(true);
    expect(r.rentalGainRatio).toBe(1);
    expect(r.rentalGainFraction).toBeUndefined();
    expect(r.prorationEra).toBe("whole_gain");
    expect(r.overrideRate).toBe(0.5); // 2022.12.31 이전 등록 · 8년↑
  });

  it("R4-1b 양도 2020-12-31 + 조기 종료(B 미입력)도 안분하지 않는다", () => {
    const r = evaluateRental973({
      ...OLD,
      transferDate: D("2020-12-31"),
      rentalContinuesToTransfer: false,
      rentalEndDate: D("2020-12-01"),
    } as Any) as Any;
    expect(r.isEligible).toBe(true);
    expect(r.rentalGainRatio).toBe(1);
  });

  it("R4-2~R4-4 2021-01-01 이후는 현행 산식으로 안분하고 구간만 echo한다", () => {
    for (const [date, era] of [
      ["2021-01-01", "pre_decree"],
      ["2021-02-17", "no_formula"],
      ["2026-02-27", "formula"],
    ] as const) {
      const r = evaluateRental973({ ...OLD, transferDate: D(date) } as Any) as Any;
      expect(r.isEligible, date).toBe(true);
      expect(r.prorationEra, date).toBe(era);
      // (9억 − 4억) / (9억 − 3억) — 개시 2012 > 취득 2011이라 안분
      expect(r.rentalGainFraction, date).toEqual({ num: 500_000_000, den: 600_000_000 });
    }
  });
});
