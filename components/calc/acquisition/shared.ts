/**
 * AcquisitionTaxForm 공유 상수·타입·유틸
 *
 * Step별 파일(Step0.tsx~Step5.tsx)과 메인 컴포넌트(AcquisitionTaxForm.tsx) 사이의
 * 공통 의존성을 집약한다.
 *
 * Phase 5-UI: FormState 18 필드 → ~78 필드 확장
 */

import { validateAcquisitionCrossFields } from "@/lib/calc/acquisition-tax-validate";

// ============================================================
// 상수 레이블
// ============================================================

export const PROPERTY_TYPE_LABELS: [string, string][] = [
  ["housing", "주택 (아파트·단독·연립·다세대)"],
  ["land", "토지 (주택 외)"],
  ["land_farmland", "농지 (전·답·과수원)"],
  ["building", "건물 (비주거용)"],
  ["vehicle", "차량"],
  ["machinery", "기계장비"],
  ["aircraft", "항공기"],
  ["vessel", "선박"],
  ["mining_right", "광업권"],
  ["fishing_right", "어업권"],
  ["membership", "회원권 (골프·승마·콘도 등)"],
  ["standing_tree", "입목"],
];

export const ACQUISITION_CAUSE_LABELS: [string, string][] = [
  ["purchase", "매매"],
  ["exchange", "교환"],
  ["auction", "공매·경매"],
  ["in_kind_investment", "현물출자"],
  ["inheritance", "상속"],
  ["inheritance_farmland", "농지 상속 (2.3% 특례)"],
  ["gift", "증여"],
  ["burdened_gift", "부담부증여"],
  ["donation", "기부"],
  ["new_construction", "신축"],
  ["extension", "증축"],
  ["reconstruction", "개축"],
  ["reclamation", "공유수면 매립·간척"],
  // 간주취득 3종 (지방세법 §7④⑤·§10의6)
  ["deemed_major_shareholder", "간주취득 — 과점주주"],
  ["deemed_land_category",     "간주취득 — 지목변경"],
  ["deemed_renovation",        "간주취득 — 건물 개수(改修)"],
];

/**
 * 법정 지목 28종 옵션 (공간정보의 구축 및 관리 등에 관한 법률 §67)
 * 지목변경 간주취득 패널에서 사용
 */
export const LAND_CATEGORY_OPTIONS: [string, string][] = [
  ["전", "전 (田) — 밭"],
  ["답", "답 (畓) — 논"],
  ["과수원", "과수원"],
  ["목장용지", "목장용지"],
  ["임야", "임야"],
  ["광천지", "광천지"],
  ["염전", "염전"],
  ["대", "대 (垈) — 주택·건물 부지"],
  ["공장용지", "공장용지"],
  ["학교용지", "학교용지"],
  ["주차장", "주차장"],
  ["주유소용지", "주유소용지"],
  ["창고용지", "창고용지"],
  ["도로", "도로"],
  ["철도용지", "철도용지"],
  ["하천", "하천"],
  ["제방", "제방"],
  ["구거", "구거 (溝渠) — 용수로·배수로"],
  ["유지", "유지 (溜池) — 저수지·연못"],
  ["양어장", "양어장"],
  ["수도용지", "수도용지"],
  ["공원", "공원"],
  ["체육용지", "체육용지"],
  ["유원지", "유원지"],
  ["종교용지", "종교용지"],
  ["사적지", "사적지"],
  ["묘지", "묘지"],
  ["잡종지", "잡종지"],
];

/**
 * 간주취득 원인 판별 헬퍼
 */
export function isDeemedAcquisitionCause(cause: string): boolean {
  return ["deemed_major_shareholder", "deemed_land_category", "deemed_renovation"].includes(cause);
}

export const STEPS = [
  "취득 정보",
  "물건 상세",
  "주택 현황",
  "중과 분기",
  "법인·특수",
  "감면 확인",
];

// ============================================================
// 보유 주택 정보 (주택 현황 Step에서 배열로 관리)
// ============================================================

