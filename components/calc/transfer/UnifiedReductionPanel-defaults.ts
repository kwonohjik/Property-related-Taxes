/**
 * UnifiedReductionPanel — 순수 기본값·토글 헬퍼 (800줄 정책 분리, 2026-06-11)
 *
 * 상태 무의존 순수 함수/상수만 보유. 패널 본체에서 import.
 */

import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import {
  REDUCTION_METADATA,
  type TransferReductionId,
  type ReductionCategory,
} from "@/lib/tax-engine/transfer-reductions";

export type StandaloneReductionType =
  | "self_farming"
  | "public_expropriation"
  | "gb_designated_land"
  | "replacement_land_comp";

export const STANDALONE_LABELS: Record<StandaloneReductionType, { label: string; desc: string }> = {
  self_farming: { label: "자경농지 감면 (§69)", desc: "8년 이상 자경 (한도 1억)" },
  public_expropriation: { label: "공익사업 수용 감면 (§77)", desc: "현금 15% / 채권 20~45% (2025+ · 연간 2억)" },
  gb_designated_land: { label: "개발제한구역 매수 토지 감면 (§77의3)", desc: "40%(지정일 前+거주) / 25%(20년 前+거주) · 연간 2억" },
  replacement_land_comp: { label: "대토보상 과세특례 (§77의2)", desc: "대토보상분 40% 세액감면 · 2026.12.31까지 · 연간 2억" },
};

export function getStandaloneDefault(type: StandaloneReductionType): AssetReductionForm {
  if (type === "self_farming") {
    return { type: "self_farming", farmingYears: "0" };
  }
  if (type === "gb_designated_land") {
    return {
      type: "gb_designated_land",
      gbBranch: "in_zone",
      // 3-state 미선택 — §17(토지만)과 §20(토지등)은 대상 범위가 달라 어느 쪽도 안전한 기본값이 아니다.
      gbPurchaseRoute: "",
      gbDesignationDate: "",
      gbTriggerDate: "",
      gbReleasedDate: "",
      gbFreeEconZone: false,
      gbResided: false,
    };
  }
  if (type === "replacement_land_comp") {
    return {
      type: "replacement_land_comp",
      rlCashComp: "0",
      rlLandComp: "0",
    };
  }
  return {
    type: "public_expropriation",
    expropriationCash: "0",
    expropriationBond: "0",
    expropriationBondHoldingYears: "none",
    expropriationApprovalDate: "",
  };
}

/**
 * Legacy ID(자동변환 마이그레이션 전 또는 1개월 alias 기간) → 카테고리 매핑.
 * REDUCTION_METADATA에 등록되지 않은 legacy ID도 같은 카테고리 라디오 동작 시 제거되도록.
 * 사용자 결정사항 #4 (legacy 1개월 alias) 정책 준수.
 */
const LEGACY_TO_CATEGORY: Record<string, ReductionCategory> = {
  long_term_rental: "rental",
  new_housing: "new_housing",
  unsold_housing: "unsold_housing",
};

export function toggleGroupRadio(
  reductions: AssetReductionForm[],
  category: ReductionCategory,
  newId: TransferReductionId,
  alreadySelected: boolean,
): AssetReductionForm[] {
  // 1. 같은 카테고리 기존 선택 제거 (라디오 동작) — legacy ID도 포함
  const others = reductions.filter((r) => {
    const meta = REDUCTION_METADATA[r.type as TransferReductionId];
    const cat = meta?.category ?? LEGACY_TO_CATEGORY[r.type];
    return cat !== category;
  });

  // 2. 같은 항목 재클릭 시 해제 (사용자 결정사항 #5)
  if (alreadySelected) return others;

  // 3. 신규 선택 추가
  return [...others, getReductionDefault(newId)];
}

/** §97 시리즈 공통 기본값 (3-state 초기값 준수: rentIncreaseViolationMode="" / hasVacancyOverGrace=null) */
const RENTAL_COMMON_DEFAULTS = {
  registrationDate: "",
  isTaxRegistered: false,
  rentalStartDate: "",
  rentIncreaseViolationMode: "" as const,
  rentHistory: [],
  hasVacancyOverGrace: null,
  // D2-06 — 3-state. 미입력을 「계속 임대」로 읽지 않는다.
  rentalContinuesToTransfer: null,
  stdPriceAtRentalEnd: "",
  vacancyPeriods: [],
};

