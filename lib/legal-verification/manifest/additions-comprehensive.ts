/**
 * 검증 매니페스트 추가분 — 종합부동산세법 토지분 (KoreanLaw 실측)
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

export const COMPREHENSIVE_ADDITIONS: VerificationRule[] = [
  {
    id: "COMPREHENSIVE.ASSESSMENT_BASE_DATE",
    citation: "종합부동산세법 §3",
    keywords: ["과세기준일", "재산세의 과세기준일"],
    keywordMode: "ALL",
  },
  {
    id: "COMPREHENSIVE.LAND_TAXATION_METHOD",
    citation: "종합부동산세법 §11",
    keywords: ["종합합산과세대상", "별도합산과세대상", "구분하여 과세"],
    keywordMode: "ALL",
  },
  {
    id: "COMPREHENSIVE.LAND_TAXPAYER",
    citation: "종합부동산세법 §12",
    keywords: ["5억원을 초과하는 자", "80억원을 초과하는 자", "토지분 재산세의 납세의무자"],
    keywordMode: "ALL",
  },
  {
    id: "COMPREHENSIVE.LAND_TAX_BASE",
    citation: "종합부동산세법 §13",
    keywords: ["5억원을 공제한 금액", "80억원을 공제한 금액", "100분의 60부터 100분의 100까지", "공정시장가액비율"],
    keywordMode: "ALL",
  },
  {
    id: "COMPREHENSIVE.LAND_TAX_RATE_AND_AMOUNT",
    citation: "종합부동산세법 §14",
    keywords: ["토지분 종합합산세액", "토지분 별도합산세액", "토지분 재산세로 부과된 세액", "이를 공제한다"],
    keywordMode: "ALL",
  },
  {
    id: "COMPREHENSIVE.LAND_TAX_BURDEN_CEILING",
    citation: "종합부동산세법 §15",
    keywords: ["100분의 150을 초과하는 경우", "이를 없는 것으로 본다", "직전년도에 해당 토지에 부과된"],
    keywordMode: "ALL"  },

  // ── 🆕 2026-08-05 시행령 커버리지 개방분 ────────────────────────────
  {
    id: "COMPREHENSIVE_DECREE.EXCLUDED_RENTAL_HOUSE",
    citation: "종합부동산세법 시행령 §3",
    keywords: ["합산배제 임대주택", "공공주택사업자", "임대사업자", "사업자등록"],
    keywordMode: "ALL",
  },
  {
    id: "COMPREHENSIVE_DECREE.EXCLUDED_EMPLOYEE_HOUSE",
    citation: "종합부동산세법 시행령 §4",
    keywords: [
      "합산배제 사원용주택등",
      "종업원에게 무상이나 저가로 제공",
      "사내근로복지기금",
    ],
    keywordMode: "ALL",
  },
  /**
   * 🔴 G-21 — 합산배제 사후관리 위반 추징의 **진짜 근거**.
   *
   * 종전 `legal-codes/comprehensive.ts`는 이를 「§8③」(9/16~9/30 보유현황 신고의무)으로
   * 인용해 두어 조문 링크가 추징 요건에 닿지 않았다. 추징을 명하는 것은 §17⑤이고,
   * 붙는 금액은 「가산세」가 아니라 「이자상당가산액」이다.
   */
  {
    id: "COMPREHENSIVE.DECISION_CORRECTION_RECAPTURE",
    citation: "종합부동산세법 §17",
    keywords: [
      "경감받은 세액과 이자상당가산액을 추징",
      "과세표준 합산의 대상이 되는 주택에서 제외된 주택",
      "1세대 1주택자로 본 납세의무자",
    ],
    keywordMode: "ALL",
  },
  /**
   * 🔴 G-21 — 이자상당가산액의 기간·율. 국세기본법 §47의4(납부지연가산세)가 아니다.
   * 「1일당 10만분의 22」와 「납부기한 다음 날부터 … 고지일까지」가 이 항에 있다.
   */
  {
    id: "COMPREHENSIVE_DECREE.RECAPTURE_INTEREST",
    citation: "종합부동산세법 시행령 §10",
    keywords: [
      "추징해야 하는 이자상당가산액",
      "납부기한 다음 날부터",
      "1일당 10만분의 22",
      "임대사업자 등록이 말소된 경우",
    ],
    keywordMode: "ALL",
  },
  {
    id: "COMPREHENSIVE_DECREE.PROPERTY_TAX_DEDUCTION_CALC",
    citation: "종합부동산세법 시행령 §4의3",
    keywords: [
      "주택분 종합부동산세에서 공제되는 재산세액의 계산",
      "공정시장가액비율",
      "표준세율",
    ],
    keywordMode: "ALL",
  },
];
