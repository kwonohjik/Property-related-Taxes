/**
 * 양도소득세 감면 API 변환 (④) — toEngineReductions
 * transfer-tax-api-helpers.ts 800줄 정책 분리 (P1, 2026-06-11).
 * §98 시리즈·§99의2 미분양주택 감면(unsold_98 · unsold_98_2~unsold_98_9 · unsold_99_2) 분기 본문은
 * `transfer-tax-api-reductions-unsold.ts`의 조문별 함수(`toUnsold…Payload`)로 이동
 * (755줄 → 800줄 정책 분리, 2026-11-08 · 동작 변경 없음 — 분기 순서 유지).
 * 날짜는 string 그대로 전달 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
 */

import { parseAmount } from "@/lib/calc/number-parse";
import { parseDecimal } from "@/lib/calc/number-parse";
import { calcReductionAcquisitionStdPrice, canCalcReductionPhd } from "@/lib/tax-engine/transfer-reductions";
import { needsFirstContractAnswer } from "@/lib/tax-engine/transfer-reductions/new-99-acquisition-cause";
import { redevMemberNeedsRemainderAnswerIso } from "@/lib/tax-engine/transfer-reductions/new-99-redev-member";
import { redevMemberNewHouseScope } from "./redev-field-scope";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import { selfFarmingDecedentAggregable } from "./self-farming-own-years";
import { hasRentIncreaseRule } from "./rental-rent-increase-label";
import { aptDeadlineExtensionPayload } from "./apt-deadline-extension-scope";
import { rental974SaMokApplies } from "./apt-deadline-extension-scope";
import { toNew994Payload } from "./new-99-4-form";
import { toUnsold988Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold98Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold982Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold984Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold983Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold985Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold986Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold987Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold992Payload } from "./transfer-tax-api-reductions-unsold";
import { toUnsold989Payload } from "./transfer-tax-api-reductions-unsold";

/** AssetReductionForm[] → 엔진 reductions payload 변환 */
/**
 * §77 감면 자산이 「직접 경작한 토지」인지 — **자산 수준** 플래그로 승격한다.
 *
 * 농특세령 §4①1호 괄호: 「제77조[「조세특례제한법」 제69조제1항 본문에 따른 거주자가 **직접
 * 경작한 토지**(8년 이상 경작할 것의 요건은 적용하지 아니한다)로 한정한다]」 ⇒ 직접 경작
 * 토지여야 농특세 비과세다.
 *
 * 🔑 **판정식을 복제하지 말 것** (D11-01·D11-02). 단건 ④·다건 ⑬·일괄양도 컴패니언 ④가
 * 모두 이 leaf를 쓴다 — 한 곳만 빠뜨리면 그 경로에서만 감면세액 × 20%가 조용히 부과된다.
 * 체크하지 않았으면 `undefined`(엔진이 「입증되지 않음 = 과세」로 처리).
 */
export function toSelfCultivatedExpropriatedLand(
  reductions: ReadonlyArray<{ type: string; expropriationSelfCultivated?: boolean }> | undefined,
): true | undefined {
  return (
    (reductions ?? []).some(
      (r) => r.type === "public_expropriation" && r.expropriationSelfCultivated === true,
    ) || undefined
  );
}

