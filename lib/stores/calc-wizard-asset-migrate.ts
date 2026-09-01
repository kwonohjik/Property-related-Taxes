/**
 * AssetForm sessionStorage 마이그레이션 — calc-wizard-asset-factory.ts에서 분리 (800줄 정책, 2026-06-19).
 *
 * 구형 AssetForm(landAreaM2, pre1990AreaSqm 등) → 현재 타입으로 정규화.
 * factory의 makeDefaultAsset과 짝(신규 필드 추가 시 양쪽 동기화). RENTAL_HOUSING_EXCEPTION_DEFAULTS는 factory에서 import.
 */

import { migrateMixedUseFields } from "./calc-wizard-asset-mixed-use";
import { migrateResidenceFields } from "./calc-wizard-asset-residence";
import { migrateRentalPeriodFields } from "./calc-wizard-asset-rental-period";
import { migrateCarryoverFields } from "./calc-wizard-asset-carryover";
import {
  applyPhase3Normalize,
  migrateGeneralBuildingFields,
} from "./calc-wizard-asset-migrate-phase3";
import { migratePartialAreaApportionFields } from "./calc-wizard-asset-partial-area";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "./calc-wizard-asset-factory";
import type { AssetForm } from "./calc-wizard-asset";
import {
  exemptionAtApprovalInScope,
  postApprovalExpensesInScope,
} from "@/lib/calc/redev-field-scope";

/**
 * 금액 문자열(CurrencyInput 저장 규약 — 콤마 포함)이 양수인가.
 *
 * `parseAmount`는 `components/calc/inputs/CurrencyInput`에 있어 store가 컴포넌트를 import하는
 * 방향이 된다 — raw 객체 판정에만 쓰는 좁은 용도라 여기서 최소 구현한다.
 */
