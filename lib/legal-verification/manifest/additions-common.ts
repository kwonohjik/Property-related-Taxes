/**
 * 검증 매니페스트 추가분 — 국세기본법(가산세·부과제척) + 농어촌특별세법 (KoreanLaw 실측)
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

export const COMMON_ADDITIONS: VerificationRule[] = [
  {
    id: "NTBL.ASSESSMENT_PERIOD",
    citation: "국세기본법 §26의2",
    keywords: ["부과제척기간", "5년", "10년", "역외거래"],
    keywordMode: "ALL",
  },
  {
    id: "NTBL.NO_FILING_PENALTY",
    citation: "국세기본법 §47의2",
    keywords: ["무신고가산세", "무신고납부세액", "100분의 40", "100분의 20"],
    keywordMode: "ALL",
  },
  {
    id: "NTBL.UNDER_FILING_PENALTY",
    citation: "국세기본법 §47의3",
    keywords: ["과소신고", "초과신고", "과소신고납부세액등", "100분의 10"],
    keywordMode: "ALL",
  },
  {
    id: "NTBL.LATE_PAYMENT_PENALTY",
    citation: "국세기본법 §47의4",
    keywords: ["납부지연가산세", "과소납부", "초과환급", "100분의 3"],
    keywordMode: "ALL",
  },
  {
    // transfer.ts RURAL_SURTAX_993 등 — 농어촌특별세 납세의무자
    id: "SURTAX.TAX_LIABILITY",
    citation: "농어촌특별세법 §3",
    keywords: ["농어촌특별세를 납부할 의무를 진다", "취득세 또는 레저세의 납세의무자", "종합부동산세의 납세의무자"],
    keywordMode: "ALL",
  },
  {
    id: "SURTAX.NON_TAXABLE",
    citation: "농어촌특별세법 §4",
    keywords: ["농어촌특별세를 부과하지 아니한다", "농어업인", "취득세", "감면"],
    keywordMode: "ALL",
  },
  {
    id: "SURTAX.BASE_AND_RATE",
    citation: "농어촌특별세법 §5",
    keywords: ["과세표준에 대한 세율", "조합법인", "100분의 14", "이자소득"],
    keywordMode: "ALL",
  },
];
