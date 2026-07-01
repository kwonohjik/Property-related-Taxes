/**
 * 양도세 감면 23개 조문 골격 — 공통 타입
 *
 * Phase 1 (골격) 단계: 모든 조문 stub은 동일 시그니처를 따른다.
 * 각 stub은 `evaluate()` 단일 함수를 export — 시한 검증만 수행하고 후속 단계는 미구현.
 *
 * 매핑 감사: docs/02-design/features/transfer-reduction-mapping-audit.md
 * 인벤토리 표: docs/00-pm/transfer-reduction-expansion.plan.md §3
 */

import type { ReductionEffectCategory } from "../legal-codes/transfer";

/** 23개 조문 식별자 — Phase 1 인벤토리 확정본 */
export type TransferReductionId =
  // 장기임대 §97 시리즈 (6)
  | "rental_97_main"
  | "rental_97_proviso"
  | "rental_97_2"
  | "rental_97_3"
  | "rental_97_4"
  | "rental_97_5"
  // 신축 §99 시리즈 (4)
  | "new_99"
  | "new_99_3"
  | "new_99_4_rural"
  | "new_99_4_hometown"
  // 미분양 §98 시리즈 + §99의2 (10)
  | "unsold_98"
  | "unsold_98_2"
  | "unsold_98_3"
  | "unsold_98_4"
  | "unsold_98_5"
  | "unsold_98_6"
  | "unsold_98_7"
  | "unsold_98_8"
  | "unsold_98_9"
  | "unsold_99_2"
  // 별도 (4)
  | "self_farming"
  | "public_expropriation"
  | "gb_designated_land"
  | "replacement_land_comp";

/** 23개 조문 카테고리 분류 — UI 펼침 그룹 매핑 */
export type ReductionCategory =
  | "rental"           // 장기임대 §97 시리즈
  | "new_housing"      // 신축 §99·§99의3·§99의4
  | "unsold_housing"   // 미분양 §98 시리즈 + §99의2
  | "standalone";      // §69 자경농지, §77 공익수용

/** 시한 검증 입력 컨텍스트 */
export interface PeriodCheckContext {
  /** 양도일 (필수) */
  transferDate: Date;
  /** 취득일 — 대부분 조문 사용 */
  acquisitionDate?: Date;
  /** 분양/매매계약일 — §99·§99의3·§99의2·§98 시리즈 일부 (계약 시점이 시한 판정 기준) */
  contractDate?: Date;
  /** 임대 등록일 — §97의3·§97의5 (장기일반민간임대 등록 시점) */
  registrationDate?: Date;
  /** 임대 개시일 — §97 ① 본문 (2000.12.31 이전 임대개시 요건) */
  rentalStartDate?: Date;
  /** 사용승인·사용검사일 — §99 ①항 1호, §99의3 ①항 2호 (자기건설) */
  usageApprovalDate?: Date;
}

/** 시한 검증 결과 */
export interface PeriodCheckResult {
  inPeriod: boolean;
  /** 시한 외 사유 — `inPeriod === false` 일 때만 채움 */
  failReason?: string;
  /** UI에 표시할 시한 라벨 (예: "2001.5.23~2003.6.30") */
  periodLabel?: string;
}

/** 골격 단계 stub 의 표준 결과 — 시한 검증만 통과 시 isEligible:false + "구현 예정" 사유 */
export interface ReductionStubResult {
  id: TransferReductionId;
  isEligible: false;
  inPeriod: boolean;
  failReason: string;
  legalBasis: string;
  category: ReductionCategory;
  effectCategory: ReductionEffectCategory;
  /** UI 활성/전체 카운터·라벨용 메타 */
  meta: {
    article: string;
    periodLabel: string;
    effectLabel: string;
  };
}

/** 23개 stub 라우터의 통합 입력 — 향후 Phase 2~ 본격 구현 시 확장 */
export interface ReductionEvaluationInput extends PeriodCheckContext {
  id: TransferReductionId;
  /** 자산 정보 (전용면적·취득가액·지역 등 — Phase 2~ 사용) */
  asset?: {
    exclusiveAreaSqm?: number;
    acquisitionPrice?: number;
    region?: "metropolitan" | "non_metropolitan" | "outside_overconcentration" | "nationwide";
  };
}

