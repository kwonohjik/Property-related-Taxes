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
          // D11-05 — 기존 저장 폼에는 없는 신규 필드. 법문 기본값(거주자)으로 보정하지 않으면
          //          undefined가 「비거주자」로 읽혀 감면이 조용히 배제된다.
          isResident988: true,
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
  if (a.capitalExpenditure === undefined) a.capitalExpenditure = "0";
  if (a.transferExpense === undefined) a.transferExpense = "0";
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
  if (!a.phdFirstDisclosureDate) a.phdFirstDisclosureDate = "";
}
