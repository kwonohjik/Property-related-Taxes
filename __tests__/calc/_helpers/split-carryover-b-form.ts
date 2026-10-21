/**
 * 주택 split 파트 이월과세 P4 B(건물만 이월과세 + 토지 매매) — 테스트 공용 시드(폼 → ④ body → ⑫ route).
 * 시드 수치는 엔진 anchor SPCO-T5와 같다 — 건물 증여 2023-03-01(증여 신고가액 4억) · 건물 증여자 2015-06-01 1억 · 증여세 산출 2천만 / 과세가액 4억 ·
 * 직계존비속 · 토지 매매 2008-01-01 1.2억 · 양도 12억(토지 7억 + 건물 5억) · 양도일 2025-06-30. ④·⑫·⑧ 헬퍼는 C 헬퍼(`split-carryover-c-form.ts`)를 쓴다.
 */
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { cForm } from "./split-carryover-c-form";

export const B_CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2023-03-01",
  donorRelation: "lineal" as const,
  donorAcquisitionDate: "2015-06-01",
  donorAcquisitionPrice: "100,000,000",
  giftTaxCalculated: "20,000,000",
  giftTaxBase: "400,000,000",
};

export function bAsset(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    hasSeperateLandAcquisitionDate: true,
    landCauseHost: "carryover_gift",
    landAcquisitionCause: "purchase",
    landAcquisitionDate: "2008-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "120,000,000",
    buildingAcquisitionPrice: "400,000,000",
    carryover: { ...B_CARRYOVER },
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as unknown as AssetForm;
}

export function bForm(over: Partial<TransferFormData> = {}, asset: AssetForm = bAsset()): TransferFormData {
  return cForm(over, asset);
}

export const withBuildingCarry = (patch: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  bAsset({ carryover: { ...B_CARRYOVER, ...patch }, ...over });
