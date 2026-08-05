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
  // ── 🆕 2026-08-03 커버리지 갭 해소 (E2E `legal-coverage-button` 실패가 드러낸 미등록분) ──
  // 신규 조문을 legal-codes에 인용하면 여기에도 등록해야 커버리지 100%가 유지된다.
  {
    // common.ts AMENDMENT_45 — 수정신고
    id: "NTBL.AMENDMENT",
    citation: "국세기본법 §45",
    keywords: [
      "과세표준수정신고서를 제출할 수 있다",
      "신고하여야 할 과세표준 및 세액에 미치지 못할 때",
      "결손금액이나 환급세액을 초과할 때",
    ],
    keywordMode: "ALL",
  },
  {
    // common.ts CORRECTION_CLAIM_45_2 — 경정 등의 청구
    id: "NTBL.CORRECTION_CLAIM",
    citation: "국세기본법 §45의2",
    keywords: [
      "법정신고기한이 지난 후 5년 이내에 관할 세무서장에게 청구할 수 있다",
      "신고하여야 할 과세표준 및 세액을 초과할 때",
      "그 사유가 발생한 것을 안 날부터 3개월 이내",
    ],
    keywordMode: "ALL",
  },
  {
    // common.ts AMENDMENT_48_2(②1호 수정신고 감면율)·AMENDMENT_48_1_2(①2호 정당한 사유)
    id: "NTBL.PENALTY_REDUCTION",
    citation: "국세기본법 §48",
    keywords: [
      "납세자가 의무를 이행하지 아니한 데에 정당한 사유가 있는 경우",
      "1개월 이내에 수정신고한 경우: 해당 가산세액의 100분의 90에 상당하는 금액",
      "1년 6개월 초과 2년 이내에 수정신고한 경우: 해당 가산세액의 100분의 10에 상당하는 금액",
    ],
    keywordMode: "ALL",
  },
  {
    // common.ts REFUND_GAIN_52 — 국세환급가산금
    id: "NTBL.REFUND_INTEREST",
    citation: "국세기본법 §52",
    keywords: [
      "국세환급가산금 기산일부터 충당하는 날 또는 지급결정을 하는 날까지의 기간",
      "국세환급금에 가산하여야 한다",
    ],
    keywordMode: "ALL",
  },
  {
    // common.ts FINAL_RETURN_SETTLEMENT — 확정신고납부 시 예정신고 산출세액 공제
    id: "TRANSFER.FINAL_RETURN_SETTLEMENT",
    citation: "소득세법 §111",
    keywords: [
      "양도소득 산출세액에서 감면세액과 세액공제액을 공제한 금액",
      "예정신고 산출세액",
      "이를 공제하여 납부한다",
    ],
    keywordMode: "ALL",
  },

  // ── 🆕 2026-08-05 시행령 커버리지 개방분 ────────────────────────────
  {
    // common.ts DAILY_RATE — 납부지연가산세 이자율 (일 0.022% = 1일 10만분의 22)
    id: "NTBL_DECREE.LATE_PAYMENT_RATE",
    citation: "국세기본법 시행령 §27의4",
    keywords: ["납부지연가산세", "1일 10만분의 22의 율", "등기우편에 관한 요금"],
    keywordMode: "ALL",
  },
  {
    // stock.ts STX_DECREE_5_* — 증권거래세 탄력세율 (시장별)
    id: "STX_DECREE.FLEXIBLE_RATE",
    citation: "증권거래세법 시행령 §5",
    keywords: ["탄력세율", "유가증권시장", "코넥스시장", "1만분의 15"],
    keywordMode: "ALL",
  },
];
