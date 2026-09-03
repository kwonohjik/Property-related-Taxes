/**
 * ⑭ Route handler — Zod 검증 통과 데이터 → 단건 엔진 input 매핑
 *
 * route.ts 800줄 정책에 따라 분리(2026-08-04, Phase A-0).
 *
 * ⚠️ **14 동기화 지점 ⑭**다 — 여기에 필드를 빠뜨리면 TypeScript가 잡지 못하고
 *    Zod를 통과한 값이 엔진에 도달하지 않는다(침묵 strip). 신규 필드 추가 시
 *    ⑫(Zod 정의) · ⑬(body spread) · ⑭(이 파일) 3계층을 grep으로 자가 점검할 것.
 *    루트 CLAUDE.md "Definition of Done — 14개 동기화 지점".
 *
 * Date 변환은 호출부(route.ts)가 `toDate`로 끝낸 값을 인자로 받는다 —
 * 이 모듈은 `toOptionalDate`만 자체 호출한다(`lib/api/date-coerce.ts` 필수 경로).
 */
import type { z } from "zod";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { mapReductionsToEngine } from "./route-reductions-mapper";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { mapHousesToEngine, mapGracePeriodToEngine, mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import { buildInheritedAcquisition } from "./route-inherited-acquisition";
import { toRentalHousingExceptionEngineInput } from "./_rental-engine-input";
import { propertySchema } from "@/lib/api/transfer-tax-schema";

type ValidatedTransferInput = z.infer<typeof propertySchema>;

/** Zod 검증 데이터 + 변환 완료 Date → 단건 엔진 input. */
export function buildTransferEngineInput(
  data: ValidatedTransferInput,
  transferDate: Date,
  acquisitionDate: Date,
  assetContractDate: Date | undefined,
): TransferTaxInput {
  return {
    propertyType: data.propertyType,
    transferPrice: data.transferPrice,
    /** 지분 모드: 12억 안분 분모용 총 물건 양도가액 (단독 소유는 undefined) */
    totalPropertyTransferPrice: data.totalPropertyTransferPrice,
    transferDate,
    acquisitionPrice: data.acquisitionPrice,
    acquisitionDate,
    assetContractDate,
    expenses: data.expenses,
    /** §97② 단서 swap 분리 입력 — 미명시 시 undefined 유지 (swap 비활성, legacy expenses 사용) */
    capitalExpenditure: data.capitalExpenditure,
    transferExpense: data.transferExpense,
    useEstimatedAcquisition: data.useEstimatedAcquisition,
    standardPriceAtAcquisition: data.standardPriceAtAcquisition,
    standardPriceAtTransfer: data.standardPriceAtTransfer,
    // ⑭ §164⑧ 동일조정기간 환산 (TS 미감지 침묵 strip 주의 — 중첩 객체 통째 매핑).
    //    날짜 필드가 없어 coerceDates는 불요하다.
    sameAdjustmentPeriod: data.sameAdjustmentPeriod,
    // ⑭ §164⑨ 특례 (TS 미감지 침묵 strip 주의): 1호 per-sqm(가~다목)·2호 공매경락·1호 주택총액(라목)
    transferCause: data.transferCause,
    standardPricePerSqmAtTransfer: data.standardPricePerSqmAtTransfer,
    transferArea: data.transferArea,
    compensationPerSqm: data.compensationPerSqm, compensationBasisStdPrice: data.compensationBasisStdPrice,
    isAuctionTransfer: data.isAuctionTransfer, auctionPrice: data.auctionPrice, // 2호
    housingCompensationTotal: data.housingCompensationTotal, housingCompensationBasisTotal: data.housingCompensationBasisTotal, // 1호 주택총액
    splitLandCompensationTotal: data.splitLandCompensationTotal, splitLandCompensationBasisTotal: data.splitLandCompensationBasisTotal, // 1호 건물 split 토지분(P6)
    householdHousingCount: data.householdHousingCount,
    // ⑭ 사례 36 §89①4호 가목 1세대1입주권 비과세 — 조합원입주권 보유 수 (TypeScript 미감지 영역)
    // optional: right_to_move_in 이외 자산 유형에서는 미전달 → 엔진 fallback (householdRightCount ?? 0)
    householdRightCount: data.householdRightCount,
    residencePeriodMonths: data.residencePeriodMonths,
    isRegulatedArea: data.isRegulatedArea,
    wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
    // ⑭ 법정동코드 — Zod 통과 시 string(10), 미제공 시 undefined (Date 변환 불필요)
    regionCode: data.regionCode,
    isUnregistered: data.isUnregistered,
    isNonBusinessLand: data.isNonBusinessLand,
    // ⑭ §77 농특세 비과세 판정(농특세령 §4①1호) — 미전달 시 엔진이 과세로 처리한다.
    isSelfCultivatedExpropriatedLand: data.isSelfCultivatedExpropriatedLand,
    isSuccessorRightToMoveIn: data.isSuccessorRightToMoveIn,
    acquisitionCause: data.acquisitionCause,
    decedentAcquisitionDate: toOptionalDate(data.decedentAcquisitionDate),
    decedentSameHouseholdBeforeInheritance: data.decedentSameHouseholdBeforeInheritance,
    decedentCohabitationHoldingStartDate: toOptionalDate(data.decedentCohabitationHoldingStartDate),
    decedentCohabitationResidenceMonths: data.decedentCohabitationResidenceMonths,
    // ⑭ 비주택 → 주택 용도변경 §95⑤·⑥ — 날짜만 Date로, 절사 개월은 number 그대로.
    nonHousingToHousingConversion: data.nonHousingToHousingConversion
      ? {
          residentialUseStartDate: toDate(
            data.nonHousingToHousingConversion.residentialUseStartDate,
            "nonHousingToHousingConversion.residentialUseStartDate",
          ),
          residenceMonthsTrimmed: data.nonHousingToHousingConversion.residenceMonthsTrimmed,
        }
      : undefined,
    donorAcquisitionDate: toOptionalDate(data.donorAcquisitionDate),
    // ⑭ 이월과세 §97의2 — **키를 열거하지 않는다**(spread + 일자만 덮어쓰기).
    //    종전 열거형은 ⑫·④가 실제로 보내던 `donorRelation`·`donorDeceased`(① 관계요건
    //    배제 판정축)를 빠뜨려 침묵 strip했다 — 단건 경로에서만 배제가 죽었다
    //    (일반건물 경로 `general-building-route-cards.ts`는 객체를 통째로 넘겨 정상이었다).
    //    spread는 **키를 세지 않으므로 누락이 구조적으로 불가능**하다 — ⑫에 필드가 늘면
    //    ⑭ 수정 없이 따라간다. Date 2개만 명시 변환한다(date-coerce 정책).
    //    ⚠️ 반대 방향은 tsc가 잡지 못한다(probe 실측: ⑫에만 있는 잉여 필드를 넣어도
    //       `npx tsc --noEmit` 0건 — spread에는 excess property check가 걸리지 않는다).
    //       ⑫에 엔진 미수용 필드를 추가할 때는 여기서 걸러낼 것.
    carryoverTaxation: data.carryoverTaxation
      ? {
          ...data.carryoverTaxation,
          giftRegistryDate: toDate(
            data.carryoverTaxation.giftRegistryDate,
            "carryoverTaxation.giftRegistryDate",
          ),
          donorAcquisitionDate: toDate(
            data.carryoverTaxation.donorAcquisitionDate,
            "carryoverTaxation.donorAcquisitionDate",
          ),
        }
      : undefined,
    isOneHousehold: data.isOneHousehold,
    temporaryTwoHouse: data.temporaryTwoHouse
      ? {
          previousAcquisitionDate: new Date(data.temporaryTwoHouse.previousAcquisitionDate),
          newAcquisitionDate: new Date(data.temporaryTwoHouse.newAcquisitionDate),
          // ⑭ §155⑯·⑱ — 날짜가 아닌 boolean·enum이라 변환 없이 그대로 통과시킨다.
          //    여기서 명시 전달하지 않으면 침묵 strip되어 처분기한 5년·기한 예외가 미도달한다.
          publicInstitutionRelocation: data.temporaryTwoHouse.publicInstitutionRelocation,
          relocatedSigunguCode: data.temporaryTwoHouse.relocatedSigunguCode,
          newHouseSigunguCode: data.temporaryTwoHouse.newHouseSigunguCode,
          disposalDelayReason: data.temporaryTwoHouse.disposalDelayReason,
        }
      : undefined,
    // ⑭ §155⑧ — resolvedDate는 string이라 Date 변환 필수(미제공 = 미해소).
    unavoidableOutsideCapitalHouse: data.unavoidableOutsideCapitalHouse
      ? {
          reason: data.unavoidableOutsideCapitalHouse.reason,
          resolvedDate: toOptionalDate(data.unavoidableOutsideCapitalHouse.resolvedDate),
        }
      : undefined,
    // ⑭ §155⑦ — acquisitionDate만 Date 변환 대상. 나머지는 boolean·number라 그대로 통과.
    ruralHouse: data.ruralHouse
      ? {
          ...data.ruralHouse,
          acquisitionDate: toOptionalDate(data.ruralHouse.acquisitionDate),
        }
      : undefined,
    // ⑭ §156의2⑤ 대체주택 비과세 특례 — string 일자 → Date 변환 (date-coerce)
    replacementHouse: data.replacementHouse
      ? {
          businessApprovalDate: toDate(data.replacementHouse.businessApprovalDate, "replacementHouse.businessApprovalDate"),
          completionDate: toDate(data.replacementHouse.completionDate, "replacementHouse.completionDate"),
          replacementResidenceMonths: data.replacementHouse.replacementResidenceMonths,
          willResideNewHouse: data.replacementHouse.willResideNewHouse,
        }
      : undefined,
    /**
     * ⑭ §89② 3년 초과 예외 — `completionDate`만 string → Date 변환한다.
     * ⚠️ `kind`를 보고 갈라야 한다 — `delay`·`none` 갈래에는 날짜가 없다.
     *    통째로 spread하면 `Date < string` 비교가 조용히 false가 되는 함정에 걸린다
     *    (memory `feedback_api_zod_schema_sync` · `lib/api/date-coerce.ts` 규약).
     */
    rightThreeYearException:
      data.rightThreeYearException === undefined
        ? undefined
        : data.rightThreeYearException.kind === "new_house"
          ? {
              ...data.rightThreeYearException,
              completionDate: toDate(
                data.rightThreeYearException.completionDate,
                "rightThreeYearException.completionDate",
              ),
            }
          : data.rightThreeYearException,
    /**
     * ⑭ §89② 합가 예외 — 날짜 필드가 없어 그대로 넘긴다(합가일은 `marriageMerge`·
     * `parentalCareMerge`가 이미 변환한다).
     */
    mergedHouseholdFirstHouse: data.mergedHouseholdFirstHouse,
    // ⑭ §155⑥1호 문화유산 주택 — boolean이라 그대로 통과.
    culturalHeritageHouse: data.culturalHeritageHouse,
    // 감면 매핑 — route-reductions-mapper.ts로 분리 (800줄 정책, 2026-06-11)
    reductions: mapReductionsToEngine(data.reductions),
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
    priorReductionUsage: data.priorReductionUsage ?? [],
    // P5 모드 2 (⑭): string 일자 → Date 변환
    specialHouseExclusions: (data.specialHouseExclusions ?? []).map((e) => ({
      article: e.article,
      houseAcquisitionDate: e.houseAcquisitionDate ? new Date(e.houseAcquisitionDate) : undefined,
      houseContractDate: e.houseContractDate ? new Date(e.houseContractDate) : undefined,
      isNationalHousing: e.isNationalHousing,
      requirementsConfirmed: e.requirementsConfirmed,
    })),
    // ⑭ NBL 정밀판정: raw 평면 → mapAssetToNblInput(nested + Date 일괄) 공용 헬퍼 (origin/master #223·#224)
    nonBusinessLandDetails: buildNblEngineInput(data.nonBusinessLandRaw),
    // ⑭ 다주택 중과 houses[]·presaleRights — Date 변환 + 9유형/P2 필드 매핑 헬퍼 (800줄 정책)
    houses: mapHousesToEngine(data.houses),
    presaleRights: mapPresaleRightsToEngine(data.presaleRights),
    sellingHouseId: data.sellingHouseId,
    gracePeriod: mapGracePeriodToEngine(data.gracePeriod),
    marriageMerge: data.marriageMerge
      ? { marriageDate: new Date(data.marriageMerge.marriageDate) }
      : undefined,
    parentalCareMerge: data.parentalCareMerge
      ? { mergeDate: new Date(data.parentalCareMerge.mergeDate) }
      : undefined,
    isFirstTransferredInMerge: data.isFirstTransferredInMerge,
    generalHouseGiftedFromDecedentWithin2yr: data.generalHouseGiftedFromDecedentWithin2yr,
    generalHouseHeldAtInheritance: data.generalHouseHeldAtInheritance,
    inheritedRightChoiceWhenBothHeld: data.inheritedRightChoiceWhenBothHeld,
    // ⑭ §154① 단서 — string 일자 → Date 변환 (date-coerce)
    oneHouseExemptionProviso: data.oneHouseExemptionProviso
      ? {
          reason: data.oneHouseExemptionProviso.reason,
          departureDate: toOptionalDate(data.oneHouseExemptionProviso.departureDate),
          expropriationDate: toOptionalDate(data.oneHouseExemptionProviso.expropriationDate),
          businessApprovalDate: toOptionalDate(data.oneHouseExemptionProviso.businessApprovalDate),
        }
      : undefined,
    // [C7 수정] 장기임대 감면 정밀 입력
    rentalReductionDetails: data.rentalReductionDetails
      ? {
          ...data.rentalReductionDetails,
          registrationDate: new Date(data.rentalReductionDetails.registrationDate),
          rentalStartDate: new Date(data.rentalReductionDetails.rentalStartDate),
          transferDate: new Date(data.rentalReductionDetails.transferDate),
          vacancyPeriods: data.rentalReductionDetails.vacancyPeriods.map((v) => ({
            startDate: new Date(v.startDate),
            endDate: new Date(v.endDate),
          })),
          rentHistory: data.rentalReductionDetails.rentHistory.map((r) => ({
            contractDate: new Date(r.contractDate),
            monthlyRent: r.monthlyRent,
            deposit: r.deposit,
            contractType: r.contractType,
          })),
        }
      : undefined,
    // [C7 수정] 신축/미분양 감면 정밀 입력
    newHousingDetails: data.newHousingDetails
      ? {
          ...data.newHousingDetails,
          acquisitionDate: new Date(data.newHousingDetails.acquisitionDate),
          transferDate: new Date(data.newHousingDetails.transferDate),
        }
      : undefined,
    // §114조의2 가산세 판정 필드
    acquisitionMethod: data.acquisitionMethod,
    appraisalValue: data.appraisalValue,
    // ⑭ 매매사례가액 추계(§176의2③1호) — salesCase 모드 시 엔진에 전달 (TypeScript 미감지 영역)
    similarSalesValue: data.similarSalesValue,
    isSelfBuilt: data.isSelfBuilt,
    buildingType: data.buildingType,
    constructionDate: toOptionalDate(data.constructionDate),
    extensionFloorArea: data.extensionFloorArea,
    // ⑭ Phase 2 증축 — 침묵 strip 방지 명시 매핑
    extensionStdPriceAtAcquisition: data.extensionStdPriceAtAcquisition,
    // 토지/건물 취득일 분리 (선택)
    landAcquisitionDate: toOptionalDate(data.landAcquisitionDate),
    // §104②1·2호 토지 파트 통산 (G-4) — Date 변환 필수
    landAcquisitionCause: data.landAcquisitionCause,
    landDecedentAcquisitionDate: toOptionalDate(data.landDecedentAcquisitionDate),
    landDonorAcquisitionDate: toOptionalDate(data.landDonorAcquisitionDate),
    landSplitMode: data.landSplitMode,
    // ⑭ 파트별 취득 모드 + 양도 분리 모드 — TypeScript 미감지 영역(엔진 명시 입력, §9 M2)
    landAcqMode: data.landAcqMode,
    buildingAcqMode: data.buildingAcqMode,
    isSeparateAcquisition: data.isSeparateAcquisition,
    // 개산공제(§163⑥) base 축소 — 기준시가는 raw, 엔진이 개산공제에서만 적용
    ownershipRatio: data.ownershipRatio,
    buildingStandardPriceAtAcquisition: data.buildingStandardPriceAtAcquisition,
    saleSplitMode: data.saleSplitMode,
    landSalesCaseValue: data.landSalesCaseValue,
    buildingSalesCaseValue: data.buildingSalesCaseValue,
    landTransferPrice: data.landTransferPrice,
    buildingTransferPrice: data.buildingTransferPrice,
    landAppraisalAtTransfer: data.landAppraisalAtTransfer,
    buildingAppraisalAtTransfer: data.buildingAppraisalAtTransfer,
    // ⚠️ JSON 경유 후 **문자열**로 도착한다 — `Date`로 바꾸지 않으면 엔진의 창 비교
    // (`getTime()`)가 런타임에 깨진다(`lib/api/date-coerce.ts`).
    appraisalDateAtTransfer: toOptionalDate(data.appraisalDateAtTransfer),
    saleSplitExemption: data.saleSplitExemption,
    landAcquisitionPrice: data.landAcquisitionPrice,
    buildingAcquisitionPrice: data.buildingAcquisitionPrice,
    landDirectExpenses: data.landDirectExpenses,
    buildingDirectExpenses: data.buildingDirectExpenses,
    landStandardPriceAtTransfer: data.landStandardPriceAtTransfer,
    buildingStandardPriceAtTransfer: data.buildingStandardPriceAtTransfer,
    standardPricePerSqmAtAcquisition: data.standardPricePerSqmAtAcquisition,
    acquisitionArea: data.acquisitionArea,
    selfOwns: data.selfOwns,
    // 1990.8.30. 이전 취득 토지 기준시가 환산 (선택)
    pre1990Land: data.pre1990Land
      ? {
          acquisitionDate: new Date(data.pre1990Land.acquisitionDate),
          transferDate: new Date(data.pre1990Land.transferDate),
          areaSqm: data.pre1990Land.areaSqm,
          pricePerSqm_1990: data.pre1990Land.pricePerSqm_1990,
          pricePerSqm_atTransfer: data.pre1990Land.pricePerSqm_atTransfer,
          grade_1990_0830: data.pre1990Land.grade_1990_0830,
          gradePrev_1990_0830: data.pre1990Land.gradePrev_1990_0830,
          gradeAtAcquisition: data.pre1990Land.gradeAtAcquisition,
          forceRatioCap: data.pre1990Land.forceRatioCap,
        }
      : undefined,
    // 개별주택가격 미공시 취득 환산 (§164⑤) — 문자열 날짜 → Date 변환
    preHousingDisclosure: data.preHousingDisclosure
      ? {
          ...data.preHousingDisclosure,
          firstDisclosureDate: new Date(data.preHousingDisclosure.firstDisclosureDate),
        }
      : undefined,
    // 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨)
    inheritedAcquisition: data.inheritedAcquisition
      ? buildInheritedAcquisition(data.inheritedAcquisition, transferDate, data.transferPrice)
      : undefined,
    // 상속 주택 환산취득가 보조 입력 (§164⑤·§176조의2④) — Date 변환
    inheritedHouseValuation: data.inheritedHouseValuation
      ? {
          ...data.inheritedHouseValuation,
          inheritanceDate: new Date(data.inheritedHouseValuation.inheritanceDate),
          transferDate: new Date(data.inheritedHouseValuation.transferDate),
          firstDisclosureDate: data.inheritedHouseValuation.firstDisclosureDate
            ? new Date(data.inheritedHouseValuation.firstDisclosureDate)
            : undefined,
        }
      : undefined,
    // ⑭ 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 (§163⑨2호 max) — 숫자 payload(Date 변환 불요)
    ...(data.commercialInheritanceValuation ? { commercialInheritanceValuation: data.commercialInheritanceValuation } : {}),
    // 다필지 분리 계산 (환지·합병 등) — 문자열 날짜 → Date 변환
    parcels: data.parcels?.map((p) => ({
      ...p,
      acquisitionDate: new Date(p.acquisitionDate),
      replottingConfirmDate: p.replottingConfirmDate ? new Date(p.replottingConfirmDate) : undefined,
    })),
    // 신고불성실·지연납부 가산세 (선택)
    //
    // 🔴 G-05 ⑭ — `lateFiling` 은 이 spread 를 타고 그대로 엔진에 닿는다. 날짜를 여기서
    //    `new Date()` 로 바꾸지 않는 것이 **의도**다: 공용 leaf `late-filing-reduction.ts`
    //    가 `parseISO` 로 받는 계약이고, 저장소는 `new Date(문자열)` 직접 호출을 금지한다
    //    (`lib/api/date-coerce.ts` 정책 — JSON 경유 후 `Date < string` silent false 함정).
    filingPenaltyDetails: data.filingPenaltyDetails
      ? { ...data.filingPenaltyDetails }
      : undefined,
    delayedPaymentDetails: data.delayedPaymentDetails
      ? {
          unpaidTax: data.delayedPaymentDetails.unpaidTax,
          paymentDeadline: new Date(data.delayedPaymentDetails.paymentDeadline),
          actualPaymentDate: data.delayedPaymentDetails.actualPaymentDate
            ? new Date(data.delayedPaymentDetails.actualPaymentDate)
            : undefined,
        }
      : undefined,
    // 수정신고(경정) — Date 변환 (toOptionalDate 정책)
    amendment: data.amendment
      ? {
          originalDeterminedTax: data.amendment.originalDeterminedTax,
          applyUnderReportingPenalty: data.amendment.applyUnderReportingPenalty,
          underReportingReason: data.amendment.underReportingReason,
          underReductionMode: data.amendment.underReductionMode,
          statutoryFilingDeadline: toOptionalDate(data.amendment.statutoryFilingDeadline),
          amendedFilingDate: toOptionalDate(data.amendment.amendedFilingDate),
          priorAssessmentNotified: data.amendment.priorAssessmentNotified,
          applyLatePaymentPenalty: data.amendment.applyLatePaymentPenalty,
          amendedPaymentDate: toOptionalDate(data.amendment.amendedPaymentDate),
          // 경정청구 — §45의2 (correctionKind·claimReasonType 통과, posteriorEventDate Date 변환)
          correctionKind: data.amendment.correctionKind,
          claimReasonType: data.amendment.claimReasonType,
          posteriorEventDate: toOptionalDate(data.amendment.posteriorEventDate),
        }
      : undefined,
    // ⑭ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — Date 변환 필수
    // 주의: toDate()/toOptionalDate() 헬퍼 사용 (lib/api/date-coerce.ts 정책)
    rentalHousingException: toRentalHousingExceptionEngineInput(data.rentalHousingException),
    // ⑭ 사례 28 — 부수토지 한도 산정 (영 §154⑦). occupancyApprovalDate 등은 UI에서 acquisitionDate로 변환됨.
    buildingFootprintArea: data.buildingFootprintArea,
    isUrbanArea: data.isUrbanArea,
    appurtenantLandZone: data.appurtenantLandZone,
    // ⑭ 부수토지 일체과세 판정 (§89①3호·영§154⑦) — landNature는 Zod 검증되나 매핑 누락 시 엔진 미도달.
    // primaryContextForCompanionRate가 설정된 bundled 토지-primary에서 resolveCompanionLandRate가
    // landNature !== "appurtenant_to_housing"(undefined 포함)이면 applied=false로 일체과세 미발동.
    landNature: data.landNature,
    // ⑭ 상업용건물·오피스텔 환산취득가 서브객체 (TypeScript 미감지 — 명시 매핑 필수)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(data.commercialBuildingValuation ? { commercialBuildingValuation: data.commercialBuildingValuation as any } : {}),
    // ⑭ 상업용건물 부수토지 초과분 판정 (「지방세법 시행령」 §101①2호·§101②).
    // Date 변환 없음(면적·용도지역·플래그만). 누락 시 STEP 0.62가 no-op으로 조용히 지나간다.
    ...(data.commercialAppurtenantLand ? { commercialAppurtenantLand: data.commercialAppurtenantLand } : {}),
    // ⑭ 일반건물 환산취득가 (TypeScript 미감지). ⑭ 부담부증여 §159 — Date 변환 없음.
    ...(data.burdenedGiftInfo ? { burdenedGiftInfo: data.burdenedGiftInfo } : {}),
    // ⑭ 재개발/재건축 (시행령 §166) — Date 4개 변환 (approvalDate/settlementSaleDate/firstDisclosureDate/completionDate)
    ...(data.redevelopment ? { redevelopment: { ...data.redevelopment, approvalDate: new Date(data.redevelopment.approvalDate), settlementSaleDate: toOptionalDate(data.redevelopment.settlementSaleDate), firstDisclosureDate: toOptionalDate(data.redevelopment.firstDisclosureDate), completionDate: toOptionalDate(data.redevelopment.completionDate), otherHouseAcquisitionDate: toOptionalDate(data.redevelopment.otherHouseAcquisitionDate) } } : {}),
    // ⑭ Phase 2 (2026-05-12): transferType 패스스루 — 양도 형태 (양도자 관점)
    // "burdened_gift" 시 엔진 §159 분기 활성. 미지정 시 "regular" 자동 보정.
    ...(data.transferType !== undefined ? { transferType: data.transferType } : {}),
    // ⑭ 가업상속공제 §97의2④ (TypeScript 미감지 — 명시 매핑 필수). inheritanceDate: string 그대로.
    ...(data.familyBusinessInheritance ? { familyBusinessInheritance: data.familyBusinessInheritance } : {}),
    ...(data.generalBuildingValuation ? (() => {
      const buildingAcq = toOptionalDate(data.generalBuildingValuation.buildingAcquisitionDate);
      // #4-a: 토지 상속·증여 보조 필드 Date 변환
      const decedentAcq = toOptionalDate(data.generalBuildingValuation.decedentAcquisitionDate);
      const donorAcq = toOptionalDate(data.generalBuildingValuation.donorAcquisitionDate);
      return {
        generalBuildingValuation: {
          ...data.generalBuildingValuation,
          totalTransferPrice: data.transferPrice,               // 최상위 양도가액 주입
          transferDate,                                          // 이미 Date 변환됨
          acquisitionDate,                                       // 이미 Date 변환됨
          // ⑭ 건물 취득일 string → Date 변환 (소득세법 §114조의2 ① 5년 기산점)
          ...(buildingAcq ? { buildingAcquisitionDate: buildingAcq } : {}),
          ...(decedentAcq ? { decedentAcquisitionDate: decedentAcq } : {}),
          ...(donorAcq ? { donorAcquisitionDate: donorAcq } : {}),
        },
      };
    })() : {}),
  };
}
