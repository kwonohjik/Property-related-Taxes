/**
 * 다주택 중과세 엔진 공개 타입 정의
 *
 * 엔진 본체(`../multi-house-surcharge.ts`)와 분리하여 타입 의존 그래프를 얕게 유지한다.
 * transfer.types.ts 등 다수 파일이 이 타입들을 재수출해 사용하므로 동일 패턴.
 *
 * 소득세법 §104 (세율), §152 (1세대 범위),
 * 소령 §167-3 (주택 수 산정), §167-10 (2주택 중과 배제) 기반.
 */

// ============================================================
// 타입 정의
// ============================================================

/**
 * 장기임대주택 유형 (소령 §167-3 ① 2호 가목~자목)
 * A: 민간매입임대 5년 (가목)
 * B: 기존사업자 매입임대 — 2003.10.29 이전 등록 (나목)
 * C: 민간건설임대 5년 (다목)
 * D: 미분양 매입임대 (라목)
 * E: 장기일반 매입임대 10년 (마목)
 * F: 장기일반 건설임대 10년 (바목)
 * G: 자진·자동 말소 후 양도 (사목)
 * H: 단기 매입임대 6년 — 2025.6.4 이후 신설 (아목)
 * I: 단기 건설임대 6년 — 2025.6.4 이후 신설 (자목)
 */
export type RentalHousingType = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

