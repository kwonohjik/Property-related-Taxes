/**
 * 부담부증여 K-7(감정가액) × 신축 5년 이내 — 「소득세법」 §114조의2 가산세 anchor (PR-3)
 *
 * §114조의2①: 신축·증축 건물을 취득일(증축일)부터 5년 이내 양도하면서 §97①1호나목의 **감정가액** 또는
 * 환산취득가액을 취득가액으로 하면 그 건물의 감정가액 × 5%를 결정세액에 더한다. ②: 산출세액이 없어도 적용.
 * 감정가액 게이트는 양도일 ≥ 2020-01-01(`buildingPenaltyMethodApplies`). 매매사례가액은 조문에 없어 대상이 아니다.
 *
 * PR-1(#2196)은 이 조합을 신호가 없어 가산세가 조용히 빠진다는 이유로 **차단**했다. PR-3은 그 차단을 풀고
 * `penaltyAxis`(일반건물 카드가 쓰는 파트-국소 신호 — `acquisitionMethod: "appraisal"`로 바꿔 싣지 않는다)로 연결한다.
 * 증축은 「증축한 부분에 한정한 감정가액」(`presumedExtensionAppraisalValue`)이 base라 별도 anchor가 다룬다
 * (`burdened-gift-appraisal-extension-penalty.anchor.test.ts`) — 이 파일의 P-10은 그 입력이 없을 때의 차단만 본다.
 *
 * 시나리오(housing — land=0·building 통째, K-5 `burdened-gift-114-2-penalty.test.ts`와 같은 모양):
 *   시가 C=500M · 채무 B=200M → debtRatio 0.4 · 건물 양도가 200M
 *   취득 당시 감정가액 150M → 양도분 취득가액 150M × 0.4 = 60M · 가산세 = 60M × 5% = 3,000,000
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2024-03-01");
const CONSTRUCTION_DATE = new Date("2021-01-01"); // 신축일 = 취득일, 양도까지 5년 이내

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
    ...overrides,
  };
}

function input(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferDate: TRANSFER_DATE,
    acquisitionDate: CONSTRUCTION_DATE,
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    transferType: "burdened_gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    isSelfBuilt: true,
    buildingType: "new",
    constructionDate: CONSTRUCTION_DATE,
    burdenedGiftInfo: info(),
    ...overrides,
  });
}

describe("§114조의2 부담부증여 K-7 감정가액 × 신축 5년 이내 가산세", () => {
  it("[P-1] 감정가액 + 신축 5년 이내 → penaltyBase 60M · penaltyTax 3,000,000", () => {
    const r = calculateTransferTax(input(), rates);
    expect(r.transferBurdenedGiftBreakdown!.acquisitionMethodUsed).toBe("appraisal");
    expect(r.transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice).toBe(60_000_000);
    expect(r.penaltyBase).toBe(60_000_000);
    expect(r.penaltyTax).toBe(3_000_000);
  });

  it("[P-1b] 총액 입력(건물 한 칸)도 같은 값 — 토지가 0이라 안분 몫이 건물 전부", () => {
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
    expect(r.penaltyTax).toBe(3_000_000);
  });

  it("[P-2] 가산세가 총결정세액·지방소득세에 반영된다 (신축 아님 대비 +3,000,000 +10% 300,000)", () => {
    const withPenalty = calculateTransferTax(input(), rates);
    const without = calculateTransferTax(input({ isSelfBuilt: false }), rates);
    expect(without.penaltyTax).toBe(0);
    expect(withPenalty.totalTax - without.totalTax).toBe(3_300_000);
  });

  it("[P-3] 양도차익은 가산세 연결로 달라지지 않는다 — 감정가액 안분값 그대로", () => {
    const withPenalty = calculateTransferTax(input(), rates);
    const without = calculateTransferTax(input({ isSelfBuilt: false }), rates);
    expect(withPenalty.transferGain).toBe(without.transferGain);
  });

  it("[P-4 §114조의2②] 양도차익 ≤ 0(감정가액 600M → 안분 240M > 양도가 200M)이어도 가산세 부과", () => {
    const r = calculateTransferTax(
      input({ burdenedGiftInfo: info({ presumedBuildingAcquisitionPrice: 600_000_000 }) }),
      rates,
    );
    expect(r.calculatedTax).toBe(0);
    expect(r.penaltyBase).toBe(240_000_000);
    expect(r.penaltyTax).toBe(12_000_000);
  });

  it("[P-5] 취득일 5년 초과 양도 → 0", () => {
    const r = calculateTransferTax(
      input({ constructionDate: new Date("2018-01-01"), acquisitionDate: new Date("2018-01-01") }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[P-6] 매매사례가액 → 0 (조문 「감정가액 또는 환산취득가액」에 없음)", () => {
    const r = calculateTransferTax(
      input({
        burdenedGiftInfo: info({ acquisitionMethod: "salesCase" }),
      }),
      rates,
    );
    expect(r.transferBurdenedGiftBreakdown!.acquisitionMethodUsed).toBe("salesCase");
    expect(r.penaltyTax).toBe(0);
  });

  it("[P-7] 양도일 2020-01-01 이전 → 감정가액 게이트 미충족 0", () => {
    const r = calculateTransferTax(
      input({
        transferDate: new Date("2019-12-01"),
        constructionDate: new Date("2018-06-01"),
        acquisitionDate: new Date("2018-06-01"),
      }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[P-8] 신축 아님 → 0", () => {
    expect(calculateTransferTax(input({ isSelfBuilt: false }), rates).penaltyTax).toBe(0);
  });

  it("[P-9] 실지취득가액 안분 → 0 (회귀 — §114조의2① 가목 제외)", () => {
    const r = calculateTransferTax(
      input({
        burdenedGiftInfo: info({
          acquisitionMethod: "actual",
          actualAcquisitionTotal: 80_000_000,
        }),
      }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[P-10] 증축(85㎡ 초과) × 감정가액 → 증축부분 감정가액 미입력이면 차단(건물 전체로 대신하지 않는다)", () => {
    expect(() =>
      calculateTransferTax(
        input({ buildingType: "extension", extensionFloorArea: 120 }),
        rates,
      ),
    ).toThrow(/증축한 부분의 감정가액을 입력해야/);
  });

  it("[P-11] 증축(85㎡ 이하)은 §114조의2 대상이 아니라 차단 없이 0", () => {
    const r = calculateTransferTax(
      input({ buildingType: "extension", extensionFloorArea: 60 }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });

  it("[P-12] 토지 자산 — 건물 취득가액이 0이라 가산세 0 (stale isSelfBuilt 방어)", () => {
    const r = calculateTransferTax(
      input({
        propertyType: "land",
        burdenedGiftInfo: info({
          landStdPriceAtTransfer: 400_000_000,
          landStdPriceAtAcquisition: 100_000_000,
          buildingStdPriceAtTransfer: 0,
          buildingStdPriceAtAcquisition: 0,
          presumedLandAcquisitionPrice: 150_000_000,
          presumedBuildingAcquisitionPrice: 0,
        }),
      }),
      rates,
    );
    expect(r.penaltyTax).toBe(0);
  });
});
