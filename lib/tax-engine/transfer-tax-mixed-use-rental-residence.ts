/**
 * 겸용주택 × §155⑳ 거주주택 · §155④⑤ 합가 상대 쪽 임대 (`docs/00-pm/mixed-use-rental-155-20.plan.md`)
 *
 * 영 §154③ 「법 제89조제1항제3호를 적용할 때 … 복합되어 있는 경우 … 그 전부를 주택으로 본다」(단서: 주택 면적이 적거나 같으면 주택 외 부분 제외).
 * 법 §89①3호나목 → 영 §154⑪ → §155 특례 ⇒ ⑳의 「그 밖의 1주택」도 겸용주택의 주택 부분을 포함한다. ⑥·⑦·⑧·§89②를 겸용에 적용하는 것과 같은 축이다.
 * 정면 회신은 찾지 못했다(국세청 질의회신·조세심판·판례 검색 2026-11-01). 가까운 회신: 서면인터넷방문상담4팀-571(조특법 §97 임대 5호 + 겸용 ⇒ 주택 부분 비과세),
 * 사전-2020-법령해석재산-1076(겸용 + §155①).
 *
 * 🔑 판정은 단건과 같은 함수다. 겸용은 주택 수·의제 축만 받고 12억 안분·표2·§154①은 겸용 경로(`meetsOneHouseRequirements`·주택분 계산)가 맡는다.
 * 🔑 B(직전거주주택보유주택)·§154⑩은 받지 않는다 — §161 안분을 겸용 4파트에 적용한 근거가 없다. ⑧·⑫가 막는다.
 */
import { mergeRentalCarveoutMissingNotice, mergeRentalCarveoutNotice, withMergeRentalCarveout } from "./one-house/merge-rental-carveout";
import { resolveHouseCountExclusionDate } from "./one-house/gift-household-basis";
import { assembleSurchargeHouseSet } from "./transfer-tax-judgment-steps";
import {
  rentalNoticesForEarlyReturn,
  rentalUnitsToRestore,
  rentalUnmetReasonText,
  resolvePrhpUnmet,
  restoreRentalUnitsToHouseCount,
} from "./transfer-tax-rental-housing-judge";
import { resolveRentalResidenceComposition } from "./transfer-tax-rental-residence-composition";
import { TRANSFER, TRANSFER_RENTAL_HOUSING } from "./legal-codes/transfer";
import { MIXED_USE } from "./legal-codes/transfer-mixed-use";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { TransferTaxInput } from "./types/transfer.types";
import type { MixedUseAssetInput } from "./types/transfer-mixed-use.types";

export interface MixedUseRentalResidence {
  /**
   * ⑳ 성립 — 주택 수 축과 중과 15호 ① 요소를 연다. 세대 구성 판정 보류(`undetermined`)도 비과세는 연다(단건 STEP 2.5와 같다).
   * 보류는 명부가 없을 때만이라 정밀 중과 판정 자체가 돌지 않아 15호에 닿지 않는다.
   */
  deemed: boolean;
  /** ⑳ 불성립 — 주택 수에 되돌릴 임대 호수(이중 계상 규칙은 `rentalUnitsToRestore`) */
  restoredUnits: number;
  /** 0061 경로가 섰는가 — 임대를 빼고 §155④⑤로 판정한다 */
  mergeCarved: boolean;
  mergeRentalRowId?: string;
  /** 명부 없음 · 불성립 카드 행처럼 명부와 다른 중과 판정 주택 집합 */
  surchargeHouses?: NonNullable<TransferTaxInput["houses"]>;
  notices: string[];
}

const NONE: Omit<MixedUseRentalResidence, "notices"> = { deemed: false, restoredUnits: 0, mergeCarved: false };

