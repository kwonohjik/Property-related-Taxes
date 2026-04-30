/**
 * 주택 수 산정 (Phase 3) 공유 타입 정의
 *
 * 6차원 매트릭스: 시점 · 지분 · 상속 · 권리 · 세대 · 한시
 *
 * 법적 근거:
 *   - 지방세법 시행령 §28의2 (중과제외 대상)
 *   - 지방세법 시행령 §28의3 (1세대 정의 + 별도 인정 4종)
 *   - 지방세법 시행령 §28의4 (주택 수 산정 기준)
 *   - 지방세법 §13의3 (신탁재산 위탁자 카운트)
 */

// ============================================================
// 소유 주택 정보 (OwnedHouseInfo)
// ============================================================

export type HouseType =
  | "apartment"           // 아파트
  | "villa"               // 빌라 (연립·다세대)
  | "single_family"       // 단독주택
  | "multi_household"     // 다가구주택
  | "urban_living"        // 도시형생활주택
  | "officetel"           // 오피스텔 (주거용)
  | "other";              // 기타

/** 보유 주택 카드 */
export interface OwnedHouseInfo {
  /** 주택 식별자 (디버깅·로그용) */
  id?: string;

  // ─── 기본 정보 ───
  /** 시가표준액 (원) */
  standardValue: number;
  /** 주택 유형 */
  type: HouseType;
  /** 취득일 (YYYY-MM-DD) */
  acquisitionDate: string;
  /** 수도권 여부 (시행령 §28의2 1호 1억/2억 한도 결정) */
  isMetropolitan: boolean;
  /** 정비구역(재개발·재건축·소규모정비) 소재 여부 (1억/2억 배제 제외) */
  isUrbanRegenerationArea?: boolean;

  // ─── 11종 제외 항목 매핑 ───
  /** 노인복지주택 (노인복지법에 따른 노인복지주택) */
  isElderHousing?: boolean;
  /** 문화유산·천연기념물 지정 주택 */
  isCulturalHeritage?: boolean;
  /** 농어촌 주택 (대지 660㎡·연면적 150㎡·6,500만원 이내, 일정 지역 외) */
  isFarmlandRural?: boolean;
  /** 미분양 아파트 (수도권 외 85㎡·6억 이하, 시행령 §28의4⑥11호) */
  isUnsoldAptNonMetro?: boolean;
  /** 멸실 목적 취득 미분양 (시공자가 3년 한정 보유) */
  isUnsoldFromConstructor?: boolean;
  /** 채권변제(경매·공매) 취득 (3년 내 처분 조건) */
  isCreditorAcquisition?: boolean;
  /** 공공지원민간임대주택 (임대사업자 등록) */
  isPublicSupportedLeaseRegistered?: boolean;
  /** 인구감소지역 임대주택 (60일 내 등록) */
  isPopulationDeclineLease?: boolean;
  /** 사원임대용 주택 (60㎡ 이하 공동주택, 1년 내 직접 사용) */
  isStaffRentalHousing?: boolean;

  // ─── [v3] 한시 특례 (2024.1.10 ~ 2027.12.31) ───
  /**
   * 한시 특례 신축 (시행령 §28의4⑥11호 + 취득세 §28의4② 준용)
   * 2024.1.10~2027.12.31 신축 60㎡·3억(수도권 6억) 이하 다가구·연립·다세대·도시형생활주택
   */
  isHansiBenefitNewBuild?: boolean;
  /**
   * 한시 특례 임대등록 (시행령 §28의4② 2호)
   * 2024.1.10~2027.12.31 유상승계 + 임대사업자 등록 + 60㎡·3억(수도권 6억) 이하
   */
  isHansiBenefitLeaseRegistered?: boolean;
  /**
   * 한시 특례 미분양 아파트 (시행령 §28의4② 3호)
   * 2024.1.10~2025.12.31 수도권 외 85㎡·6억 이하 미분양
   */
  isHansiBenefitUnsoldApt?: boolean;

  // ─── [v4 D3] 공유지분 ───
  /**
   * 공유 지분율 (0~1, 단독이면 undefined 또는 1.0)
   * 시행령 §28의4④: 공동소유 주택은 지분 큰 자 소유로 봄
   */
  ownershipShare?: number;
  /**
   * 공동소유자 모두 동일 1세대 여부
   * 1세대 내 공유 → 1주택. 별도세대와 공유 → 각자 1주택.
   */
  coOwnersAllInHousehold?: boolean;

