/**
 * 취득세 계산 엔진 공유 타입 정의
 *
 * 6개 모듈 간 데이터 계약:
 *   - acquisition-object.ts     (과세 대상 판정)
 *   - acquisition-deemed.ts     (간주취득 판정)
 *   - acquisition-timing.ts     (취득 시기 확정)
 *   - acquisition-standard-price.ts (시가표준액 산정)
 *   - acquisition-tax-base.ts   (과세표준 결정)
 *   - acquisition-tax-rate.ts   (세율 결정)
 *   - acquisition-tax-surcharge.ts  (중과세 판정)
 *   - acquisition-tax.ts        (메인 통합 엔진)
 */

// ============================================================
// 공통 유니온 타입
// ============================================================

/**
 * 법정 지목 28종 (공간정보의 구축 및 관리 등에 관한 법률 §67)
 *
 * 지방세법 §7④ 지목변경 간주취득 판정에 사용.
 * 28개 지목 전부를 열거하여 문자열 오타를 컴파일 타임에 차단.
 */
export type LandCategory =
  | "전"          // 전(田) — 물을 상시 이용하지 않고 재배하는 토지
  | "답"          // 답(沓) — 물을 상시 이용하여 재배하는 토지
  | "과수원"       // 사과·배·밤·호두 등 과수류 재배
  | "목장용지"     // 축산업 및 낙농업을 위한 초지
  | "임야"         // 산림 및 원야
  | "광천지"       // 지하에서 온수·약수·석유류 분출되는 토지
  | "염전"         // 바닷물로 소금 채취
  | "대"           // 대(垈) — 영구적 건축물 부지
  | "공장용지"     // 공장 부지
  | "학교용지"     // 학교 부지
  | "주차장"       // 자동차 등 주차에 필요한 시설 부지
  | "주유소용지"   // 주유소 부지
  | "창고용지"     // 물건 보관 창고 부지
  | "도로"         // 일반 공중 교통에 이용되는 토지
  | "철도용지"     // 교통 수송에 이용되는 토지
  | "제방"         // 조수·자연유수·모래·바람을 막기 위한 부지
  | "하천"         // 자연의 유수가 있거나 있을 것으로 예상되는 토지
  | "구거"         // 구거(溝渠) — 용수·배수 위한 수로 부지
  | "유지"         // 유지(溜池) — 물이 고이거나 흐르는 토지
  | "양어장"       // 내수면 어업 부지
  | "수도용지"     // 상·하수도 부지
  | "공원"         // 공원
  | "체육용지"     // 체육 시설 부지
  | "유원지"       // 관광·휴양 목적 부지
  | "종교용지"     // 사찰·교회·향교 등 부지
  | "사적지"       // 문화재로 지정된 역사 유적 부지
  | "묘지"         // 사람의 시체·유골 매장 토지
  | "잡종지";      // 기타 지목에 해당하지 않는 토지

/**
 * 과세 대상 물건 유형 (지방세법 §7 열거주의 — 8종 + 기타)
 */
export type PropertyObjectType =
  | "housing"        // 주택 (아파트·단독·연립·다세대)
  | "land"           // 토지 (주택 외)
  | "land_farmland"  // 농지 (전·답·과수원 — 상속세율 2.3% 특례)
  | "building"       // 건물 (비주거용)
  | "vehicle"        // 차량 (자동차관리법상 자동차·건설기계)
  | "machinery"      // 기계장비 (건설기계관리법 미등록)
  | "aircraft"       // 항공기
  | "vessel"         // 선박
  | "mining_right"   // 광업권
  | "fishing_right"  // 어업권
  | "membership"     // 회원권 (골프·승마·콘도·종합체육·요트)
  | "standing_tree"; // 입목 (立木)

/**
 * 취득 원인 유형 (지방세법 §6①)
 */
export type AcquisitionCause =
  // ① 유상취득
  | "purchase"             // 매매
  | "exchange"             // 교환
  | "auction"              // 공매·경매
  | "in_kind_investment"   // 현물출자
  // ② 무상취득
  | "inheritance"          // 상속 (일반)
  | "inheritance_farmland" // 농지 상속 (2.3% 특례)
  | "gift"                 // 증여
  | "burdened_gift"        // 부담부증여
  | "donation"             // 기부
  // ③ 원시취득
  | "new_construction"     // 신축
  | "extension"            // 증축
  | "reconstruction"       // 개축
  | "reclamation"          // 공유수면 매립·간척
  // ④ 간주취득
  | "deemed_major_shareholder" // 과점주주
  | "deemed_land_category"     // 지목변경
  | "deemed_renovation";       // 건물 개수(改修)
