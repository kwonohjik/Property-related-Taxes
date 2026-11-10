/**
 * 양도소득세 연간 합산 API — 건별 엔진 입력 매핑(⑭). `route.ts`에서 분리했다(800줄 정책 · 무동작 이동).
 */

import { toEngineSec163_9Inputs } from "../route-inherited-acquisition";
import { toEngineOneHouseExemptionProviso } from "@/lib/api/exemption-proviso-coerce";
import { toEngineFinalHouseRestart } from "@/lib/api/final-house-restart-coerce";
import type { MultiInputSchemaInput } from "@/lib/api/transfer-tax-schema";
import {
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { toEngineLandRebuild } from "@/lib/api/transfer-tax-schema-land-rebuild";
import { composeSplitCarryover } from "@/lib/tax-engine/transfer-split-carryover-compose";
import { mapTemporaryTwoHouseEraFacts } from "@/lib/api/temp-two-house-era-route-map";
import { mapGiftHouseholdBasis } from "@/lib/api/gift-household-basis-route-map";
import {
  mapHousesToEngine,
  mapGracePeriodToEngine,
  mapPresaleRightsToEngine,
  mapSameDayPresaleRightsToEngine,
  householdNoPresaleRightsConfirmedAtTransfer,
  toEngineAptDeadlineExtension,
  mapSpecialHouseExclusionsToEngine,
} from "@/lib/api/transfer-route-multi-house";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { mapReductionsToEngine } from "../route-reductions-mapper";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { toEngineCarryoverTaxation } from "@/lib/api/carryover-engine-input";

type MultiPropertyInput = MultiInputSchemaInput["properties"][number];

/**
 * ⑭ 다건 건별 엔진 입력 — Zod 통과 본문 1건 → 합산 엔진 항목(Date 변환 포함). `route.ts`(800줄 정책)에서 분리했다(무동작 이동).
 * 일반건물·지분 분할은 이 항목을 받아 `multi-gb-expansion.ts`가 카드로 펼친다.
 *
 * @param formSpecialHouseExclusions 신고 단위 감면주택 선언(건별 값이 없을 때의 폴백 — 종전 `data.specialHouseExclusions`).
 */
export function toMultiEngineItem(
  p: MultiPropertyInput,
  formSpecialHouseExclusions: MultiInputSchemaInput["specialHouseExclusions"],
): TransferTaxItemInput {
  const base: Omit<TransferTaxInput, "annualBasicDeductionUsed" | "skipBasicDeduction"> = {
    propertyType: p.propertyType,
    transferPrice: p.transferPrice,
    // ⑭ 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용(⑬이 지분 모드에서만 전송).
    //    누락하면 지분 자산의 §95③ 고가주택 안분 분모가 지분 양도가액이 되어 안분이 틀린다.
    totalPropertyTransferPrice: p.totalPropertyTransferPrice,
    transferDate: toDate(p.transferDate, "transferDate"),
    acquisitionPrice: p.acquisitionPrice,
    acquisitionDate: toDate(p.acquisitionDate, "acquisitionDate"),
    // ⑭ §77 직접 경작 토지 — 농특세령 §4①1호 괄호 (D11-01).
    //    이 route의 base 객체는 단건 `buildTransferEngineInput`을 재사용하지 않고 키를
    //    자체 열거하므로, ⑬만 고치면 값이 여기서 조용히 사라진다.
    isSelfCultivatedExpropriatedLand: p.isSelfCultivatedExpropriatedLand,
    // ⑭ 자산-수준 매매계약일 — §99의3 등 매매계약일 기준 조문 시한 판정용 (per-asset 단건 엔진 honor)
    assetContractDate: toOptionalDate(p.assetContractDate),
    /**
     * P5 모드 2 (⑭): 보유 감면주택 주택수 제외 — **건별 키**(⑬ `specialHouseExclusionsPayload`)가 정본이다.
     * 명부가 건마다 따로라 행 id도 그 건의 명부를 가리킨다. 건별 선언이 **비어 있을 때만** top-level(종전 계약 —
     * API 직접 호출, 전 자산 주입)로 후퇴한다 — ⑬은 선언이 없는 건에도 `[]`를 싣으므로 「키 유무」로 가르면
     * top-level이 가려진다(R97-10 실측). 둘을 합치지 않는다 — 같은 주택을 두 번 빼게 된다.
     * 매핑은 단건 `engine-input.ts`와 같은 leaf다.
     * 🔴 종전에는 top-level만 읽었고 ⑬은 아무것도 싣지 않아 엔진에 늘 빈 배열이 닿았다(Q4).
     */
    specialHouseExclusions: mapSpecialHouseExclusionsToEngine(
      p.specialHouseExclusions?.length ? p.specialHouseExclusions : formSpecialHouseExclusions,
    ),
    expenses: p.expenses,
    // ⑭ §97② 단서 swap 분리 입력 — 미명시 시 undefined (swap 비활성)
    capitalExpenditure: p.capitalExpenditure,
    transferExpense: p.transferExpense,
    // ⑭ §97③ 감가상각비 — 취득가액에서 공제 (TS 미감지 침묵 strip 주의)
    depreciationAmount: p.depreciationAmount,
    // ⑭ §89①4호 가목 1세대1입주권 — 조합원입주권 수 (right_to_move_in 자산 전용)
    householdRightCount: p.householdRightCount,
    useEstimatedAcquisition: p.useEstimatedAcquisition,
    standardPriceAtAcquisition: p.standardPriceAtAcquisition,
    // 개산공제(§163⑥) base 축소 — 기준시가는 raw, 엔진이 개산공제에서만 적용
    ownershipRatio: p.ownershipRatio,
    standardPriceAtTransfer: p.standardPriceAtTransfer,
    // ⑭ §164⑧ 동일조정기간 환산 — 누락 시 침묵 strip
    sameAdjustmentPeriod: p.sameAdjustmentPeriod,
    /**
     * ⑭ F-12 — 단건 정본 `engine-input.ts`와 같은 키를 옮긴다. 이 route는 base 객체를 자체 열거하므로
     * ⑬만 고치면 값이 여기서 조용히 사라진다(optional이라 TypeScript가 못 잡는다). 옮기지 않는 키는
     * ⑫(`transfer-tax-schema-multi-refines.ts`)가 거부하거나 근거와 함께 무효과로 분류한다.
     */
    // §164⑨ 1호(공익수용: ㎡단가·주택 총액·건물 분리 토지분)·2호(공매·경락)
    transferCause: p.transferCause,
    standardPricePerSqmAtTransfer: p.standardPricePerSqmAtTransfer,
    transferArea: p.transferArea,
    compensationPerSqm: p.compensationPerSqm,
    compensationBasisStdPrice: p.compensationBasisStdPrice,
    isAuctionTransfer: p.isAuctionTransfer,
    auctionPrice: p.auctionPrice,
    housingCompensationTotal: p.housingCompensationTotal,
    housingCompensationBasisTotal: p.housingCompensationBasisTotal,
    splitLandCompensationTotal: p.splitLandCompensationTotal,
    splitLandCompensationBasisTotal: p.splitLandCompensationBasisTotal,
    // 토지·건물 분리(소령 §166⑥·§168②) — 날짜 4개는 JSON 경유 string이라 Date 변환 필수
    selfOwns: p.selfOwns,
    buildingOwnerSameHousehold: p.buildingOwnerSameHousehold,
    buildingOwnerHouseholdMerged: p.buildingOwnerHouseholdMerged,
    buildingOwnerHouseholdMergeDate: toOptionalDate(p.buildingOwnerHouseholdMergeDate),
    landAcquisitionDate: toOptionalDate(p.landAcquisitionDate),
    landAcquisitionCause: p.landAcquisitionCause,
    landDecedentAcquisitionDate: toOptionalDate(p.landDecedentAcquisitionDate),
    landSec164Value: p.landSec164Value,
    landSec164ValueWhole: p.landSec164ValueWhole,
    isPartialAreaTransfer: p.isPartialAreaTransfer,
    buildingSec164Value: p.buildingSec164Value,
    buildingHouseKind: p.buildingHouseKind,
    buildingBundledStdPrice: p.buildingBundledStdPrice,
    landHouseExisted: p.landHouseExisted,
    landHouseSec164Value: p.landHouseSec164Value,
    houseFirstDisclosureDate: p.houseFirstDisclosureDate,
    landDonorAcquisitionDate: toOptionalDate(p.landDonorAcquisitionDate),
    landRebuildPriorHouse: toEngineLandRebuild(p.landRebuildPriorHouse),
    // ⑭ 주택·건물 split 파트 이월과세(§97의2①) — 와이어(사건 1벌 + 파트 N벌) → 엔진 input. 단건 `engine-input.ts`와 같은 합성기(Date 변환·증여세 안분).
    //   파트 A/B는 엔진(STEP 0.476)이 **그 자산의 결정세액**으로 정한다 — 연간 합산의 다른 이월과세(그 해 전체 비교)와 비교 단위가 다르다(Q-4 b · route 고지).
    ...composeSplitCarryover({
      carryoverGiftEvent: p.carryoverGiftEvent,
      landCarryoverPart: p.landCarryoverPart,
      buildingCarryoverPart: p.buildingCarryoverPart,
      landAcquisitionPrice: p.landAcquisitionPrice,
      buildingAcquisitionPrice: p.buildingAcquisitionPrice,
    } as Parameters<typeof composeSplitCarryover>[0]),
    landAcqMode: p.landAcqMode,
    buildingAcqMode: p.buildingAcqMode,
    isSeparateAcquisition: p.isSeparateAcquisition,
    buildingStandardPriceAtAcquisition: p.buildingStandardPriceAtAcquisition,
    acqContractLandPrice: p.acqContractLandPrice,
    acqContractBuildingPrice: p.acqContractBuildingPrice,
    acqContractOtherLaw: p.acqContractOtherLaw,
    saleSplitMode: p.saleSplitMode,
    landSalesCaseValue: p.landSalesCaseValue,
    buildingSalesCaseValue: p.buildingSalesCaseValue,
    landTransferPrice: p.landTransferPrice,
    buildingTransferPrice: p.buildingTransferPrice,
    // 공유지분 — 계약서 구분 기재(100%). §100③을 계약서 금액으로 판정한다(`sale-split-contract-judgment.ts`).
    contractLandTransferPrice: p.contractLandTransferPrice,
    contractBuildingTransferPrice: p.contractBuildingTransferPrice,
    landAppraisalAtTransfer: p.landAppraisalAtTransfer,
    buildingAppraisalAtTransfer: p.buildingAppraisalAtTransfer,
    appraisalDateAtTransfer: toOptionalDate(p.appraisalDateAtTransfer),
    landAppraisalAtAcquisition: p.landAppraisalAtAcquisition,
    buildingAppraisalAtAcquisition: p.buildingAppraisalAtAcquisition,
    saleSplitExemption: p.saleSplitExemption,
    landAcquisitionPrice: p.landAcquisitionPrice,
    buildingAcquisitionPrice: p.buildingAcquisitionPrice,
    landDirectExpenses: p.landDirectExpenses,
    buildingDirectExpenses: p.buildingDirectExpenses,
    landStandardPriceAtTransfer: p.landStandardPriceAtTransfer,
    buildingStandardPriceAtTransfer: p.buildingStandardPriceAtTransfer,
    standardPricePerSqmAtAcquisition: p.standardPricePerSqmAtAcquisition,
    acquisitionArea: p.acquisitionArea,
    // 부수토지 배율 한도(영 §168의12) — 분리 축(별개 취득)에서 엔진이 소비
    buildingFootprintArea: p.buildingFootprintArea,
    isUrbanArea: p.isUrbanArea,
    appurtenantLandZone: p.appurtenantLandZone,
    householdHousingCount: p.householdHousingCount,
    // ⑭ 양도 주택의 양도 당시 기준시가 — 명부 없는 중과 판정 구성의 양도 주택 행(단건 `engine-input.ts`와 같은 키)
    sellingHouseStdPriceAtTransfer: p.sellingHouseStdPriceAtTransfer,
    // ⑭ §104①4호 단서(영 §167의6 1·2호) — 단건 정본과 같은 leaf(engine-input.ts).
    presaleRightNoOtherRight: p.presaleRightNoOtherRight,
    presaleRightAgeOrSpouseMet: p.presaleRightAgeOrSpouseMet,
    residencePeriodMonths: p.residencePeriodMonths,
    isRegulatedArea: p.isRegulatedArea,
    wasRegulatedAtAcquisition: p.wasRegulatedAtAcquisition,
    // ⑭ ④와 짝 — 제공 시 엔진이 `isRegulatedByBjdCode()` 정밀 판정을 쓴다(단건 `engine-input.ts:68`).
    regionCode: p.regionCode,
    regionInDesignatedDistrict: p.regionInDesignatedDistrict,
    isUnregistered: p.isUnregistered,
    isNonBusinessLand: p.isNonBusinessLand,
    isDesignatedArea: p.isDesignatedArea,
    isSuccessorRightToMoveIn: p.isSuccessorRightToMoveIn,
    acquisitionCause: p.acquisitionCause,
    // ⑭ 배우자등 이월과세(§97의2) — 단건 정본(`engine-input.ts` `toEngineCarryoverTaxation`)과 같은 Date 변환(트랙 CO).
    carryoverTaxation: toEngineCarryoverTaxation(p.carryoverTaxation, "carryoverTaxation"),
    // ⑭ 부담부증여(소령 §159) — 단건 정본(`engine-input.ts` `burdenedGiftInfo`·`transferType`)과 같은 패스스루(Date 변환 없음 · 트랙 BG).
    burdenedGiftInfo: p.burdenedGiftInfo,
    transferType: p.transferType,
    decedentAcquisitionDate: toOptionalDate(p.decedentAcquisitionDate),
    nonHeirBequest: p.nonHeirBequest,
    // ⑭ US-07 — 단건 정본(`engine-input.ts`)과 같다
    inheritedPresaleCompletedByHeir: p.acquisitionCause === "inheritance" ? p.inheritedPresaleCompletedByHeir : undefined,
    decedentSameHouseholdBeforeInheritance: p.decedentSameHouseholdBeforeInheritance,
    decedentCohabitationHoldingStartDate: toOptionalDate(p.decedentCohabitationHoldingStartDate),
    decedentCohabitationResidenceMonths: p.decedentCohabitationResidenceMonths,
    donorAcquisitionDate: toOptionalDate(p.donorAcquisitionDate),
    // ⑭ 결정 #38-3 — 증여받은 주택의 증여자와 같은 세대 사실. 단건 정본(`engine-input.ts`)과 같은 함수 — 한쪽만 매핑하면 다건에서 침묵 strip된다.
    giftHouseholdBasis: mapGiftHouseholdBasis({
      acquisitionCause: p.acquisitionCause,
      acquisitionDate: p.acquisitionDate,
      donorAcquisitionDate: p.donorAcquisitionDate,
      giftSameHouseholdContinuous: p.giftSameHouseholdContinuous,
      giftHouseholdHoldingStartDate: p.giftHouseholdHoldingStartDate,
      giftPriorHouseholdResidenceMonths: p.giftPriorHouseholdResidenceMonths,
      giftDonorDeceased: p.giftDonorDeceased,
      giftRejoinedAfterDivorce: p.giftRejoinedAfterDivorce,
    }),
    /**
     * ⑭ 비주택 → 주택 용도변경 §95⑤·⑥ — 날짜만 Date 로, 절사 개월은 number 그대로.
     * 단건 정본 `app/api/calc/transfer/engine-input.ts:80`.
     *
     * 🔴 ⑬·⑭ **두 층이 모두 비어 있었다**(P1-02 분양권과 같은 형태). ⑫ Zod 는 이 키를
     *    수락하고 엔진은 장특공제(`transfer-tax-lthd.ts:291`)·1세대1주택 기산
     *    (`transfer-tax-exemption-requirements.ts:272·350·419`)에 쓰는데, 아무도 보내지
     *    않아 **같은 자산이 단건과 다건에서 다른 세액**이 됐다. 한쪽만 고치면 도달하지
     *    않으므로 ⑬(`multi-transfer-tax-api.ts`)과 같은 PR 에서 배선한다.
     */
    nonHousingToHousingConversion: p.nonHousingToHousingConversion
      ? {
          residentialUseStartDate: toDate(
            p.nonHousingToHousingConversion.residentialUseStartDate,
            "nonHousingToHousingConversion.residentialUseStartDate",
          ),
          residenceMonthsTrimmed: p.nonHousingToHousingConversion.residenceMonthsTrimmed,
        }
      : undefined,
    isOneHousehold: p.isOneHousehold,
    temporaryTwoHouse: p.temporaryTwoHouse
      ? {
          previousAcquisitionDate: toDate(p.temporaryTwoHouse.previousAcquisitionDate, "temporaryTwoHouse.previousAcquisitionDate"),
          newAcquisitionDate: toDate(p.temporaryTwoHouse.newAcquisitionDate, "temporaryTwoHouse.newAcquisitionDate"),
          // ⑭ §155⑯·⑱ — boolean·enum이라 Date 변환은 없지만 명시 전달하지 않으면 침묵 strip된다
          //    (단건 정본 `app/api/calc/transfer/engine-input.ts:102-107`).
          publicInstitutionRelocation: p.temporaryTwoHouse.publicInstitutionRelocation,
          relocatedSigunguCode: p.temporaryTwoHouse.relocatedSigunguCode,
          newHouseSigunguCode: p.temporaryTwoHouse.newHouseSigunguCode,
          disposalDelayReason: p.temporaryTwoHouse.disposalDelayReason,
          // ⑭ §155①2호 — 신규 취득 당시 조정 여부·계약일·전입·임차인 단서(OH-01 A2b). 단건·다건 공용.
          ...mapTemporaryTwoHouseEraFacts(p.temporaryTwoHouse),
        }
      : undefined,
    // ⑭ §155⑧ 수도권 밖 부득이 — resolvedDate는 string이라 Date 변환 필수. 해소일 ↔ 「양도일 현재 미해소」 택일(⑫ 검증, #31).
    unavoidableOutsideCapitalHouse: p.unavoidableOutsideCapitalHouse
      ? {
          reason: p.unavoidableOutsideCapitalHouse.reason,
          resolvedDate: toOptionalDate(p.unavoidableOutsideCapitalHouse.resolvedDate),
          unresolvedAtTransfer: p.unavoidableOutsideCapitalHouse.unresolvedAtTransfer,
          houseId: p.unavoidableOutsideCapitalHouse.houseId,
        }
      : undefined,
    // ⑭ §155⑦ 농어촌주택 — acquisitionDate만 Date 변환 대상. 나머지는 boolean·number라 그대로 통과.
    ruralHouse: p.ruralHouse
      ? {
          ...p.ruralHouse,
          acquisitionDate: toOptionalDate(p.ruralHouse.acquisitionDate),
        }
      : undefined,
    // ⑭ §155④⑤ 합가 후 첫 양도 — 엔진 게이트가 `=== true`를 요구(transfer-tax-exemption.ts).
    isFirstTransferredInMerge: p.isFirstTransferredInMerge,
    /**
     * ⑭ §89② 배제 축 — ⑬(`multi-transfer-tax-api.ts`)이 보내고 ⑫가 통과시키는데
     * **여기서 통째로 사라지고 있었다**(2026-08-26 Phase 4 실측). 단건 route
     * (`engine-input.ts`)에는 있고 다건에만 없던 침묵 strip이라 TypeScript가 잡지 못했다.
     *
     * 방향은 항목마다 다르다 — `generalHouseGiftedFromDecedentWithin2yr`가 빠지면 §155②
     * 게이트-오프가 풀려 **비과세가 과다**해지고, 나머지가 빠지면 예외 선언이 닿지 않아
     * 판정 불가 경고만 남는다.
     */
    rightThreeYearException:
      p.rightThreeYearException === undefined
        ? undefined
        : p.rightThreeYearException.kind === "new_house"
          ? {
              ...p.rightThreeYearException,
              completionDate: toDate(
                p.rightThreeYearException.completionDate,
                "rightThreeYearException.completionDate",
              ),
            }
          : p.rightThreeYearException,
    mergedHouseholdFirstHouse: p.mergedHouseholdFirstHouse,
    culturalHeritageHouse: p.culturalHeritageHouse,
    culturalHeritageHouseId: p.culturalHeritageHouseId,
    /**
     * ⑭ §155의2 장기저당담보주택 · §155의3 상생임대주택 — **단건과 같은 규칙을 다건에도 싣는다**.
     *
     * 🔴 형제 특례 키(§155⑦⑧·§156의2⑤·문화유산)가 전부 여기 매핑돼 있는데 이 둘만 빼면
     *    「단건 빌더는 싣는데 다건 빌더만 빠뜨린」 결함(리뷰 G-11)의 재발이다
     *    — 같은 규칙을 두 번 쓰지 않는다는 규약이 `transfer-tax-api-body-blocks.ts:30`에 남아 있다.
     *    Date 변환 대상은 단건(`engine-input.ts`)과 **동일**하다.
     */
    longTermMortgageHouse: p.longTermMortgageHouse
      ? {
          contractDate: toDate(
            p.longTermMortgageHouse.contractDate,
            "longTermMortgageHouse.contractDate",
          ),
          borrowerAgeAtContract: p.longTermMortgageHouse.borrowerAgeAtContract,
          contractYears: p.longTermMortgageHouse.contractYears,
          maturityLumpSumRepayment: p.longTermMortgageHouse.maturityLumpSumRepayment,
          transferredBeforeMaturity: p.longTermMortgageHouse.transferredBeforeMaturity,
          isTransferredHouseMortgaged: p.longTermMortgageHouse.isTransferredHouseMortgaged,
          parentalCareMerge: p.longTermMortgageHouse.parentalCareMerge,
        }
      : undefined,
    /**
     * ⑭ §89①4호 1세대1입주권 **판정 사실** (P4-3b).
     *
     * 🔴 `otherHouseAcquisitionDate`는 **반드시 Date로** 바꾼다 — 엔진이
     *      `input.transferDate <= deadline`으로 3년 요건을 잰다. string이 그대로 도달하면
     *      `Date <= string` 비교가 **조용히 false**가 되어 나목이 통째로 사라진다.
     */
    oneRightExemptionFacts: p.oneRightExemptionFacts
      ? {
            eligibleAtApproval: p.oneRightExemptionFacts.eligibleAtApproval,
            otherHouseAcquisitionDate: toOptionalDate(
                p.oneRightExemptionFacts.otherHouseAcquisitionDate,
            ),
            otherHouseDisposalDelayReason: p.oneRightExemptionFacts.otherHouseDisposalDelayReason,
            // E-3 후속 — 분양권 요건 연혁. Date 변환 필수.
            approvalDate: toOptionalDate(p.oneRightExemptionFacts.approvalDate),
            originalAssetType: p.oneRightExemptionFacts.originalAssetType,
            landHouseholdOwnedBuilding: p.oneRightExemptionFacts.landHouseholdOwnedBuilding,
          }
      : undefined,
    winWinRentalHouse: p.winWinRentalHouse
      ? {
          winWinContractDate: toDate(
            p.winWinRentalHouse.winWinContractDate,
            "winWinRentalHouse.winWinContractDate",
          ),
          increaseRatePct: p.winWinRentalHouse.increaseRatePct,
          priorLeaseMonths: p.winWinRentalHouse.priorLeaseMonths,
          winWinLeaseMonths: p.winWinRentalHouse.winWinLeaseMonths,
          // 2026 개정(제36737호) 양도기한 산정용 — 단건 route(engine-input.ts)와 같은 변환.
          winWinLeaseEndDate: toOptionalDate(p.winWinRentalHouse.winWinLeaseEndDate),
        }
      : undefined,
    inheritedRightChoiceWhenBothHeld: p.inheritedRightChoiceWhenBothHeld,
    generalHouseGiftedFromDecedentWithin2yr: p.generalHouseGiftedFromDecedentWithin2yr,
    // ⑭ OH-12c·OH-12 — string 일자 → Date (date-coerce)
    generalHouseGiftDate: toOptionalDate(p.generalHouseGiftDate),
    generalHouseRightAtInheritance: p.generalHouseRightAtInheritance,
    // ⑭ §156의2⑤ 대체주택 비과세 특례 — string 일자 → Date 변환 (date-coerce)
    replacementHouse: p.replacementHouse
      ? {
          businessApprovalDate: toDate(p.replacementHouse.businessApprovalDate, "replacementHouse.businessApprovalDate"),
          completionDate: toOptionalDate(p.replacementHouse.completionDate),
          soldBeforeCompletion: p.replacementHouse.soldBeforeCompletion,
          replacementResidenceMonths: p.replacementHouse.replacementResidenceMonths,
          willResideNewHouse: p.replacementHouse.willResideNewHouse,
        }
      : undefined,
    // 감면 매핑 — 단건 route와 공용 (rental §97 시리즈 Date 변환 포함, 2026-06-11)
    reductions: mapReductionsToEngine(p.reductions),
    // ⑭ NBL 정밀판정: 단건 route와 동일 공용 헬퍼 (raw 평면 → nested + Date)
    nonBusinessLandDetails: buildNblEngineInput(p.nonBusinessLandRaw),
    // ⑭ 다건도 단건과 동일 공용 헬퍼 — P2 특례(인구감소·부득이사유·장기임대 등) + ⑬ 소형신축/미분양 전 필드 도달 (선재 strip 갭 해소)
    houses: mapHousesToEngine(p.houses),
    // ⑭ 세대 보유 분양권·입주권 — 단건 route와 동일 공용 헬퍼(취득일 string→Date).
    //    ⑬과 함께 배선해야 도달한다(P1-02 — 종전에는 두 층 모두 비어 있었다).
    presaleRights: mapPresaleRightsToEngine(p.presaleRights, p.transferDate),
    sameDayAcquiredPresaleRights: mapSameDayPresaleRightsToEngine(p.presaleRights, p.transferDate),
    // ⑭ §89①4호 가·나목 분양권 게이트 — PR-D ⑧ 확인 echo, 단건 정본과 같은 leaf(engine-input.ts).
    householdNoPresaleRightsConfirmed: householdNoPresaleRightsConfirmedAtTransfer(
      p.presaleRights,
      p.transferDate,
      p.householdNoPresaleRightsConfirmed,
    ),
    sellingHouseId: p.sellingHouseId,
    // ⑭ 다주택 중과 한시 유예/경과조치 — 단건 route와 동일 공용 헬퍼(Date 변환). 자산별 gracePeriod.
    gracePeriod: mapGracePeriodToEngine(p.gracePeriod),
    marriageMerge: p.marriageMerge ? { marriageDate: toDate(p.marriageMerge.marriageDate, "marriageMerge.marriageDate") } : undefined,
    // ⑭ §154① 단서 — string 일자 → Date 변환 (date-coerce)
    oneHouseExemptionProviso: toEngineOneHouseExemptionProviso(p.oneHouseExemptionProviso),
    // ⑭ OH-22 §154⑤ 단서 처분 이력 — 단건과 같은 변환
    finalOneHouseRestart: toEngineFinalHouseRestart(p.finalOneHouseRestart),
    parentalCareMerge: p.parentalCareMerge
      ? {
          mergeDate: toDate(p.parentalCareMerge.mergeDate, "parentalCareMerge.mergeDate"),
          ...(p.parentalCareMerge.parentAge ? { parentAge: p.parentalCareMerge.parentAge } : {}),
        }
      : undefined,
    newHousingDetails: p.newHousingDetails
      ? {
          ...p.newHousingDetails,
          acquisitionDate: toDate(p.newHousingDetails.acquisitionDate, "newHousingDetails.acquisitionDate"),
          transferDate: toDate(p.newHousingDetails.transferDate, "newHousingDetails.transferDate"),
        }
      : undefined,
    acquisitionMethod: p.acquisitionMethod,
    appraisalValue: p.appraisalValue,
    // ⑭ 매매사례가액 추계(§176의2③1호) — 형제 모드 appraisalValue와 동일 층위.
    //    누락 시 salesCase 모드에서 엔진이 `similarSalesValue ?? acquisitionPrice`(=0)로 후퇴해
    //    취득가액이 통째로 0이 된다(⑬은 이미 전송, ⑫Zod도 수락 — 여기서만 침묵 strip됐다).
    similarSalesValue: p.similarSalesValue,
    isSelfBuilt: p.isSelfBuilt,
    buildingType: p.buildingType,
    constructionDate: toOptionalDate(p.constructionDate),
    extensionFloorArea: p.extensionFloorArea,
    // ⑭ ④와 짝 — 한쪽만 배선하면 엔진에 도달하지 않는다(§114조의2 환산 base).
    extensionStdPriceAtAcquisition: p.extensionStdPriceAtAcquisition,
    extensionAppraisalValue: p.extensionAppraisalValue,
    // ⑭ 일체 주택 본인 신축 × §114조의2 가산세 base 건물분(Q-12) — ⑫(단건 shape 공유)를 통과한 값이 여기서 빠지면 침묵 strip. 중첩 객체에 Date 없음.
    selfBuiltHousing: p.selfBuiltHousing,
    // ⑭ 상업용건물·오피스텔 서브객체 — 단건 `engine-input.ts`와 같은 형태(Date 없음 · TypeScript 미감지라 명시 매핑).
    //    빠지면 엔진 STEP 0.35(§164⑥ 환산)·STEP 0.62(부수토지 초과분)가 조용히 건너뛴다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(p.commercialBuildingValuation ? { commercialBuildingValuation: p.commercialBuildingValuation as any } : {}),
    ...(p.commercialAppurtenantLand ? { commercialAppurtenantLand: p.commercialAppurtenantLand } : {}),
    // ⑭ §163⑨ 4키(`pre1990Land`·`inheritedAcquisition`·`inheritedHouseValuation`·`commercialInheritanceValuation`) — 단건·컴패니언과 **같은 leaf**
    //    (Date 변환 포함 · 계획서 multi-sec163-9-support.plan.md). 상가 키(§163⑨2호)도 싣는다(계획서 multi-building-valuation-support 트랙 C).
    //    키를 명시해 넘긴다 — F-12 키 분류 가드(`transfer.route.multi-key-coverage-f12`)가 `p.<키>`로 매핑을 읽는다.
    ...toEngineSec163_9Inputs(
      {
        pre1990Land: p.pre1990Land,
        inheritedAcquisition: p.inheritedAcquisition,
        inheritedHouseValuation: p.inheritedHouseValuation,
        commercialInheritanceValuation: p.commercialInheritanceValuation,
        inheritedBuildingSec164Value: p.inheritedBuildingSec164Value,
      },
      toDate(p.transferDate, "transferDate"),
      p.transferPrice,
    ),
    parcels: p.parcels?.map((parcel) => ({
      ...parcel,
      acquisitionDate: toDate(parcel.acquisitionDate, "parcels.acquisitionDate"),
      replottingConfirmDate: toOptionalDate(parcel.replottingConfirmDate),
    })),
    // 자산별 가산세 — 단건 엔진이 자산별 결정세액 기준으로 계산.
    filingPenaltyDetails: p.filingPenaltyDetails,
    delayedPaymentDetails: p.delayedPaymentDetails
      ? {
          unpaidTax: p.delayedPaymentDetails.unpaidTax,
          ...(p.delayedPaymentDetails.unpaidTaxMode ? { unpaidTaxMode: p.delayedPaymentDetails.unpaidTaxMode } : {}),
          // ⑭ NH-38 — 기납부 농특세(단건 engine-input과 같은 키)
          ...(p.delayedPaymentDetails.paidRuralSurtax !== undefined ? { paidRuralSurtax: p.delayedPaymentDetails.paidRuralSurtax } : {}),
          paymentDeadline: toDate(p.delayedPaymentDetails.paymentDeadline, "delayedPaymentDetails.paymentDeadline"),
          actualPaymentDate: toOptionalDate(p.delayedPaymentDetails.actualPaymentDate),
        }
      : undefined,
    // ⑭ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — Date 변환 (단건 route 패턴 동일)
    rentalHousingException: p.rentalHousingException
      ? {
          applyException: p.rentalHousingException.applyException,
          scenario: p.rentalHousingException.scenario,
          rentalUnits: p.rentalHousingException.rentalUnits.map((u) => ({
            businessRegistrationDate: toDate(u.businessRegistrationDate, "rentalUnits.businessRegistrationDate"),
            rentalRegistrationDate: toDate(u.rentalRegistrationDate, "rentalUnits.rentalRegistrationDate"),
            rentalCategory: u.rentalCategory,
            rentalAcquisitionType: u.rentalAcquisitionType,
            isApartment: u.isApartment,
            isUrbanLifeHousingApartment: u.isUrbanLifeHousingApartment, // 가목2) 괄호 — 양도기한 게이트만 (단건과 동일)
            region: u.region,
            regionCode: u.regionCode, // 영 §167의3①1호 지역기준(결정 #20 C 후속)
            officialPriceAtTransfer: u.officialPriceAtTransfer, // 영 §167의3①1호 양도 당시 기준시가
            isExcluded918Rule: u.isExcluded918Rule,
            hasContractDepositProof: u.hasContractDepositProof,
            isExcludedShortToLongChange: u.isExcludedShortToLongChange,
            standardPriceAtRentalStart: u.standardPriceAtRentalStart,
            acquisitionOfficialPrice: u.acquisitionOfficialPrice,
            isNationalSizeHousing: u.isNationalSizeHousing,
            landAreaM2: u.landAreaM2,
            totalFloorAreaM2: u.totalFloorAreaM2,
            hasMinimum2Units: u.hasMinimum2Units,
            hasMinimum5UnitsInCity: u.hasMinimum5UnitsInCity,
            firstSaleContractDate: toOptionalDate(u.firstSaleContractDate),
            rentalMonths: u.rentalMonths,
            rentalAutoTermination: u.rentalAutoTermination,
            registrationCancellationDate: toOptionalDate(u.registrationCancellationDate), // I-4 §155㉓
            terminatedRegistrationType: u.terminatedRegistrationType,
            terminationReason: u.terminationReason, // 다주택 중과 §167의3①2호 단서 (단건과 동일)
            aptDeadlineExtension: toEngineAptDeadlineExtension(u.aptDeadlineExtension), // §167의3⑪ (단건과 동일)
            mergeOrigin: u.mergeOrigin, // 혼인합가 1199 (단건과 동일)
            requirementsConfirmed: u.requirementsConfirmed,
          })),
          priorResidenceTransferDate: toOptionalDate(p.rentalHousingException.priorResidenceTransferDate),
          standardPriceAtAcquisition: p.rentalHousingException.standardPriceAtAcquisitionForPhrp,
          standardPriceAtPriorTransfer: p.rentalHousingException.standardPriceAtPriorTransfer,
          standardPriceAtTransfer: p.rentalHousingException.standardPriceAtTransferForPhrp,
          // OH-15·OH-40 판정 사실 (단건 `_rental-engine-input.ts`와 동일 매핑)
          postRegistrationResidenceMonths: p.rentalHousingException.postRegistrationResidenceMonths,
          priorRentalExemptionHistory: p.rentalHousingException.priorRentalExemptionHistory,
          counterpartHouseResidedTwoYears: p.rentalHousingException.counterpartHouseResidedTwoYears,
          residenceTransitionUnderAddendum: p.rentalHousingException.residenceTransitionUnderAddendum,
          residenceTransitionBasis: p.rentalHousingException.residenceTransitionBasis,
          // §154⑩ 표준 경로(I-5) — rentalUnits 0호일 때만 엔진이 참조 (단건과 동일 매핑)
          wasRegisteredRentalOrChildcare: p.rentalHousingException.wasRegisteredRentalOrChildcare,
        }
      : undefined,
  };

  return {
    ...base,
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
  };
}
