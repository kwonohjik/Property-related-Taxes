/**
 * transfer-route-multi-house.ts — 다주택 중과 입력의 Route handler Date 변환 헬퍼 (⑭)
 *
 * route.ts(800줄 정책)에서 분리. Zod 파싱 결과(string 날짜) → 엔진 input(Date) 변환.
 * date-coerce 헬퍼로 string→Date silent false 함정 차단.
 */

import type { z } from "zod";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import type { houseSchema, presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import type { aptDeadlineExtensionSchema } from "@/lib/api/transfer-tax-schema-apt-deadline";
import type { AptTransferDeadlineExtension } from "@/lib/tax-engine/rental-article/rules";
import type { HouseInfo, MultiHouseGracePeriodInput, PresaleRight } from "@/lib/tax-engine/multi-house-surcharge";
import type { SpecialHouseExclusionInput } from "@/lib/api/transfer-tax-schema";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { isOwnedAtTransfer } from "@/lib/calc/household-house-count";

type HouseInput = z.infer<typeof houseSchema>;
type PresaleRightInput = z.infer<typeof presaleRightSchema>;
type GracePeriodInput = {
  contractDate: string;
  isLandPermitTarget?: boolean;
  permitApplicationDate?: string;
  permitGranted?: boolean;
  depositReceiptConfirmed?: boolean;
  // @deprecated — G3(조건C 근거 없음)·G6(regionCode 명단 대체). 하위호환만.
  isLandPermitArea?: boolean;
  hasTenantInResidence?: boolean;
  areaDesignatedDate?: string;
};

/**
 * ⑭ §167의3⑪ 연장 사실 Zod → 엔진 `AptTransferDeadlineExtension` — 2호·3호(houses)·§155⑳ 임대주택(단건·다건)
 * 공용. 날짜는 date-coerce, `confirmedNone`(「연장 사유 없음」 확인)·3호 「이전고시 전」·단서 3-state는 그대로.
 * 미전송이면 undefined(= 모름).
 */
export function toEngineAptDeadlineExtension(
  e: z.infer<typeof aptDeadlineExtensionSchema> | undefined,
): AptTransferDeadlineExtension | undefined {
  if (!e) return undefined;
  return {
    dutyPeriodEndCancellationDate: toOptionalDate(e.dutyPeriodEndCancellationDate),
    newRegulatedAreaAnnouncementDate: toOptionalDate(e.newRegulatedAreaAnnouncementDate),
    relocationAnnouncementDate: toOptionalDate(e.relocationAnnouncementDate),
    relocationAuthorizationDate: toOptionalDate(e.relocationAuthorizationDate),
    relocationNotYetAnnounced: e.relocationNotYetAnnounced,
    relocationExpropriationTransfer: e.relocationExpropriationTransfer,
    confirmedNone: e.confirmedNone,
  };
}

/** Zod houses[] → 엔진 HouseInfo[] (신규 필드 Date 변환 포함) */
export function mapHousesToEngine(houses: HouseInput[] | undefined): HouseInfo[] | undefined {
  if (!houses) return undefined;
  return houses.map((h) => ({
    id: h.id,
    region: h.region,
    // ⑭ 법정동코드 — sellingHouse에 제공 시 엔진 isRegulatedByBjdCode() 정밀 판정 (string, Date 변환 불필요)
    regionCode: h.regionCode,
    inDesignatedDistrict: h.inDesignatedDistrict,
    acquisitionDate: new Date(h.acquisitionDate),
    officialPrice: h.officialPrice,
    isInherited: h.isInherited,
    isLongTermRental: h.isLongTermRental,
    isApartment: h.isApartment,
    isOfficetel: h.isOfficetel,
    isUnsoldHousing: h.isUnsoldHousing,
    // ⑬ 소형신축·준공후미분양 특례 (§167의3①12가·나목) — completionDate는 Date 변환
    acquisitionPrice: h.acquisitionPrice,
    exclusiveArea: h.exclusiveArea,
    isUnsoldNewHouse: h.isUnsoldNewHouse,
    completionDate: toOptionalDate(h.completionDate),
    isSpouseOwned: h.isSpouseOwned,
    spouseHeldAtTransfer: h.spouseHeldAtTransfer,
    // §155④⑤ 합가 전 보유 쪽 — enum pass-through(분류는 엔진 `classifyMergeHouse`가 날짜 우선으로)
    mergeOrigin: h.mergeOrigin,
    inheritedDate: toOptionalDate(h.inheritedDate),
    // §155③ 공동상속 (2-A2) — boolean pass-through
    isCoInherited: h.isCoInherited,
    isLargestCoInheritedShareholder: h.isLargestCoInheritedShareholder,
    // §155② 단서·1~4호 순위 게이트 — boolean pass-through
    decedentSameHouseholdAtInheritance: h.decedentSameHouseholdAtInheritance,
    parentalCareMergeInheritedHouse: h.parentalCareMergeInheritedHouse,
    reInheritedFromSeparateHousehold: h.reInheritedFromSeparateHousehold,
    inheritedGiftedToHouseholdMember: h.inheritedGiftedToHouseholdMember,
    isRankingDisqualifiedInheritedHouse: h.isRankingDisqualifiedInheritedHouse,
    isRegisteredRental: h.isRegisteredRental,
    rentalRegistrationDate: toOptionalDate(h.rentalRegistrationDate),
    businessRegistrationDate: toOptionalDate(h.businessRegistrationDate),
    rentalPeriodYears: h.rentalPeriodYears,
    rentalCancelledDate: toOptionalDate(h.rentalCancelledDate),
    rentalCancellationReason: h.rentalCancellationReason, // §167의3①2호 단서
    // ⑭ 장기임대 9유형 매트릭스 18필드 — 폼/Zod 이름(rentalLandArea·rentalTotalFloorArea) →
    // 엔진 HouseInfo 이름(landArea·totalFloorArea)으로 매핑. 날짜는 Date 변환. (누락 시 엔진 미도달=과다산정)
    rentalType: h.rentalType,
    rentIncreaseUnder5Pct: h.rentIncreaseUnder5Pct,
    rentIncreaseContractDate: toOptionalDate(h.rentIncreaseContractDate),
    isNationalSizeHousing: h.isNationalSizeHousing,
    hasMinimum2Units: h.hasMinimum2Units,
    hasMinimum5UnitsInCity: h.hasMinimum5UnitsInCity,
    landArea: h.rentalLandArea,
    totalFloorArea: h.rentalTotalFloorArea,
    isConvertedToSale: h.isConvertedToSale,
    firstSaleContractDate: toOptionalDate(h.firstSaleContractDate),
    acquisitionOfficialPrice: h.acquisitionOfficialPrice,
    rentalStartOfficialPrice: h.rentalStartOfficialPrice,
    hasHalfDutyPeriodMet: h.hasHalfDutyPeriodMet,
    isSoldWithin1YearOfCancellation: h.isSoldWithin1YearOfCancellation,
    rentalCancellationDate: toOptionalDate(h.rentalCancellationDate),
    saMokBaseArticle: h.saMokBaseArticle,
    isExcluded918Rule: h.isExcluded918Rule,
    isExcludedAfter20200711Apt: h.isExcludedAfter20200711Apt,
    isExcludedShortToLongChange: h.isExcludedShortToLongChange,
    hasContractDepositProof: h.hasContractDepositProof,
    // ⑭ §167의3⑪ 연장 사실(2호 가·나·라·마목 아파트) — 날짜 Date 변환 + 「연장 사유 없음」 확인
    rentalAptDeadlineExtension: toEngineAptDeadlineExtension(h.rentalAptDeadlineExtension),
    // ⑭ 소령 §167의3①3호 감면대상장기임대주택 + 후단 4사실 — ⑪ 연장 기산일 3종은 Date 변환(date-coerce).
    isTaxIncentiveRental: h.isTaxIncentiveRental,
    isTaxIncentiveRentalPurchase: h.isTaxIncentiveRentalPurchase,
    taxIncentiveRentalRegistrationType: h.taxIncentiveRentalRegistrationType,
    isUrbanLifeHousingApartment: h.isUrbanLifeHousingApartment,
    taxIncentiveRentalAptDeadlineExtension: toEngineAptDeadlineExtension(h.taxIncentiveRentalAptDeadlineExtension),
    // P2 특수 배제 (other-house 2주택·인구감소) — 날짜 Date 변환
    isUnavoidableReason: h.isUnavoidableReason,
    unavoidableResidenceYears: h.unavoidableResidenceYears,
    unavoidableReasonResolvedDate: toOptionalDate(h.unavoidableReasonResolvedDate),
    unavoidableReasonUnresolved: h.unavoidableReasonUnresolved,
    isLitigationHousing: h.isLitigationHousing,
    litigationAcquisitionDate: toOptionalDate(h.litigationAcquisitionDate),
    litigationPending: h.litigationPending,
    isRedevelopmentZone: h.isRedevelopmentZone,
    isPopulationDeclineArea: h.isPopulationDeclineArea,
    isSecondHomeRegistered: h.isSecondHomeRegistered,
    populationAreaType: h.populationAreaType,
    // 조특법 §71의2① 인구감소지역주택(결정 #42) — 날짜는 Date 변환. 단건·다건·겸용이 이 매퍼를 공유한다.
    popDeclSoleAtAcquisition: h.popDeclSoleAtAcquisition,
    popDeclAcquiredByGift: h.popDeclAcquiredByGift,
    popDeclDonorHousehold: h.popDeclDonorHousehold,
    popDeclPriorRight: h.popDeclPriorRight,
    popDeclPriorRightDate: toOptionalDate(h.popDeclPriorRightDate),
    // P2 특수 배제 (selling-house 3주택+)
    isMortgageExecution: h.isMortgageExecution,
    isEmployeeHousing: h.isEmployeeHousing,
    freeProvisionYears: h.freeProvisionYears,
    isTaxSpecialExemption: h.isTaxSpecialExemption,
    isCulturalHeritage: h.isCulturalHeritage,
    isUnavoidableOutsideCapital: h.isUnavoidableOutsideCapital,
    isDayCareCenter: h.isDayCareCenter,
    dayCareOperationYears: h.dayCareOperationYears,
    // ⑭ 공고 전 매매계약(영 §167의10①11호 등) — 양도 계약일 Date 변환 + 계약금 수령. 단건·다건·겸용 공유 매퍼.
    contractDate: toOptionalDate(h.contractDate),
    saleDepositReceived: h.saleDepositReceived,
  }));
}

/**
 * 세대 보유 분양권·입주권을 **양도일 현재 보유분**과 **같은 날 취득분**으로 나눈다 (코드 리뷰 결정 #1).
 *
 * 양도일 당일·이후에 취득한 권리는 「양도일 현재 보유」가 아니다 — 주택 명부의 D2(`isOwnedAtTransfer`)와 **같은 단일 술어**를
 * 쓴다(§89①4호 가목은 「다른 주택 또는 분양권」을 한 문장으로 묻는다). 양도일 다음 날 이후 취득분은 어디에도 싣지 않고,
 * 같은 날 취득분만 따로 돌려준다 — 판정에는 쓰지 않고 「같은 날 권리를 보유로 세면 결론이 달라지는가」를 다시 판정해
 * 확인 필요를 고지하는 데만 쓴다(`one-house/same-day-right.ts`). 양도일이 없거나 형식이 아니면 모두 보유분이다(`isOwnedAtTransfer`).
 */
export function splitPresaleRightsAtTransfer<T extends { acquisitionDate: string }>(
  rights: readonly T[] | undefined,
  transferDate: string | undefined,
): { held: T[]; sameDay: T[] } {
  const held: T[] = [];
  const sameDay: T[] = [];
  for (const r of rights ?? []) {
    if (isOwnedAtTransfer(r.acquisitionDate, transferDate)) held.push(r);
    else if (r.acquisitionDate === transferDate) sameDay.push(r);
  }
  return { held, sameDay };
}

/**
 * 입력한 권리가 **모두** 양도일(같은 날 포함) 이후 취득분이면 「없음」 확인을 다시 요구하지 않는다 — 사용자가 사실(목록)을 이미
 * 제공했다(`oneRightPresaleGate`가 목록이 빌 때만 확인 플래그를 본다 · `project_89_2_104_7_empty_rights_is_none`의 #1992는 그대로).
 * 목록이 아예 비어 있으면 원래 확인값을 그대로 돌려준다.
 */
export function householdNoPresaleRightsConfirmedAtTransfer(
  rights: readonly { acquisitionDate: string }[] | undefined,
  transferDate: string | undefined,
  confirmed: boolean | undefined,
): boolean | undefined {
  if ((rights?.length ?? 0) > 0 && splitPresaleRightsAtTransfer(rights, transferDate).held.length === 0) return true;
  return confirmed;
}

function toEnginePresaleRight(r: PresaleRightInput): PresaleRight {
  return {
    id: r.id,
    type: r.type,
    acquisitionDate: new Date(r.acquisitionDate),
    region: r.region,
    regionCriteria: r.regionCriteria,
    rightValue: r.rightValue,
    isSpouseOwned: r.isSpouseOwned,
    spouseHeldAtTransfer: r.spouseHeldAtTransfer,
    regionCode: r.regionCode,
    inDesignatedDistrict: r.inDesignatedDistrict,
    // ⑭ 인가일 — `Date < string` 침묵 false 방지(date-coerce 규약). 미입력은 undefined 유지.
    managementDisposalApprovalDate: r.managementDisposalApprovalDate
      ? new Date(r.managementDisposalApprovalDate)
      : undefined,
    memberOrigin: r.memberOrigin,
    originalMemberMoveInDate: toOptionalDate(r.originalMemberMoveInDate),
    originalMemberTenantLeaseEndDate: toOptionalDate(r.originalMemberTenantLeaseEndDate),
    originalMemberDisposalDelayReason: r.originalMemberDisposalDelayReason,
    originalMemberDisposalDelayDisposedByThatMethod: r.originalMemberDisposalDelayDisposedByThatMethod,
    isInherited: r.isInherited,
    isRankingDisqualifiedInheritedRight: r.isRankingDisqualifiedInheritedRight,
    isCoInherited: r.isCoInherited,
    isLargestCoInheritedShareholder: r.isLargestCoInheritedShareholder,
    decedentOwnedHouseAtDeath: r.decedentOwnedHouseAtDeath,
    decedentOwnedOtherRightTypeAtDeath: r.decedentOwnedOtherRightTypeAtDeath,
    decedentSameHouseholdAtInheritance: r.decedentSameHouseholdAtInheritance,
    parentalCareMergeInheritedRight: r.parentalCareMergeInheritedRight,
    decedentAcquisitionDate: toOptionalDate(r.decedentAcquisitionDate),
    inheritedDate: toOptionalDate(r.inheritedDate),
  };
}

/**
 * Zod presaleRights → 엔진 PresaleRight[] (취득일 string→Date) — **양도일 현재 보유분만** (`splitPresaleRightsAtTransfer`).
 * 양도일은 필수 인자다 — 빠뜨린 호출부를 컴파일러가 찾는다.
 */
export function mapPresaleRightsToEngine(
  rights: PresaleRightInput[] | undefined,
  transferDate: string | undefined,
): PresaleRight[] | undefined {
  if (!rights) return undefined;
  return splitPresaleRightsAtTransfer(rights, transferDate).held.map(toEnginePresaleRight);
}

/** 양도일과 같은 날 취득한 권리 → 엔진 (`TransferTaxInput.sameDayAcquiredPresaleRights`). 없으면 `undefined`. */
export function mapSameDayPresaleRightsToEngine(
  rights: PresaleRightInput[] | undefined,
  transferDate: string | undefined,
): PresaleRight[] | undefined {
  const { sameDay } = splitPresaleRightsAtTransfer(rights, transferDate);
  return sameDay.length > 0 ? sameDay.map(toEnginePresaleRight) : undefined;
}

/** Zod gracePeriod → 엔진 MultiHouseGracePeriodInput (string→Date) */
export function mapGracePeriodToEngine(
  gp: GracePeriodInput | undefined,
): MultiHouseGracePeriodInput | undefined {
  if (!gp) return undefined;
  return {
    contractDate: toDate(gp.contractDate, "gracePeriod.contractDate"),
    isLandPermitTarget: gp.isLandPermitTarget,
    permitApplicationDate: toOptionalDate(gp.permitApplicationDate),
    permitGranted: gp.permitGranted,
    depositReceiptConfirmed: gp.depositReceiptConfirmed,
    // @deprecated pass-through — 엔진 판정 미사용(G3·G6)
    isLandPermitArea: gp.isLandPermitArea,
    hasTenantInResidence: gp.hasTenantInResidence,
    areaDesignatedDate: toOptionalDate(gp.areaDesignatedDate),
  };
}

/**
 * ⑭ 보유 감면주택 주택수 제외(P5 모드 2) — Zod(string 일자) → 엔진(Date). **단건·다건 공용**.
 *
 * 🔴 종전에는 단건(`engine-input.ts`)과 다건(`multi/route.ts`)이 같은 매핑을 각자 적었고, 다건 ⑬이 값을 싣지 않아
 *    다건 쪽은 늘 빈 배열을 매핑했다(계획서 `one-house-exemption-fix.plan.md` §9.8 Q4). 키를 늘리면 여기 한 곳이다.
 */
export function mapSpecialHouseExclusionsToEngine(
  list: SpecialHouseExclusionInput[] | undefined,
): NonNullable<TransferTaxInput["specialHouseExclusions"]> {
  return (list ?? []).map((e) => ({
    article: e.article,
    ...(e.houseId ? { houseId: e.houseId } : {}),
    houseAcquisitionDate: toOptionalDate(e.houseAcquisitionDate),
    houseContractDate: toOptionalDate(e.houseContractDate),
    isNationalHousing: e.isNationalHousing,
    houseRentalStartDate: toOptionalDate(e.houseRentalStartDate),
    requirementsConfirmed: e.requirementsConfirmed,
  }));
}