// ※ 환매(§15①1호)·법인합병(§15①3호)·공유물분할(§15①4호)은 별도 취득 원인이
//   아니라 §15 세율특례 과세 대상 — specialRateType으로 입력한다.
//   (과거 "redemption"·"corporate_merger"·"consensual_division" 비취득 3종은
//   지방세법 §6에 해당 단서가 존재하지 않는 법령 드리프트로 확인되어 제거,
//   KoreanLaw 지방세법 §6·§15 실측 2026-06-11)

/**
 * 취득자 유형
 */
export type AcquirerType = "individual" | "corporation" | "government" | "nonprofit";

/**
 * 과세표준 결정 방식 (지방세법 §10~§10의5)
 */
export type TaxBaseMethod =
  | "actual_price"       // 사실상취득가격 (실거래가)
  | "recognized_market"  // 시가인정액 (특수관계인 비정상·감정가)
  | "standard_value"     // 시가표준액 (공시가격)
  | "construction_cost"  // 공사비 (원시취득)
  | "split_onerous"      // 부담부증여 — 유상 부분
  | "split_gratuitous"   // 부담부증여 — 무상 부분
  | "installment"        // 연부취득 — 회차별
  | "deemed_difference"; // 간주취득 — 전후 차액

/**
 * 세율 결정 유형
 */
export type TaxRateType =
  | "basic"               // 기본세율 (고정)
  | "linear_interpolation" // 주택 6억~9억 선형보간
  | "surcharge_regulated"  // 조정대상지역 중과
  | "surcharge_corporate"  // 법인 중과
  | "surcharge_luxury";    // 사치성재산 중과

/**
 * 비과세 사유 유형 (지방세법 §9)
 */
export type AcquisitionExemptionType =
  | "government_acquisition"  // 국가·지방자치단체 취득
  | "trust_return"            // 신탁법상 위탁자 반환
  | "cemetery"                // 묘지 취득
  | "religious_nonprofit"     // 종교·비영리법인 용도 취득
  | "temporary_building"      // 임시건축물 (1년 내 철거)
  | "self_cultivated_farmland"; // 자경농지

// ============================================================
// 입력 타입
// ============================================================

/**
 * 간주취득 전용 입력
 */
export interface DeemedAcquisitionInput {
  // 과점주주 (지방세법 §7⑤)
  majorShareholder?: {
    corporateAssetValue: number;    // 법인 보유 과세대상 자산 시가표준액 합계
    prevShareRatio: number;         // 취득 전 지분율 (0~1)
    newShareRatio: number;          // 취득 후 지분율 (0~1)
    isListed: boolean;              // 유가증권·코스닥 상장법인 여부 (과점주주 정의 제외 → 비과세, 지방세기본법 §46·시행령 §24①. 코넥스 제외 대상 아님 → false)
    /**
     * 합병·분할로 인한 주식 취득 여부 — 과세 제외 처리 (형식적 취득)
     * ※ 일반 비과세 명문 규정은 없음 — 지특법 §57의2⑤은 부실금융기관 인수·
     *   출자전환·지주회사·주식의 포괄적 교환(조특법 §38) 등 한정 사례 면제.
     *   포괄 면제 근거 불명확으로 UI 입력 경로 미노출 (API 직접 입력만 가능).
     */
    isMergerOrSplitShare?: boolean;
    /**
     * 법인 설립 시 주식 취득 여부 (지방세법 §7⑤ 괄호 — 취득으로 보지 아니함)
     * 법인설립 시에 발행하는 주식·지분을 취득함으로써 과점주주가 된 경우 비과세
     */
    isFoundingShare?: boolean;
  };
  // 지목변경 (지방세법 §7④)
  landCategory?: {
    prevCategory: LandCategory;     // 변경 전 지목 (법정 28종)
    newCategory: LandCategory;      // 변경 후 지목 (법정 28종)
    prevStandardValue: number;      // 변경 전 시가표준액
    newStandardValue: number;       // 변경 후 시가표준액
    /**
     * 사실상 지목변경 완료일 (YYYY-MM-DD)
     * 취득 시기 = actualChangeDate vs registrationDate 중 빠른 날 (지방세법 §20)
     * 미입력 시 공부 변경 등록일 기준
     */
    actualChangeDate?: string;
    /**
     * 공부(公簿) 지목 변경 등록일 (YYYY-MM-DD)
     * 사실상 변경 완료일과 공부 등록일 중 빠른 날이 취득 시기
     */
    registrationDate?: string;
  };
  // 건물 개수(改修) (지방세법 §10의6③ 과세표준)
  renovation?: {
    renovationType: "structural_change" | "use_change" | "major_repair";
    prevStandardValue: number;      // 개수 전 시가표준액
    newStandardValue: number;       // 개수 후 시가표준액
    /**
     * 사용승인일 (YYYY-MM-DD) — 사용승인서 발급일 또는 임시사용승인일
     * 취득 시기 = usageApprovalDate vs actualUsageDate 중 빠른 날 (지방세법 §20)
     */
    usageApprovalDate?: string;
    /**
     * 사실상 사용개시일 (YYYY-MM-DD)
     * 사용승인 전에 실제 사용을 개시한 경우 이 날이 취득 시기
     */
    actualUsageDate?: string;
  };
}

