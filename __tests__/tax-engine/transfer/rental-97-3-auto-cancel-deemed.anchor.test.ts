/**
 * anchor — §97의3 자동말소 아파트 매입임대 8년 등록·임대 간주 (구 조특령 §97의3②2호)
 *
 * 계획서 docs/01-plan/features/rental-97-3-auto-cancel-deemed-8y.plan.md (Q-1~Q-7 권장안).
 * 구 령 ②2호 「종전의 「민간임대주택에 관한 특별법」(법률 제17482호 … 개정되기 전의 것) 제2조제5호에 따른 장기일반민간임대주택
 * 중 아파트를 임대하는 민간매입임대주택이 「민간임대주택에 관한 특별법」 제6조제5항에 따라 등록이 말소되는 경우: 해당 주택은
 * 8년 동안 등록 및 임대한 것으로 본다」 — 대통령령 제33264호(2023.2.28.)로 삭제됐지만 2020.12.31. 이전 등록분은
 * 2023.2.28. 이후 양도에도 적용(기준-2024-법규재산-0079 · 사전-2025-법규재산-0726·0869). 50%만 — 단서 70%는 아님
 * (서면-2020-법령해석재산-3286).
 * 사실관계는 해석례 그대로(§3 실측 P-A~P-E). 말소일 = 종료일 칸(`rentalEndDate`).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import type { Rental97EvaluationInput, Rental97Result } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(s);
const codes = (r: Rental97Result) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));
type Lthd = { overrideRate?: number; eligibleRentalYears?: number; autoCancelDeemed973?: unknown };
const lthd = (r: Rental97Result) => r as unknown as Lthd;
const jeonse = (date: string, deposit: number) => ({ contractDate: D(date), contractType: "jeonse" as const, deposit, monthlyRent: 0 });

const COMMON = {
  id: "rental_97_3",
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  region: "capital",
  officialPriceAtStart: 200_000_000,
  stdPriceAtAcquisition: 200_000_000,
  stdPriceAtRentalStart: 200_000_000,
  stdPriceAtRentalEnd: 400_000_000,
  stdPriceAtTransfer: 450_000_000,
  rentalContinuesToTransfer: false,
} as const;
const ON = { autoCancelled973: true };

/** P-A 사전-2025-법규재산-0726 — 단기 2016-11-24 · 임대 2016-12-23 · 장기 변경 2019-07-12 · 말소 2024-11-26 · 양도 2025-07-30 */
const P_A: Rental97EvaluationInput = {
  ...COMMON,
  acquisitionDate: D("2017-01-06"),
  contractDate: D("2016-10-20"),
  registrationDate: D("2016-11-24"),
  rentalStartDate: D("2016-12-23"),
  taxRegistrationDate: D("2016-11-24"),
  shortTermConversion: { reportedDate: D("2019-07-12"), acceptedDate: D("2019-07-12") },
  rentalEndDate: D("2024-11-26"),
  transferDate: D("2025-07-30"),
} as Rental97EvaluationInput;
/** P-C 기준-2024-법규재산-0079 — 단기 2014-10-17 · 준공공 변경 2017-10-06(종전 50% 산입) · 말소 2023-02-02 · 양도 2023-03-30 */
const P_C: Rental97EvaluationInput = {
  ...COMMON,
  acquisitionDate: D("2014-10-10"),
  registrationDate: D("2014-10-17"),
  rentalStartDate: D("2014-10-17"),
  taxRegistrationDate: D("2014-10-17"),
  shortTermConversion: { reportedDate: D("2017-10-06"), acceptedDate: D("2017-10-06") },
  rentalEndDate: D("2023-02-02"),
  transferDate: D("2023-03-30"),
} as Rental97EvaluationInput;
/** P-D 서면-2022-부동산-5342류 — 준공공 2017-12-15 · 4개월 공실 · 말소 2025-12-15 */
const P_D: Rental97EvaluationInput = {
  ...COMMON,
  acquisitionDate: D("2017-11-15"),
  registrationDate: D("2017-12-15"),
  rentalStartDate: D("2017-12-15"),
  taxRegistrationDate: D("2017-12-15"),
  vacancyPeriods: [{ startDate: D("2025-08-15"), endDate: D("2025-12-15") }],
  rentalEndDate: D("2025-12-15"),
  transferDate: D("2026-03-01"),
} as Rental97EvaluationInput;
/** P-E 사전-2026-법규재산-0401류 — 준공공 2018-03-15 · 공실 없음 · 말소 2026-03-15 */
const P_E: Rental97EvaluationInput = {
  ...COMMON,
  acquisitionDate: D("2018-02-15"),
  registrationDate: D("2018-03-15"),
  rentalStartDate: D("2018-03-15"),
  taxRegistrationDate: D("2018-03-15"),
  rentalEndDate: D("2026-03-15"),
  transferDate: D("2026-06-15"),
} as Rental97EvaluationInput;

