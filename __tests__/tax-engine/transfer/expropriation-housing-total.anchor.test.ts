/**
 * anchor — 주택(라목) §164⑨ 1호 공익수용 특례 총액 트랙 (계획 P5 / C-05·C-14).
 *
 * 주택은 개별주택가격·공동주택가격이 **총액**이라 원/㎡ 3후보(land·building) 모델이 안 맞는다.
 * ⇒ **총액 3후보** min(개별주택가격 총액, 보상액 총액, 보상기초 기준시가 총액)으로 환산 분모를 낮춘다.
 *
 * 1호 per-sqm(applyExpropriationValuation)·2호(applyAuctionValuation)와 배타·독립.
 * 게이트 = housing + 수용(transferCause) + 환산 + 2009.02.04 + 총액 후보 2개>0.
 *
 * 베이스: 주택 환산 — 양도 10억, 개별주택가격 8억, 취득시 4억, 보상 6억·보상기초 7억.
 *   분모 = min(8억, 6억, 7억) = 6억 → 환산취득가 = INT(10억×4억/6억) = 666,666,666 (현행 500,000,000).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 주택 환산 + 수용 시나리오 (비-1세대1주택 — 12억 안분 배제로 양도차익 직접 검산) */
function house(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate: new Date("2023-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    standardPriceAtTransfer: 800_000_000,
    standardPriceAtAcquisition: 400_000_000,
    transferCause: "public_expropriation",
    housingCompensationTotal: 600_000_000,
    housingCompensationBasisTotal: 700_000_000,
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("주택 §164⑨ 1호 총액 트랙 (P5)", () => {
  it("C-05 수용+환산 → min[총액3] 적용, 환산취득가 666,666,666·양도차익 321,333,334", () => {
    const r = calculateTransferTax(house(), rates);
    expect(r.transferGain).toBe(321_333_334);
    expect(r.housingExpropriationValuationDetail?.chosen).toBe(600_000_000);
    expect(r.housingExpropriationValuationDetail?.denominator).toBe(600_000_000);
    expect(r.housingExpropriationValuationDetail?.standardTotal).toBe(800_000_000);
    expect(r.housingExpropriationValuationDetail?.compensationTotal).toBe(600_000_000);
    expect(r.housingExpropriationValuationDetail?.compensationBasisTotal).toBe(700_000_000);
  });

  it("C-14 경계 — 보상·보상기초 둘 다 기준시가 총액 초과 → chosen === 기준시가(차감 0)", () => {
    const r = calculateTransferTax(
      house({ housingCompensationTotal: 900_000_000, housingCompensationBasisTotal: 850_000_000 }),
      rates,
    );
    // min(800M, 900M, 850M) = 800M → 환산 불변 500,000,000
    expect(r.housingExpropriationValuationDetail?.chosen).toBe(800_000_000);
    expect(r.transferGain).toBe(1_000_000_000 - 500_000_000 - 12_000_000);
  });

  it("게이트 OFF — 수용 아님(general) → 현행 양도차익 488,000,000", () => {
    const r = calculateTransferTax(house({ transferCause: "general" }), rates);
    expect(r.transferGain).toBe(1_000_000_000 - 500_000_000 - 12_000_000);
    expect(r.housingExpropriationValuationDetail).toBeUndefined();
  });

  it("게이트 OFF — 양도 2009.02.03 → 미적용", () => {
    const r = calculateTransferTax(
      house({ transferDate: new Date("2009-02-03"), acquisitionDate: new Date("2000-06-01") }),
      rates,
    );
    expect(r.housingExpropriationValuationDetail).toBeUndefined();
  });

  it("게이트 OFF — 보상 총액 미입력 → 미적용", () => {
    const r = calculateTransferTax(house({ housingCompensationTotal: undefined }), rates);
    expect(r.housingExpropriationValuationDetail).toBeUndefined();
  });

  it("land는 이 총액 트랙에 진입하지 않는다 (per-sqm 1호 전용)", () => {
    // housing 총액 필드를 land에 줘도 housing 트랙 미발동(propertyType 게이트)
    const r = calculateTransferTax(house({ propertyType: "land" }), rates);
    expect(r.housingExpropriationValuationDetail).toBeUndefined();
  });

  it("stale per-sqm 필드가 공존해도 주택은 총액 트랙이 이긴다 (shadowing 방어 — 코드리뷰)", () => {
    // land→housing 전환 시 stale per-sqm 4필드가 남은 상황. 엔진이 housing을 per-sqm에서
    // 배제하므로 per-sqm 1호가 아니라 주택 총액 트랙이 발동해야 한다.
    const r = calculateTransferTax(
      house({
        standardPricePerSqmAtTransfer: 5_000_000,
        transferArea: 100,
        compensationPerSqm: 2_000_000,
        compensationBasisStdPrice: 3_000_000,
      }),
      rates,
    );
    // per-sqm이 발동하면 분모 = min(5M,2M,3M)×100 = 2억(오산출). 총액 트랙이면 6억.
    expect(r.expropriationValuationDetail).toBeUndefined(); // per-sqm 미발동
    expect(r.housingExpropriationValuationDetail?.denominator).toBe(600_000_000);
    expect(r.transferGain).toBe(321_333_334);
  });
});
