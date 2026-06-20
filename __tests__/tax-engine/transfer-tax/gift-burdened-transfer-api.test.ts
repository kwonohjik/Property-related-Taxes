/**
 * gift-burdened-transfer-api.test.ts — body 구성 단위 anchor
 *
 * lib/calc/gift-burdened-transfer-api.ts 의 buildGiftBurdenedTransferBody() 순수 함수를
 * 단위 테스트한다. 실제 fetch 없음 — body 구성 정확성만 검증.
 *
 * Anchor B (설계 §8): 신규 매핑 경로 실증
 *   B-api-1: 아파트(housing) — category→propertyType 매핑 + burdenedGiftInfo 주요 필드
 *   B-api-2: 토지(land)     — landStd/buildingStd 배정 + 연간임대료 환산
 *   B-api-3: 건물(building) — isHousing=false 경로
 *   B-api-4: 건물 주택(housing) — real_estate_building isHousing=true 경로
 *   B-api-5: housing 전용 필드 — isOneHousehold, householdHousingCount, 거주기간, 조정지역
 *   B-api-6: temporaryTwoHouse — Date → ISO string 변환
 *   B-api-7: acquisitionDate Date → string 변환
 *   B-api-8: C-4 검증 — assumedDebt = leaseDeposit + mortgageAmount 매핑 정확성
 */

import { describe, it, expect } from "vitest";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼 — 최소 FormState 팩토리
// ─────────────────────────────────────────────────────────────────────────────

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    giftDate: "2024-03-01",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    isGenerationSkip: false,
    isMinorDonee: false,
    isSubstituteGift: false,
    giftItems: [],
    stockItems: [],
    exemptionItems: [],
    priorGifts: [],
    marriageExemption: "",
    birthExemption: "",
    priorUsedDeduction: "",
    priorUsedMarriageBirthDeduction: "",
    isFiledOnTime: true,
    foreignTaxPaid: "",
    specialTreatment: "",
    startupInvestmentCompleted: false,
    startupNewHiresAtLeast10: false,
    familyBusinessYears: "",
    splitPaymentEnabled: false,
    splitPaymentAmount: "",
    ...overrides,
  } as FormState;
}

function makeAptItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 800_000_000,       // 양도시 공동주택공시가격
    leaseDeposit: 300_000_000,
    mortgageAmount: 200_000_000,
    assumedDebtForGift: 500_000_000,  // = leaseDeposit + mortgageAmount
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2009-06-01"),
      standardPriceAtAcquisition: 400_000_000,
      isOneHousehold: false,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      isUnregistered: false,
    },
    ...overrides,
  } as EstateItem;
}