/** 세대 구성원이 보유한 주택 1채 정보 */
export interface HouseInfo {
  /** 내부 식별자 */
  id: string;
  /** 취득일 */
  acquisitionDate: Date;
  /** 공시가격 (원) — 취득 시 기준 */
  officialPrice: number;
  /**
   * 양도 시 공시가격 (원).
   * VALUE 지역(지방) 가액기준 판정에 사용.
   * 미제공 시 officialPrice로 폴백.
   */
  transferOfficialPrice?: number;
  /** 취득 당시 공시가격 (원) — 임대 요건 판정용 */
  acquisitionOfficialPrice?: number;
  /** 임대개시일 당시 공시가격 (원) — 장기임대 가액기준 판정용 */
  rentalStartOfficialPrice?: number;
  /** 수도권/비수도권 구분 — legacy 필드, regionCriteria 미제공 시 폴백 */
  region: "capital" | "non_capital";
  /**
   * 지역기준/가액기준 구분 (소령 §167-3 Stage 2)
   * - "REGION": 수도권·광역시·세종시 → 공시가격 무관 무조건 주택 수 산입
   * - "VALUE": 지방 → 양도 시 공시가격 3억 초과만 산입
   * - 미제공: region 필드로 폴백 (capital → REGION, non_capital → VALUE)
   */
  regionCriteria?: "REGION" | "VALUE";
  /** 수도권 여부 — 장기임대 가액기준 (수도권 6억/비수도권 3억) 판정용 */
  isCapitalArea?: boolean;
  /** 시군구 코드 — 조정대상지역 시점 조회 및 ⑪ 공고일 이전 계약 배제 판정용 */
  regionCode?: string;
  /** 상속주택 여부 */
  isInherited: boolean;
  /** 상속개시일 (isInherited === true 시 필수) */
  inheritedDate?: Date;
  // ── 장기임대 관련 ──
  /** 장기임대사업자 등록주택 여부 (true + rentalType 없으면 legacy 판정) */
  isLongTermRental: boolean;
  /**
   * 장기임대주택 유형 (가목~자목).
   * 제공 시 유형별 세부 요건 검증, 미제공 시 isLongTermRental boolean으로 폴백.
   */
  rentalType?: RentalHousingType;
  /** 임대사업자 등록일 */
  rentalRegistrationDate?: Date;
  /** 사업자 등록일 */
  businessRegistrationDate?: Date;
  /** 임대사업자 말소일 (말소 시 중과 산정에 포함됨) */
  rentalCancelledDate?: Date;
  /** 임대사업자 자진·자동 말소일 (사목 G형 판정용) */
  rentalCancellationDate?: Date;
  /** 임대 시작일 */
  rentalStartDate?: Date;
  /** 임대 종료일 */
  rentalEndDate?: Date;
  /** 임대기간(년) — 직접 입력 가능, 없으면 startDate~endDate로 계산 */
  rentalPeriodYears?: number;
  /** 임대료 증가율 5% 이하 충족 여부 */
  rentIncreaseUnder5Pct?: boolean;
  /** 임대사업자 정식 등록 여부 */
  isRegisteredRental?: boolean;
  /** 국민주택규모(85㎡ 이하, 수도권·도시지역 60㎡ 이하) 여부 */
  isNationalSizeHousing?: boolean;
  /** 전용면적(㎡) */
  exclusiveArea?: number;
  /** 대지면적(㎡) — 건설임대 규모 요건 판정용 (298㎡ 이하) */
  landArea?: number;
  /** 연면적(㎡) — 건설임대 규모 요건 판정용 (149㎡ 이하) */
  totalFloorArea?: number;
  /** 같은 시·군 내 2호 이상 보유 여부 (나목·다목·바목 등) */
  hasMinimum2Units?: boolean;
  /** 같은 시·군 내 5호 이상 보유 여부 (라목) */
  hasMinimum5UnitsInCity?: boolean;
  /** 최초 분양계약일 (라목 판정용) */
  firstSaleContractDate?: Date;
  /** 분양전환 여부 (다목·바목) */
  isConvertedToSale?: boolean;
  /** 임대의무기간 1/2 이상 충족 여부 (사목 G형) */
  hasHalfDutyPeriodMet?: boolean;
  /** 말소일 이후 1년 이내 양도 여부 (사목 G형) */
  isSoldWithin1YearOfCancellation?: boolean;
  /** 2018.9.14 이후 조정지역 취득·다주택 제외 해당 여부 (마목·아목) */
  isExcluded918Rule?: boolean;
  /** 2020.7.11 이후 등록 아파트 제외 해당 여부 (마목·라목) */
  isExcludedAfter20200711Apt?: boolean;
  /** 단기→장기 변경신고 제외 해당 여부 (마목·바목) */
  isExcludedShortToLongChange?: boolean;
  /**
   * 조특법 감면 대상 장기임대주택 (③).
   * 조세특례제한법 §97 등 — 국민주택규모 5년 이상 임대.
   */
  isTaxIncentiveRental?: boolean;
  // ── 아파트/오피스텔 ──
  /** 아파트 여부 */
  isApartment: boolean;
  /** 주거용 오피스텔 여부 (2022.1.1 이후 취득분 산정 포함) */
  isOfficetel: boolean;
  /** 미분양주택 여부 (조특법 §99-3) */
  isUnsoldHousing: boolean;
  // ── 소형 신축/미분양 (⑬) ──
  /**
   * 취득가액(원) — 소형 신축주택 가액기준 판정용.
   * 수도권 6억/비수도권 3억 이하
   */
  acquisitionPrice?: number;
  /** 비수도권 준공 후 미분양 해당 여부 (소형 신축 특례 ⑬) */
  isUnsoldNewHouse?: boolean;
  // ── 계약·법적 취득 ──
  /**
   * 매매계약 체결일.
   * ⑪ 조정대상지역 공고일 이전 계약 배제 판정용.
   */
  contractDate?: Date;
  /** 계약금 지급 증빙 여부 (⑪ 배제 요건) */
  hasContractDepositProof?: boolean;
  /**
   * 저당권 실행·채권변제로 취득한 주택 여부.
   * ⑧ 취득일로부터 3년 이내 → 3주택+ 중과배제.
   */
  isMortgageExecution?: boolean;
  // ── 특수 용도 주택 ──
  /** 사원용 주택 여부 (④ 10년 이상 무상 제공 → 3주택+ 중과배제) */
  isEmployeeHousing?: boolean;
  /** 무상 제공 기간(년) */
  freeProvisionYears?: number;
  /** 조특법상 특례 적용 주택 여부 (⑤) */
  isTaxSpecialExemption?: boolean;
  /** 국가유산(문화재) 주택 여부 (⑥) */
  isCulturalHeritage?: boolean;
  /** 어린이집으로 운영 중인 주택 여부 (⑨ 5년 이상 운영 → 3주택+ 중과배제) */
  isDayCareCenter?: boolean;
  /** 어린이집 운영 기간(년) */
  dayCareOperationYears?: number;
  // ── ⑭ 인구감소지역 세컨드홈 ──
  /**
   * 인구감소지역 소재 주택 여부 (소령 §167-3 ① 2호의2).
   * isSecondHomeRegistered === true 와 함께 주택 수 산정 배제.
   */
  isPopulationDeclineArea?: boolean;
  /** 세컨드홈 특례 등록 여부 (인구감소지역 1주택 특례 신청) */
  isSecondHomeRegistered?: boolean;
  // ── 2주택 배제 관련 ──
  /**
   * 취학·근무상 형편·질병 요양 등 부득이한 사유로 취득한 주택 여부.
   * 소령 §167-10 ① 3호: 2주택 중과배제.
   * 해당 주택에서 1년 이상 거주 + 3년 내 해소 시 매도 주택 중과 배제.
   */
  isUnavoidableReason?: boolean;
  /** 부득이한 사유 주택 거주 기간(년) — 1년 이상 요건 충족 여부 판정용 */
  unavoidableResidenceYears?: number;
  /**
   * 도시·주거환경정비법상 정비구역 (재개발·재건축) 지정 주택 여부.
   * 기준시가 1억 이하 소형 주택의 2주택 중과배제(소령 §167-10 ① 10호)에서
   * 정비구역 주택은 제외된다.
   */
  isRedevelopmentZone?: boolean;
  // ── 소송 취득 주택 ──
  /**
   * 소송으로 인하여 취득하거나 소송이 진행 중인 주택 여부.
   * 2주택 중과배제 적용 (소령 §167-10 ① 8호):
   *   - 소송 진행 중인 경우: 판결 확정 전까지 배제
   *   - 법원 결정으로 취득한 경우: 취득일로부터 3년 이내 배제
   */
  isLitigationHousing?: boolean;
  /**
   * 소송(저당권 실행 외) 결과로 취득한 주택의 취득일.
   * litigationAcquisitionDate로부터 3년 이내이면 2주택 중과배제.
   * 미제공 시 소송 진행 중으로 간주 → 배제 적용.
   */
  litigationAcquisitionDate?: Date;
  // ── 부득이한 사유 상세 ──
  /**
   * 부득이한 사유 해소일 (소령 §167-10 ① 3호).
   * 사유 해소 후 3년 이내에 양도해야 배제 적용.
   * 미제공 시 사유가 지속 중으로 간주.
   */
  unavoidableReasonResolvedDate?: Date;
}