export interface OwnedHouseInfo {
  id: string;
  standardValue: string;      // 시가표준액 (원)
  propertyType: string;       // "housing" | "officetel" | "right" | "subscription_right"
  acquisitionDate: string;    // 취득일 (YYYY-MM-DD)
  isRegulated: boolean;       // 조정대상지역 여부
  /** 상속주택인지 (5년 미경과 제외 규칙 적용) */
  isInherited: boolean;
  inheritanceDate: string;    // 상속개시일 (상속 주택인 경우)
  ownershipShare: string;     // 지분율 (0~1, 기본 "1")
  coOwnersAllInHousehold: boolean; // 공동소유자 모두 동일 세대 여부
  /** 한시 특례 해당 여부 (2024.1.10~2027.12.31) */
  isHansiBenefit: boolean;
  hansiBenefitType: string;   // "new_build" | "lease_registered" | "unsold_apt" | ""
  /** 주된 상속자 판정 관련 */
  shareInInheritance: string; // 본인 지분
  maxShareInInheritors: string; // 최대 지분
  tieInMaxShare: boolean;
  isResident: boolean;
  isOldest: boolean;
  isMetropolitanRegion: boolean; // 수도권 여부 (1억/2억 한도)
  isUrbanRegenArea: boolean;  // 정비구역 여부
}

export function createOwnedHouseInfo(id: string): OwnedHouseInfo {
  return {
    id,
    standardValue: "",
    propertyType: "housing",
    acquisitionDate: "",
    isRegulated: false,
    isInherited: false,
    inheritanceDate: "",
    ownershipShare: "1",
    coOwnersAllInHousehold: true,
    isHansiBenefit: false,
    hansiBenefitType: "",
    shareInInheritance: "1",
    maxShareInInheritors: "1",
    tieInMaxShare: false,
    isResident: false,
    isOldest: false,
    isMetropolitanRegion: false,
    isUrbanRegenArea: false,
  };
}

// ============================================================
// 폼 상태 — 18 필드 → ~78 필드 (P5UI-1)
// ============================================================

export interface FormState {
  // ─── [기존] 기본 정보 ───
  propertyType: string;
  acquisitionCause: string;
  acquiredBy: string;
  reportedPrice: string;
  marketValue: string;
  standardValue: string;
  encumbrance: string;
  constructionCost: string;
  houseCountAfter: string;
  isRegulatedArea: boolean;
  isLuxuryProperty: boolean;
  isRelatedParty: boolean;
  isFirstHome: boolean;
  isMetropolitan: boolean;
  areaSqm: string;
  balancePaymentDate: string;
  registrationDate: string;
  contractDate: string;
  usageApprovalDate: string;
  // 소재지 (공시가격 조회용)
  jibun: string;
  road: string;
  building: string;

  // ─── [P4] 부가세·감면 정밀화 ───
  /** 수도권 외 도시지역 외 읍·면 지역 — 농특세 100㎡ 한도 */
  isRuralRegion: boolean;
  /** 생애최초 소형주택 (감면 한도 300만원) */
  isSmallHouseFirstHome: boolean;

  // ─── [P1] 다주택·중과 정밀화 ───
  /** 정비구역 소재 여부 (재개발·재건축·소규모정비) */
  isUrbanRegenerationArea: boolean;
  /** 일시적 2주택 여부 */
  isTemporaryTwoHouse: boolean;
  /** 종전 주택 취득일 */
  previousHouseAcquisitionDate: string;
  /** 종전 주택 소재 지역 */
  previousHouseRegion: string; // "regulated" | "non_regulated" | ""
  /** 신규 주택 소재 지역 */
  newHouseRegion: string; // "regulated" | "non_regulated" | ""
  /** 전체 주택 시가표준액 (지분/부속토지 1억/2억 이하 판정용) */
  wholeHouseStandardValue: string;
  /** 수도권 여부 (1억/2억 한도 결정) */
  isMetropolitanRegion: boolean;

  // ─── [P1] 부담부증여·무상취득 관계 ───
  /** 증여자 관계 (부담부증여 시) */
  giftRelation: string; // "spouse_or_lineal" | "other" | ""
  /** 무상취득 단서 — 수증자 관점 증여자 신분 */
  giftorRelation: string; // "spouse" | "lineal_ascendant" | "lineal_ascendant_spouse" | "lineal_descendant" | "lineal_descendant_step" | "other" | ""
  /** 증여자가 1세대 1주택자인지 */
  giftorIs1HHHolder: boolean;

