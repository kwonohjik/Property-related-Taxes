/**
 * 다주택 중과 — 임대의무기간이 지난 후 등록 말소를 신청한 장기임대주택(민간임대주택에 관한 특별법 §6①3호 후단).
 * 계획서 `docs/00-pm/surcharge-rental-cancel-after-duty.plan.md` · 범위 결정 Q-1 「그 임대주택 양도만」(2026-11-16).
 *
 * 기획재정부 재산세제과-536(다목) · 서면-2022-법규재산-3076(가목) · 서면-2023-부동산-1329(마목): 해당 목의 임대기간요건을 갖춘 뒤
 * 말소를 신청해 양도일 현재 말소 상태여도 그 주택 양도는 중과배제. 수정 전 엔진은 자동말소가 아니면 전부 장기임대주택에서 뺐다
 * (3주택 · 임대주택 자체 양도 → 3주택 중과 실측).
 *
 * | # | 주장 |
 * |---|---|
 * | AD-1~3 ★ | 가목(3076)·다목(536)·마목(1329) 그 주택 양도 → 배제 (수정 전 3주택 중과) |
 * | AD-4 ★ | 임대기간 종점 = 말소일 — 4년 임대 뒤 말소 · 양도일까지 6년이어도 불배제 (등록 중이면 배제) |
 * | AD-5 | 사목은 11호 전용 — `after_duty`여도 이 경로 밖 |
 * | AD-6 | 해석례 밖 목(나목) — 배제하되 사유 줄에 확인 필요 |
 * | AD-7 ★ | 다른 주택 양도 — 장기임대주택으로 보지 않음(2주택 중과) + 결론을 가를 때 확인 필요 고지 |
 * | AD-8 | 양도 주택에 「자진말소」를 골랐으면 중과 그대로 + 「의무기간 후 말소 신청」 안내 |
 * | AD-9 | ⑫⑭ — Zod가 `after_duty`를 받고 route 매핑이 엔진까지 싣는다 · ④ 양도 주택 payload |
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { isLongTermRentalHousingExempt } from "@/lib/tax-engine/multi-house-surcharge-count";
import { isAfterDutyCancelledRentalExempt } from "@/lib/tax-engine/multi-house-rental-after-duty";
// schema-sub는 transfer-tax-schema를 먼저 불러야 순환 초기화가 끝난다(rental-registered-date-v3-pipeline 테스트와 같은 순서).
import "@/lib/api/transfer-tax-schema";
import { houseSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapHousesToEngine } from "@/lib/api/transfer-route-multi-house";
import { buildSellingRentalPayload } from "@/lib/calc/transfer-tax-api-houses";
import { defaultRules, mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const T = new Date("2021-05-01");
const GANGNAM = "11680";

/** 2015-01-01 등록 · 6년 임대 · 2021-03-01 말소 신청(의무기간 경과 후) */
const rental = (over: Partial<HouseInfo> = {}): HouseInfo =>
  makeHouse("h2", {
    regionCode: GANGNAM,
    acquisitionDate: new Date("2014-06-01"),
    isApartment: false,
    isLongTermRental: true,
    isRegisteredRental: true,
    rentalType: "A",
    businessRegistrationDate: new Date("2015-01-01"),
    rentalRegistrationDate: new Date("2015-01-01"),
    rentalPeriodYears: 6,
    rentIncreaseUnder5Pct: true,
    rentalStartOfficialPrice: 500_000_000,
    rentalCancelledDate: new Date("2021-03-01"),
    rentalCancellationReason: "after_duty",
    ...over,
  });

const general = (id: string) => makeHouse(id, { regionCode: GANGNAM });
const run = (houses: HouseInfo[], sellingHouseId: string) =>
  determineMultiHouseSurcharge(makeInput(houses, { sellingHouseId, transferDate: T }), defaultRules, mockRegulatedHistory, suspensionNone, true);
const sellRental = (h2: HouseInfo) => run([general("h1"), h2, general("h3")], "h2");

const DA = { rentalType: "C" as const, hasMinimum2Units: true, landArea: 200, totalFloorArea: 140 };
const MA = {
  rentalType: "E" as const,
  businessRegistrationDate: new Date("2010-01-01"),
  rentalRegistrationDate: new Date("2010-01-01"),
  rentalPeriodYears: 11,
};

describe("그 임대주택 양도 — 배제", () => {
  it("AD-1 ★ 가목(3076) → 배제 · 사유 줄에 §6①3호·해석례 (수정 전 3주택 중과)", () => {
    const r = sellRental(rental());
    expect(r.surchargeApplicable).toBe(false);
    const detail = r.exclusionReasons.find((e) => e.type === "long_term_rental_house")!.detail;
    expect(detail).toContain("민간임대주택에 관한 특별법 §6 ① 3호");
    expect(detail).toContain("서면-2022-법규재산-3076");
    expect(detail).not.toContain("확인 필요");
    // 같은 사실을 「자진말소」로 넣으면 수정 전과 같이 중과 — 사유 선택이 결론을 가른다
    expect(sellRental(rental({ rentalCancellationReason: "voluntary" })).surchargeType).toBe("multi_house_3plus");
  });

  it("AD-2 ★ 다목(536) → 배제", () => {
    expect(sellRental(rental(DA)).surchargeApplicable).toBe(false);
    expect(sellRental(rental({ ...DA, rentalCancellationReason: "voluntary" })).surchargeApplicable).toBe(true);
  });

  it("AD-3 ★ 마목(1329) → 배제", () => {
    expect(sellRental(rental(MA)).surchargeApplicable).toBe(false);
    expect(sellRental(rental({ ...MA, rentalCancellationReason: "voluntary" })).surchargeApplicable).toBe(true);
  });
});

