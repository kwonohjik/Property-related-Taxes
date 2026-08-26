/**
 * 사례 45 — 12억 안분 + 거주월수 귀속 분리 분기 매트릭스 회귀
 *
 * 디자인 §3 케이스 매트릭스의 C-2 / C-3 / C-5 회귀 보호.
 * C-4 (사례 45 본진) 는 case-45-integration.test.ts.
 * C-1 (사례 44, 1세대1주택 X) 는 case-44-integration.test.ts.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case45RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

function makeInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 1_500_000_000, // 사례 45 기본 (C-3·C-4·C-5 12억 초과 분기 진입용)
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2007-04-09"),
    acquisitionPrice: 450_000_000,
    expenses: 9_000_000,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 66,
    redevelopment: case45RedevelopmentInfo(),
    ...overrides,
  });
}

describe("C-2 — 12억 이하 전액 비과세 (산출세액 0)", () => {
  // 사례 45 입력의 양도가를 12억으로 낮춤. 12억 이하는 STEP 3 미발동 → 전체 redev 결과 그대로.
  // 단 redev.total.gain 이 음수가 되지 않게 acquisitionPrice·expenses 도 조정.
  const input = makeInput({
    transferPrice: 1_200_000_000,
  });
  const result = calculateTransferTax(input, mockRates);

  it("highValueAllocation 미부착 (12억 초과 분기 미진입)", () => {
    expect(result.redevelopmentDetail?.highValueAllocation).toBeUndefined();
  });

  it("lthdResidenceAttribution 미부착 (STEP 3 skip)", () => {
    expect(result.redevelopmentDetail?.lthdResidenceAttribution).toBeUndefined();
  });
});

describe("C-3 — 12억 초과 + prior=60·new=30 비대칭 거주 (existingRate ≠ payRate)", () => {
  // prior 60 + new 30 = 90개월(7년) → 기존건물분 거주 7년 (표2)
  // new 30개월(2년) → 청산금분 거주 2년 (표2 진입 가능)
  // → existingRate ≠ payRate 율 차이 발생
  const redev = {
    ...case45RedevelopmentInfo(),
    priorHouseResidenceMonths: 60,
    newHouseResidenceMonths: 30,
  };
  const input = makeInput({
    redevelopment: redev,
    residencePeriodMonths: 90, // legacy fallback 영향 없음
  });
  const result = calculateTransferTax(input, mockRates);

  it("highValueAllocation 부착 (12억 초과)", () => {
    expect(result.redevelopmentDetail?.highValueAllocation).toBeDefined();
  });

  it("기존건물분 거주월수 = 90 (통산, §154⑧1호)", () => {
    expect(result.redevelopmentDetail?.lthdResidenceAttribution?.existingResidenceMonths).toBe(90);
  });

  it("청산금분 거주월수 = 30 (신축만, 해석례 2020-386)", () => {
    expect(result.redevelopmentDetail?.lthdResidenceAttribution?.payResidenceMonths).toBe(30);
  });

  it("기존건물분 표2 진입 — 보유 15년 40% 캡 + 거주 7년 28% = 68%", () => {
    expect(result.redevelopmentDetail?.preApproval.lthdRate).toBeCloseTo(0.68, 5);
  });

  it("청산금분 표2 진입 — 보유 9년 × 4% = 36% + 거주 2년 × 4% = 8% = 44%", () => {
    expect(result.redevelopmentDetail?.settlement.lthdRate).toBeCloseTo(0.44, 5);
  });

  it("existingRate ≠ payRate (거주귀속 분리 회귀 보호)", () => {
    const ex = result.redevelopmentDetail?.preApproval.lthdRate ?? 0;
    const pay = result.redevelopmentDetail?.settlement.lthdRate ?? 0;
    expect(ex).not.toBeCloseTo(pay, 3);
  });
});

describe("C-5 — 12억 초과 + prior+new < 24 (두 분기 모두 표1 강등)", () => {
  // prior 6 + new 6 = 12개월 → 거주 1년 → 표2 진입 미충족
  const redev = {
    ...case45RedevelopmentInfo(),
    priorHouseResidenceMonths: 6,
    newHouseResidenceMonths: 6,
  };
  const input = makeInput({
    redevelopment: redev,
    residencePeriodMonths: 12,
  });
  const result = calculateTransferTax(input, mockRates);

  it("기존건물분 표1 강등 — 보유 15년 × 2% = 30% 캡", () => {
    expect(result.redevelopmentDetail?.preApproval.lthdRate).toBeCloseTo(0.30, 5);
  });

  it("청산금분 표1 — 보유 9년 × 2% = 18%", () => {
    expect(result.redevelopmentDetail?.settlement.lthdRate).toBeCloseTo(0.18, 5);
  });

  it("lthdResidenceAttribution.existingTable === 'table1' (caps 30% 이하)", () => {
    expect(result.redevelopmentDetail?.lthdResidenceAttribution?.existingTable).toBe("table1");
  });

  it("lthdResidenceAttribution.payTable === 'table1'", () => {
    expect(result.redevelopmentDetail?.lthdResidenceAttribution?.payTable).toBe("table1");
  });
});