function hasPositiveAmount(v: unknown): boolean {
  if (typeof v === "number") return v > 0;
  if (typeof v !== "string") return false;
  const n = parseInt(v.replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0;
}

/**
 * 구형 AssetForm (landAreaM2, pre1990AreaSqm 있음) → 현재 타입으로 마이그레이션.
 * sessionStorage 또는 이력 데이터 rehydrate 시 호출.
 */
export function migrateAsset(raw: unknown): AssetForm {
  const a = raw as Record<string, unknown>;
  if (a.landAreaM2 && !a.acquisitionArea) {
    a.acquisitionArea = a.landAreaM2;
    a.transferArea = a.landAreaM2;
  }
  delete a.landAreaM2;
  delete a.pre1990AreaSqm;
  if (!a.areaScenario) {
    a.areaScenario =
      a.acquisitionArea && a.transferArea && a.acquisitionArea !== a.transferArea
        ? "partial"
        : "same";
  }
  // §104③ 미등기양도자산(컴패니언 자산-수준) — stale 세션 가드. 없으면 undefined가 payload에
  // 실려 Zod optional을 통과하고 엔진이 등기 자산으로 처리한다(종전 동작 = 안전측).
  if (a.isUnregistered === undefined) a.isUnregistered = false;
  // 축 B 파트별 독립(§99①1호 나목) — stale sessionStorage 자산에 필드가 없으면 빈 문자열로 정규화
  if (a.buildingStandardPriceAtAcq === undefined) a.buildingStandardPriceAtAcq = "";
  // 토지 파트 취득 원인(건물 신축 + 토지 상속·증여, 2026-07-30) — 구 세션 복원 방어
  if (a.landAcquisitionCause === undefined) a.landAcquisitionCause = "";
  // §104②1·2호 토지 파트 통산(2026-07-31) — 구 세션 복원 방어
  if (a.landDecedentAcquisitionDate === undefined) a.landDecedentAcquisitionDate = "";
  if (a.landDonorAcquisitionDate === undefined) a.landDonorAcquisitionDate = "";
  if (!a.standardPricePerSqmAtAcq) a.standardPricePerSqmAtAcq = "";
  if (!a.standardPricePerSqmAtTransfer) a.standardPricePerSqmAtTransfer = "";
  // Round 9 (2026-05-06): 자산-수준 매매계약일 (감면 시한 판정)
  if (a.assetContractDate === undefined) a.assetContractDate = "";
  // §154⑧3호 상속주택 자체 양도 통산 (구 세션 복원 방어)
  if (a.decedentSameHouseholdBeforeInheritance === undefined)
    a.decedentSameHouseholdBeforeInheritance = false;
  if (a.decedentCohabitationHoldingStartDate === undefined)
    a.decedentCohabitationHoldingStartDate = "";
  if (a.decedentCohabitationResidenceMonths === undefined)
    a.decedentCohabitationResidenceMonths = "";
  // 공익수용·협의매수 (2026-07-02): 양도원인·사업인정고시일 (구 세션 복원 방어)
  if (a.transferCause === undefined) a.transferCause = "general";
  // ③ §164⑧ 환산 — 구 sessionStorage에는 이 키들이 없다. 미보정 시 `sapFormula`가 undefined인
  //    채로 RadioCardGroup에 내려가 선택이 비어 보이고, ④가 `formula: undefined`를 보낸다.
  if (a.sapEnabled === undefined) a.sapEnabled = false;
  if (a.sapFormula === undefined) a.sapFormula = "prev";
  if (a.sapPriorStdPrice === undefined) a.sapPriorStdPrice = "";
  if (a.sapNewStdPrice === undefined) a.sapNewStdPrice = "";
  if (a.sapAdjustMonths === undefined) a.sapAdjustMonths = "";
  if (a.sapPriorBasis === undefined) a.sapPriorBasis = "direct";
  if (a.sapFirstNoticeStdPrice === undefined) a.sapFirstNoticeStdPrice = "";
  if (a.sapNoticeBaseRate === undefined) a.sapNoticeBaseRate = "";
  if (a.sapPriorLandBuildingSum === undefined) a.sapPriorLandBuildingSum = "";
  if (a.sapAcqLandBuildingSum === undefined) a.sapAcqLandBuildingSum = "";
  /**
   * ③ 종전 저장분 정규화 — §80③ 대체 산정이 **피연산자 입력**으로 바뀌기 전에는
   * 사용자가 근거만 고르고 값을 **직접 타이핑**했다. 그 자산을 그대로 열면 ⑤가 칸을
   * 파생값 전용(읽기 전용)으로 잠그고 ⑧이 「피연산자를 입력하세요」로 차단해
   * **이미 입력한 값을 쓸 수 없는 상태**가 된다.
   * ⇒ 피연산자가 비어 있는데 값이 있으면 근거를 `direct`로 되돌린다(값 보존).
   */
  if (
    (a.sapPriorBasis === "first_notice_rate" || a.sapPriorBasis === "ratio_conversion") &&
    !a.sapFirstNoticeStdPrice && !a.sapNoticeBaseRate &&
    !a.sapPriorLandBuildingSum && !a.sapAcqLandBuildingSum &&
    !!a.sapPriorStdPrice
  ) {
    a.sapPriorBasis = "direct";
  }
  if (a.sapPriceSource === undefined) a.sapPriceSource = "manual";
  if (a.expropriationNoticeDate === undefined) a.expropriationNoticeDate = "";
  // §164⑨ 1호 특례 보상필드 — 자산-수준(단건 경로)
  if (a.compensationPerSqm === undefined) a.compensationPerSqm = "";
  if (a.compensationBasisStdPrice === undefined) a.compensationBasisStdPrice = "";
  // 비주택 → 주택 용도변경 §95⑤·⑥ (2026-08-05) — 구 세션 복원 방어.
  // undefined로 도달하면 ToggleCard가 uncontrolled로 뒤집히고 DateInput이 크래시한다.
  if (a.hasNonHousingConversion === undefined) a.hasNonHousingConversion = false;
  if (a.residentialUseStartDate === undefined) a.residentialUseStartDate = "";
  // §164⑨ 2호 공매·경락 특례 (P4)
  if (a.isAuctionTransfer === undefined) a.isAuctionTransfer = false;
  if (a.auctionPrice === undefined) a.auctionPrice = "";
  // §164⑨ 1호 주택 총액 트랙 (P5)
  if (a.housingCompensationTotal === undefined) a.housingCompensationTotal = "";
  if (a.housingCompensationBasisTotal === undefined) a.housingCompensationBasisTotal = "";
  // §164⑨ 1호 건물 split 토지분 트랙 (P6/D6)
  if (a.splitLandCompensationTotal === undefined) a.splitLandCompensationTotal = "";
  if (a.splitLandCompensationBasisTotal === undefined) a.splitLandCompensationBasisTotal = "";
  // §164⑨ 1호 특례 보상필드 — **필지별**(다필지 경로, 2026-07-16 신설).
  // 구 세션의 parcels[]에는 이 2필드가 없어 undefined → React controlled→uncontrolled 경고.
  // (세액은 parseAmount(undefined)=0이라 무영향)
  if (Array.isArray(a.parcels)) {
    for (const p of a.parcels as Record<string, unknown>[]) {
      if (p && p.compensationPerSqm === undefined) p.compensationPerSqm = "";
      if (p && p.compensationBasisStdPrice === undefined) p.compensationBasisStdPrice = "";
    }
  }
  if (a.isReplotIncrement === undefined) a.isReplotIncrement = false;
  // 갭 3b: NBL 유예기간 구 7-union(type·startDate) → 사유코드. 길이 단정 불가 → other_justifiable(12호 event_window) 일원화(손실 0).
  if (Array.isArray(a.nblGracePeriods)) {
    a.nblGracePeriods = (a.nblGracePeriods as Record<string, unknown>[]).map((g) =>
      g && g.reasonCode === undefined && (g.type !== undefined || g.startDate !== undefined)
        ? { reasonCode: "other_justifiable", anchorDate: (g.startDate as string) ?? "", endDate: (g.endDate as string) ?? "", description: (g.description as string) ?? "" }
        : g,
    );
  }
  if (a.nblBusinessIsRealEstateDealer === undefined) a.nblBusinessIsRealEstateDealer = false;
  // NBL 잔여 갭(2026-06-19): ② 농지개발사업지구 · ④ 기타토지 건물유무 · ③ 별장 농어촌주택 3요건 — 구 세션 복원 방어
  if (a.nblFarmlandIsFarmDevZone === undefined) a.nblFarmlandIsFarmDevZone = false;
  if (a.nblOtherHasBuilding === undefined) a.nblOtherHasBuilding = false;
  if (a.nblOtherBuildingFloorArea === undefined) a.nblOtherBuildingFloorArea = "";
  if (a.nblOtherMixedUseMode === undefined) a.nblOtherMixedUseMode = "";
  if (a.nblOtherMixedUseSpecificFloorArea === undefined) a.nblOtherMixedUseSpecificFloorArea = "";
  if (a.nblOtherMixedUseTotalFloorArea === undefined) a.nblOtherMixedUseTotalFloorArea = "";
  if (a.nblOtherMixedUseSpecificFootprint === undefined) a.nblOtherMixedUseSpecificFootprint = "";
  if (a.nblOtherMixedUseTotalFootprint === undefined) a.nblOtherMixedUseTotalFootprint = "";
  if (a.nblOtherUseParcels === undefined) a.nblOtherUseParcels = false;
  if (a.nblOtherParcels === undefined) a.nblOtherParcels = [];
  // 공장용 건축물 부속토지 (§102①1호 별표6 / §101①1호) — 이력 복원 시 신규 필드 채움.
  // 토글 기본 false라 기존 이력의 판정 결과는 바뀌지 않는다.
  if (a.nblFactoryEnabled === undefined) a.nblFactoryEnabled = false;
  if (a.nblFactoryLocationCategory === undefined) a.nblFactoryLocationCategory = "";
  if (a.nblFactoryTotalLandArea === undefined) a.nblFactoryTotalLandArea = "";
  if (a.nblFactorySegments === undefined) a.nblFactorySegments = [];
  if (a.nblFactoryIsRestrictedZone === undefined) a.nblFactoryIsRestrictedZone = false;
  if (a.nblFactoryAdditionalRecognizedArea === undefined) a.nblFactoryAdditionalRecognizedArea = "";
  if (a.nblFactoryFootprintArea === undefined) a.nblFactoryFootprintArea = "";
  if (a.nblFactoryIsUnregistered === undefined) a.nblFactoryIsUnregistered = false;
  if (a.nblVillaBuildingFloorArea === undefined) a.nblVillaBuildingFloorArea = "";
  if (a.nblVillaAttachedLandArea === undefined) a.nblVillaAttachedLandArea = "";
  if (a.nblVillaCombinedStdValue === undefined) a.nblVillaCombinedStdValue = "";
  if (a.nblVillaIsInRestrictedArea === undefined) a.nblVillaIsInRestrictedArea = false;
  // Phase 2 (2026-06-11): 장기임대 §97 시리즈 — 3-state 필드 누락 보정 (구 세션 복원 방어)
  if (Array.isArray(a.reductions)) {
    a.reductions = (a.reductions as Record<string, unknown>[]).map((r) => {
      if (r && typeof r.type === "string" && (r.type as string).startsWith("rental_97") && r.type !== "rental_97_3_legacy") {
        return {
          registrationDate: "",
          rentalStartDate: "",
          isTaxRegistered: false,
          rentIncreaseViolationMode: "",
          // D2-06 — 신규 3-state. 구 세션엔 값이 없다.
          rentalContinuesToTransfer: null,
          stdPriceAtRentalEnd: "",
          ...r,
          /**
           * D1-03 — 구 키 `hasVacancyOver6Months`는 「6개월 초과 공실이 있는가」를 물었다.
           * §97·§97의2·§97의3·§97의4의 유예는 3월(조특칙 §44)이므로, 구 세션의 "없음"은
           * 새 질문("3개월 초과 공실이 있는가")의 답이 될 수 없다 —
           * 4개월 공실 보유자가 구 UI에서 "없음"을 골랐을 수 있기 때문이다.
           * ⇒ 값을 그대로 승계하지 않고 **미선택(null)로 되돌려 다시 묻는다**.
           *    (§97의5는 임계가 그대로지만, 조문별 분기 없이 한 번 다시 묻는 편이 안전하다.)
           */
          hasVacancyOverGrace: null,
          /**
           * D1-01·D1-02 — 주체 요건(§97 5호 / §97의2 2호) 신규 필드.
           * 구 세션에는 값이 없으므로 **미선택**으로 둔다. 미입력을 충족으로 읽으면
           * 1호만 임대한 사용자가 그대로 감면을 받는다.
           */
          ...((r.type === "rental_97_main" || r.type === "rental_97_proviso") &&
          r.hasMin5RentalUnits === undefined
            ? { hasMin5RentalUnits: null, belowMin5UnitsPeriods: [] }
            : {}),
          // D1-06·D1-07 — §97 각 호·단서 나목 신규 3-state. 구 세션엔 값이 없다.
          ...((r.type === "rental_97_main" || r.type === "rental_97_proviso") &&
          r.isUnoccupiedAt1986 === undefined
            ? {
                isMultiUnitHousing: null,
                isUnoccupiedAt1986: null,
                isUnoccupiedAtAcquisition: null,
              }
            : {}),
          ...(r.type === "rental_97_2" && r.isUnoccupiedAtAcquisition === undefined
            ? { isUnoccupiedAtAcquisition: null }
            : {}),
          // D2-07 — §97의3 건설임대 확인. 구 세션은 미확인(false)으로 둔다 —
          // 2023.1.1 전 등록분은 경과조치로 이 값과 무관하다.
          ...(r.type === "rental_97_3" && r.isPrivateConstructionRental === undefined
            ? { isPrivateConstructionRental: false }
            : {}),
          // D9-01 — §97의2①1호 나목 신규 3-state
          ...(r.type === "rental_97_2" && r.isMultiUnitHousing972 === undefined
            ? { isMultiUnitHousing972: null, isUnoccupiedAt19990820: null }
            : {}),
          ...(r.type === "rental_97_2" && r.hasNewRentalPlus2Units === undefined
            ? { hasNewRentalPlus2Units: null }
            : {}),
          // D2-04 — §97의4 대상 요건 신규 필드. 구 세션은 미선택으로 둔다.
          ...(r.type === "rental_97_4" && r.rental974Category === undefined
            ? { rental974Category: "", officialPriceAtStart: r.officialPriceAtStart ?? "" }
            : {}),
        };
      }
      // §99의4 (2026-06-11): 구 stub 데이터(_phase1Stub) 본 필드 누락 보정 (③)
      if (r && (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown")) {
        return {
          ruralHouseAcquisitionDate: "",
          ruralHouseJibun: "",
          ruralHouseStdPrice: "",
          isRegisteredHanok: false,
          isAdjacentArea: false,
          meetsLocationRequirement: false,
          ...(r.type === "new_99_4_hometown" ? { meetsHometownRequirement: false } : {}),
          ...r,
        };
      }
      // P1 §99 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "new_99") {
        return {
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
          ...r,
        };
      }
      // B4 §99의3 (2026-07-03): exclusiveAreaSqm993 등 본 필드 누락 보정 (③) — 구 세션(면적기준 배선 전) 복원 시 validate 차단·controlled input 경고 방어
      if (r && r.type === "new_99_3") {
        return {
          contractDate993: "",
          usageApprovalDate993: "",
          standardPriceAt5Years: "",
          standardPriceAtAcquisition993: "",
          standardPriceAtTransfer993: "",
          // D3-02 — 기존 저장 폼에는 없는 신규 필드. 미설정이면 변형 미적용(종전 동작).
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
          ...r,
        };
      }
      // P1 §98의8 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_8") {
        return {
          contractDate988: "",
          acquisitionPrice988: "",
          exclusiveAreaSqm988: "",
          rentalContractDate988: "",
          rentalStartDate988: "",
          rentalEndDate988: "",
          inheritedRentalMonths988: "",
          isUnsoldAfterCompletion988: false,
          isFirstContract988: false,
          isNotRecontract988: false,
          standardPriceAtAcquisition988: "",
          standardPriceAt5Years988: "",
          standardPriceAtTransfer988: "",
          ...r,
        };
      }
      // P5 §98 (2026-06-12): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98") {
        return {
          contractDate98: "",
          isNationalScale98: false,
          isOutsideSeoul98: false,
          isUnsoldConfirmed98: false,
          isNotRentalHousing98: false,
          isFirstBuyerNoOccupancy98: false,
          rentedFor5Years98: false,
          ...r,
        };
      }
      // P4 §98의2·§98의4 (2026-06-12): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_2") {
        return {
          contractDate982: "",
          isNonCapitalUnsold982: false,
          isFirstOrFcfsContract982: false,
          ...r,
        };
      }
      if (r && r.type === "unsold_98_4") {
        return {
          contractDate984: "",
          isNonResidentNoPe984: false,
          isNotUnsold983House984: false,
          ...r,
        };
      }
      // P3 §98의3·§98의5·§98의6 (2026-06-12): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_3") {
        return {
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
          ...r,
        };
      }
      if (r && r.type === "unsold_98_5") {
        return {
          contractDate985: "",
          priceReductionRatePct985: "",
          isNonCapitalUnsoldAtCutoff985: false,
          isFirstContract985: false,
          isNotOccupiedAtContract985: false,
          isNotRecontract985: false,
          standardPriceAtAcquisition985: "",
          standardPriceAt5Years985: "",
          standardPriceAtTransfer985: "",
          ...r,
        };
      }
      if (r && r.type === "unsold_98_6") {
        return {
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
          ...r,
        };
      }
      // P2 §98의7 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_7") {
        return {
          contractDate987: "",
          acquisitionPrice987: "",
          isUnsoldAtCutoff987: false,
          isFirstContract987: false,
          isNotOccupiedAtContract987: false,
          isNotRecontract987: false,
          standardPriceAtAcquisition987: "",
          standardPriceAt5Years987: "",
          standardPriceAtTransfer987: "",
          ...r,
        };
      }
      // P2 §99의2 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_99_2") {
        return {
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
          ...r,
        };
      }
      // §98의9 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_9") {
        return {
          unsoldHouseAcquisitionDate: "",
          unsoldHouseAcquisitionPrice: "",
          unsoldHouseExclusiveArea: "",
          isNonCapitalRegion: false,
          wasOneHouseholdAtAcquisition: false,
          meetsSellerAndContractRequirement: false,
          ...r,
        };
      }
      return r;
    });
  }
  if (!a.selfOwns) a.selfOwns = "both";
  if (a.hasSeperateLandAcquisitionDate === undefined) a.hasSeperateLandAcquisitionDate = false;
  if (!a.landAcquisitionDate) a.landAcquisitionDate = "";
  // saleSplitMode 마이그레이션 — legacy landSplitMode(취득·양도 겸용 토글) 값을 이전 후 폐기(계획 §13 Q4).
  if (a.saleSplitMode === undefined) {
    a.saleSplitMode =
      a.landSplitMode === "actual" || a.landSplitMode === "apportioned"
        ? a.landSplitMode
        : "apportioned";
  }
  delete a.landSplitMode;
  /**
   * M-3 **「일괄양도 + 감정평가 토글 ON」 → `"appraisal"` 승격** (2026-08-07).
   *
   * 종전에는 안분 basis가 라디오(일괄/구분) 밖의 **별도 토글**이라, 「일괄양도(기준시가 비율로
   * 안분)」를 고른 상태에서 감정평가액을 넣으면 라벨과 달리 감정평가액으로 안분됐다
   * (`sale-split-apportion-basis.ts`의 서열 — 부가령 §64①1호가 2호보다 우선).
   *
   * 3-way 라디오로 합친 뒤에는 그 상태의 정확한 이름이 `"appraisal"`이다. 승격하지 않으면
   * 라디오가 「기준시가 안분」으로 표시되는데 실제로는 감정평가액이 쓰여 **화면과 계산이
   * 어긋난다**(값은 그대로 두므로 세액은 변하지 않는다 — 이름만 바로잡는다).
   *
   * ⚠️ `"actual"`(구분양도)은 건드리지 않는다 — 그쪽 감정평가액은 안분 basis가 아니라
   *    §100③ 30% 판정의 **비교 대상**이므로 모드가 바뀌면 안 된다.
   */
  if (
    a.saleSplitMode === "apportioned" &&
    (hasPositiveAmount(a.landAppraisalAtTransfer) || hasPositiveAmount(a.buildingAppraisalAtTransfer))
  ) {
    a.saleSplitMode = "appraisal";
  }
  // landAcqMode/buildingAcqMode — 미선택("") 기본값. 실제 유효값은 API/validate/UI가
  // `effectivePartAcqMode()`(lib/calc/transfer-tax-split-acq-mode.ts)로 레거시 플래그에서
  // 매 사용 시점에 파생한다(단일 소스 — migrate 시점 1회 고정 스냅샷 금지, dual-truth 방지).
  if (a.landAcqMode === undefined) a.landAcqMode = "";
  if (a.buildingAcqMode === undefined) a.buildingAcqMode = "";
  if (a.landSalesCaseValue === undefined) a.landSalesCaseValue = "";
  if (a.buildingSalesCaseValue === undefined) a.buildingSalesCaseValue = "";
  // 양도가액 안분 basis(감정평가가액) + §166⑧ 예외 — Phase 1-E 신규.
  // 구 세션에는 없던 필드다. `undefined`로 두면 CurrencyInput이 uncontrolled로 시작해
  // 첫 입력에서 React 경고가 나고, validate의 `opt()`도 빈 문자열과 다르게 다룬다.
  if (a.landAppraisalAtTransfer === undefined) a.landAppraisalAtTransfer = "";
  if (a.buildingAppraisalAtTransfer === undefined) a.buildingAppraisalAtTransfer = "";
  if (a.appraisalDateAtTransfer === undefined) a.appraisalDateAtTransfer = "";
  if (a.saleSplitExemption === undefined) a.saleSplitExemption = "";
  if (a.saleSplitExemptionNote === undefined) a.saleSplitExemptionNote = "";
  if (!a.landTransferPrice) a.landTransferPrice = "";
  if (!a.buildingTransferPrice) a.buildingTransferPrice = "";
  if (!a.landAcquisitionPrice) a.landAcquisitionPrice = "";
  if (!a.buildingAcquisitionPrice) a.buildingAcquisitionPrice = "";
  if (!a.landDirectExpenses) a.landDirectExpenses = "";
  if (!a.buildingDirectExpenses) a.buildingDirectExpenses = "";
  if (a.capitalExpenditure === undefined) a.capitalExpenditure = "0";
  if (a.transferExpense === undefined) a.transferExpense = "0";
  // 공유 지분율 — 단독 소유 100/100 fallback (지분 단계취득 자산은 명시 입력)
  if (!a.ownershipNumerator || a.ownershipNumerator === "") a.ownershipNumerator = "100";
  if (!a.ownershipDenominator || a.ownershipDenominator === "") a.ownershipDenominator = "100";
  if (!a.landStandardPriceAtTransfer) a.landStandardPriceAtTransfer = "";
  if (!a.buildingStandardPriceAtTransfer) a.buildingStandardPriceAtTransfer = "";
  if (a.usePreHousingDisclosure === undefined) a.usePreHousingDisclosure = false;
  if (!a.phdFirstDisclosureDate) a.phdFirstDisclosureDate = "";
  if (!a.phdFirstDisclosureHousingPrice) a.phdFirstDisclosureHousingPrice = "";
  if (!a.phdLandPriceYearAtAcq) a.phdLandPriceYearAtAcq = "";
  if (a.phdLandPriceYearAtAcqIsManual === undefined) a.phdLandPriceYearAtAcqIsManual = false;
  if (!a.phdLandPricePerSqmAtAcq) a.phdLandPricePerSqmAtAcq = "";
  if (!a.phdLandPricePerSqmAtAcq2001) a.phdLandPricePerSqmAtAcq2001 = "";
  if (!a.phdBuildingStdPriceAtAcq) a.phdBuildingStdPriceAtAcq = "";
  if (!a.phdLandPriceYearAtFirst) a.phdLandPriceYearAtFirst = "";
  if (a.phdLandPriceYearAtFirstIsManual === undefined) a.phdLandPriceYearAtFirstIsManual = false;
  if (!a.phdLandPricePerSqmAtFirst) a.phdLandPricePerSqmAtFirst = "";
  if (!a.phdBuildingStdPriceAtFirst) a.phdBuildingStdPriceAtFirst = "";
  if (!a.phdTransferHousingPrice) a.phdTransferHousingPrice = "";
  if (!a.phdLandPriceYearAtTransfer) a.phdLandPriceYearAtTransfer = "";
  if (a.phdLandPriceYearAtTransferIsManual === undefined) a.phdLandPriceYearAtTransferIsManual = false;
  if (!a.phdLandPricePerSqmAtTransfer) a.phdLandPricePerSqmAtTransfer = "";
  if (!a.phdBuildingStdPriceAtTransfer) a.phdBuildingStdPriceAtTransfer = "";
  if (!a.phdCommercialBuildingStdPriceAtAcq) a.phdCommercialBuildingStdPriceAtAcq = "";
  if (!a.phdCommercialBuildingStdPriceAtFirst) a.phdCommercialBuildingStdPriceAtFirst = "";
  if (!a.phdResidentialLandArea) a.phdResidentialLandArea = "";
  if (a.inheritanceMode === undefined) a.inheritanceMode = null;
  if (!a.inheritanceStartDate) a.inheritanceStartDate = "";
  if (a.hasDecedentActualPrice === undefined) a.hasDecedentActualPrice = false;
  if (!a.decedentAcquisitionPrice) a.decedentAcquisitionPrice = "";
  if (!a.inheritanceValuationMethod) a.inheritanceValuationMethod = "";
  // P2b 통합: 상속 취득가액 manual 모드 폐지 → auto 강제 (기존 세션 호환).
  // manual 취득가액(fixedAcquisitionPrice)을 신고가액(publishedValueAtInheritance)으로 이전.
  // P2c: 상속 manual 세션(저장값·loose 접근) 감지 → fixedAcq를 신고가액(publishedValueAtInheritance)으로
  // 이전, mode 필드 폐기. inheritanceValuationMode는 AssetForm 타입에서 제거됨(항상 신고가액 경로).
  if ((a.inheritanceValuationMode as string | undefined) === "manual" && a.acquisitionCause === "inheritance") {
    if (!a.publishedValueAtInheritance && a.fixedAcquisitionPrice) {
      a.publishedValueAtInheritance = a.fixedAcquisitionPrice;
    }
    a.fixedAcquisitionPrice = "";
  }
  delete a.inheritanceValuationMode;
  // E-1 선언(U2-E) — 기존 세션에는 없는 신규 필드다. `undefined`로 두면 차단 게이트가 판정을
  // 못 하므로 명시적으로 `false`(=미선언 → 차단)로 채운다.
  if (a.preDeemedClauseAUnconfirmed === undefined) a.preDeemedClauseAUnconfirmed = false;
  if (a.useSupplementaryHelper === undefined) a.useSupplementaryHelper = false;
  if (!a.supplementaryLandArea) a.supplementaryLandArea = "";
  if (!a.supplementaryLandUnitPrice) a.supplementaryLandUnitPrice = "";
  if (!a.supplementaryBuildingValue) a.supplementaryBuildingValue = "";
  if (a.inhHouseValEnabled === undefined) a.inhHouseValEnabled = false;
  if (!a.inhHouseValFirstDisclosureDate) a.inhHouseValFirstDisclosureDate = "2005-04-30";
  if (!a.inhHouseValLandArea) a.inhHouseValLandArea = "";
  if (!a.inhHouseValLandPricePerSqmAtTransfer) a.inhHouseValLandPricePerSqmAtTransfer = "";
  if (!a.inhHouseValLandPricePerSqmAtFirst) a.inhHouseValLandPricePerSqmAtFirst = "";
  if (!a.inhHouseValLandPricePerSqmAtInheritance) a.inhHouseValLandPricePerSqmAtInheritance = "";
  if (!a.inhHouseValHousePriceAtTransfer) a.inhHouseValHousePriceAtTransfer = "";
  if (!a.inhHouseValHousePriceAtFirst) a.inhHouseValHousePriceAtFirst = "";
  if (!a.inhHouseValBuildingStdPriceAtTransfer) a.inhHouseValBuildingStdPriceAtTransfer = "";
  if (!a.inhHouseValBuildingStdPriceAtFirst) a.inhHouseValBuildingStdPriceAtFirst = "";
  if (!a.inhHouseValBuildingStdPriceAtInheritance) a.inhHouseValBuildingStdPriceAtInheritance = "";
  if (a.inhHouseValUseHousePriceOverride === undefined) a.inhHouseValUseHousePriceOverride = false;
  if (!a.inhHouseValHousePriceAtInheritanceOverride) a.inhHouseValHousePriceAtInheritanceOverride = "";
  if (a.useStandardPriceAtAcqOverride === undefined) a.useStandardPriceAtAcqOverride = false;
  if (a.useStandardPriceAtTransferOverride === undefined) a.useStandardPriceAtTransferOverride = false;
  // 이월과세(증여) carryover 서브객체 마이그레이션
  migrateCarryoverFields(a);
  // 겸용주택 분리계산 + 보유 중 일부 용도변경 필드 (별도 모듈)
  migrateMixedUseFields(a);
  // 거주 정보 (자산-수준)
  migrateResidenceFields(a);
  // ③ 신축(자가건축) 취득일 4-시점 + 부수토지 필드 마이그레이션 (사례 28, 2026-05-07; G-5 4번째 시점)
  if (a.occupancyApprovalDate === undefined) a.occupancyApprovalDate = "";
  if (a.approvalCertificateDate === undefined) a.approvalCertificateDate = ""; // G-5: 사용검사필증 교부일
  if (a.temporaryApprovalDate === undefined) a.temporaryApprovalDate = "";
  if (a.actualUseDate === undefined) a.actualUseDate = "";
  if (a.isUrbanArea === undefined) a.isUrbanArea = undefined; // undefined 보존 (자동 분기 비활성 상태)
  if (a.appurtenantLandZone === undefined) a.appurtenantLandZone = undefined;
  if (a.manualHoldingPeriodOverride === undefined || a.manualHoldingPeriodOverride === "") {
    a.manualHoldingPeriodOverride = undefined; // 빈 문자열 → undefined 변환
  }
  // ③ landNature 마이그레이션 — 신규 필드 (사례 28 landNature 명시 입력 정책)
  if (a.landNature === undefined || !(["appurtenant", "standalone"].includes(a.landNature as string))) {
    a.landNature = undefined;
  }
  // acquisitionCause "newConstruction" 추가 — 알 수 없는 값이면 "purchase" fallback
  const validCauses = ["purchase", "inheritance", "gift", "carryover_gift", "newConstruction"];
  if (!a.acquisitionCause || !validCauses.includes(a.acquisitionCause as string)) {
    a.acquisitionCause = "purchase";
  }
  // assetKind "commercial_building"/"general_building"/"redevelopment_apt" 추가 — 알 수 없는 값이면 "building" fallback (③ normalize)
  const validKinds = ["housing", "land", "building", "right_to_move_in", "presale_right", "commercial_building", "general_building", "redevelopment_apt"];
  if (!a.assetKind || !validKinds.includes(a.assetKind as string)) {
    a.assetKind = "building";
  }

  // ③ 일부양도 취득가액 안분 계산기 (2026-07-30, B4-2b) — UI 전용 필드 5개
  migratePartialAreaApportionFields(a);

  // ③ 축 B(건물 연면적) 신설 — buildingFloorArea (2026-07-30, Phase F1 β-2)
  if (a.buildingFloorArea === undefined) a.buildingFloorArea = "";

  /**
   * ⛔ **`building`의 `acquisitionArea`를 `buildingFloorArea`로 이전하지 말 것**
   *    (2026-07-30 U-12 실측으로 철회 — 종전 β-2 블록은 데이터 손상이었다).
   *
   * PR #912(Phase A)는 `building`(건물, 토지 제외)의 `acquisitionArea`를 "건물 연면적"으로
   * 라벨링했고, β-2가 그 전제로 값을 `buildingFloorArea`로 옮기고 축 A를 비웠다.
   * **전제가 틀렸다** — `building`의 `acquisitionArea`는 처음부터 **토지 면적**이다:
   *
   *   · `StandardPriceInput.tsx:69~70` — `toPropertyType(building_non_residential)` → **"land"**.
   *     즉 조회 대상이 **개별공시지가**이고 곱셈 인자는 토지 면적이다(건물 ㎡당 단가가 아니다).
   *   · `calc-wizard-asset.ts` — `standardPricePerSqmAtAcq` 주석 "㎡당 **공시지가**".
   *   · `LandBuildingSplitSection.tsx:163` — 같은 필드를 "**토지 면적**"으로 입력받는다
   *     (「소득세법」 제99조 제1항 제1호 가목).
   *
   * 「소득세법」 제99조 제1항 제1호는 나목(건물)에 "딸린 토지" 문구를 두지 않고, 다목
   * (오피스텔·상업용건물)에만 "이에 딸린 토지를 포함한다"를 둔다(같은 조 제3항 제4호에서 확인).
   * 즉 **나목 건물의 부수토지는 가목으로 별도 평가**되므로 `building`에도 축 A가 실재한다 —
   * 라벨 "건물(토지 제외)"는 *기준시가 공시 범위*를 뜻하고, 토지가 없다는 뜻이 아니다.
   *
   * 실측(제거 전): `acquisitionArea "200"` → `""`, `buildingFloorArea "" → "200"`,
   *   토지분 취득 기준시가 100,000,000 → **null**(`calcLandStdPriceAtAcq` 면적 0).
   *   `assetKind` 미상 → `building` fallback 자산까지 휩쓸어 피해 범위가 더 넓었다.
   */

  /**
   * `building`의 면적 시나리오가 `["same"]`으로 축소됐다 → stale `partial`을 정규화한다.
   * `areaResetPatchForAssetKind`는 **assetKind를 바꿀 때만** 동작하므로, 이미 저장된
   * `building` + `partial` 조합은 이 마이그레이션이 아니면 그대로 남아 Select에 없는 값이
   * 선택된 상태가 된다(취득·양도 면적 2칸이 렌더되는 죽은 분기).
   */
  if (a.assetKind === "building" && a.areaScenario !== "same") {
    a.areaScenario = "same";
  }
  // ③ 재개발/재건축 redev* 필드 마이그레이션 (sessionStorage 호환 — 신규 필드 누락 보호)
  if (a.redevSubject === undefined) a.redevSubject = "";
  /**
   * 양도 대상 축을 **자산 종류로 일원화**한다 (2026-08-13).
   *
   *   입주권(`right_to_move_in`)  = 조합원입주권 양도 전담 (§166① · §95② 단서 · §89①4호)
   *   재개발APT(`redevelopment_apt`) = 재개발·재건축으로 완공된 APT 양도 전담 (§166②)
   *
   * 종전에는 재개발APT 자산 안의 ① 「양도 대상」 라디오(`redevSubject`)가 축을 겸해
   * 「APT 자산인데 입주권 양도」 조합이 저장될 수 있었다. 그 라디오를 없애면서, 이미 저장된
   * 조합은 **자산 종류를 승격시켜 의미를 보존**한다(값을 버리면 완공APT 계산으로 조용히 바뀐다).
   */
  if (a.assetKind === "redevelopment_apt" && a.redevSubject === "right") {
    a.assetKind = "right_to_move_in";
  }
  // 이후 `redevSubject`는 자산 종류에서 파생한다 — 저장값은 하위호환 잔재이므로 정규화해 둔다.
  if (a.assetKind === "right_to_move_in") a.redevSubject = "right";
  else if (a.assetKind === "redevelopment_apt") a.redevSubject = "apt";

  /**
   * 완공 APT 양도 전용 필드를 입주권 자산에서 **비운다** (2026-08-14).
   *
   *   `redevReceiveOnlyMode`      = 청산금 수령분 단독 신고 (사례 46)
   *   `redevNewHouseResidenceMonths` = 신축 APT 거주월수 (사례 45)
   *
   * 둘 다 **신축 APT가 존재해야** 성립하는 사실이라 완공 전 권리 양도인 입주권에는 없다.
   * 종전에는 두 필드가 입주권에서도 입력·송신돼 세액을 조용히 바꿨다(2026-08-14 실측:
   * 전자는 양도가액을 청산금 수령액으로 교체해 양도차익 1.7억 소실, 후자는 LTHD 14%→68%).
   *
   * 입력 UI를 숨기는 것만으로는 **이미 저장된 값이 남는다** — 그리고 카드가 사라져
   * 사용자가 끌 수단도 없다. 그래서 validate 차단이 아니라 여기서 정규화한다
   * ([[feedback-ui-gate-removes-sole-input-path]]).
   *
   * ⚠️ 이 정규화는 **세액을 바꾼다** — 위 승격(`redevelopment_apt` + `right` → 입주권)을 거친
   * 자산이 대상이면 종전의 잘못된 값이 사라지고 정상 값으로 바뀐다. 의도된 정정이다.
   */
  /**
   * 입주권에서 **도달 불가 입력 3종**을 비운다 (2026-08-23).
   *
   *   `isAppraisalAcquisition` · `isSalesCaseAcquisition`
   *     = 상단 축 A(일반 「취득가액 산정 방식」) 라디오가 켜던 추계 플래그. 그 라디오를 입주권에서
   *       제거했으므로 이제 **끄는 수단이 없다**. 남아 있으면 API가 취득가액을 0으로 보내
   *       「인가전 양도차익 = 권리가액 − 0」으로 오류 없이 과대과세된다(실측 — 계획서 §2.1).
   *       API 쪽에도 무력화 가드를 뒀지만(`transfer-tax-api.ts` `isRightToMoveIn`) 저장값 자체를
   *       정리해 두어야 화면·사이드바 표시까지 일관된다.
   *
   *   `redevIsSuccessorMember`
   *     = 사례 48 **완공APT** 승계조합원(신축APT 양도) 필드. 입주권의 승계 여부는 ① 기본정보의
   *       `isSuccessorRightToMoveIn`이 받는다 — **다른 사실**이다(#1245에서 ②-a 카드를 완공APT
   *       전용으로 분리). 입주권에 stale `"yes"`가 남으면 ⑤ 취득가액 카드가 숨겨지고
   *       `validateRedevelopmentAsset`이 「준공일을 입력하세요」로 막는데, 그 입력칸도 같은 숨겨진
   *       섹션 안에 있어 **채울 칸 없는 영구 차단**이 된다(실측 — 계획서 §2.4(3)).
   *
   * ⚠️ `useEstimatedAcquisition`은 **비우지 않는다** — 원조합원 입주권에서는 ⑤ 카드의
   *    실가/환산 라디오가 이 필드를 정본으로 쓴다. 비우면 §166③ 환산 모드가 꺼진다.
   *    승계조합원의 환산 차단은 API(`isEstimated` 정의)와 ⑧ validate가 담당한다.
   */
  if (a.assetKind === "right_to_move_in") {
    a.redevReceiveOnlyMode = "";
    a.redevNewHouseResidenceMonths = "";
    a.isAppraisalAcquisition = false;
    a.isSalesCaseAcquisition = false;
    a.redevIsSuccessorMember = "";
  }
  // 승계조합원 입주권 취득가액 (§97①1호 가목) — sessionStorage 호환
  if (a.successorRightAcqPrice === undefined) a.successorRightAcqPrice = "";
  if (a.successorRightAddedContribution === undefined) a.successorRightAddedContribution = "";
  // §165① 기준시가 4칸 — 승계 입주권 추계(R-12). stale 저장값에는 없다.
  if (a.successorRightStdPaidAtAcq === undefined) a.successorRightStdPaidAtAcq = "";
  if (a.successorRightStdPremiumAtAcq === undefined) a.successorRightStdPremiumAtAcq = "";
  if (a.successorRightStdPaidAtTransfer === undefined) a.successorRightStdPaidAtTransfer = "";
  if (a.successorRightStdPremiumAtTransfer === undefined) a.successorRightStdPremiumAtTransfer = "";
  if (a.redevApprovalLawBasis === undefined) a.redevApprovalLawBasis = "";
  if (a.redevOriginalAssetType === undefined || a.redevOriginalAssetType === "") a.redevOriginalAssetType = "housing";
  if (a.redevSettlementDirection === undefined) a.redevSettlementDirection = "";
  if (a.redevApprovalDate === undefined) a.redevApprovalDate = "";
  if (a.redevSettlementSaleDate === undefined) a.redevSettlementSaleDate = "";
  if (a.redevRightsValue === undefined) a.redevRightsValue = "";
  if (a.redevSettlementAmount === undefined) a.redevSettlementAmount = "";
  if (a.redevPreApprovalExpenses === undefined) a.redevPreApprovalExpenses = "";
  if (a.redevPostApprovalExpenses === undefined) a.redevPostApprovalExpenses = "";
  if (a.redevAcquisitionStdPrice === undefined) a.redevAcquisitionStdPrice = "";
  if (a.redevManagementDisposalStdPrice === undefined) a.redevManagementDisposalStdPrice = "";
  if (a.redevFirstDisclosureDate === undefined) a.redevFirstDisclosureDate = "";
  if (a.redevFirstDisclosureHousingPrice === undefined) a.redevFirstDisclosureHousingPrice = "";
  if (a.redevFirstDisclosureStdPrice === undefined) a.redevFirstDisclosureStdPrice = "";
  if (a.redevLandArea === undefined) a.redevLandArea = "";
  if (a.redevLandPricePerSqmAtAcq === undefined) a.redevLandPricePerSqmAtAcq = "";
  if (a.redevBuildingStdPriceAtAcq === undefined) a.redevBuildingStdPriceAtAcq = "";
  if (a.redevLandPricePerSqmAtFirst === undefined) a.redevLandPricePerSqmAtFirst = "";
  if (a.redevBuildingStdPriceAtFirst === undefined) a.redevBuildingStdPriceAtFirst = "";
  if (a.redevManagementDisposalHousingPrice === undefined) a.redevManagementDisposalHousingPrice = "";
  if (a.redevAcquisitionHousingPrice === undefined) a.redevAcquisitionHousingPrice = "";
  if (a.redevActualAcquisitionPrice === undefined) a.redevActualAcquisitionPrice = "";
  // 사례 45 — 거주월수 분리 (§154⑧1호 + 해석례 2020-386)
  if (a.redevPriorHouseResidenceMonths === undefined) a.redevPriorHouseResidenceMonths = "";
  if (a.redevNewHouseResidenceMonths === undefined) a.redevNewHouseResidenceMonths = "";
  if (a.redevPriorResidenceStartDate === undefined) a.redevPriorResidenceStartDate = "";
  if (a.redevPriorResidenceEndDate === undefined) a.redevPriorResidenceEndDate = "";
  if (a.redevNewResidenceStartDate === undefined) a.redevNewResidenceStartDate = "";
  if (a.redevNewResidenceEndDate === undefined) a.redevNewResidenceEndDate = "";
  // 사례 46 — 청산금 수령분 단독 신고
  if (a.redevReceiveOnlyMode === undefined) a.redevReceiveOnlyMode = "";
  if (a.redevExemptionEligibleAtApproval === undefined) a.redevExemptionEligibleAtApproval = "";

  // 축을 벗어난 재개발 저장값 정규화 (U1-01 · U1-02) — 근거·범위는 `lib/calc/redev-field-scope.ts`.
  // 재개발 자산에만 적용한다 — 다른 종류의 잔재는 종류를 되돌리면 복귀해야 한다.
  if (a.assetKind === "redevelopment_apt" || a.assetKind === "right_to_move_in") {
    // 술어가 읽는 4필드는 위에서 모두 기본값이 채워졌다(`a`는 아직 raw 레코드다).
    const redevAxes = a as unknown as AssetForm;
    if (!exemptionAtApprovalInScope(redevAxes)) a.redevExemptionEligibleAtApproval = "";
    if (!postApprovalExpensesInScope(redevAxes)) a.redevPostApprovalExpenses = "";
  }
  // 사례 36 — 1세대1입주권 비과세 C-1 안전장치
  if (a.redevPriorHouseHoldingMonths === undefined) a.redevPriorHouseHoldingMonths = "";
  // §89①4호 나목 — 그 1주택 취득일 (구 sessionStorage에는 없다)
  if (a.redevOtherHouseAcquisitionDate === undefined) a.redevOtherHouseAcquisitionDate = "";
  // 사례 37 — 토지 출자 §166③ 환산 (subject="right" + originalAssetType="land")
  if (a.redevLandStdPriceAtAcq === undefined) a.redevLandStdPriceAtAcq = "";         // @deprecated legacy
  if (a.redevLandStdPriceAtApproval === undefined) a.redevLandStdPriceAtApproval = ""; // @deprecated legacy
  // 신규 LandPriceLookupField 입력 경로 — §166③ 분모 ㎡당 단가
  if (a.redevLandPricePerSqmAtApproval === undefined) a.redevLandPricePerSqmAtApproval = "";
  // 사례 38/39 — 단독주택 출자 §166③ 2-point 환산취득가
  if (a.redevHousingStdPriceAtAcq === undefined) a.redevHousingStdPriceAtAcq = "";
  if (a.redevHousingStdPriceAtApproval === undefined) a.redevHousingStdPriceAtApproval = "";
  // 사례 48 — 승계조합원 신축APT 양도
  if (a.redevIsSuccessorMember === undefined) a.redevIsSuccessorMember = "";
  if (a.redevCompletionDate === undefined) a.redevCompletionDate = "";
  // ③ 상업용건물·오피스텔 cb* 필드 마이그레이션 (sessionStorage 호환 — 신규 필드 누락 보호)
  // 부수토지 판정 필드 — 이전 버전 이력에는 없으므로 stale 복원 시 undefined 가드 필수.
  if (a.cbTotalLandArea === undefined) a.cbTotalLandArea = "";
  if (a.cbTotalBuildingFootprintArea === undefined) a.cbTotalBuildingFootprintArea = "";
  if (a.cbZoneType === undefined) a.cbZoneType = "";
  // 2026-08-11 개명(`cbIsUnregistered` → `cbUnapprovedBuilding`) — 구 세션 값 이전.
  if (a.cbUnapprovedBuilding === undefined) {
    a.cbUnapprovedBuilding = a.cbIsUnregistered ?? false;
  }
  delete a.cbIsUnregistered;
  if (a.cbEra === undefined) a.cbEra = "";
  // §164⑥ 단서 확인 토글 — 구 세션 미보유 시 false(미확인). 기존 값 보존.
  if (a.cbAcqBuildingStdBy164_5 === undefined) a.cbAcqBuildingStdBy164_5 = false;
  if (a.cbPrevStdPriceSum === undefined) a.cbPrevStdPriceSum = "";
  if (a.cbStdPriceAdjustMonths === undefined) a.cbStdPriceAdjustMonths = "";
  if (a.cbExclusiveArea === undefined) a.cbExclusiveArea = "";
  if (a.cbSharedArea === undefined) a.cbSharedArea = "";
  if (a.cbLandArea === undefined) a.cbLandArea = "";
  if (a.cbUnitPriceAtTransfer === undefined) a.cbUnitPriceAtTransfer = "";
  if (a.cbUnitPriceAtFirstOrAcq === undefined) a.cbUnitPriceAtFirstOrAcq = "";
  if (a.cbBuildingStdPriceAtAcq === undefined) a.cbBuildingStdPriceAtAcq = "";
  if (a.cbBuildingStdPriceAtFirst === undefined) a.cbBuildingStdPriceAtFirst = "";
  if (a.cbBuildingStdPriceAtTransfer === undefined) a.cbBuildingStdPriceAtTransfer = "";
  if (a.cbLandPricePerSqmAtAcq === undefined) a.cbLandPricePerSqmAtAcq = "";
  if (a.cbLandPricePerSqmAtFirst === undefined) a.cbLandPricePerSqmAtFirst = "";
  if (a.cbLandPricePerSqmAtTransfer === undefined) a.cbLandPricePerSqmAtTransfer = "";
  // ③ 일반건물 gb* 필드 마이그레이션 (sessionStorage 호환 — 신규 필드 누락 보호, 사례 31)
  // legacy: gbUseEstimatedAcquisition === true → useEstimatedAcquisition 흡수 후 키 제거 (2026-05-09)
  const legacyGbFlag = (a as Record<string, unknown>).gbUseEstimatedAcquisition;
  if (legacyGbFlag === true && a.assetKind === "general_building") {
    a.useEstimatedAcquisition = true;
  }
  delete (a as Record<string, unknown>).gbUseEstimatedAcquisition;
  if (a.gbTransferLandPricePerSqm === undefined) a.gbTransferLandPricePerSqm = "";
  if (a.gbTransferBuildingValue === undefined) a.gbTransferBuildingValue = "";
  if (a.gbAcqLandPricePerSqm === undefined) a.gbAcqLandPricePerSqm = "";
  if (a.gbAcqBuildingValue === undefined) a.gbAcqBuildingValue = "";
  if (a.gbLandArea === undefined) a.gbLandArea = "";
  if (a.gbBuildingArea === undefined) a.gbBuildingArea = "";
  /* 신설(2026-08-12) — 기존 폼에는 없다. 빈 값이면 계산기가 `gbBuildingArea`로 fallback하므로
     legacy 자산의 동작은 종전과 같다(증축이 있으면 전체 연면적으로 계산되던 것 그대로). */
  if (a.gbOriginalBuildingArea === undefined) a.gbOriginalBuildingArea = "";
  // legacy: gbBuildingFloors → gbBuildingFootprintArea 흡수 (균등층 가정 변환, 2026-05-09)
  const legacyFloorsRaw = (a as Record<string, unknown>).gbBuildingFloors;
  const legacyFloors = typeof legacyFloorsRaw === "string" ? parseInt(legacyFloorsRaw, 10) : 0;
  const legacyArea = typeof a.gbBuildingArea === "string" ? parseFloat(a.gbBuildingArea) : 0;
  if (a.gbBuildingFootprintArea === undefined || a.gbBuildingFootprintArea === "") {
    if (legacyFloors > 0 && legacyArea > 0) {
      a.gbBuildingFootprintArea = String(parseFloat((legacyArea / legacyFloors).toFixed(2)));
    } else {
      a.gbBuildingFootprintArea = "";
    }
  }
  delete (a as Record<string, unknown>).gbBuildingFloors;
  // 일반건물 NBL 판정 필드 (2026-05-10)
  if (a.gbZoneType === undefined) a.gbZoneType = "";
  // ── 일반건물 취득원인·증축·용도변경 normalize — 별도 모듈 (800줄 정책) ──
  // ⚠️ M-1a 취득일 규약 스왑이 이 안에 있다 — 아래 동기화보다 **먼저** 와야 한다.
  migrateGeneralBuildingFields(a);

  /**
   * 분리 OFF ⇒ `landAcquisitionDate === acquisitionDate` 불변식 (M-1a 안전핀).
   *
   * 전환은 값이 아니라 **이름**을 바꾸는 것이므로, 분리 OFF에서 두 날짜가 같기만 하면
   * `acquisitionDate`를 읽는 공용 소비처(감면 시한·신고기한·보유기간 표시 등)가 종전과
   * 같은 값을 받는다 — 이것이 회귀 0의 근거다.
   * 계획서 §3.2(1) · anchor `gb-acquisition-date-convention.anchor.test.ts` A-8
   */
  if (!a.hasSeperateLandAcquisitionDate) {
    a.landAcquisitionDate = (a.acquisitionDate as string) ?? "";
  }

  // ③ 장기임대주택 거주주택 비과세 특례 마이그레이션 (sessionStorage 호환)
  if (!a.rentalHousingException || typeof a.rentalHousingException !== "object") {
    a.rentalHousingException = { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS };
  } else {
    const rhe = a.rentalHousingException as Record<string, unknown>;
    if (rhe.applyException === undefined) rhe.applyException = false;
    if (!rhe.scenario) rhe.scenario = 'A';
    if (!Array.isArray(rhe.rentalUnits)) rhe.rentalUnits = [];
    // 구 스키마 임대주택 유닛 → 신규 스키마 분해 (능동형 UI 개편, 2026-07-25)
    else {
      (rhe.rentalUnits as Record<string, unknown>[]).forEach((u) => {
        // 임대기간 다중 구간 필드 기본값 (interval 모드·rentalPeriods)
        migrateRentalPeriodFields(u);
        // 등록일 1필드 → 세무서/지자체 2필드 (구 값을 지자체 신청일로 이전, 세무서는 재입력)
        if (u.registrationDate !== undefined && u.rentalRegistrationDate === undefined) {
          u.rentalRegistrationDate = u.registrationDate;
          if (u.businessRegistrationDate === undefined) u.businessRegistrationDate = "";
          delete u.registrationDate;
        }
        if (u.businessRegistrationDate === undefined) u.businessRegistrationDate = "";
        if (u.rentalRegistrationDate === undefined) u.rentalRegistrationDate = "";
        // rentalType 5값 → rentalCategory 3값 (short-4는 pre_2018로: 의무기간 4→5년 상향·재입력 유도)
        if (u.rentalCategory === undefined) {
          const t = u.rentalType;
          u.rentalCategory =
            t === "short-6" ? "short_6y"
            : t === "pre-2018" ? "pre_2018"
            : t === "short-4" ? "pre_2018"
            : "long_general"; // long-8/long-10/기타
          delete u.rentalType;
        }
        // region 3값 → 2값 + 918 게이트
        if (u.region === "regulated-area") {
          u.region = "seoul-metro";
          if (u.isRegulatedAreaNewAcq === undefined && u.isExcluded918Rule === undefined) u.isRegulatedAreaNewAcq = true;
        }
        if (u.region !== "seoul-metro" && u.region !== "non-metro") u.region = "seoul-metro";
        // 소재지 법정동코드(주소 자동판별 소스) — 미검색 stale unit은 "" (분기 술어는 length>=10)
        if (u.regionCode === undefined) u.regionCode = "";
        // isRegulatedAreaNewAcq → isExcluded918Rule rename (Phase 1 데이터 값 보존, C4 D-2)
        if (u.isRegulatedAreaNewAcq !== undefined) {
          if (u.isExcluded918Rule === undefined) u.isExcluded918Rule = u.isRegulatedAreaNewAcq;
          delete u.isRegulatedAreaNewAcq;
        }
        if (u.isExcluded918Rule === undefined) u.isExcluded918Rule = false;
        if (u.hasContractDepositProof === undefined) u.hasContractDepositProof = false;
        if (u.isExcludedShortToLongChange === undefined) u.isExcludedShortToLongChange = false;
        if (u.acquisitionOfficialPrice === undefined) u.acquisitionOfficialPrice = "";
        if (u.isNationalSizeHousing === undefined) u.isNationalSizeHousing = false;
        if (u.rentalLandArea === undefined) u.rentalLandArea = "";
        if (u.rentalTotalFloorArea === undefined) u.rentalTotalFloorArea = "";
        if (u.hasMinimum2Units === undefined) u.hasMinimum2Units = false;
        if (u.hasMinimum5UnitsInCity === undefined) u.hasMinimum5UnitsInCity = false;
        if (u.firstSaleContractDate === undefined) u.firstSaleContractDate = "";
        if (u.rentalAutoTermination === undefined) u.rentalAutoTermination = false;
      });
    }
    if (rhe.priorResidenceTransferDate === undefined) rhe.priorResidenceTransferDate = undefined;
    if (rhe.standardPriceAtAcquisitionForPhrp === undefined) rhe.standardPriceAtAcquisitionForPhrp = undefined;
    if (rhe.standardPriceAtPriorTransfer === undefined) rhe.standardPriceAtPriorTransfer = undefined;
    if (rhe.standardPriceAtTransferForPhrp === undefined) rhe.standardPriceAtTransferForPhrp = undefined;
  }
  // ── Phase 2·3 + 매매사례가액 신규 필드 normalize — 별도 모듈 (800줄 정책, 2026-06-15) ──
  applyPhase3Normalize(a);
  // ③ regionCode normalize — 구 세션에 없으면 undefined (optional, string 아닌 값 제거)
  if (a.regionCode !== undefined && typeof a.regionCode !== "string") a.regionCode = undefined;
  // addressPnu normalize — 구 세션 미보유 시 undefined(모달 재조회 fallback)
  if (a.addressPnu !== undefined && typeof a.addressPnu !== "string") a.addressPnu = undefined;
  // ③ §114조의2 Phase2: 증축부분 취득시 기준시가 총액 — 구 세션 복원 방어
  if (a.extensionStdPriceAtAcquisition === undefined) a.extensionStdPriceAtAcquisition = "";
  return a as unknown as AssetForm;
}
