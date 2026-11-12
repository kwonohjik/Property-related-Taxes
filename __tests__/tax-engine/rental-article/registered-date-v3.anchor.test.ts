/**
 * anchor — V-3: 「등록을 한」 경계는 지자체 임대사업자 **등록일**, 「등록 신청」 경계는 **신청일**.
 *
 * 근거:
 * - 서면-2021-법규재산-3280(2025.12.10.): 구청 신청 2018.3.30.·등록 2018.4.4. → 소령 §167의3①2호 가목
 *   「2018년 3월 31일까지 사업자등록등」 불충족. 2018.3.31.은 토요일이라 국세기본법 §5로 4.2.까지.
 * - 소령 §167의3③ 「사업자등록등을 하고 임대주택으로 등록하여 임대하는 날부터」 — 기산도 같은 「등록」.
 * - 민특령 §34①2호 「임대사업자 등록일」 — ㉓1호 1/2 기산.
 * - 나목 「기존사업자기준일 이전에 사업자등록등」·부칙<제35349호> 제15조 「민간임대주택으로 등록한」(바·아·자).
 * - 신청일 유지: ⑳ 본문·마목 2) 「2020년 7월 11일 이후 … 등록 신청」·부칙<제31083호> 제5조(8→10년).
 *
 * 실측(2026-11-12, 변경 전): RI-1 가목 중과배제 true · RI-2 53개월(신청일 2016-01-01로 자름) ·
 * RI-4 나목 통과 · RI-5 아목 REG_DATE_GATE · RI-7 ⑳ 기산 신청일 — 등록일 칸이 없어 모두 신청일로 판정했다.
 */
import { describe, it, expect } from "vitest";
import {
  calcLongTermRentalPeriodYears,
  isLongTermRentalHousingExempt,
} from "@/lib/tax-engine/multi-house-surcharge-count";
import { checkRentalArticle, type NormalizedRentalUnit } from "@/lib/tax-engine/rental-article/check";
import { deriveCategoryAvailability } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import {
  deriveHalfDutyRentalMonths,
  rentalRegistrationBasisDate,
} from "@/lib/stores/calc-wizard-asset-rental-period";
import { makeHouse } from "../_helpers/multi-house-mock";

const d = (s: string) => new Date(s);

/** NTS 3280 사실관계 — 세무서·구청 신청 2018-03-30, 구청 등록 2018-04-04 */
const ntsCase = (over: Parameters<typeof makeHouse>[1] = {}) =>
  makeHouse("h2", {
    isLongTermRental: true,
    rentalType: "A",
    isRegisteredRental: true,
    businessRegistrationDate: d("2018-03-30"),
    rentalRegistrationDate: d("2018-03-30"),
    rentalRegisteredDate: d("2018-04-04"),
    rentalStartDate: d("2018-04-04"),
    rentalStartOfficialPrice: 300_000_000,
    rentIncreaseUnder5Pct: true,
    ...over,
  });

describe("다주택 중과배제 — 가목 2018.3.31.(4.2.) 상한은 등록일", () => {
  const at = d("2023-06-01");

  it("RI-1 ★ NTS 3280 — 신청 3.30.·등록 4.4. → 가목 불인정", () => {
    expect(isLongTermRentalHousingExempt(ntsCase(), at)).toBe(false);
  });

  it("RI-1 대조 — 등록 4.2.(국세기본법 §5 연장 말일)이면 가목 인정", () => {
    expect(isLongTermRentalHousingExempt(ntsCase({ rentalRegisteredDate: d("2018-04-02"), rentalStartDate: d("2018-04-02") }), at)).toBe(true);
  });

  it("RI-1 대조 — 등록일 미제공(직접 API·옛 기록)은 신청일로 본다(종전 동작)", () => {
    expect(isLongTermRentalHousingExempt(ntsCase({ rentalRegisteredDate: undefined }), at)).toBe(true);
  });
});

