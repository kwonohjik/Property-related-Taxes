/**
 * anchor — 주택 PHD split §164⑨ 1호 공익수용 특례 (계획 P6b/D15 · C-08).
 *
 * 개별주택가격 미공시 취득(§164⑦ 3시점 환산) 주택을 수용 양도 시, §164⑨1호는 **양도시 개별주택가격
 * (P_T)을 환산 분모에서만** min(개별주택가격, 보상액, 보상기초)로 낮춘다. 양도가액 토지·건물 안분
 * (§166⑥)은 **원 P_T 유지**(D16-GB 원리, 법령 검증 완료).
 *
 * 베이스: Excel 검증 PHD fixture(양도 715M, P_T=627M). 수용 보상 총액 500M·보상기초 550M.
 *   chosen = min(627M, 500M, 550M) = 500M → totalEstAcq = floor(715M × 484,828,268 / 500M) = 693,304,423
 *   (현행 552,874,340). 안분 landTransferPrice 532,721,324는 원 P_T=627M 기준이라 **불변**.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_TOTAL_GAIN,
  PHD_TOTAL_EST_ACQ,
  PHD_LAND_TRANSFER_PRICE,
  PHD_BLDG_TRANSFER_PRICE,
} from "../transfer-tax/_helpers/pre-housing-disclosure-fixture";

const rates = makeMockRates();

function phdSplit(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: PHD_TRANSFER_PRICE,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2014-09-14"),
    landAcquisitionDate: new Date("2013-06-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    landSplitMode: "apportioned",
    preHousingDisclosure: PHD_INPUT,
    transferCause: "public_expropriation",
    housingCompensationTotal: 500_000_000,
    housingCompensationBasisTotal: 550_000_000,
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("주택 PHD split §164⑨ 1호 (P6b/D15)", () => {
  it("baseline — 수용 아님 → 현행 유지(환산 552,874,340·양도차익 147,580,813·detail 없음)", () => {
    const r = calculateTransferTax(phdSplit({ transferCause: "general" }), rates);
    expect(r.preHousingDisclosureDetail?.totalEstimatedAcquisitionPrice).toBe(PHD_TOTAL_EST_ACQ);
    expect(r.transferGain).toBe(PHD_TOTAL_GAIN);
    expect(r.splitDetail?.housingExpropriationValuationDetail).toBeUndefined();
  });

  it("C-08 수용 → 환산 분모만 500M로 낮춤(환산 693,304,423↑) · 안분 P_T 원값 불변", () => {
    const r = calculateTransferTax(phdSplit(), rates);
    // 환산 분모 하락 → 총 환산취득가 상승(relief)
    expect(r.preHousingDisclosureDetail?.totalEstimatedAcquisitionPrice).toBe(693_304_423);
    // ★ 안분(양도가액 토지·건물)은 원 P_T=627M 기준이라 불변
    expect(r.preHousingDisclosureDetail?.landTransferPrice).toBe(PHD_LAND_TRANSFER_PRICE); // 532,721,324
    expect(r.preHousingDisclosureDetail?.buildingTransferPrice).toBe(PHD_BLDG_TRANSFER_PRICE); // 182,278,676
    // 양도차익 = 715M − 693,304,423 − 개산공제 14,544,847 = 7,150,730
    expect(r.transferGain).toBe(7_150_730);
    const d = r.splitDetail?.housingExpropriationValuationDetail;
    expect(d?.standardTotal).toBe(627_000_000);
    expect(d?.compensationTotal).toBe(500_000_000);
    expect(d?.compensationBasisTotal).toBe(550_000_000);
    expect(d?.chosen).toBe(500_000_000);
    expect(d?.denominator).toBe(500_000_000);
  });

  it("경계 — 보상·보상기초 둘 다 개별주택가격(627M) 초과 → chosen === 627M(차감 0)", () => {
    const r = calculateTransferTax(
      phdSplit({ housingCompensationTotal: 700_000_000, housingCompensationBasisTotal: 680_000_000 }),
      rates,
    );
    expect(r.splitDetail?.housingExpropriationValuationDetail?.chosen).toBe(627_000_000);
    expect(r.preHousingDisclosureDetail?.totalEstimatedAcquisitionPrice).toBe(PHD_TOTAL_EST_ACQ);
    expect(r.transferGain).toBe(PHD_TOTAL_GAIN);
  });

  it("게이트 OFF — 보상 총액 미입력 → 미적용", () => {
    const r = calculateTransferTax(
      phdSplit({ housingCompensationTotal: undefined, housingCompensationBasisTotal: undefined }),
      rates,
    );
    expect(r.splitDetail?.housingExpropriationValuationDetail).toBeUndefined();
    expect(r.transferGain).toBe(PHD_TOTAL_GAIN);
  });

  it("게이트 OFF — 양도 2009.02.03 → 미적용", () => {
    const r = calculateTransferTax(
      phdSplit({ transferDate: new Date("2009-02-03") }),
      rates,
    );
    expect(r.splitDetail?.housingExpropriationValuationDetail).toBeUndefined();
  });
});