// ─────────────────────────────────────────────────────────────────────────────
// B-api-1: 아파트(real_estate_apartment) → propertyType: housing
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-1: 아파트 → housing 매핑 + burdenedGiftInfo 주요 필드", () => {
  const item = makeAptItem();
  const form = makeForm();
  const body = buildGiftBurdenedTransferBody(item, form);

  it("propertyType === 'housing'", () => {
    expect(body.propertyType).toBe("housing");
  });

  it("transferType === 'burdened_gift'", () => {
    expect(body.transferType).toBe("burdened_gift");
  });

  it("transferDate === giftDate", () => {
    expect(body.transferDate).toBe("2024-03-01");
  });

  it("burdenedGiftInfo.valuationMode === 'sangjeungbeop_standard'", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.valuationMode).toBe("sangjeungbeop_standard");
  });

  it("burdenedGiftInfo.lendingDepositTotal = leaseDeposit = 300M", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.lendingDepositTotal).toBe(300_000_000);
  });

  it("burdenedGiftInfo.mortgageDebtAmount = mortgageAmount = 200M", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.mortgageDebtAmount).toBe(200_000_000);
  });

  it("burdenedGiftInfo.annualRentTotal = monthlyRent×12 = 0", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.annualRentTotal).toBe(0);
  });

  it("housing: landStdPriceAtTransfer = 0, buildingStdPriceAtTransfer = standardPrice = 800M", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.landStdPriceAtTransfer).toBe(0);
    expect(bgi.buildingStdPriceAtTransfer).toBe(800_000_000);
  });

  it("housing: landStdPriceAtAcquisition = 0, buildingStdPriceAtAcquisition = 400M", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.landStdPriceAtAcquisition).toBe(0);
    expect(bgi.buildingStdPriceAtAcquisition).toBe(400_000_000);
  });

  it("giftBuildingStdPriceAtTransfer = buildingStdPriceAtTransfer (housing: 동일값)", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.giftBuildingStdPriceAtTransfer).toBe(800_000_000);
  });

  it("transferPrice = assumedDebt = 500M (Zod placeholder)", () => {
    expect(body.transferPrice).toBe(500_000_000);
  });

  it("useEstimatedAcquisition = false (M3 override)", () => {
    expect(body.useEstimatedAcquisition).toBe(false);
  });

  it("acquisitionMethod = 'actual'", () => {
    expect(body.acquisitionMethod).toBe("actual");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-api-2: 토지(real_estate_land) → land
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-2: 토지 → land 매핑 + 기준시가 배정", () => {
  const item: EstateItem = {
    id: "land-1",
    category: "real_estate_land",
    name: "테스트 토지",
    standardPrice: 2_000_000_000,
    leaseDeposit: 500_000_000,
    mortgageAmount: 500_000_000,
    assumedDebtForGift: 1_000_000_000,
    monthlyRent: 1_000_000, // 월 100만원 → 연 1,200만원
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2012-01-15"),
      standardPriceAtAcquisition: 800_000_000,
      isNonBusinessLand: true,
    },
  } as EstateItem;

  const form = makeForm();
  const body = buildGiftBurdenedTransferBody(item, form);

  it("propertyType === 'land'", () => {
    expect(body.propertyType).toBe("land");
  });

  it("land: landStdPriceAtTransfer = standardPrice = 2B, buildingStdPriceAtTransfer = 0", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.landStdPriceAtTransfer).toBe(2_000_000_000);
    expect(bgi.buildingStdPriceAtTransfer).toBe(0);
  });

  it("land: landStdPriceAtAcquisition = 800M, buildingStdPriceAtAcquisition = 0", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.landStdPriceAtAcquisition).toBe(800_000_000);
    expect(bgi.buildingStdPriceAtAcquisition).toBe(0);
  });

  it("land: annualRentTotal = monthlyRent × 12 = 12,000,000 (C1 핵심)", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.annualRentTotal).toBe(12_000_000);
  });

  it("land: giftBuildingStdPriceAtTransfer = undefined (토지에는 건물 없음)", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.giftBuildingStdPriceAtTransfer).toBeUndefined();
  });

  it("isNonBusinessLand = true (land 전용)", () => {
    expect(body.isNonBusinessLand).toBe(true);
  });

  it("burdenedGiftInfo.isFiledOnTime === undefined (양도세 무관 — UI 입력 제거됨)", () => {
    // isFiledOnTime은 양도세 §69 신고세액공제 아님(상증법 §69). 양도세 결과에 무영향.
    // BurdenedGiftTransferTaxInput에서 제거됨 → API 전달 없음 → 엔진 기본값(undefined=신고 없음 취급)
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.isFiledOnTime).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-api-3: 건물(real_estate_building, isHousing=false) → building
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-3: 건물 비주택(isHousing=false) → building 매핑", () => {
  const item: EstateItem = {
    id: "bldg-1",
    category: "real_estate_building",
    name: "상가건물",
    standardPrice: 600_000_000,
    leaseDeposit: 200_000_000,
    mortgageAmount: 100_000_000,
    assumedDebtForGift: 300_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2015-03-01"),
      standardPriceAtAcquisition: 300_000_000,
      isHousing: false,
    },
  } as EstateItem;

  const body = buildGiftBurdenedTransferBody(item, makeForm());

  it("propertyType === 'building' (비주택)", () => {
    expect(body.propertyType).toBe("building");
  });

  it("building: buildingStdPriceAtTransfer = 600M", () => {
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;
    expect(bgi.buildingStdPriceAtTransfer).toBe(600_000_000);
    expect(bgi.landStdPriceAtTransfer).toBe(0);
  });

  // 회귀: 비주택(building)도 propertyBaseShape(transfer-tax-schema.ts:123~135) 필수
  // 5필드를 안전 기본값으로 전송해야 Zod 통과. 이전엔 if(isHousingType) 게이트로
  // 누락되어 상업용 건물 부담부증여 양도세 API 400(received undefined) 발생.
  it("주택 판정 필드 안전 기본값 전송 (Zod 필수 — 비주택 400 회귀)", () => {
    expect(body.isOneHousehold).toBe(false);
    expect(body.householdHousingCount).toBe(1);
    expect(body.isRegulatedArea).toBe(false);
    expect(body.wasRegulatedAtAcquisition).toBe(false);
    expect(body.residencePeriodMonths).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-api-4: 건물 주택(real_estate_building, isHousing=true) → housing
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-4: 건물 주택(isHousing=true) → housing 매핑", () => {
  const item: EstateItem = {
    id: "bldg-house-1",
    category: "real_estate_building",
    name: "단독주택",
    standardPrice: 700_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 150_000_000,
    assumedDebtForGift: 250_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2010-05-01"),
      standardPriceAtAcquisition: 350_000_000,
      isHousing: true,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 36,
    },
  } as EstateItem;

  const body = buildGiftBurdenedTransferBody(item, makeForm());

  it("propertyType === 'housing' (건물 주택)", () => {
    expect(body.propertyType).toBe("housing");
  });

  it("housing 전용 필드 존재", () => {
    expect(body.isOneHousehold).toBe(true);
    expect(body.householdHousingCount).toBe(1);
    expect(body.residencePeriodMonths).toBe(36);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-api-5: housing — 조정지역 필드 매핑
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-5: housing 전용 조정지역 필드 매핑", () => {
  const item = makeAptItem({
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2017-11-01"),
      standardPriceAtAcquisition: 500_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      isRegulatedArea: true,
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 48,
    },
  });

  const body = buildGiftBurdenedTransferBody(item, makeForm());

  it("isRegulatedArea = true", () => {
    expect(body.isRegulatedArea).toBe(true);
  });

  it("wasRegulatedAtAcquisition = true", () => {
    expect(body.wasRegulatedAtAcquisition).toBe(true);
  });

  it("residencePeriodMonths = 48", () => {
    expect(body.residencePeriodMonths).toBe(48);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-api-6: temporaryTwoHouse — Date → ISO string 변환
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-6: temporaryTwoHouse Date → ISO string 변환", () => {
  const item = makeAptItem({
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2020-01-01"),
      standardPriceAtAcquisition: 400_000_000,
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2018-06-01"),
        newAcquisitionDate: new Date("2020-01-01"),
      },
    },
  });

  const body = buildGiftBurdenedTransferBody(item, makeForm());

  it("temporaryTwoHouse 객체가 body에 존재", () => {
    expect(body.temporaryTwoHouse).toBeDefined();
  });

  it("previousAcquisitionDate = '2018-06-01' (ISO date string)", () => {
    const tth = body.temporaryTwoHouse as Record<string, unknown>;
    expect(tth.previousAcquisitionDate).toBe("2018-06-01");
  });

  it("newAcquisitionDate = '2020-01-01' (ISO date string)", () => {
    const tth = body.temporaryTwoHouse as Record<string, unknown>;
    expect(tth.newAcquisitionDate).toBe("2020-01-01");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-api-7: acquisitionDate Date → ISO string 변환
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-7: acquisitionDate Date → ISO string 변환", () => {
  const item = makeAptItem({
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2009-06-15"),
      standardPriceAtAcquisition: 400_000_000,
    },
  });

  const body = buildGiftBurdenedTransferBody(item, makeForm());

  it("acquisitionDate = '2009-06-15' (ISO date string)", () => {
    expect(body.acquisitionDate).toBe("2009-06-15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-api-8: C-4 매핑 정확성 — assumedDebt = leaseDeposit + mortgageAmount
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-8: C-4 확정 — 채무 매핑 정확성", () => {
  it("lendingDepositTotal = leaseDeposit, mortgageDebtAmount = mortgageAmount", () => {
    const item = makeAptItem({
      leaseDeposit: 150_000_000,
      mortgageAmount: 350_000_000,
      assumedDebtForGift: 500_000_000,
    });
    const body = buildGiftBurdenedTransferBody(item, makeForm());
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;

    expect(bgi.lendingDepositTotal).toBe(150_000_000); // leaseDeposit
    expect(bgi.mortgageDebtAmount).toBe(350_000_000);  // mortgageAmount
    expect(bgi.mortgageSetAmount).toBe(350_000_000);   // fallback = mortgageAmount
  });

  it("transferPrice = leaseDeposit + mortgageAmount (양도가액 placeholder)", () => {
    const item = makeAptItem({
      leaseDeposit: 200_000_000,
      mortgageAmount: 300_000_000,
      assumedDebtForGift: 500_000_000,
    });
    const body = buildGiftBurdenedTransferBody(item, makeForm());

    expect(body.transferPrice).toBe(500_000_000);
  });

  it("donorRelation = form.donorRelation (수증자→증여자 관계 직접 전달)", () => {
    const item = makeAptItem();
    const form = makeForm({ donorRelation: "lineal_descendant" });
    const body = buildGiftBurdenedTransferBody(item, form);
    const bgi = body.burdenedGiftInfo as Record<string, unknown>;

    expect(bgi.donorRelation).toBe("lineal_descendant");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-api-9: burdenedGiftTransferTax === undefined 시 throw
// ─────────────────────────────────────────────────────────────────────────────

describe("B-api-9: 토글 OFF(undefined) 자산 호출 시 throw", () => {
  it("burdenedGiftTransferTax가 없으면 Error throw", () => {
    const item: EstateItem = {
      id: "off-1",
      category: "real_estate_apartment",
      name: "토글 OFF",
      standardPrice: 500_000_000,
      // burdenedGiftTransferTax: undefined (토글 OFF)
    } as EstateItem;

    expect(() => buildGiftBurdenedTransferBody(item, makeForm())).toThrow();
  });
});
