/**
 * 레인 L24 공용 폼 — 이월과세(`carryover_gift`) 주택 단건 · 양도 2024-06-01 · 1세대 · 취득 당시 조정대상지역(토글) · 거주 6개월(direct) ·
 * 증여자 취득 2010-01-01 · 증여자와 다른 세대. `residue`는 칸 없는 `acquisitionDate` 잔재, `gift`는 증여 등기접수일(엔진이 읽는 취득일).
 */
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

export const carryoverFacts = (gift: string) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: gift,
  donorAcquisitionDate: "2010-01-01",
  donorAcquisitionCause: "purchase",
  donorAcquisitionPrice: "100000000",
  giftDateValuation: "200000000",
  giftTaxAmount: "0",
  donorRelation: "spouse",
  donorSameHousehold: "no",
});

export function carryoverResidenceForm(
  residue: string,
  gift: string,
  cause: "carryover_gift" | "purchase" = "carryover_gift",
  over: Partial<AssetForm> = {},
  formOver: Partial<TransferFormData> = {},
): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  Object.assign(f, {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    householdHousingCount: "1",
    isOneHousehold: true,
    wasRegulatedAtAcquisition: true,
    wasRegulatedAtAcquisitionTouched: true,
    residencePeriodMonths: "6",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    contractTotalPrice: "600000000",
    ...formOver,
  });
  f.assets = [
    {
      ...f.assets[0],
      assetId: "a0",
      assetKind: "housing",
      acquisitionCause: cause,
      acquisitionDate: residue,
      fixedAcquisitionPrice: cause === "purchase" ? "100000000" : "",
      acquisitionPrice: "100000000",
      actualSalePrice: "600000000",
      standardPriceAtTransfer: "400000000",
      useEstimatedAcquisition: false,
      residencePeriodMonthsAsset: "6",
      residenceInputMode: "direct",
      ...(cause === "carryover_gift" ? { carryover: carryoverFacts(gift) } : {}),
      ...over,
    } as AssetForm,
  ];
  return rosterForDeclaredCount(f);
}
