/**
 * anchor: Q-3 — §167조의3①3호 후단(대통령령 제36737호, 2026.9.30. 공포·2026.10.1. 시행 신설)
 * 아파트 양도기한이 조특법 감면대상장기임대주택(③, 조특법 §97·§97의2·§98) 중과 배제에 거는 게이트.
 *
 * 3호 후단: 「감면대상장기임대주택이 종전 민특법§2 5호 장기일반민간임대주택 중 아파트(도시형
 * 생활주택인 아파트는 제외)를 임대하는 민간매입임대주택 또는 종전 민특법§2 6호 단기민간임대주택
 * 중 아파트를 임대하는 민간매입임대주택인 경우에는 제11항에 따른 기한까지 양도하는 주택으로
 * 한정한다」. Q-1(2호 가·나·라·마목)과 같은 바닥(2027.12.31)·연장 세 호를 공유한다
 * (`rental-article/rules.ts` `resolveAptTransferDeadline`/`hasAnyAptDeadlineExtensionFact`).
 *
 * 판정 메뉴 입력 경로가 없어(엔진 전용 필드) 매입 여부·등록 유형·도시형 생활주택 여부·⑪ 연장
 * 사실을 전혀 모른다 — Q-1과 같은 1안(법 근거 없이 불리 적용 금지)으로 종전 기준(③ 그대로 적용)을
 * 유지하고 `warnings`로 확인 필요 고지만 낸다.
 */
import { describe, it, expect } from "vitest";
import {
  isTaxIncentiveRentalHousingExempt,
  isTaxIncentiveRentalAptDeadlinePending,
} from "@/lib/tax-engine/multi-house-surcharge";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

// ============================================================
// Leaf level — isTaxIncentiveRentalHousingExempt / isTaxIncentiveRentalAptDeadlinePending
// ============================================================

const FLOOR = new Date("2027-12-31");
const AFTER_FLOOR = new Date("2028-01-01");

function baseHouse(overrides: Partial<HouseInfo> = {}): HouseInfo {
  return {
    id: "h1",
    acquisitionDate: new Date("2015-01-01"),
    officialPrice: 300_000_000,
    region: "capital",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    isTaxIncentiveRental: true,
    rentalPeriodYears: 5,
    isNationalSizeHousing: true,
    ...overrides,
  };
}

