/**
 * 부담부증여 × 이월과세 × 당초 증여자 신축·증축 — 테스트 공용 시드(폼 → ④ body → ⑫ route).
 * 엔진 anchor(`carryover-donor-built-bg.anchor.test.ts`)와 같은 셀: 시가 800M · 채무 500M(채무비율 0.625) · 양도 2026-02-16 · 증여 2023-06-01 · 당초 증여자 취득 2000-06-01.
 */
import { vi } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset";

export const DB_ON: Partial<CarryoverTaxationForm> = { donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" };

/** 엔진 anchor 와 같은 셀 — 시가 800M · 채무 500M · 양도 2026-02-16 · 증여 2023-06-01 · 당초 증여자 취득 2000-06-01 */
export function bgAsset(method: "appraisal" | "converted", co: Partial<CarryoverTaxationForm> = {}, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2023-06-01",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "800,000,000",
    bgLendingDepositTotal: "300,000,000",
    bgMortgageDebtAmount: "200,000,000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: method,
    standardPriceAtTransfer: "800,000,000",
    standardPriceAtAcq: "400,000,000",
    landStandardPriceAtTransfer: "0",
    buildingStandardPriceAtTransfer: "800,000,000",
    bgActualAcquisitionTotal: "600,000,000",
    bgCoDonorLandStdPriceAtAcq: "0",
    bgCoDonorBuildingStdPriceAtAcq: "150,000,000",
    ...(method === "appraisal" ? { bgCoDonorPresumedAcquisitionTotal: "200,000,000" } : {}),
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2023-06-01",
      donorAcquisitionDate: "2000-06-01",
      donorAcquisitionPrice: "100,000,000",
      giftDateValuation: "600,000,000",
      giftTaxAmount: "0",
      donorRelation: "lineal",
      donorSameHousehold: "no",
      ...DB_ON,
      ...co,
    },
    ...over,
  } as AssetForm;
}

export function bgForm(a: AssetForm): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-02-16";
  f.contractTotalPrice = "800,000,000";
  f.isOneHousehold = false;
  f.householdHousingCount = "2";
  f.assets[0] = a;
  return withTestAddress(f);
}

export async function bodyOf(f: TransferFormData): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f);
  return captured;
}
