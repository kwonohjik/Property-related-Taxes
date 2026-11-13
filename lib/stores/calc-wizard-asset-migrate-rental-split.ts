/**
 * 자산 폼 마이그레이션 — **장기임대 §97 시리즈 ~ 분리취득·§166⑧** 필드 normalize.
 *
 * `calc-wizard-asset-migrate.ts`에서 분리했다(800줄 정책 — `migrateAsset`이 960줄이었다).
 * 그 파일이 이미 일반건물·Phase 2·3을 같은 방식으로 위임하고 있어 **확립된 패턴**이다.
 *
 * ⚠️ `a`를 **그대로 변형**한다(반환 없음) — 호출부의 실행 순서를 지키기 위함이다.
 *    구 sessionStorage 복원 시 신규 필드가 `undefined`로 남으면 controlled→uncontrolled로
 *    뒤집히고, validate의 `opt()`도 빈 문자열과 다르게 다룬다(신규 자산 필드 stale 가드).
 */
import { legacyLongTermRentalToRental973 } from "./legacy-rental-reduction";
import { isLegacyHousingReductionType, legacyHousingReductionToForm } from "./legacy-housing-reduction";

/**
 * §98의3 수도권과밀억제권역 3-state 이관 (리뷰 Q-20, 2026-11-10 결정).
 * 종전 boolean: true → "yes". false·없음 → ""(미선택) — 기본값 false와 사용자가 고른 「아니오」를 구분할 수 없어,
 * 확인하지 않은 과밀 사안이 조용히 100% 감면으로 가지 않도록 다시 묻는다. 이미 3-state 값("yes"·"no")은 그대로다(재실행 멱등).
 */
export function overconcentration983FromLegacy(v: unknown): "" | "yes" | "no" {
  if (v === true || v === "yes") return "yes";
  if (v === "no") return "no";
  return "";
}

