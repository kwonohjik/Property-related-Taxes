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
  {
    id: "INH.PUBLIC_TRUST",
    citation: "상증법 §17",
    keywords: ["「공익신탁법」에 따른 공익신탁", "공익법인등에 출연하는 재산의 가액", "상속세 과세가액에 산입하지 아니한다"],
    keywordMode: "ALL",
  },
  {
    id: "INH.APPRAISAL_FEE",
    citation: "상증법 §25",
    keywords: ["상속세의 과세표준은 제13조에 따른 상속세 과세가액에서", "상속재산의 감정평가 수수료", "과세표준이 50만원 미만이면 상속세를 부과하지 아니한다"],
    keywordMode: "ALL",
  },
  {
    id: "INH.SPLIT_PAYMENT",
    citation: "상증법 §70",
    keywords: ["각 신고기한까지 각 산출세액에서", "납부할 금액이 1천만원을 초과하는 경우", "납부기한이 지난 후 2개월 이내에 분할납부"],
    keywordMode: "ALL",
  },
  {
    id: "INH.CULTURAL_HERITAGE_DEFERRAL",
    citation: "상증법 §74",
    keywords: ["상당하는 상속세액의 징수를 유예한다", "박물관자료 또는 미술관자료", "유상으로 양도하거나", "징수유예한 상속세를 징수하여야 한다"],
    keywordMode: "ALL",
  },

  // ── 증여로 보는 경우 (증여의제·증여추정) §33~§45의5 ────────────────────
  {
    id: "INH.GIFT_DEEMED_TRUST_BENEFIT",
    citation: "상증법 §33",
    keywords: ["신탁의 이익을 받을 권리의 가액", "원본(元本) 또는 수익(收益)", "수익자(受益者)로 지정"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_INSURANCE",
    citation: "상증법 §34",
    keywords: ["보험사고(만기보험금 지급의 경우를 포함한다)", "보험금 수령인과 보험료 납부자가 다른 경우", "보험금 수령인의 증여재산가액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_DEBT_FORGIVENESS",
    citation: "상증법 §36",
    keywords: ["채무를 면제받거나", "제3자로부터 채무의 인수 또는 변제", "면제등으로 인한 이익에 상당하는 금액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_FREE_REALESTATE",
    citation: "상증법 §37",
    keywords: ["타인의 부동산", "무상으로 사용함에 따라 이익을 얻은 경우", "부동산 무상 사용자의 증여재산가액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_MERGER",
    citation: "상증법 §38",
    keywords: ["법인 간의 합병(분할합병을 포함한다", "그 합병등기일을 증여일로 하여", "대주주등의 증여재산가액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_CAPITAL_INCREASE",
    citation: "상증법 §39",
    keywords: ["새로운 주식 또는 지분", "보다 낮은 가액으로 발행하는 경우", "신주인수권"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_CAPITAL_DECREASE",
    citation: "상증법 §39의2",
    keywords: ["자본금을 감소시키기 위하여 주식등을 소각", "감자(減資)를 위한 주주총회결의일", "시가보다 낮은 대가로 소각"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_CONTRIBUTION",
    citation: "상증법 §39의3",
    keywords: ["현물출자(現物出資)", "현물출자 납입일을 증여일로", "현물출자자가 얻은 이익"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_CONVERTIBLE_BOND",
    citation: "상증법 §40",
    keywords: ["전환사채, 신주인수권부사채", "전환사채등", "전환가액등"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_EXCESS_DIVIDEND",
    citation: "상증법 §41의2",
    keywords: ["초과배당금액", "균등하지 아니한 조건으로 배당등을 받은", "정산증여재산가액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_LISTING_GAIN",
    citation: "상증법 §41의3",
    keywords: ["주식등의 상장 등에 따른 이익의 증여", "상장됨에 따라 그 가액이 증가", "정산기준일"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_FREE_LOAN",
    citation: "상증법 §41의4",
    keywords: ["금전 무상대출 등에 따른 이익의 증여", "적정 이자율보다 낮은 이자율로 대출", "대출금액에 적정 이자율을 곱하여 계산한 금액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_MERGER_LISTING_GAIN",
    citation: "상증법 §41의5",
    keywords: ["합병에 따른 상장 등 이익의 증여", "주권상장법인과 합병되어 그 주식등의 가액이 증가"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_PROPERTY_SERVICE_USE",
    citation: "상증법 §42",
    keywords: ["재산사용 및 용역제공 등에 따른 이익의 증여", "시가와 대가의 차액", "무상으로 타인의 재산"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_ORG_CHANGE",
    citation: "상증법 §42의2",
    keywords: ["법인의 조직 변경 등에 따른 이익의 증여", "주식의 포괄적 교환 및 이전", "소유지분이나 그 가액의 변동 전ㆍ후 재산의 평가차액"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_VALUE_INCREASE",
    citation: "상증법 §42의3",
    keywords: ["재산 취득 후 재산가치 증가에 따른 이익의 증여", "재산가치증가사유", "통상적인 가치상승분"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_DUP_EXCLUSION",
    citation: "상증법 §43",
    keywords: ["증여세 과세특례", "이익이 가장 많게 계산되는 것 하나만을 적용", "둘 이상 동시에 적용되는 경우"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_PRESUMED_ACQUISITION_FUND",
    citation: "상증법 §45",
    keywords: ["재산 취득자금 등의 증여 추정", "자력으로 취득하였다고 인정하기 어려운 경우", "그 재산의 취득자금을 그 재산 취득자가 증여받은 것으로 추정"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_NOMINEE_TRUST",
    citation: "상증법 §45의2",
    keywords: ["명의신탁재산의 증여 의제", "실제소유자와 명의자가 다른 경우", "조세 회피의 목적", "실제소유자가 명의자에게 증여한 것으로 본다"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_SPECIFIC_CORP",
    citation: "상증법 §45의5",
    keywords: ["특정법인과의 거래를 통한 이익의 증여 의제", "주식보유비율이 100분의 30 이상인 법인", "특정법인이 부담한 법인세 상당액을 차감"],
    keywordMode: "ALL",
  },
  {
    id: "INH.GIFT_DEEMED_RELATED_CORP",
    citation: "상증법 §45의3",
    keywords: ["수혜법인", "특수관계법인거래비율", "정상거래비율", "증여의제이익"],
    keywordMode: "ALL",
  },

  // ── 증여세 납부의무·무체재산권 평가·경정청구 특례 (커버리지 보강) ────────
  {
    id: "INH.GIFT_TAX_LIABILITY",
    citation: "상증법 §4의2",
    keywords: [
      "수증자는 다음 각 호의 구분에 따른 증여재산에 대하여 증여세를 납부할 의무가 있다",
      "실제소유자가 해당 재산에 대하여 증여세를 납부할 의무가 있다",
      "수증자가 납부할 증여세를 연대하여 납부할 의무가 있다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH.VALUATION_INTANGIBLE_IP",
    citation: "상증법 §64",
    keywords: ["무체재산권", "금액 중 큰 금액으로 한다", "감가상각비를 뺀 금액", "장래의 경제적 이익"],
    keywordMode: "ALL",
  },
  {
    id: "INH.RECTIFICATION_CLAIM",
    citation: "상증법 §79",
    keywords: [
      "그 사유가 발생한 날부터 6개월 이내에",
      "그 사유가 발생한 날부터 3개월 이내에",
      "결정 또는 경정을 청구할 수 있다",
    ],
    keywordMode: "ALL",
  },

  // ── 조세특례제한법 — 영농자녀등 농지 증여세 감면 (증여세 세목) ──────────
  {
    id: "SPECIAL.FARMLAND_GIFT_REDUCTION",
    citation: "조특법 §71",
    keywords: [
      "자경농민등",
      "영농자녀등",
      "증여세의 100분의 100에 상당하는 세액을 감면한다",
      "이자상당액을 가산하여 징수한다",
    ],
    keywordMode: "ALL",
  },
];