/** 분양권/입주권 정보 (2021.1.1 이후 취득분 → 주택 수 산정 포함) */
export interface PresaleRight {
  id: string;
  type: "presale_right" | "redevelopment_right";
  acquisitionDate: Date;
  region: "capital" | "non_capital";
}

/** 다주택 중과세 판정 입력 */
export interface MultiHouseSurchargeInput {
  /** 세대 보유 전체 주택 목록 */
  houses: HouseInfo[];
  /** 양도 대상 주택 ID */
  sellingHouseId: string;
  /** 양도일 */
  transferDate: Date;
  /** 1세대 여부 */
  isOneHousehold: boolean;
  /** 일시적 2주택 정보 (종전주택 → 신규주택) */
  temporaryTwoHouse?: {
    previousHouseId: string;
    newHouseId: string;
  };
  /** 혼인합가 정보 */
  marriageMerge?: {
    marriageDate: Date;
  };
  /** 동거봉양 합가 정보 */
  parentalCareMerge?: {
    mergeDate: Date;
  };
  /** 세대 보유 분양권/입주권 목록 */
  presaleRights: PresaleRight[];
  /**
   * 한시 유예 조건부 판정 데이터 (2022.5.10 ~ 2026.5.9).
   * 미제공 시 suspended_until 날짜 기준으로만 판단 (기존 동작 유지).
   * 제공 시 계약일(조건A) + 잔금기한(조건B) + 토지허가구역(조건C) 종합 판정.
   */
  gracePeriod?: {
    /** 매매계약 체결일 — 조건A: ≤ 2026.5.9 이어야 유예 가능 */
    contractDate: Date;
    /** 토지거래허가구역 여부 — 조건C 판정용 */
    isLandPermitArea: boolean;
    /** 임차인 거주 여부 — 조건C 판정용 (토지허가+임차인 → 무기한 연장) */
    hasTenantInResidence: boolean;
    /**
     * 해당 조정대상지역 최초 지정일.
     * 2025.10.16 이후 신규 지정 지역 → 잔금 기한 6개월 (기본 4개월).
     */
    areaDesignatedDate?: Date;
  };
}

/** 산정에서 제외된 주택과 사유 */
export interface ExcludedHouse {
  houseId: string;
  reason:
    | "inherited_5years"
    | "long_term_rental"              // 장기임대 (boolean 또는 유형 검증 통과)
    | "low_price_non_capital"         // legacy: regionCriteria 미제공 + non_capital
    | "low_price_local_300"           // VALUE 지역 양도 공시가 3억 이하
    | "unsold_housing"
    | "officetel_pre2022"
    | "small_new_house"               // ⑬ 소형 신축/미분양 특례
    | "population_decline_second_home"; // ⑭ 인구감소지역 세컨드홈 특례
  detail: string;
}

/** 중과세 배제 사유 */
export interface ExclusionReason {
  type:
    | "temporary_two_house"
    | "marriage_merge"
    | "parental_care_merge"
    | "pre_designation_contract"    // ⑪ 공고일 이전 매매계약
    | "only_one_remaining"          // ⑩ 배제 후 유일한 1주택 (3주택+)
    | "mortgage_execution_3years"   // ⑧ 저당권 실행 3년 이내
    | "employee_housing_10years"    // ④ 사원용 주택 10년 이상
    | "tax_special_exemption"       // ⑤ 조특법 특례
    | "cultural_heritage"           // ⑥ 문화재
    | "daycare_center_5years"       // ⑨ 어린이집 5년 이상
    | "tax_incentive_rental"        // ③ 조특법 감면 임대주택
    | "small_new_house"            // ⑬ 소형 신축/미분양 (중과배제)
    | "unavoidable_reason_two_house" // ③ 2주택 취학·근무·질병 부득이한 사유 (소령 §167-10 ③)
    | "low_price_two_house"        // ⑩ 2주택 기준시가 1억 이하 소형 (소령 §167-10 ⑩)
    | "litigation_housing_two_house"; // ⑧ 2주택 소송 취득/진행 중 주택 (소령 §167-10 ① 8호)
  detail: string;
}

