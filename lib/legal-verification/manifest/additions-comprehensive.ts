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
  /** §3①1호·2호 단서 — 민간건설·민간매입임대는 2018.3.31. 이전 사업자등록등 주택으로 한정(대통령령 제28645호) */
  {
    id: "COMPREHENSIVE_DECREE.EXCLUDED_RENTAL_REG_CAP_2018",
    citation: "종합부동산세법 시행령 §3",
    keywords: ["2018년 3월 31일 이전에", "사업자등록등", "민간매입임대주택의 경우에는"],
    keywordMode: "ALL",
  },
  /** §3①8호 나목1) — 1주택 이상 보유 세대의 세대원이 새로 취득한 조정대상지역 장기일반민간임대주택 제외(대통령령 제29243호·제30921호) */
  {
    id: "COMPREHENSIVE_DECREE.EXCLUDED_8NA1_REGULATED_NEW_ACQ",
    citation: "종합부동산세법 시행령 §3",
    keywords: ["세대원이 새로 취득", "조정대상지역의 공고가 있은 날 이전에"],
    keywordMode: "ALL",
  },
  /** §3①8호 나목2) — 법인이 공고 후 사업자등록등을 신청한 조정대상지역 장기일반민간임대주택 제외(대통령령 제30921호) */
  {
    id: "COMPREHENSIVE_DECREE.EXCLUDED_8NA2_CORP_REGULATED_APP",
    citation: "종합부동산세법 시행령 §3",
    keywords: ["법인 또는 법인으로 보는 단체가", "이미 공고된 조정대상지역의 경우 2020년 6월 17일을 말한다"],
    keywordMode: "ALL",
  },
  /** §3①8호 나목3) — 2020.7.11. 이후 등록 신청한 아파트 장기일반 민간매입임대주택 제외(대통령령 제31085호) */
  {
    id: "COMPREHENSIVE_DECREE.EXCLUDED_8NA3_APARTMENT_AFTER_0711",
    citation: "종합부동산세법 시행령 §3",
    keywords: ["2020년 7월 11일 이후 종전의", "아파트를 임대하는 민간매입임대주택"],
    keywordMode: "ALL",
  },
  /** §3①7호 단서·8호 나목4) — 2020.7.11. 이후 단기 → 장기일반·공공지원 변경신고 주택 제외(대통령령 제31085호) */
  {
    id: "COMPREHENSIVE_DECREE.EXCLUDED_SHORT_TO_LONG_AFTER_0711",
    citation: "종합부동산세법 시행령 §3",
    keywords: ["2020년 7월 11일 이후 같은 법 제5조제3항에 따라", "장기일반민간임대주택으로 변경신고한 주택"],
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