/**
 * 시가표준액 산정 입력
 */
export interface StandardPriceInput {
  propertyType: PropertyObjectType;
  // 주택: 주택공시가격
  housingPublicPrice?: number;
  // 토지: 개별공시지가(원/㎡) × 면적
  individualLandPrice?: number;   // 원/㎡
  landArea?: number;              // ㎡
  // 건물(비주거): 신축가격기준액 × 지수 × 잔가율 × 연면적
  newBuildingBasePrice?: number;  // 원/㎡ (행안부 고시)
  structureIndex?: number;        // 구조지수 (RC=1.0, 철골=0.9 등)
  usageIndex?: number;            // 용도지수
  locationIndex?: number;         // 위치지수
  elapsedYears?: number;          // 경과연수 (잔가율 산출)
  floorArea?: number;             // 연면적 ㎡
}

/**
 * 연부취득 회차 정보
 */
export interface InstallmentPayment {
  paymentDate: string;            // 지급일 (YYYY-MM-DD)
  amount: number;                 // 지급액 (원)
  label?: string;                 // 회차 라벨 (예: "계약금", "1차 중도금")
}

/**
 * 취득세 계산기 메인 입력 타입
 */
export interface AcquisitionTaxInput {
  // ─── 물건 정보 ───
  propertyType: PropertyObjectType;
  acquisitionCause: AcquisitionCause;

  // ─── 취득가액 ───
  /** 신고 취득가액 (유상: 실거래가, 무상: 0 또는 참고값) */
  reportedPrice: number;
  /** 시가인정액 (감정가·매매사례가액 — 무상취득·특수관계인 적용) */
  marketValue?: number;
  /** 시가표준액 입력 (주택공시가격 등 — 없으면 standardPriceInput으로 계산) */
  standardValue?: number;
  /** 시가표준액 산정 입력 (직접 입력하지 않는 경우) */
  standardPriceInput?: StandardPriceInput;

  // ─── 부담부증여 ───
  /** 승계 채무액 (부담부증여 시 입력) */
  encumbrance?: number;

  // ─── 원시취득 ───
  /** 공사비·설계비 합계 (신축·개축·증축 시) */
  constructionCost?: number;

  // ─── 연부취득 ───
  installments?: InstallmentPayment[];

  // ─── 취득자 정보 ───
  acquiredBy: AcquirerType;
  /** 특수관계인 여부 (지방세기본법 §2④ 기준) */
  isRelatedParty?: boolean;

  // ─── 주택 관련 ───
  /** 전용면적 ㎡ (농특세 85㎡ 이하 면제 판단) */
  areaSqm?: number;
  /** 취득 후 주택 수 (취득 대상 포함) */
  houseCountAfter?: number;
  /** 조정대상지역 여부 (취득일 기준) */
  isRegulatedArea?: boolean;
  /** 사치성 재산 여부 (골프장·고급주택·고급오락장·고급선박; 별장 §13⑤1호는 2023.3.14 삭제) — 지방세법 §13⑤ */
  isLuxuryProperty?: boolean;

  // ─── 감면 ───
  /** 생애최초 주택 구매 여부 */
  isFirstHome?: boolean;
  /** 수도권 여부 (생애최초 감면 한도 구분) */
  isMetropolitan?: boolean;