describe("간주 — 실제 통산이 8년에 못 미쳐도 50% (해석례 사실관계)", () => {
  it("🔴 M-1 0726(단기→장기 2019.7.) + 자동말소 → 50% · 8년 · 간주 echo", () => {
    const r = evaluateRental973({ ...P_A, ...ON });
    expect(codes(r)).toEqual([]);
    expect(lthd(r).overrideRate).toBe(0.5);
    expect(lthd(r).eligibleRentalYears).toBe(8);
    expect(lthd(r).autoCancelDeemed973).toEqual({ cancelledDate: "2024-11-26", actualYears: 7 });
  });

  it("M-2 같은 사실 · 자동말소 아님(자진말소·임대 종료) → 실제 기간으로 미달 (회귀)", () => {
    expect(codes(evaluateRental973(P_A))).toContain("RENTAL_PERIOD_SHORT");
  });

  it("🔴 M-3 0079(종전 50% 산입 구간) + 자동말소 → 50%", () => {
    const r = evaluateRental973({ ...P_C, ...ON });
    expect(codes(r)).toEqual([]);
    expect(lthd(r).overrideRate).toBe(0.5);
  });

  it("🔴 M-4 4개월 공실(5342류) + 자동말소 → 50%", () => {
    const r = evaluateRental973({ ...P_D, ...ON });
    expect(codes(r)).toEqual([]);
    expect(lthd(r).overrideRate).toBe(0.5);
  });

  it("M-5 0401류(공실 없음 · 실제 8년) + 자동말소 → 50% (결과 동일)", () => {
    expect(lthd(evaluateRental973({ ...P_E, ...ON })).overrideRate).toBe(0.5);
    expect(lthd(evaluateRental973(P_E)).overrideRate).toBe(0.5);
  });
});

describe("간주 효과·범위 (Q-2·Q-3·Q-5)", () => {
  it("🔴 M-6 실제 통산 10년 이상 + 자동말소 → 50% 고정 (70% 아님 — 3286 「단서는 적용하지 않는」)", () => {
    const tenYears: Rental97EvaluationInput = {
      ...P_E,
      acquisitionDate: D("2013-12-15"),
      registrationDate: D("2014-01-15"),
      rentalStartDate: D("2014-01-15"),
      taxRegistrationDate: D("2014-01-15"),
      rentalEndDate: D("2024-06-01"),
      transferDate: D("2024-09-01"),
    } as Rental97EvaluationInput;
    expect(lthd(evaluateRental973(tenYears)).overrideRate).toBe(0.7); // 간주 없으면 70%
    expect(lthd(evaluateRental973({ ...tenYears, ...ON })).overrideRate).toBe(0.5);
  });

  it("M-7 말소일 2020-08-17(부칙 제31086호 §2 「2020년 8월 18일 이후 … 말소되는 경우부터」 전) → 간주 없음", () => {
    const early: Rental97EvaluationInput = {
      ...P_E,
      acquisitionDate: D("2012-12-15"),
      registrationDate: D("2013-01-15"),
      rentalStartDate: D("2013-01-15"),
      taxRegistrationDate: D("2013-01-15"),
      vacancyPeriods: [{ startDate: D("2019-01-15"), endDate: D("2019-07-15") }],
      rentalEndDate: D("2020-08-17"),
      transferDate: D("2021-01-15"),
    } as Rental97EvaluationInput;
    const r = evaluateRental973({ ...early, ...ON });
    expect(codes(r)).toContain("RENTAL_PERIOD_SHORT");
    expect(lthd(r).autoCancelDeemed973).toBeUndefined();
    // 같은 사실 · 말소일 2020-08-18 → 간주
    expect(lthd(evaluateRental973({ ...early, ...ON, rentalEndDate: D("2020-08-18") })).overrideRate).toBe(0.5);
  });

  it("M-7b 장기 등록일 2020-08-18 이후(종전 민특법 장기일반 아님) → 간주 없음", () => {
    const late = { ...P_E, registrationDate: D("2020-08-18"), rentalStartDate: D("2020-08-18"), taxRegistrationDate: D("2020-08-18"), acquisitionDate: D("2020-08-01"), rentalEndDate: D("2025-12-01"), transferDate: D("2026-01-15") } as Rental97EvaluationInput;
    expect(lthd(evaluateRental973({ ...late, ...ON })).autoCancelDeemed973).toBeUndefined();
  });

  it("M-9 양도일까지 등록·임대 유지 + 토글 잔존 → 간주 없음", () => {
    const r = evaluateRental973({ ...P_A, ...ON, rentalContinuesToTransfer: true });
    expect(lthd(r).autoCancelDeemed973).toBeUndefined();
  });

  it("M-10 간주가 임대료 요건을 덮지 않는다 — 말소 전 5% 위반 → 부적격", () => {
    const history = [jeonse("2018-03-15", 100_000_000), jeonse("2022-03-15", 120_000_000)];
    expect(codes(evaluateRental973({ ...P_E, ...ON, rentHistory: history }))).toContain("RENT_INCREASE_VIOLATED");
  });

  it("M-11 상속 합산과 함께 → 간주 우선 50%", () => {
    const inh = {
      ...P_D,
      ...ON,
      acquisitionDate: D("2019-01-01"),
      registrationDate: D("2019-02-01"),
      rentalStartDate: D("2019-02-01"),
      taxRegistrationDate: D("2019-02-01"),
      inheritance973: { inheritanceDate: D("2019-01-01"), decedentRegistrationDate: D("2017-12-15"), decedentRentalStartDate: D("2017-12-15") },
    } as Rental97EvaluationInput;
    const r = evaluateRental973(inh);
    expect(codes(r)).toEqual([]);
    expect(lthd(r).overrideRate).toBe(0.5);
  });
});