  // ─── [v4 D4] 공동상속 ───
  /**
   * 상속개시일 (YYYY-MM-DD) — 5년 미경과 제외 판정
   * §28의4⑥3호: 상속개시일부터 5년 미경과 → 주택 수 제외
   */
  inheritanceDate?: string;
  /**
   * 상속 주택에서 납세자(본인)의 지분율
   * §28의4⑤: 지분 가장 큰 상속인을 소유자로 봄
   */
  shareInInheritance?: number;
  /**
   * 상속인 중 최대 지분 (다른 상속인 포함 비교 대상)
   * 동순위 판정: 본인 지분 == maxShareInInheritors 이면 동순위
   */
  maxShareInInheritors?: number;
  /**
   * 동순위 여부 (tieInMaxShare = true 이면 거주자→최연장자 우선 판정)
   */
  tieInMaxShare?: boolean;
  /**
   * 상속 주택 거주자 여부 (동순위 시 거주자 우선)
   */
  isResidentInInheritedHouse?: boolean;
  /**
   * 상속인 중 최연장자 여부 (거주자 동순위 시 최연장자 우선)
   */
  isOldestInheritor?: boolean;
}

// ============================================================
// 입주권·분양권 (RightAsset)
// ============================================================

export type RightAssetType =
  | "redevelopment_right"    // 조합원입주권 (재개발·재건축)
  | "subscription_right";    // 주택분양권 (분양사업자)

export interface RightAsset {
  /** 자산 식별자 */
  id?: string;
  /** 권리 유형 */
  type: RightAssetType;
  /**
   * 권리 취득일 (YYYY-MM-DD)
   * §28의4①: 분양권·입주권으로 주택 취득 시 주택 수 산정 기준일 = 권리취득일
   */
  rightAcquisitionDate: string;
  /**
   * 혼인 전 배우자 보유 분양권 여부 (2026.12.31까지 한시 적용)
   * §28의4⑥10호: 혼인 전 분양권 → 주택 수 제외 (한시 2026년까지)
   */
  isPreMarriageSubscriptionRight?: boolean;
  /**
   * 상속개시일 (YYYY-MM-DD) — 5년 미경과 제외
   * §28의4⑥3호: 상속 5년 미경과 입주권·분양권도 제외
   */
  inheritanceDate?: string;
}

// ============================================================
// 주거형 오피스텔 (OfficeAsset)
// ============================================================

export interface OfficeAsset {
  /** 자산 식별자 */
  id?: string;
  /** 시가표준액 (원) — 1억 초과만 주택 수에 카운트 */
  standardValue: number;
  /**
   * 상속개시일 (YYYY-MM-DD) — 5년 미경과 제외
   * §28의4⑥3호 준용
   */
  inheritanceDate?: string;
}

// ============================================================
// 취득 대상 주택 (PendingAcquisition)
// ============================================================

/** 현재 취득하려는 주택 정보 */
export interface PendingAcquisition {
  /** 수도권 여부 */
  isMetropolitan: boolean;
  /** 취득가액 (원) — 한시 특례 가격 요건 판정 */
  acquisitionValue: number;
  /** 전용면적 (㎡) — 한시 특례 면적 요건 판정 */
  areaSqm?: number;
  /** 주택 유형 (다가구 여부 등) */
  type?: HouseType;
  /**
   * 한시 특례 신축 여부 (§28의4② 1호)
   * 2024.1.10~2027.12.31 신축 60㎡·3억(수도권 6억) 이하
   */
  isHansiBenefitNewBuild?: boolean;
  /**
   * 한시 특례 임대등록 여부 (§28의4② 2호)
   * 2024.1.10~2027.12.31 유상승계 + 임대사업자 등록
   */
  isHansiBenefitLeaseRegistered?: boolean;
  /**
   * 한시 특례 미분양 아파트 여부 (§28의4② 3호)
   * 2024.1.10~2025.12.31 수도권 외 85㎡·6억 이하
   */
  isHansiBenefitUnsoldApt?: boolean;
  /**
   * 다가구주택 호별 전용면적 구분 기재 여부 (60㎡ 한도 판정용)
   * 건축물대장 호수별 전용면적 기재된 경우만 60㎡ 기준 적용
   */
  isMultiHouseholdWithUnitArea?: boolean;
  /**
   * 분양권·입주권으로 취득하는지 (권리취득일 소급 산정)
   * §28의4①: 해당 시 rightAcquisitionDate를 주택 수 산정 기준일로 사용
   */
  acquiredViaRight?: boolean;
  /**
   * 권리취득일 (YYYY-MM-DD) — 분양계약일 또는 입주권 취득일
   * 1세대 내 다회 취득 시 가장 빠른 날
   */
  rightAcquisitionDate?: string;
}

