/**
 * PR-2 잔여 validate 단위 anchor — 갭 보강 6건
 *
 * MS-2b/c: 상장(kosdaq/konex) + sale_case → validate error
 * CA-6:    split + capital_adjustments → validate error
 * CA-8:    ratio=0 → validate error
 * CA-10:   eventDate > transferDate → validate error
 * CA-11:   감자 ratio≥1 → validate error
 */

import { describe, it, expect } from "vitest";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import type {
  StockTransferFormData,
  CapitalAdjustmentForm,
} from "@/lib/stores/calc-wizard-stock-store";

function baseForm(overrides: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    securityName: "테스트",
    securityCode: "",
    brokerage: "",
    accountNumberMasked: "",
    holderName: "",
    holderBirthDate: "1980-01-01",
    marketType: "unlisted",
    isMajorShareholder: false,
    selfShareRatio: "",
    selfMarketCap: "",
    isLargestShareholderGroup: false,
    combinedShareRatio: "",
    combinedMarketCap: "",
    priorYearEndDate: "",
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: "2020-01-01",
    transferDate: "2024-06-01",
    shareCount: "1000",
    totalIssuedShares: "10000",
    acquisitionCause: "purchase",
    decedentAcquisitionDate: "",
    donorAcquisitionDate: "",
    preMergerAcquisitionDate: "",
    cumulativeTransferRatio: "",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    transferTotalPrice: "",
    perShareTransferPrice: "200000",
    exchangePropertyValue: "",
    exchangeDebtRelief: "",
    exchangeCash: "",
    acquisitionMode: "sale_case",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "100000",
    acquisitionMarketSamplePrice: "",
    acquisitionMarketSampleDate: "",
    acquisitionMarketSampleCounterparty: "",
    transferMarketSamplePrice: "",
    transferMarketSampleDate: "",
    transferMarketSampleCounterparty: "",
    capitalAdjustments: [],
    transferDatePriceAvg1Month: "",
    acquisitionDatePriceAvg1Month: "",
    transferStdInputMode: "direct",
    transferPriceDates: [],
    transferPriceClosing: [],
    listingDate: "",
    listingDatePriceAvg1Month: "",
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    transferYearNetIncomePerShare: "",
    transferYearNetAssetPerShare: "",
    listingYearNetIncomePerShare: "",
    listingYearNetAssetPerShare: "",
    acquisitionYearNetIncomePerShare: "",
    acquisitionYearNetAssetPerShare: "",
    bookLost: false,
    faceValuePerShare: "",
    netAssetOnlyReason: "",
    expenseMode: "actual",
    actualExpenses: "",
    filingType: "preliminary",
    filingDate: "2024-08-31",
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: "0",
    lotsMode: "single",
    costAllocationMethod: "fifo",
    acquisitionLots: [],
    transferLots: [],
    specificMatchings: [],
    unlistedDetailMode: "simple",
    netIncomeYears: [],
    netAssetYears: [],
    acqFaceValueOnly: false,
    acqFaceValuePerShare: "",
    ...overrides,
  } as StockTransferFormData;
}

function makeAdj(o: Partial<CapitalAdjustmentForm>): CapitalAdjustmentForm {
  return {
    type: "bonus_capital_reserve",
    eventDate: "2022-06-01",
    ratio: "0.5",
    notes: "",
    ...o,
  };
}

describe("MS-2b: kosdaq + sale_case → validate error", () => {
  it("MS-2b-01: 시장 유형 게이트 발동", () => {
    const errors = validateAllSteps(baseForm({ marketType: "kosdaq", isMajorShareholder: true, selfMarketCap: "5000000000" }));
    const hit = errors.some((e) => e.field === "acquisitionMode" && e.message.includes("비상장·기타자산 전용"));
    expect(hit).toBe(true);
  });
});

describe("MS-2c: konex + sale_case → validate error", () => {
  it("MS-2c-01: 시장 유형 게이트 발동", () => {
    const errors = validateAllSteps(baseForm({ marketType: "konex", isMajorShareholder: true, selfMarketCap: "5000000000" }));
    const hit = errors.some((e) => e.field === "acquisitionMode" && e.message.includes("비상장·기타자산 전용"));
    expect(hit).toBe(true);
  });
});

describe("CA-6: split + capital_adjustments → 허용 (A-2 재anchor)", () => {
  // [A-2] split + 자본조정은 더 이상 차단 아님 — lot별 희석 전처리로 지원.
  it("CA-6-01: 단건 모드 전용 차단 제거 (capitalAdjustments error 없음)", () => {
    const errors = validateAllSteps(baseForm({
      acquisitionMode: "actual",
      lotsMode: "split",
      acquisitionLots: [
        { id: "L1", acquisitionDate: "2020-01-01", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "100000" },
      ],
      transferLots: [{ id: "T1", transferDate: "2024-06-01", shareCount: "1000", perShareTransferPrice: "200000" }],
      capitalAdjustments: [makeAdj({})],
    }));
    const hit = errors.some(
      (e) => e.field === "capitalAdjustments" && e.severity === "error" && e.message.includes("단건 모드 전용"),
    );
    expect(hit).toBe(false);
  });
});

describe("CA-8: ratio=0 → validate error", () => {
  it("CA-8-01: 비율 0 차단", () => {
    const errors = validateAllSteps(baseForm({
      acquisitionMode: "actual",
      capitalAdjustments: [makeAdj({ ratio: "0" })],
    }));
    const hit = errors.some((e) => e.field.includes("capitalAdjustments[0].ratio") && e.message.includes("0보다 커야"));
    expect(hit).toBe(true);
  });
});

describe("CA-10: eventDate > transferDate → validate error", () => {
  it("CA-10-01: 양도일 이후 발생일 차단", () => {
    const errors = validateAllSteps(baseForm({
      acquisitionMode: "actual",
      capitalAdjustments: [makeAdj({ eventDate: "2025-01-01" })],   // transferDate 2024-06-01 이후
    }));
    const hit = errors.some((e) => e.field.includes("capitalAdjustments[0].eventDate") && e.message.includes("양도일 이후"));
    expect(hit).toBe(true);
  });
});

describe("CA-11: 감자 ratio≥1 → validate error", () => {
  it("CA-11-01: 100% 감자 차단", () => {
    const errors = validateAllSteps(baseForm({
      acquisitionMode: "actual",
      capitalAdjustments: [makeAdj({ type: "reduction_proportional", ratio: "1" })],
    }));
    const hit = errors.some((e) => e.field.includes("capitalAdjustments[0].ratio") && e.message.includes("1 미만"));
    expect(hit).toBe(true);
  });
});
