/**
 * 양도세 감면 24개 조문 — 공통 타입
 *
 * 🔴 **2026-09-02 정정** — 종전 헤더는 「Phase 1 (골격) 단계: 모든 조문 stub은 동일 시그니처를
 * 따른다. 각 stub은 `evaluate()` 단일 함수를 export — 시한 검증만 수행하고 후속 단계는 미구현」
 * 이었다. **셋 다 더 이상 사실이 아니다**:
 *   · 통합 stub `evaluateReduction`은 호출부 0건 dead code여서 **삭제**했다(D9-04 · `index.ts:13`).
 *   · 조문별 evaluator는 시그니처가 서로 다르다(`evaluateRental973` · `resolveHouseCountExclusion`
 *     · `resolveSpecialHouseExclusions` 등 — 진입점 목록은 `index.ts` 헤더가 정본).
 *   · `metadata.ts` 기준 **24개 조문 전부 `isFullyImplemented: true`**다.
 * 같은 「Phase 1 골격」 허위 서술이 Step5 배너에도 복제돼 있었다(D9-08에서 제거).
 *
 * 매핑 감사: docs/02-design/features/transfer-reduction-mapping-audit.md
 * 인벤토리 표: docs/00-pm/transfer-reduction-expansion.plan.md §3
 */

import type { ReductionEffectCategory } from "../legal-codes/transfer";

/** 24개 조문 식별자 (rental 6 + new_housing 4 + unsold_housing 10 + standalone 4) */
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

/** 24개 조문 카테고리 분류 — UI 펼침 그룹 매핑 */
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
  /**
   * §97의2 시한 판정의 **축**을 가른다 (D1-10).
   * 1호(건설임대) = 신축일(`usageApprovalDate`) / 2호(매입임대) = 매매계약일(`contractDate`).
   * 조특법 §97의2①이 호마다 다른 시점을 지정하므로 한 fallback 체인으로 합칠 수 없다.
   */
  rental972Type?: "construction" | "purchase";
}

/** 시한 검증 결과 */
export interface PeriodCheckResult {
  inPeriod: boolean;
  /** 시한 외 사유 — `inPeriod === false` 일 때만 채움 */
  failReason?: string;
  /** UI에 표시할 시한 라벨 (예: "2001.5.23~2003.6.30") */
  periodLabel?: string;
}