export function toEngineReductions(
  formReductions: AssetReductionForm[],
  /**
   * 그 감면을 단 자산 — 취득원인·수유자 여부로 §66⑪·⑫ 피상속인 경작기간을 싣는지 정한다(`selfFarmingDecedentAggregable`).
   * 화면 경로는 자산을 넘긴다. 취득원인 문자열만 넘기면 수유자가 아닌 것으로 본다(종전 시그니처 호환).
   */
  owner:
    | AssetForm["acquisitionCause"]
    | (Pick<AssetForm, "acquisitionCause" | "nonHeirBequest"> &
        Partial<Pick<AssetForm, "assetKind" | "redevSubject" | "redevIsSuccessorMember" | "redevOriginalAssetType" | "redevReceiveOnlyMode" | "redevCompletionDate">>),
  // 파급C: 매퍼는 asset 컨텍스트 없음 → §77 고시일 fallback 소스를 명시 주입
  expropriationNoticeDate?: string,
) {
  const ownerAsset = typeof owner === "object" ? owner : { acquisitionCause: owner };
  // §99·§99의3 조합원 갈래(NH-36) — 자산을 넘긴 화면 경로에서만 정해진다(취득원인 문자열만 넘기면 범위 밖)
  const memberCompletion =
    typeof owner === "object" && owner.assetKind
      ? redevMemberNewHouseScope({
          assetKind: owner.assetKind,
          redevSubject: owner.redevSubject ?? "",
          redevIsSuccessorMember: owner.redevIsSuccessorMember ?? "",
          redevOriginalAssetType: owner.redevOriginalAssetType ?? "",
          redevReceiveOnlyMode: owner.redevReceiveOnlyMode ?? "",
          redevCompletionDate: owner.redevCompletionDate ?? "",
        })?.completionDate
      : undefined;
  return formReductions.map((r) => {
    if (r.type === "self_farming") {
      const decedentYears = parseInt(r.decedentFarmingYears ?? "0") || 0;
      const incorpDate = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationDate ?? "") : "";
      const incorpZone = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationZone ?? "") : "";
      const incorpLocation = r.useSelfFarmingIncorporation
        ? (r.selfFarmingIncorporationLocation ?? "")
        : "";
      const incorpProviso =
        r.useSelfFarmingIncorporation && r.selfFarmingIncorporationProvisoException === true;
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
        // 상속인이 아닌 수유자는 합산하지 않는다(조심2021구1132) — 화면도 칸을 숨긴다(⑤·⑧과 같은 술어).
        ...(selfFarmingDecedentAggregable(ownerAsset) && decedentYears > 0
          ? {
              decedentFarmingYears: decedentYears,
              // §66⑪ 본문 / §66⑫ 대체요건 — 둘 다 미선언이면 엔진이 합산하지 않는다
              heirContinuedFarming1Year: r.heirContinuedFarming1Year === true,
              meetsDecedentAggregationAlt: r.meetsDecedentAggregationAlt === true,
              ...(parseInt(r.disqualifiedTaxPeriodsDecedent ?? "0") > 0
                ? { disqualifiedTaxPeriodsDecedent: parseInt(r.disqualifiedTaxPeriodsDecedent ?? "0") }
                : {}),
            }
          : {}),
        // §66⑭ 결격 과세기간(본인) — 상속 여부와 무관
        ...(parseInt(r.disqualifiedTaxPeriodsSelf ?? "0") > 0
          ? { disqualifiedTaxPeriodsSelf: parseInt(r.disqualifiedTaxPeriodsSelf ?? "0") }
          : {}),
        ...(incorpDate ? { incorporationDate: incorpDate } : {}),
        ...(incorpZone ? { incorporationZoneType: incorpZone } : {}),
        ...(incorpLocation ? { incorporationLocationType: incorpLocation } : {}),
        ...(incorpProviso ? { hasIncorporationProvisoException: true } : {}),
        ...(incorpStdPrice > 0 ? { standardPriceAtIncorporation: incorpStdPrice } : {}),
        ...(incorpStdAcq > 0 ? { standardPriceAtAcquisition: incorpStdAcq } : {}),
        ...(incorpStdTransfer > 0 ? { standardPriceAtTransfer: incorpStdTransfer } : {}),
      };
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
      // 취득시 기준시가 — PHD 환산 ON이고 환산 입력 충분하면 §164⑦ 자동 산출(source ternary,
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
        // 「0」도 미입력으로 본다 — ⑧(`> 0 || 자산값`)·라우터(`?? 자산값`)와 같은 fallback이다.
        //   종전에는 문자열 "0"이 truthy라 0을 실어 라우터가 자산값으로 대신하지 못하고 감면이 0이 됐다 (리뷰 NH-56).
        standardPriceAtTransfer993: parseAmount(r.standardPriceAtTransfer993 || "0") || undefined,
        isRecontractExcluded993: r.isRecontractExcluded993,
        recontractUnavoidableCause993: r.recontractUnavoidableCause993,
        isRedevelopedNewHouse993: r.isRedevelopedNewHouse993,
        previousHouseStdPrice993: parseAmount(r.previousHouseStdPrice993 || "0") || undefined,
        exclusiveAreaSqm993: parseDecimal(r.exclusiveAreaSqm993 || "") || undefined,
        region993: r.region993,
        acquisitionType993: r.acquisitionType993,
        // 부칙 §29② 착공 여부 — ""(미응답)은 보내지 않는다. 범위 밖 옛 응답은 엔진이 읽지 않는다. 범위 안 미응답은 validate(⑧)·Zod(⑫)가 차단.
        constructionStartedBefore2003_993: r.constructionStartedBefore2003_993 || undefined,
        // 종전 고급주택 기준(NH-02) — 미응답("")은 보내지 않는다. 단독주택 사실은 단독일 때만. 개정규정 시기는 엔진이 읽지 않는다.
        ...((f) => ({
          houseType993: f.houseType,
          grossFloorAreaSqm993: f.grossFloorAreaSqm,
          attachedLandAreaSqm993: f.attachedLandAreaSqm,
          stdPriceFloorMet993: f.stdPriceFloorMet,
          luxuryFacility993: f.luxuryFacility,
        }))(luxuryFacts(r.houseType993, r.grossFloorAreaSqm993, r.attachedLandAreaSqm993, r.stdPriceFloorMet993, r.luxuryFacility993)),
        // 최초 계약 여부(NH-17) — 묻는 범위(1호 · 상속·증여·이월과세 증여 아님 — 그 셋은 엔진이 불성립)에서 답한 값만. ⑧이 범위 안 미응답을 막는다.
        firstContract993:
          needsFirstContractAnswer(r.acquisitionType993, ownerAsset.acquisitionCause) && r.firstContract993
            ? r.firstContract993
            : undefined,
        // 조합원 갈래(NH-36·NH-16) — 준공일이 기간 경과 후일 때만 잔여주택 계약 사실을 싣는다(미응답 ""은 보내지 않음 — 엔진은 불성립 + 확인 필요)
        remainderContract993:
          redevMemberNeedsRemainderAnswerIso("new_99_3", memberCompletion) && r.remainderContract993
            ? r.remainderContract993
            : undefined,
        hasOccupancyAtContract: r.hasOccupancyAtContract ?? false,
        isResident993: r.isResident993,
        isHousingConstructionBusiness993: r.isHousingConstructionBusiness993,
        // Round 10 (2026-05-06): PHD 환산 입력 (§164⑦ 산식으로 계산한 취득 당시 공동주택가격 자동 산출)
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
        // §97(본문·단서)·§97의2는 임대료 증액 요건이 없어 싣지 않는다 (`hasRentIncreaseRule`) — 구 세션에 남은 값도 무시.
        rentIncreaseViolated: hasRentIncreaseRule(r.type) ? r.rentIncreaseViolationMode === "has_violation" : undefined,
        rentHistory:
          hasRentIncreaseRule(r.type) && r.rentIncreaseViolationMode === "has_violation" && r.rentHistory && r.rentHistory.length >= 2
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
        // Q10 — 안분 기준시가 E·D override. **입력이 있을 때만** 실어 라우터의 `?? ctx` 폴백을
        // 살린다(0을 보내면 폴백이 죽고 안분이 조용히 불성립한다).
        ...(parseAmount(r.stdPriceAtAcquisition || "0") > 0
          ? { stdPriceAtAcquisition: parseAmount(r.stdPriceAtAcquisition) }
          : {}),
        ...(parseAmount(r.stdPriceAtTransfer || "0") > 0
          ? { stdPriceAtTransfer: parseAmount(r.stdPriceAtTransfer) }
          : {}),
      };
      if (r.type === "rental_97_3") {
        return {
          type: "rental_97_3" as const,
          ...common,
          officialPriceAtStart: parseAmount(r.officialPriceAtStart || "0") || undefined,
          isNationalHousingScale: r.isNationalHousingScale,
          region: r.region,
          rentalHousingType: r.rentalHousingType,
          // PR-C — 정본은 `shortTermConversionMode`. 구 세션 boolean과 같은 의미(after = 적용 제외)로 파생한다.
          isConvertedFromShortTerm: (r.shortTermConversionMode ?? (r.isConvertedFromShortTerm ? "after" : "none")) === "after",
          // 조특령 §97의3④ 후단 — 2020.7.10 이전 변경신고(registrationDate = 단기 지자체 등록일). 두 날짜가 있을 때만 싣는다(⑧이 필수로 막는다).
          ...(r.shortTermConversionMode === "before" && r.conversionReportedDate && r.conversionAcceptedDate
            ? { shortTermConversion: { reportedDate: r.conversionReportedDate, acceptedDate: r.conversionAcceptedDate } }
            : {}),
          isPrivateConstructionRental: r.isPrivateConstructionRental, // D2-07
          // §97의3①1호 — 조기 종료 시 임대기간 종점 · 조특령 §97의3④ 사업자등록일 (§97의5와 같은 조건)
          ...(r.rentalContinuesToTransfer === false && r.rentalEndDate ? { rentalEndDate: r.rentalEndDate } : {}),
          ...(r.isTaxRegistered && r.taxRegistrationDate ? { taxRegistrationDate: r.taxRegistrationDate } : {}),
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
          // 조특령 §97의4② — 사업자등록을 확인했을 때만 그 날짜를 싣는다 (§97의3·§97의5와 같은 조건)
          ...(r.isTaxRegistered && r.taxRegistrationDate ? { taxRegistrationDate: r.taxRegistrationDate } : {}),
          // 조특령 §97⑤3호 — 토글 ON + 세 날짜가 다 있을 때만 (⑧이 빈 날짜를 막는다)
          ...(r.isInherited974 && r.inheritanceDate974 && r.decedentRegistrationDate974 && r.decedentRentalStartDate974
            ? {
                inheritance974: {
                  inheritanceDate: r.inheritanceDate974,
                  decedentRegistrationDate: r.decedentRegistrationDate974,
                  decedentRentalStartDate: r.decedentRentalStartDate974,
                },
              }
            : {}),
          // 민특법 §6⑤ 자동말소일 — 토글 ON + 날짜
          ...(r.isAutoCancelled974 && r.autoCancelledDate974 ? { autoCancelledDate974: r.autoCancelledDate974 } : {}),
          // 민특법 §6①11호 자진말소일 — 토글 ON + 날짜
          ...(r.isVoluntaryCancelled974 && r.voluntaryCancelledDate974 ? { voluntaryCancelledDate974: r.voluntaryCancelledDate974 } : {}),
          // 소령 §167의3①2호 가목2) — 가목일 때만(⑤ 노출과 같은 범위). 연장 사실은 아파트일 때만 (리뷰 R-2)
          ...(r.rental974Category === "purchase_a" && r.isApartment974 ? { isApartment974: r.isApartment974 === "yes" } : {}),
          // 자진말소(사목)면 ⑪ 연장 사실은 쓰이지 않는다 — ⑤가 숨기고 ⑧이 검사하지 않으니 싣지도 않는다(숨은 미완 3호 → ⑫ 400 방지)
          ...(r.rental974Category === "purchase_a" && r.isApartment974 === "yes" && !rental974SaMokApplies(r)
            ? { aptDeadlineExtension974: aptDeadlineExtensionPayload(r.aptDeadlineExtension974) }
            : {}),
        };
      }
      if (r.type === "rental_97_5") {
        return {
          type: "rental_97_5" as const,
          ...common,
          isNationalHousingScale: r.isNationalHousingScale, // CA-01
          // §97의5①2호 — 조기 종료 시 10년 판정의 종점. 「계속 임대」면 싣지 않는다(종점 = 양도일).
          ...(r.rentalContinuesToTransfer === false && r.rentalEndDate
            ? { rentalEndDate: r.rentalEndDate }
            : {}),
          // §97의5①1호 — null(미선택)은 보내지 않아 엔진이 불적용 사유를 붙이게 한다(⑧이 먼저 막는다).
          ...(r.isPurchaseRental !== null && r.isPurchaseRental !== undefined
            ? { isPurchaseRental: r.isPurchaseRental }
            : {}),
          // 조특령 §97의5③ — 사업자등록을 확인했을 때만 그 날짜를 싣는다
          ...(r.isTaxRegistered && r.taxRegistrationDate ? { taxRegistrationDate: r.taxRegistrationDate } : {}),
          // 령 §97의5①2호·3호 간주기간 — 토글 ON + 날짜가 다 있는 행만
          ...(r.hasDeemedRentalPeriod && (r.deemedRentalPeriods ?? []).length > 0
            ? {
                deemedRentalPeriods: r.deemedRentalPeriods
                  .filter((p) => p.startDate && p.endDate)
                  .map((p) => ({ reason: p.reason, startDate: p.startDate, endDate: p.endDate })),
              }
            : {}),
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
          // D1-07 — §97의2①2호. null(미선택)은 보내지 않는다.
          ...(r.isUnoccupiedAtAcquisition !== null
            ? { isUnoccupiedAtAcquisition: r.isUnoccupiedAtAcquisition }
            : {}),
          // D9-01 — §97의2①1호 나목
          ...(r.isMultiUnitHousing972 !== null
            ? { isMultiUnitHousing972: r.isMultiUnitHousing972 }
            : {}),
          ...(r.isUnoccupiedAt19990820 !== null
            ? { isUnoccupiedAt19990820: r.isUnoccupiedAt19990820 }
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
        // D1-06 — §97①2호 두 사실 / D1-07 — 단서 나목. null은 보내지 않는다.
        ...(r.isMultiUnitHousing !== null ? { isMultiUnitHousing: r.isMultiUnitHousing } : {}),
        ...(r.isUnoccupiedAt1986 !== null ? { isUnoccupiedAt1986: r.isUnoccupiedAt1986 } : {}),
        ...(r.isUnoccupiedAtAcquisition !== null
          ? { isUnoccupiedAtAcquisition: r.isUnoccupiedAtAcquisition }
          : {}),
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
    if (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown") return toNew994Payload(r);
    // ── P1 §99 신축주택 IMF 1차 (2026-06-11): 차감형 본 변환 (④) ──
    // 날짜는 string 그대로 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
    if (r.type === "new_99") {
      // 취득시 기준시가 — PHD 환산 ON이고 입력 충분하면 §164⑦ 자동 산출(source ternary,
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
        // D11-05 — 법 §99① 「거주자(주택건설사업자는 제외한다)가 …」
        isResident99: r.isResident99,
        isHousingConstructionBusiness99: r.isHousingConstructionBusiness99,
        contractDate99: r.contractDate99 || undefined,
        usageApprovalDate99: r.usageApprovalDate99 || undefined,
        acquisitionType99: r.acquisitionType99,
        isNationalHousing99: r.isNationalHousing99,
        standardPriceAtAcquisition99: acqStdPrice99 || undefined,
        standardPriceAt5Years99: parseAmount(r.standardPriceAt5Years99 || "0") || undefined,
        standardPriceAtTransfer99: parseAmount(r.standardPriceAtTransfer99 || "0") || undefined,
        exclusiveAreaSqm99: parseDecimal(r.exclusiveAreaSqm99 || "") || undefined,
        // 고급주택(기준일 당시 소득세법 시행령 §156) 주택 유형·단독주택 사실 (NH-02)
        ...((f) => ({
          houseType99: f.houseType,
          grossFloorAreaSqm99: f.grossFloorAreaSqm,
          attachedLandAreaSqm99: f.attachedLandAreaSqm,
          stdPriceFloorMet99: f.stdPriceFloorMet,
          luxuryFacility99: f.luxuryFacility,
        }))(luxuryFacts(r.houseType99, r.grossFloorAreaSqm99, r.attachedLandAreaSqm99, r.stdPriceFloorMet99, r.luxuryFacility99)),
        // 최초 계약 여부(NH-03) — 묻는 범위(2호 · 상속·증여·이월과세 증여 아님 — 그 셋은 엔진이 불성립)에서 답한 값만
        firstContract99:
          needsFirstContractAnswer(r.acquisitionType99, ownerAsset.acquisitionCause) && r.firstContract99
            ? r.firstContract99
            : undefined,
        // 조합원 갈래(NH-36·NH-27) — 준공일이 기간 경과 후일 때만 잔여주택 계약 사실을 싣는다
        remainderContract99:
          redevMemberNeedsRemainderAnswerIso("new_99", memberCompletion, r.isNationalHousing99) &&
          r.remainderContract99
            ? r.remainderContract99
            : undefined,
        hasOccupancyAtContract99: r.hasOccupancyAtContract99,
        isRecontractExcluded99: r.isRecontractExcluded99,
        recontractUnavoidableCause99: r.recontractUnavoidableCause99,
        isRedevelopedNewHouse99: r.isRedevelopedNewHouse99,
        previousHouseStdPrice99: parseAmount(r.previousHouseStdPrice99 || "0") || undefined,
      };
    }
    // ── P1 §98의8 준공후미분양 50% (2026-06-11): 차감형 본 변환 (④) ──
    if (r.type === "unsold_98_8") return toUnsold988Payload(r);
    // ── P5 §98 (2026-06-12): 본 변환 (④) ──
    if (r.type === "unsold_98") return toUnsold98Payload(r);
    // ── P4 §98의2·§98의4 (2026-06-12): 본 변환 (④) ──
    if (r.type === "unsold_98_2") return toUnsold982Payload(r);
    if (r.type === "unsold_98_4") return toUnsold984Payload(r);
    // ── P3 §98의3 (2026-06-12): 하이브리드 본 변환 (④) — houseType별 일자 strip ──
    if (r.type === "unsold_98_3") return toUnsold983Payload(r);
    // ── P3 §98의5 (2026-06-12): 하이브리드 본 변환 (④) ──
    if (r.type === "unsold_98_5") return toUnsold985Payload(r);
    // ── P3 §98의6 (2026-06-12): 하이브리드 본 변환 (④) — hoType별 임대 필드 strip ──
    if (r.type === "unsold_98_6") return toUnsold986Payload(r);
    // ── P2 §98의7 9억↓ 미분양 (2026-06-11): 하이브리드 본 변환 (④) ──
    if (r.type === "unsold_98_7") return toUnsold987Payload(r);
    // ── P2 §99의2 신축·미분양·1세대1주택 (2026-06-11): 하이브리드 본 변환 (④) ──
    // houseType별 비활성 분기 일자만 strip (UI 검토 #4 — 라디오 전환 잔존값 미전달)
    if (r.type === "unsold_99_2") return toUnsold992Payload(r);
    // ── §98의9 수도권 밖 준공후미분양 (2026-06-11): 주택수 제외 본 변환 (④) ──
    // 날짜는 string 그대로 — Route handler(⑭ route-reductions-mapper)에서 Date 변환.
    if (r.type === "unsold_98_9") return toUnsold989Payload(r);
    // ── Phase 1 stub 잔여: 본 요건 미구현 — type만 전달 (엔진은 시한 검증만 수행). 종전의 `_phase1Stub` 표지는 읽는 곳이 없어 걷었다 ──
    // 해당 ID들은 transfer.types.ts TransferReductionStub 정의 + Zod schema 통과 보장.
    // TypeScript narrowing이 모든 케이스를 소진해 never로 좁혀지므로 unknown 캐스트로 우회.
    const stubType = (r as unknown as { type: string }).type;
    return { type: stubType };
  });
}