export function hasPositiveAmount(v: unknown): boolean {
  if (typeof v === "number") return v > 0;
  if (typeof v !== "string") return false;
  const n = parseInt(v.replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0;
}

/**
 * ⚠️ `Record<string, unknown>`을 받는다 — 호출부(`migrateAsset`)가 raw 세션 객체를 그 형태로
 *    다루기 때문이다. `AssetForm`으로 좁히면 **구 세션에만 있는 legacy 키**(예: `landSplitMode`)에
 *    접근하지 못한다.
 */
export function normalizeRentalAndSplitFields(a: Record<string, unknown>): void {
  // Phase 2 (2026-06-11): 장기임대 §97 시리즈 — 3-state 필드 누락 보정 (구 세션 복원 방어)
  if (Array.isArray(a.reductions)) {
    a.reductions = (a.reductions as Record<string, unknown>[]).map((r) => {
      // R-4 — 레거시 `long_term_rental`은 폼 union·④·⑫에서 제거됐다. 이미 세션에 들어 있는
      // 값을 그대로 두면 감면이 **조용히 사라진다** ⇒ 여기서 `rental_97_3`로 이관한다.
      if (r && r.type === "long_term_rental") {
        return legacyLongTermRentalToRental973(r.rentIncreaseRate);
      }
      // 레거시 신축·미분양 단순 감면도 같은 이유로 조문 ID로 이관한다(`legacy-housing-reduction.ts`).
      if (r && isLegacyHousingReductionType(r.type)) {
        return legacyHousingReductionToForm(r.type, a.acquisitionDate, a.assetContractDate);
      }
      if (r && typeof r.type === "string" && (r.type as string).startsWith("rental_97") && r.type !== "rental_97_3_legacy") {
        return {
          registrationDate: "",
          rentalStartDate: "",
          isTaxRegistered: false,
          rentIncreaseViolationMode: "",
          // D2-06 — 신규 3-state. 구 세션엔 값이 없다.
          rentalContinuesToTransfer: null,
          stdPriceAtRentalEnd: "",
          rentalEndDate: "",
          // Q10 — 안분 기준시가 override(신규). 구 세션엔 값이 없다(비면 자산-수준 폴백).
          stdPriceAtAcquisition: "",
          stdPriceAtTransfer: "",
          ...r,
          /**
           * D1-03 — 구 키 `hasVacancyOver6Months`는 「6개월 초과 공실이 있는가」를 물었다.
           * §97·§97의2·§97의3·§97의4의 유예는 3월(조특칙 §44)이므로, 구 세션의 "없음"은
           * 새 질문("3개월 초과 공실이 있는가")의 답이 될 수 없다 —
           * 4개월 공실 보유자가 구 UI에서 "없음"을 골랐을 수 있기 때문이다.
           * ⇒ 구 키만 있는 세션은 **미선택(null)로 되돌려 다시 묻는다**.
           *    (§97의5는 임계가 그대로지만, 조문별 분기 없이 한 번 다시 묻는 편이 안전하다.)
           * ⚠️ 새 키(`hasVacancyOverGrace`)가 이미 있으면 그건 **새 질문에 대한 답**이다 — 보존한다.
           *    이 정규화는 새로고침·이력 불러오기 때마다 돌므로 무조건 null이면 「없음」이 매번 풀린다(C2).
           */
          hasVacancyOverGrace: r.hasVacancyOverGrace ?? null,
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
          // D2-07 — §97의3 건설임대 확인. 구 세션은 미확인(false)으로 둔다.
          // ⚠️ 「2023.1.1 전 등록분은 경과조치로 이 값과 무관하다」는 종전 주석은 **틀렸다**
          //    (2026-09-14): 종전 규정에도 등록 시한이 있어 **매입임대는 2020.12.31**에서 끝난다.
          //    2021~2022년 등록분에서는 이 값이 적격을 가르므로, ⑤가 토글을 보여 주고 ⑧이 묻는다.
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
          // PR-B — 대통령령 제29241호 부칙 §2② 확인. 구 세션엔 없다(= 미응답 · 한도 적용, 종전 동작).
          ...((r.type === "rental_97_3" || r.type === "rental_97_5") && r.clause4Grandfather === undefined
            ? { clause4Grandfather: "" as const }
            : {}),
          // 리뷰 6번 — §97의5①1호 매입임대 확인(3-state). 구 세션은 미선택으로 둔다(다시 묻는다).
          ...(r.type === "rental_97_5" && r.isPurchaseRental === undefined ? { isPurchaseRental: null } : {}),
          // 리뷰 9번 — 조특령 §97의5③ 세무서 사업자등록일. 구 세션엔 없다(⑧이 다시 묻는다).
          ...((r.type === "rental_97_5" || r.type === "rental_97_3" || r.type === "rental_97_4") && r.taxRegistrationDate === undefined
            ? { taxRegistrationDate: "" }
            : {}),
          // 리뷰 5번 — 령 §97의5①2호·3호 간주기간. 구 세션엔 없다(= 없음).
          ...(r.type === "rental_97_5" && r.deemedRentalPeriods === undefined
            ? { hasDeemedRentalPeriod: false, deemedRentalPeriods: [] }
            : {}),
          // V-13 — §97의5 상속 합산 신규 필드. 구 세션엔 없다(= 해당 없음).
          ...(r.type === "rental_97_5" && r.isInherited975 === undefined
            ? { isInherited975: false, decedentRegistrationDate975: "", decedentRentalStartDate975: "" }
            : {}),
          // V-14 — §97의3 상속 합산 신규 필드. 구 세션엔 없다(= 해당 없음).
          ...(r.type === "rental_97_3" && r.isInherited973 === undefined
            ? { isInherited973: false, decedentRegistrationDate973: "", decedentRentalStartDate973: "" }
            : {}),
          // 구 조특령 §97의3②2호 자동말소 간주 — 구 세션엔 없다(= 아님).
          ...(r.type === "rental_97_3" && r.autoCancelled973 === undefined ? { autoCancelled973: false } : {}),
          // PR-C — 단기→장기 변경신고 구분. 구 세션의 boolean(2020.7.11 이후 변경분 = 적용 제외)을 그대로 옮긴다.
          ...(r.type === "rental_97_3" && r.shortTermConversionMode === undefined
            ? {
                shortTermConversionMode: r.isConvertedFromShortTerm ? ("after" as const) : ("none" as const),
                conversionReportedDate: "",
                conversionAcceptedDate: "",
              }
            : {}),
          // D2-04 — §97의4 대상 요건 신규 필드. 구 세션은 미선택으로 둔다.
          ...(r.type === "rental_97_4" && r.rental974Category === undefined
            ? { rental974Category: "", officialPriceAtStart: r.officialPriceAtStart ?? "" }
            : {}),
          // 리뷰 R-3·R-4 (2026-11-02) — §97의4 상속 합산·자동말소 신규 필드. 구 세션엔 없다(= 해당 없음).
          ...(r.type === "rental_97_4" && r.isInherited974 === undefined
            ? { isInherited974: false, inheritanceDate974: "", decedentRegistrationDate974: "", decedentRentalStartDate974: "" }
            : {}),
          ...(r.type === "rental_97_4" && r.isAutoCancelled974 === undefined
            ? { isAutoCancelled974: false, autoCancelledDate974: "" }
            : {}),
          // 가목2) 단서(사목) — 자진말소. 구 세션엔 없다(= 해당 없음).
          ...(r.type === "rental_97_4" && r.isVoluntaryCancelled974 === undefined
            ? { isVoluntaryCancelled974: false, voluntaryCancelledDate974: "" }
            : {}),
          // 리뷰 R-2 — 소령 §167의3①2호 가목2) 아파트 여부. 구 세션은 미선택.
          ...(r.type === "rental_97_4" && r.isApartment974 === undefined ? { isApartment974: "" } : {}),
        };
      }
      // §99의4 (2026-06-11): 구 stub 데이터(본 필드 없이 type만 있던 항목) 본 필드 누락 보정 (③)
      // NH-30 — 연접 여부는 기본값을 채우지 않는다: 옛 토글 `isAdjacentArea`의 false는 기본값과 답을 구별할 수 없어
      // 미응답으로 강등한다(읽기 `new994AdjacentAnswer` — 명부 행 선언도 같은 함수로 읽는다). 면적 칸은 빈 값(범위 안이면 ⑧ 필수).
      if (r && (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown")) {
        return {
          ruralHouseAcquisitionDate: "",
          ruralHouseJibun: "",
          ruralHouseStdPrice: "",
          isRegisteredHanok: false,
          meetsLocationRequirement: false,
          ruralLandAreaSqm994: "",
          ruralHouseType994: "",
          ruralHouseFloorAreaSqm994: "",
          ...(r.type === "new_99_4_hometown" ? { meetsHometownRequirement: false } : {}),
          ...r,
        };
      }
      // P1 §99 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "new_99") {
        return {
          // D11-05 — 기존 저장 폼에는 없는 신규 필드. 법문 기본값(거주자)으로 보정하지 않으면
          //          undefined가 「비거주자」로 읽혀 감면이 조용히 배제된다.
          isResident99: true,
          isHousingConstructionBusiness99: false,
          contractDate99: "",
          usageApprovalDate99: "",
          acquisitionType99: "from_builder",
          isNationalHousing99: false,
          standardPriceAtAcquisition99: "",
          standardPriceAt5Years99: "",
          standardPriceAtTransfer99: "",
          exclusiveAreaSqm99: "",
          // NH-02·NH-03 — 구 세션에는 없다. 미응답("")이면 validate(⑧)가 차단한다.
          houseType99: "",
          grossFloorAreaSqm99: "",
          attachedLandAreaSqm99: "",
          stdPriceFloorMet99: "",
          luxuryFacility99: "",
          firstContract99: "",
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
          // 부칙 §29② 착공 여부 — 구 세션에는 없다. 미응답("")이면 범위 안에서 validate(⑧)가 차단한다(자동으로 «예»/«아니오»를 채우지 않는다).
          constructionStartedBefore2003_993: "",
          // NH-02·NH-17 — 구 세션에는 없다. 미응답("")이면 해당 범위에서 validate(⑧)가 차단한다(자동으로 채우지 않는다).
          houseType993: "",
          grossFloorAreaSqm993: "",
          attachedLandAreaSqm993: "",
          stdPriceFloorMet993: "",
          luxuryFacility993: "",
          firstContract993: "",
          hasOccupancyAtContract: false,
          isResident993: true,
          isHousingConstructionBusiness993: false,
          ...r,
        };
      }
      // P1 §98의8 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_8") {
        return {
          // D11-05 — 기존 저장 폼에는 없는 신규 필드. 법문 기본값(거주자)으로 보정하지 않으면
          //          undefined가 「비거주자」로 읽혀 감면이 조용히 배제된다.
          isResident988: true,
          contractDate988: "",
          acquisitionPrice988: "",
          exclusiveAreaSqm988: "",
          rentalContractDate988: "",
          rentalStartDate988: "",
          businessRegistrationDate988: "",
          rentalRegistrationDate988: "",
          rentalVacancyPeriods988: [],
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
          // D11-05 — 기존 저장 폼에는 없는 신규 필드. 법문 기본값(거주자)으로 보정하지 않으면
          //          undefined가 「비거주자」로 읽혀 감면이 조용히 배제된다.
          isResident98: true,
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
          // D11-05 — 기존 저장 폼에는 없는 신규 필드. 법문 기본값(거주자)으로 보정하지 않으면
          //          undefined가 「비거주자」로 읽혀 감면이 조용히 배제된다.
          isResident982: true,
          contractDate982: "",
          isNonCapitalUnsold982: false,
          isFirstOrFcfsContract982: false,
          occupiedAtContract982: "",
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
          downPaymentCompletedDate983: "",
          constructionStartDate983: "",
          usageApprovalDate983: "",
          isOutsideSeoulNotDesignated983: false,
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
          // Q-20 — 종전 boolean: true → "yes", false·없음 → ""(미선택). false는 기본값인지 선택인지 구분할 수 없어 다시 묻는다.
          isOverconcentration983: overconcentration983FromLegacy((r as Record<string, unknown>).isOverconcentration983),
        };
      }
      if (r && r.type === "unsold_98_5") {
        // D2(US-58·US-59) — 옛 기록의 인하율(%) 문자열은 두 금액(공시 분양가·매매가)으로 되돌릴 수 없고, 그 %를 그대로 쓰면
        // 입력 방식이 바뀐 뒤에도 옛 값이 조용히 감면율을 정한다. 버리고 두 금액을 비운다 → ⑧이 재입력을 요구한다.
        const { priceReductionRatePct985: _legacyRatePct, ...rest985 } = r as Record<string, unknown>;
        void _legacyRatePct;
        return {
          // US-42 — 옛 기록에는 없다. 법문 기본값(거주자 등)으로 보정하지 않으면 undefined가 「적용 주체 아님」으로 읽힐 수 있다.
          isEligibleSubject985: true,
          contractDate985: "",
          announcedPrice985: "",
          contractPrice985: "",
          isNonCapitalUnsoldAtCutoff985: false,
          isFirstContract985: false,
          isNotOccupiedAtContract985: false,
          isNotRecontract985: false,
          standardPriceAtAcquisition985: "",
          standardPriceAt5Years985: "",
          standardPriceAtTransfer985: "",
          ...rest985,
        };
      }
      if (r && r.type === "unsold_98_6") {
        return {
          isEligibleSubject986: true, // US-42 — 옛 기록 보정(법문 기본값)
          hoType986: "seller_rented",
          stdPriceSumAtBase986: "",
          floorAreaSqm986: "",
          isUnsoldAfterCompletion986: false,
          isFirstContract986: false,
          isNotOccupiedAfterCompletion986: false,
          isNotRecontract986: false,
          sellerRented2Years986: false,
          rentalContractDate986: "",
          rentalStartDate986: "",
          // US-60·US-24 — 옛 기록에는 등록일·공실 구간이 없다. 등록일은 비워 둔다(⑧이 2호에서 입력을 요구 — 임대개시일로 대신 채우지 않는다).
          businessRegistrationDate986: "",
          rentalRegistrationDate986: "",
          rentalVacancyPeriods986: [],
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
          // D11-05 — 기존 저장 폼에는 없는 신규 필드. 법문 기본값(거주자)으로 보정하지 않으면
          //          undefined가 「비거주자」로 읽혀 감면이 조용히 배제된다.
          isDomestic987: true,
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
  // #17 후속 — 배율 초과분 분리의 토지분 자본적지출. 구 세션에는 없다(undefined면 CurrencyInput이 uncontrolled로 시작).
  if (a.housingExcessLandCapex === undefined) a.housingExcessLandCapex = "";
  if (a.capitalExpenditure === undefined) a.capitalExpenditure = "0";
  if (a.transferExpense === undefined) a.transferExpense = "0";
  if (a.depreciationAmount === undefined) a.depreciationAmount = "0";
  // 공유 지분율 — 단독 소유 100/100 fallback (지분 단계취득 자산은 명시 입력)
  if (!a.ownershipNumerator || a.ownershipNumerator === "") a.ownershipNumerator = "100";
  if (!a.ownershipDenominator || a.ownershipDenominator === "") a.ownershipDenominator = "100";
  // 「나머지 지분은 타인 소유」 선언 — 구 sessionStorage에는 없는 신규 필드.
  // undefined 그대로 두면 ⑤ 토글이 uncontrolled로 뜬다(신규 자산 필드 stale 가드).
  if (a.ownershipRemainderThirdParty === undefined) a.ownershipRemainderThirdParty = "";
  // 지분율이 100%로 되돌아오면 선언은 뜻을 잃는다 — ⑤가 토글을 숨기므로 값만 남으면
  // 화면에 없는 상태가 게이트를 통과시키는 유령이 된다. 여기서 함께 지운다.
  if (a.ownershipNumerator === a.ownershipDenominator) a.ownershipRemainderThirdParty = "";
  if (!a.landStandardPriceAtTransfer) a.landStandardPriceAtTransfer = "";
  if (!a.buildingStandardPriceAtTransfer) a.buildingStandardPriceAtTransfer = "";
  if (a.usePreHousingDisclosure === undefined) a.usePreHousingDisclosure = false;
  // R12 — 신규 표시 축. 옛 sessionStorage에는 없으므로 기본값을 채운다.
  if (a.phdHousingType !== "individual" && a.phdHousingType !== "apartment")
    a.phdHousingType = "individual";
  if (!a.phdFirstDisclosureDate) a.phdFirstDisclosureDate = "";
}
