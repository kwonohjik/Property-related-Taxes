/**
 * 종합부동산세 법인 주택분 §9② 세부 유형·class 타입 (시행령 §4의4)
 *
 * comprehensive.types.ts 에서 re-export (하위 호환 import 경로 유지).
 * 800줄 정책으로 분리 — 법령: 종부세법 §9② · 시행령 §4의4① (KoreanLaw 검증 2026-06-16).
 */

/**
 * 도출된 §9② 세율 class (내부·결과 echo — 입력으로 직접 받지 않음, dual-truth 차단)
 * - corporate_general: §9②1호 — §9①1호 general 표 고정·기본공제 9억(6억)·상한 적용
 * - corporate_public:  §9②2호 (공익법인등) — §9① 각호(주택 수 분기)·기본공제 9억(6억)·상한 적용
 * - corporate_special: §9②3호 — 단일세율(가/나목)·기본공제 0(§8①2호)·세부담상한 배제(§10 단서)
 */
export type CorporateHousingClass =
  | "corporate_general"
  | "corporate_public"
  | "corporate_special";

/**
 * 법인 세부 유형 (시행령 §4의4① 각 호 + 공익법인등 + 일반법인) — §9② class 도출 입력
 */
export type CorporateHousingType =
  | "public_housing_operator" // §4의4①1호 공공주택사업자 (무조건 1호)
  | "housing_association" // §4의4①3호 주택조합 (무조건 1호)
  | "redevelopment_operator" // §4의4①4호 정비사업시행자 (무조건 1호)
  | "private_rental_operator" // §4의4①5호 민간건설임대 2호↑ (조건부)
  | "urban_dev_operator" // §4의4①5의2호 도시개발·재정비 시행자 (조건부)
  | "social_enterprise" // §4의4①6호 사회적기업·사회적협동조합 (조건부)
  | "clan" // §4의4①7호 종중 (무조건 1호)
  | "public_interest_corp" // 공익법인등(상증법§16) — §9②1호ⓐ/2호 (조건부)
  | "general_corp"; // 그 외 일반법인 (§9②3호)

/** §4의4 조건부 요건 충족 여부 (키 = FLAT 입력필드명 — 검증/UI/엔진 공용 단일키) */
export interface CorporateHousingReqs {
  corpHoldsOnlyPublicPurposeHousing?: boolean; // 공익법인: 직접 공익목적사업용 주택만 (§9②1호ⓐ vs 2호)
  corpHoldsQualifyingRentalHousingOnly?: boolean; // 민간건설임대/도시개발: 2호↑ + 가·나·다목 주택만 (§4의4①5·5의2호)
  corpMeetsSocialEnterpriseRequirements?: boolean; // 사회적기업: 설립목적 + 적격 주택만 (§4의4①6호)
}
