/**
 * 양도세 감면 23개 조문 Phase 1 골격 — discriminated union stub 멤버
 *
 * 본 파일은 transfer.types.ts의 800줄 정책 준수를 위해 분리됨.
 * 23개 조문 중 신규 20개의 stub union 멤버를 정의 (자경/공익은 기존 멤버 유지).
 *
 * 본 단계는 stub — `type` 필드만 정의, 본 요건은 Phase 2~ 에서 추가.
 * 기존 long_term_rental/new_housing/unsold_housing 은 자동변환 마이그레이션
 * 완료 후 deprecated 처리 예정 (`lib/storage/migrations/`).
 *
 * 매핑: lib/tax-engine/transfer-reductions/types.ts TransferReductionId
 *      lib/tax-engine/transfer-reductions/metadata.ts REDUCTION_METADATA
 */

/**
 * 장기임대 §97 시리즈 — Phase 2 본격 구현 공통 필드 (2026-06-11).
 * Date 필드는 route handler에서 date-coerce 적용 후 전달.
 * 상세: lib/tax-engine/transfer-reductions/types.ts Rental97EvaluationInput
 */
interface Rental97CommonFields {
  /** 지자체 임대사업자 등록일 */
  registrationDate?: Date;
  /** 임대개시일 */
  rentalStartDate?: Date;
  /** 세무서 사업자등록 여부 (소법 §168) */
  isTaxRegistered?: boolean;
  /** 임대료 5% 증액 위반 신고 (간소화 모드) */
  rentIncreaseViolated?: boolean;
  /** 계약별 임대료 이력 (정밀 모드 — 간소화보다 우선) */
  rentHistory?: { contractDate: Date; monthlyRent: number; deposit: number; contractType: "jeonse" | "monthly" | "semi_jeonse" }[];
  /** 6개월+ 공실 구간 */
  vacancyPeriods?: { startDate: Date; endDate: Date }[];
  /** 임대기간 안분용 기준시가 3점 (조특령 §97의3⑤·§97의5② — 임대개시>취득 시 필수) */
  stdPriceAtRentalStart?: number;
  _phase1Stub?: true;
}