export function resolveMixedUseRentalResidence(asset: MixedUseAssetInput, parsedRates: ParsedRates): MixedUseRentalResidence | undefined {
  if (!asset.rentalResidenceInput) return undefined;
  // 판정 함수가 보는 자산은 「주택」이다(§154③). 취득일은 ④가 건물 취득일과 같은 값을 싣는다(`transfer-tax-api-mixed-use.ts`).
  const source: TransferTaxInput = { ...asset.rentalResidenceInput, propertyType: "housing" };

  const carved = withMergeRentalCarveout(source);
  if (carved.mergeRentalCarveout) {
    return { ...NONE, mergeCarved: true, mergeRentalRowId: carved.mergeRentalCarveout.rentalRowId, notices: [mergeRentalCarveoutNotice(carved)] };
  }

  const rhe = source.rentalHousingException;
  if (rhe?.applyException !== true || rhe.scenario !== "A") {
    const missing = rhe?.scenario === "B" ? undefined : mergeRentalCarveoutMissingNotice(source, parsedRates.oneHouseSpecialRules.one_house_exemption);
    return missing ? { ...NONE, notices: [missing] } : undefined;
  }
  if (!source.isOneHousehold || source.isUnregistered) return undefined;

  const generalDate = resolveHouseCountExclusionDate(asset.buildingAcquisitionDate, asset.giftHouseholdBasis);
  const composition = resolveRentalResidenceComposition(source, parsedRates, generalDate);
  const unmet = resolvePrhpUnmet(source, composition);
  const roster = (source.houses ?? []).length > 0;
  const notices = rentalNoticesForEarlyReturn(source, unmet);

  if (unmet) {
    const reason = unmet.kind === "requirement" ? rentalUnmetReasonText(unmet.eligibility) : unmet.reason;
    const restore = rentalUnitsToRestore({
      effectiveInput: source,
      parsedRates,
      generalHouseAcquisitionDate: generalDate,
      judgeHouseCount: source.householdHousingCount,
      scenarios: ["A"],
    });
    const premise = restoreRentalUnitsToHouseCount(source, source, parsedRates, generalDate).notice;
    return {
      ...NONE,
      restoredUnits: restore?.units ?? 0,
      surchargeHouses: restore ? assembleSurchargeHouseSet(source, parsedRates, generalDate)?.rawHouses : undefined,
      notices: [
        `장기임대주택 거주주택 특례(${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20})를 적용하지 않았습니다 — ${reason}`,
        ...(premise ? [premise] : []),
        ...(composition.status === "exceeded" && composition.confirmNotice ? [composition.confirmNotice] : []),
        ...notices,
      ],
    };
  }

  const applied =
    `장기임대주택 ${rhe.rentalUnits.length}호를 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}에 따라 주택 수에서 빼고 겸용주택의 주택 부분을 거주주택으로 보아 ` +
    `1세대1주택 비과세 요건(${TRANSFER.ONE_HOUSE_REQUIREMENT})을 적용했습니다(${MIXED_USE.HOUSE_RANGE_154_3}).`;
  return {
    ...NONE,
    deemed: true,
    surchargeHouses: roster || composition.status !== "met" ? undefined : assembleSurchargeHouseSet(source, parsedRates, generalDate)?.rawHouses,
    notices: [applied, ...notices],
  };
}

/** 중과 판정 입력 — ⑳이 명부와 다른 주택 집합을 정하면 그 집합으로 판정한다(단건 `assembleSurchargeHouseSet`과 같은 값). */
export function withRentalResidenceSurchargeHouses(
  asset: MixedUseAssetInput,
  rental: MixedUseRentalResidence | undefined,
): MixedUseAssetInput["multiHouse"] {
  const houses = rental?.surchargeHouses;
  if (!houses || houses.length === 0) return asset.multiHouse;
  if (asset.multiHouse) return { ...asset.multiHouse, houses };
  const source = asset.rentalResidenceInput!;
  return {
    houses,
    sellingHouseId: "selling",
    presaleRights: source.presaleRights ?? [],
    isOneHousehold: source.isOneHousehold,
    isRegulatedArea: asset.surchargeFallback?.isRegulatedArea ?? false,
    marriageMerge: source.marriageMerge,
    parentalCareMerge: source.parentalCareMerge,
    gracePeriod: source.gracePeriod,
    unavoidableOutsideCapitalHouse: false,
  };
}
