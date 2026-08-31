/**
 * 양도소득세 감면 API 변환 (④) — toEngineReductions
 * transfer-tax-api-helpers.ts 800줄 정책 분리 (P1, 2026-06-11).
 * 날짜는 string 그대로 전달 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { calcReductionAcquisitionStdPrice, canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";

/** AssetReductionForm[] → 엔진 reductions payload 변환 */
export function toEngineReductions(
  formReductions: AssetReductionForm[],
  acquisitionCause: AssetForm["acquisitionCause"],
  // 파급C: 매퍼는 asset 컨텍스트 없음 → §77 고시일 fallback 소스를 명시 주입
  expropriationNoticeDate?: string,
) {
  return formReductions.map((r) => {
    if (r.type === "self_farming") {
      const decedentYears = parseInt(r.decedentFarmingYears ?? "0") || 0;
      const incorpDate = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationDate ?? "") : "";
      const incorpZone = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationZone ?? "") : "";
      const incorpStdPrice = r.useSelfFarmingIncorporation
        ? parseAmount(r.selfFarmingStandardPriceAtIncorporation ?? "")
        : 0;
      // 편입 부분감면 취득·양도시 기준시가 (실지 모드 전용 입력) — 편입 ON 시만
      const incorpStdAcq = r.useSelfFarmingIncorporation
        ? parseAmount(r.selfFarmingStandardPriceAtAcquisition ?? "")
        : 0;
      const incorpStdTransfer = r.useSelfFarmingIncorporation
        ? parseAmount(r.selfFarmingStandardPriceAtTransfer ?? "")
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
        ...(incorpStdAcq > 0 ? { standardPriceAtAcquisition: incorpStdAcq } : {}),
        ...(incorpStdTransfer > 0 ? { standardPriceAtTransfer: incorpStdTransfer } : {}),
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
        // 고시일 fallback: reduction 미입력 시 Step1 단일 소스(expropriationNoticeDate)
        businessApprovalDate: r.expropriationApprovalDate || expropriationNoticeDate || "",
      };
    }
    if (r.type === "gb_designated_land") {
      return {
        type: "gb_designated_land" as const,
        branch: r.gbBranch,
        // ② 해제 후 경로는 공익사업법이라 §17/§20 축이 없다 — 키 자체를 싣지 않는다.
        ...(r.gbBranch === "in_zone" && r.gbPurchaseRoute
          ? { purchaseRoute: r.gbPurchaseRoute }
          : {}),
        designationDate: r.gbDesignationDate,
        triggerDate: r.gbTriggerDate,
        releasedDate: r.gbReleasedDate || undefined,
        freeEconZone: r.gbFreeEconZone,
        residedFromAcqToTrigger: r.gbResided,
      };
    }
    if (r.type === "replacement_land_comp") {
      return {
        type: "replacement_land_comp" as const,
        cashCompensation: parseAmount(r.rlCashComp || "0"),
        replacementLandComp: parseAmount(r.rlLandComp || "0"),
        // 고시일: Step1 단일 소스(expropriationNoticeDate) 재사용 — §77의2① 소급 2년 취득요건용
        businessApprovalDate: expropriationNoticeDate || undefined,
      };
    }
    // ── Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본격 변환 ──
    if (r.type === "new_99_3") {
      // 취득시 기준시가 — PHD 환산 ON이고 환산 입력 충분하면 §164⑤ 자동 산출(source ternary,
      // UI 숨김/echo·validate와 동일 소스). 아니면 수동값. useEffect store 미러 없이 단일 소스.
      const phdInput993 = {
        firstDisclosurePrice: r.phdFirstDisclosurePrice993 ? parseAmount(r.phdFirstDisclosurePrice993) : 0,
        landAreaSqm: r.phdLandAreaSqm993 ? parseFloat(r.phdLandAreaSqm993) : 0,
        landPricePerSqmAtAcquisition: r.phdLandPricePerSqmAtAcq993 ? parseAmount(r.phdLandPricePerSqmAtAcq993) : 0,
        landPricePerSqmAtFirstDisclosure: r.phdLandPricePerSqmAtFirst993 ? parseAmount(r.phdLandPricePerSqmAtFirst993) : 0,
        buildingStdPriceAtAcquisition: r.phdBuildingStdAtAcq993 ? parseAmount(r.phdBuildingStdAtAcq993) : 0,
        buildingStdPriceAtFirstDisclosure: r.phdBuildingStdAtFirst993 ? parseAmount(r.phdBuildingStdAtFirst993) : 0,
      };
      const acqStdPrice993 =
        r.phdMode993 && canCalcReductionPhd(phdInput993)
          ? calcReductionAcquisitionStdPrice(phdInput993).estimatedAcquisitionStdPrice
          : parseAmount(r.standardPriceAtAcquisition993 || "0");
      return {
        type: "new_99_3" as const,
        contractDate993: r.contractDate993 || undefined,
        usageApprovalDate993: r.usageApprovalDate993 || undefined,
        standardPriceAt5Years: parseAmount(r.standardPriceAt5Years || "0"),
        standardPriceAtAcquisition993: acqStdPrice993,
        standardPriceAtTransfer993: r.standardPriceAtTransfer993
          ? parseAmount(r.standardPriceAtTransfer993)
          : undefined,
        isRecontractExcluded993: r.isRecontractExcluded993,
        recontractUnavoidableCause993: r.recontractUnavoidableCause993,
        isRedevelopedNewHouse993: r.isRedevelopedNewHouse993,
        previousHouseStdPrice993: parseAmount(r.previousHouseStdPrice993 || "0") || undefined,
        exclusiveAreaSqm993: parseDecimal(r.exclusiveAreaSqm993 || "") || undefined,
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
          r.hasVacancyOverGrace === true && r.vacancyPeriods && r.vacancyPeriods.length > 0
            ? r.vacancyPeriods.map((v) => ({ startDate: v.startDate, endDate: v.endDate }))
            : undefined,
        // D2-06 — 3-state. null(미선택)은 보내지 않아 엔진이 불적용 사유를 붙이게 한다.
        ...(r.rentalContinuesToTransfer !== null
          ? { rentalContinuesToTransfer: r.rentalContinuesToTransfer }
          : {}),
        // B는 「양도일까지 계속 임대」가 아닐 때만 의미가 있다.
        ...(r.rentalContinuesToTransfer === false
          ? { stdPriceAtRentalEnd: parseAmount(r.stdPriceAtRentalEnd || "0") || undefined }
          : {}),
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
        return {
          type: "rental_97_4" as const,
          ...common,
          region: r.region,
          // D2-04 — 소령 §167의3①2호 가목·다목 한도 판정용
          officialPriceAtStart: parseAmount(r.officialPriceAtStart || "0") || undefined,
          ...(r.rental974Category ? { rental974Category: r.rental974Category } : {}),
        };
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
          // 3-state — null(미선택)은 보내지 않는다. 엔진이 미입력을 충족으로 읽지 않으므로
          // 결과는 「확인되지 않았습니다」 불적용 사유가 된다.
          ...(r.hasNewRentalPlus2Units !== null
            ? { hasNewRentalPlus2Units: r.hasNewRentalPlus2Units }
            : {}),
        };
      }
      // rental_97_main | rental_97_proviso
      return {
        type: r.type,
        ...common,
        constructionYear: parseInt(r.constructionYear) || undefined,
        isNationalHousing: r.isNationalHousing,
        ...(r.type === "rental_97_proviso" && r.provisoCase ? { provisoCase: r.provisoCase } : {}),
        ...(r.hasMin5RentalUnits !== null ? { hasMin5RentalUnits: r.hasMin5RentalUnits } : {}),
        // 조특령 §97⑤4호 — 5호 미만 기간. 「5호 이상」이 확정된 경우에만 의미가 있다.
        ...(r.belowMin5UnitsPeriods && r.belowMin5UnitsPeriods.length > 0
          ? {
              belowMin5UnitsPeriods: r.belowMin5UnitsPeriods.map((v) => ({
                startDate: v.startDate,
                endDate: v.endDate,
              })),
            }
          : {}),
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
      // 취득시 기준시가 — PHD 환산 ON이고 입력 충분하면 §164⑤ 자동 산출(source ternary,
      // UI echo·validate와 동일 소스). 아니면 수동값. 엔진은 환산값(취득기준시가)만 수용(phd echo 필드 없음).
      const phdInput99 = {
        firstDisclosurePrice: r.phdFirstDisclosurePrice99 ? parseAmount(r.phdFirstDisclosurePrice99) : 0,
        landAreaSqm: r.phdLandAreaSqm99 ? parseFloat(r.phdLandAreaSqm99) : 0,
        landPricePerSqmAtAcquisition: r.phdLandPricePerSqmAtAcq99 ? parseAmount(r.phdLandPricePerSqmAtAcq99) : 0,
        landPricePerSqmAtFirstDisclosure: r.phdLandPricePerSqmAtFirst99 ? parseAmount(r.phdLandPricePerSqmAtFirst99) : 0,
        buildingStdPriceAtAcquisition: r.phdBuildingStdAtAcq99 ? parseAmount(r.phdBuildingStdAtAcq99) : 0,
        buildingStdPriceAtFirstDisclosure: r.phdBuildingStdAtFirst99 ? parseAmount(r.phdBuildingStdAtFirst99) : 0,
      };
      const acqStdPrice99 =
        r.phdMode99 && canCalcReductionPhd(phdInput99)
          ? calcReductionAcquisitionStdPrice(phdInput99).estimatedAcquisitionStdPrice
          : parseAmount(r.standardPriceAtAcquisition99 || "0");
      return {
        type: "new_99" as const,
        contractDate99: r.contractDate99 || undefined,
        usageApprovalDate99: r.usageApprovalDate99 || undefined,
        acquisitionType99: r.acquisitionType99,
        isNationalHousing99: r.isNationalHousing99,
        standardPriceAtAcquisition99: acqStdPrice99 || undefined,
        standardPriceAt5Years99: parseAmount(r.standardPriceAt5Years99 || "0") || undefined,
        standardPriceAtTransfer99: parseAmount(r.standardPriceAtTransfer99 || "0") || undefined,
        exclusiveAreaSqm99: parseDecimal(r.exclusiveAreaSqm99 || "") || undefined,
        hasOccupancyAtContract99: r.hasOccupancyAtContract99,
        isRecontractExcluded99: r.isRecontractExcluded99,
        recontractUnavoidableCause99: r.recontractUnavoidableCause99,
        isRedevelopedNewHouse99: r.isRedevelopedNewHouse99,
        previousHouseStdPrice99: parseAmount(r.previousHouseStdPrice99 || "0") || undefined,
      };
    }
    // ── P1 §98의8 준공후미분양 50% (2026-06-11): 차감형 본 변환 (④) ──
    if (r.type === "unsold_98_8") {
      // 취득시 기준시가 — PHD 환산 ON이고 충분하면 §164⑤ 자동 산출(A설계, 환산값만 엔진 전달).
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
        contractDate988: r.contractDate988 || undefined,
        acquisitionPrice988: parseAmount(r.acquisitionPrice988 || "0") || undefined,
        exclusiveAreaSqm988: parseDecimal(r.exclusiveAreaSqm988 || "") || undefined,
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
    if (r.type === "unsold_98") {
      return {
        type: "unsold_98" as const,
        contractDate98: r.contractDate98 || undefined,
        isNationalScale98: r.isNationalScale98,
        isOutsideSeoul98: r.isOutsideSeoul98,
        isUnsoldConfirmed98: r.isUnsoldConfirmed98,
        isFirstBuyerNoOccupancy98: r.isFirstBuyerNoOccupancy98,
        rentedFor5Years98: r.rentedFor5Years98,
      };
    }
    // ── P4 §98의2·§98의4 (2026-06-12): 본 변환 (④) ──
    if (r.type === "unsold_98_2") {
      return {
        type: "unsold_98_2" as const,
        contractDate982: r.contractDate982 || undefined,
        isNonCapitalUnsold982: r.isNonCapitalUnsold982,
        isFirstOrFcfsContract982: r.isFirstOrFcfsContract982,
      };
    }
    if (r.type === "unsold_98_4") {
      return {
        type: "unsold_98_4" as const,
        contractDate984: r.contractDate984 || undefined,
        isNonResidentNoPe984: r.isNonResidentNoPe984,
        isNotUnsold983House984: r.isNotUnsold983House984,
      };
    }
    // ── P3 §98의3 (2026-06-12): 하이브리드 본 변환 (④) — houseType별 일자 strip ──
    if (r.type === "unsold_98_3") {
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
    if (r.type === "unsold_98_5") {
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
        contractDate985: r.contractDate985 || undefined,
        priceReductionRatePct985: parseDecimal(r.priceReductionRatePct985 || "") || undefined,
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
    if (r.type === "unsold_98_6") {
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
        hoType986: r.hoType986,
        contractDate986: r.contractDate986 || undefined,
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
    if (r.type === "unsold_98_7") {
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
    if (r.type === "unsold_99_2") {
      // 취득시 기준시가 — PHD 환산 ON이고 입력 충분하면 §164⑤ 자동 산출(source ternary, UI echo·validate 동일 소스).
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