// ============================================================
// 1세대 정보 (Household)
// ============================================================

export type MemberRelation =
  | "self"            // 본인
  | "spouse"          // 배우자
  | "child"           // 자녀 (미혼)
  | "parent"          // 부모
  | "grandparent"     // 조부모
  | "sibling"         // 형제자매 (30세 미만 미혼 자녀 제외)
  | "other";          // 기타 동거인

export interface HouseholdMember {
  /** 가족 구성원 식별자 */
  id?: string;
  /** 관계 */
  relation: MemberRelation;
  /** 나이 */
  age: number;
  /** 미성년 여부 (만 19세 미만) */
  isMinor?: boolean;
  /**
   * 12개월 소득 (원) — 30세 미만 소득 요건 판정
   * §28의3② 1호: 12개월 소득 ≥ 기준중위소득 40% → 별도 세대 인정
   */
  income12Months?: number;
  /**
   * 기준중위소득 (원) — 보건복지부 고시 기준 (연간 환산)
   * 1인 기준 중위소득 × 40% = 별도 세대 인정 소득 기준
   */
  medianIncome?: number;
  /** 독립 생계 유지 여부 (소득 조건과 함께 30세 미만 별도 세대 인정) */
  hasIndependentLivelihood?: boolean;
  /** 65세 이상 직계존속 동거봉양 합가 여부 (§28의3② 2호) */
  isElderlyCohabitation?: boolean;
  /** 90일 이상 해외 출국 여부 (§28의3② 3호) */
  overseasMoreThan90Days?: boolean;
  /** 취득 후 60일 이내 주소 이전 여부 (§28의3② 4호) */
  relocateWithin60Days?: boolean;
}

export interface Household {
  /** 가족 구성원 배열 */
  members: HouseholdMember[];
}

// ============================================================
// 주택 수 산정 입력 (HouseCountInput)
// ============================================================

export interface HouseCountInput {
  /** 보유 주택 배열 (현재 보유 중 — 취득 대상 제외) */
  houses: OwnedHouseInfo[];
  /**
   * 입주권·분양권 배열
   * §28의4⑥: 주택으로 간주되어 주택 수에 포함 (제외 요건 해당 시 제외)
   */
  rights: RightAsset[];
  /**
   * 주거형 오피스텔 배열
   * 시가표준액 1억 초과만 주택 수 카운트
   */
  offices: OfficeAsset[];
  /**
   * 취득 대상 주택 (현재 취득하려는 물건)
   * 한시 특례 적용 여부 + 권리취득일 소급 여부
   */
  pendingAcquisition?: PendingAcquisition;
  /**
   * 1세대 정보 (세대 별도 인정 4종 판정용)
   * §28의3: 1세대 정의 + 별도 인정 사유
   */
  household?: Household;
  /**
   * 신탁재산 위탁자로서 보유 주택 수
   * §13의3 1호: 위탁자 명의 신탁 주택 = 본인 보유로 간주
   */
  trustedHouseCount?: number;
  /**
   * 주택 수 산정 기준일 (YYYY-MM-DD)
   * 기본값: 취득일 (잔금일) 또는 rightAcquisitionDate (권리취득 시 소급)
   */
  referenceDate?: string;
}

// ============================================================
// 주택 수 산정 결과 (HouseCountResult)
// ============================================================