// ============================================================
// 장기임대 §97 시리즈 — Phase 2 본격 구현 (2026-06-11)
// 법령 검증: 조특법 §97·§97의2·§97의3·§97의4·§97의5 + 조특령 §97의3·§97의4·§97의5
// (law.go.kr 2026-06-11 현행 조회. §97의4 추가율 표 수치는 API 응답 누락 — R-3 미확정)
// ============================================================

export type Rental97ArticleId =
  | "rental_97_main" | "rental_97_proviso" | "rental_97_2"
  | "rental_97_3" | "rental_97_4" | "rental_97_5";

export interface Rental97RentHistoryItem {
  contractDate: Date;
  monthlyRent: number;
  deposit: number;
  contractType: "jeonse" | "monthly" | "semi_jeonse";
}

export interface Rental97VacancyPeriod {
  startDate: Date;
  endDate: Date;
}

/**
 * §97 시리즈 평가 입력 — 기존 stub 패턴(ReductionEvaluationInput)과 동일하게
 * PeriodCheckContext를 extends (registrationDate·rentalStartDate·contractDate·
 * usageApprovalDate 키를 ctx 그대로 사용 — 변환 매핑 불요).
 */
export interface Rental97EvaluationInput extends PeriodCheckContext {
  id: Rental97ArticleId;
  /** 세무서 사업자 등록 (소법 §168) — §97의3·§97의5 임대개시 인정 요건 (조특령 §97의3④·§97의5③) */
  isTaxRegistered?: boolean;
  /** 6개월(180일) 이상 공실 구간 — 유효임대기간에서 차감 */
  vacancyPeriods?: Rental97VacancyPeriod[];
  /** 간소화 모드 — 사용자 명시 신고 (true = 임대료 5% 증액 위반 있음 → 불적용) */
  rentIncreaseViolated?: boolean;
  /** 정밀 모드 — 제공 시 validateRentIncrease로 검증 (간소화 신고보다 우선) */
  rentHistory?: Rental97RentHistoryItem[];
  /** 전월세 전환율 (정밀 모드 환산보증금용, 기본 0.04) */
  jeonseConversionRate?: number;
  // ── §97의3 (조특령 §97의3③) ──
  /** 임대개시일 당시 주택+부속토지 기준시가 합계 (원) — 6억(수도권 밖 3억) 한도 (령 §97의3③4호) */
  officialPriceAtStart?: number;
  /** 국민주택규모 이하 여부 — 사용자 확인 입력 (령 §97의3③2호. 다가구는 가구당 전용면적 기준) */
  isNationalHousingScale?: boolean;
  region?: "capital" | "non_capital";
  propertyType?: "apartment" | "non_apartment";
  rentalHousingType?: "long_term_private" | "public_support_private";
  /** 2020.7.11 이후 단기민간임대 → 장기일반 변경 신고분 — 적용 제외 (§97의3① 괄호) */
  isConvertedFromShortTerm?: boolean;
  // ── §97 본문/단서 ──
  /** 신축 연도 (1986~2000 — §97①1호) */
  constructionYear?: number;
  /** 국민주택 여부 — 사용자 확인 입력 (§97①·§97의2① 공통 요건) */
  isNationalHousing?: boolean;
  /** §97① 단서 분기: (a) 건설임대 5년+ / (b) 매입임대 5년+ (1995.1.1 이후 취득·미입주) / (c) 10년+ */
  provisoCase?: "a_construction" | "b_purchase" | "c_10years";
  // ── §97의2 ──
  /** 건설임대(1호) vs 매입임대(2호) */
  rental972Type?: "construction" | "purchase";
  // ── 임대기간 안분 (조특령 §97의3⑤·§97의5②) ──
  /**
   * 임대기간 중 발생 양도차익 안분용 기준시가 3점 (원).
   * rentalStartDate ≤ acquisitionDate(취득 즉시 임대)이면 불요 — ratio 1.
   * 그 외에는 3점 모두 필요 (미입력 시 불적용 사유 반환 — silent 안분 금지).
   */
  stdPriceAtAcquisition?: number;
  stdPriceAtRentalStart?: number;
  stdPriceAtTransfer?: number;
  // ── 세액감면 계열 컨텍스트 ──
  /** 산출세액 (tax_amount 계열 — §97·§97의2·§97의5) */
  calculatedTax?: number;
}

export interface Rental97IneligibleReason {
  code: string;
  message: string;
  legalBasis: string;
}