  // ─── [P4] 부가세 정밀화 ───
  /**
   * [P4-4] 수도권 외 도시지역 외 읍·면 지역 여부 (농어촌특별세법 §4②6호)
   * true 시 전용면적 100㎡ 이하 주택 농특세 비과세 (기본 85㎡에서 확대)
   */
  isRuralRegion?: boolean;
  /**
   * [P4-3] 생애최초 소형주택 여부 (지방세특례제한법 §36의3①1호)
   * true 시 생애최초 감면 한도 300만원 (기본 200만원에서 확대)
   * 전용면적 60㎡ 이하 등 소형주택 요건 충족 여부
   */
  isSmallHouseFirstHome?: boolean;

  // ─── [P1] 다주택·중과 정밀화 ───
  /** [P1-4] 정비구역(재개발·재건축·소규모정비) 소재 여부 — 1억/2억 이하 중과 배제 시 제외 */
  isUrbanRegenerationArea?: boolean;
  /** [P1-5] 일시적 2주택 여부 (종전 주택 처분 예정) */
  isTemporaryTwoHouse?: boolean;
  /** [P1-5] 종전 주택 잔금/등기일 (일시적 2주택 처분기한 계산) */
  previousHouseAcquisitionDate?: string;
  /** [P1-5] 종전 주택 소재 지역 (조정/비조정) */
  previousHouseRegion?: "regulated" | "non_regulated";
  /** [P1-5] 신규 주택 소재 지역 (조정/비조정) */
  newHouseRegion?: "regulated" | "non_regulated";
  /** [P1-4] 전체 주택 시가표준액 (지분/부속토지 취득 시 1억/2억 이하 판정 기준) */
  wholeHouseStandardValue?: number;
  /** [P1-4 v3] 수도권 여부 (시행령 §28의2 1호 — 1억/2억 한도 결정) */
  isMetropolitanRegion?: boolean;

  // ─── [P1 v3·v4] 부담부증여·무상취득 관계 ───
  /** [P1-6] 증여자 관계 — burdened_gift 시 spouse_or_lineal이면 전체 무상 처리 (지법 §7④) */
  giftRelation?: "spouse_or_lineal" | "other";
  /** [P1-3 v4 M4] 무상취득 단서 — 수증자 관점의 증여자 신분 (시행령 §28의6② 1호, 사실혼 모두 제외) */
  giftorRelation?:
    | "spouse"                  // 가목: 증여자가 수증자의 배우자
    | "lineal_ascendant"        // 나목 1: 직계존속 (부모·조부모)
    | "lineal_ascendant_spouse" // 나목 2: 직계존속의 배우자 (계부·계모)
    | "lineal_descendant"       // 다목 1: 직계비속 (자녀·손자녀)
    | "lineal_descendant_step"  // 다목 2: 의붓자녀 (혼인 중 배우자의 직계비속)
    | "other";
  /** [P1-3 v3] 증여자가 무상취득 직전 1세대 1주택자인지 (무상취득 단서 적용 필수) */
  giftorIs1HHHolder?: boolean;

  // ─── [P1 v3] 조정대상지역 지정 전 계약 보호 (§13의2④) ───
  /** 매매·분양계약일이 조정대상지역 지정고시일 이전인지 */
  contractDateBeforeRegulation?: boolean;
  /** 조정대상지역 지정고시일 */
  regulationDesignationDate?: string;
  /** 계약금 지급 증빙 보유 여부 */
  hasContractDepositProof?: boolean;

  // ─── [P1 v3] 사치성 + 대도시 법인 중복 (§13⑦) ───
  /** 대도시 법인 중과(§13②) 적용 여부 */
  isCorpMetroSurcharge?: boolean;
  /** 사치성 재산 유형 (별장 폐지 판단 포함) */
  luxuryType?: "villa" | "golf_course" | "luxury_housing" | "luxury_entertainment" | "luxury_vessel";

  // ─── [P2] 법인·공장 중과 §13①② ───
  /** [P2-2] 과밀억제권역 소재 여부 (수도권정비계획법 §6①1호) */
  isMetropolitanCongestion?: boolean;
  /** [P2-2] 본점·주사무소 신증축 용도 여부 (§13①1호) */
  isHeadquarterNewBuild?: boolean;
  /** [P2-2] 비도시형 공장 신증설 여부 (§13①2호 — 산업단지 외) */
  isNonUrbanFactory?: boolean;
  /** [P2-2] 비도시형 공장 구성요소 — 토지·건물 분리 (G22) */
  factoryComponent?: "land" | "building" | "combined";
  /** [P2-2] 법인 설립·대도시 전입 후 5년 이내 여부 (§13② 기산) */
  isWithin5YearsOfEstablishment?: boolean;
  /** [P2-2] §13②단서 중과제외업종 (9종 — 사회기반시설·은행업·해외건설 등) */
  excludedBusinessType?:
    | "infrastructure" | "bank" | "overseas_construction" | "housing_construction"
    | "telecom" | "high_tech" | "distribution" | "transport" | "gov_funded";
  /** [P2-3] 휴면법인 인수 여부 (과점주주 도달 시점 = 설립 시점으로 기산) */
  isDormantCorpAcquisition?: boolean;
  /** [P2-3] 휴면법인 유형 */
  dormantCorpType?:
    | "dissolved" | "deemed_dissolved" | "closed"
    | "re_registered_1yr" | "no_continue_reg_1yr" | "officer_50pct_change";
  /** [P2-3] 과점주주 도달일 (YYYY-MM-DD) — 휴면법인 5년 기산 시점 */
  majorShareholderDate?: string;

