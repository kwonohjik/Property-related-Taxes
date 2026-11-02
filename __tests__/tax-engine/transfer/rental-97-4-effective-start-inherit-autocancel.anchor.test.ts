/**
 * anchor — §97의4 임대기간 산정 (리뷰 2026-11-02 R-1 · R-3 · R-4)
 *
 * ## R-1 기산일 — 조특령 §97의4②
 * 「…「소득세법」 제168조에 따른 사업자등록과 「민간임대주택에 관한 특별법」 제5조에 따른 임대사업자등록을 하거나 …
 *  임대하는 날부터 임대를 개시한 것으로 본다」 (국세청 서면-2019-부동산-1090, 2019.4.9. 같은 취지)
 * ⇒ 임대일·임대사업자 등록일·세무서 사업자등록일 중 가장 늦은 날. 종전에는 입력한 임대일을 그대로 써
 *   등록 전 임대기간까지 셌다 — 임대 2014·등록 2016·양도 2022.6. → 8년 6%(정답 6년 2%).
 *   소령 §167의3①2호 가·다목 단서 「2018.3.31까지 사업자등록등」도 두 등록 중 늦은 날로 본다.
 *
 * ## R-3 상속 — 조특령 §97의4② → 조특령 §97⑤3호
 * 「상속인이 상속으로 인하여 피상속인의 임대주택을 취득하여 임대하는 경우에는 피상속인의 주택임대기간을
 *  상속인의 주택임대기간에 합산할 것」 (같은 호를 §97의2에 적용한 국세청 서면5팀-2988, 2007.11.14.)
 * 사용자 결정(2026-11-02): 2018.3.31 단서·기준시가 한도 「임대개시일 당시」는 피상속인 기준.
 *
 * ## R-4 자동말소 종점 — 국세청 서면-2021-법규재산-1422 (2022.6.21.)
 * 「…추가공제율 적용 시 임대기간은 조특령 §97의4②에 따른 임대개시일부터 자동말소일까지의 기간에 따라 산정」
 * 회신 사실관계를 그대로 쓴다: 임대사업자 등록 2012.9. · 자동말소 2020.8. · 양도 2021.4. → 7년 10개월(7년 = 4%).
 */
import { describe, it, expect } from "vitest";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);

const BASE = {
  id: "rental_97_4" as const,
  acquisitionDate: D("2013-01-01"),
  isTaxRegistered: true,
  rentIncreaseViolated: false,
  rental974Category: "purchase_a" as const,
  region: "capital" as const,
  officialPriceAtStart: 300_000_000,
};
const run = (over: Record<string, unknown>) => evaluateRental974({ ...BASE, ...over } as Any) as Any;
const codes = (r: Any): string[] => (r.isEligible ? [] : r.ineligibleReasons.map((x: Any) => x.code));

