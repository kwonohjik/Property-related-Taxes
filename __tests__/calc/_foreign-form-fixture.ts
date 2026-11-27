/**
 * 국외 부동산 폼 픽스처 — 교재 사례(K-1: 취득 2022-01-15 $400,000 · 양도 2026-07-10 $900,000 · 양도비 $30,000)
 * 기준환율 취득 1,300 · 양도 1,100 · 양도비 지출일(=양도일) 1,100.
 */
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultForeignAsset, type ForeignAssetForm } from "@/lib/stores/calc-wizard-form-foreign";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

export function k1Asset(patch: Partial<ForeignAssetForm> = {}): ForeignAssetForm {
  return {
    ...makeDefaultForeignAsset(),
    kind: "land",
    countryCode: "US",
    address: "Seattle",
    transferDate: "2026-07-10",
    currency: "USD",
    transferAmount: "900000",
    transferRate: "1100",
    acquisitionDate: "2022-01-15",
    acquisitionAmount: "400000",
    acquisitionRate: "1300",
    costRows: [{ date: "2026-07-10", amountForeign: "30000", exchangeRate: "1100" }],
    ...patch,
  };
}

/** 양도일 2026-03-05, 양도차익 자산(취득 $100,000 · 양도 $200,000) */
export function gainAsset2(patch: Partial<ForeignAssetForm> = {}): ForeignAssetForm {
  return k1Asset({
    address: "Portland",
    transferDate: "2026-03-05",
    transferAmount: "200000",
    transferRate: "1200",
    acquisitionDate: "2020-05-01",
    acquisitionAmount: "100000",
    acquisitionRate: "1150",
    costRows: [],
    ...patch,
  });
}

export function foreignForm(patch: Partial<TransferFormData> = {}, assets: ForeignAssetForm[] = [k1Asset()]): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assetLocation: "foreign",
    foreignResidenceYears: "7",
    foreignAssets: assets,
    ...patch,
  };
}
