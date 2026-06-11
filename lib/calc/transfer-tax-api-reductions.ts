/**
 * 양도소득세 감면 API 변환 (④) — toEngineReductions
 * transfer-tax-api-helpers.ts 800줄 정책 분리 (P1, 2026-06-11).
 * 날짜는 string 그대로 전달 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";

/** AssetReductionForm[] → 엔진 reductions payload 변환 */
export function toEngineReductions(
  formReductions: AssetReductionForm[],
  acquisitionCause: AssetForm["acquisitionCause"],
) {
  return formReductions.map((r) => {
    if (r.type === "self_farming") {
      const decedentYears = parseInt(r.decedentFarmingYears ?? "0") || 0;
      const incorpDate = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationDate ?? "") : "";
      const incorpZone = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationZone ?? "") : "";
      const incorpStdPrice = r.useSelfFarmingIncorporation
        ? parseAmount(r.selfFarmingStandardPriceAtIncorporation ?? "")
        : 0;
      return {
        type: "self_farming" as const,
        farmingYears: parseInt(r.farmingYears) || 0,
        ...(acquisitionCause === "inheritance" && decedentYears > 0
          ? { decedentFarmingYears: decedentYears }
          : {}),
        ...(incorpDate ? { incorporationDate: incorpDate } : {}),
        ...(incorpZone ? { incorporationZoneType: incorpZone } : {}),
        ...(incorpStdPrice > 0 ? { standardPriceAtIncorporation: incorpStdPrice } : {}),
      };
    }
    if (r.type === "long_term_rental") {
      return {
        type: "long_term_rental" as const,
        rentalYears: parseInt(r.rentalYears) || 0,
        rentIncreaseRate: parseFloat(r.rentIncreaseRate) / 100,
      };
    }
    if (r.type === "new_housing") {
      const region =
        r.reductionRegion === "outside_overconcentration"
          ? "metropolitan"
          : (r.reductionRegion as "metropolitan" | "non_metropolitan");
      return { type: "new_housing" as const, region };
    }
    if (r.type === "unsold_housing") {
      const region =
        r.reductionRegion === "outside_overconcentration"
          ? "metropolitan"
          : (r.reductionRegion as "metropolitan" | "non_metropolitan");
      return { type: "unsold_housing" as const, region };
    }
    if (r.type === "public_expropriation") {
      const cash = parseAmount(r.expropriationCash || "0");
      const bond = parseAmount(r.expropriationBond || "0");
      const bondHoldingYears =
        r.expropriationBondHoldingYears === "3"
          ? 3
          : r.expropriationBondHoldingYears === "5"
            ? 5
            : null;
      return {
        type: "public_expropriation" as const,
        cashCompensation: cash,
        bondCompensation: bond,
        bondHoldingYears,
        businessApprovalDate: r.expropriationApprovalDate,
      };
    }
    // ── Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본격 변환 ──
    if (r.type === "new_99_3") {
      return {
        type: "new_99_3" as const,
        contractDate993: r.contractDate993 || undefined,
        usageApprovalDate993: r.usageApprovalDate993 || undefined,
        standardPriceAt5Years: parseAmount(r.standardPriceAt5Years || "0"),
        standardPriceAtAcquisition993: parseAmount(r.standardPriceAtAcquisition993 || "0"),
        standardPriceAtTransfer993: r.standardPriceAtTransfer993
          ? parseAmount(r.standardPriceAtTransfer993)
          : undefined,
        region993: r.region993,
        acquisitionType993: r.acquisitionType993,
        hasOccupancyAtContract: r.hasOccupancyAtContract ?? false,
        isResident993: r.isResident993,
        isHousingConstructionBusiness993: r.isHousingConstructionBusiness993,
        // Round 10 (2026-05-06): PHD 환산 입력 (취득시 추정 공동주택가격 자동 산출)
        phdMode993: r.phdMode993 ?? false,
        phdFirstDisclosureDate993: r.phdFirstDisclosureDate993 || undefined,
        phdFirstDisclosurePrice993: r.phdFirstDisclosurePrice993
          ? parseAmount(r.phdFirstDisclosurePrice993)
          : undefined,
        phdLandAreaSqm993: r.phdLandAreaSqm993 ? parseFloat(r.phdLandAreaSqm993) : undefined,
        phdLandPricePerSqmAtAcq993: r.phdLandPricePerSqmAtAcq993
          ? parseAmount(r.phdLandPricePerSqmAtAcq993)
          : undefined,
        phdLandPricePerSqmAtFirst993: r.phdLandPricePerSqmAtFirst993
          ? parseAmount(r.phdLandPricePerSqmAtFirst993)
          : undefined,
        phdBuildingStdAtAcq993: r.phdBuildingStdAtAcq993
          ? parseAmount(r.phdBuildingStdAtAcq993)
          : undefined,
        phdBuildingStdAtFirst993: r.phdBuildingStdAtFirst993
          ? parseAmount(r.phdBuildingStdAtFirst993)
          : undefined,
      };
    }
    // ── Phase 2 (2026-06-11): 장기임대 §97 시리즈 본격 변환 ──
    // 명명 통일(E5): registrationDate — 폼·Zod·Route·엔진 동일 키. 날짜는 string 그대로
    // 전달하고 Route handler(⑭)에서 Date 변환 (date-coerce).
    if (
      r.type === "rental_97_3" ||
      r.type === "rental_97_4" ||
      r.type === "rental_97_5" ||
      r.type === "rental_97_main" ||
      r.type === "rental_97_proviso" ||
      r.type === "rental_97_2"
    ) {
      const common = {
        registrationDate: r.registrationDate || undefined,
        rentalStartDate: r.rentalStartDate || undefined,
        isTaxRegistered: r.isTaxRegistered,
        // 간소화 모드: "none" → false / "has_violation" → true. 미선택("")은 validate(⑧)에서 차단.
        rentIncreaseViolated: r.rentIncreaseViolationMode === "has_violation",
        rentHistory:
          r.rentIncreaseViolationMode === "has_violation" && r.rentHistory && r.rentHistory.length >= 2
            ? r.rentHistory.map((h) => ({
                contractDate: h.contractDate,
                contractType: h.contractType,
                monthlyRent: parseAmount(h.monthlyRent || "0"),
                deposit: parseAmount(h.deposit || "0"),
              }))
            : undefined,
        vacancyPeriods:
          r.hasVacancyOver6Months === true && r.vacancyPeriods && r.vacancyPeriods.length > 0
            ? r.vacancyPeriods.map((v) => ({ startDate: v.startDate, endDate: v.endDate }))
            : undefined,
      };
      if (r.type === "rental_97_3") {
        return {
          type: "rental_97_3" as const,
          ...common,
          officialPriceAtStart: parseAmount(r.officialPriceAtStart || "0") || undefined,
          isNationalHousingScale: r.isNationalHousingScale,
          region: r.region,
          propertyType: r.propertyType,
          rentalHousingType: r.rentalHousingType,
          isConvertedFromShortTerm: r.isConvertedFromShortTerm,
        };
      }
      if (r.type === "rental_97_4") {
        return { type: "rental_97_4" as const, ...common, region: r.region };
      }
      if (r.type === "rental_97_5") {
        return {
          type: "rental_97_5" as const,
          ...common,
          officialPriceAtStart: parseAmount(r.officialPriceAtStart || "0") || undefined,
          region: r.region,
        };
      }
      if (r.type === "rental_97_2") {
        return {
          type: "rental_97_2" as const,
          ...common,
          rental972Type: r.rental972Type || undefined,
          isNationalHousing: r.isNationalHousing,
        };
      }
      // rental_97_main | rental_97_proviso
      return {
        type: r.type,
        ...common,
        constructionYear: parseInt(r.constructionYear) || undefined,
        isNationalHousing: r.isNationalHousing,
        ...(r.type === "rental_97_proviso" && r.provisoCase ? { provisoCase: r.provisoCase } : {}),
      };
    }
    // ── §99의4 농어촌·고향주택 (2026-06-11): 주택수 제외 본 변환 (④) ──
    // 날짜는 string 그대로 전달 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
    if (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown") {
      const common994 = {
        ruralHouseAcquisitionDate: r.ruralHouseAcquisitionDate || undefined,
        ruralHouseStdPrice: parseAmount(r.ruralHouseStdPrice || "0") || undefined,
        isRegisteredHanok: r.isRegisteredHanok,
        isAdjacentArea: r.isAdjacentArea,
        meetsLocationRequirement: r.meetsLocationRequirement,
      };
      if (r.type === "new_99_4_hometown") {
        return {
          type: "new_99_4_hometown" as const,
          ...common994,
          meetsHometownRequirement: r.meetsHometownRequirement,
        };
      }
      return { type: "new_99_4_rural" as const, ...common994 };
    }
    // ── P1 §99 신축주택 IMF 1차 (2026-06-11): 차감형 본 변환 (④) ──
    // 날짜는 string 그대로 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
    if (r.type === "new_99") {
      return {
        type: "new_99" as const,
        contractDate99: r.contractDate99 || undefined,
        usageApprovalDate99: r.usageApprovalDate99 || undefined,
        acquisitionType99: r.acquisitionType99,
        isNationalHousing99: r.isNationalHousing99,
        standardPriceAtAcquisition99: parseAmount(r.standardPriceAtAcquisition99 || "0") || undefined,
        standardPriceAt5Years99: parseAmount(r.standardPriceAt5Years99 || "0") || undefined,
        standardPriceAtTransfer99: parseAmount(r.standardPriceAtTransfer99 || "0") || undefined,
        exclusiveAreaSqm99: parseDecimal(r.exclusiveAreaSqm99 || "") || undefined,
        hasOccupancyAtContract99: r.hasOccupancyAtContract99,
        isRecontractExcluded99: r.isRecontractExcluded99,
        isRedevelopedNewHouse99: r.isRedevelopedNewHouse99,
        previousHouseStdPrice99: parseAmount(r.previousHouseStdPrice99 || "0") || undefined,
      };
    }
    // ── P1 §98의8 준공후미분양 50% (2026-06-11): 차감형 본 변환 (④) ──
    if (r.type === "unsold_98_8") {
      return {
        type: "unsold_98_8" as const,
        contractDate988: r.contractDate988 || undefined,
        acquisitionPrice988: parseAmount(r.acquisitionPrice988 || "0") || undefined,
        exclusiveAreaSqm988: parseDecimal(r.exclusiveAreaSqm988 || "") || undefined,
        rentalStartDate988: r.rentalStartDate988 || undefined,
        rentalEndDate988: r.rentalEndDate988 || undefined,
        inheritedRentalMonths988: parseInt(r.inheritedRentalMonths988 || "") || undefined,
        isUnsoldAfterCompletion988: r.isUnsoldAfterCompletion988,
        isFirstContract988: r.isFirstContract988,
        isNotRecontract988: r.isNotRecontract988,
        standardPriceAtAcquisition988: parseAmount(r.standardPriceAtAcquisition988 || "0") || undefined,
        standardPriceAt5Years988: parseAmount(r.standardPriceAt5Years988 || "0") || undefined,
        standardPriceAtTransfer988: parseAmount(r.standardPriceAtTransfer988 || "0") || undefined,
      };
    }
    // ── P2 §98의7 9억↓ 미분양 (2026-06-11): 하이브리드 본 변환 (④) ──
    if (r.type === "unsold_98_7") {
      return {
        type: "unsold_98_7" as const,
        contractDate987: r.contractDate987 || undefined,
        acquisitionPrice987: parseAmount(r.acquisitionPrice987 || "0") || undefined,
        isUnsoldAtCutoff987: r.isUnsoldAtCutoff987,
        isFirstContract987: r.isFirstContract987,
        isNotOccupiedAtContract987: r.isNotOccupiedAtContract987,
        isNotRecontract987: r.isNotRecontract987,
        standardPriceAtAcquisition987: parseAmount(r.standardPriceAtAcquisition987 || "0") || undefined,
        standardPriceAt5Years987: parseAmount(r.standardPriceAt5Years987 || "0") || undefined,
        standardPriceAtTransfer987: parseAmount(r.standardPriceAtTransfer987 || "0") || undefined,
      };
    }
    // ── P2 §99의2 신축·미분양·1세대1주택 (2026-06-11): 하이브리드 본 변환 (④) ──
    // houseType별 비활성 분기 일자만 strip (UI 검토 #4 — 라디오 전환 잔존값 미전달)
    if (r.type === "unsold_99_2") {
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
        standardPriceAtAcquisition992: parseAmount(r.standardPriceAtAcquisition992 || "0") || undefined,
        standardPriceAt5Years992: parseAmount(r.standardPriceAt5Years992 || "0") || undefined,
        standardPriceAtTransfer992: parseAmount(r.standardPriceAtTransfer992 || "0") || undefined,
      };
    }
    // ── §98의9 수도권 밖 준공후미분양 (2026-06-11): 주택수 제외 본 변환 (④) ──
    // 날짜는 string 그대로 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
    if (r.type === "unsold_98_9") {
      return {
        type: "unsold_98_9" as const,
        unsoldHouseAcquisitionDate: r.unsoldHouseAcquisitionDate || undefined,
        unsoldHouseAcquisitionPrice: parseAmount(r.unsoldHouseAcquisitionPrice || "0") || undefined,
        unsoldHouseExclusiveArea: parseDecimal(r.unsoldHouseExclusiveArea || "") || undefined,
        isNonCapitalRegion: r.isNonCapitalRegion,
        wasOneHouseholdAtAcquisition: r.wasOneHouseholdAtAcquisition,
        meetsSellerAndContractRequirement: r.meetsSellerAndContractRequirement,
      };
    }
    // ── Phase 1 stub 잔여: 본 요건 미구현 — type만 전달 (엔진은 시한 검증만 수행) ──
    // 해당 ID들은 transfer.types.ts TransferReductionStub 정의 + Zod schema 통과 보장.
    // TypeScript narrowing이 모든 케이스를 소진해 never로 좁혀지므로 unknown 캐스트로 우회.
    const stubType = (r as unknown as { type: string }).type;
    return { type: stubType, _phase1Stub: true as const };
  });
}
