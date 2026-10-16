/**
 * anchor — 토지·건물 분리 자산의 §114조의2 가산세: **손실 경로**와 **증축부분 base** (2026-10-16).
 *
 * ## 법령
 * 「소득세법」 제114조의2 제1항 — 신축·증축 5년 이내 양도 + 감정가액·환산취득가액이면 「해당 건물의」 그 가액의 5%를
 * 결정세액에 더한다(괄호: 증축의 경우 **증축한 부분에 한정**). 제2항 — 산출세액이 없어도 적용한다.
 *
 * ## 결함 (수정 전 실측 — F25 fixture 기반)
 * | 케이스 | 종전 가산세 | 법정 |
 * |---|---|---|
 * | 손실 × 건물 파트 환산 × 신축 (건물 환산 75,000,000) | **0** | 3,750,000 |
 * | 손실 × 건물 파트 감정 × 신축 (건물 감정 80,000,000) | **0** | 4,000,000 |
 * | 이익 × 건물 파트 환산 × 증축 | **11,250,000**(건물 전체 225,000,000) | 2,250,000(증축부분 45,000,000) |
 * | 이익 × 건물 파트 감정 × 증축 | **12,500,000**(건물 전체 250,000,000) | 3,000,000(증축부분 감정 60,000,000) |
 *
 * 손실 조기반환(`transfer-tax-loss-return.ts`)이 분리 축(`resolveSplitBuildingPenaltyAxis`)을 읽지 않았고, 그 축은 증축이어도
 * 건물 파트 전체를 base로 냈다. 증축부분 환산 = 건물 파트 양도가액 × 증축부분 취득시 기준시가 ÷ 건물 양도시 기준시가.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();

/** 토지 실가(2015) + 건물 신축 환산(2021) 별개취득 — 5년 이내 양도 */
const SEPARATE_NEW_BUILDING: Partial<TransferTaxInput> = {
  propertyType: "building",
  transferPrice: 1_000_000_000,
  transferDate: new Date("2024-06-01"),
  acquisitionDate: new Date("2021-03-10"),
  landAcquisitionDate: new Date("2015-05-01"),
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "estimated",
  landAcquisitionPrice: 200_000_000,
  acquisitionPrice: 200_000_000,
  landTransferPrice: 700_000_000,
  buildingTransferPrice: 300_000_000,
  saleSplitMode: "actual",
  buildingStandardPriceAtAcquisition: 225_000_000,
  standardPricePerSqmAtAcquisition: 3_000_000,
  acquisitionArea: 100,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 300_000_000,
  isSelfBuilt: true,
  constructionDate: new Date("2021-03-10"),
  buildingType: "new",
  isOneHousehold: false,
  householdHousingCount: 0,
};

function run(over: Partial<TransferTaxInput>) {
  return calculateTransferTax(
    baseTransferInput({ ...SEPARATE_NEW_BUILDING, ...over } as Partial<TransferTaxInput>),
    rates,
  );
}


/** 토지 1.5억 + 건물 1억 양도(건물 양도시 기준시가 3억) — 토지 차손이 커서 전체 차손 */
const LOSS: Partial<TransferTaxInput> = {
  transferPrice: 250_000_000,
  landTransferPrice: 150_000_000,
  buildingTransferPrice: 100_000_000,
  landStandardPriceAtTransfer: 450_000_000,
  buildingStandardPriceAtTransfer: 300_000_000,
};
const EXT: Partial<TransferTaxInput> = {
  buildingType: "extension",
  extensionFloorArea: 120,
  extensionStdPriceAtAcquisition: 45_000_000,
  extensionAppraisalValue: 60_000_000,
};
const APPRAISAL_GAIN: Partial<TransferTaxInput> = { buildingAcqMode: "appraisal", buildingAcquisitionPrice: 250_000_000 };
const APPRAISAL_LOSS: Partial<TransferTaxInput> = { buildingAcqMode: "appraisal", buildingAcquisitionPrice: 80_000_000 };

const go = (over: Partial<TransferTaxInput>) => run({ acquisitionMethod: "actual", useEstimatedAcquisition: false, ...over });