describe("R-1 기산일 = 임대일·임대사업자 등록일·세무서 사업자등록일 중 늦은 날 (조특령 §97의4②)", () => {
  it("🔴 등록 전부터 임대(2014) · 등록 2016-03-01 · 양도 2022-06-01 → 6년 2% (종전 8년 6%)", () => {
    const r = run({
      rentalStartDate: D("2014-03-01"),
      registrationDate: D("2016-03-01"),
      taxRegistrationDate: D("2016-03-01"),
      transferDate: D("2022-06-01"),
    });
    expect(r.isEligible).toBe(true);
    expect(r.eligibleRentalYears).toBe(6);
    expect(r.additionalRate).toBe(0.02);
    expect(r.rentalPeriod974).toEqual({ heir: { start: "2016-03-01", end: "2022-06-01" }, endReason: "transfer" });
  });

  it("🔴 임대 2015 · 등록 2017-12-01 · 양도 2023-06-01 → 5년이라 불적용 (종전 8년 6%)", () => {
    const r = run({
      rentalStartDate: D("2015-01-01"),
      registrationDate: D("2017-12-01"),
      taxRegistrationDate: D("2017-12-01"),
      transferDate: D("2023-06-01"),
    });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
  });

  it("🔴 세무서 사업자등록일이 가장 늦으면 그날부터 — 2017-03-01 → 7년 4% (임대사업자 등록일 기준이면 8년 6%)", () => {
    const r = run({
      rentalStartDate: D("2016-03-01"),
      registrationDate: D("2016-03-01"),
      taxRegistrationDate: D("2017-03-01"),
      transferDate: D("2024-06-01"),
    });
    expect(r.eligibleRentalYears).toBe(7);
    expect(r.additionalRate).toBe(0.04);
  });

  it("사업자등록 확인했는데 날짜가 없으면 추정하지 않는다 — MISSING_TAX_REGISTRATION_DATE", () => {
    const r = run({
      rentalStartDate: D("2016-03-01"),
      registrationDate: D("2016-03-01"),
      transferDate: D("2024-06-01"),
    });
    expect(codes(r)).toContain("MISSING_TAX_REGISTRATION_DATE");
  });

  it("🔴 「2018.3.31까지 사업자등록등」 — 임대사업자 2018-03-31이어도 세무서 사업자등록 2018-06-01이면 배제", () => {
    const r = run({
      rentalStartDate: D("2018-06-01"),
      registrationDate: D("2018-03-31"),
      taxRegistrationDate: D("2018-06-01"),
      transferDate: D("2025-06-01"),
    });
    expect(codes(r)).toContain("REGISTRATION_AFTER_2018_03_31");
  });

  it("기산일이 임대일과 같으면 종전과 같다 — 등록·사업자등록·임대 모두 2016-03-01 · 양도 2024-06-01 → 8년 6%", () => {
    const r = run({
      rentalStartDate: D("2016-03-01"),
      registrationDate: D("2016-03-01"),
      taxRegistrationDate: D("2016-03-01"),
      transferDate: D("2024-06-01"),
    });
    expect(r.eligibleRentalYears).toBe(8);
    expect(r.additionalRate).toBe(0.06);
  });
});

