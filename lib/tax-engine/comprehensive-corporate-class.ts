/**
 * 종합부동산세 법인 주택분 §9② class 도출 (시행령 §4의4 자동판정)
 *
 * 법령: 종부세법 §9② · 시행령 §4의4① (KoreanLaw 본문 검증 2026-06-16)
 *   §9②1호 = ⓐ 공익법인등 공익목적주택만 OR ⓑ §4의4①(공공주택사업자 등) → §9①1호 세율
 *   §9②2호 = 공익법인등이나 1호 미해당 → §9① 각호 세율
 *   §9②3호 = 1·2호 외 → 단일세율(2.7%/5.0%)
 *
 * 단일 진실: 엔진·API·UI 모두 이 헬퍼로 class 도출 (dual-truth 차단).
 */

import type {
  CorporateHousingClass,
  CorporateHousingType,
  CorporateHousingReqs,
} from "./types/comprehensive-corporate.types";

/**
 * 시행령 §4의4 세부유형 + 조건 → §9② class 도출.
 * 조건부 유형의 플래그가 미응답(undefined)이면 falsy → 보수적(불리) class.
 * (미응답 차단은 검증 계층의 책임 — 여기서는 안전 기본값으로 동작)
 */
export function resolveCorporateHousingClass(
  type: CorporateHousingType,
  reqs: CorporateHousingReqs = {},
): CorporateHousingClass {
  switch (type) {
    // §4의4①1·3·4·7호 — 무조건 §9②1호
    case "public_housing_operator":
    case "housing_association":
    case "redevelopment_operator":
    case "clan":
      return "corporate_general";
    // §4의4①5·5의2호 — 적격(2호↑ + 가·나·다목 주택만) 시 §9②1호, 미충족 시 §9②3호
    case "private_rental_operator":
    case "urban_dev_operator":
      return reqs.corpHoldsQualifyingRentalHousingOnly
        ? "corporate_general"
        : "corporate_special";
    // §4의4①6호 — 설립목적·적격주택 충족 시 §9②1호, 미충족 시 §9②3호
    case "social_enterprise":
      return reqs.corpMeetsSocialEnterpriseRequirements
        ? "corporate_general"
        : "corporate_special";
    // 공익법인등(상증법§16) — 공익목적주택만 §9②1호ⓐ, 아니면 §9②2호
    case "public_interest_corp":
      return reqs.corpHoldsOnlyPublicPurposeHousing
        ? "corporate_general"
        : "corporate_public";
    // 그 외 일반법인 — §9②3호
    case "general_corp":
      return "corporate_special";
  }
}

/**
 * 해당 세부유형이 요구하는 조건 플래그 키 (검증·UI 가시성 단일원천).
 * 무조건 유형(1·3·4·7호)·일반법인은 null (조건 입력 불필요).
 * 반환 키는 FormData·엔진 input·CorporateHousingReqs 공용 (E1 단일키).
 */
export function requiredCorporateReqKey(
  type: CorporateHousingType,
): keyof CorporateHousingReqs | null {
  if (type === "private_rental_operator" || type === "urban_dev_operator")
    return "corpHoldsQualifyingRentalHousingOnly";
  if (type === "social_enterprise") return "corpMeetsSocialEnterpriseRequirements";
  if (type === "public_interest_corp") return "corpHoldsOnlyPublicPurposeHousing";
  return null;
}
