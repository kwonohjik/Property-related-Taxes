/**
 * 양도소득세 감면 API 변환 (④) — §98 시리즈·§99의2 미분양주택 감면 조문별 변환
 *
 * `transfer-tax-api-reductions.ts`(755줄)의 `toEngineReductions` 안에 있던 미분양주택 계열
 * 분기 본문을 조문별 함수로 옮겼다 (800줄 정책 분리, 2026-11-08 · 동작 변경 없음 — 순수 이동).
 * 원본에는 `if (r.type === "…") return toUnsold…Payload(r);` 한 줄씩만 남기고, 분기 순서는 그대로다.
 *
 * | 함수 | 조문 |
 * |---|---|
 * | `toUnsold988Payload` | 조특법 §98의8 |
 * | `toUnsold98Payload` | 조특법 §98 |
 * | `toUnsold982Payload` · `toUnsold984Payload` | 조특법 §98의2 · §98의4 |
 * | `toUnsold983Payload` · `toUnsold985Payload` · `toUnsold986Payload` | 조특법 §98의3 · §98의5 · §98의6 |
 * | `toUnsold987Payload` · `toUnsold992Payload` | 조특법 §98의7 · §99의2 |
 * | `toUnsold989Payload` | 조특법 §98의9 |
 *
 * 각 함수의 인자는 판별 유니언으로 좁힌 그 조문의 폼 행이다 — 원본 분기 안에서 좁혀지던 타입과 같다.
 * 날짜는 string 그대로 전달 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
 */

