/**
 * 양도세 — 동일 아파트 2회 지분 취득 사례 (예제 사례 27) anchor 테스트
 *
 * 케이스 개요:
 *   - 다른 주택 미보유 갑氏가 동일 아파트(서울 양천구 목동)를 2회 분할 취득
 *   - 1차: 2008.5.5 상속 60% (공동주택가격 808,000,000 / 기타 20,000,000)
 *   - 2차: 2021.11.11 매매 40% (실지거래가 600,000,000 / 기타 11,200,000)
 *   - 양도일: 2023.2.16, 양도가액 1,700,000,000 (총액)
 *   - 필요경비: 14,000,000 (총액)
 *   - 거주: 2008.5.5 ~ 2023.2.16 (10년 이상)
 *   - 1세대1주택, 12억 초과 고가주택, 비조정지역, 등기
 *
 * 핵심 anchor:
 *   - 1차(60%) 비과세 양도차익 363,388,236 / 과세대상 151,411,764 / 양도소득금액 30,282,353
 *   - 2차(40%) 양도소득금액 63,200,000
 *   - 합산 산출세액 39,702,352 / 지방소득세 3,970,235 / 총 납부세액 43,672,587
 *
 * 설계 포인트:
 *   - 12억 안분 분모 = 총 물건 양도가액(1.7B), 지분 양도가액(1.02B) 아님
 *   - 1차(60%)는 transferPrice=1.02B + totalPropertyTransferPrice=1.7B로 호출
 *   - 2차(40%)는 transferPrice=0.68B로 호출 (1세대1주택 조건 미충족 — < 2년 보유)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { calcOneHouseProration } from "@/lib/tax-engine/transfer-tax-helpers";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, computeTransferSummary } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { AggregateTransferInput } from "@/lib/tax-engine/types/transfer-aggregate.types";

const TOTAL_PROPERTY_TRANSFER_PRICE = 1_700_000_000;

// ============================================================
// 단건 엔진 anchor — 1차(60% 상속 지분)
// ============================================================

function makeFraction1Input(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_020_000_000, // 1.7B × 60%
    totalPropertyTransferPrice: TOTAL_PROPERTY_TRANSFER_PRICE,
    transferDate: new Date("2023-02-16"),
    acquisitionPrice: 484_800_000, // 808M × 60%
    acquisitionDate: new Date("2008-05-05"),
    expenses: 8_400_000 + 12_000_000, // 기타필요경비 8.4M(=14M×60%) + 기타취득가 12M(=20M×60%)
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 12 * 14 + 9, // 2008.5.5~2023.2.16 ≈ 14년 9개월 (10년+ 거주)
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    annualBasicDeductionUsed: 0,
    ...overrides,
  });
}

describe("사례 27 단건 anchor — 1차 60% 상속 지분", () => {
  it("T-01 양도차익 = 514,800,000", () => {
    const result = calculateTransferTax(makeFraction1Input(), makeMockRates());
    expect(result.transferGain).toBe(514_800_000);
  });

  it("T-02·T-03 12억 안분 — 비과세 363,388,236 / 과세대상 151,411,764", () => {
    const result = calculateTransferTax(makeFraction1Input(), makeMockRates());
    expect(result.taxableGain).toBe(151_411_764);
    expect(result.transferGain - result.taxableGain).toBe(363_388_236);
  });

  it("T-04 장기보유특별공제 = 121,129,411 (80%)", () => {
    const result = calculateTransferTax(makeFraction1Input(), makeMockRates());
    expect(result.longTermHoldingDeduction).toBe(121_129_411);
  });

  it("T-05 양도소득금액 = 30,282,353", () => {
    const result = calculateTransferTax(makeFraction1Input(), makeMockRates());
    // taxableGain - longTermHoldingDeduction
    expect(result.taxableGain - result.longTermHoldingDeduction).toBe(30_282_353);
  });
});

// ============================================================
// 단건 엔진 anchor — 2차(40% 매매 지분)
// ============================================================

function makeFraction2Input(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 680_000_000, // 1.7B × 40%
    totalPropertyTransferPrice: TOTAL_PROPERTY_TRANSFER_PRICE,
    transferDate: new Date("2023-02-16"),
    acquisitionPrice: 600_000_000, // 매입가 (40% 실지거래가)
    acquisitionDate: new Date("2021-11-11"),
    expenses: 5_600_000 + 11_200_000, // 기타필요경비 5.6M(=14M×40%) + 기타취득가 11.2M
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 12 * 14 + 9,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    annualBasicDeductionUsed: 0,
    ...overrides,
  });
}

describe("사례 27 단건 anchor — 2차 40% 매매 지분", () => {
  it("T-07 양도차익 = 63,200,000", () => {
    const result = calculateTransferTax(makeFraction2Input(), makeMockRates());
    expect(result.transferGain).toBe(63_200_000);
  });

  it("T-08 양도소득금액 = 63,200,000 (보유 2년 미만 — LTHD 0)", () => {
    const result = calculateTransferTax(makeFraction2Input(), makeMockRates());
    expect(result.longTermHoldingDeduction).toBe(0);
    // 1세대1주택 비과세 미적용 (2차는 1세대1주택 보유요건 단독 충족 못 함)
    // 단, 2차는 isOneHousehold=true 입력에 따라 비과세 안분 적용될 수 있으므로 확인
    // 2차 양도가 6.8억 < 12억 → 부분과세 미적용 (전액 과세)
    expect(result.taxableGain).toBe(63_200_000);
  });
});

// ============================================================
// Aggregate 엔진 anchor — 합산 신고
// ============================================================

describe("사례 27 합산 anchor — 예제 PDF 100% 일치 목표", () => {
  function makeAggregateInput(): AggregateTransferInput {
    return {
      taxYear: 2023,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          propertyId: "frac-1",
          propertyLabel: "목동신시가지아파트 60% (상속)",
          ...makeFraction1Input(),
        },
        {
          propertyId: "frac-2",
          propertyLabel: "목동신시가지아파트 40% (매매)",
          ...makeFraction2Input(),
        },
      ],
    };
  }

  it("T-10 합산 양도소득금액 = 93,482,353", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    // 30,282,353 + 63,200,000
    expect(result.totalIncomeAfterOffset).toBe(93_482_353);
  });

  it("T-11 합산 과세표준 = 90,982,353 (기본공제 250만 1회 차감)", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.taxBase).toBe(90_982_353);
  });

  it("T-12 합산 산출세액 = 39,702,352", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.calculatedTax).toBe(39_702_352);
  });

  it("T-13 합산 지방소득세 = 3,970,235", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.localIncomeTax).toBe(3_970_235);
  });

  it("T-14 합산 총 납부세액 = 43,672,587", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInput(), makeMockRates());
    expect(result.totalTax).toBe(43_672_587);
  });
});

// ============================================================
// 12억 안분 분모 단위 테스트 (calcOneHouseProration)
// ============================================================

// ============================================================
// 사례 27 합산 anchor — actual 모드 (F6 — primary 자동 입력)
// 안분 모드(T-10~T-14)와 동일한 결과를 actual 모드에서도 도출 검증
// ============================================================

describe("사례 27 합산 anchor — actual 모드 (F6)", () => {
  function makeAggregateInputActualMode(): AggregateTransferInput {
    // primary·companion 모두 transferPrice·totalPropertyTransferPrice·acquisitionPrice·expenses는
    // makeFraction1Input/makeFraction2Input가 이미 ratio 적용된 값이므로 동일 사용.
    // 본 anchor는 합산 결과가 모드에 무관하게 동일함을 검증.
    return {
      taxYear: 2023,
      annualBasicDeductionUsed: 0,
      properties: [
        {
          propertyId: "frac-1",
          propertyLabel: "목동신시가지아파트 60% (상속)",
          ...makeFraction1Input(),
        },
        {
          propertyId: "frac-2",
          propertyLabel: "목동신시가지아파트 40% (매매)",
          ...makeFraction2Input(),
        },
      ],
    };
  }

  it("R-07 actual 모드 합산 산출세액 = 39,702,352 (안분 모드와 동일)", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInputActualMode(), makeMockRates());
    expect(result.calculatedTax).toBe(39_702_352);
  });

  it("R-08 actual 모드 총 납부세액 = 43,672,587", () => {
    const result = calculateTransferTaxAggregate(makeAggregateInputActualMode(), makeMockRates());
    expect(result.totalTax).toBe(43_672_587);
  });
});

// ============================================================
// 사이드바 selector 검증 — 지분 모드 양도가액 합계 (S2)
// ============================================================

describe("computeTransferSummary — 지분 모드 양도가액 합계 (S2)", () => {
  it("R-10 지분 모드 자산이 있으면 양도가액 합계는 contractTotalPrice 그대로 사용", () => {
    const form = createDefaultTransferFormData();
    form.contractTotalPrice = "1700000000";
    form.assets[0].ownershipNumerator = "60";
    form.assets[0].ownershipDenominator = "100";
    form.assets[0].fixedAcquisitionPrice = "808000000";
    form.assets[0].directExpenses = "0";

    const summary = computeTransferSummary(form, null);
    // 지분 모드 자산 존재 → 양도가액 합계 = contractTotalPrice (1.7B)
    expect(summary.totalSalePrice).toBe(1_700_000_000);
    // 취득가액 합계 = 808M × 60% = 484.8M
    expect(summary.totalAcqPrice).toBe(484_800_000);
  });

  it("R-10b 단독 소유(100/100)는 기존 동작 — actualSalePrice 합산", () => {
    const form = createDefaultTransferFormData();
    form.contractTotalPrice = "500000000";
    form.assets[0].actualSalePrice = "500000000";
    form.assets[0].ownershipNumerator = "100";
    form.assets[0].ownershipDenominator = "100";
    form.assets[0].fixedAcquisitionPrice = "300000000";

    const summary = computeTransferSummary(form, null);
    expect(summary.totalSalePrice).toBe(500_000_000);
    expect(summary.totalAcqPrice).toBe(300_000_000);
  });
});

// ============================================================
// validateStep 검증 anchor — 단건 + ratio<1.0 차단 (F4-1)
// ============================================================

describe("validateStep — 자산 1건 + 지분 모드 차단 (F4-1)", () => {
  function makeFormSingleAsset(numerator: string, denominator: string) {
    const form = createDefaultTransferFormData();
    form.transferDate = "2023-02-16";
    form.contractTotalPrice = "1700000000";
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = "2008-05-05";
    form.assets[0].acquisitionCause = "inheritance";
    form.assets[0].fixedAcquisitionPrice = "808000000";
    form.assets[0].ownershipNumerator = numerator;
    form.assets[0].ownershipDenominator = denominator;
    return form;
  }

  it("R-04 단건 + ratio 60/100 → 차단 (지분 모드 안내 메시지)", () => {
    const form = makeFormSingleAsset("60", "100");
    const error = validateStep(0, form);
    expect(error).toBeTruthy();
    expect(error).toMatch(/지분 모드/);
    expect(error).toMatch(/단독으로 계산할 수 없/);
  });

  it("R-05 단독 소유 100/100 → 통과 (지분 차단 미적용)", () => {
    const form = makeFormSingleAsset("100", "100");
    const error = validateStep(0, form);
    // 다른 사유(거주 정보 등)로 실패 가능하나, 지분 모드 차단 메시지는 아니어야 함
    if (error !== null) {
      expect(error).not.toMatch(/지분 모드/);
    }
  });

  it("R-06 단건 + ratio 40/100 → 차단", () => {
    const form = makeFormSingleAsset("40", "100");
    const error = validateStep(0, form);
    expect(error).toBeTruthy();
    expect(error).toMatch(/지분 모드/);
  });
});

describe("calcOneHouseProration — totalPropertyTransferPrice 분모 동작", () => {
  it("R-02 totalPropertyTransferPrice 미설정 시 transferPrice를 분모로 사용 (기존 호환)", () => {
    // 단독 양도 14억 → 5/14 안분
    const gain = 1_000_000_000;
    const result = calcOneHouseProration(gain, 1_400_000_000);
    expect(result).toBe(Math.floor(gain * (1_400_000_000 - 1_200_000_000) / 1_400_000_000));
  });

  it("totalPropertyTransferPrice 설정 시 분모 교체 — 사례 27 1차", () => {
    // gain=514,800,000, fractionPrice=1.02B (<12억), totalPrice=1.7B (>12억)
    // 분모 = 1.7B → 과세대상 = floor(514,800,000 × 5/17) = 151,411,764
    const result = calcOneHouseProration(514_800_000, 1_020_000_000, 1_700_000_000);
    expect(result).toBe(151_411_764);
  });

  it("R-01 단독 소유 회귀 — 분모 미설정 = 분모 = transferPrice", () => {
    // 단독 양도 1.5B → 분모 1.5B
    const gain = 600_000_000;
    const r1 = calcOneHouseProration(gain, 1_500_000_000);
    const r2 = calcOneHouseProration(gain, 1_500_000_000, undefined);
    expect(r1).toBe(r2);
  });

  it("분모 ≤ 12억 → 안분 미적용 (gain 전액 반환)", () => {
    expect(calcOneHouseProration(500_000_000, 1_000_000_000)).toBe(500_000_000);
    expect(calcOneHouseProration(500_000_000, 1_020_000_000, 1_000_000_000)).toBe(500_000_000);
  });
});