type TriFormAnswer = "" | "yes" | "no" | "unknown" | undefined;

/**
 * §99·§99의3 종전 고급주택 판정 사실(④) — 주택 유형을 고른 경우에만, 단독주택 사실은 단독일 때만 싣는다 (NH-02).
 */
function luxuryFacts(
  houseType: "" | "apartment" | "detached" | undefined,
  grossFloorArea: string | undefined,
  attachedLandArea: string | undefined,
  stdPriceFloorMet: TriFormAnswer,
  luxuryFacility: TriFormAnswer,
) {
  const detached = houseType === "detached";
  // 연면적·딸린 토지 면적은 공동주택이 아니면 보낸다 — 종전 고급주택 구간 밖에서는 주택 유형을 묻지 않아("") 단독만 보내면 NH-22(딸린 토지 2배 확인)의
  // 선택 입력이 서버에 닿지 않는다. 공동주택은 판정하지 않으므로(계획서 V-2) 보내지 않는다. 고급주택 판정은 houseType이 정해진 단독만 읽는다.
  const sendsAreas = houseType !== "apartment";
  return {
    houseType: houseType || undefined,
    grossFloorAreaSqm: sendsAreas ? parseDecimal(grossFloorArea || "") || undefined : undefined,
    attachedLandAreaSqm: sendsAreas ? parseDecimal(attachedLandArea || "") || undefined : undefined,
    stdPriceFloorMet: detached ? stdPriceFloorMet || undefined : undefined,
    luxuryFacility: detached ? luxuryFacility || undefined : undefined,
  };
}
