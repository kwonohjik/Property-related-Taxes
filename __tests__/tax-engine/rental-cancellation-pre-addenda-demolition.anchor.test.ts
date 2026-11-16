/**
 * V-10 후속 — 다주택 중과 §167의3①2호 단서 × 2020.8.18. 전 멸실 (계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` V-10).
 *
 * 서면-2022-법규재산-3118(→ 기획재정부 조세정책과-2231, 2024.12.9.): 2020.8.18. 전에 재건축으로 멸실된 임대주택은 법률 제17482호
 * 부칙 제7조에 따라 자동말소된 것으로 볼 수 없다(§155㉓ 질의). 단서도 같은 간주 말소에 기댄다(서면-2021-법규재산-6391 → 기획재정부
 * 재산세제과-861). 사용자 결정(2026-11-16): ⑳ 카드의 멸실 답만 중과 행에 옮기고 확인 필요 고지 · 명부 행은 고지만.
 */
import { describe, it, expect } from "vitest";
import { rentalCancellationStatus } from "@/lib/tax-engine/rental-cancellation-deeming";
import { addenda7DeemedCancellationNotices } from "@/lib/tax-engine/rental-cancellation-deeming";
import { isLongTermRentalHousingExempt } from "@/lib/tax-engine/multi-house-surcharge-count";
import { rentalCardSurchargeRows } from "@/lib/tax-engine/rental-card-surcharge-rows";
import type { HouseInfo, MultiHouseSurchargeInput } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);
const T = d("2024-06-01");
/** 가목 다세대 · 단기 2015-03-01 등록 · 4년 의무기간 2019-03-01 종료 · 자동말소일 입력 = 종료일 */
const house = (over: Partial<HouseInfo> = {}): HouseInfo => ({
  id: "r",
  acquisitionDate: d("2014-01-01"),
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
  businessRegistrationDate: d("2015-03-01"),
  rentalRegistrationDate: d("2015-03-01"),
  rentalPeriodYears: 4,
  rentIncreaseUnder5Pct: true,
  rentalStartOfficialPrice: 250_000_000,
  rentalCancelledDate: d("2019-03-01"),
  rentalCancellationReason: "auto",
  ...over,
});

describe("DS 말소 상태 — 2020.8.18. 전 멸실", () => {
  it("DS-1 ★ 멸실 예 → not_deemed · 2호 아님 (종전 auto_deemed · 2호)", () => {
    expect(rentalCancellationStatus(house({ preAddendaDemolished: true }), T)).toBe("not_deemed");
    expect(isLongTermRentalHousingExempt(house({ preAddendaDemolished: true }), T)).toBe(false);
  });
  it("DS-2 짝 — 아니오 · 미제공(명부 행)은 종전대로 부칙 제7조 간주 + 단서", () => {
    for (const v of [false, undefined]) {
      expect(rentalCancellationStatus(house({ preAddendaDemolished: v }), T)).toBe("auto_deemed");
      expect(isLongTermRentalHousingExempt(house({ preAddendaDemolished: v }), T)).toBe(true);
    }
  });
  it("DS-3 짝 — 양도일이 2020.8.18. 전이면 그대로 등록 중(none) · 말소일 입력이 2020.8.18. 이후면 간주 밖이라 답과 무관", () => {
    expect(rentalCancellationStatus(house({ preAddendaDemolished: true }), d("2020-05-01"))).toBe("none");
    expect(rentalCancellationStatus(house({ preAddendaDemolished: true, rentalCancelledDate: d("2020-08-18") }), T)).toBe("auto_deemed");
  });
  it("DS-4 짝 — 자진말소는 답과 무관하게 종전대로 not_deemed", () => {
    expect(rentalCancellationStatus(house({ preAddendaDemolished: false, rentalCancellationReason: "voluntary" }), T)).toBe("not_deemed");
  });
});

describe("DS 고지", () => {
  const input = (h: HouseInfo) => ({ houses: [h], transferDate: T }) as unknown as MultiHouseSurchargeInput;
  it("DS-5 ★ 멸실 예 → 장기임대주택으로 보지 않았다 + 3118·2231 + 확인 필요", () => {
    const [n] = addenda7DeemedCancellationNotices(input(house({ preAddendaDemolished: true })));
    expect(n).toContain("주택 r: 2020.8.18. 전에 재건축·재개발 등으로 멸실된 임대주택이라");
    expect(n).toContain("서면-2022-법규재산-3118(기획재정부 조세정책과-2231, 2024.12.9.)");
    expect(n).toContain("확인 필요");
    expect(n).not.toContain("이 간주 말소에도");
  });
  it("DS-6 ★ 명부 행(미제공) → 단서 적용 문장 + 멸실이면 달라질 수 있다는 확인 필요 / 카드 「아니오」 → 덧붙이지 않는다", () => {
    const [roster] = addenda7DeemedCancellationNotices(input(house()));
    expect(roster).toContain("이 간주 말소에도");
    expect(roster).toContain("멸실된 주택이면 부칙 제7조에 따라 자동말소된 것으로 볼 수 없다는 해석");
    const [card] = addenda7DeemedCancellationNotices(input(house({ preAddendaDemolished: false })));
    expect(card).toContain("이 간주 말소에도");
    expect(card).not.toContain("멸실");
  });
});

describe("DS ⑳ 카드 → 중과 행", () => {
  const unit = (preAddendaDemolished: boolean) =>
    ({
      businessRegistrationDate: d("2015-03-01"),
      rentalRegistrationDate: d("2015-03-01"),
      rentalRegisteredDate: d("2015-03-01"),
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
      registrationCancellationDate: d("2019-03-01"),
      requirementsConfirmed: true,
      isExcluded918Rule: false,
      preAddendaDemolished,
    }) as unknown as RentalUnitInput;
  it("DS-7 ★ 카드 멸실 예 → 행도 not_deemed · 2호 아님 (종전 auto_deemed · 2호 — ⑳은 불성립인데 중과는 간주 말소로 배제)", () => {
    const [row] = rentalCardSurchargeRows([unit(true)], T);
    expect(row.preAddendaDemolished).toBe(true);
    expect(rentalCancellationStatus(row, T)).toBe("not_deemed");
    expect(isLongTermRentalHousingExempt(row, T)).toBe(false);
  });
  it("DS-8 짝 — 카드 아니오 → 행 auto_deemed · 2호", () => {
    const [row] = rentalCardSurchargeRows([unit(false)], T);
    expect(rentalCancellationStatus(row, T)).toBe("auto_deemed");
    expect(isLongTermRentalHousingExempt(row, T)).toBe(true);
  });
});
