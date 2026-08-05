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

  // ── 🆕 2026-08-05 본법 약칭 개방분 ──────────────────────────────────
  // 세법이 아니거나 약칭이 `LAW_ALIAS`에 없어 모수 밖이던 조문들.
  {
    // stock.ts STX_TAXABLE / STX_RATE — 증권거래세 과세대상·세율 본칙
    id: "STX.TAXABLE_OBJECT",
    citation: "증권거래세법 §2",
    keywords: ["주권 또는 지분", "외국증권시장", "증권거래세를 부과하지 아니한다"],
    keywordMode: "ALL",
  },
  {
    id: "STX.TAX_RATE",
    citation: "증권거래세법 §8",
    // ⚠️ 법제처 본문의 한자는 **CJK 호환 한자**일 수 있다 — 이 조문의 "영(零)"은
    //    U+F9B2이고 일반 零(U+96F6)과 눈으로 구별되지 않아 includes가 조용히 실패한다.
    //    ⇒ 괄호 한자를 낀 표현은 키워드로 쓰지 말 것.
    keywords: [
      "증권거래세의 세율은 1만분의 35",
      "1만분의 43",
      "자본시장 육성을 위하여 긴급히 필요하다고 인정될 때",
    ],
    keywordMode: "ALL",
  },
  {
    // 지방세 제2차 납세의무 — 과점주주 판정
    id: "LOCAL_BASIC.SECONDARY_LIABILITY",
    citation: "지방세기본법 §46",
    keywords: ["출자자의 제2차 납세의무", "무한책임사원", "과점주주", "100분의 50을 초과"],
    keywordMode: "ALL",
  },
  {
    // 지방소득세 등 원 미만 절사의 근거
    id: "TREASURY.ROUNDING",
    citation: "국고금 관리법 §47",
    keywords: ["국고금의 끝수 계산", "10원 미만의 끝수", "1원 미만의 끝수"],
    keywordMode: "ALL",
  },
  {
    // 조합원입주권 취득시기 — 관리처분계획인가일
    id: "URBAN_RENEWAL.MANAGEMENT_PLAN_APPROVAL",
    citation: "도시 및 주거환경정비법 §74",
    keywords: [
      "관리처분계획의 인가",
      "분양신청기간이 종료된 때",
      "사업시행계획인가 고시가 있은 날을 기준으로 한 가격",
      "정비사업비의 추산액",
    ],
    keywordMode: "ALL",
  },
  {
    // 소규모주택정비사업 — 사업시행계획인가 (조합원입주권 판정의 대응 조문)
    id: "SMALL_SCALE_RENEWAL.PLAN_APPROVAL",
    citation: "빈집 및 소규모주택 정비에 관한 특례법 §29",
    keywords: [
      "사업시행계획인가",
      "소규모주택정비사업",
      "60일 이내에 인가 여부를 결정",
      "취약주택정비사업",
    ],
    keywordMode: "ALL",
  },
  {
    // 상증법 §39 증자 이익 — 실권주 배정 방식의 근거 조문
    id: "CAPITAL_MARKET.NEW_SHARE_ALLOCATION",
    citation: "자본시장법 §165의6",
    keywords: [
      "주식의 발행 및 배정 등에 관한 특례",
      "실권주",
      "신주인수의 청약을 할 기회를 부여하는 방식",
    ],
    keywordMode: "ALL",
  },

  // ── 🆕 2026-08-05 복합 인용 파서가 드러낸 조문 ──────────────────────
  // "A법 §1 · B법 §2" 한 문자열에서 앞 조문만 파싱되던 탓에 모수 밖이던 것들.
  {
    // stock.ts SECTION_118_5_TAX_RATE "소득세법 §118의5 (§55①준용)" — 국외전출세 세율의 준용처
    id: "TRANSFER.GLOBAL_INCOME_RATE",
    citation: "소득세법 §55",
    // 세율표가 박스 표라 셀 경계에서 끊기지 않는 표현만 고른다
    keywords: ["종합소득산출세액", "과세표준의 6퍼센트", "1,400만원 이하"],
    keywordMode: "ALL",
  },
  {
    // inheritance-gift.ts — 상증법 §39①·§40①1호나목 괄호가 인용하는 "인수인" 정의
    id: "CAPITAL_MARKET.DEFINITIONS",
    citation: "자본시장법 §9",
    keywords: ["그 밖의 용어의 정의", "전문투자자", "투자권유", "사외이사"],
    keywordMode: "ALL",
  },
  {
    id: "COMPREHENSIVE.ASSESSMENT_AND_COLLECTION",
    citation: "종합부동산세법 §16",
    keywords: ["12월 1일부터 12월 15일", "납부기간", "신고납부방식", "납부고지서"],
    keywordMode: "ALL",
  },
  {
    // transfer.ts NBL REVENUE_DEEMED_RENT — 비사업용 토지 수입금액 판정의 간주임대료 산식
    id: "VAT_DECREE.DEEMED_RENT",
    citation: "부가가치세법 시행령 §65",
    keywords: ["부동산 임대용역의 공급가액 계산", "전세금이나 임대보증금", "정기예금 이자율"],
    keywordMode: "ALL",
  },
  {
    id: "VAT_RULE.DEPOSIT_INTEREST_RATE",
    citation: "부가가치세법 시행규칙 §47",
    keywords: ["정기예금 이자율", "1,000분의 31"],
    keywordMode: "ALL",
  },
  {
    // 상증령 §54③ 다른 비상장주식 평가 시 준용하는 재고자산 평가방법
    id: "CORP_DECREE.INVENTORY_VALUATION",
    citation: "법인령 §74",
    keywords: ["재고자산의 평가", "원가법", "저가법", "선입선출법", "후입선출법"],
    keywordMode: "ALL",
  },
  {
    // 농특세법 §4 7호 단서가 위임하는 비과세 감면 열거
    id: "SURTAX_DECREE.NON_TAXABLE",
    citation: "농어촌특별세법 시행령 §4",
    keywords: ["「조세특례제한법」 제66조부터 제70조까지", "「지방세특례제한법」"],
    keywordMode: "ALL",
  },
  {
    // 상증령 §29③·§30④가 인용하는 모집·매출 50인 산정
    id: "CAPITAL_MARKET_DECREE.PUBLIC_OFFERING",
    citation: "자본시장법 시행령 §11",
    keywords: ["증권의 모집", "50인을 산출하는 경우", "전문투자자", "연고자"],
    keywordMode: "ALL",
  },
];
