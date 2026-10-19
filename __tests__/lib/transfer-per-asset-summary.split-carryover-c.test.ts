/**
 * P2 C ⑥ 사이드바 — 파트 이월과세의 취득가액·필요경비는 입력 단계에서 «계산 후 표시»(pending), 결과가 오면 엔진이 실제 차감한 값으로 풀린다 (2026-10-19)
 *
 * 입력 단계에서 증여 신고가액(미적용 값)이나 그 합을 취득가액으로 보이면 오독이다 — 파트별 ②3호 비교(엔진)가 어느 쪽이 쓰이는지 정한다.
 * 토글을 끄면(= C 비활성) 그 규칙이 적용되지 않는다(부정형 짝).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { cAsset, cForm } from "../calc/_helpers/split-carryover-c-form";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";

const D = (s: string) => new Date(s);
const GIFT = D("2023-03-01");
const ct = (donor: string, price: number, valuation: number, giftTax: number) => ({
  giftRegistryDate: GIFT, donorAcquisitionDate: D(donor), donorAcquisitionPrice: price, useEstimatedAcquisition: false,
  giftTaxAmount: giftTax, giftDateValuation: valuation, donorRelation: "lineal" as const, exclusionDeclared: {},
});
const engineC = calculateTransferTax(
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_200_000_000, transferDate: D("2025-06-30"), acquisitionPrice: 0, acquisitionDate: GIFT,
    isOneHousehold: false, householdHousingCount: 2, landAcquisitionDate: GIFT, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
    landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
    landAcquisitionPrice: 240_000_000, buildingAcquisitionPrice: 660_000_000, acquisitionCause: "carryover_gift", landAcquisitionCause: "carryover_gift",
    isSeparateAcquisition: false,
    carryoverGiftEvent: { giftRegistryDate: GIFT, giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000 },
    landCarryoverTaxation: ct("1995-03-01", 50_000_000, 240_000_000, 8_000_000),
    buildingCarryoverTaxation: ct("2015-06-01", 50_000_000, 660_000_000, 22_000_000),
  }),
  makeMockRates(),
);

beforeEach(() => useCalcWizardStore.getState().reset());

const load = (asset = cAsset(), result: TransferAPIResult | null = null) => {
  useCalcWizardStore.setState({ formData: cForm({}, asset), result });
  const { formData, result: r } = useCalcWizardStore.getState();
  return computeTransferPerAssetSummary(formData, r).rows[0];
};

describe("⑥ C 사이드바", () => {
  it("입력 단계: 취득가액·필요경비는 계산 후 표시(부분합을 총액으로 보이지 않는다)", () => {
    const row = load();
    expect(row.acqPending).toBe(true);
    expect(row.expensePending).toBe(true);
    expect(row.acqPrice).toBe(0);
    expect(row.expense).toBe(0);
  });

  it("결과 후: 엔진이 실제 차감한 파트 합으로 풀린다 — 토지 증여 신고가액 2.4억(②3호 배제) + 건물 증여자 취득가액 5천만 = 2.9억, 필요경비 = 건물 증여세 상당액 2천2백만", () => {
    const row = load(cAsset(), { mode: "single", result: engineC } as unknown as TransferAPIResult);
    expect(row.acqPending).toBe(false);
    expect(row.acqPrice).toBe(290_000_000);
    expect(row.expensePending).toBe(false);
    expect(row.expense).toBe(22_000_000);
  });

  it("부정형 짝: 토글 OFF(자산 전체 이월과세)는 이 규칙을 타지 않는다 — 파트 값을 합산해 pending으로 두지 않는다", () => {
    const row = load(cAsset({ carryoverDonorSplit: false }));
    expect(row.acqPending).toBe(false);
  });
});
