/**
 * 검증 매니페스트 추가분 — 상속세 및 증여세법 (KoreanLaw 실측 키워드)
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

export const INHERITANCE_ADDITIONS: VerificationRule[] = [
  {
    id: "INH.INHERITANCE_TAX_SUBJECT",
    citation: "상증법 §3",
    keywords: ["피상속인이 거주자인 경우", "모든 상속재산", "비거주자인 경우", "국내에 있는 모든 상속재산"],
    keywordMode: "ALL",
  },
  {
    id: "INH.INHERITANCE_TAX_LIABILITY",
    citation: "상증법 §3의2",
    keywords: ["상속인", "수유자", "각자가 받았거나 받을 재산", "연대하여 납부할 의무"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_TAX_SUBJECT",
    citation: "상증법 §4",
    keywords: ["무상으로 이전받은 재산 또는 이익", "증여세를 부과", "신고기한까지 증여자에게 반환"],
    keywordMode: "ALL",
  },
  {
    id: "INH.NONTAX_WARTIME",
    citation: "상증법 §11",
    keywords: ["전쟁 또는 대통령령으로 정하는 공무의 수행 중 사망", "상속세를 부과하지 아니한다"],
    keywordMode: "ALL",
  },
  {
    id: "INH.NONTAX_ESTATE",
    citation: "상증법 §12",
    keywords: ["국가, 지방자치단체", "유증", "사내근로복지기금", "상속세를 부과하지 아니한다"],
    keywordMode: "ALL",
  },
  {
    id: "INH.TAXABLE_VALUE",
    citation: "상증법 §13",
    keywords: ["상속개시일 전 10년 이내에 피상속인이 상속인에게 증여한 재산가액", "상속개시일 전 5년 이내에 피상속인이 상속인이 아닌 자에게 증여한 재산가액", "상속세 과세가액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.DEBT_DEDUCTION",
    citation: "상증법 §14",
    keywords: ["공과금", "장례비용", "채무", "상속재산의 가액에서 뺀다"],
    keywordMode: "ALL",
  },
  {
    id: "INH.PRESUMED_ESTATE",
    citation: "상증법 §15",
    keywords: ["상속개시일 전 1년 이내에 재산 종류별로 계산하여 2억원 이상", "상속개시일 전 2년 이내에 재산 종류별로 계산하여 5억원 이상", "상속받은 것으로 추정"],
    keywordMode: "ALL",
  },
  {
    id: "INH.PUBLIC_CORP_EXCLUSION",
    citation: "상증법 §16",
    keywords: ["공익법인등", "출연한 재산의 가액", "상속세 과세가액에 산입하지 아니한다", "발행주식총수"],
    keywordMode: "ALL",
  },
  {
    id: "INH.OTHER_PERSONAL_DEDUCTION",
    citation: "상증법 §20",
    keywords: ["자녀", "5천만원", "미성년자", "1천만원에 19세가 될 때까지의 연수", "65세 이상", "장애인"],
    keywordMode: "ALL",
  },
  {
    id: "INH.DISASTER_LOSS_DEDUCTION",
    citation: "상증법 §23",
    keywords: ["재난으로 인하여 상속재산이 멸실되거나 훼손된 경우", "손실가액을 상속세 과세가액에서 공제"],
    keywordMode: "ALL",
  },
  {
    id: "INH.DEDUCTION_CEILING",
    citation: "상증법 §24",
    keywords: ["공제할 금액", "상속세 과세가액에서", "선순위인 상속인이 아닌 자에게 유증", "상속세 과세가액이 5억원을 초과하는 경우에만 적용"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_TAX_CREDIT",
    citation: "상증법 §28",
    keywords: ["상속재산에 가산한 증여재산에 대한 증여세액", "상속세산출세액에서 공제", "상속세 과세가액이 5억원 이하인 경우에는 그러하지 아니하다"],
    keywordMode: "ALL",
  },
  {
    id: "INH.FOREIGN_TAX_CREDIT_INH",
    citation: "상증법 §29",
    keywords: ["외국에 있는 상속재산", "외국의 법령에 따라 상속세를 부과받은 경우", "상속세산출세액에서 공제"],
    keywordMode: "ALL",
  },
  {
    id: "INH.SHORT_TERM_REINHERITANCE_CREDIT",
    citation: "상증법 §30",
    keywords: ["상속개시 후 10년 이내에 상속인이나 수유자의 사망으로 다시 상속이 개시", "전의 상속세 상당액을 상속세산출세액에서 공제", "1년 이내", "100분의100"],
    keywordMode: "ALL",
  },
  {
    id: "INH.LOW_PRICE_TRANSFER_GIFT",
    citation: "상증법 §35",
    keywords: ["특수관계인 간에", "시가보다 낮은 가액으로 양수", "시가보다 높은 가액으로 양도", "차액이 대통령령으로 정하는 기준금액 이상"],
    keywordMode: "ALL",
  },
  {
    id: "INH.SPOUSE_TRANSFER_GIFT_PRESUMPTION",
    citation: "상증법 §44",
    keywords: ["배우자 또는 직계존비속", "증여받은 것으로 추정", "양수일부터 3년 이내에"],
    keywordMode: "ALL",
  },
  {
    id: "INH.NONTAX_GIFT",
    citation: "상증법 §46",
    keywords: ["국가나 지방자치단체로부터 증여받은 재산", "사회통념상 인정되는 이재구호금품, 치료비, 피부양자의 생활비, 교육비", "증여세를 부과하지 아니한다"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_TAXABLE_VALUE",
    citation: "상증법 §47",
    keywords: ["해당 증여일 전 10년 이내에 동일인", "받은 증여재산가액을 합친 금액이 1천만원 이상", "증여세 과세가액에 가산", "배우자 간 또는 직계존비속 간의 부담부증여"],
    keywordMode: "ALL",
  },
  {
    id: "INH.PUBLIC_CORP_GIFT_EXCLUSION",
    citation: "상증법 §48",
    keywords: ["공익법인등이 출연받은 재산의 가액", "증여세 과세가액에 산입하지 아니한다", "직접 공익목적사업", "발행주식총수등"],
    keywordMode: "ALL",
  },
  {
    id: "INH.DISABLED_TRUST_EXCLUSION",
    citation: "상증법 §52의2",
    keywords: ["장애인", "신탁업자에게 신탁", "신탁의 이익 전부를 받는 수익자", "5억원을 한도"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DISASTER_DEDUCTION",
    citation: "상증법 §54",
    keywords: ["재난으로 인하여 증여재산이 멸실되거나 훼손된 경우", "제23조를 준용"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_TAX_BASE",
    citation: "상증법 §55",
    keywords: ["증여세의 과세표준", "과세표준이 50만원 미만이면 증여세를 부과하지 아니한다", "3천만원을 공제"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_TAX_RATE",
    citation: "상증법 §56",
    keywords: ["증여세산출세액", "제26조에 규정된 세율을 적용"],
    keywordMode: "ALL",
  },
  {
    id: "INH.PRIOR_GIFT_TAX_CREDIT",
    citation: "상증법 §58",
    keywords: ["제47조제2항에 따라 증여세 과세가액에 가산한 증여재산의 가액", "납부하였거나 납부할 증여세액", "증여세산출세액에서 공제"],
    keywordMode: "ALL",
  },
  {
    id: "INH.FOREIGN_TAX_CREDIT_GIFT",
    citation: "상증법 §59",
    keywords: ["외국에 있는 증여재산", "외국의 법령에 따라 증여세를 부과받은 경우", "증여세산출세액에서 공제"],
    keywordMode: "ALL",
  },
  {
    id: "INH.VALUATION_MARKET",
    citation: "상증법 §60",
    keywords: ["평가기준일", "시가", "불특정 다수인 사이에 자유롭게 거래", "시가를 산정하기 어려운 경우"],
    keywordMode: "ALL",
  },
  {
    id: "INH.VALUATION_REALTY",
    citation: "상증법 §61",
    keywords: ["개별공시지가", "국세청장이 산정ㆍ고시하는 가액", "개별주택가격 및 공동주택가격", "사실상 임대차계약이 체결되거나 임차권이 등기된 재산"],
    keywordMode: "ALL",
  },
  {
    id: "INH.VALUATION_MOVABLES",
    citation: "상증법 §62",
    keywords: ["선박, 항공기, 차량, 기계장비", "상품, 제품", "대통령령으로 정하는 방법으로 평가"],
    keywordMode: "ALL",
  },
  {
    id: "INH.STOCK_VALUATION",
    citation: "상증법 §63",
    keywords: ["이전ㆍ이후 각 2개월 동안 공표된 매일의", "최종 시세가액", "최대주주 또는 최대출자자", "100분의 20을 가산"],
    keywordMode: "ALL",
  },
  {
    id: "INH.VALUATION_OTHER_RIGHTS",
    citation: "상증법 §65",
    keywords: ["조건부 권리", "존속기간이 확정되지 아니한 권리", "가상자산", "신탁의 이익을 받을 권리"],
    keywordMode: "ALL",
  },
  {
    id: "INH.VALUATION_COLLATERAL",
    citation: "상증법 §66",
    keywords: ["저당권", "담보하는 채권액 등을 기준", "제60조에 따라 평가한 가액 중 큰 금액", "전세권이 등기된 재산"],
    keywordMode: "ALL",
  },
  {
    id: "INH.FILING_TAX_CREDIT",
    citation: "상증법 §69",
    keywords: ["상속세 과세표준을 신고한 경우", "100분의 3에 상당하는 금액을 공제", "산출세액에서 공제되거나 감면되는 금액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.INSTALLMENT_PAYMENT",
    citation: "상증법 §71",
    keywords: ["납부세액이 2천만원을 초과하는 경우", "연부연납", "각 회분의 분할납부 세액이 1천만원을 초과하도록", "가업상속공제를 받았거나"],
    keywordMode: "ALL",
  },
  {
    id: "INH.INSTALLMENT_SURCHARGE",
    citation: "상증법 §72",
    keywords: ["연부연납의 허가를 받은 자", "분할납부 세액에 가산하여 납부", "신고기한 또는 납부고지서에 의한 납부기한의 다음 날부터", "대통령령으로 정하는 비율을 곱하여 계산한 금액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.PAYMENT_IN_KIND",
    citation: "상증법 §73",
    keywords: ["물납", "부동산과 유가증권", "해당 상속재산가액의 2분의 1을 초과", "상속세 납부세액이 2천만원을 초과"],
    keywordMode: "ALL",
  },
];
