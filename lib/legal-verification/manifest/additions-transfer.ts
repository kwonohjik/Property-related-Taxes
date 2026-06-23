/**
 * 검증 매니페스트 추가분 — 소득세법(양도·국외전출) + 조세특례제한법 감면 (KoreanLaw 실측)
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

export const TRANSFER_ADDITIONS: VerificationRule[] = [
  // ── 소득세법 ──────────────────────────────────────────────────────
  {
    id: "TRANSFER.DIVIDEND_INCOME",
    citation: "소득세법 §17",
    keywords: ["배당소득", "의제배당", "잉여금의 배당 또는 분배금", "수익분배의 성격"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.DEFINITIONS",
    citation: "소득세법 §88",
    keywords: ["양도", "실지거래가액", "부담부증여", "1세대"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.TAX_BASE_CALCULATION",
    citation: "소득세법 §92",
    keywords: ["양도소득과세표준", "양도차익", "장기보유 특별공제액", "양도소득 기본공제액"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.SCOPE_OF_INCOME",
    citation: "소득세법 §94",
    keywords: ["양도소득", "토지", "건물", "파생상품등"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.NECESSARY_EXPENSES",
    citation: "소득세법 §97",
    keywords: ["필요경비", "실지거래가액", "환산취득가액", "자본적지출액"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.STANDARD_MARKET_PRICE",
    citation: "소득세법 §99",
    keywords: ["기준시가", "개별공시지가", "배율방법", "기준시가를 산정"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.INCOME_AMOUNT_CLASSIFICATION",
    citation: "소득세법 §102",
    keywords: ["양도소득금액", "구분하여 계산", "양도차손", "결손금"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.PRELIMINARY_RETURN",
    citation: "소득세법 §105",
    keywords: ["예정신고", "양도일이 속하는 달의 말일부터 2개월", "양도소득과세표준"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.FINAL_RETURN",
    citation: "소득세법 §110",
    keywords: ["확정신고", "다음 연도 5월 1일부터 5월 31일까지", "양도소득금액"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.DETERMINATION_CORRECTION",
    citation: "소득세법 §114",
    keywords: ["결정", "경정", "추계조사", "환산취득가액"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.APPRAISAL_CONVERSION_SURTAX",
    citation: "소득세법 §114의2",
    keywords: ["감정가액 또는 환산취득가액", "100분의 5", "건물을 신축 또는 증축", "양도소득 결정세액에 더한다"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.OVERSEAS_ASSET_SCOPE",
    citation: "소득세법 §118의2",
    keywords: ["국외에 있는 자산", "5년 이상 국내에 주소 또는 거소", "환차익", "양도소득"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.OVERSEAS_ASSET_TRANSFER_VALUE",
    citation: "소득세법 §118의3",
    keywords: ["국외자산", "양도가액", "실지거래가액", "시가에 따르되"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.OVERSEAS_ASSET_EXPENSES",
    citation: "소득세법 §118의4",
    keywords: ["국외자산의 양도", "필요경비", "자본적지출액", "양도비"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.OVERSEAS_ASSET_TAX_RATE",
    citation: "소득세법 §118의5",
    keywords: ["국외자산의 양도소득", "제55조제1항에 따른 세율", "양도소득과세표준"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.OVERSEAS_FOREIGN_TAX_CREDIT",
    citation: "소득세법 §118의6",
    keywords: ["외국납부세액", "세액공제방법", "필요경비 산입방법", "공제한도금액"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.OVERSEAS_BASIC_DEDUCTION",
    citation: "소득세법 §118의7",
    keywords: ["국외자산의 양도", "연 250만원을 공제", "감면소득금액"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.OVERSEAS_MUTATIS_MUTANDIS",
    citation: "소득세법 §118의8",
    keywords: ["국외자산의 양도", "준용한다", "장기보유 특별공제액은 공제하지 아니한다"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_LIABILITY",
    citation: "소득세법 §118의9",
    keywords: ["출국 시 납세의무", "국외전출자", "출국일에 양도한 것으로 보아", "대주주"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_BASE",
    citation: "소득세법 §118의10",
    keywords: ["출국일 당시의 시가로 한다", "연 250만원을 공제", "양도소득과세표준", "종합소득, 퇴직소득"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_RATE",
    citation: "소득세법 §118의11",
    keywords: ["국외전출자의 양도소득세", "양도소득과세표준", "산출세액"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_ADJUSTMENT_CREDIT",
    citation: "소득세법 §118의12",
    keywords: ["조정공제", "실제 양도가액", "조정공제액", "산출세액에서 공제"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_FOREIGN_CREDIT",
    citation: "소득세법 §118의13",
    keywords: ["외국납부세액", "외국정부에 세액을 납부", "조정공제액을 공제한 금액을 한도로"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_NONRESIDENT_CREDIT",
    citation: "소득세법 §118의14",
    keywords: ["비거주자의 국내원천소득", "산출세액에서 조정공제액을 공제한 금액을 한도로", "세액공제"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_FILING",
    citation: "소득세법 §118의15",
    keywords: ["납세관리인", "출국일 전날까지", "보유현황", "경정을 청구"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER.EXIT_TAX_DEFERRAL",
    citation: "소득세법 §118의16",
    keywords: ["납부유예", "납세담보", "출국일부터 5년", "이자상당액을 가산하여 납부"],
    keywordMode: "ALL",
  },

  // ── 조세특례제한법 (양도세 감면·과세특례) ──────────────────────────
  {
    id: "SPECIAL.VENTURE_STOCK_EXEMPT",
    citation: "조특법 §14",
    keywords: ["양도소득에 포함하지 아니한다", "벤처투자조합", "창업기업"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.STARTUP_FUND_GIFT_SPECIAL",
    citation: "조특법 §30의5",
    keywords: ["창업자금", "100분의 10", "5억원을 공제"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.FAMILY_BIZ_SUCCESSION_GIFT",
    citation: "조특법 §30의6",
    keywords: ["가업의 승계", "10억원을 공제", "10년 이상 계속하여 경영"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.FAMILY_BIZ_GIFT_TAX_DEFERRAL",
    citation: "조특법 §30의7",
    keywords: ["납부유예", "승계를 목적으로", "담보를 제공"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.SELF_CULTIVATED_FARMLAND",
    citation: "조특법 §69",
    keywords: ["자경농지", "8년 이상", "양도소득세의 100분의 100에 상당하는 세액을 감면"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.PUBLIC_PROJECT_LAND",
    citation: "조특법 §77",
    keywords: ["공익사업", "사업인정고시일", "양도소득세의 100분의 15"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.LONG_TERM_RENTAL_HOUSE_EXEMPT",
    citation: "조특법 §97",
    keywords: ["국민주택", "5년 이상 임대", "양도소득세의 100분의 50에 상당하는 세액을 감면"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.NEW_BUILD_RENTAL_EXEMPT",
    citation: "조특법 §97의2",
    keywords: ["신축임대주택", "5년 이상 임대한 후 양도", "양도소득세를 면제"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.LONG_GENERAL_RENTAL_LTHD70",
    citation: "조특법 §97의3",
    keywords: ["장기일반민간임대주택", "10년 이상 계속하여 임대", "100분의 70의 공제율"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.LONG_RENTAL_LTHD_EXTRA",
    citation: "조특법 §97의4",
    keywords: ["6년 이상 임대", "추가공제율", "보유기간별 공제율"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.LONG_GENERAL_RENTAL_FULL_EXEMPT",
    citation: "조특법 §97의5",
    keywords: ["장기일반민간임대주택등", "10년 이상 계속하여 장기일반민간임대주택등으로 임대", "양도소득세의 100분의 100에 상당하는 세액을 감면"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.UNSOLD_HOUSE_1995",
    citation: "조특법 §98",
    keywords: ["미분양 국민주택", "5년 이상 보유ㆍ임대", "100분의 20으로 한다"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.LOCAL_UNSOLD_HOUSE_2008",
    citation: "조특법 §98의2",
    keywords: ["지방 미분양주택", "수도권 밖에 있는", "장기보유특별공제액"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.UNSOLD_HOUSE_2009_BUYER",
    citation: "조특법 §98의3",
    keywords: ["서울특별시 밖의 지역", "5년 이내에 양도함으로써 발생하는 소득에 대해서는 양도소득세의 100분의 100", "수도권과밀억제권역인 경우에는 100분의 60"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.NONRESIDENT_HOUSE_2009",
    citation: "조특법 §98의4",
    keywords: ["국내사업장이 없는 비거주자", "양도소득세의 100분의 10에 상당하는 세액을 감면"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.LOCAL_UNSOLD_HOUSE_2010_PRICEDROP",
    citation: "조특법 §98의5",
    keywords: ["수도권 밖의 지역", "분양가격 인하율", "100분의 60"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.COMPLETED_UNSOLD_RENTAL_2011",
    citation: "조특법 §98의6",
    keywords: ["준공후미분양주택", "2년 이상 임대한 주택", "양도소득세의 100분의 50에 상당하는 세액을 감면"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.UNSOLD_HOUSE_2012",
    citation: "조특법 §98의7",
    keywords: ["취득가액이 9억원 이하인 주택", "2012년 9월 24일", "양도소득세의 100분의 100에 상당하는 세액을 감면"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.COMPLETED_UNSOLD_RENTAL_2015",
    citation: "조특법 §98의8",
    keywords: ["취득가액이 6억원 이하", "135제곱미터 이하", "5년 이상 임대한 주택"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.LOCAL_COMPLETED_UNSOLD_2024",
    citation: "조특법 §98의9",
    keywords: ["1주택을 보유한 1세대", "2024년 1월 10일부터 2026년 12월 31일", "수도권 밖의 지역에 소재할 것"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.NEW_HOUSE_1998_BUYER",
    citation: "조특법 §99",
    keywords: ["신축주택", "1998년 5월 22일부터 1999년 6월 30일", "양도소득금액을 양도소득세 과세대상소득금액에서 빼"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.NEW_HOUSE_2013_BUYER",
    citation: "조특법 §99의2",
    keywords: ["2013년 4월 1일부터 2013년 12월 31일", "양도소득세의 100분의 100에 상당하는 세액을 감면", "1세대 1주택자의 주택"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.NEW_HOUSE_2001_BUYER",
    citation: "조특법 §99의3",
    keywords: ["신축주택취득기간", "2001년 5월 23일부터 2003년 6월 30일", "양도소득금액을 양도소득세 과세대상소득금액에서 빼"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.RURAL_HOUSE_SPECIAL",
    citation: "조특법 §99의4",
    keywords: ["농어촌주택", "3년 이상 보유", "소유주택이 아닌 것으로 보아"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.MULTILATERAL_TRADING_STOCK",
    citation: "조특법 §104의4",
    keywords: ["다자간매매체결회사", "증권시장에서 거래되는 것으로 보아"],
    keywordMode: "ALL",
  },
  {
    // stock.ts ELECTRONIC_FILING_CREDIT (구 "소득세법 §52의2" 인용 정정분)
    id: "SPECIAL.ELECTRONIC_FILING_CREDIT",
    citation: "조특법 §104의8",
    keywords: ["전자신고", "양도소득세 또는 법인세", "공제"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.DUPLICATE_SUPPORT_EXCLUSION",
    citation: "조특법 §127",
    keywords: ["중복지원의 배제", "하나만을 선택하여 적용받을 수 있다", "거주자가 토지등을 양도하여 둘 이상의 양도소득세의 감면규정"],
    keywordMode: "ALL",
  },
  {
    id: "SPECIAL.TRANSFER_GIFT_TAX_EXEMPTION_CEILING",
    citation: "조특법 §133",
    keywords: ["양도소득세 및 증여세 감면의 종합한도", "과세기간별로 1억원을 초과", "5개 과세기간"],
    keywordMode: "ALL",
  },
  {
    // burdened-gift.ts — 양도가액·취득가액 산정방식 일치 원칙
    id: "TRANSFER.GAIN_CALCULATION",
    citation: "소득세법 §100",
    keywords: ["양도가액을 실지거래가액", "취득가액도 실지거래가액", "양도가액을 기준시가에 따를 때에는 취득가액도 기준시가에 따른다"],
    keywordMode: "ALL",
  },
  {
    // stock.ts SECTION_118_17_REENTRY — 국외전출세 재전입 환급·납부유예 취소
    id: "TRANSFER.REENTRY_REFUND",
    citation: "소득세법 §118의17",
    keywords: ["재전입 등에 따른 환급 등", "국외전출자가 출국일부터 5년 이내에", "납부유예 중인 세액의 취소"],
    keywordMode: "ALL",
  },
];