export type TransferReductionStub =
  // 장기임대 §97 시리즈 (rental_97_3 = 기존 long_term_rental 후속 — 정정된 ID)
  | ({ type: "rental_97_main";
      constructionYear?: number;
      isNationalHousing?: boolean;
    } & Rental97CommonFields)
  | ({ type: "rental_97_proviso";
      constructionYear?: number;
      isNationalHousing?: boolean;
      provisoCase?: "a_construction" | "b_purchase" | "c_10years";
    } & Rental97CommonFields)
  | ({ type: "rental_97_2";
      rental972Type?: "construction" | "purchase";
      isNationalHousing?: boolean;
    } & Rental97CommonFields)
  | ({ type: "rental_97_3";
      /** @deprecated Phase 1 stub 호환 (단순 경로 입력) */
      rentalYears?: number;
      /** @deprecated Phase 1 stub 호환 */
      rentIncreaseRate?: number;
      /** 임대개시일 당시 주택+부속토지 기준시가 합계 (령 §97의3③4호 — 6억/3억 한도) */
      officialPriceAtStart?: number;
      /** 국민주택규모 이하 (령 §97의3③2호) — 사용자 확인 */
      isNationalHousingScale?: boolean;
      region?: "capital" | "non_capital";
      propertyType?: "apartment" | "non_apartment";
      rentalHousingType?: "long_term_private" | "public_support_private";
      /** 2020.7.11 이후 단기→장기 변경 신고분 (§97의3① 괄호 — 적용 제외) */
      isConvertedFromShortTerm?: boolean;
    } & Rental97CommonFields)
  | ({ type: "rental_97_4";
      rentalHousingType4?: "long_term_private" | "public_support_private" | "public_construction" | "public_purchase";
      region?: "capital" | "non_capital";
    } & Rental97CommonFields)
  | ({ type: "rental_97_5";
      officialPriceAtStart?: number;
      region?: "capital" | "non_capital";
    } & Rental97CommonFields)
  // 신축 §99 시리즈
  // §99 — P1 본격 구현 (2026-06-11): 차감형 본 필드 (Date — route mapper ⑭ 변환)
  | { type: "new_99";
      region?: "metropolitan" | "non_metropolitan"; // Phase 1 stub 호환
      contractDate99?: Date;
      usageApprovalDate99?: Date;
      standardPriceAtAcquisition99?: number;
      standardPriceAt5Years99?: number;
      standardPriceAtTransfer99?: number;
      exclusiveAreaSqm99?: number;
      isResident99?: boolean;
      isHousingConstructionBusiness99?: boolean;
      acquisitionType99?: "from_builder" | "self_built";
      isNationalHousing99?: boolean;
      hasOccupancyAtContract99?: boolean;
      isRecontractExcluded99?: boolean;
      isRedevelopedNewHouse99?: boolean;
      previousHouseStdPrice99?: number;
      _phase1Stub?: true }
  // §99의3 — Phase 2 본격 구현 (2026-05-06): 본 요건 필드 union 멤버
  | {
      type: "new_99_3";
      // Phase 1 stub 호환
      region?: "metropolitan" | "non_metropolitan";
      _phase1Stub?: true;
      // Phase 2 본 요건 필드 (lib/tax-engine/transfer-reductions/new-99-3.ts New993Input 일부)
      contractDate993?: string;
      usageApprovalDate993?: string;
      standardPriceAt5Years?: number;
      standardPriceAtAcquisition993?: number;
      standardPriceAtTransfer993?: number;
      region993?: "outside_speculation" | "speculation";
      acquisitionType993?: "from_builder" | "self_built";
      hasOccupancyAtContract?: boolean;
      isResident993?: boolean;
      isHousingConstructionBusiness993?: boolean;
      // Round 10 (2026-05-06): PHD 환산 입력
      phdMode993?: boolean;
      phdFirstDisclosureDate993?: string;
      phdFirstDisclosurePrice993?: number;
      phdLandAreaSqm993?: number;
      phdLandPricePerSqmAtAcq993?: number;
      phdLandPricePerSqmAtFirst993?: number;
      phdBuildingStdAtAcq993?: number;
      phdBuildingStdAtFirst993?: number;
    }
  // §99의4 — Phase 2 본격 구현 (2026-06-11): 주택수 제외 본 필드 (Date — route mapper ⑭ 변환)
  | { type: "new_99_4_rural";
      ruralHouseAcquisitionDate?: Date;
      ruralHouseStdPrice?: number;
      isRegisteredHanok?: boolean;
      isAdjacentArea?: boolean;
      meetsLocationRequirement?: boolean;
      _phase1Stub?: true }
  | { type: "new_99_4_hometown";
      ruralHouseAcquisitionDate?: Date;
      ruralHouseStdPrice?: number;
      isRegisteredHanok?: boolean;
      isAdjacentArea?: boolean;
      meetsLocationRequirement?: boolean;
      meetsHometownRequirement?: boolean;
      _phase1Stub?: true }
  // 미분양 §98 시리즈 + §99의2
  | { type: "unsold_98";         _phase1Stub?: true }
  | { type: "unsold_98_2";       _phase1Stub?: true }
  | { type: "unsold_98_3";       region?: "metropolitan" | "non_metropolitan"; _phase1Stub?: true }
  | { type: "unsold_98_4";       _phase1Stub?: true }
  | { type: "unsold_98_5";       priceReductionRate?: number; _phase1Stub?: true }
  | { type: "unsold_98_6";       _phase1Stub?: true }
  | { type: "unsold_98_7";       _phase1Stub?: true }
  // §98의8 — P1 본격 구현 (2026-06-11): 차감형 50% 본 필드 (Date — route mapper ⑭ 변환)
  | { type: "unsold_98_8";
      contractDate988?: Date;
      acquisitionPrice988?: number;
      exclusiveAreaSqm988?: number;
      rentalStartDate988?: Date;
      rentalEndDate988?: Date;
      inheritedRentalMonths988?: number;
      isResident988?: boolean;
      isUnsoldAfterCompletion988?: boolean;
      isFirstContract988?: boolean;
      isNotRecontract988?: boolean;
      standardPriceAtAcquisition988?: number;
      standardPriceAt5Years988?: number;
      standardPriceAtTransfer988?: number;
      _phase1Stub?: true }
  // §98의9 — Phase 2 본격 구현 (2026-06-11): 주택수 제외 본 필드 (Date — route mapper ⑭ 변환)
  | { type: "unsold_98_9";
      unsoldHouseAcquisitionDate?: Date;
      unsoldHouseAcquisitionPrice?: number;
      unsoldHouseExclusiveArea?: number;
      isNonCapitalRegion?: boolean;
      wasOneHouseholdAtAcquisition?: boolean;
      meetsSellerAndContractRequirement?: boolean;
      _phase1Stub?: true }
  | { type: "unsold_99_2";       _phase1Stub?: true };