describe("R-3 상속 — 피상속인 임대기간 합산 (조특령 §97⑤3호 준용)", () => {
  const HEIR = {
    rentalStartDate: D("2016-07-01"),
    registrationDate: D("2016-07-01"),
    taxRegistrationDate: D("2016-07-01"),
    transferDate: D("2020-07-01"),
  };
  const INH = {
    inheritanceDate: D("2016-01-01"),
    decedentRegistrationDate: D("2012-01-01"),
    decedentRentalStartDate: D("2012-01-01"),
  };

  it("상속인 분만이면 4년 → 불적용", () => {
    expect(codes(run(HEIR))).toEqual(["RENTAL_PERIOD_SHORT"]);
  });

  it("🔴 피상속인 4년(2012.1.1.~2016.1.1.) + 상속인 4년(2016.7.1.~2020.7.1.) = 8년 → 6%", () => {
    const r = run({ ...HEIR, inheritance974: INH });
    expect(r.isEligible).toBe(true);
    expect(r.eligibleRentalYears).toBe(8);
    expect(r.additionalRate).toBe(0.06);
    expect(r.rentalPeriod974).toEqual({
      heir: { start: "2016-07-01", end: "2020-07-01" },
      decedent: { start: "2012-01-01", end: "2016-01-01" },
      endReason: "transfer",
    });
  });

  it("상속개시일~상속인 등록 전 공백(6개월)은 넣지 않는다 — 공백까지 넣었다면 8년 6개월이어도 8년이므로, 공백을 3년으로 늘려 갈린다", () => {
    // 피상속인 4년 + 상속인 2019.1.1.~2023.1.1. 4년 = 8년. 공백 3년을 넣었다면 11년(10%)이다.
    const r = run({
      rentalStartDate: D("2019-01-01"),
      registrationDate: D("2019-01-01"),
      taxRegistrationDate: D("2019-01-01"),
      transferDate: D("2023-01-01"),
      inheritance974: INH,
    });
    expect(r.eligibleRentalYears).toBe(8);
    expect(r.additionalRate).toBe(0.06);
  });

  it("🔑 사용자 결정 — 2018.3.31 단서는 피상속인 사업자등록등일로 판정: 상속인 등록 2019년이어도 배제하지 않는다", () => {
    const r = run({
      rentalStartDate: D("2019-01-01"),
      registrationDate: D("2019-01-01"),
      taxRegistrationDate: D("2019-01-01"),
      transferDate: D("2023-01-01"),
      inheritance974: INH,
    });
    expect(codes(r)).not.toContain("REGISTRATION_AFTER_2018_03_31");
  });

  it("피상속인 사업자등록등일이 2018.3.31 이후면 배제", () => {
    const r = run({
      ...HEIR,
      transferDate: D("2026-07-01"),
      inheritance974: { ...INH, inheritanceDate: D("2020-01-01"), decedentRegistrationDate: D("2018-05-01") },
    });
    expect(codes(r)).toContain("REGISTRATION_AFTER_2018_03_31");
  });

  it("상속인 임대일을 상속개시일 전으로 입력해도 상속개시일 전으로 거슬러 세지 않는다 (피상속인 분과 겹치지 않는다)", () => {
    const r = run({
      rentalStartDate: D("2015-01-01"),
      registrationDate: D("2015-01-01"),
      taxRegistrationDate: D("2015-01-01"),
      transferDate: D("2020-01-01"),
      inheritance974: INH,
    });
    // 피상속인 4년 + 상속인 2016.1.1.~2020.1.1. 4년 = 8년 (겹쳐 세면 9년)
    expect(r.eligibleRentalYears).toBe(8);
    expect(r.rentalPeriod974.heir.start).toBe("2016-01-01");
  });

  it("피상속인 날짜가 상속개시일 이후면 INVALID_INHERITANCE_DATES", () => {
    const r = run({ ...HEIR, inheritance974: { ...INH, decedentRentalStartDate: D("2016-02-01") } });
    expect(codes(r)).toContain("INVALID_INHERITANCE_DATES");
  });
});

describe("R-4 자동말소 종점 (국세청 서면-2021-법규재산-1422)", () => {
  // 회신 사실관계: 임대 2010.6. · 임대사업자 등록 2012.9. · 자동말소 2020.8. · 양도 2021.4.
  const RULING = {
    rentalStartDate: D("2010-06-01"),
    registrationDate: D("2012-09-01"),
    taxRegistrationDate: D("2012-09-01"),
    transferDate: D("2021-04-01"),
  };

  it("자동말소 없음 — 2012.9.~2021.4. 8년 → 6%", () => {
    expect(run(RULING).additionalRate).toBe(0.06);
  });

  it("🔴 자동말소 2020-08-18 — 임대개시일~자동말소일 7년 11개월 → 7년 4%", () => {
    const r = run({ ...RULING, autoCancelledDate974: D("2020-08-18") });
    expect(r.eligibleRentalYears).toBe(7);
    expect(r.additionalRate).toBe(0.04);
    expect(r.rentalPeriod974).toEqual({ heir: { start: "2012-09-01", end: "2020-08-18" }, endReason: "auto_cancel" });
  });

  it("자동말소일이 양도일 이후면 종점은 양도일", () => {
    const r = run({ ...RULING, autoCancelledDate974: D("2022-01-01") });
    expect(r.additionalRate).toBe(0.06);
    expect(r.rentalPeriod974.endReason).toBe("transfer");
  });

  it("자동말소로 6년 미만이 되면 불적용 — 사유 문구가 자동말소일 종점을 밝힌다", () => {
    const r = run({ ...RULING, autoCancelledDate974: D("2017-09-01") });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(r.ineligibleReasons[0].message).toContain("자동말소된 날까지만");
  });
});