export type ExclusionReason =
  | "low_value_metro"          // 수도권 1억 이하 (§28의2 1호 가목)
  | "low_value_non_metro"      // 비수도권 2억 이하 (§28의2 1호 나목)
  | "elder_housing"            // 노인복지주택
  | "cultural_heritage"        // 문화유산·천연기념물
  | "farmland_rural"           // 농어촌 주택
  | "unsold_apt_non_metro"     // 수도권 외 미분양 아파트
  | "unsold_constructor"       // 멸실 목적 미분양 시공자 취득
  | "creditor_acquisition"     // 채권변제 취득
  | "public_supported_lease"   // 공공지원민간임대
  | "population_decline_lease" // 인구감소지역 임대
  | "staff_rental"             // 사원임대용 주택
  | "inheritance_under_5yr"    // 상속 5년 미경과 (§28의4⑥3호)
  | "pre_marriage_subscription_right" // 혼인 전 분양권 (§28의4⑥10호, 2026.12.31까지)
  | "hansi_new_build"          // 한시 특례 신축 (§28의4⑥11호)
  | "hansi_lease_registered"   // 한시 특례 임대등록
  | "hansi_unsold_apt"         // 한시 특례 미분양 아파트
  | "low_value_office"         // 시가표준액 1억 이하 오피스텔
  | "pending_hansi_new_build"  // 취득 주택 한시 특례 신축
  | "pending_hansi_lease"      // 취득 주택 한시 특례 임대등록
  | "pending_hansi_unsold";    // 취득 주택 한시 특례 미분양

export type SeparateHouseholdReason =
  | "under30_income"           // 30세 미만 소득 충족 (§28의3② 1호)
  | "over65_cohabitation"      // 65세 이상 동거봉양 합가 (§28의3② 2호)
  | "overseas_90days"          // 90일 이상 출국 (§28의3② 3호)
  | "relocate_60days";         // 60일 이내 분리 (§28의3② 4호)

export interface ExcludedItem {
  /** 제외된 자산 식별자 또는 유형 */
  assetId?: string;
  /** 자산 유형 */
  assetType: "house" | "right" | "office" | "pending";
  /** 제외 사유 */
  reason: ExclusionReason;
  /** 법적 근거 조문 */
  legalBasis: string;
  /** 사람이 읽을 수 있는 사유 설명 */
  description: string;
}

export interface HansiBenefitDetail {
  /** 자산 식별자 */
  assetId?: string;
  /** 자산 유형 */
  assetType: "house" | "pending";
  /** 한시 특례 유형 */
  type: "new_build" | "lease_registered" | "unsold_apt";
  /** 법적 근거 */
  legalBasis: string;
}

export interface SeparateHouseholdInfo {
  /** 별도 세대 인정 여부 */
  isSeparate: boolean;
  /** 사유 */
  reason?: SeparateHouseholdReason;
  /** 사람이 읽을 수 있는 사유 설명 */
  description?: string;
  /** 법적 근거 */
  legalBasis?: string;
}

export interface HouseCountResult {
  /** 전체 보유 자산 수 (제외 전, 취득 대상 포함) */
  totalCount: number;
  /** 실효 카운트 (제외 후, 취득 대상 포함 여부 pendingIncluded) */
  effectiveCount: number;
  /**
   * 취득 대상 주택이 실효 카운트에 포함되는지 여부
   * 한시 특례 대상이면 false (카운트에서 제외)
   */
  pendingAcquisitionIncluded: boolean;
  /** 제외된 자산 상세 목록 */
  excludedDetails: ExcludedItem[];
  /** 한시 특례 혜택 상세 */
  hansiBenefitDetails?: HansiBenefitDetail[];
  /**
   * 주택 수 산정 기준일
   * 권리취득일 소급 적용 시 rightAcquisitionDate, 일반 시 referenceDate
   */
  referenceDate: string;
  /** 세대 별도 인정 정보 */
  separateHousehold?: SeparateHouseholdInfo;
  /**
   * 일시적 2주택 D-day 안내 (해당 시)
   * P3-3에서 assessTemporaryTwoHouse와 연계
   */
  temporaryTwoHouseWarning?: string;
  /** 신탁재산 위탁자 카운트 가산 수 */
  trustedHouseCount?: number;
  /** 경고 메시지 배열 */
  warnings: string[];
  /** 법적 근거 배열 */
  legalBasis: string[];
}
