/**
 * anchor — §97의4 자진말소 · 가목2) 단서(사목 양도기한) · ⑪1호 자동말소일 연동 (2026-11-03)
 *
 * 소령 §167의3①2호 가목2) 「… 제11항에 따른 기한까지 양도할 것. 다만, 해당 주택이 사목에 해당하는 경우에는 같은 목에 따른
 *   양도기한을 적용한다.」 사목 「… 제6조제1항제11호에 따라 … 등록이 말소된 경우 … 로서 등록 말소 이후 1년 이내 양도하는 주택」.
 * ⑪1호 「임대의무기간이 2027년 1월 1일 이후 종료되는 주택: 같은 법 제6조제5항에 따라 임대주택 등록이 말소되는 날부터 1년이 되는 날」.
 *
 * 사용자 결정(2026-11-03): 사목 기한이 ⑪ 기한을 **대신**한다(B 읽기) · 임대기간 종점 = 자진말소일(1422 유추) · ⑪1호 = 자동말소일 연동.
 */
import { describe, it, expect } from "vitest";
import { evaluateRental974 } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(s);

const BASE = {
  id: "rental_97_4" as const,
  acquisitionDate: D("2016-06-01"),
  registrationDate: D("2017-01-02"),
  rentalStartDate: D("2017-01-02"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2017-01-02"),
  rentIncreaseViolated: false,
  rental974Category: "purchase_a" as const,
  region: "capital" as const,
  officialPriceAtStart: 300_000_000,
};
const run = (over: Record<string, unknown>) => evaluateRental974({ ...BASE, ...over } as Any) as Any;
const codes = (r: Any): string[] => (r.isEligible ? [] : r.ineligibleReasons.map((x: Any) => x.code));
const message = (r: Any): string => (r.isEligible ? "" : r.ineligibleReasons.map((x: Any) => x.message).join(" "));

describe("가목 아파트 + 자진말소(2020.8.18. 이후) — ⑪ 대신 사목 양도기한(말소일부터 1년)", () => {
  it("말소 2027.3.2. → 기한 2028.3.2.(목) 당일 양도 → 적용 · 임대기간은 말소일까지 10년(10%)", () => {
    const r = run({ isApartment974: true, voluntaryCancelledDate974: D("2027-03-02"), transferDate: D("2028-03-02") });
    expect(r.isEligible).toBe(true);
    expect(r.additionalRate).toBe(0.1);
    expect(r.rentalPeriod974).toEqual({ heir: { start: "2017-01-02", end: "2027-03-02" }, endReason: "voluntary_cancel" });
  });

  it("말소 2027.3.2. → 2028.3.3. 양도 → 기한 경과", () => {
    const r = run({ isApartment974: true, voluntaryCancelledDate974: D("2027-03-02"), transferDate: D("2028-03-03") });
    expect(codes(r)).toEqual(["APT_TRANSFER_DEADLINE_PASSED"]);
  });

  it("🔴 B 읽기 — 말소 2024.3.4. → 2026.6.1. 양도는 ⑪(2027.12.31.) 안이어도 사목 기한(2025.3.4.)이 지나 불적용 + 확인 필요", () => {
    const r = run({ isApartment974: true, voluntaryCancelledDate974: D("2024-03-04"), transferDate: D("2026-06-01") });
    expect(codes(r)).toEqual(["APT_TRANSFER_DEADLINE_PASSED"]);
    expect(message(r)).toContain("사목에 해당하는 경우에는 같은 목에 따른 양도기한");
    expect(message(r)).toContain("확인 필요");
    expect(r.ineligibleReasons[0].legalBasis).toBe("소득세법 시행령 §167의3①2호 사목");
  });

  it("사목이면 ⑪ 연장 사실은 쓰지 않는다 — 3호 이전고시 전이어도 사목 기한 경과면 불적용", () => {
    const r = run({
      isApartment974: true,
      voluntaryCancelledDate974: D("2024-03-04"),
      aptDeadlineExtension974: { relocationAuthorizationDate: D("2024-01-02"), relocationNotYetAnnounced: true },
      transferDate: D("2026-06-01"),
    });
    expect(codes(r)).toEqual(["APT_TRANSFER_DEADLINE_PASSED"]);
  });

  it("아파트 여부 모름 + 사목 기한 경과 → MISSING_APARTMENT_974 / 기한 안이면 적용", () => {
    expect(codes(run({ voluntaryCancelledDate974: D("2024-03-04"), transferDate: D("2026-06-01") }))).toEqual([
      "MISSING_APARTMENT_974",
    ]);
    expect(run({ voluntaryCancelledDate974: D("2024-03-04"), transferDate: D("2025-03-04") }).isEligible).toBe(true);
  });
});

describe("자진말소 — 기한과 무관한 경우 · 임대기간 종점", () => {
  it("가목 + 아파트 아님 → 기한 없음 · 말소 2024.3.4.까지 7년(4%)", () => {
    const r = run({ isApartment974: false, voluntaryCancelledDate974: D("2024-03-04"), transferDate: D("2026-06-01") });
    expect(r.isEligible).toBe(true);
    expect(r.eligibleRentalYears).toBe(7);
    expect(r.additionalRate).toBe(0.04);
    expect(r.rentalPeriod974.endReason).toBe("voluntary_cancel");
  });

  it("다목(건설임대) → 기한 없음 · 종점만 자진말소일", () => {
    const r = run({
      rental974Category: "construction_c",
      isApartment974: true,
      voluntaryCancelledDate974: D("2024-03-04"),
      transferDate: D("2030-01-02"),
    });
    expect(r.isEligible).toBe(true);
    expect(r.eligibleRentalYears).toBe(7);
  });

  it("2020.8.18. 전 말소는 사목이 아니다 → ⑪ 기한(2027.12.31.) 적용 · 종점은 말소일(2014 등록 → 6년 2%)", () => {
    const r = run({
      registrationDate: D("2014-01-02"),
      rentalStartDate: D("2014-01-02"),
      taxRegistrationDate: D("2014-01-02"),
      isApartment974: true,
      voluntaryCancelledDate974: D("2020-06-01"),
      transferDate: D("2026-06-01"),
    });
    expect(r.isEligible).toBe(true);
    expect(r.additionalRate).toBe(0.02);
    expect(r.rentalPeriod974.heir.end).toBe("2020-06-01");
  });

  it("6년 미만 → RENTAL_PERIOD_SHORT 문구에 자진말소 종점 · 확인 필요", () => {
    const r = run({ isApartment974: false, voluntaryCancelledDate974: D("2022-06-02"), transferDate: D("2026-06-01") });
    expect(codes(r)).toEqual(["RENTAL_PERIOD_SHORT"]);
    expect(message(r)).toContain("자진말소된 날까지만");
  });

  it("양도일 뒤 자진말소일은 쓰지 않는다 (종점 = 양도일 · 사목 아님)", () => {
    const r = run({ isApartment974: false, voluntaryCancelledDate974: D("2027-01-04"), transferDate: D("2026-06-01") });
    expect(r.rentalPeriod974.endReason).toBe("transfer");
  });
});

describe("⑪1호 — 자동말소일(2027.1.1. 이후)을 1호 날로 연동", () => {
  it("자동말소 2027.6.1. · 연장 입력 없음 → 기한 2028.6.1. — 2028.5.1. 양도 적용", () => {
    const r = run({ isApartment974: true, autoCancelledDate974: D("2027-06-01"), transferDate: D("2028-05-01") });
    expect(r.isEligible).toBe(true);
    expect(r.rentalPeriod974.endReason).toBe("auto_cancel");
  });

  it("「연장 사유 없음」으로 답했어도 자동말소일 사실이 1호를 성립시킨다", () => {
    const r = run({
      isApartment974: true,
      autoCancelledDate974: D("2027-06-01"),
      aptDeadlineExtension974: { confirmedNone: true },
      transferDate: D("2028-05-01"),
    });
    expect(r.isEligible).toBe(true);
  });

  it("늘어난 기한(2028.6.1.)도 지나면 불적용", () => {
    const r = run({ isApartment974: true, autoCancelledDate974: D("2027-06-01"), transferDate: D("2028-07-03") });
    expect(codes(r)).toEqual(["APT_TRANSFER_DEADLINE_PASSED"]);
  });

  it("자동말소 2026.12.31.은 1호가 아니다 → 2028.1.3. 양도는 경과 + 연장 사유 모름 고지", () => {
    const r = run({ isApartment974: true, autoCancelledDate974: D("2026-12-31"), transferDate: D("2028-01-03") });
    expect(codes(r)).toEqual(["APT_TRANSFER_DEADLINE_PASSED"]);
    expect(message(r)).toContain("연장 사유를 확인하지 못해");
  });

  it("아파트 여부 모름 + 자동말소 2027.6.1. + 2028.5.1. 양도 → 기한 안이라 묻지 않는다(적용)", () => {
    expect(run({ autoCancelledDate974: D("2027-06-01"), transferDate: D("2028-05-01") }).isEligible).toBe(true);
  });
});