describe("Q-3 leaf — §167조의3①3호 후단 아파트 양도기한", () => {
  it("바닥 이내(2027.12.31) — 게이트 미작동, pending 없음", () => {
    const h = baseHouse();
    expect(isTaxIncentiveRentalHousingExempt(h, FLOOR)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, FLOOR)).toBe(false);
  });

  it("바닥 초과 + 매입·등록유형·도시형 여부 전부 모름 → 종전 기준(exempt) 유지 + pending", () => {
    const h = baseHouse();
    expect(isTaxIncentiveRentalHousingExempt(h, AFTER_FLOOR)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, AFTER_FLOOR)).toBe(true);
  });

  it("바닥 초과 + 매입 여부만 알고 등록유형 모름 → 여전히 pending(부분 사실은 불충분)", () => {
    const h = baseHouse({ isTaxIncentiveRentalPurchase: true });
    expect(isTaxIncentiveRentalHousingExempt(h, AFTER_FLOOR)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, AFTER_FLOOR)).toBe(true);
  });

  it("바닥 초과 + 매입·장기일반·비도시형 아파트 + 연장 사실 없음 → 종전 기준 유지 + pending", () => {
    const h = baseHouse({
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "long_term_general",
      isUrbanLifeHousingApartment: false,
    });
    expect(isTaxIncentiveRentalHousingExempt(h, AFTER_FLOOR)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, AFTER_FLOOR)).toBe(true);
  });

  it("바닥 초과 + 매입·장기일반·비도시형 + 연장 사실(기한 초과) → exempt 아님, pending 없음", () => {
    const h = baseHouse({
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "long_term_general",
      isUrbanLifeHousingApartment: false,
      // ⑪1호 — 등록말소일 2027.6.1(≥2027.1.1) → 기한 = 2028.6.1
      taxIncentiveRentalAptDeadlineExtension: { dutyPeriodEndCancellationDate: new Date("2027-06-01") },
    });
    const transferDate = new Date("2030-01-01"); // 기한(2028.6.1) 초과
    expect(isTaxIncentiveRentalHousingExempt(h, transferDate)).toBe(false);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, transferDate)).toBe(false);
  });

  it("바닥 초과 + 같은 연장 사실인데 기한 안쪽 양도 → exempt, pending 없음", () => {
    const h = baseHouse({
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "long_term_general",
      isUrbanLifeHousingApartment: false,
      taxIncentiveRentalAptDeadlineExtension: { dutyPeriodEndCancellationDate: new Date("2027-06-01") },
    });
    const transferDate = new Date("2028-03-01"); // 기한(2028.6.1) 이내
    expect(isTaxIncentiveRentalHousingExempt(h, transferDate)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, transferDate)).toBe(false);
  });

  it("기한 경계값(2028.6.1 당일 양도) → 기한 「까지」이므로 exempt, pending 없음", () => {
    const h = baseHouse({
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "long_term_general",
      isUrbanLifeHousingApartment: false,
      taxIncentiveRentalAptDeadlineExtension: { dutyPeriodEndCancellationDate: new Date("2027-06-01") },
    });
    const transferDate = new Date("2028-06-01"); // 기한 당일(경계값)
    expect(isTaxIncentiveRentalHousingExempt(h, transferDate)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, transferDate)).toBe(false);
  });

  it("바닥 초과 + 건설임대(매입 아님) → 게이트 대상 아님, exempt 유지, pending 없음", () => {
    const h = baseHouse({ isTaxIncentiveRentalPurchase: false });
    expect(isTaxIncentiveRentalHousingExempt(h, AFTER_FLOOR)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, AFTER_FLOOR)).toBe(false);
  });

  it("바닥 초과 + 매입이지만 등록유형이 그 외(other) → 게이트 대상 아님", () => {
    const h = baseHouse({
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "other",
    });
    expect(isTaxIncentiveRentalHousingExempt(h, AFTER_FLOOR)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, AFTER_FLOOR)).toBe(false);
  });

  it("바닥 초과 + 매입·장기일반 + 도시형 생활주택인 아파트 → 게이트 대상 아님", () => {
    const h = baseHouse({
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "long_term_general",
      isUrbanLifeHousingApartment: true,
    });
    expect(isTaxIncentiveRentalHousingExempt(h, AFTER_FLOOR)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, AFTER_FLOOR)).toBe(false);
  });

  it("바닥 초과 + 비아파트 → 3호 후단 자체가 무관, exempt 유지, pending 없음", () => {
    const h = baseHouse({ isApartment: false });
    expect(isTaxIncentiveRentalHousingExempt(h, AFTER_FLOOR)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, AFTER_FLOOR)).toBe(false);
  });

  it("바닥 초과 + 비아파트인데 매입·장기일반·연장기한 초과 사실을 모두 갖춰도 → 비아파트라 무관, exempt 유지", () => {
    // isApartment 게이트가 가장 먼저 걸러야 한다 — 다른 사실이 전부 "게이트 대상(기한 초과)"을
    // 가리켜도 비아파트면 3호 후단 자체가 적용되지 않는다(아파트 전용).
    const h = baseHouse({
      isApartment: false,
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "long_term_general",
      isUrbanLifeHousingApartment: false,
      taxIncentiveRentalAptDeadlineExtension: { dutyPeriodEndCancellationDate: new Date("2027-06-01") },
    });
    const transferDate = new Date("2030-01-01");
    expect(isTaxIncentiveRentalHousingExempt(h, transferDate)).toBe(true);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, transferDate)).toBe(false);
  });

  it("단기(short_term) 매입·비도시형 + 연장 사실(기한 초과) → exempt 아님", () => {
    const h = baseHouse({
      isTaxIncentiveRentalPurchase: true,
      taxIncentiveRentalRegistrationType: "short_term",
      isUrbanLifeHousingApartment: false,
      taxIncentiveRentalAptDeadlineExtension: { dutyPeriodEndCancellationDate: new Date("2027-06-01") },
    });
    expect(isTaxIncentiveRentalHousingExempt(h, new Date("2030-01-01"))).toBe(false);
  });

  it("③ 기본 요건(5년·국민주택) 미충족이면 애초에 false — 아파트·바닥 여부와 무관", () => {
    const h = baseHouse({ rentalPeriodYears: 3 });
    expect(isTaxIncentiveRentalHousingExempt(h, AFTER_FLOOR)).toBe(false);
    expect(isTaxIncentiveRentalAptDeadlinePending(h, AFTER_FLOOR)).toBe(false);
  });
});