/** §97의3·§97의4 — 장기보유특별공제 단계(STEP 4) 효과 */
export interface RentalLthdEffect {
  effectCategory: "long_term_holding_special" | "long_term_holding_additional";
  /** §97의3: 0.70 — 일반 공제율 대체 (임대기간 분 양도차익 한정) */
  overrideRate?: number;
  /** §97의4: 0.02~0.10 — 보유기간 공제율에 가산 (⚠️ R-3 표 수치 원문 미확정) */
  additionalRate?: number;
  /**
   * 임대기간 분 양도차익 비율 (0~1) — 조특령 §97의3⑤ 기준시가 안분.
   * 취득 즉시 임대(rentalStartDate ≤ acquisitionDate)면 1.
   */
  rentalGainRatio: number;
  eligibleRentalYears: number;
}

/** §97 본문/단서·§97의2·§97의5 — 산출세액 단계(STEP 7) 효과 */
export interface RentalTaxAmountEffect {
  effectCategory: "tax_amount";
  reductionRate: number;       // 0.5 | 1.0
  /** applyRate(calculatedTax × rentalGainRatio, rate) — §133 한도 미적용 (§133 열거 외 — law.go.kr 확인) */
  reductionAmount: number;
  /** 임대기간 분 비율 (§97의5만 안분 — §97·§97의2는 1) */
  rentalGainRatio: number;
  isFullExemption: boolean;
}

export type Rental97Result =
  | ({ id: Rental97ArticleId; isEligible: true; legalBasis: string } & (RentalLthdEffect | RentalTaxAmountEffect))
  | {
      id: Rental97ArticleId;
      isEligible: false;
      ineligibleReasons: Rental97IneligibleReason[];
      legalBasis: string;
      effectCategory: ReductionEffectCategory;
    };

// ============================================================
// §99의4 농어촌주택·고향주택 — 주택수 제외 (2026-06-11)
// 법령 검증: 조특법 §99의4 본문 ①~⑧ + 령 ①~⑭ (law.go.kr 원문 전문 확보)
// 설계: docs/02-design/features/transfer-99-4-rural-hometown.engine.design.md
// ============================================================

export type New994ArticleId = "new_99_4_rural" | "new_99_4_hometown";

export interface New994EvaluationInput {
  id: New994ArticleId;
  /** 양도하는 일반주택의 취득일 (자산-수준 acquisitionDate 재사용 — ① "취득 전 보유" 순서 판정).
   *  기존 패턴(acquisitionDate)과 달리 명시 명명 — 농어촌주택 취득일과의 모호성 제거. */
  generalHouseAcquisitionDate: Date;
  transferDate: Date;
  /** 농어촌주택등 취득일 — 시한(rural 2003.8.1~ / hometown 2009.1.1~, ~2028.12.31)·3년 보유·취득순서 */
  ruralHouseAcquisitionDate?: Date;
  /** 취득 당시 주택+부속토지 기준시가 합계 (원) — 3억(등록 한옥 4억) 한도 (①1호나목·2호다목) */
  ruralHouseStdPrice?: number;
  /** 령⑭ 지자체 등록 한옥 — 한도 4억 전환 */
  isRegisteredHanok?: boolean;
  /** ③ 일반주택과 같은/연접 읍·면·동(고향은 시) — true면 배제 */
  isAdjacentArea?: boolean;
  /** ①1호가목/2호나목 소재지 요건 — 사용자 확인 토글 (별표12·배제지역 자동판정 범위 외) */
  meetsLocationRequirement?: boolean;
  /** ①2호가목·령⑥ 고향 요건 (등록기준지/거주 10년) — hometown 전용 */
  meetsHometownRequirement?: boolean;
}

export type New994IneligibleCode =
  | "OUT_OF_PERIOD"
  | "MISSING_RURAL_ACQ_DATE"
  | "MISSING_STD_PRICE"
  | "STD_PRICE_EXCEEDED"
  | "ADJACENT_AREA"
  | "LOCATION_UNCONFIRMED"
  | "HOMETOWN_UNCONFIRMED"
  | "ACQUISITION_ORDER"
  // §98의9 검토 발견(2026-06-11): ① "취득한 후 … 양도" — 농어촌 취득 전 양도 배제
  | "TRANSFER_BEFORE_ACQUISITION";

export interface New994IneligibleReason {
  code: New994IneligibleCode;
  message: string;
  legalBasis: string;
}

