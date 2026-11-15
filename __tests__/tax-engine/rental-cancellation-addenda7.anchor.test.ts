/**
 * Q-3 — 다주택 중과 §167의3①2호 단서 × 법률 제17482호 민간임대주택에 관한 특별법 부칙 제7조
 * (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` Q-3 · V-3).
 *
 * 부칙 제7조: 「…단기민간임대주택 또는 … 장기일반임대주택 중 아파트를 임대하는 민간매입임대주택의 임대의무기간이 이 법 시행일 전에
 * 경과된 경우에는 이 법 시행일에 그 임대주택의 등록이 말소된 것으로 본다.」
 * 서면-2021-법규재산-6391(→ 기획재정부 재산세제과-861, 2022.8.1.): 2003.03. 단기 등록 → 2020.08.18. 자동말소 주택에 「각목 외 부분
 * 단서에 따라 중과배제 적용 가능」 — 간주 말소에도 단서가 적용된다.
 *
 * 화면의 말소 사유 「자동말소」 설명이 「임대의무기간 종료일 말소」라 사용자는 2020.8.18. 전 종료일을 넣는다. 종전 엔진은 그 날짜를
 * 「자동말소 제도 전 말소」로 보아 장기임대주택에서 뺐다(같은 사실을 2020-08-18로 넣으면 배제 — 입력 방식에 따라 세액이 갈렸다).
 */
import { describe, it, expect } from "vitest";
import { rentalCancellationStatus } from "@/lib/tax-engine/rental-cancellation-deeming";
import { isSeparateHouseholdGiftOfCancelledRental } from "@/lib/tax-engine/rental-cancellation-deeming";
import { addenda7DeemedCancellationNotices } from "@/lib/tax-engine/rental-cancellation-deeming";
import { isLongTermRentalHousingExempt } from "@/lib/tax-engine/multi-house-surcharge-count";
import { isLongTermRentalDutyPeriodPending } from "@/lib/tax-engine/multi-house-surcharge-count";
import { rentalCardSurchargeRows } from "@/lib/tax-engine/rental-card-surcharge-rows";
import type { HouseInfo, MultiHouseSurchargeInput } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);
/** 가목 다세대 · 단기 2014-03-01 등록 · 4년 의무기간 2018-03-01 종료 · 자동말소일 입력 = 종료일 */
const house = (over: Partial<HouseInfo> = {}): HouseInfo => ({
  id: "r",
  acquisitionDate: d("2013-01-01"),
  officialPrice: 300_000_000,
  region: "capital",
  isCapitalArea: true,
  isInherited: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  isApartment: false,
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalType: "A",
  businessRegistrationDate: d("2014-03-01"),
  rentalRegistrationDate: d("2014-03-01"),
  rentalPeriodYears: 4,
  rentIncreaseUnder5Pct: true,
  rentalStartOfficialPrice: 250_000_000,
  rentalCancelledDate: d("2018-03-01"),
  rentalCancellationReason: "auto",
  ...over,
});

describe("Q-3 부칙 제7조 — 말소 상태", () => {
  it("E-1 ★ 자동말소 2018-03-01 입력 · 2022 양도 → auto_deemed · 2호 장기임대주택 (종전 not_deemed · 2호 아님)", () => {
    expect(rentalCancellationStatus(house(), d("2022-03-01"))).toBe("auto_deemed");
    expect(isLongTermRentalHousingExempt(house(), d("2022-03-01"))).toBe(true);
  });
  it("E-2 ★ 양도일 2020-05-01(2020.8.18. 전) → 아직 등록 중(none) · 기간만 모자라면 ④ 대상 (종전 not_deemed · ④ 아님)", () => {
    expect(rentalCancellationStatus(house(), d("2020-05-01"))).toBe("none");
    expect(isLongTermRentalDutyPeriodPending(house(), d("2020-05-01"))).toBe(true);
  });
  it("E-3 짝 — 자진말소 · 미선택 · 단서 밖 목(나목)은 그 전 날짜여도 간주하지 않는다", () => {
    const T = d("2022-03-01");
    expect(rentalCancellationStatus(house({ rentalCancellationReason: "voluntary" }), T)).toBe("not_deemed");
    expect(rentalCancellationStatus(house({ rentalCancellationReason: undefined }), T)).toBe("not_deemed");
    expect(rentalCancellationStatus(house({ rentalType: "B" }), T)).toBe("not_deemed");
    expect(isLongTermRentalHousingExempt(house({ rentalCancellationReason: "voluntary" }), T)).toBe(false);
  });
  it("E-4 ★ S-4 — 별도세대 2019-01-01 증여 · 자동말소 2018-03-01 입력 → 말소는 2020.8.18.(증여 뒤)라 술어 밖 (종전 참)", () => {
    const g = house({ acquisitionDate: d("2019-01-01"), rentalGiftDonorHousehold: "separate" });
    expect(isSeparateHouseholdGiftOfCancelledRental(g)).toBe(false);
    expect(isSeparateHouseholdGiftOfCancelledRental({ ...g, acquisitionDate: d("2020-08-18") })).toBe(true);
  });
});

describe("Q-3 고지", () => {
  const input = (h: HouseInfo, t: string) => ({ houses: [h], transferDate: d(t) }) as unknown as MultiHouseSurchargeInput;
  it("E-5 간주를 적용한 행에만 알린다 — 2022 단서 적용 / 2020-05-01 등록 중 / 2020-08-18 입력·자진말소는 고지 없음", () => {
    expect(addenda7DeemedCancellationNotices(input(house(), "2022-03-01"))[0]).toContain("부칙 제7조에 따라 2020.8.18.에 등록이 말소된 것으로 봅니다. 이 간주 말소에도");
    expect(addenda7DeemedCancellationNotices(input(house(), "2020-05-01"))[0]).toContain("아직 등록 중인 주택으로 판정했습니다");
    expect(addenda7DeemedCancellationNotices(input(house({ rentalCancelledDate: d("2020-08-18") }), "2022-03-01"))).toEqual([]);
    expect(addenda7DeemedCancellationNotices(input(house({ rentalCancellationReason: "voluntary" }), "2022-03-01"))).toEqual([]);
  });
});

describe("Q-3 §155⑳ 카드 → 중과 행(`rentalCardSurchargeRows`)도 같은 날짜로 읽는다", () => {
  /** ⑳ G-8 anchor와 같은 단기 호 — 2014 등록 · 종료일 2018-03-01 입력 · ⑳ ㉓ 기한(2025-08-18) 지난 2025-09-01 양도 */
  const unit = {
    businessRegistrationDate: d("2014-03-01"),
    rentalRegistrationDate: d("2014-03-01"),
    rentalRegisteredDate: d("2014-03-01"),
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "seoul-metro",
    standardPriceAtRentalStart: 300_000_000,
    hasMinimum2Units: false,
    rentalMonths: 48,
    halfDutyRentalMonths: 48,
    rentalAutoTermination: true,
    terminatedRegistrationType: "short_term",
    terminationReason: "auto",
    registrationCancellationDate: d("2018-03-01"),
    requirementsConfirmed: true,
    isExcluded918Rule: false,
  } as unknown as RentalUnitInput;
  it("E-6 ★ 카드 행이 2호 장기임대주택 (종전 2호 아님 — ⑳ 불성립 뒤 임대주택이 일반 주택으로 중과 주택 수에 들어갔다)", () => {
    const T = d("2025-09-01");
    const [row] = rentalCardSurchargeRows([unit], T);
    expect(rentalCancellationStatus(row, T)).toBe("auto_deemed");
    expect(isLongTermRentalHousingExempt(row, T)).toBe(true);
  });
});