describe("손실(산출세액 0) 경로도 건물 파트 축을 쓴다 — §114조의2②", () => {
  it("[L-1] 손실 × 건물 파트 환산 × 신축 → 75,000,000 × 5% = 3,750,000", () => {
    const r = go(LOSS);
    expect(r.transferGain).toBeLessThan(0);
    expect(r.calculatedTax).toBe(0);
    expect(r.penaltyBase).toBe(75_000_000);
    expect(r.penaltyTax).toBe(3_750_000);
    // 지방소득세는 §114조의2분 × 10%
    expect(r.totalTax).toBe(3_750_000 + 375_000);
  });

  it("[L-2] 손실 × 건물 파트 감정 × 신축 → 80,000,000 × 5% = 4,000,000", () => {
    const r = go({ ...LOSS, ...APPRAISAL_LOSS });
    expect(r.calculatedTax).toBe(0);
    expect(r.penaltyTax).toBe(4_000_000);
  });

  it("[L-3] 🔴 대조군 — 손실이어도 건물 파트가 실가면 가산세 없음", () => {
    const r = go({ ...LOSS, buildingAcqMode: "actual", buildingAcquisitionPrice: 80_000_000 });
    expect(r.penaltyTax).toBe(0);
  });
});

describe("증축은 증축부분 한정 base — 분리 자산의 건물 파트", () => {
  it("[E-1] 이익 × 환산 × 증축 → 300,000,000 × 45,000,000 ÷ 300,000,000 = 45,000,000 · 2,250,000", () => {
    const r = go(EXT);
    expect(r.splitDetail?.building.acquisitionPrice).toBe(225_000_000);
    expect(r.penaltyBase).toBe(45_000_000);
    expect(r.penaltyTax).toBe(2_250_000);
  });

  it("[E-2] 손실 × 환산 × 증축 → 100,000,000 × 45,000,000 ÷ 300,000,000 = 15,000,000 · 750,000", () => {
    const r = go({ ...LOSS, ...EXT });
    expect(r.penaltyBase).toBe(15_000_000);
    expect(r.penaltyTax).toBe(750_000);
  });

  it("[E-3] 이익 × 감정 × 증축 → 증축부분 감정가액 60,000,000 · 3,000,000 (건물 감정 250,000,000이 아니다)", () => {
    const r = go({ ...APPRAISAL_GAIN, ...EXT });
    expect(r.penaltyBase).toBe(60_000_000);
    expect(r.penaltyTax).toBe(3_000_000);
  });

  it("[E-4] 손실 × 감정 × 증축 → 3,000,000", () => {
    const r = go({ ...LOSS, ...APPRAISAL_LOSS, ...EXT });
    expect(r.calculatedTax).toBe(0);
    expect(r.penaltyTax).toBe(3_000_000);
  });

  // 자산 전체 식(양도가액 × 증축 기준시가 ÷ 자산 양도시 기준시가)이 건물 파트 식과 **다른 값**이 되도록 분모를 9억으로 둔다
  //   — 10억이면 두 식이 우연히 같은 45,000,000이 되어 덮어쓰기를 못 잡는다(뮤테이션 실측).
  it("[E-5] 🔴 자산 단위 환산 플래그가 켜져 있어도 자산 전체 식(50,000,000)으로 덮지 않는다 — 건물 파트 식 45,000,000", () => {
    const r = go({ ...EXT, useEstimatedAcquisition: true, standardPriceAtTransfer: 900_000_000 });
    expect(r.penaltyBase).toBe(45_000_000);
  });

  it("[E-5b] 🔴 손실 경로도 같다 — 자산 전체 식(12,500,000)이 아니라 건물 파트 식 15,000,000", () => {
    const r = go({ ...LOSS, ...EXT, useEstimatedAcquisition: true, standardPriceAtTransfer: 900_000_000 });
    expect(r.calculatedTax).toBe(0);
    expect(r.penaltyBase).toBe(15_000_000);
  });

  it("[E-6] 감정 × 증축인데 증축부분 감정가액이 없으면 오류 — 건물 감정가액 전체로 대신하지 않는다", () => {
    expect(() => go({ ...LOSS, ...APPRAISAL_LOSS, ...EXT, extensionAppraisalValue: undefined })).toThrow(/증축한 부분의 감정가액을 입력해야/);
  });

  it("[E-7] 증축부분 감정가액이 건물 감정가액보다 크면 오류", () => {
    expect(() => go({ ...APPRAISAL_GAIN, ...EXT, extensionAppraisalValue: 300_000_000 })).toThrow(/건물 감정가액\(250,000,000원\)보다 클 수 없습니다/);
  });

  it("[E-8] 🔴 대조군 — 신축은 종전대로 건물 파트 전체(225,000,000 · 11,250,000)", () => {
    const r = go({});
    expect(r.penaltyBase).toBe(225_000_000);
    expect(r.penaltyTax).toBe(11_250_000);
  });

  it("[E-9] 🔴 대조군 — 증축 85㎡ 이하는 가산세 없음(증축부분 감정가액이 없어도 오류 아님)", () => {
    const r = go({ ...APPRAISAL_GAIN, ...EXT, extensionFloorArea: 85, extensionAppraisalValue: undefined });
    expect(r.penaltyTax).toBe(0);
  });
});
