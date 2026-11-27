import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { foreignRealEstateRatesFrom } from "@/lib/tax-engine/foreign-realestate/rates";
import type {
  ForeignMoneyItem,
  ForeignRealEstateAssetInput,
  ForeignRealEstateInput,
  ForeignTaxItemInput,
} from "@/lib/tax-engine/foreign-realestate/types";

export const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** 양도일 시점 seed 세율 (A-0가 §55①과 일치함을 고정) */
export const ratesAt = (iso: string) =>
  foreignRealEstateRatesFrom(parseRatesFromMap(loadFallbackTransferRates(d(iso))));

export const usd = (amountForeign: number, date: string, exchangeRate: number): ForeignMoneyItem => ({
  amountForeign,
  currency: "USD",
  date: d(date),
  exchangeRate,
});

/** 교재 K-1: 양도 $900,000@1,100(2026-07-10) · 취득 $400,000@1,300(2022-01-15) · 양도비 $30,000@1,100 */
export function k1Asset(over: Partial<ForeignRealEstateAssetInput> = {}): ForeignRealEstateAssetInput {
  return {
    id: "a1",
    kind: "land",
    transferDate: d("2026-07-10"),
    acquisitionDate: d("2022-01-15"),
    transfer: usd(900_000, "2026-07-10", 1_100),
    acquisition: usd(400_000, "2022-01-15", 1_300),
    capitalExpenditures: [],
    transferCosts: [usd(30_000, "2026-07-10", 1_100)],
    ...over,
  };
}

export function k1Input(over: Partial<ForeignRealEstateInput> = {}): ForeignRealEstateInput {
  return { domesticResidenceYears: 5, assets: [k1Asset()], ...over };
}

/**
 * PR-3 둘째 자산 B: 취득 2023-01-10 $200,000@1,300 = 260,000,000 · 양도 2026-03-05 $300,000@1,200 = 360,000,000 → 양도차익 100,000,000.
 * `transferUsd`·`rate`를 바꿔 차익을 조절한다(양도가액 = transferUsd × rate).
 */
export function bAsset(
  over: Partial<ForeignRealEstateAssetInput> = {},
  transferUsd = 300_000,
  rate = 1_200,
): ForeignRealEstateAssetInput {
  return {
    id: "b",
    kind: "building",
    transferDate: d("2026-03-05"),
    acquisitionDate: d("2023-01-10"),
    transfer: usd(transferUsd, "2026-03-05", rate),
    acquisition: usd(200_000, "2023-01-10", 1_300),
    capitalExpenditures: [],
    transferCosts: [],
    ...over,
  };
}

/** K-1 자산을 id "a"로 — 양도차익 437,000,000 (2026-07-10) */
export const aAsset = (over: Partial<ForeignRealEstateAssetInput> = {}) => k1Asset({ id: "a", ...over });

/** 외국납부세액 1건: 외화 USD × 환율(납부일 환율) */
export const ftax = (assetId: string, amountUsd: number, date: string, exchangeRate: number): ForeignTaxItemInput => ({
  assetId,
  ...usd(amountUsd, date, exchangeRate),
});
