/**
 * anchor — 조특법 §97의3 단기민간임대 → 장기일반 변경신고 주택의 임대개시 의제 (PR-C: 계획서 #3 · §4.4)
 *
 * 조특령 §97의3④ 후단 · 대통령령 제29527호 부칙 §29 · 민특령 §34①(당시 3호) · 민특법 부칙 §3②.
 * 사용자 결정: Q-2(신고일·수리일 필수) · Q-3·V-11(의무기간 N = 원 등록 ≤2015-12-28이면 5년, 이후 4년) ·
 * Q-4(단기 개시일 = 세 날짜 중 늦은 날) · Q-5(등록·임대기간 모두 의제 개시일부터) · Q-7(임대료 판정은 수리일부터).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import {
  resolveShortTermConversion,
  shortTermObligationYears,
  toIsoDay,
} from "@/lib/tax-engine/transfer-reductions/rental-97-short-term-conversion";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);
const iso = (d: Date | undefined) => (d ? toIsoDay(d) : undefined);

/** 단기 매입 — 취득 2016-02-01, 단기 등록·임대·사업자등록 2016-03-01 (N = 4) */
const BASE = {
  id: "rental_97_3" as const,
  acquisitionDate: D("2016-02-01"),
  registrationDate: D("2016-03-01"),
  rentalStartDate: D("2016-03-01"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2016-03-01"),
  rentIncreaseViolated: false,
  isNationalHousingScale: true,
  officialPriceAtStart: 300_000_000,
  stdPriceAtAcquisition: 280_000_000,
  stdPriceAtTransfer: 600_000_000,
  region: "capital" as const,
  rentalContinuesToTransfer: true,
};
const conv = (reported: string, accepted = reported) => ({
  shortTermConversion: { reportedDate: D(reported), acceptedDate: D(accepted) },
});
const run = (over: Record<string, unknown>) => evaluateRental973({ ...BASE, ...over } as Any) as Any;
const codes = (r: Any) => (r.isEligible ? [] : r.ineligibleReasons.map((x: Any) => x.code));

describe("구간·의제 개시일 (resolveShortTermConversion)", () => {
  const res = (reg: string, reported: string, accepted = reported, over: { rentalStart?: string; taxReg?: string } = {}) =>
    resolveShortTermConversion({
      registrationDate: D(reg),
      rentalStartDate: D(over.rentalStart ?? reg),
      taxRegistrationDate: D(over.taxReg ?? reg),
      reportedDate: D(reported),
      acceptedDate: D(accepted),
    });

  it("R3-13 사용자 예시 1 — 단기 개시 2015-05-01, 신고·수리 2019-05-01 → 의제 개시 2015-05-01", () => {
    const r = res("2015-05-01", "2019-05-01");
    expect(r.era).toBe("new_before_end"); // N = 5(구 임대주택법) → 의무 종료 2020-05-01 전 변경
    expect(r.obligationYears).toBe(5);
    expect(iso(r.deemedStartDate)).toBe("2015-05-01");
  });

  it("R3-14 사용자 예시 2 — 단기 개시 2015-02-11, 신고·수리 2019-02-11 → 종전 50% → 의제 개시 2017-02-11", () => {
    const r = res("2015-02-11", "2019-02-11");
    expect(r.era).toBe("old");
    expect(r.creditedDays).toBe(730); // 1,461일 ÷ 2 절사
    expect(iso(r.deemedStartDate)).toBe("2017-02-11");
  });

  it("R3-12 경계 — 신고 2019-02-11은 종전(50%), 2019-02-12는 신규(전부)", () => {
    expect(res("2016-03-01", "2019-02-11").era).toBe("old");
    expect(res("2016-03-01", "2019-02-12").era).toBe("new_before_end");
  });

  it("R3-4 경계 — 신고 2020-07-10 포함 / 2020-07-11 제외 (신고 2020-07-10·수리 2020-07-15도 신고일 기준 포함)", () => {
    expect(res("2016-03-01", "2020-07-10").era).not.toBe("excluded");
    expect(res("2016-03-01", "2020-07-11").era).toBe("excluded");
    expect(res("2016-03-01", "2020-07-10", "2020-07-15").era).not.toBe("excluded");
  });

  it("R3-17 의무기간 N 경계 — 원 등록 2015-12-28 → 5년 / 2015-12-29 → 4년", () => {
    expect(shortTermObligationYears(D("2015-12-28"))).toBe(5);
    expect(shortTermObligationYears(D("2015-12-29"))).toBe(4);
  });

  it("🔴 가/나는 **신고일**로 가른다 — 신고 2020-02-20(종료 전) · 수리 2020-03-10(종료 후) → 가목 (민특령 §34①3호 「종료 전에 변경신고한 경우」)", () => {
    const r = res("2016-03-01", "2020-02-20", "2020-03-10");
    expect(r.era).toBe("new_before_end");
    expect(iso(r.deemedStartDate)).toBe("2016-03-01");
    // 반대 — 신고가 종료 이후면 수리일부터 역산(나목)
    const late = res("2016-03-01", "2020-03-02", "2020-03-10");
    expect(late.era).toBe("new_after_end");
    expect(iso(late.deemedStartDate)).toBe("2016-03-10");
  });

  it("R3-3 가/나 경계 — 의무 종료일(2020-03-01) 전날 신고는 가목, 당일·다음 날은 나목 (가정 V-6)", () => {
    expect(res("2016-03-01", "2020-02-29").era).toBe("new_before_end");
    expect(res("2016-03-01", "2020-03-01").era).toBe("new_after_end");
    expect(res("2016-03-01", "2020-03-02").era).toBe("new_after_end");
  });

  it("R3-5b 나목 클램프(A-3) — 수리 2020-05-15 → 역산 2016-05-15, 사업자등록 2016-09-01이면 2016-09-01", () => {
    expect(iso(res("2016-03-01", "2020-05-15").deemedStartDate)).toBe("2016-05-15");
    expect(iso(res("2016-03-01", "2020-05-15", "2020-05-15", { taxReg: "2016-09-01" }).deemedStartDate)).toBe("2016-09-01");
  });

  it("R3-16 N = 5 나목 — 구 임대주택법 등록·임대 2014-03-01, 신고·수리 2019-06-01 → 의제 개시 2014-06-01 (N = 4였다면 2015-06-01)", () => {
    const r = res("2014-03-01", "2019-06-01");
    expect(r.era).toBe("new_after_end");
    expect(r.obligationYears).toBe(5);
    expect(iso(r.deemedStartDate)).toBe("2014-06-01");
  });

  it("R3-10 「5년의 범위에서」(결정 (b)) — 단기 12년 임대 후 신고 2018-11-01 → 5년(1,826일)만 보고 50% = 913일 → 의제 개시 2016-05-02 (독해 (a)였다면 2013-11-01)", () => {
    const r = res("2006-11-01", "2018-11-01");
    expect(r.era).toBe("old");
    expect(r.creditedDays).toBe(913);
    expect(iso(r.deemedStartDate)).toBe("2016-05-02");
  });

  it("R3-11 부칙 §29② — 신고 2019-05-01이라도 2019-02-12 현재 단기 8년 초과(2010-12-01 개시)면 종전 규정", () => {
    const r = res("2010-12-01", "2019-05-01");
    expect(r.era).toBe("old_grandfathered");
    // 단기 2010-12-01 → 수리 2019-05-01 중 5년(2014-05-01 → 2019-05-01 = 1,826일)만 보고 50% = 913일 (결정 (b))
    expect(r.creditedDays).toBe(913);
  });
});

describe("evaluateRental973 — 의제 개시일로 임대기간·등록기간 판정 (Q-5)", () => {
  it("R3-1 가목 — 신고·수리 2019-05-01, 양도 2026-04-01 → 의제 개시 2016-03-01 → 10년 → 70% (종전: 수리일 입력 시 기간 미달)", () => {
    const r = run({ ...conv("2019-05-01"), transferDate: D("2026-04-01") });
    expect(r.isEligible).toBe(true);
    expect(r.overrideRate).toBe(0.7);
    expect(r.eligibleRentalYears).toBe(10);
    expect(r.shortTermConversionDetail).toEqual({ era: "new_before_end", deemedStartDate: "2016-03-01", obligationYears: 4 });
    // 대조 — 변경신고 정보 없이 수리일을 등록일로 넣으면(종전 사용 방식) 기간 미달
    const legacy = run({ registrationDate: D("2019-05-01"), transferDate: D("2026-04-01") });
    expect(codes(legacy)).toContain("RENTAL_PERIOD_SHORT");
  });

  it("🔴 신고 종료 전·수리 종료 후 — 양도 2026-03-05: 가목이라 의제 개시 2016-03-01 → 10년 70% (검토 게이트 C-2 실측: 종전 구현은 9년 50%)", () => {
    const r = run({ ...conv("2020-02-20", "2020-03-10"), transferDate: D("2026-03-05") });
    expect(r.shortTermConversionDetail.deemedStartDate).toBe("2016-03-01");
    expect(r.overrideRate).toBe(0.7);
  });

  it("R3-2 나목 — 수리 2020-05-15(의제 개시 2016-05-15): 양도 2026-05-14 → 9년 50% / 2026-05-15 → 10년 70%", () => {
    expect(run({ ...conv("2020-05-15"), transferDate: D("2026-05-14") }).overrideRate).toBe(0.5);
    expect(run({ ...conv("2020-05-15"), transferDate: D("2026-05-15") }).overrideRate).toBe(0.7);
  });

  it("R3-5 가목 + 사업자등록 2017-01-01 → 의제 개시 2017-01-01 (세 날짜 중 늦은 날)", () => {
    const r = run({ ...conv("2019-05-01"), taxRegistrationDate: D("2017-01-01"), transferDate: D("2027-02-01") });
    expect(r.shortTermConversionDetail.deemedStartDate).toBe("2017-01-01");
    expect(r.eligibleRentalYears).toBe(10);
  });

  it("R3-4 신고 2020-07-11 → 적용 제외 (CONVERTED_FROM_SHORT_TERM)", () => {
    expect(codes(run({ ...conv("2020-07-11"), transferDate: D("2030-08-01") }))).toContain("CONVERTED_FROM_SHORT_TERM");
  });

  it("R3-6 하위호환 — 구 플래그 true + 변경신고 정보 없음 → 종전처럼 제외", () => {
    expect(codes(run({ isConvertedFromShortTerm: true, transferDate: D("2026-04-01") }))).toContain("CONVERTED_FROM_SHORT_TERM");
  });

  it("수리일 < 신고일 → INVALID_SHORT_TERM_CONVERSION_DATES", () => {
    expect(codes(run({ ...conv("2019-05-01", "2019-04-01"), transferDate: D("2026-04-01") }))).toContain(
      "INVALID_SHORT_TERM_CONVERSION_DATES",
    );
  });

  it("R3-9 종전 50% — 단기 개시 2016-03-01, 신고·수리 2018-11-01 → 산입 487일 → 의제 개시 2017-07-02", () => {
    const r = run({ ...conv("2018-11-01"), transferDate: D("2028-11-01") });
    expect(r.shortTermConversionDetail).toEqual({ era: "old", deemedStartDate: "2017-07-02", creditedDays: 487 });
    expect(r.eligibleRentalYears).toBe(11);
  });

  it("안분 C·⑤ 기산도 의제 개시일 — 의제 개시 2016-03-01 > 취득 2016-02-01이라 기준시가 안분", () => {
    const r = run({ ...conv("2019-05-01"), transferDate: D("2026-04-01") });
    // (D 6억 − C 3억) / (D 6억 − E 2.8억)
    expect(r.rentalGainFraction).toEqual({ num: 300_000_000, den: 320_000_000 });
  });
});

describe("R3-15 임대료 증액 판정은 수리일부터 (Q-7 — 국세청 사전-2019-법령해석재산-0305)", () => {
  const history = [
    { contractDate: D("2016-03-01"), contractType: "jeonse" as const, deposit: 100_000_000, monthlyRent: 0 },
    { contractDate: D("2017-03-01"), contractType: "jeonse" as const, deposit: 108_000_000, monthlyRent: 0 }, // 단기 시절 8%
    { contractDate: D("2019-06-01"), contractType: "jeonse" as const, deposit: 113_000_000, monthlyRent: 0 }, // 수리 후 4.6%
  ];

  it("변경신고 주택 — 단기 시절 8% 증액은 판정하지 않는다", () => {
    const r = run({ ...conv("2019-05-01"), rentHistory: history, transferDate: D("2026-04-01") });
    expect(codes(r)).not.toContain("RENT_INCREASE_VIOLATED");
    expect(r.isEligible).toBe(true);
  });

  it("대조 — 변경신고가 아니면(2016 등록 장기) 2017년 8% 증액이 위반이다", () => {
    expect(codes(run({ rentHistory: history, transferDate: D("2026-04-01") }))).toContain("RENT_INCREASE_VIOLATED");
  });
});

describe("통합 — calculateTransferTax (router 명시 매핑 도달)", () => {
  it("reductions의 shortTermConversion이 evaluator까지 닿는다 (R3-1 → 70%)", () => {
    const res = calculateTransferTax(
      baseTransferInput({
        transferPrice: 600_000_000,
        acquisitionPrice: 300_000_000,
        acquisitionDate: D("2016-02-01"),
        transferDate: D("2026-04-01"),
        householdHousingCount: 2,
        isOneHousehold: false,
        residencePeriodMonths: 0,
        standardPriceAtAcquisition: 280_000_000,
        standardPriceAtTransfer: 600_000_000,
        reductions: [
          {
            type: "rental_97_3",
            registrationDate: D("2016-03-01"),
            rentalStartDate: D("2016-03-01"),
            isTaxRegistered: true,
            taxRegistrationDate: D("2016-03-01"),
            isNationalHousingScale: true,
            officialPriceAtStart: 300_000_000,
            region: "capital",
            rentalContinuesToTransfer: true,
            rentIncreaseViolated: false,
            shortTermConversion: { reportedDate: D("2019-05-01"), acceptedDate: D("2019-05-01") },
          },
        ],
      } as Any),
      makeMockRates(),
    ) as Any;
    expect(res.rental97LthdDetail.isEligible).toBe(true);
    expect(res.rental97LthdDetail.overrideRate).toBe(0.7);
    expect(res.rental97LthdDetail.shortTermConversionDetail.deemedStartDate).toBe("2016-03-01");
  });
});
