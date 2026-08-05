/**
 * 검증 매니페스트 추가분 — 상속세 및 증여세법 **시행령·시행규칙**
 *
 * 배경은 `additions-transfer-decree.ts` 상단과 같다 — `LAW_ALIAS` 키 집합이
 * 커버리지 화이트리스트를 겸하므로, 등재 전까지 이 조문들은 모수에서 빠져 있었다.
 *
 * ⚠️ 이쪽 갭이 가장 컸다(37개 조문). 축약 약칭 때문이다 —
 *    `상증령`·`상증칙`·`상증규`·`상증세법 시행규칙`처럼 **같은 법령을 가리키는 표기가
 *    넷**이었고, 어느 것도 화이트리스트에 없었다. 표기 통일 대신 `LAW_ALIAS`에
 *    별칭으로 모아 정규명 하나로 수렴시켰다(표시 문자열은 그대로 둔다).
 *
 * 재산평가(§49~§61·시행규칙 §15~§19의2)가 대부분이다 — 상속·증여세액을 직접
 * 좌우하는 산식·이자율이라 개정 추적의 실익이 크다(시행규칙 이자율은 2026.1.2. 개정).
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

export const INHERITANCE_DECREE_ADDITIONS: VerificationRule[] = [
  // ══ 상속세 및 증여세법 시행령 ═══════════════════════════════════════
  // ── 비과세·공제·세액공제 ───────────────────────────────────────────
  {
    id: "INH_DECREE.NON_TAXABLE_ESTATE",
    citation: "상증령 §8",
    keywords: ["비과세되는 상속재산", "제사를 주재하는 상속인", "금양임야", "묘토인 농지"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.APPRAISAL_FEE_DEDUCTION",
    citation: "상증령 §20의3",
    keywords: ["감정평가 수수료", "500만원", "상속세 납부목적용으로 한정"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.FOREIGN_TAX_CREDIT",
    citation: "상증령 §21",
    keywords: ["외국납부세액공제", "상속세산출세액", "외국납부세액공제신청서"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.GIFT_DEDUCTION_METHOD",
    citation: "상증령 §46",
    keywords: [
      "증여재산공제의 방법",
      "최초의 증여세과세가액에서부터 순차로 공제",
      "안분하여 공제",
      "약혼자의 사망",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.GIFT_APPRAISAL_FEE_DEDUCTION",
    citation: "상증령 §46의2",
    keywords: ["증여재산의 감정평가 수수료", "제20조의3에 따른 수수료"],
    keywordMode: "ALL",
  },

  // ── 증여의제 이익 계산 ─────────────────────────────────────────────
  {
    id: "INH_DECREE.MERGER_GAIN",
    citation: "상증령 §28",
    keywords: [
      "합병에 따른 이익의 계산방법",
      "합병등기일",
      "대주주등",
      "액면가액이 3억원 이상",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.CAPITAL_INCREASE_GAIN",
    citation: "상증령 §29",
    keywords: ["증자에 따른 이익의 계산방법", "권리락", "주식대금 납입일", "실권주"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.CONVERTIBLE_BOND_GAIN",
    citation: "상증령 §30",
    keywords: [
      "전환사채등",
      "이자손실분",
      "최대주주",
      "양도가액에서 취득가액을 차감한 금액을 초과하지 못한다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.EXCESS_DIVIDEND_GAIN",
    citation: "상증령 §31의2",
    keywords: ["초과배당금액", "최대주주등의 특수관계인", "과소배당금액", "소득세 상당액"],
    keywordMode: "ALL",
  },

  // ── 재산평가 ───────────────────────────────────────────────────────
  {
    id: "INH_DECREE.VALUATION_PRINCIPLE",
    citation: "상증령 §49",
    keywords: [
      "평가기준일",
      "평가기준일 전 6개월부터 평가기준일 후 3개월까지",
      "매매ㆍ감정ㆍ수용ㆍ경매",
      "평가심의위원회",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.REAL_ESTATE_VALUATION",
    citation: "상증령 §50",
    keywords: ["부동산의 평가", "개별공시지가가 없는", "비교표에 따라", "국세청장이 지정한 지역"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.LISTED_STOCK_VALUATION",
    citation: "상증령 §52의2",
    keywords: [
      "유가증권시장",
      "코스닥시장",
      "평가기준일 전후 2개월 이내",
      "관리종목으로 지정된",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.KOSDAQ_LISTING_APPLICANT",
    citation: "상증령 §53",
    keywords: [
      "코스닥시장에 상장신청을 한 법인의 주식등의 평가",
      "최대주주등",
      "중소기업",
      "중견기업",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.UNLISTED_STOCK_VALUATION",
    citation: "상증령 §54",
    keywords: [
      "비상장주식등",
      "순손익가치",
      "순자산가치",
      "각각 3과 2의 비율",
      "100분의 80을 곱한 금액",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.NET_ASSET_VALUE",
    citation: "상증령 §55",
    keywords: ["순자산가액", "장부가액", "영업권평가액"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.THREE_YEAR_NET_PROFIT",
    citation: "상증령 §56",
    keywords: [
      "1주당 최근 3년간의 순손익액의 가중평균액",
      "1주당 추정이익",
      "신용평가전문기관",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.IPO_PREPARING_STOCK",
    citation: "상증령 §57",
    keywords: ["기업공개준비중인 주식등의 평가", "공모가격", "배당차액", "큰 가액으로 평가"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.BOND_OTHER_SECURITIES",
    citation: "상증령 §58",
    keywords: ["국채ㆍ공채 및 사채", "최종 시세가액", "집합투자증권"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.INTANGIBLE_PROPERTY",
    citation: "상증령 §59",
    keywords: [
      "영업권의 평가",
      "초과이익금액",
      "영업권지속연수",
      "특허권ㆍ실용신안권ㆍ상표권ㆍ디자인권 및 저작권",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.CONDITIONAL_RIGHT",
    citation: "상증령 §60",
    keywords: [
      "조건부 권리",
      "존속기간이 확정되지 않은 권리",
      "소송 중인 권리",
      "가상자산",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.TRUST_BENEFIT_RIGHT",
    citation: "상증령 §61",
    keywords: [
      "신탁의 이익을 받을 권리",
      "원본을 받을 권리와 수익을 받을 권리",
      "기대여명",
    ],
    keywordMode: "ALL",
  },

  // ── 납부·물납·징수유예·경정청구 ────────────────────────────────────
  {
    id: "INH_DECREE.SELF_PAYMENT",
    citation: "상증령 §66",
    keywords: ["자진납부", "분납할 수 있는 세액", "2천만원", "100분의 50 이하의 금액"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.PAYMENT_IN_KIND_SCOPE",
    citation: "상증령 §73",
    keywords: [
      "물납을 신청할 수 있는 납부세액",
      "물납에 충당할 수 있는 부동산 및 유가증권",
      "비상장주식등",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.PAYMENT_IN_KIND_ASSETS",
    citation: "상증령 §74",
    keywords: [
      "물납에 충당할 수 있는 부동산 및 유가증권",
      "국내에 소재하는 부동산",
      "국채 및 공채",
      "상속개시일 현재 상속인이 거주하는 주택",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.CULTURAL_HERITAGE_DEFERRAL",
    citation: "상증령 §76",
    keywords: [
      "징수를 유예하는 상속세액",
      "상속세산출세액",
      "보호구역의 토지",
      "박물관 또는 미술관",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.CORRECTION_CLAIM_GROUNDS",
    citation: "상증령 §81",
    keywords: [
      "결정 또는 경정청구서",
      "상속회복청구소송 또는 유류분반환청구소송",
      "할증평가",
    ],
    keywordMode: "ALL",
  },

  // ══ 상속세 및 증여세법 시행규칙 ═════════════════════════════════════
  {
    id: "INH_RULE.INTEREST_LOSS_CALC",
    citation: "상증칙 §10의2",
    keywords: ["이자손실분", "만기상환금액", "사채발행이율", "현재가치로 할인"],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.INCOME_TAX_EQUIVALENT",
    citation: "상증칙 §10의3",
    // 세율표가 박스 표라 "100분의 35"처럼 셀 경계에서 끊기는 표현은 쓸 수 없다
    // (표 안에서 "100분의 || 35"로 줄바꿈된다). 한 줄에 온전히 담기는 표현만 고른다.
    keywords: ["초과배당금액 × 100분의 14", "5천760만원 이하", "8천800만원 이하"],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.VALUATION_PRINCIPLE",
    citation: "상증칙 §15",
    keywords: [
      "공신력 있는 감정기관",
      "기준환율 또는 재정환율",
      "공동주택가격",
      "공동주택가격 차이가 가장 작은 주택",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.UNLISTED_STOCK_RATE",
    citation: "상증칙 §17",
    keywords: ["영 제54조제1항의 계산식", "연간 100분의 10"],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.NET_ASSET_CALC",
    citation: "상증칙 §17의2",
    keywords: ["무형고정자산ㆍ준비금ㆍ충당금등", "지급받을 권리가 확정된 가액", "선급비용"],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.THREE_YEAR_NET_PROFIT_CALC",
    citation: "상증칙 §17의3",
    keywords: [
      "자산수증이익, 채무면제이익, 보험차익 및 재해손실",
      "50퍼센트를 초과하는 경우",
      "합병 또는 분할",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.DIVIDEND_DIFFERENCE",
    citation: "상증칙 §18",
    keywords: ["배당차액", "1주당 액면가액", "직전기 배당률", "배당기산일"],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.FACE_VALUE_BOND",
    citation: "상증칙 §18의2",
    keywords: [
      "액면가액으로 직접 매입한 국채등의 평가",
      "적정할인율",
      "원본의 회수기간이 5년을 초과",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.CONVERTIBLE_BOND_RATE",
    citation: "상증칙 §18의3",
    keywords: ["전환사채등의 평가", "연간 100분의 8"],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.INTANGIBLE_PROPERTY_CALC",
    citation: "상증칙 §19",
    keywords: [
      "100분의 10",
      "특허권ㆍ실용신안권ㆍ상표권ㆍ디자인권 및 저작권",
      "20년을 초과하는 때에는 20년",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.TRUST_ANNUITY_RATE",
    citation: "상증칙 §19의2",
    keywords: [
      "신탁의 이익 및 정기금을 받을 권리의 평가",
      "연간 1,000분의 30",
      "원본의 가액에 1,000분의 30을 곱하여",
    ],
    keywordMode: "ALL",
  },

  // ══ 🆕 복합 인용 파서가 드러낸 조문 ═════════════════════════════════
  // "상증법 §61③·상증령 §51·상증규 §16"처럼 한 문자열에 여러 조문이 들어 있어
  // 앞 조문만 파싱되던 것들. `parseCitations`로 전부 펴면서 모수에 들어왔다.
  {
    id: "INH_DECREE.GAIN_CALC_METHOD",
    citation: "상증령 §32의4",
    keywords: [
      "이익의 계산방법",
      "해당 이익별로 합산하여 각각의 금액기준을 계산",
      "저가 양수 및 고가 양도에 따른 이익",
      "금전무상대출에 따른 이익",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.SUPERFICIES_VALUATION",
    citation: "상증령 §51",
    keywords: [
      "지상권등의 평가",
      "지상권이 설정되어 있는 토지의 가액",
      "잔존연수",
      "특정시설물을 이용할 수 있는 권리",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.CONVERTIBLE_BOND_VALUATION",
    citation: "상증령 §58의2",
    keywords: ["전환사채등의 평가", "신주인수권증서", "적정할인율", "사채발행이율"],
    keywordMode: "ALL",
  },
  {
    id: "INH_DECREE.ANNUITY_VALUATION",
    citation: "상증령 §62",
    keywords: [
      "정기금을 받을 권리의 평가",
      "유기정기금",
      "무기정기금",
      "종신정기금",
      "1년분 정기금액의 20배",
    ],
    keywordMode: "ALL",
  },
  {
    id: "INH_RULE.SUPERFICIES_RATE",
    citation: "상증칙 §16",
    keywords: ["지상권의 평가등", "연간 100분의 2", "조합원권리가액"],
    keywordMode: "ALL",
  },

  // ══ 조세특례제한법 시행령 (증여세 감면) ═════════════════════════════
  {
    id: "GIFT_DECREE.FARMING_CHILD_EXEMPTION",
    citation: "조특령 §68",
    keywords: [
      "영농자녀등이 증여받는 농지 등에 대한 증여세의 감면",
      "자경농민등",
      "직선거리 30킬로미터 이내",
      "18세 이상인 직계비속",
    ],
    keywordMode: "ALL",
  },
];
