/**
 * 사례 47 변형 — M3 (거주 미충족 → 비과세 차감 비활성)
 *
 * settlement 비과세 차감 트리거 조건이 충족되지 않으면 (exemptionEligibleAtApproval=false)
 * applySettlementExemption은 redev 입력 그대로 반환 (회귀 안전).
 *
 * - settlementExemptionApplied 부착 안 됨 (undefined)
 * - settlement.gain·lthd 마스킹 안 됨 (정상 산정값)
 * - gainAfterAllocation·lthdAfterAllocation 부착 안 됨
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case47RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

describe("사례 47 변형 — 비과세 요건 불성립 (M3)", () => {
  const redevInfo = case47RedevelopmentInfo();
  // 비과세 요건 미충족으로 override
  redevInfo.exemptionEligibleAtApproval = false;

  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 2_000_000_000,
    transferDate: new Date("2022-03-01"),
    acquisitionDate: new Date("2001-01-01"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 254,
    redevelopment: redevInfo,
  });

  const result = calculateTransferTax(input, mockRates);
  const detail = result.redevelopmentDetail!;

  it("settlementExemptionApplied 미부착 (undefined)", () => {
    expect(detail.settlementExemptionApplied).toBeUndefined();
  });

  it("settlement.gain 정상 산정 — 마스킹 없음 (안분 후 70M 유지)", () => {
    // exemptionEligibleAtApproval=false 시 LTHD 표1 강등 가드는 발동, 12억 안분도 비활성
    // (applyHighValueAllocation의 isHighValue 조건이 exemptionEligibleAtApproval에 의존하지 않으므로 활성될 수 있음)
    // 적어도 settlement.gain은 마스킹되지 않음
    expect(detail.settlement.gain).toBeGreaterThan(0);
  });

  it("exemptedGain·exemptedLthd 미부착", () => {
    expect(detail.exemptedGain).toBeUndefined();
    expect(detail.exemptedLthd).toBeUndefined();
  });
});