  // ─── [P2] 세율특례 §15① ───
  /** [P2-1] 세율특례 사유 (7종) — §15① 적용 시 basicRate - 2% */
  specialRateType?:
    | "redemption" | "inheritance_one_house" | "corp_merger"
    | "co_ownership_split" | "building_relocation" | "divorce_division"
    | "timber";
  /** [P2-1] 상속 1가구 1주택 여부 (§15①2호 가목 특례 적용) */
  isOneHouseHousehold?: boolean;
  /** [P2-1] 상속 자경농지 여부 (§15①2호 나목 — 지특법 §6① 감면대상 농지 상속) */
  isSelfCultivatedFarmlandInheritance?: boolean;

  // ─── [P2] 자경농지 50% 감면 지특법 §6 ───
  /** [P2-5] 2년 이상 영농 종사자 여부 */
  isSelfCultivatedFarmer?: boolean;
  /** [P2-5] 영농 종사 연수 */
  farmingYears?: number;
  /** [P2-5] 취득 농지 면적 (㎡) */
  farmlandArea?: number;
  /** [P2-5] 농지 소재지에서 거주지까지 거리 (km) */
  farmlandLocationDistance?: number;

  // ─── [P3] 주택 수 자동 산정 입력 (6차원 매트릭스) ───
  /**
   * [P3] 주택 수 자동 산정 입력
   * 제공 시 houseCountAfter를 자동 산정으로 대체.
   * 미제공 시 기존 houseCountAfter 직접 입력 값 사용.
   * import: lib/tax-engine/house-count/index.ts
   */
  houseCountInput?: import("./house-count-input.types").HouseCountInputRef;

  // ─── [P3 v4 D3] 취득 주택 공유지분 ───
  /**
   * [P3-7] 취득 주택의 지분율 (0~1, 단독이면 1.0)
   * 시행령 §28의4④: 공동소유 주택 카운트 판정에 사용
   */
  acquisitionOwnershipShare?: number;
  /**
   * [P3-7] 취득 주택의 공동소유자 모두 동일 1세대 여부
   * 1세대 내 공유 → 1주택 카운트, 별도세대 공유 → 각자 1주택
   */
  coOwnersAllInHousehold?: boolean;

  // ─── [P3 v4 D5] 분양권·입주권 권리취득일 소급 ───
  /**
   * [P3-9] 분양권·입주권으로 주택을 취득하는지 여부
   * §28의4①: 해당 시 rightAcquisitionDate를 주택 수 산정 기준일로 소급 사용
   */
  acquiredViaRight?: boolean;
  /**
   * [P3-9] 권리취득일 (YYYY-MM-DD)
   * 분양사업자 분양권: 분양계약일 / 입주권: 조합원 입주권 취득일
   */
  rightAcquisitionDate?: string;

  // ─── [P3 v3] 한시 특례 (취득 주택 자체 — §28의4②) ───
  /**
   * [P3-1.5] 취득 주택이 한시 특례 신축 여부 (§28의4② 1호)
   * 2024.1.10~2027.12.31 신축 60㎡·3억(수도권 6억) 이하
   */
  isHansiBenefitNewBuild?: boolean;
  /**
   * [P3-1.5] 취득 주택이 한시 특례 임대등록 여부 (§28의4② 2호)
   * 2024.1.10~2027.12.31 유상승계 + 임대사업자 등록
   */
  isHansiBenefitLeaseRegistered?: boolean;
  /**
   * [P3-1.5] 취득 주택이 한시 특례 미분양 아파트 여부 (§28의4② 3호)
   * 2024.1.10~2025.12.31 수도권 외 85㎡·6억 이하
   */
  isHansiBenefitUnsoldApt?: boolean;
  /**
   * [P3-1.5] 다가구주택 호별 전용면적 구분 기재 여부
   * 건축물대장 호수별 전용면적 기재된 경우만 60㎡ 한도 적용
   */
  isMultiHouseholdWithUnitArea?: boolean;