  // ─── [P1 v3] §13의2④ 조정지역 지정 전 계약 보호 ───
  /** 계약일이 조정지역 지정고시일 이전인지 */
  contractDateBeforeRegulation: boolean;
  /** 조정대상지역 지정고시일 */
  regulationDesignationDate: string;
  /** 계약금 지급 증빙 보유 여부 */
  hasContractDepositProof: boolean;

  // ─── [P1 v3] 사치성 + 대도시 법인 중복 (§13⑦) ───
  /** 대도시 법인 중과 (§13②) 적용 여부 */
  isCorpMetroSurcharge: boolean;
  /** 사치성 재산 유형 */
  luxuryType: string; // "villa" | "golf_course" | "luxury_housing" | "luxury_entertainment" | "luxury_vessel" | ""

  // ─── [P2] 법인·공장 중과 ───
  /** 과밀억제권역 소재 여부 */
  isMetropolitanCongestion: boolean;
  /** 본점·주사무소 신증축 용도 */
  isHeadquarterNewBuild: boolean;
  /** 비도시형 공장 신증설 */
  isNonUrbanFactory: boolean;
  /** 비도시형 공장 구성요소 */
  factoryComponent: string; // "land" | "building" | "combined" | ""
  /** 법인 설립·전입 후 5년 이내 */
  isWithin5YearsOfEstablishment: boolean;
  /** 중과제외업종 */
  excludedBusinessType: string; // "infrastructure" | "bank" | ... | ""
  /** 휴면법인 인수 여부 */
  isDormantCorpAcquisition: boolean;
  /** 휴면법인 유형 */
  dormantCorpType: string; // "dissolved" | "deemed_dissolved" | "closed" | ...

  // ─── [P2] 세율특례 §15 ───
  /** 세율특례 사유 */
  specialRateType: string; // "redemption" | "inheritance_one_house" | ...
  /** 상속 1가구 1주택 */
  isOneHouseHousehold: boolean;
  /** 상속 자경농지 */
  isSelfCultivatedFarmlandInheritance: boolean;

  // ─── [P2] 자경농지 50% 감면 ───
  /** 2년 이상 영농 종사자 */
  isSelfCultivatedFarmer: boolean;
  /** 영농 종사 연수 */
  farmingYears: string;
  /** 농지 면적 (㎡) — 면적 한도 20,000㎡ 판정 */
  farmlandArea: string;
  /** 농지 소재지에서 거주지까지 거리 (km) */
  farmlandLocationDistance: string;

  // ─── [P3] 주택 수 정교화 ───
  /** 보유 주택 카드 배열 (입주권·분양권·오피스텔은 카드의 propertyType으로 입력) */
  ownedHouses: OwnedHouseInfo[];
  /** 신탁재산 위탁자 보유 주택 수 */
  trustedHouseCount: string;

  // ─── [P3 v4 D3] 취득 주택 공유지분 ───
  /** 취득 주택 지분율 (0~1) */
  acquisitionOwnershipShare: string;
  /** 공동소유자 모두 동일 1세대인지 */
  coOwnersAllInHousehold: boolean;

  // ─── [P3 v4 D5] 분양권·입주권 권리취득일 소급 ───
  /** 분양권·입주권으로 주택 취득 여부 */
  acquiredViaRight: boolean;
  /** 권리취득일 (분양계약일·조합원 입주권 취득일) */
  rightAcquisitionDate: string;

  // ─── [P3 v3] 한시 특례 (취득 주택 자체) ───
  /** 취득 주택 한시 특례 신축 여부 */
  isHansiBenefitNewBuild: boolean;
  /** 취득 주택 한시 특례 임대등록 여부 */
  isHansiBenefitLeaseRegistered: boolean;
  /** 취득 주택 한시 특례 미분양 아파트 여부 */
  isHansiBenefitUnsoldApt: boolean;
  /** 다가구주택 호별 전용면적 구분 기재 여부 */
  isMultiHouseholdWithUnitArea: boolean;