// ============================================================
// 장기임대 §97 시리즈 — Phase 2 본격 구현 (2026-06-11)
// 법령 검증: 조특법 §97·§97의2·§97의3·§97의4·§97의5 + 조특령 §97의3·§97의4·§97의5
// (law.go.kr 2026-06-11 현행 조회. §97의4 추가율 표 수치는 당시 API 응답에서 누락됐으나
//  ✅ **R-3 확정** — 법제처 `target=eflaw` 본문 실측으로 6년 2% / 7년 4% / 8년 6% / 9년 8% /
//  10년 10%를 확인했고 `rental-97-4.ts`의 `RENTAL_97_4_ADDITIONAL_RATE_TABLE`과 일치한다.)
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
  /**
   * 유예를 **초과하는** 공실 구간 — 구간 전체를 유효임대기간에서 차감.
   * 유예는 조문마다 다르다(D1-03) — §97·§97의2·§97의3·§97의4 = 3월(조특칙 §44) /
   * §97의5 = 6개월(조특령 §97의5①1호). 상수는 `rental-97-shared-helpers.ts` 참조.
   */
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
  /**
   * §97의3① 「「민간임대주택에 관한 특별법」 제2조제2호에 따른 **민간건설임대주택**으로서…」 (D2-07)
   *
   * ⚠️ **경과조치가 있다** — 법률 제19199호(2022.12.31 공포, 2023.1.1 시행) 부칙 **제38조**:
   *   「이 법 시행 전에 **등록을 한** 공공지원민간임대주택 또는 장기일반민간임대주택에 대한
   *    양도소득세 과세특례에 관하여는 제97조의3제1항의 개정규정에도 불구하고
   *    **종전의 규정에 따른다**.」
   *   ⇒ **2023-01-01 전 등록분은 매입임대라도 그대로 적용**된다. 건설한정을 무조건 걸면
   *     법 근거 없는 불리 적용이 된다.
   */
  isPrivateConstructionRental?: boolean;
  /**
   * §97의4 대상 목 구분 — 조특령 §97의4① → 소령 §167의3①2호 (D2-04).
   * - `purchase_a` = **가목** 민간매입임대 1호 이상 (한도 6억 / 수도권 밖 3억)
   * - `construction_c` = **다목** 건설임대 2호 이상·대지 298㎡·연면적 149㎡ 이하 (한도 6억)
   * 나목은 §97의4 대상이 아니다(조특령 §97의4①이 「가목 및 다목」만 인용).
   */
  rental974Category?: "purchase_a" | "construction_c";
  /** 2020.7.11 이후 단기민간임대 → 장기일반 변경 신고분 — 적용 제외 (§97의3① 괄호) */
  isConvertedFromShortTerm?: boolean;
  // ── §97 본문/단서 ──
  /**
   * 조특령 §97① 주체 요건 — 「임대주택을 **5호 이상** 임대하는 거주자」 자기확인.
   * 공동소유는 호수 × 지분비율로 산정한다(같은 항 후단).
   * `undefined`(미입력)는 **충족으로 읽지 않는다** — 엔진이 불적용 사유를 반환한다.
   */
  hasMin5RentalUnits?: boolean;
  /**
   * 조특령 §97⑤4호 — 「**5호 미만**의 주택을 임대한 기간은 주택임대기간으로 보지 아니할 것」.
   * 주체 요건(①)과 **별개**다: 지금 5호 이상이어도 3호였던 기간은 임대기간에서 빠진다.
   * 공실과 달리 유예가 없어 구간 전체를 무조건 차감한다.
   *
   * ⚠️ §97의2에는 적용하지 않는다 — §97의2①이 「2호 이상」을 요건으로 삼으므로
   *    §97의2②의 준용(「§97②~⑥」)에도 불구하고 5호 기준을 그대로 가져오면
   *    §97의2가 통째로 무력화되어 성질에 반한다.
   */
  belowMin5UnitsPeriods?: Rental97VacancyPeriod[];
  /**
   * 조특령 §97의2① 주체 요건 — 「**1호 이상의 신축임대주택**을 포함하여 **2호 이상**의
   * 임대주택을 5년 이상 임대하는 거주자」 자기확인.
   * §97의 5호 요건과 **다른 조문·다른 숫자**이므로 필드를 공유하지 않는다.
   */
  hasNewRentalPlus2Units?: boolean;
  /** 신축 연도 (1986~2000 — §97①1호) */
  constructionYear?: number;
  /** 국민주택 여부 — 사용자 확인 입력 (§97①·§97의2① 공통 요건) */
  isNationalHousing?: boolean;
  /** §97① 단서 분기: (a) 건설임대 5년+ / (b) 매입임대 5년+ (1995.1.1 이후 취득·미입주) / (c) 10년+ */
  provisoCase?: "a_construction" | "b_purchase" | "c_10years";
  /**
   * §97①2호 — 「1985년 12월 31일 이전에 신축된 **공동주택**」 (D1-06).
   * 2호는 ⓐ공동주택일 것과 ⓑ1986.1.1 현재 미입주일 것 **두 사실**을 모두 요구한다.
   */
  isMultiUnitHousing?: boolean;
  /** §97①2호 — 「1986년 1월 1일 현재 입주된 사실이 없는 주택」 (D1-06) */
  isUnoccupiedAt1986?: boolean;
  /**
   * §97① 단서 **나목** / §97의2①2호 — 「**취득 당시 입주된 사실이 없는 주택만 해당한다**」
   * (D1-07). 두 조문이 같은 문언을 쓰지만 각 감면 유형의 폼 variant에 따로 둔다.
   */
  isUnoccupiedAtAcquisition?: boolean;
  // ── §97의2 ──
  /** 건설임대(1호) vs 매입임대(2호) */
  rental972Type?: "construction" | "purchase";
  /**
   * §97의2①1호 **나목** 선언 (D9-01).
   * 「**1999년 8월 19일 이전에 신축된 공동주택**으로서 **1999년 8월 20일 현재 입주된 사실이
   * 없는 주택**」 — 가목(1999.8.20~2001.12.31 신축)과 **별개 분기**다.
   *
   * ⚠️ 시한창을 1999.8.19 이전까지 넓히는 것만으로는 **과다포섭**이 된다 —
   *    1999.8.20 현재 이미 입주돼 있던 구축 건설임대까지 적격이 되기 때문이다.
   *    두 사실(공동주택 · 미입주)을 자기확인으로 받아야 나목이 성립한다.
   */
  isMultiUnitHousing972?: boolean;
  isUnoccupiedAt19990820?: boolean;
  // ── 임대기간 안분 (조특령 §97의3⑤·§97의5②) ──
  /**
   * 임대기간 중 발생 양도차익 안분용 기준시가 3점 (원).
   * rentalStartDate ≤ acquisitionDate(취득 즉시 임대)이면 불요 — ratio 1.
   * 그 외에는 3점 모두 필요 (미입력 시 불적용 사유 반환 — silent 안분 금지).
   */
  stdPriceAtAcquisition?: number;
  stdPriceAtRentalStart?: number;
  stdPriceAtTransfer?: number;
  /**
   * 임대가 **양도일까지 계속**되었는가 (D2-06).
   * 조특령 §97의3⑤ B·§97의5②는 「실제 임대기간의 **마지막 날**의 기준시가」를
   * 양도일 기준시가 D와 **별개 변수로** 정의한다. 계속 임대했으면 B = D다.
   * 3-state 입력의 「아니오」이면 `stdPriceAtRentalEnd`가 필수다.
   */
  rentalContinuesToTransfer?: boolean;
  /** B — 실제 임대기간 마지막 날의 기준시가 (원). 계속 임대한 경우 불요. */
  stdPriceAtRentalEnd?: number;
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
  /** §97의4: 0.02~0.10 — 보유기간 공제율에 가산 (R-3 ✅원문 확정 — `RENTAL_97_4_ADDITIONAL_RATE_TABLE`) */
  additionalRate?: number;
  /**
   * 임대기간 분 양도차익 비율 (0~1) — 조특령 §97의3⑤ 기준시가 안분.
   * 취득 즉시 임대(rentalStartDate ≤ acquisitionDate)면 1.
   */
  rentalGainRatio: number;
  eligibleRentalYears: number;
  /**
   * [echo] 결과 카드 산식 표시용 — `transfer-tax-lthd.ts`가 공제액 산출 직후 채운다.
   * 계산에는 관여하지 않는다(표시 전용). 평가 시점(`rental-97-3.ts`)에는 양도차익을 모르므로
   * 여기서는 optional이고, LTHD 단계를 거치지 않은 경로에서는 undefined다.
   */
  /** 일반 장기보유특별공제율(§95② 표) — 특례율과 대비해 보여준다 */
  baseLthdRate?: number;
  /** 임대기간 분 양도차익 = 양도차익 × rentalGainRatio */
  rentalGainApplied?: number;
  /** 비임대 분 양도차익 = 양도차익 − 임대분 */
  nonRentalGainApplied?: number;
  /** 실제 적용된 장기보유특별공제액 */
  deductionApplied?: number;
  /** 안분 전 양도차익 (음수 clamp 후) */
  gainApplied?: number;
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
      /**
       * §99의4 농어촌·고향주택 특례와 **동시 적격** — 두 조문이 각각 1채씩 제외된다 (D4-01).
       *
       * 두 조문 모두 「소유주택이 아닌 것으로 보아 소득세법 §89①3호를 적용한다」로 효과가
       * 주택수 의제에 그치고 감면세액이 없어 §127⑦(감면규정 중복배제) 대상이 아니다.
       * §127⑨도 §98의2·§98의3만 열거한다. 각 조문의 요건은 서로를 인용하지 않으므로
       * 취득 순서가 「일반주택 → 준공후미분양 → 농어촌주택」이면 양쪽 요건이 함께 성립한다.
       */
      dualExclusionApplied?: boolean;
      /** R-D: 다주택 중과 주택수에는 미반영 (소령 §167의3 별개 체계) */
      surchargeNotAffected: true;
    };
