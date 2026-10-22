/**
 * 의제취득일(1985.1.1.) 전 상속 3자 max × 영 §164⑨ 공익수용 특례 — ③은 특례로 낮춘 양도시 기준시가로 비교한다(Q-10 A).
 *
 * 영 §164⑨은 수용이면 차액을 빼 「양도 당시 기준시가」 자체를 계산하라고 하고, ③은 영 §176조의2④1호 → ③3호 → ②2호의
 * 환산이라 분모가 그 양도 당시 기준시가다. 종전에는 비교만 원값으로 했다 — ③이 이기면 카드의 ③과 양도차익의 취득가액이
 * 갈렸고(하류 환산은 특례 분모), ①②가 원값 ③과 특례 ③ 사이면 ③을 놓쳤다.
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §14 · mock 세율 · `totalTax`.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** 토지 · 1983 상속 · 양도 920,000,000 · 의제취득일 기준시가 202,620,000 · 양도시 6,750,000/㎡ × 184.2㎡ = 1,243,350,000 */
function land(reported: number | undefined, expr: boolean) {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: 920_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("1985-01-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 0,
    standardPriceAtTransfer: 1_243_350_000,
    standardPriceAtAcquisition: 202_620_000,
    standardPricePerSqmAtTransfer: 6_750_000,
    transferArea: 184.2,
    // 보상액 4,000,000/㎡가 가장 작다 → 분모 4,000,000 × 184.2 = 736,800,000
    ...(expr ? { transferCause: "public_expropriation" as const, compensationPerSqm: 4_000_000, compensationBasisStdPrice: 5_000_000 } : {}),
    inheritedAcquisition: {
      inheritanceDate: new Date("1983-07-26"),
      assetKind: "land",
      standardPriceAtDeemedDate: 202_620_000,
      standardPriceAtTransfer: 1_243_350_000,
      transferDate: new Date("2023-02-16"),
      transferPrice: 920_000_000,
      ...(reported ? { reportedValue: reported } : {}),
    },
  });
}

/** 상가 · 1983 상속 · 양도 920,000,000 · ③ 분자 200,000,000 · 양도시 4,000,000/㎡ × 100㎡ = 400,000,000 */
function commercial(reported: number, expr: boolean) {
  return baseTransferInput({
    propertyType: "commercial_building",
    acquisitionCause: "inheritance",
    transferPrice: 920_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("1983-07-26"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 0,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 400_000_000,
    standardPricePerSqmAtTransfer: 4_000_000,
    transferArea: 100,
    // 보상액 2,500,000/㎡ → 분모 250,000,000
    ...(expr ? { transferCause: "public_expropriation" as const, compensationPerSqm: 2_500_000, compensationBasisStdPrice: 3_000_000 } : {}),
    inheritedAcquisition: {
      inheritanceDate: new Date("1983-07-26"),
      assetKind: "house_apart",
      reportedValue: reported,
      transferPrice: 920_000_000,
      standardPriceAtDeemedDate: 200_000_000,
      standardPriceAtTransfer: 400_000_000,
      transferDate: new Date("2023-02-16"),
    },
  });
}

describe("토지 — ③ 분모 = 하류 환산과 같은 특례 분모", () => {
  it("③ 채택: 카드의 ③ = 양도차익의 취득가액 = 920,000,000 × 202,620,000 ÷ 736,800,000 = 253,000,000 (종전 카드 149,925,925)", () => {
    const r = calculateTransferTax(land(undefined, true), rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown).toMatchObject({ selectedMethod: "converted", convertedAmount: 253_000_000 });
    expect(r.estimatedBase).toBe(253_000_000);
    expect(r.expropriationValuationDetail?.denominator).toBe(736_800_000);
    expect(r.transferGain).toBe(920_000_000 - 253_000_000 - 6_078_600);
    expect(r.totalTax).toBe(173_929_791);
  });

  it("① 2억이 원값 ③(149,925,925)과 특례 ③(253,000,000) 사이 → ③ 채택 · 192,159,000 → 173,929,791", () => {
    const r = calculateTransferTax(land(200_000_000, true), rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown).toMatchObject({ selectedMethod: "converted", convertedAmount: 253_000_000 });
    expect(r.totalTax).toBe(173_929_791);
  });

  it("대조 — 수용이 아니면 원값 분모: ③ 149,925,925 < ① 2억 → ① (불변)", () => {
    const r = calculateTransferTax(land(200_000_000, false), rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown).toMatchObject({ selectedMethod: "reported", convertedAmount: 149_925_925 });
    expect(r.totalTax).toBe(192_159_000);
  });
});

describe("상가 — STEP 0.35를 건너뛴 ③도 하류와 같은 분모", () => {
  it("① 1억 · ③ 채택: 카드 ③ = 적용 금액 = 920,000,000 × 200,000,000 ÷ 250,000,000 = 736,000,000 (종전 카드 460,000,000)", () => {
    const r = calculateTransferTax(commercial(100_000_000, true), rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown).toMatchObject({ selectedMethod: "converted", convertedAmount: 736_000_000 });
    expect(r.estimatedBase).toBe(736_000_000);
    expect(r.totalTax).toBe(30_024_500);
  });

  it("① 5억이 원값 ③(460,000,000)보다 크고 특례 ③보다 작다 → ③ 채택 · 99,913,000 → 30,024,500", () => {
    const r = calculateTransferTax(commercial(500_000_000, true), rates);
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown!.selectedMethod).toBe("converted");
    expect(r.totalTax).toBe(30_024_500);
  });
});