  // ─── [P3 v3] 세대 별도 인정 ───
  /** 세대 별도 인정 사유 */
  separateHouseholdReason: string; // "under30_income" | "over65_cohabitation" | "overseas_90days" | "relocate_60days" | ""

  // ─── [P5UI] 누락 필드 추가 ───
  /** 과점주주 도달일 (YYYY-MM-DD) — 휴면법인 5년 기산 기준 */
  majorShareholderDate?: string;
  /** 사실상 사용 개시일 (YYYY-MM-DD) — 사용승인 이전 실거주 시 취득시기로 봄 */
  actualUsageDate?: string;

  // ─── [간주취득] 과점주주 (지방세법 §7⑤) — 6개 필드 ───
  /** 상장법인 여부 (true이면 비과세) */
  deemedMajorIsListed?: boolean;
  /** 법인 설립 시 발행 주식 취득 여부 (지방세법 §7⑤ 괄호 — 취득으로 보지 아니함) */
  deemedMajorIsFoundingShare?: boolean;
  /** 법인 보유 과세대상 자산 시가표준액 합계 (CurrencyInput 문자열) */
  deemedMajorCorporateAssetValue?: string;
  /** 취득 전 지분율 (0~100 %, DecimalInput 문자열) */
  deemedMajorPrevShareRatio?: string;
  /** 취득 후 지분율 (0~100 %, DecimalInput 문자열) */
  deemedMajorNewShareRatio?: string;
  /** 과점주주 도달일 (YYYY-MM-DD) */
  deemedMajorShareholderDate?: string;

  // ─── [간주취득] 지목변경 (지방세법 §7④) — 5개 필드 ───
  /** 변경 전 지목 (한국어 코드: "전", "답", "대" 등) */
  deemedLandPrevCategory?: string;
  /** 변경 후 지목 */
  deemedLandNewCategory?: string;
  /** 사실상 지목변경 완료일 (YYYY-MM-DD) */
  deemedLandChangeDate?: string;
  /** 공부(公簿) 지목 변경 등록일 (YYYY-MM-DD) — 사실상 변경일과 빠른 날이 취득시기 (시행령 §20⑩) */
  deemedLandRegistrationDate?: string;
  /** 변경 전 시가표준액 (CurrencyInput 문자열) */
  deemedLandPrevStandardValue?: string;
  /** 변경 후 시가표준액 (CurrencyInput 문자열) */
  deemedLandNewStandardValue?: string;

  // ─── [간주취득] 건물 개수 (지방세법 §10의6③) — 5개 필드 ───
  /** 개수 유형 */
  deemedRenovationType?: "structural_change" | "use_change" | "major_repair";
  /** 개수 완료일(사용승인일) (YYYY-MM-DD) */
  deemedRenovationDate?: string;
  /** 사실상 사용개시일 (YYYY-MM-DD) — 사용승인일과 빠른 날이 취득시기 (지방세법 §20) */
  deemedRenovationActualUsageDate?: string;
  /** 개수 전 시가표준액 (CurrencyInput 문자열) */
  deemedRenovationPrevStandardValue?: string;
  /** 개수 후 시가표준액 (CurrencyInput 문자열) */
  deemedRenovationNewStandardValue?: string;

  // ─── [연부취득] §10의3 (유상승계 과세표준) ───
  /** 연부취득 여부 — 매매(purchase) + ON 시 회차 입력 섹션 활성화 */
  isInstallmentAcquisition?: boolean;
  /** 연부 매매계약일 (YYYY-MM-DD) — 2년 이상 검증 기준점 */
  installmentContractDate?: string;
  /** 총 매매계약금액 (CurrencyInput 문자열) — 시가표준액 비교용, 과세표준에는 회차 합산 사용 */
  installmentTotalContractPrice?: string;
  /** 연부 회차 배열 */
  installments?: Array<{
    id: string;           // UUID — React key
    label?: string;       // 사용자 라벨 ("계약금", "중도금1", "잔금" 등)
    paymentDate: string;  // 지급일 (YYYY-MM-DD)
    amount: string;       // 지급액 (CurrencyInput 문자열 — 콤마 포함)
  }>;
}