  // ─── [P3 v3] 세대 별도 인정 (단순 입력 — 상세는 houseCountInput.household 사용) ───
  /**
   * [P3-6] 세대 별도 인정 사유 (단순 입력용 — 자동 산정 없이 직접 지정)
   * 상세 자동 판정: houseCountInput.household를 통해 계산
   */
  separateHouseholdReason?: "under30_income" | "over65_cohabitation" | "overseas_90days" | "relocate_60days" | null;

  // ─── [P3] 신탁재산 위탁자 주택 수 가산 ───
  /**
   * [P3-5] 신탁재산 위탁자로서 보유 주택 수 (§13의3 1호)
   * 위탁자 명의의 신탁 주택 = 본인 보유로 간주
   */
  trustedHouseCount?: number;

  // ─── 간주취득 ───
  deemedInput?: DeemedAcquisitionInput;

  // ─── 취득 시기 ───
  /** 잔금 지급일 (YYYY-MM-DD) */
  balancePaymentDate?: string;
  /** 등기접수일 (YYYY-MM-DD) */
  registrationDate?: string;
  /** 계약일 (YYYY-MM-DD) — 증여·교환 */
  contractDate?: string;
  /** 사용승인서 발급일 (YYYY-MM-DD) — 신축 */
  usageApprovalDate?: string;
  /** 사실상 사용 개시일 (YYYY-MM-DD) — 사용승인 이전 사용 시 */
  actualUsageDate?: string;

  // ─── 계산 기준일 ───
  /** 세율 적용 기준일 (YYYY-MM-DD, 기본값: 취득일) */
  targetDate?: string;
}

// ============================================================
// 결과 타입
// ============================================================

/**
 * 과세표준 결정 결과
 */
export interface TaxBaseResult {
  method: TaxBaseMethod;
  taxBase: number;               // 최종 과세표준 (천원 미만 절사)
  rawTaxBase: number;            // 절사 전 과세표준
  breakdown?: {
    onerousTaxBase?: number;     // 부담부증여 유상 과세표준
    gratuitousTaxBase?: number;  // 부담부증여 무상 과세표준
  };
  warnings: string[];
  legalBasis: string;
}

/**
 * 세율 결정 결과
 */
export interface TaxRateDecision {
  appliedRate: number;           // 적용 세율 (소수, 예: 0.01667)
  rateType: TaxRateType;
  isSurcharged: boolean;
  surchargeReason?: string;
  legalBasis: string;
  warnings: string[];
}

/**
 * 중과세 판정 결과
 */
export interface SurchargeDecision {
  isSurcharged: boolean;
  surchargeRate?: number;        // 중과세율 (예: 0.08, 0.12)
  surchargeReason?: string;
  // 적용된 분기 식별자 (P1 추가)
  appliedBranch?: "luxury_solo" | "luxury_multi" | "luxury_corp" | "villa_abolished"
    | "corp_housing" | "multi_house_8" | "multi_house_12" | "gift_12" | "basic";
  // 생애최초 감면
  firstHomeReduction?: {
    isEligible: boolean;
    reductionAmount: number;     // 감면액 (200만원 한도)
    maxReductionAmount: number;  // 한도 (200만원)
    warnings: string[];          // 추징 주의사항
  };
  // 일시적 2주택 정보 (P1-5 추가)
  temporaryTwoHouseDeadlineDate?: string;   // 처분기한 날짜 (YYYY-MM-DD)
  temporaryTwoHouseDeadlineYears?: number;  // 처분기한 연수
  // §13의2④ 지정 전 계약 보호 (P1-6.5 추가)
  preRegulationContractApplied?: boolean;
  // 무상취득 단서 배제 사유 (P1-3 추가)
  giftExclusionReason?: string;
  exceptions: string[];          // 중과 배제 사유
  warnings: string[];
  legalBasis: string[];
}

/**
 * 부담부증여 세액 분리 내역
 */
export interface BurdenedGiftBreakdown {
  onerousTaxBase: number;        // 유상 과세표준 (채무액)
  onerousTax: number;            // 유상 취득세 (매매세율 적용)
  gratuitousTaxBase: number;     // 무상 과세표준 (초과분)
  gratuitousTax: number;         // 무상 취득세 (증여세율 적용)
}

