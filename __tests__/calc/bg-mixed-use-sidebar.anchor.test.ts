/**
 * anchor — ⑥ 사이드바: 겸용주택 × 부담부증여 (UI 설계 §6.4 · G-10).
 *
 * 계산 전: 양도가액·취득가액·필요경비는 «계산 후 표시»(채무비율 적용 후 엔진 값이라 클라이언트가 미리 알 수 없다 — 숨은 stale 취득 입력을 보이지 않는다).
 * 계산 후: 양도가액 = 엔진 echo `burdenedGift.perPart` 4부분 양도가액 합, 취득가액·필요경비 = 겸용 결과 카드와 같은 값.
 * 귀속 편중으로 한쪽 양도가 없으면 보조 문구 «양도 없음 (채무 귀속: …)» — 「비과세」가 아니다.
 *
 * 부재·pending 단언에는 같은 시드의 일반 양도 겸용(부담부증여 아님) 짝이 있다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const RATES = makeMockRates() as never;
const TD = new Date("2024-03-01");
const ACQ = new Date("2010-03-15");

const formAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), addressJibun: "x", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-15",
    isMixedUseHouse: true, mixedAcqPerPartMode: false, residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000", mixedTransferHousingBuildingStdPrice: "100000000",
    mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqHousingBuildingStdPrice: "50000000",
    mixedIsMetropolitanArea: true,
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000", bgMortgageDebtAmount: "600000000",
    bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "700000000", bgHousingAppraisalDeclared: "none",
    // 숨은 stale 취득 입력 — 사이드바가 이것을 취득가액으로 보이면 안 된다
    fixedAcquisitionPrice: "999999999",
    ...over,
  }) as AssetForm;
const formOf = (a: AssetForm): TransferFormData =>
  ({ transferDate: "2024-03-01", filingDate: "2024-05-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false }) as unknown as TransferFormData;

const engineAsset = (): MixedUseAssetInput =>
  ({
    isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
    landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
    transferStandardPrice: { housingPrice: 600e6, commercialBuildingPrice: 100e6, landPricePerSqm: 5_000_000, housingBuildingPrice: 100e6 },
    acquisitionStandardPrice: { housingPrice: 300e6, commercialBuildingPrice: 50e6, landPricePerSqm: 2_500_000, housingBuildingPrice: 50e6 },
    residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "residential", isOneHouseExempt: false, acquisitionCause: "purchase",
  }) as MixedUseAssetInput;
const bgInfo = (attr: BurdenedGiftInfo["debtAttribution"]): BurdenedGiftInfo =>
  ({
    valuationMode: "sangjeungbeop_market", lendingDepositTotal: 0, mortgageDebtAmount: 600e6, annualRentTotal: 0, marketValueAtTransfer: 1_500_000_000,
    acquisitionMethod: "actual", actualAcquisitionTotal: 700e6, landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 1_200_000_000,
    landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 600e6, donorRelation: "lineal_descendant", debtAttribution: attr, housingAppraisal: { exists: false },
  }) as BurdenedGiftInfo;
const apiResult = (attr: BurdenedGiftInfo["debtAttribution"]) =>
  ({ mode: "mixed-use", result: calcMixedUseTransferTax(1, TD, { ...engineAsset(), burdenedGift: bgInfo(attr) }, RATES) }) as never;

describe("⑥ 사이드바 — 겸용 × 부담부증여", () => {
  it("계산 전: 양도가액·취득가액·필요경비는 «계산 후 표시»이고 숨은 취득 입력(999,999,999)을 보이지 않는다", () => {
    const row = computeTransferPerAssetSummary(formOf(formAsset({ bgMortgageAttribution: "unallocated" })), null).rows[0];
    expect(row.salePending).toBe(true);
    expect(row.acqPending).toBe(true);
    expect(row.expensePending).toBe(true);
    expect(row.acqPrice).toBe(0);
    expect(row.saleTransferNote).toBeUndefined();
  });

  it("🔴 짝: 같은 겸용을 일반 양도로 두면 종전대로 취득 입력(999,999,999)이 취득가액으로 보인다 — pending이 부담부증여 분기 때문임을 구별", () => {
    const row = computeTransferPerAssetSummary(formOf(formAsset({ transferType: "regular", bgMortgageAttribution: "unallocated" })), null).rows[0];
    expect(row.acqPrice).toBe(999_999_999);
    expect(row.acqPending).toBe(false);
  });

  it("계산 전 귀속이 한쪽뿐이면 보조 문구가 «양도 없음 (채무 귀속: …)»이다 — 비과세 아님", () => {
    const c = computeTransferPerAssetSummary(formOf(formAsset({ bgMortgageAttribution: "commercial" })), null).rows[0];
    expect(c.saleTransferNote).toBe("주택분 양도 없음 (채무 귀속: 상가)");
    const h = computeTransferPerAssetSummary(formOf(formAsset({ bgMortgageAttribution: "housing" })), null).rows[0];
    expect(h.saleTransferNote).toBe("상가분 양도 없음 (채무 귀속: 주택)");
    expect(c.saleTransferNote).not.toMatch(/비과세|감면/);
  });

  it("계산 후(전부 구분 불분명): 양도가액 = 4부분 양도가액 합 600,000,000, 취득가액 279,999,998, 보조 문구 없음", () => {
    const res = apiResult({ housing: 0, commercial: 0, unallocated: 600e6 });
    const row = computeTransferPerAssetSummary(formOf(formAsset({ bgMortgageAttribution: "unallocated" })), res).rows[0];
    expect(row.salePrice).toBe(600_000_000);
    expect(row.salePending).toBe(false);
    expect(row.acqPrice).toBe(279_999_998);
    expect(row.acqPending).toBe(false);
    expect(row.expense).toBe(0);
    expect(row.saleTransferNote).toBeUndefined();
  });

  it("계산 후(상가 귀속만): 양도가액 600,000,000 전부 상가분, 문구는 엔진 echo에서 «주택분 양도 없음»", () => {
    const res = apiResult({ housing: 0, commercial: 600e6, unallocated: 0 });
    const row = computeTransferPerAssetSummary(formOf(formAsset({ bgMortgageAttribution: "commercial" })), res).rows[0];
    expect(row.salePrice).toBe(600_000_000);
    expect(row.acqPrice).toBe(279_999_999);
    expect(row.saleTransferNote).toBe("주택분 양도 없음 (채무 귀속: 상가)");
  });
});
