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
import { previewCommercialBuildingEstimated } from "@/lib/calc/transfer-estimated-preview";

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

/**
 * U-3d — 사이드바 **프리뷰**도 같은 율을 봐야 한다 (계산 전 ≠ 계산 후 방지).
 *
 * `previewCommercialBuildingEstimated`는 엔진 input을 **화이트리스트로 재조립**한다. CB STEP이
 * 읽는 필드가 늘었는데 여기를 안 늘리면 타입은 통과하고 프리뷰만 조용히 다른 값을 낸다 —
 * 실제로 §163⑥1호 단서 배선 직후 이 갭이 생겼다(프리뷰 3% vs 결과 0.3%, 10배).
 */
describe("U-3d — CB 환산 프리뷰가 미등기 율을 반영한다", () => {
  // 취득 2010 → post_disclosure(2005-01-01 이후). 필드명은 `calc-wizard-asset-cb.ts` 정본.
  const asset = {
    assetId: "a1",
    assetKind: "commercial_building",
    useEstimatedAcquisition: true,
    acquisitionCause: "purchase",
    acquisitionDate: "2010-06-01",
    actualSalePrice: "1000000000",
    cbEra: "post_disclosure",
    cbExclusiveArea: "150",
    cbSharedArea: "50",
    cbLandArea: "100",
    cbUnitPriceAtTransfer: "2500000",
    cbUnitPriceAtFirstOrAcq: "1000000",
    cbLandPricePerSqmAtTransfer: "3000000",
    cbLandPricePerSqmAtAcq: "1500000", // post_disclosure 필수(§164④ fallback 동일 경로)
  } as unknown as Parameters<typeof previewCommercialBuildingEstimated>[0];

  const form = (isUnregistered: boolean) =>
    ({ transferDate: "2020-06-01", contractTotalPrice: "1000000000", isUnregistered }) as unknown as
      Parameters<typeof previewCommercialBuildingEstimated>[1];

  it("등기 → 개산공제 6,000,000 (취득 호별총액 2억 × 3%)", () => {
    const p = previewCommercialBuildingEstimated(asset, form(false));
    expect(p?.expense).toBe(6_000_000);
  });

  it("미등기 → 개산공제 600,000 (× 0.3%)", () => {
    const p = previewCommercialBuildingEstimated(asset, form(true));
    // 프리뷰가 폼-전역 미등기를 못 보면 6,000,000이 나와 깨진다.
    expect(p?.expense).toBe(600_000);
  });
});
