import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { foreignRealEstateRatesFrom } from "@/lib/tax-engine/foreign-realestate/rates";
import type {
  ForeignMoneyItem,
  ForeignRealEstateAssetInput,
  ForeignRealEstateInput,
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