import { parseAmount } from "@/lib/calc/number-parse";
import { parseDecimal } from "@/lib/calc/number-parse";
import { calcReductionAcquisitionStdPrice } from "@/lib/tax-engine/transfer-reductions";
import { canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-store";

// ── P1 §98의8 준공후미분양 50% (2026-06-11): 차감형 본 변환 (④) ──
export function toUnsold988Payload(r: Extract<AssetReductionForm, { type: "unsold_98_8" }>) {
  // 취득시 기준시가 — PHD 환산 ON이고 충분하면 §164⑦ 자동 산출(A설계, 환산값만 엔진 전달).
  const phdInput988 = {
    firstDisclosurePrice: r.phdFirstDisclosurePrice988 ? parseAmount(r.phdFirstDisclosurePrice988) : 0,
    landAreaSqm: r.phdLandAreaSqm988 ? parseFloat(r.phdLandAreaSqm988) : 0,
    landPricePerSqmAtAcquisition: r.phdLandPricePerSqmAtAcq988 ? parseAmount(r.phdLandPricePerSqmAtAcq988) : 0,
    landPricePerSqmAtFirstDisclosure: r.phdLandPricePerSqmAtFirst988 ? parseAmount(r.phdLandPricePerSqmAtFirst988) : 0,
    buildingStdPriceAtAcquisition: r.phdBuildingStdAtAcq988 ? parseAmount(r.phdBuildingStdAtAcq988) : 0,
    buildingStdPriceAtFirstDisclosure: r.phdBuildingStdAtFirst988 ? parseAmount(r.phdBuildingStdAtFirst988) : 0,
  };
  const acqStdPrice988 =
    r.phdMode988 && canCalcReductionPhd(phdInput988)
      ? calcReductionAcquisitionStdPrice(phdInput988).estimatedAcquisitionStdPrice
      : parseAmount(r.standardPriceAtAcquisition988 || "0");
  return {
    type: "unsold_98_8" as const,
    // D11-05 — 법 §98의8① 「거주자가 …」
    isResident988: r.isResident988,
    contractDate988: r.contractDate988 || undefined,
    acquisitionPrice988: parseAmount(r.acquisitionPrice988 || "0") || undefined,
    exclusiveAreaSqm988: parseDecimal(r.exclusiveAreaSqm988 || "") || undefined,
    rentalContractDate988: r.rentalContractDate988 || undefined,
    rentalStartDate988: r.rentalStartDate988 || undefined,
    rentalEndDate988: r.rentalEndDate988 || undefined,
    inheritedRentalMonths988: parseInt(r.inheritedRentalMonths988 || "") || undefined,
    isUnsoldAfterCompletion988: r.isUnsoldAfterCompletion988,
    isFirstContract988: r.isFirstContract988,
    isNotRecontract988: r.isNotRecontract988,
    standardPriceAtAcquisition988: acqStdPrice988 || undefined,
    standardPriceAt5Years988: parseAmount(r.standardPriceAt5Years988 || "0") || undefined,
    standardPriceAtTransfer988: parseAmount(r.standardPriceAtTransfer988 || "0") || undefined,
  };
}

// ── P5 §98 (2026-06-12): 본 변환 (④) ──
export function toUnsold98Payload(r: Extract<AssetReductionForm, { type: "unsold_98" }>) {
  return {
    type: "unsold_98" as const,
    // D11-05 — 법 §98① 「거주자가 …」. 적지 않으면 명시 매핑이라 조용히 사라진다.
    isResident98: r.isResident98,
    contractDate98: r.contractDate98 || undefined,
    isNationalScale98: r.isNationalScale98,
    isOutsideSeoul98: r.isOutsideSeoul98,
    isUnsoldConfirmed98: r.isUnsoldConfirmed98,
    isNotRentalHousing98: r.isNotRentalHousing98,
    isFirstBuyerNoOccupancy98: r.isFirstBuyerNoOccupancy98,
    rentedFor5Years98: r.rentedFor5Years98,
  };
}

// ── P4 §98의2·§98의4 (2026-06-12): 본 변환 (④) ──
export function toUnsold982Payload(r: Extract<AssetReductionForm, { type: "unsold_98_2" }>) {
  return {
    type: "unsold_98_2" as const,
    // D11-05 — 법 §98의2① 「거주자가 …」
    isResident982: r.isResident982,
    contractDate982: r.contractDate982 || undefined,
    isNonCapitalUnsold982: r.isNonCapitalUnsold982,
    isFirstOrFcfsContract982: r.isFirstOrFcfsContract982,
    // 미선택("") = 모름 — 엔진은 "no"만 적용한다(⑧도 미선택을 차단)
    occupiedAtContract982: r.occupiedAtContract982 || undefined,
  };
}

export function toUnsold984Payload(r: Extract<AssetReductionForm, { type: "unsold_98_4" }>) {
  return {
    type: "unsold_98_4" as const,
    contractDate984: r.contractDate984 || undefined,
    isNonResidentNoPe984: r.isNonResidentNoPe984,
    isNotUnsold983House984: r.isNotUnsold983House984,
  };
}

// ── P3 §98의3 (2026-06-12): 하이브리드 본 변환 (④) — houseType별 일자 strip ──
export function toUnsold983Payload(r: Extract<AssetReductionForm, { type: "unsold_98_3" }>) {
  const phdInput983 = {
    firstDisclosurePrice: r.phdFirstDisclosurePrice983 ? parseAmount(r.phdFirstDisclosurePrice983) : 0,
    landAreaSqm: r.phdLandAreaSqm983 ? parseFloat(r.phdLandAreaSqm983) : 0,
    landPricePerSqmAtAcquisition: r.phdLandPricePerSqmAtAcq983 ? parseAmount(r.phdLandPricePerSqmAtAcq983) : 0,
    landPricePerSqmAtFirstDisclosure: r.phdLandPricePerSqmAtFirst983 ? parseAmount(r.phdLandPricePerSqmAtFirst983) : 0,
    buildingStdPriceAtAcquisition: r.phdBuildingStdAtAcq983 ? parseAmount(r.phdBuildingStdAtAcq983) : 0,
    buildingStdPriceAtFirstDisclosure: r.phdBuildingStdAtFirst983 ? parseAmount(r.phdBuildingStdAtFirst983) : 0,
  };
  const acqStdPrice983 =
    r.phdMode983 && canCalcReductionPhd(phdInput983)
      ? calcReductionAcquisitionStdPrice(phdInput983).estimatedAcquisitionStdPrice
      : parseAmount(r.standardPriceAtAcquisition983 || "0");
  return {
    type: "unsold_98_3" as const,
    residencyType983: r.residencyType983,
    houseType983: r.houseType983,
    contractDate983:
      r.houseType983 !== "self_built" ? r.contractDate983 || undefined : undefined,
    constructionStartDate983:
      r.houseType983 === "self_built" ? r.constructionStartDate983 || undefined : undefined,
    usageApprovalDate983:
      r.houseType983 === "self_built" ? r.usageApprovalDate983 || undefined : undefined,
    isOutsideSeoulNotDesignated983: r.isOutsideSeoulNotDesignated983,
    isOverconcentration983: r.isOverconcentration983,
    landAreaSqm983: r.isOverconcentration983 ? parseDecimal(r.landAreaSqm983 || "") || undefined : undefined,
    floorAreaSqm983: r.isOverconcentration983 ? parseDecimal(r.floorAreaSqm983 || "") || undefined : undefined,
    isUnsoldConfirmed983: r.isUnsoldConfirmed983,
    isFirstContract983: r.isFirstContract983,
    isNotOccupiedAtContract983: r.isNotOccupiedAtContract983,
    isNotRecontract983: r.isNotRecontract983,
    isNotExcludedSelfBuilt983: r.isNotExcludedSelfBuilt983,
    standardPriceAtAcquisition983: acqStdPrice983 || undefined,
    standardPriceAt5Years983: parseAmount(r.standardPriceAt5Years983 || "0") || undefined,
    standardPriceAtTransfer983: parseAmount(r.standardPriceAtTransfer983 || "0") || undefined,
  };
}

// ── P3 §98의5 (2026-06-12): 하이브리드 본 변환 (④) ──
export function toUnsold985Payload(r: Extract<AssetReductionForm, { type: "unsold_98_5" }>) {
  const phdInput985 = {
    firstDisclosurePrice: r.phdFirstDisclosurePrice985 ? parseAmount(r.phdFirstDisclosurePrice985) : 0,
    landAreaSqm: r.phdLandAreaSqm985 ? parseFloat(r.phdLandAreaSqm985) : 0,
    landPricePerSqmAtAcquisition: r.phdLandPricePerSqmAtAcq985 ? parseAmount(r.phdLandPricePerSqmAtAcq985) : 0,
    landPricePerSqmAtFirstDisclosure: r.phdLandPricePerSqmAtFirst985 ? parseAmount(r.phdLandPricePerSqmAtFirst985) : 0,
    buildingStdPriceAtAcquisition: r.phdBuildingStdAtAcq985 ? parseAmount(r.phdBuildingStdAtAcq985) : 0,
    buildingStdPriceAtFirstDisclosure: r.phdBuildingStdAtFirst985 ? parseAmount(r.phdBuildingStdAtFirst985) : 0,
  };
  const acqStdPrice985 =
    r.phdMode985 && canCalcReductionPhd(phdInput985)
      ? calcReductionAcquisitionStdPrice(phdInput985).estimatedAcquisitionStdPrice
      : parseAmount(r.standardPriceAtAcquisition985 || "0");
  return {
    type: "unsold_98_5" as const,
    isEligibleSubject985: r.isEligibleSubject985,
    contractDate985: r.contractDate985 || undefined,
    /**
     * D5-02 — ⚠️ `|| undefined`는 **0을 undefined로 바꾼다**. 조특법 §98의5①1호가
     * 「인하율 100분의 10 **이하**」라 0%도 60% 감면 대상인데, 그 값이 여기서 사라지면
     * 엔진이 「미입력」으로 판정해 감면이 통째로 날아간다(엔진·⑧을 고쳐도 no-op).
     */
    priceReductionRatePct985:
      (r.priceReductionRatePct985 ?? "").trim() === ""
        ? undefined
        : parseDecimal(r.priceReductionRatePct985),
    isNonCapitalUnsoldAtCutoff985: r.isNonCapitalUnsoldAtCutoff985,
    isFirstContract985: r.isFirstContract985,
    isNotOccupiedAtContract985: r.isNotOccupiedAtContract985,
    isNotRecontract985: r.isNotRecontract985,
    standardPriceAtAcquisition985: acqStdPrice985 || undefined,
    standardPriceAt5Years985: parseAmount(r.standardPriceAt5Years985 || "0") || undefined,
    standardPriceAtTransfer985: parseAmount(r.standardPriceAtTransfer985 || "0") || undefined,
  };
}

// ── P3 §98의6 (2026-06-12): 하이브리드 본 변환 (④) — hoType별 임대 필드 strip ──
export function toUnsold986Payload(r: Extract<AssetReductionForm, { type: "unsold_98_6" }>) {
  const isBuyerRented = r.hoType986 === "buyer_rented";
  const phdInput986 = {
    firstDisclosurePrice: r.phdFirstDisclosurePrice986 ? parseAmount(r.phdFirstDisclosurePrice986) : 0,
    landAreaSqm: r.phdLandAreaSqm986 ? parseFloat(r.phdLandAreaSqm986) : 0,
    landPricePerSqmAtAcquisition: r.phdLandPricePerSqmAtAcq986 ? parseAmount(r.phdLandPricePerSqmAtAcq986) : 0,
    landPricePerSqmAtFirstDisclosure: r.phdLandPricePerSqmAtFirst986 ? parseAmount(r.phdLandPricePerSqmAtFirst986) : 0,
    buildingStdPriceAtAcquisition: r.phdBuildingStdAtAcq986 ? parseAmount(r.phdBuildingStdAtAcq986) : 0,
    buildingStdPriceAtFirstDisclosure: r.phdBuildingStdAtFirst986 ? parseAmount(r.phdBuildingStdAtFirst986) : 0,
  };
  const acqStdPrice986 =
    r.phdMode986 && canCalcReductionPhd(phdInput986)
      ? calcReductionAcquisitionStdPrice(phdInput986).estimatedAcquisitionStdPrice
      : parseAmount(r.standardPriceAtAcquisition986 || "0");
  return {
    type: "unsold_98_6" as const,
    isEligibleSubject986: r.isEligibleSubject986,
    hoType986: r.hoType986,
    stdPriceSumAtBase986: parseAmount(r.stdPriceSumAtBase986 || "0") || undefined,
    floorAreaSqm986: parseDecimal(r.floorAreaSqm986 || "") || undefined,
    isUnsoldAfterCompletion986: r.isUnsoldAfterCompletion986,
    isFirstContract986: r.isFirstContract986,
    isNotOccupiedAfterCompletion986: r.isNotOccupiedAfterCompletion986,
    isNotRecontract986: r.isNotRecontract986,
    sellerRented2Years986: isBuyerRented ? undefined : r.sellerRented2Years986,
    rentalContractDate986: isBuyerRented ? r.rentalContractDate986 || undefined : undefined,
    rentalStartDate986: isBuyerRented ? r.rentalStartDate986 || undefined : undefined,
    rentalEndDate986: isBuyerRented ? r.rentalEndDate986 || undefined : undefined,
    inheritedRentalMonths986: isBuyerRented ? parseInt(r.inheritedRentalMonths986 || "") || undefined : undefined,
    standardPriceAtAcquisition986: acqStdPrice986 || undefined,
    standardPriceAt5Years986: parseAmount(r.standardPriceAt5Years986 || "0") || undefined,
    standardPriceAtTransfer986: parseAmount(r.standardPriceAtTransfer986 || "0") || undefined,
  };
}

// ── P2 §98의7 9억↓ 미분양 (2026-06-11): 하이브리드 본 변환 (④) ──
export function toUnsold987Payload(r: Extract<AssetReductionForm, { type: "unsold_98_7" }>) {
  const phdInput987 = {
    firstDisclosurePrice: r.phdFirstDisclosurePrice987 ? parseAmount(r.phdFirstDisclosurePrice987) : 0,
    landAreaSqm: r.phdLandAreaSqm987 ? parseFloat(r.phdLandAreaSqm987) : 0,
    landPricePerSqmAtAcquisition: r.phdLandPricePerSqmAtAcq987 ? parseAmount(r.phdLandPricePerSqmAtAcq987) : 0,
    landPricePerSqmAtFirstDisclosure: r.phdLandPricePerSqmAtFirst987 ? parseAmount(r.phdLandPricePerSqmAtFirst987) : 0,
    buildingStdPriceAtAcquisition: r.phdBuildingStdAtAcq987 ? parseAmount(r.phdBuildingStdAtAcq987) : 0,
    buildingStdPriceAtFirstDisclosure: r.phdBuildingStdAtFirst987 ? parseAmount(r.phdBuildingStdAtFirst987) : 0,
  };
  const acqStdPrice987 =
    r.phdMode987 && canCalcReductionPhd(phdInput987)
      ? calcReductionAcquisitionStdPrice(phdInput987).estimatedAcquisitionStdPrice
      : parseAmount(r.standardPriceAtAcquisition987 || "0");
  return {
    type: "unsold_98_7" as const,
    // D11-05 — 법 §98의7① 「내국인이 …」 (조특법 §2①1호: 내국인 ⊃ 거주자)
    isDomestic987: r.isDomestic987,
    contractDate987: r.contractDate987 || undefined,
    acquisitionPrice987: parseAmount(r.acquisitionPrice987 || "0") || undefined,
    isUnsoldAtCutoff987: r.isUnsoldAtCutoff987,
    isFirstContract987: r.isFirstContract987,
    isNotOccupiedAtContract987: r.isNotOccupiedAtContract987,
    isNotRecontract987: r.isNotRecontract987,
    standardPriceAtAcquisition987: acqStdPrice987 || undefined,
    standardPriceAt5Years987: parseAmount(r.standardPriceAt5Years987 || "0") || undefined,
    standardPriceAtTransfer987: parseAmount(r.standardPriceAtTransfer987 || "0") || undefined,
  };
}

// ── P2 §99의2 신축·미분양·1세대1주택 (2026-06-11): 하이브리드 본 변환 (④) ──
// houseType별 비활성 분기 일자만 strip (UI 검토 #4 — 라디오 전환 잔존값 미전달)
export function toUnsold992Payload(r: Extract<AssetReductionForm, { type: "unsold_99_2" }>) {
  // 취득시 기준시가 — PHD 환산 ON이고 입력 충분하면 §164⑦ 자동 산출(source ternary, UI echo·validate 동일 소스).
  // 아니면 수동값. 엔진(hybrid)은 환산값(취득기준시가)만 수용(phd echo 필드 없음, A설계).
  const phdInput992 = {
    firstDisclosurePrice: r.phdFirstDisclosurePrice992 ? parseAmount(r.phdFirstDisclosurePrice992) : 0,
    landAreaSqm: r.phdLandAreaSqm992 ? parseFloat(r.phdLandAreaSqm992) : 0,
    landPricePerSqmAtAcquisition: r.phdLandPricePerSqmAtAcq992 ? parseAmount(r.phdLandPricePerSqmAtAcq992) : 0,
    landPricePerSqmAtFirstDisclosure: r.phdLandPricePerSqmAtFirst992 ? parseAmount(r.phdLandPricePerSqmAtFirst992) : 0,
    buildingStdPriceAtAcquisition: r.phdBuildingStdAtAcq992 ? parseAmount(r.phdBuildingStdAtAcq992) : 0,
    buildingStdPriceAtFirstDisclosure: r.phdBuildingStdAtFirst992 ? parseAmount(r.phdBuildingStdAtFirst992) : 0,
  };
  const acqStdPrice992 =
    r.phdMode992 && canCalcReductionPhd(phdInput992)
      ? calcReductionAcquisitionStdPrice(phdInput992).estimatedAcquisitionStdPrice
      : parseAmount(r.standardPriceAtAcquisition992 || "0");
  return {
    type: "unsold_99_2" as const,
    houseType992: r.houseType992,
    contractDate992:
      r.houseType992 !== "self_built" ? r.contractDate992 || undefined : undefined,
    usageApprovalDate992:
      r.houseType992 === "self_built" ? r.usageApprovalDate992 || undefined : undefined,
    acquisitionPrice992: parseAmount(r.acquisitionPrice992 || "0") || undefined,
    exclusiveAreaSqm992: parseDecimal(r.exclusiveAreaSqm992 || "") || undefined,
    meetsHouseTypeRequirement992: r.meetsHouseTypeRequirement992,
    isNotExcludedSelfBuilt992: r.isNotExcludedSelfBuilt992,
    meetsOneHouseSellerRequirement992: r.meetsOneHouseSellerRequirement992,
    isOfficetel992: r.isOfficetel992,
    meetsOfficetelRequirement992: r.meetsOfficetelRequirement992,
    isNotRecontract992: r.isNotRecontract992,
    hasConfirmationSeal992: r.hasConfirmationSeal992,
    standardPriceAtAcquisition992: acqStdPrice992 || undefined,
    standardPriceAt5Years992: parseAmount(r.standardPriceAt5Years992 || "0") || undefined,
    standardPriceAtTransfer992: parseAmount(r.standardPriceAtTransfer992 || "0") || undefined,
  };
}

// ── §98의9 수도권 밖 준공후미분양 (2026-06-11): 주택수 제외 본 변환 (④) ──
// 날짜는 string 그대로 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
export function toUnsold989Payload(r: Extract<AssetReductionForm, { type: "unsold_98_9" }>) {
  return {
    type: "unsold_98_9" as const,
    ...(r.houseId ? { houseId: r.houseId } : {}),
    unsoldHouseAcquisitionDate: r.unsoldHouseAcquisitionDate || undefined,
    unsoldHouseAcquisitionPrice: parseAmount(r.unsoldHouseAcquisitionPrice || "0") || undefined,
    unsoldHouseExclusiveArea: parseDecimal(r.unsoldHouseExclusiveArea || "") || undefined,
    isNonCapitalRegion: r.isNonCapitalRegion,
    wasOneHouseholdAtAcquisition: r.wasOneHouseholdAtAcquisition,
    meetsSellerAndContractRequirement: r.meetsSellerAndContractRequirement,
  };
}