/**
 * 계산 단계별 내역 (결과 UI 상세 표시용)
 */
export interface AcquisitionCalculationStep {
  /** 단계명 (예: '과세표준', '적용세율') */
  label: string;
  /** 산식 설명 (예: '신고가액 × 세율') */
  formula: string;
  /** 결과 금액 (원) */
  amount: number;
  /** 법적 근거 조문 */
  legalBasis?: string;
}

/**
 * 취득세 계산 최종 결과
 */
export interface AcquisitionTaxResult {
  // ─── 입력 요약 ───
  propertyType: PropertyObjectType;
  acquisitionCause: AcquisitionCause;
  acquisitionValue: number;      // 실제 적용 취득가액

  // ─── 과세표준 ───
  taxBase: number;               // 최종 과세표준 (천원 미만 절사)
  taxBaseMethod: TaxBaseMethod;

  // ─── 세율 ───
  appliedRate: number;           // 적용 세율 (소수점 5자리)
  rateType: TaxRateType;
  isSurcharged: boolean;
  surchargeReason?: string;

  // ─── 세액 ───
  acquisitionTax: number;        // 취득세 본세
  ruralSpecialTax: number;       // 농어촌특별세
  localEducationTax: number;     // 지방교육세
  totalTax: number;              // 총 납부세액 (감면 전)

  // ─── 감면 ───
  reductionType?: "first_home" | "self_cultivation";
  reductionAmount: number;       // 감면액 (0이면 미적용)
  totalTaxAfterReduction: number; // 감면 후 최종 납부세액

  // ─── [P3] 주택 수 자동 산정 결과 상세 ───
  /**
   * [P3] 주택 수 자동 산정 결과 (houseCountInput 제공 시만 포함)
   * 제외 11종 + 한시 특례 + 공유지분 + 공동상속 + 권리취득일 + 세대 별도 통합
   */
  houseCountDetail?: {
    totalCount: number;
    effectiveCount: number;
    pendingAcquisitionIncluded: boolean;
    excludedDetails: import("../house-count/types").ExcludedItem[];
    referenceDate: string;
    separateHousehold?: import("../house-count/types").SeparateHouseholdInfo;
    temporaryTwoHouseWarning?: string;
    trustedHouseCount?: number;
    warnings: string[];
    legalBasis: string[];
  };

  // ─── [P2] 세율특례·법인 중과·자경농지 감면 상세 ───
  /** [P2-1] 세율특례 §15 적용 내역 */
  specialRateDetail?: {
    type: string;                  // SpecialRateType
    basicRate: number;             // 특례 전 기본세율
    appliedRate: number;           // 특례 적용 후 세율
    legalBasis: string;
    message: string;
  };
  /** [P2-2] 법인·공장 중과 §13① 적용 내역 */
  corpSurchargeDetail?: {
    surchargeType: string;         // CorpSurchargeResult.surchargeType
    basicRate: number;
    surchargeRate: number;
    reason: string;
    legalBasis: string[];
  };
  /** [P2-5] 자경농지 감면 §6 적용 내역 */
  selfCultivationReductionDetail?: {
    isEligible: boolean;
    reductionAmount: number;
    ineligibleReasons?: string[];
    warnings: string[];
  };

  // ─── [P1] 중과 판정 상세 (결과 화면 표시용) ───
  /**
   * [P1] 중과세 판정 상세 — UI 결과 화면에서 판정 근거 표시에 사용.
   * 중과 미적용(isSurcharged=false) 시에도 배제 사유 표시를 위해 포함될 수 있음.
   */
  surchargeDetail?: {
    /** 일시적 2주택 처분기한 날짜 (YYYY-MM-DD) — P1-5 */
    temporaryTwoHouseDeadlineDate?: string;
    /** 일시적 2주택 처분기한 연수 (1·2·3) — P1-5 */
    temporaryTwoHouseDeadlineYears?: 1 | 2 | 3;
    /** §13의2④ 조정대상지역 지정 전 계약 보호 적용 여부 — P1-6.5 */
    preRegulationContractApplied?: boolean;
    /** 무상취득(증여) 단서 배제 사유 (시행령 §28의6② 기준) — P1-3 */
    giftExclusionReason?: "one_house_household" | "divorce_division";
    /** 중과 배제 사유 목록 (한국어, UI 표시용) */
    surchargeExceptions?: string[];
    /** 실효 주택 수 — houseCountInput 자동 산정 또는 houseCountAfter 직접 입력값 */
    effectiveHouseCount?: number;
  };

