/**
 * C16 회귀 — 다주택 2·3주택 중과 tier 모델 A 분리 (§104③·§104⑤·§104⑦)
 *
 * multi_house_surcharge 그룹에 2주택(+20%p)과 3주택(+30%p)이 혼재할 때,
 * 대표자산 단일 tier를 그룹 합산 과세표준 전체에 적용하면 입력 순서에 따라 세액이 달라진다.
 * 모델 A: 합산 과세표준에 기본세율 누진 1회 + 자산별 가산분 Σ(taxBaseShare_i × addon_i).
 *
 * 기대값은 법령·세율표에서 독립 도출(엔진 출력 베끼지 않음).
 */

import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "./_helpers/mock-rates";

// 중과 유예 없음(2021년 양도 — 유예 2022.5.10 이전) 버전 세율.
const rates = makeMockRates({
  "transfer:surcharge:_default": {
    taxType: "transfer",
    category: "surcharge",
    subCategory: "_default",
    rateTable: {
      multi_house_2: { additionalRate: 0.2, condition: "조정 2주택", referenceDate: "transfer_date" },
      multi_house_3plus: { additionalRate: 0.3, condition: "조정 3주택+", referenceDate: "transfer_date" },
      non_business_land: { additionalRate: 0.1 },
      unregistered: { flatRate: 0.7, excludeDeductions: true, excludeBasicDeduction: true },
    },
    deductionRules: null,
    specialRules: { surcharge_suspended: false },
  },
});

function makeHouse(
  propertyId: string,
  count: number,
  transferPrice: number,
  acquisitionPrice: number,
): TransferTaxItemInput {
  const base = baseTransferInput();
  return {
    ...(base as unknown as TransferTaxItemInput),
    propertyId,
    propertyLabel: propertyId,
    propertyType: "housing",
    transferPrice,
    acquisitionPrice,
    // 보유 2.5년(≥24개월 → 단기 아님, <3년 → 장기보유공제 0%). 중과 적용 → LTHD 배제.
    acquisitionDate: new Date("2019-01-01"),
    transferDate: new Date("2021-07-01"), // 2021.6.1~ 시행: +20/+30
    isOneHousehold: false,
    isRegulatedArea: true,
    householdHousingCount: count,
    expenses: 0,
  };
}

// A: 3주택 과세표준 기여 3억(+30%p), B: 2주택 과세표준 기여 2억(+20%p)
const ASSET_A = makeHouse("A", 3, 500_000_000, 200_000_000); // 차익 300,000,000
const ASSET_B = makeHouse("B", 2, 400_000_000, 200_000_000); // 차익 200,000,000

// 기본세율 누진(2024 세율표): 과세표준 5억 → 5억×40% − 25,940,000 = 174,060,000
const BASE_PROGRESSIVE_500M = 500_000_000 * 0.4 - 25_940_000; // 174,060,000
// 자산별 가산분: 3억×30% + 2억×20% = 90,000,000 + 40,000,000 = 130,000,000
const SURCHARGE_SUM = 300_000_000 * 0.3 + 200_000_000 * 0.2; // 130,000,000
const EXPECTED_GROUP_TAX = BASE_PROGRESSIVE_500M + SURCHARGE_SUM; // 304,060,000

function run(order: TransferTaxItemInput[]): ReturnType<typeof calculateTransferTaxAggregate> {
  const input: AggregateTransferInput = {
    taxYear: 2021,
    // 기본공제 소진 → 합산 과세표준 = 소득금액 (깨끗한 안분 검증)
    annualBasicDeductionUsed: 2_500_000,
    properties: order,
  };
  return calculateTransferTaxAggregate(input, rates);
}

describe("C16: 다주택 tier 모델 A 분리", () => {
  it("모델 A — 기본세율 1회 + 자산별 가산분 합산 (304,060,000)", () => {
    const r = run([ASSET_A, ASSET_B]);
    const grp = r.groupTaxes.find((g) => g.group === "multi_house_surcharge");
    expect(grp).toBeDefined();
    expect(grp!.groupTaxBase).toBe(500_000_000);
    expect(grp!.groupCalculatedTax).toBe(EXPECTED_GROUP_TAX);
    // 비교과세: 단일 그룹 → byGroups 채택
    expect(r.calculatedTax).toBe(EXPECTED_GROUP_TAX);
  });

  it("대표자산 순서 무관 동일 결과 (2주택/3주택 순서 스왑)", () => {
    const forward = run([ASSET_A, ASSET_B]);
    const reversed = run([ASSET_B, ASSET_A]);
    expect(forward.calculatedTax).toBe(reversed.calculatedTax);
    expect(forward.calculatedTax).toBe(EXPECTED_GROUP_TAX);
    // 버그(대표 단일 tier 전체 적용)라면 3주택 우선 = +30% 전체 = 174,060,000+150,000,000=324,060,000,
    // 2주택 우선 = +20% 전체 = 274,060,000 로 순서 의존. 모델 A는 둘 다 304,060,000.
    expect(forward.calculatedTax).not.toBe(324_060_000);
    expect(reversed.calculatedTax).not.toBe(274_060_000);
  });
});
