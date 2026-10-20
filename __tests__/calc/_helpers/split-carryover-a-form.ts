/**
 * 주택 split 파트 이월과세 P3 A(토지만 이월과세 + 건물 매매·신축) — 테스트 공용 시드(폼 → ④ body → ⑫ route).
 * 시드 수치는 엔진 anchor SPCO-T1과 같다 — 건물 매매 2021-03-01 4억 · 토지 증여 2023-03-01(평가 3억) · 토지 증여자 2000-01-01 1억 ·
 * 증여세 산출 2천만 / 과세가액 3억 · 직계존비속 · 양도 12억(토지 7억 + 건물 5억) · 양도일 2025-06-30.
 * ④·⑫·⑧ 헬퍼는 C 헬퍼(`split-carryover-c-form.ts`)를 그대로 쓴다.
 */
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { cForm } from "./split-carryover-c-form";

export type AHost = "purchase" | "newConstruction";

const HOST: Record<AHost, Record<string, unknown>> = {
  purchase: { acquisitionCause: "purchase", acquisitionDate: "2021-03-01", buildingAcquisitionPrice: "400,000,000" },
  // 신축 — 건물 취득가액은 «신축비용»(`fixedAcquisitionPrice`) 칸이 정본(`splitBuildingAcqPriceInput`)
  newConstruction: { acquisitionCause: "newConstruction", occupancyApprovalDate: "2021-03-01", acquisitionDate: "2021-03-01", fixedAcquisitionPrice: "400,000,000" },
};

export const A_LAND_CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2023-03-01",
  donorRelation: "lineal" as const,
  donorAcquisitionDate: "2000-01-01",
  donorAcquisitionPrice: "100,000,000",
  giftTaxCalculated: "20,000,000",
  giftTaxBase: "300,000,000",
};

export function aAsset(host: AHost = "purchase", over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    ...HOST[host],
    hasSeperateLandAcquisitionDate: true,
    landCauseHost: host,
    landAcquisitionCause: "carryover_gift",
    landAcquisitionDate: "2023-03-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    landCarryover: { ...A_LAND_CARRYOVER },
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as unknown as AssetForm;
}

export function aForm(host: AHost = "purchase", over: Partial<TransferFormData> = {}, asset: AssetForm = aAsset(host)): TransferFormData {
  return cForm(over, asset);
}

export const withLandCarry = (host: AHost, patch: Record<string, unknown>) => aAsset(host, { landCarryover: { ...A_LAND_CARRYOVER, ...patch } });