export type New994Result =
  | {
      id: New994ArticleId;
      isEligible: false;
      ineligibleReasons: New994IneligibleReason[];
      legalBasis: string;
      effectCategory: "house_count_exclusion";
    }
  | {
      id: New994ArticleId;
      isEligible: true;
      legalBasis: string;
      effectCategory: "house_count_exclusion";
      /** 소유주택에서 제외하는 농어촌주택등 수 (§99의4① — 1채) */
      houseCountExclusion: 1;
      /** 농어촌주택등 보유연수 (결과 카드 표시·추징 경고 근거) */
      ruralHoldingYears: number;
      /** ④ 선적용 (3년 미보유 양도) — ⑥ 추징 경고 */
      clawbackWarning: boolean;
      /** R-D: 다주택 중과 주택수에는 미반영 (소령 §167의3 별개 체계) */
      surchargeNotAffected: true;
    };

// ============================================================
// §98의9 수도권 밖 준공후미분양주택 — 주택수 제외 (2026-06-11)
// 법령 검증: 법 §98의9 ①~④ + 령 §98의8 ①~④ (법 §98의9의 위임 시행령은
// 조번호가 어긋난 령 §98의8 — law.go.kr 원문 전문 확보)
// 설계: docs/02-design/features/transfer-98-9-unsold.engine.design.md
// ============================================================

export interface Unsold989EvaluationInput {
  id: "unsold_98_9";
  /** 양도하는 종전주택의 취득일 (자산-수준 acquisitionDate — 취득순서 판정) */
  generalHouseAcquisitionDate: Date;
  transferDate: Date;
  /** 준공후미분양주택 취득일 — 시한(2024.1.10~2026.12.31)·취득순서·양도시점 */
  unsoldHouseAcquisitionDate?: Date;
  /** 취득가액 (원) — 7억 이하 (령 §98의8①2호. 기준시가 아님) */
  unsoldHouseAcquisitionPrice?: number;
  /** 전용면적 (㎡) — 85 이하 (령 §98의8①1호) */
  unsoldHouseExclusiveArea?: number;
  /** 수도권 밖 소재 (법 §98의9①1호) — 사용자 확인 토글 */
  isNonCapitalRegion?: boolean;
  /** 취득 당시 1주택 보유 1세대 (법 §98의9① 본문) — 사용자 확인 토글 */
  wasOneHouseholdAtAcquisition?: boolean;
  /** 양도자 자격·최초계약·선착순·확인날인 (령 §98의8①3~5호·②) — 묶음 토글 */
  meetsSellerAndContractRequirement?: boolean;
}

export type Unsold989IneligibleCode =
  | "OUT_OF_PERIOD"
  | "MISSING_UNSOLD_ACQ_DATE"
  | "MISSING_PRICE"
  | "MISSING_AREA"
  | "PRICE_EXCEEDED"
  | "AREA_EXCEEDED"
  | "ACQUISITION_ORDER"
  // 법 ① "취득한 후 … 양도" — 양도일 ≤ 미분양 취득일 배제 (검토 발견)
  | "TRANSFER_BEFORE_ACQUISITION"
  | "REGION_UNCONFIRMED"
  | "ONE_HOUSE_UNCONFIRMED"
  | "SELLER_UNCONFIRMED";

export interface Unsold989IneligibleReason {
  code: Unsold989IneligibleCode;
  message: string;
  legalBasis: string;
}

export type Unsold989Result =
  | {
      id: "unsold_98_9";
      isEligible: false;
      ineligibleReasons: Unsold989IneligibleReason[];
      legalBasis: string;
      effectCategory: "house_count_exclusion";
    }
  | {
      id: "unsold_98_9";
      isEligible: true;
      legalBasis: string;
      effectCategory: "house_count_exclusion";
      /** 소유주택에서 제외하는 준공후미분양주택 수 (법 §98의9① — 1채) */
      houseCountExclusion: 1;
      /** 종부세 ② 1세대1주택자 의제 — 별도 신청(9.16~9.30) 안내 (계산기 범위 외) */
      comprehensiveTaxNote: true;
      /** F-4: §99의4 동시 적격 시 §99의4 우선 적용 — isEligible(자체 요건 충족)이지만
       *  주택수 제외는 미반영. 카드가 "적격이나 §99의4 우선 적용으로 미적용" 표시. */
      dualExclusionWarning?: boolean;
      /** R-D: 다주택 중과 주택수에는 미반영 (소령 §167의3 별개 체계) */
      surchargeNotAffected: true;
    };