describe("요건 판정", () => {
  it("AD-4 ★ 임대기간 종점 = 말소일 — 2015-01 개시 · 2019-06 말소(4년 5개월) → 불배제 · 같은 날짜로 등록 중이면 배제", () => {
    const dated = { rentalPeriodYears: undefined, rentalStartDate: new Date("2015-01-01") };
    const early = rental({ ...dated, rentalCancelledDate: new Date("2019-06-01") });
    expect(isAfterDutyCancelledRentalExempt(early, T)).toBe(false);
    expect(sellRental(early).surchargeApplicable).toBe(true);
    // 대조 — 말소 없이 등록 중이면 양도일까지 6년 4개월 → 가목 5년 충족
    expect(isLongTermRentalHousingExempt({ ...early, rentalCancelledDate: undefined, rentalCancellationReason: undefined }, T)).toBe(true);
    // 말소일이 5년 뒤면 배제
    expect(isAfterDutyCancelledRentalExempt(rental({ ...dated, rentalCancelledDate: new Date("2020-03-01") }), T)).toBe(true);
  });

  it("AD-5 사목은 이 경로 밖 · 양도일 뒤 말소일은 아직 등록 중(none)", () => {
    expect(isAfterDutyCancelledRentalExempt(rental({ rentalType: "G" }), T)).toBe(false);
    expect(isAfterDutyCancelledRentalExempt(rental({ rentalCancelledDate: new Date("2021-06-01") }), T)).toBe(false);
    expect(isLongTermRentalHousingExempt(rental({ rentalCancelledDate: new Date("2021-06-01") }), T)).toBe(true);
  });

  it("AD-6 해석례 밖 목(나목) — 배제하되 확인 필요", () => {
    const na = rental({
      rentalType: "B",
      businessRegistrationDate: new Date("2003-01-01"),
      rentalRegistrationDate: new Date("2003-01-01"),
      rentalPeriodYears: 10,
      acquisitionOfficialPrice: 200_000_000,
      isNationalSizeHousing: true,
      hasMinimum2Units: true,
    });
    const r = sellRental(na);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.exclusionReasons.find((e) => e.type === "long_term_rental_house")!.detail).toContain("직접 다룬 해석은 확인하지 못했습니다(확인 필요)");
  });
});

describe("다른 주택 양도 · 사유 선택 고지", () => {
  it("AD-7 ★ 일반주택 양도 — 의무기간 후 말소 임대주택은 장기임대주택 아님(2주택 중과) + 확인 필요 고지", () => {
    const r = run([general("h1"), rental()], "h1");
    expect(r.surchargeApplicable).toBe(true);
    expect(r.exclusionReasons.some((e) => e.type === "only_general_two_house")).toBe(false);
    expect(r.warnings.join("\n")).toContain("다른 주택을 양도하는 이번 판정에서는 장기임대주택으로 보지 않았습니다");
    // 대조 — 등록 중이면 10호 배제
    expect(run([general("h1"), rental({ rentalCancelledDate: undefined, rentalCancellationReason: undefined })], "h1").surchargeApplicable).toBe(false);
  });

  it("AD-8 양도 주택 「자진말소」 → 중과 그대로 + 「의무기간 후 말소 신청」 안내 · after_duty면 안내 없음", () => {
    const r = sellRental(rental({ rentalCancellationReason: "voluntary" }));
    expect(r.warnings.join("\n")).toContain("「의무기간 후 말소 신청」을 고르세요");
    expect(sellRental(rental()).warnings.join("\n")).not.toContain("「의무기간 후 말소 신청」을 고르세요");
    // 요건 미충족(4년 만에 말소)이면 사유를 바꿔도 결론이 같아 안내하지 않는다
    const early = rental({ rentalPeriodYears: undefined, rentalStartDate: new Date("2015-01-01"), rentalCancelledDate: new Date("2019-06-01"), rentalCancellationReason: "voluntary" });
    expect(sellRental(early).warnings.join("\n")).not.toContain("「의무기간 후 말소 신청」을 고르세요");
  });
});

describe("⑫⑭ · ④ 배관", () => {
  it("AD-9 Zod가 after_duty를 받고 route 매핑이 엔진까지 · 양도 주택 payload도 말소일이 있을 때 싣는다", () => {
    const parsed = houseSchema.parse({
      id: "h2",
      acquisitionDate: "2014-06-01",
      officialPrice: 300_000_000,
      region: "capital",
      isInherited: false,
      isLongTermRental: true,
      isApartment: false,
      isOfficetel: false,
      isUnsoldHousing: false,
      rentalCancelledDate: "2021-03-01",
      rentalCancellationReason: "after_duty",
    });
    expect(mapHousesToEngine([parsed])![0].rentalCancellationReason).toBe("after_duty");
    expect(
      buildSellingRentalPayload({ isLongTermRental: true, rentalCancelledDate: "2021-03-01", rentalCancellationReason: "after_duty" }),
    ).toMatchObject({ rentalCancellationReason: "after_duty" });
  });
});
