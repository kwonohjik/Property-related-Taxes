/**
 * anchor — 「임대료등 5% 증가율」 요건의 적용 시기 (대통령령 제29523호 부칙 제6조) — E-14m 엔진 leaf.
 * route 관측은 `__tests__/api/transfer.route.rental-5pct-lease-date-2019.anchor.test.ts`.
 *
 * 부칙 제6조(MST 207800 실독): 「제154조제1항제4호, 제155조제20항제2호 및 제167조의3제1항제2호(제167조의10
 * 제1항제2호가 적용되는 경우를 포함한다)의 개정규정은 이 영 시행 이후 주택 임대차계약을 체결하거나 기존 계약을
 * 갱신하는 분부터 적용한다.」 — 5% 문언이 이 개정으로 들어온 목은 가·다·마·바목이다(MST 204914 ↔ 207800).
 * 아·자목(2025.6.4. 신설)의 5%는 이 부칙의 대상이 아니다.
 */
import { describe, it, expect } from "vitest";
import {
  checkRentalArticle,
  isRentCapContractSubject,
  type NormalizedRentalUnit,
} from "@/lib/tax-engine/rental-article/check";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

const D = (s: string) => new Date(s);

const unit = (o: Partial<NormalizedRentalUnit> = {}): NormalizedRentalUnit => ({
  businessRegistrationDate: D("2015-01-01"),
  rentalRegistrationDate: D("2015-01-01"),
  isCapitalArea: true,
  isApartment: false,
  rentalStartOfficialPrice: 300_000_000,
  acquisitionOfficialPrice: 300_000_000,
  rentalYears: 12,
  landAreaM2: 100,
  totalFloorAreaM2: 100,
  hasMinimum2Units: true,
  rentIncreaseUnder5Pct: false,
  transferDate: D("2020-06-01"),
  ...o,
});
const fivePctFail = (article: Parameters<typeof checkRentalArticle>[0], o: Partial<NormalizedRentalUnit>) =>
  checkRentalArticle(article, unit(o)).failCodes.includes("REQUIREMENTS_NOT_CONFIRMED");

describe("E-14m leaf — 부칙 제6조 술어", () => {
  it("L-1 계약 체결·갱신일 ±1일: 2019-02-11 대상 아님 · 2019-02-12 대상", () => {
    expect(isRentCapContractSubject(D("2019-02-11"))).toBe(false);
    expect(isRentCapContractSubject(D("2019-02-12"))).toBe(true);
  });

  it("L-2 가·다·마·바목 — 초과 증액 계약이 2019-02-11 이전이면 5% 실패 코드가 없다 · 2019-02-12 [짝] 있다", () => {
    for (const a of ["가", "다", "마", "바"] as const) {
      expect(fivePctFail(a, { rentIncreaseContractDate: D("2019-02-11") }), a).toBe(false);
      expect(fivePctFail(a, { rentIncreaseContractDate: D("2019-02-12") }), a).toBe(true);
    }
  });

  it("L-3 [짝] 계약일 미입력이면 종전대로 5% 실패 · 충족 선언이면 실패 없음", () => {
    expect(fivePctFail("가", {})).toBe(true);
    expect(fivePctFail("가", { rentIncreaseUnder5Pct: true })).toBe(false);
  });

  it("L-4 양도일 2019-02-11 이전 — 5% 문언이 없던 시행본(부칙 제2조②) · 2019-02-12 [짝] 요구", () => {
    expect(fivePctFail("마", { transferDate: D("2019-02-11") })).toBe(false);
    expect(fivePctFail("마", { transferDate: D("2019-02-12") })).toBe(true);
  });

  it("L-5 아·자목의 5%는 부칙 제6조 대상이 아니다 — 2019-02-11 계약일이어도 실패 유지", () => {
    const reg = { businessRegistrationDate: D("2025-07-01"), rentalRegistrationDate: D("2025-07-01") };
    expect(fivePctFail("아", { ...reg, rentIncreaseContractDate: D("2019-02-11") })).toBe(true);
    expect(fivePctFail("자", { ...reg, rentIncreaseContractDate: D("2019-02-11") })).toBe(true);
  });

  it("L-6 사목 — base 목(가·다·마)의 5%에도 같은 부칙이 걸린다", () => {
    const sa = {
      saMokBaseArticle: "가" as const,
      rentalCancellationDate: D("2020-09-01"),
      hasHalfDutyPeriodMet: true,
      isSoldWithin1YearOfCancellation: true,
    };
    expect(fivePctFail("사", { ...sa, rentIncreaseContractDate: D("2018-06-01") })).toBe(false);
    expect(fivePctFail("사", { ...sa, rentIncreaseContractDate: D("2019-06-01") })).toBe(true);
  });
});

describe("E-14m 다주택 판정 — §167의3①2호 · §167의10①2호 · §167의3④ 모두 같은 술어", () => {
  const TD = D("2020-06-01");
  /** 가목(A) — 2015 등록 · 3억 · 5.5년 */
  const A = {
    isLongTermRental: true,
    rentalType: "A" as const,
    isRegisteredRental: true,
    rentalRegistrationDate: D("2015-01-01"),
    businessRegistrationDate: D("2015-01-01"),
    rentalStartOfficialPrice: 300_000_000,
    rentalPeriodYears: 5.5,
    rentIncreaseUnder5Pct: false,
  };
  type Over = Parameters<typeof makeHouse>[1];
  const run = (others: Over[]) =>
    determineMultiHouseSurcharge(
      makeInput([makeHouse("h1", { regionCode: "11680" }), ...others.map((o, i) => makeHouse(`h${i + 2}`, o))], {
        sellingHouseId: "h1",
        transferDate: TD,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

  it("M-1 3주택(임대 2채) — 초과 증액 2018-06-01이면 §167의3①10호 일반주택 · 2019-06-01 [짝] 3주택 중과", () => {
    const pre = { ...A, rentIncreaseContractDate: D("2018-06-01") };
    const post = { ...A, rentIncreaseContractDate: D("2019-06-01") };
    expect(run([pre, pre]).surchargeApplicable).toBe(false);
    expect(run([post, post]).surchargeApplicable).toBe(true);
  });

  it("M-2 2주택 — §167의10①2호 경유도 같은 결론 (부칙 괄호 「제167조의10제1항제2호가 적용되는 경우를 포함」)", () => {
    expect(run([{ ...A, rentIncreaseContractDate: D("2019-02-11") }]).surchargeApplicable).toBe(false);
    expect(run([{ ...A, rentIncreaseContractDate: D("2019-02-12") }]).surchargeApplicable).toBe(true);
  });

  it("M-3 §167의3④ — 기간만 모자란 가목(3년)은 5% 초과가 2019-02-12 전뿐이면 10호 의제 · 이후면 [짝] 중과", () => {
    const pending = { ...A, rentalPeriodYears: 3 };
    expect(run([{ ...pending, rentIncreaseContractDate: D("2018-06-01") }]).surchargeApplicable).toBe(false);
    expect(run([{ ...pending, rentIncreaseContractDate: D("2019-06-01") }]).surchargeApplicable).toBe(true);
  });
});