/** 다주택 중과세 판정 결과 */
export interface MultiHouseSurchargeResult {
  /** 산정 후 유효 주택 수 (분양권 포함, 배제 주택 제외) */
  effectiveHouseCount: number;
  /** 단순 합계 주택 수 (배제 전) */
  rawHouseCount: number;
  /** 산정에서 제외된 주택 목록 */
  excludedHouses: ExcludedHouse[];
  /** 양도일 기준 조정대상지역 여부 */
  isRegulatedAtTransfer: boolean;
  /** 중과세 실제 적용 여부 (유예·배제 시 false) */
  surchargeApplicable: boolean;
  /** 이론적 중과 유형 */
  surchargeType: "multi_house_2" | "multi_house_3plus" | "none";
  /** 중과세 한시 유예 중 여부 */
  isSurchargeSuspended: boolean;
  /** 중과 배제 사유 목록 */
  exclusionReasons: ExclusionReason[];
  /** 경고 메시지 */
  warnings: string[];
  /**
   * ⑩번 "배제 후 유일한 1주택" 판정 상세.
   * 3주택+ 중과배제 시 표시.
   */
  onlyOneRemainingDetail?: {
    totalEffective: number;
    otherHousesExcluded: Array<{ houseId: string; reason: string }>;
  };
}

// ============================================================
// DB 파싱용 규칙 데이터 타입
// ============================================================

/** DB transfer:special:house_count_exclusion 에서 파싱된 주택 수 산정 규칙 */
export interface HouseCountExclusionRules {
  type: "house_count_exclusion";
  /** 상속주택 배제 기간 (년, 기본값 5) */
  inheritedHouseYears: number;
  /** 장기임대 등록주택 배제 여부 */
  rentalHousingExempt: boolean;
  /** 저가주택 공시가격 한도 */
  lowPriceThreshold: {
    capital: number | null;    // null = 수도권(REGION) 저가 배제 없음
    non_capital: number;       // legacy (regionCriteria 미제공 시 사용, 기본값 100_000_000)
    local?: number;            // VALUE 지역(지방) 기준 (3억 = 300_000_000)
  };
  /** 분양권 주택 수 산정 시작일 */
  presaleRightStartDate: string; // "2021-01-01"
  /** 주거용 오피스텔 산정 시작일 */
  officetelStartDate: string;    // "2022-01-01"
}

export interface RegulatedAreaDesignation {
  designatedDate: string;
  releasedDate: string | null;
}

export interface RegulatedAreaInfo {
  code: string;
  name: string;
  designations: RegulatedAreaDesignation[];
}

export interface RegulatedAreaHistory {
  type: "regulated_area_history";
  regions: RegulatedAreaInfo[];
}

// ============================================================
// 세금 시뮬레이션 타입
// ============================================================

/** 세금 시뮬레이션 입력 */
export interface TaxSimulationInput {
  /** 양도가액 (원) */
  salePrice: number;
  /** 취득가액 (원) */
  acquisitionPrice: number;
  /** 필요경비 (원) */
  expenses: number;
  /** 보유기간 (년) */
  holdingYears: number;
  /** 다주택 중과 유형 */
  surchargeType: "multi_house_2" | "multi_house_3plus";
}

/** 단일 시나리오 세액 */
export interface TaxScenario {
  label: string;
  /** 장기보유특별공제액 (원) */
  ltscAmount: number;
  /** 과세표준 (원) */
  taxableIncome: number;
  /** 산출세액 (원) */
  tax: number;
  /** 실효세율 */
  effectiveRate: string;
}

/** 기본세율 vs 중과세율 비교 결과 */
export interface MultiHouseTaxSimulation {
  /** 양도차익 */
  capitalGain: number;
  /** 보유기간(년) */
  holdingYears: number;
  /** 기본세율 시나리오 (장기보유특별공제 적용) */
  basicScenario: TaxScenario;
  /** 중과세율 시나리오 (장기보유특별공제 배제) */
  heavyScenario: TaxScenario;
  /** 중과 시 추가 세부담 (원) */
  additionalTax: number;
  /** 추가 세부담 포맷 문자열 */
  additionalTaxFormatted: string;
}