// ============================================================
// INITIAL_FORM — 모든 필드 default 등록
// ============================================================

export const INITIAL_FORM: FormState = {
  // 기존
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: "",
  marketValue: "",
  standardValue: "",
  encumbrance: "",
  constructionCost: "",
  houseCountAfter: "1",
  isRegulatedArea: false,
  isLuxuryProperty: false,
  isRelatedParty: false,
  isFirstHome: false,
  isMetropolitan: false,
  areaSqm: "",
  balancePaymentDate: "",
  registrationDate: "",
  contractDate: "",
  usageApprovalDate: "",
  jibun: "",
  road: "",
  building: "",

  // P4
  isRuralRegion: false,
  isSmallHouseFirstHome: false,

  // P1 다주택
  isUrbanRegenerationArea: false,
  isTemporaryTwoHouse: false,
  previousHouseAcquisitionDate: "",
  previousHouseRegion: "",
  newHouseRegion: "",
  wholeHouseStandardValue: "",
  isMetropolitanRegion: false,

  // P1 부담부증여·무상취득
  giftRelation: "",
  giftorRelation: "",
  giftorIs1HHHolder: false,

  // P1 §13의2④
  contractDateBeforeRegulation: false,
  regulationDesignationDate: "",
  hasContractDepositProof: false,

  // P1 §13⑦
  isCorpMetroSurcharge: false,
  luxuryType: "",

  // P2 법인·공장
  isMetropolitanCongestion: false,
  isHeadquarterNewBuild: false,
  isNonUrbanFactory: false,
  factoryComponent: "",
  isWithin5YearsOfEstablishment: false,
  excludedBusinessType: "",
  isDormantCorpAcquisition: false,
  dormantCorpType: "",

  // P2 세율특례
  specialRateType: "",
  isOneHouseHousehold: false,
  isSelfCultivatedFarmlandInheritance: false,

  // P2 자경농지
  isSelfCultivatedFarmer: false,
  farmingYears: "",
  farmlandArea: "",
  farmlandLocationDistance: "",

  // P3 주택 수
  ownedHouses: [],
  trustedHouseCount: "0",

  // P3 공유지분
  acquisitionOwnershipShare: "1",
  coOwnersAllInHousehold: true,

  // P3 권리취득일
  acquiredViaRight: false,
  rightAcquisitionDate: "",

  // P3 한시 특례
  isHansiBenefitNewBuild: false,
  isHansiBenefitLeaseRegistered: false,
  isHansiBenefitUnsoldApt: false,
  isMultiHouseholdWithUnitArea: false,

  // P3 세대 별도
  separateHouseholdReason: "",

  // P5UI 누락 필드
  majorShareholderDate: undefined,
  actualUsageDate: undefined,

  // 간주취득 — 과점주주
  deemedMajorIsListed: undefined,
  deemedMajorIsFoundingShare: undefined,
  deemedMajorCorporateAssetValue: undefined,
  deemedMajorPrevShareRatio: undefined,
  deemedMajorNewShareRatio: undefined,
  deemedMajorShareholderDate: undefined,

  // 간주취득 — 지목변경
  deemedLandPrevCategory: undefined,
  deemedLandNewCategory: undefined,
  deemedLandChangeDate: undefined,
  deemedLandRegistrationDate: undefined,
  deemedLandPrevStandardValue: undefined,
  deemedLandNewStandardValue: undefined,

  // 간주취득 — 건물 개수
  deemedRenovationType: undefined,
  deemedRenovationDate: undefined,
  deemedRenovationActualUsageDate: undefined,
  deemedRenovationPrevStandardValue: undefined,
  deemedRenovationNewStandardValue: undefined,

  // 연부취득
  isInstallmentAcquisition: false,
  installmentContractDate: "",
  installmentTotalContractPrice: "",
  installments: [],
};

// ============================================================
// 유효성 검사
// ============================================================