// ============================================================
// Route level — determineMultiHouseSurcharge (calculateTransferTax 경유)
// ============================================================

/** 매입·장기일반·비도시형 조특법 감면대상장기임대주택 아파트 — 3호 후단 게이트 대상. */
const TAX_INCENTIVE_APT_RENTAL = {
  isLongTermRental: false,
  isTaxIncentiveRental: true,
  rentalPeriodYears: 5,
  isNationalSizeHousing: true,
  isApartment: true,
};

function household(
  transferDate: Date,
  rentalOverrides: Partial<HouseInfo> = {},
): TransferTaxInput {
  const houses = [
    {
      id: "selling",
      acquisitionDate: new Date("2015-01-01"),
      officialPrice: 300_000_000,
      region: "capital",
      regionCode: "11680",
      isInherited: false,
      isOfficetel: false,
      isUnsoldHousing: false,
      ...TAX_INCENTIVE_APT_RENTAL,
      ...rentalOverrides,
    },
    {
      id: "other",
      acquisitionDate: new Date("2016-01-01"),
      officialPrice: 300_000_000,
      region: "capital",
      regionCode: "11680",
      isInherited: false,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
    },
  ];
  return baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2015-01-01"),
    transferDate,
    isRegulatedArea: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    houses: houses as TransferTaxInput["houses"],
    sellingHouseId: "selling",
  } as Partial<TransferTaxInput>);
}

const result = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));

describe("Q-3 route — §167조의3①3호 후단이 다주택 중과 배제에 거는 게이트", () => {
  it("2027.12.31(바닥 경계값) — ③ 배제 유지, 고지 없음", () => {
    const r = result(household(FLOOR));
    expect(r.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurchargeEvaluation?.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("§167조의3⑪")]),
    );
  });

  it("2028.1.1(바닥 다음날)·사실 전부 모름 → 판정 보류: ③ 배제 유지 + 확인 필요 고지, 결정세액 불변", () => {
    const before = result(household(FLOOR));
    const after = result(household(AFTER_FLOOR));
    expect(after.totalTax).toBe(before.totalTax);
    expect(after.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(after.multiHouseSurchargeEvaluation?.warnings ?? []).toEqual(
      expect.arrayContaining([expect.stringContaining("§167조의3⑪")]),
    );
  });

  it("2028.1.1 + 매입·장기일반·비도시형 + 연장 사실(기한 2028.6.1) 이내 양도 → ③ 배제 유지, 고지 없음", () => {
    const r = result(
      household(new Date("2028-03-01"), {
        isTaxIncentiveRentalPurchase: true,
        taxIncentiveRentalRegistrationType: "long_term_general",
        isUrbanLifeHousingApartment: false,
        taxIncentiveRentalAptDeadlineExtension: { dutyPeriodEndCancellationDate: new Date("2027-06-01") },
      }),
    );
    expect(r.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurchargeEvaluation?.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("§167조의3⑪")]),
    );
  });

  it("매입·장기일반·비도시형 + 연장 사실(기한 2028.6.1) 초과 양도 → ③ 배제 상실, 중과 적용 + 결정세액 증가", () => {
    const before = result(
      household(new Date("2028-03-01"), {
        isTaxIncentiveRentalPurchase: true,
        taxIncentiveRentalRegistrationType: "long_term_general",
        isUrbanLifeHousingApartment: false,
        taxIncentiveRentalAptDeadlineExtension: { dutyPeriodEndCancellationDate: new Date("2027-06-01") },
      }),
    );
    const after = result(
      household(new Date("2030-01-01"), {
        isTaxIncentiveRentalPurchase: true,
        taxIncentiveRentalRegistrationType: "long_term_general",
        isUrbanLifeHousingApartment: false,
        taxIncentiveRentalAptDeadlineExtension: { dutyPeriodEndCancellationDate: new Date("2027-06-01") },
      }),
    );
    expect(after.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(true);
    expect(before.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(after.totalTax).toBeGreaterThan(before.totalTax);
    expect(after.multiHouseSurchargeEvaluation?.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("§167조의3⑪")]),
    );
  });

  it("건설임대(매입 아님) + 바닥 초과 → 3호 후단 미적용, ③ 배제 유지, 고지 없음", () => {
    const r = result(household(AFTER_FLOOR, { isTaxIncentiveRentalPurchase: false }));
    expect(r.multiHouseSurchargeEvaluation?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurchargeEvaluation?.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("§167조의3⑪")]),
    );
  });
});
