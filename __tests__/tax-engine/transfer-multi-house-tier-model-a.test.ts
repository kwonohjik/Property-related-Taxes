/**
 * C16 회귀 — 다주택 2·3주택 중과 tier 혼재 (§104⑤·§104⑦)
 *
 * `multi_house_surcharge` 그룹에 2주택(+20%p)과 3주택(+30%p)이 혼재할 때,
 * 대표자산 단일 tier를 그룹 합산 과세표준 전체에 적용하면 **입력 순서에 따라 세액이 달라진다**
 * (3주택 우선 324,060,000 / 2주택 우선 274,060,000).
 *
 * ## ⚠️ 감사 원안의 기대값을 채택하지 않았다 (2026-07-29, #591 R7)
 *
 * 감사는 "모델 A = 합산 과세표준에 기본세율 누진 **1회** + 자산별 가산분 Σ"로 304,060,000을
 * 제시하며 "법령·세율표에서 독립 도출"이라고 적었으나, **§104⑤에서 도출되지 않는 하이브리드**다.
 *
 * §104⑤ — 산출세액 = MAX(1호, 2호)
 *   · 1호: 과세표준 **합계액**에 §55① 세율 (중과 없음)
 *   · 2호 **본문**: **자산별** 양도소득 산출세액 **합계액**
 *   · 2호 **단서**: "둘 이상의 자산에 대하여 … **동일한 호**의 세율이 적용되고, 그 적용세율이
 *     둘 이상인 경우"에만 합산 후 호별 세율 적용 → **큰** 산출세액의 합계
 *
 * 사안의 A는 §104⑦**3호**(3주택 이상), B는 §104⑦**1호**(2주택)로 **호가 다르다**
 * → 단서 미적용 → **2호 본문**(자산별 독립 산출 후 합).
 * 감사 모델이 24백만원 더 큰 이유는 누진 구간을 합산 기준으로 한 번만 태워 각 자산의
 * 낮은 구간을 지웠기 때문이다. 2호 본문은 자산별로 누진을 각각 태워 구간이 리셋된다.
 *
 * ⇒ 기대값을 **280,120,000**(§104⑤ 도출값)으로 정정한다.
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

// §104⑤2호 본문 — 자산별 독립 산출 후 합계 (mock 2024 세율표에서 손계산)
//   A(3주택, 과세표준 3억): 누진 94,060,000 + 30%p 90,000,000 = 184,060,000
//   B(2주택, 과세표준 2억): 누진 56,060,000 + 20%p 40,000,000 =  96,060,000
const ASSET_A_TAX = 94_060_000 + 300_000_000 * 0.3; // 184,060,000
const ASSET_B_TAX = 56_060_000 + 200_000_000 * 0.2; //  96,060,000
const EXPECTED_GROUP_TAX = ASSET_A_TAX + ASSET_B_TAX; // 280,120,000
// §104⑤1호(합산 §55①, 중과 없음) = 174,060,000 < 280,120,000 → 2호 채택
const GENERAL_PROGRESSIVE_500M = 500_000_000 * 0.4 - 25_940_000; // 174,060,000

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
  it("§104⑤2호 본문 — 자산별 산출세액 합계 (280,120,000)", () => {
    const r = run([ASSET_A, ASSET_B]);
    const grp = r.groupTaxes.find((g) => g.group === "multi_house_surcharge");
    expect(grp).toBeDefined();
    expect(grp!.groupTaxBase).toBe(500_000_000);
    expect(grp!.groupCalculatedTax).toBe(EXPECTED_GROUP_TAX);
    // §104⑤ MAX(1호 174,060,000, 2호 280,120,000) → 2호 채택
    expect(EXPECTED_GROUP_TAX).toBeGreaterThan(GENERAL_PROGRESSIVE_500M);
    expect(r.calculatedTax).toBe(EXPECTED_GROUP_TAX);
  });

  it("대표자산 순서 무관 동일 결과 (2주택/3주택 순서 스왑)", () => {
    const forward = run([ASSET_A, ASSET_B]);
    const reversed = run([ASSET_B, ASSET_A]);
    expect(forward.calculatedTax).toBe(reversed.calculatedTax);
    expect(forward.calculatedTax).toBe(EXPECTED_GROUP_TAX);
    // 버그(대표 단일 tier 전체 적용)라면 3주택 우선 = +30% 전체 = 324,060,000,
    // 2주택 우선 = +20% 전체 = 274,060,000 로 순서 의존. §104⑤2호 본문은 둘 다 280,120,000.
    expect(forward.calculatedTax).not.toBe(324_060_000);
    expect(reversed.calculatedTax).not.toBe(274_060_000);
  });
});
