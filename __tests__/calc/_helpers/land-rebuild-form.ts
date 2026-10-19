/**
 * 구주택 멸실·신축 통산(해석 (5)) — 테스트 공용 시드(폼 → ④ body → ⑫ route).
 * 시드 수치는 엔진 anchor(`appurtenant-land-rebuild-rate-basis.anchor.test.ts`)와 같다 — 신축 사용승인 2025-01-01 · 양도 2025-09-01(신축 8개월) ·
 * 토지 2022-01-01 취득(상속개시일) · 양도 10억(토지 7억 + 건물 3억) · 토지 취득가 2억 + 신축비용 2.5억.
 * 호스트 = 건물 신축 + 「토지는 다른 원인으로 취득」(상속, 피상속인 취득일 2010-01-01) — UI에서 토지 취득일 칸이 열리는 유일한 경로.
 */
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

export function rebuildAsset(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "newConstruction",
    occupancyApprovalDate: "2025-01-01",
    acquisitionDate: "2025-01-01",
    fixedAcquisitionPrice: "250,000,000",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2022-01-01",
    landAcquisitionCause: "inheritance",
    landCauseHost: "newConstruction",
    landDecedentAcquisitionDate: "2010-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "200,000,000",
    actualSalePrice: "1,000,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "300,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "300,000,000",
    // 통산 입력 — 기본은 켠 상태(since_land · 멸실 2023-05-31 · 정착면적 확인)
    landRebuildEnabled: true,
    landRebuildStartMode: "since_land",
    landRebuildDemolitionDate: "2023-05-31",
    landRebuildFootprintUnchanged: true,
    ...over,
  } as unknown as AssetForm;
}

export function rebuildForm(over: Partial<TransferFormData> = {}, asset: AssetForm = rebuildAsset()): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2025-09-01",
    filingDate: "2025-11-30",
    assets: [asset],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: false,
    ...over,
  } as unknown as TransferFormData;
}