export function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.propertyType) return "물건 유형을 선택하세요.";
    if (!form.acquisitionCause) return "취득 원인을 선택하세요.";
    // 간주취득은 취득가액 없음 — skip
    if (!isDeemedAcquisitionCause(form.acquisitionCause)) {
      const isOnerous = ["purchase", "exchange", "auction", "in_kind_investment"].includes(form.acquisitionCause);
      // 연부취득: 취득가액 대신 계약일 검증
      if (isOnerous && form.isInstallmentAcquisition) {
        if (!form.installmentContractDate) {
          return "연부취득 매매계약일을 입력하세요.";
        }
        // reportedPrice 검증 skip — 회차 합산이 과세표준
      } else if (isOnerous && !form.reportedPrice) {
        return "취득가액을 입력하세요.";
      }
      if (form.acquisitionCause === "burdened_gift" && !form.encumbrance) {
        return "부담부증여 채무액을 입력하세요.";
      }
    }
  }

  if (step === 1) {
    // 연부취득 회차 검증
    if (form.acquisitionCause === "purchase" && form.isInstallmentAcquisition) {
      const rows = form.installments ?? [];
      if (rows.length < 2) {
        return "연부취득은 최소 2회차 이상 입력해야 합니다.";
      }
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i].paymentDate) {
          return `${i + 1}번 회차 지급일을 입력하세요.`;
        }
        // parseAmount는 CurrencyInput 유틸에서 가져오므로, 여기서는 간단 체크
        const amtStr = rows[i].amount.replace(/,/g, "");
        const amt = parseInt(amtStr, 10);
        if (isNaN(amt) || amt <= 0) {
          return `${i + 1}번 회차 지급액을 입력하세요.`;
        }
      }
    }

    // 간주취득 유형별 유효성 검증
    if (form.acquisitionCause === "deemed_major_shareholder") {
      if (!form.deemedMajorIsListed && !form.deemedMajorIsFoundingShare) {
        // 비상장법인: 자산·지분율 필수
        if (!form.deemedMajorCorporateAssetValue)
          return "법인 보유 자산 시가표준액을 입력하세요.";
        const prev = parseFloat(form.deemedMajorPrevShareRatio ?? "");
        const next = parseFloat(form.deemedMajorNewShareRatio ?? "");
        if (isNaN(next)) return "취득 후 지분율을 입력하세요.";
        if (!isNaN(prev) && next <= prev)
          return "취득 후 지분율은 취득 전보다 커야 합니다.";
        if (next <= 50)
          return "취득 후 지분율이 50% 이하이면 과점주주 요건 미충족입니다.";
      }
      // 상장법인·설립 시 취득(§7⑤)이면 검증 없이 통과 (비과세 처리)
    }

    if (form.acquisitionCause === "deemed_land_category") {
      if (!form.deemedLandPrevCategory) return "변경 전 지목을 선택하세요.";
      if (!form.deemedLandNewCategory)  return "변경 후 지목을 선택하세요.";
      if (form.deemedLandPrevCategory === form.deemedLandNewCategory)
        return "변경 전·후 지목이 동일합니다.";
      if (!form.deemedLandPrevStandardValue) return "변경 전 시가표준액을 입력하세요.";
      if (!form.deemedLandNewStandardValue)  return "변경 후 시가표준액을 입력하세요.";
    }

    if (form.acquisitionCause === "deemed_renovation") {
      if (!form.deemedRenovationType)              return "개수 유형을 선택하세요.";
      if (!form.deemedRenovationPrevStandardValue) return "개수 전 시가표준액을 입력하세요.";
      if (!form.deemedRenovationNewStandardValue)  return "개수 후 시가표준액을 입력하세요.";
    }
  }

  if (step === 2) {
    // 주택인 경우 보유 주택 현황 최소 검증
    if (form.propertyType === "housing" && parseInt(form.houseCountAfter) < 1) {
      return "취득 후 보유 주택 수를 입력하세요.";
    }
  }

  // ⑧ cross-field 검증 (lib/calc/acquisition-tax-validate.ts) — 단계 공통 위임
  return validateAcquisitionCrossFields(step, form);
}

// ============================================================
// 공통 스타일 유틸
// ============================================================

export const selectCls = "mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
export const labelCls = "text-sm font-medium leading-none";
export const checkboxWrapCls = "flex items-center gap-2";
export const infoBannerCls = "rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300";
export const warnBannerCls = "rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300";
