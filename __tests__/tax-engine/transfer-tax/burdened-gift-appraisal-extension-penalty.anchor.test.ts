/**
 * 부담부증여 K-7(감정가액) × 증축 5년 이내 — 「소득세법」 §114조의2 가산세 anchor
 *
 * §114조의2①: 증축(바닥면적 합계 85㎡ 초과)한 건물을 증축일부터 5년 이내 양도하면서 §97①1호나목의 **감정가액**을
 * 취득가액으로 하면 **증축한 부분에 한정한** 감정가액의 5%를 결정세액에 더한다. #2199까지는 그 값을 받는 칸이 없어 차단했다.
 * 이 작업은 `burdenedGiftInfo.presumedExtensionAppraisalValue`(물건 전체 기준·채무 안분 전)를 받아
 * base = 입력값 × 채무비율(소령 §159①1호)로 연결한다. 계획서 docs/00-pm/burdened-gift-appraisal-extension-penalty.plan.md §2.
 *
 * 시나리오(housing — land=0·building 통째, 신축 anchor `burdened-gift-appraisal-114-2-penalty.anchor.test.ts`와 같은 모양):
 *   시가 C=500M · 채무 B=200M → debtRatio 0.4 · 건물 양도가 200M
 *   건물 감정가액 150M → 안분 60M(양도차익에 쓰는 값)
 *   증축부분 감정가액 60M → 안분 24M → 가산세 24M × 5% = 1,200,000
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { scaleBurdenedGiftInfo } from "@/lib/tax-engine/burdened-gift-apportionment";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2024-03-01");
const EXTENSION_DATE = new Date("2021-01-01"); // 증축일, 양도까지 5년 이내

function info(overrides: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: "appraisal",
    marketValueAtTransfer: 500_000_000,
    lendingDepositTotal: 0,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    mortgageSetAmount: 200_000_000,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 400_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 100_000_000,
    presumedLandAcquisitionPrice: 0,
    presumedBuildingAcquisitionPrice: 150_000_000,
    presumedExtensionAppraisalValue: 60_000_000,
    ...overrides,
  };
}

function input(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferDate: TRANSFER_DATE,
    acquisitionDate: EXTENSION_DATE,
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    transferType: "burdened_gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    isSelfBuilt: true,
    buildingType: "extension",
    extensionFloorArea: 120,
    constructionDate: EXTENSION_DATE,
    burdenedGiftInfo: info(),
    ...overrides,
  });
}

describe("§114조의2 부담부증여 K-7 감정가액 × 증축 5년 이내 가산세", () => {
  it("[E-1] 증축부분 감정가액 60M → 안분 24M · 가산세 1,200,000", () => {
    const r = calculateTransferTax(input(), rates);
    expect(r.transferBurdenedGiftBreakdown!.acquisitionMethodUsed).toBe("appraisal");
    // 양도차익에 쓰는 건물 취득가액은 증축부분이 아니라 건물 전체 감정가액의 안분값 그대로
    expect(r.transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice).toBe(60_000_000);
    expect(r.penaltyBase).toBe(24_000_000);
    expect(r.penaltyTax).toBe(1_200_000);
  });

  it("[E-1b] 건물 전체 감정가액이 아니라 증축부분만 base다 (신축이면 60M → 3,000,000과 구별)", () => {
    const ext = calculateTransferTax(input(), rates);
    const asNew = calculateTransferTax(input({ buildingType: "new", extensionFloorArea: undefined }), rates);
    expect(asNew.penaltyBase).toBe(60_000_000);
    expect(asNew.penaltyTax).toBe(3_000_000);
    expect(ext.penaltyTax).toBe(1_200_000);
  });

  it("[E-1c] 총액 입력(건물 한 칸)도 같은 값 — 토지가 0이라 안분 몫이 건물 전부", () => {
    const r = calculateTransferTax(
      input({
        burdenedGiftInfo: info({
          presumedLandAcquisitionPrice: undefined,
          presumedBuildingAcquisitionPrice: undefined,
          presumedAcquisitionTotal: 150_000_000,
        }),
      }),
      rates,
    );
    expect(r.penaltyBase).toBe(24_000_000);
    expect(r.penaltyTax).toBe(1_200_000);
  });

  it("[E-2] 가산세가 총결정세액·지방소득세에 반영된다 (증축 아님 대비 +1,200,000 +10% 120,000)", () => {
    const withPenalty = calculateTransferTax(input(), rates);
    const without = calculateTransferTax(input({ isSelfBuilt: false }), rates);
    expect(without.penaltyTax).toBe(0);
    expect(withPenalty.totalTax - without.totalTax).toBe(1_320_000);
  });

  it("[E-3] 양도차익은 가산세 연결로 달라지지 않는다", () => {
    const withPenalty = calculateTransferTax(input(), rates);
    const without = calculateTransferTax(input({ isSelfBuilt: false }), rates);
    expect(withPenalty.transferGain).toBe(without.transferGain);
  });

  it("[E-4 §114조의2②] 양도차익 ≤ 0이어도 가산세 부과 (건물 감정가액 600M·증축부분 300M → 안분 120M)", () => {
    const r = calculateTransferTax(
      input({
        burdenedGiftInfo: info({
          presumedBuildingAcquisitionPrice: 600_000_000,
          presumedExtensionAppraisalValue: 300_000_000,
        }),
      }),
      rates,
    );
    expect(r.calculatedTax).toBe(0);
    expect(r.penaltyBase).toBe(120_000_000);
    expect(r.penaltyTax).toBe(6_000_000);
  });

  it("[E-5 필수] 85㎡ 초과 × 5년 이내 × 감정가액인데 증축부분 감정가액 미입력 → 차단 (건물 전체로 대신하지 않는다)", () => {
    expect(() =>
      calculateTransferTax(
        input({ burdenedGiftInfo: info({ presumedExtensionAppraisalValue: undefined }) }),
        rates,
      ),
    ).toThrow(/증축한 부분의 감정가액을 입력해야/);
  });

  it("[E-5b] 0도 미입력과 같다", () => {
    expect(() =>
      calculateTransferTax(input({ burdenedGiftInfo: info({ presumedExtensionAppraisalValue: 0 }) }), rates),
    ).toThrow(/증축한 부분의 감정가액을 입력해야/);
  });

  it("[E-6 상한] 증축부분 감정가액이 건물 감정가액(분리 입력)을 넘으면 차단", () => {
    expect(() =>
      calculateTransferTax(
        input({ burdenedGiftInfo: info({ presumedExtensionAppraisalValue: 150_000_001 }) }),
        rates,
      ),
    ).toThrow(/증축한 부분의 감정가액이 건물 감정가액/);
  });

  it("[E-6b] 상한 경계 — 건물 감정가액과 같으면 통과(안분 60M → 3,000,000)", () => {
    const r = calculateTransferTax(
      input({ burdenedGiftInfo: info({ presumedExtensionAppraisalValue: 150_000_000 }) }),
      rates,
    );
    expect(r.penaltyBase).toBe(60_000_000);
    expect(r.penaltyTax).toBe(3_000_000);
  });

  it("[E-6c] 총액 입력의 상한은 총액이다", () => {
    const total = info({
      presumedLandAcquisitionPrice: undefined,
      presumedBuildingAcquisitionPrice: undefined,
      presumedAcquisitionTotal: 150_000_000,
    });
    expect(() =>
      calculateTransferTax(input({ burdenedGiftInfo: { ...total, presumedExtensionAppraisalValue: 150_000_001 } }), rates),
    ).toThrow(/증축한 부분의 감정가액이 감정가액 총액/);
  });

  it("[E-7] 85㎡ 이하 증축은 대상이 아니라 칸 없이도 0", () => {
    const r = calculateTransferTax(
      input({
        extensionFloorArea: 85,
        burdenedGiftInfo: info({ presumedExtensionAppraisalValue: undefined }),
      }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[E-8] 증축일 5년 초과 양도 → 칸 없이도 0", () => {
    const r = calculateTransferTax(
      input({
        constructionDate: new Date("2018-01-01"),
        acquisitionDate: new Date("2018-01-01"),
        burdenedGiftInfo: info({ presumedExtensionAppraisalValue: undefined }),
      }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[E-9] 양도일 2020-01-01 이전은 감정가액 게이트 미충족 → 칸 없이도 0", () => {
    const r = calculateTransferTax(
      input({
        transferDate: new Date("2019-12-01"),
        constructionDate: new Date("2018-06-01"),
        acquisitionDate: new Date("2018-06-01"),
        burdenedGiftInfo: info({ presumedExtensionAppraisalValue: undefined }),
      }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[E-10] 매매사례가액은 조문에 없어 증축 칸을 무시하고 0", () => {
    const r = calculateTransferTax(
      input({ burdenedGiftInfo: info({ acquisitionMethod: "salesCase" }) }),
      rates,
    );
    expect(r.transferBurdenedGiftBreakdown!.acquisitionMethodUsed).toBe("salesCase");
    expect(r.penaltyTax).toBe(0);
  });

  it("[E-11] 실지취득가액 안분 → 칸의 stale 값이 있어도 0 (회귀)", () => {
    const r = calculateTransferTax(
      input({ burdenedGiftInfo: info({ acquisitionMethod: "actual", actualAcquisitionTotal: 80_000_000 }) }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[E-12] 신축(new)은 이 칸을 쓰지 않는다 — 건물 전체 감정가액 안분값이 base (PR-3 회귀)", () => {
    const r = calculateTransferTax(
      input({ buildingType: "new", extensionFloorArea: undefined }),
      rates,
    );
    expect(r.penaltyBase).toBe(60_000_000);
  });

  it("[E-13 공유지분 A축] scaleBurdenedGiftInfo가 증축부분 감정가액도 같은 비율로 줄인다", () => {
    const scaled = scaleBurdenedGiftInfo(info(), 0.5);
    expect(scaled.presumedBuildingAcquisitionPrice).toBe(75_000_000);
    expect(scaled.presumedExtensionAppraisalValue).toBe(30_000_000);
  });

  it("[E-14] 증축부분 감정가액이 없는 info는 스케일해도 undefined를 유지한다", () => {
    const scaled = scaleBurdenedGiftInfo(info({ presumedExtensionAppraisalValue: undefined }), 0.5);
    expect(scaled.presumedExtensionAppraisalValue).toBeUndefined();
  });
});