export function getReductionDefault(id: TransferReductionId): AssetReductionForm {
  if (id === "new_99_3") {
    return {
      type: "new_99_3",
      contractDate993: "",
      usageApprovalDate993: "",
      standardPriceAt5Years: "",
      standardPriceAtAcquisition993: "",
      standardPriceAtTransfer993: "",
      isRecontractExcluded993: false,
      recontractUnavoidableCause993: false,
      isRedevelopedNewHouse993: false,
      previousHouseStdPrice993: "",
      exclusiveAreaSqm993: "",
      region993: "outside_speculation",
      acquisitionType993: "from_builder",
      hasOccupancyAtContract: false,
      isResident993: true,
      isHousingConstructionBusiness993: false,
    };
  }
  // ── §97 시리즈 기본값 (Phase 2, 2026-06-11) ──
  if (id === "rental_97_3") {
    return {
      type: "rental_97_3",
      ...RENTAL_COMMON_DEFAULTS,
      rentalHousingType: "long_term_private",
      propertyType: "non_apartment",
      region: "capital",
      officialPriceAtStart: "",
      isNationalHousingScale: false,
      isConvertedFromShortTerm: false,
    };
  }
  if (id === "rental_97_4") {
    return {
      type: "rental_97_4",
      ...RENTAL_COMMON_DEFAULTS,
      region: "capital",
      officialPriceAtStart: "",
      rental974Category: "",
    };
  }
  if (id === "rental_97_5") {
    return {
      type: "rental_97_5",
      ...RENTAL_COMMON_DEFAULTS,
      officialPriceAtStart: "",
      region: "capital",
    };
  }
  if (id === "rental_97_main") {
    return {
      type: "rental_97_main",
      ...RENTAL_COMMON_DEFAULTS,
      // D1-06·D1-07 — 3-state. 미입력을 충족으로 읽지 않는다.
      isMultiUnitHousing: null,
      isUnoccupiedAt1986: null,
      isUnoccupiedAtAcquisition: null,
      constructionYear: "",
      isNationalHousing: false,
      // 3-state — 미입력을 「충족」으로 읽지 않는다 (조특령 §97①)
      hasMin5RentalUnits: null,
      belowMin5UnitsPeriods: [],
    };
  }
  if (id === "rental_97_proviso") {
    return {
      type: "rental_97_proviso",
      ...RENTAL_COMMON_DEFAULTS,
      // D1-06·D1-07 — 3-state. 미입력을 충족으로 읽지 않는다.
      isMultiUnitHousing: null,
      isUnoccupiedAt1986: null,
      isUnoccupiedAtAcquisition: null,
      constructionYear: "",
      isNationalHousing: false,
      provisoCase: undefined,
      hasMin5RentalUnits: null,
      belowMin5UnitsPeriods: [],
    };
  }
  if (id === "rental_97_2") {
    return {
      type: "rental_97_2",
      ...RENTAL_COMMON_DEFAULTS,
      rental972Type: "",
      isNationalHousing: false,
      // §97의2는 「신축 1호 포함 2호 이상」 — §97의 5호와 다른 요건이라 필드를 나눈다
      hasNewRentalPlus2Units: null,
      isUnoccupiedAtAcquisition: null, // D1-07 — §97의2①2호
    };
  }
  // §99의4 농어촌·고향주택 (2026-06-11)
  if (id === "new_99_4_rural") {
    return {
      type: "new_99_4_rural",
      ruralHouseAcquisitionDate: "",
      ruralHouseStdPrice: "",
      isRegisteredHanok: false,
      isAdjacentArea: false,
      meetsLocationRequirement: false,
    };
  }
  if (id === "new_99_4_hometown") {
    return {
      type: "new_99_4_hometown",
      ruralHouseAcquisitionDate: "",
      ruralHouseStdPrice: "",
      isRegisteredHanok: false,
      isAdjacentArea: false,
      meetsLocationRequirement: false,
      meetsHometownRequirement: false,
    };
  }
  // P1 (2026-06-11): §99 신축주택 IMF 1차 — 차감형
  if (id === "new_99") {
    return {
      type: "new_99",
      contractDate99: "",
      usageApprovalDate99: "",
      acquisitionType99: "from_builder",
      isNationalHousing99: false,
      standardPriceAtAcquisition99: "",
      standardPriceAt5Years99: "",
      standardPriceAtTransfer99: "",
      exclusiveAreaSqm99: "",
      hasOccupancyAtContract99: false,
      isRecontractExcluded99: false,
      recontractUnavoidableCause99: false,
      isRedevelopedNewHouse99: false,
      previousHouseStdPrice99: "",
    };
  }
  // P1 (2026-06-11): §98의8 준공후미분양 50% — 차감형
  if (id === "unsold_98_8") {
    return {
      type: "unsold_98_8",
      contractDate988: "",
      acquisitionPrice988: "",
      exclusiveAreaSqm988: "",
      rentalStartDate988: "",
      rentalEndDate988: "",
      inheritedRentalMonths988: "",
      isUnsoldAfterCompletion988: false,
      isFirstContract988: false,
      isNotRecontract988: false,
      standardPriceAtAcquisition988: "",
      standardPriceAt5Years988: "",
      standardPriceAtTransfer988: "",
    };
  }
  // P5 (2026-06-12): §98
  if (id === "unsold_98") {
    return {
      type: "unsold_98",
      contractDate98: "",
      isNationalScale98: false,
      isOutsideSeoul98: false,
      isUnsoldConfirmed98: false,
      isFirstBuyerNoOccupancy98: false,
      rentedFor5Years98: false,
    };
  }
  // P4 (2026-06-12): §98의2 / §98의4
  if (id === "unsold_98_2") {
    return {
      type: "unsold_98_2",
      contractDate982: "",
      isNonCapitalUnsold982: false,
      isFirstOrFcfsContract982: false,
    };
  }
  if (id === "unsold_98_4") {
    return {
      type: "unsold_98_4",
      contractDate984: "",
      isNonResidentNoPe984: false,
      isNotUnsold983House984: false,
    };
  }
  // P3 (2026-06-12): §98의3 / §98의5 / §98의6 — 하이브리드
  if (id === "unsold_98_3") {
    return {
      type: "unsold_98_3",
      residencyType983: "resident",
      houseType983: "purchased",
      contractDate983: "",
      constructionStartDate983: "",
      usageApprovalDate983: "",
      isOutsideSeoulNotDesignated983: false,
      isOverconcentration983: false,
      landAreaSqm983: "",
      floorAreaSqm983: "",
      isUnsoldConfirmed983: false,
      isFirstContract983: false,
      isNotOccupiedAtContract983: false,
      isNotRecontract983: false,
      isNotExcludedSelfBuilt983: false,
      standardPriceAtAcquisition983: "",
      standardPriceAt5Years983: "",
      standardPriceAtTransfer983: "",
    };
  }
  if (id === "unsold_98_5") {
    return {
      type: "unsold_98_5",
      contractDate985: "",
      priceReductionRatePct985: "",
      isNonCapitalUnsoldAtCutoff985: false,
      isFirstContract985: false,
      isNotOccupiedAtContract985: false,
      isNotRecontract985: false,
      standardPriceAtAcquisition985: "",
      standardPriceAt5Years985: "",
      standardPriceAtTransfer985: "",
    };
  }
  if (id === "unsold_98_6") {
    return {
      type: "unsold_98_6",
      hoType986: "seller_rented",
      contractDate986: "",
      stdPriceSumAtBase986: "",
      floorAreaSqm986: "",
      isUnsoldAfterCompletion986: false,
      isFirstContract986: false,
      isNotOccupiedAfterCompletion986: false,
      isNotRecontract986: false,
      sellerRented2Years986: false,
      rentalContractDate986: "",
      rentalStartDate986: "",
      rentalEndDate986: "",
      inheritedRentalMonths986: "",
      standardPriceAtAcquisition986: "",
      standardPriceAt5Years986: "",
      standardPriceAtTransfer986: "",
    };
  }
  // P2 (2026-06-11): §98의7 9억↓ 미분양 — 하이브리드
  if (id === "unsold_98_7") {
    return {
      type: "unsold_98_7",
      contractDate987: "",
      acquisitionPrice987: "",
      isUnsoldAtCutoff987: false,
      isFirstContract987: false,
      isNotOccupiedAtContract987: false,
      isNotRecontract987: false,
      standardPriceAtAcquisition987: "",
      standardPriceAt5Years987: "",
      standardPriceAtTransfer987: "",
    };
  }
  // P2 (2026-06-11): §99의2 신축·미분양·1세대1주택 — 하이브리드
  if (id === "unsold_99_2") {
    return {
      type: "unsold_99_2",
      houseType992: "new_or_unsold",
      contractDate992: "",
      usageApprovalDate992: "",
      acquisitionPrice992: "",
      exclusiveAreaSqm992: "",
      meetsHouseTypeRequirement992: false,
      isNotExcludedSelfBuilt992: false,
      meetsOneHouseSellerRequirement992: false,
      isOfficetel992: false,
      meetsOfficetelRequirement992: false,
      isNotRecontract992: false,
      hasConfirmationSeal992: false,
      standardPriceAtAcquisition992: "",
      standardPriceAt5Years992: "",
      standardPriceAtTransfer992: "",
    };
  }
  // §98의9 수도권 밖 준공후미분양 (2026-06-11)
  if (id === "unsold_98_9") {
    return {
      type: "unsold_98_9",
      unsoldHouseAcquisitionDate: "",
      unsoldHouseAcquisitionPrice: "",
      unsoldHouseExclusiveArea: "",
      isNonCapitalRegion: false,
      wasOneHouseholdAtAcquisition: false,
      meetsSellerAndContractRequirement: false,
    };
  }
  // Phase 1 stub: type만 (실제로 활성 클릭 불가하므로 도달하지 않음)
  return { type: id } as AssetReductionForm;
}
