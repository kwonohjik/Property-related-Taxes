/**
 * anchor U-3 — 상업용건물·오피스텔 환산 + 미등기양도자산 개산공제율 0.3%.
 *
 * 계획서: docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md §4 Phase B
 *
 * 갭: `commercial-building-valuation.ts:302·401`이 `ESTIMATED_DEDUCTION_RATE.LAND_BUILDING`(3%)을
 *     직접 참조해 미등기 분기가 없었다. 「소득세법 시행령」 §163⑥1호 단서는 미등기양도자산의
 *     개산공제율을 **3/1000**으로 정한다.
 *
 * 이는 2026-07-28에 split·PHD·겸용·재개발 **15곳**을 `estimatedDeductionRate()` 경유로 바꾼
 * 정정(`legal-codes/transfer-nbl.ts:175-178`)에서 CB·GB가 빠져 남은 잔여분이다. CB는 상수를
 * 직접 참조하는 형태여서 당시 `0.03` 리터럴 grep에 걸리지 않았다.
 *
 * 수치 (픽스처는 `commercial-building-97-2-swap.anchor.test.ts`와 동일):
 *   취득 호별총액 = unitPriceAtAcquisition 1,000,000 × 연면적 200㎡ = 200,000,000
 *   환산취득가액 = 400,000,000
 *   개산공제  등기 = 200,000,000 × 3%   = 6,000,000  → transferGain 594,000,000
 *            미등기 = 200,000,000 × 0.3% =   600,000  → transferGain 599,400,000
 *   차이 5,400,000 (개산공제 10배)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 상가 환산 — 연면적 200㎡, 양도 10억, 취득 2010-06-01, 양도 2020-06-01(10년) */
function cb(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "commercial_building",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    transferCause: "general",
    commercialBuildingValuation: {
      isPreDisclosure: false,
      exclusiveArea: 150,
      commonArea: 50,
      unitPriceAtTransfer: 2_500_000,
      unitPriceAtAcquisition: 1_000_000,
    },
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("anchor U-3 — 상가 환산 × 미등기 개산공제율 (§163⑥1호 단서)", () => {
  it("대조군: 등기 자산 → 개산공제 3% · transferGain 594,000,000", () => {
    const r = calculateTransferTax(cb({ isUnregistered: false }), rates);
    expect(r.transferGain).toBe(594_000_000);
  });

  it("U-3: 미등기 → 개산공제 0.3% · transferGain 599,400,000", () => {
    const r = calculateTransferTax(cb({ isUnregistered: true }), rates);
    // 3% 고정이 남아 있으면 594,000,000이 되어 이 단언이 깨진다(mutation 감지).
    expect(r.transferGain).toBe(599_400_000);
  });

  it("U-3b: 미등기 상가는 70% 단일세율 · 장특공제·기본공제 배제 (§104①10호·§95②·§103②)", () => {
    const r = calculateTransferTax(cb({ isUnregistered: true }), rates);
    expect(r.appliedRate).toBe(0.7);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("unregistered");
    expect(r.basicDeduction).toBe(0);
  });
});
