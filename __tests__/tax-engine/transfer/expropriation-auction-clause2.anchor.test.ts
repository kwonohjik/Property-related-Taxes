/**
 * anchor — §164⑨ 2호 공매·경락 특례 (계획 P4 / D5).
 *
 * 소득세법 시행령 §164⑨ 2호: 「국세징수법」 공매·「민사집행법」 강제경매·저당권실행 경매 시,
 * 그 공매·경락가액이 양도당시 기준시가보다 낮으면 그 차액을 차감 → 양도당시 기준시가 = min(2).
 *
 * ⚠️ 2호는 1호와 다르다:
 *   - 후보 **2개**(기준시가·공매경락가액) — "중 적은 금액" 문언 없음(1호는 3후보).
 *   - **총액 비교**(공매·경락가액은 낙찰 총액 — 원/㎡ 분해 없음). 자산종류 무관.
 *   - 게이트 = `isAuctionTransfer`(수용 아님). 1호(transferCause)와 **배타**(N3).
 *
 * 베이스: 토지 환산 — 양도 10억, 양도시 기준시가 총액 8억, 취득시 4억, 공매가액 6억.
 *   2호 분모 = min(8억, 6억) = 6억 → 환산취득가 = INT(10억 × 4억 / 6억) = 666,666,666 (현행 500,000,000).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 토지 환산 + 공매 시나리오 */
function auction(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2023-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    isNonBusinessLand: false,
    useEstimatedAcquisition: true,
    standardPriceAtTransfer: 800_000_000,
    standardPriceAtAcquisition: 400_000_000,
    isAuctionTransfer: true,
    auctionPrice: 600_000_000,
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("§164⑨ 2호 공매·경락 특례 (P4)", () => {
  it("C-09 공매+환산 → min[총액] 적용, 환산취득가 666,666,666·양도차익 321,333,334", () => {
    const r = calculateTransferTax(auction(), rates);
    // 분모 = min(800,000,000, 600,000,000) = 600,000,000
    // 환산취득가 = INT(10억 × 4억 / 6억) = 666,666,666
    // 양도차익 = 10억 − 666,666,666 − 개산공제(4억×3%=12,000,000) = 321,333,334
    expect(r.transferGain).toBe(321_333_334);
    expect(r.auctionValuationDetail?.chosen).toBe(600_000_000);
    expect(r.auctionValuationDetail?.denominator).toBe(600_000_000);
    expect(r.auctionValuationDetail?.standardTotal).toBe(800_000_000);
    expect(r.auctionValuationDetail?.auctionPrice).toBe(600_000_000);
  });

  it("C-10 경락도 동일 경로(통칭 '공매·경락가액') — auctionPrice 하나로 처리", () => {
    // 경락가액도 auctionPrice 필드 하나로 통칭(auctionKind 미분리 — 계획 §4-4 N2).
    const r = calculateTransferTax(auction({ auctionPrice: 500_000_000 }), rates);
    // 분모 = min(800,000,000, 500,000,000) = 500,000,000 → 환산 = INT(10억×4억/5억)=800,000,000
    expect(r.auctionValuationDetail?.denominator).toBe(500_000_000);
    expect(r.transferGain).toBe(1_000_000_000 - 800_000_000 - 12_000_000);
  });

  it("게이트 OFF — isAuctionTransfer=false → 현행(500,000,000 분모) 양도차익 488,000,000", () => {
    const r = calculateTransferTax(auction({ isAuctionTransfer: false }), rates);
    // 분모 = standardPriceAtTransfer = 800,000,000 → 환산 = 500,000,000
    expect(r.transferGain).toBe(1_000_000_000 - 500_000_000 - 12_000_000);
    expect(r.auctionValuationDetail).toBeUndefined();
  });

  it("게이트 OFF — 양도 2009.02.03 → 미적용", () => {
    const r = calculateTransferTax(
      auction({ transferDate: new Date("2009-02-03"), acquisitionDate: new Date("2000-06-01") }),
      rates,
    );
    expect(r.auctionValuationDetail).toBeUndefined();
  });

  it("게이트 OFF — 공매가액 미입력 → 미적용", () => {
    const r = calculateTransferTax(auction({ auctionPrice: undefined }), rates);
    expect(r.auctionValuationDetail).toBeUndefined();
  });

  it("경계 — 공매가액 ≥ 기준시가 총액 → 차감 0(분모 불변 800,000,000)", () => {
    const r = calculateTransferTax(auction({ auctionPrice: 900_000_000 }), rates);
    // min(800,000,000, 900,000,000) = 800,000,000 → 환산 불변 500,000,000
    expect(r.auctionValuationDetail?.chosen).toBe(800_000_000);
    expect(r.transferGain).toBe(1_000_000_000 - 500_000_000 - 12_000_000);
  });

  it("N3 배타 — 1호(수용)+2호 동시 시 1호 우선(2호 미발동)", () => {
    // validate가 UI에서 차단하나, 엔진 방어: transferCause=수용이면 1호가 우선.
    const r = calculateTransferTax(
      auction({
        transferCause: "public_expropriation",
        compensationPerSqm: 5_000_000,
        compensationBasisStdPrice: 6_000_000,
        standardPricePerSqmAtTransfer: 8_000_000,
        transferArea: 100,
      }),
      rates,
    );
    // 1호 발동 → auctionValuationDetail 없음, expropriationValuationDetail 존재
    expect(r.auctionValuationDetail).toBeUndefined();
    expect(r.expropriationValuationDetail).toBeDefined();
  });
});

// ── 컴패니언(다자산) 2호 — 1호와 대칭 지원 (코드리뷰 2026-07-16 침묵 strip 방어) ──

/** 토지 1건 — 공매 + 환산. min(5억, 3억)=3억 분모 → 환산취득가 666,666,666 */
function auctionCompanionItem(id: string, withAuction: boolean) {
  return {
    propertyId: id,
    propertyLabel: id,
    propertyType: "land" as const,
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 500_000_000,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    ...(withAuction ? { isAuctionTransfer: true, auctionPrice: 300_000_000 } : {}),
  } as unknown as TransferTaxInput;
}

describe("컴패니언(다자산) §164⑨ 2호 공매·경락 특례 (P4)", () => {
  it("컴패니언 자산도 2호 적용 — 자산별 단건 엔진 재사용이라 도달", () => {
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2020,
        properties: [auctionCompanionItem("primary", true), auctionCompanionItem("companion-1", true)],
        annualBasicDeductionUsed: 0,
        priorReductionUsage: [],
      } as never,
      rates,
    );
    // min(5억,3억)=3억 → 환산 666,666,666 → 양도차익 327,333,334 (미적용이면 594,000,000)
    expect(r.properties).toHaveLength(2);
    for (const p of r.properties) {
      expect(p.transferGain).toBe(327_333_334);
    }
  });

  it("컴패니언만 공매 — 주 자산 미적용, 컴패니언만 적용 (자산별 독립)", () => {
    const r = calculateTransferTaxAggregate(
      {
        taxYear: 2020,
        properties: [auctionCompanionItem("primary", false), auctionCompanionItem("companion-1", true)],
        annualBasicDeductionUsed: 0,
        priorReductionUsage: [],
      } as never,
      rates,
    );
    const primary = r.properties.find((p) => p.propertyId === "primary")!;
    const companion = r.properties.find((p) => p.propertyId === "companion-1")!;
    expect(primary.transferGain).toBe(594_000_000);
    expect(companion.transferGain).toBe(327_333_334);
  });
});
