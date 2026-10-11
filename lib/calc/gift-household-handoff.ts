/**
 * 판정 메뉴 → 양도세 계산기 **증여 사실 전달** (결정 #38)
 *
 * 판정 메뉴의 「증여받은 주택」(`acquisitionCause: "gift"`)이 배우자·직계존비속에게서 받은 것이고 증여일부터 양도일까지 §97의2③ 기간
 * (10년, 2023.1.1. 전 증여는 5년) 안이면, 계산기에는 **「이월과세(증여)」 원인으로 같은 사실을 담아** 넘긴다. 일반 증여로 넘기면
 * 계산기가 이월과세를 적용·비교하지 못한다. 사실은 그대로다 — 증여자 취득일 · 관계 · 계속 같은 세대 여부 · 세대 보유 시작일.
 * 취득가액·증여 당시 평가액·증여세 상당액은 판정 메뉴가 묻지 않았으므로 비워 둔다(계산기가 받는다).
 *
 * 기간 판정은 엔진과 **같은 leaf**(`judgeCarryoverEligibility`)다. 그 밖의 증여(그 밖의 친족 · 기간 밖)는 `gift` 그대로 넘긴다.
 */
import { judgeCarryoverEligibility } from "@/lib/tax-engine/transfer-tax-carryover-eligibility";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { giftHouseholdFactVisible } from "./gift-household-payload";

export function giftHandoffAsset(asset: AssetForm, transferDate: string): AssetForm {
  if (!giftHouseholdFactVisible(asset)) return asset;
  const relation = asset.giftDonorRelation;
  if (relation !== "spouse" && relation !== "lineal") return asset;
  const giftDate = toOptionalDate(asset.acquisitionDate);
  const donorDate = toOptionalDate(asset.donorAcquisitionDate);
  const transfer = toOptionalDate(transferDate);
  if (!giftDate || !donorDate || !transfer) return asset;
  const eligibility = judgeCarryoverEligibility(
    {
      giftRegistryDate: giftDate,
      donorAcquisitionDate: donorDate,
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: 0,
      donorRelation: relation,
    },
    transfer,
  );
  if (!eligibility.isEligible) return asset;
  return {
    ...asset,
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: asset.acquisitionDate,
      donorAcquisitionDate: asset.donorAcquisitionDate,
      donorRelation: relation,
      donorSameHousehold: asset.giftSameHousehold,
      donorHouseholdHoldingStartDate: asset.giftSameHousehold === "yes" ? asset.giftHouseholdHoldingStartDate : "",
    },
  };
}