describe("§167의3③ 기산 — 등록일로 자른다", () => {
  it("RI-2 ★ 개시 2015-01-01 · 신청 2016-01-01 · 등록 2016-03-01 · 양도 2020-06-01 → 51개월", () => {
    const h = makeHouse("h2", {
      isLongTermRental: true,
      rentalType: "A",
      isRegisteredRental: true,
      businessRegistrationDate: d("2016-01-01"),
      rentalRegistrationDate: d("2016-01-01"),
      rentalRegisteredDate: d("2016-03-01"),
      rentalStartDate: d("2015-01-01"),
    });
    expect(calcLongTermRentalPeriodYears(h, d("2020-06-01")) * 12).toBe(51);
  });
});

const unit = (over: Partial<NormalizedRentalUnit> = {}): NormalizedRentalUnit =>
  ({
    isCapitalArea: true,
    isApartment: false,
    acquisitionOfficialPrice: 100_000_000,
    rentalYears: 10,
    landAreaM2: 200,
    totalFloorAreaM2: 100,
    hasMinimum2Units: true,
    isNationalSizeHousing: true,
    rentIncreaseUnder5Pct: true,
    rentalStartOfficialPrice: 300_000_000,
    ...over,
  }) as NormalizedRentalUnit;

describe("목별 등록 경계 — 등록일", () => {
  it("RI-4 나목 — 지자체 신청 2003-10-28 · 등록 2003-10-30 → 기존사업자기준일 뒤 등록 · REG_DATE_GATE", () => {
    const r = checkRentalArticle(
      "나",
      unit({
        businessRegistrationDate: d("2003-10-28"),
        rentalRegistrationDate: d("2003-10-28"),
        rentalRegisteredDate: d("2003-10-30"),
      }),
    );
    expect(r.failCodes).toContain("REG_DATE_GATE");
  });

  it("RI-5 아목 — 신청 2025-06-02 · 등록 2025-06-05 → 6.4. 이후 등록 · 하한 통과", () => {
    const r = checkRentalArticle(
      "아",
      unit({
        rentalYears: 6,
        businessRegistrationDate: d("2025-06-02"),
        rentalRegistrationDate: d("2025-06-02"),
        rentalRegisteredDate: d("2025-06-05"),
      }),
    );
    expect(r.failCodes).not.toContain("REG_DATE_GATE");
  });

  it("RI-5b ⑤ 임대 구분 활성 — 같은 날짜로 아·자 활성, 나목 비활성", () => {
    const a = deriveCategoryAvailability(d("2025-06-02"), d("2025-06-02"), d("2025-06-05"));
    expect(a.short_6y.available).toBe(true);
    const b = deriveCategoryAvailability(d("2003-10-28"), d("2003-10-28"), d("2003-10-30"));
    expect(b.existing_business.available).toBe(false);
  });

  it("RI-6 마목 2020.7.11. 아파트 경계는 신청일 — 신청 2020-07-10 · 등록 2020-07-15 → 아파트 제한 없음", () => {
    const r = checkRentalArticle(
      "마",
      unit({
        isApartment: true,
        businessRegistrationDate: d("2020-07-10"),
        rentalRegistrationDate: d("2020-07-10"),
        rentalRegisteredDate: d("2020-07-15"),
      }),
    );
    expect(r.failCodes).not.toContain("APARTMENT_RESTRICTED");
    expect(r.requiredYears).toBe(8);
  });
});

describe("§155⑳ 화면 — 기산·㉓1호 1/2도 등록일", () => {
  it("RI-7 ★ ⑳ 기산일 = 세무서 사업자등록일·지자체 등록일 중 늦은 날", () => {
    expect(
      rentalRegistrationBasisDate({
        businessRegistrationDate: "2016-01-01",
        rentalRegistrationDate: "2016-01-01",
        rentalRegisteredDate: "2016-03-01",
      }),
    ).toBe("2016-03-01");
  });

  it("RI-8 ★ ㉓1호 1/2 — 지자체 등록일(2016-03-01)부터 · 세무서 늦은 날은 안 봄", () => {
    const months = deriveHalfDutyRentalMonths({
      rentalInputMode: "interval",
      rentalPeriods: [{ start: "2015-01-01", end: "2020-03-01" }],
      rentalRegistrationDate: "2016-01-01",
      rentalRegisteredDate: "2016-03-01",
    });
    expect(months).toBe(48);
  });
});