  // ─── [P4] 부가세 계산 상세 ───
  /**
   * [P4] 부가세 매트릭스 상세
   * 지방교육세 산출 방식 + 농특세 면제 사유 추적용
   */
  additionalTaxDetail?: {
    /** 농어촌특별세 */
    ruralSpecialTax: number;
    /** 지방교육세 */
    localEducationTax: number;
    /**
     * 지방교육세 산출 방식
     * - "housing_purchase": 주택 유상거래 — 취득세 본세 × 50% × 20% (§151①1나)
     * - "standard_rate_base": 그 외 — 과세표준 × 2% × 20%
     */
    eduTaxMethod: "housing_purchase" | "standard_rate_base";
    /**
     * 주택 유상거래 지방교육세 분기 적용 여부 (P4-1)
     * true = §151①1나 (본세 × 50% × 20%), false = 과세표준 × 0.4%
     */
    isHousingPurchaseEduRule?: boolean;
    /** 농특세 읍·면 지역 100㎡ 면제 적용 여부 (P4-4) */
    isRuralExemption?: boolean;
  };

  // ─── 간주취득 판정 상세 (결과 화면 표시용) ───
  /**
   * 간주취득 판정 상세 — 과점주주·지목변경·건물개수 결과를 UI 결과 카드에 표시할 때 사용.
   * 간주취득 원인(deemed_major_shareholder·deemed_land_category·deemed_renovation)인 경우만 포함.
   */
  deemedDetail?: {
    /** 간주취득 유형 */
    type: "major_shareholder" | "land_category" | "renovation";
    /** 과세 대상 여부 (비과세 사유 포함 시 false) */
    isSubjectToTax: boolean;
    /** 간주취득 과세표준 */
    deemedTaxBase: number;
    // 과점주주 전용 필드
    /** 취득 전 지분율 (0~1) */
    prevShareRatio?: number;
    /** 취득 후 지분율 (0~1) */
    newShareRatio?: number;
    /** 과세 지분율 (0~1) — 최초 과점주주: 취득 후 전체, 추가 취득: 증가분 */
    taxableRatio?: number;
    /** 법인 보유 과세대상 자산 시가표준액 합계 (과점주주 전용 — 결과 카드 산식 표시용) */
    corporateAssetValue?: number;
    // 지목변경·건물개수 전용 필드
    /** 변경/개수 전 시가표준액 */
    prevStandardValue?: number;
    /** 변경/개수 후 시가표준액 */
    newStandardValue?: number;
    // 공통 필드
    /** 적용 법령 조문 */
    legalBasis: string;
    /** 주의사항·안내 메시지 */
    warnings: string[];
  };

  // ─── 부담부증여 분리 ───
  burdenedGiftBreakdown?: BurdenedGiftBreakdown;

  // ─── 연부취득 회차별 신고 스케줄 ───
  /**
   * 연부취득 회차별 신고 스케줄 (각 회차 지급일 + 60일)
   * 연부취득인 경우에만 포함됨 (지방세법 §10의3, 시행령 §20⑤)
   */
  installmentFilingSchedule?: Array<{
    paymentDate: string;          // 회차 지급일 (YYYY-MM-DD)
    deadline: string;             // 신고기한 (YYYY-MM-DD, 지급일 + 60일)
    label?: string;               // 회차 라벨
  }>;

  // ─── 취득 시기·신고 기한 ───
  acquisitionDate: string;       // 확정된 취득일 (YYYY-MM-DD)
  filingDeadline: string;        // 신고 기한 (YYYY-MM-DD)

  // ─── 비과세 ───
  isExempt: boolean;
  exemptionType?: AcquisitionExemptionType;

  // ─── 계산 과정 ───
  steps: AcquisitionCalculationStep[];

  // ─── 메타 ───
  appliedLawDate: string;
  warnings: string[];
  legalBasis: string[];
}

// ============================================================
// 과점주주 간주취득 결과
// ============================================================

export interface DeemedMajorShareholderResult {
  isSubjectToTax: boolean;
  deemedTaxBase: number;         // 간주취득 과세표준
  prevShareRatio: number;
  newShareRatio: number;
  taxableRatio: number;          // 과세 대상 지분율 (증가분 or 신규)
  corporateAssetValue?: number;  // 법인 보유 과세대상 자산 시가표준액 합계 (산식 표시용)
  legalBasis: string;
  warnings: string[];
}
