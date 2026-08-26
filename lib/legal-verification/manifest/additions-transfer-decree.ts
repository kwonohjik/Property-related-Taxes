/**
 * 검증 매니페스트 추가분 — 소득세법 **시행령** (양도소득세)
 *
 * ── 왜 별도 파일인가 ───────────────────────────────────────────────────────
 * 커버리지 판정은 `LAW_ALIAS` 화이트리스트(`coverage.ts`의 `KNOWN_ABBRS`)를 통과한
 * 인용만 모수에 넣는다. 종전에는 여기에 **본법만** 있어 "소득세법 시행령 §…" 인용이
 * 전부 `isLegalCitation === false`로 떨어졌고, 그래서 시행령 조문은 커버리지 100%가
 * 유지되는 동안에도 **검증 대상이 아니었다**(모수에서 조용히 빠진 것이지 통과한 게 아니다).
 *
 * 2026-08-05에 `LAW_ALIAS`에 "소득세법 시행령"을 등록하면서 그 인용들이 모수에 들어왔다.
 * 이 파일은 그때 드러난 **37개 조문**을 등록한다(§163의2는 종전부터 등록돼 있어 38개 중 1개 제외).
 *
 * ⚠️ 시행령은 본법보다 개정이 잦다 — 이 게이트의 실익이 본법보다 크다.
 *    실제로 아래 조문 다수가 2025~2026년에 개정됐다(§154·§167의3·§178의8 등).
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 * 조문 제목·계산식 라벨처럼 개정에 잘 견디는 표현을 우선 골랐다.
 */

import type { VerificationRule } from "../verifier-types";

export const TRANSFER_DECREE_ADDITIONS: VerificationRule[] = [
  // ── 양도·취득의 정의와 시기 ────────────────────────────────────────
  {
    id: "TRANSFER_DECREE.EXCHANGE_DEFINITION",
    citation: "소득세법 시행령 §152",
    keywords: ["환지처분", "사업시행자가 사업완료후에", "보류지", "체비지"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.ACQ_TRANSFER_TIMING",
    citation: "소득세법 시행령 §162",
    keywords: [
      "대금을 청산한 날이 분명하지 아니한 경우",
      "등기ㆍ등록접수일",
      "사용승인서 교부일",
      "상속이 개시된 날 또는 증여를 받은 날",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.GROUNDWATER_RIGHT_PRICE",
    citation: "소득세법 시행령 §162의2",
    keywords: ["지하수개발ㆍ이용권", "토사석의 채취허가", "임목"],
    keywordMode: "ALL",
  },

  // ── 1세대 1주택 비과세·특례 ────────────────────────────────────────
  {
    id: "TRANSFER_DECREE.ONE_HOUSE_SCOPE",
    citation: "소득세법 시행령 §154",
    keywords: [
      "1세대1주택의 범위",
      "보유기간이 2년",
      "조정대상지역",
      "그 보유기간 중 거주기간이 2년 이상인 것",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.ONE_HOUSE_SPECIAL",
    citation: "소득세법 시행령 §155",
    keywords: [
      "1세대1주택의 특례",
      "일시적으로 2주택이 된 경우",
      "신규 주택을 취득한 날부터 3년 이내에 종전의 주택을 양도",
      "직전거주주택보유주택",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.LTHD_ONE_HOUSE",
    citation: "소득세법 시행령 §159의4",
    keywords: [
      "대통령령으로 정하는 1세대 1주택",
      "보유기간 중 거주기간이 2년 이상인 것",
      "공동상속주택",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.EXPENSIVE_HOUSE_GAIN",
    citation: "소득세법 시행령 §160",
    keywords: ["고가주택에 대한 양도차익등의 계산", "12억원", "안분계산"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.PRIOR_RESIDENCE_HOUSE_INCOME",
    citation: "소득세법 시행령 §161",
    keywords: ["직전거주주택보유주택", "기준시가", "고가주택"],
    keywordMode: "ALL",
  },

  // ── 부담부증여 ─────────────────────────────────────────────────────
  {
    id: "TRANSFER_DECREE.BURDENED_GIFT_GAIN",
    citation: "소득세법 시행령 §159",
    keywords: [
      "부담부증여에 대한 양도차익의 계산",
      "채무액",
      "증여가액",
      "양도소득세 과세대상에 해당하는 자산과 해당하지 아니하는 자산을 함께 부담부증여",
    ],
    keywordMode: "ALL",
  },

  // ── 주식·과점주주·대주주 ────────────────────────────────────────────
  {
    id: "TRANSFER_DECREE.LISTED_MAJOR_SHAREHOLDER",
    citation: "소득세법 시행령 §157",
    keywords: [
      "주권상장법인대주주",
      "소유주식의 비율",
      "100분의 1 이상",
      "직전 사업연도 종료일",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.OVERSEAS_STOCK_SCOPE",
    citation: "소득세법 시행령 §157의3",
    keywords: [
      "국외주식 등의 범위",
      "외국법인이 발행한 주식등",
      "해외 증권시장에 상장된 것",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.OLIGOPOLY_SHAREHOLDER",
    citation: "소득세법 시행령 §158",
    keywords: ["과점주주", "100분의 50을 초과하는 경우", "소급해 3년 내에"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_HEAVY_CORP_STOCK",
    citation: "소득세법 시행령 §167의7",
    keywords: [
      "비사업용토지의 가액이 차지하는 비율",
      "100분의 50 이상인 법인의 주식등",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.MAJOR_SHAREHOLDER_SCOPE",
    citation: "소득세법 시행령 §167의8",
    keywords: ["주권상장법인대주주", "100분의 4 이상", "시가총액이 10억원", "40억원"],
    keywordMode: "ALL",
  },

  // ── 필요경비·기준시가·양도차익 ──────────────────────────────────────
  {
    id: "TRANSFER_DECREE.NECESSARY_EXPENSES",
    citation: "소득세법 시행령 §163",
    keywords: [
      "취득에 든 실지거래가액",
      "현재가치할인차금",
      "부당행위계산에 의한 시가초과액",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.LAND_BUILDING_STD_PRICE",
    citation: "소득세법 시행령 §164",
    // ⚠️ 종전 키워드 3개는 전부 §164 ①②항 문장이라, 이 기능이 실제로 의존하는
    //    ③(직전 고시분)·⑤(산정기준율)·⑧(동일조정기간 환산)이 통째로 삭제돼도 PASS 가 났다(F-40).
    //    `verifyRule` 이 조 전문에 대해 includes 만 보므로 **항별 verbatim** 을 명시해야 고정된다.
    //    형제 규칙 §165 가 「100분의 80을 곱한 금액」으로 앱 의존 항을 고정하는 것과 같은 층위다.
    keywords: [
      "개별공시지가가 없는 토지",
      "비교표에 따라",
      "국세청장이 지정한 지역",
      "직전의 기준시가에 의한다", // ③
      "국세청장이 고시한 기준율", // ⑤
      "기준시가의 상승률을 참작하여", // ⑧
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.OTHER_ASSET_STD_PRICE",
    citation: "소득세법 시행령 §165",
    keywords: [
      "프리미엄에 상당하는 금액",
      "순손익가치",
      "순자산가치",
      "100분의 80을 곱한 금액",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.GAIN_CALCULATION",
    citation: "소득세법 시행령 §166",
    keywords: [
      "관리처분계획등인가후양도차익",
      "관리처분계획등인가전양도차익",
      "청산금",
      "기존건물과 그 부수토지의 평가액",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.ESTIMATED_DETERMINATION",
    citation: "소득세법 시행령 §176의2",
    keywords: [
      "매매사례가액",
      "감정가액",
      "환산한 가액",
      "증빙서류가 없거나 그 중요한 부분이 미비된 경우",
    ],
    keywordMode: "ALL",
  },

  // ── 다주택 중과 ────────────────────────────────────────────────────
  {
    id: "TRANSFER_DECREE.THREE_HOUSE_SCOPE",
    citation: "소득세법 시행령 §167의3",
    keywords: [
      "1세대 3주택 이상에 해당하는 주택",
      "주택을 3개 이상",
      "기준시가의 합계액",
      "3억원을 초과하지 않는 주택",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.TWO_HOUSE_SCOPE",
    citation: "소득세법 시행령 §167의10",
    keywords: [
      "1세대 2주택에 해당하는 주택",
      "주택을 2개",
      "취학, 근무상의 형편, 질병의 요양",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.SHORT_TERM_HOUSE_LAND",
    citation: "소득세법 시행령 §167의5",
    keywords: ["주택이 정착된 면적", "배율", "3배", "10배"],
    keywordMode: "ALL",
  },

  // ── 비사업용 토지 (법 §104의3 위임) ─────────────────────────────────
  {
    id: "TRANSFER_DECREE.NBL_PERIOD_CRITERIA",
    citation: "소득세법 시행령 §168의6",
    keywords: [
      "비사업용 토지의 기간기준",
      "양도일 직전 5년 중 2년을 초과하는 기간",
      "양도일 직전 3년 중 1년을 초과하는 기간",
      "토지의 소유기간의 100분의 40에 상당하는 기간을 초과하는 기간",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_LAND_CATEGORY",
    citation: "소득세법 시행령 §168의7",
    keywords: ["토지지목의 판정", "사실상의 현황에 의한다", "공부상의 등재현황"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_FARMLAND",
    citation: "소득세법 시행령 §168의8",
    keywords: [
      "농지소재지에 사실상 거주",
      "직접 경작",
      "상속개시일부터 3년이 경과하지 아니한 토지",
      "농지전용허가",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_FOREST",
    citation: "소득세법 시행령 §168의9",
    keywords: ["산림보호구역", "채종림", "산림경영계획인가를 받아 시업", "공원자연보존지구"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_RANCH",
    citation: "소득세법 시행령 §168의10",
    keywords: [
      "축산용으로 사용되는 축사와 부대시설의 토지",
      "초지",
      "축산용 토지의 기준면적",
      "녹지지역 및 개발제한구역",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_OTHER_BUSINESS_LAND",
    citation: "소득세법 시행령 §168의11",
    keywords: [
      "선수전용 체육시설용 토지",
      "종업원 체육시설용 토지",
      "주차장용 토지",
      "부설주차장",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_HOUSE_APPURTENANT",
    citation: "소득세법 시행령 §168의12",
    keywords: ["지역별로 대통령령으로 정하는 배율", "3배", "5배", "10배"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_VILLA",
    citation: "소득세법 시행령 §168의13",
    keywords: [
      "농어촌 주택의 부속토지",
      "150제곱미터",
      "660제곱미터",
      "기준시가 2억원 이하",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.NBL_UNAVOIDABLE_REASON",
    citation: "소득세법 시행령 §168의14",
    keywords: [
      "사용이 금지 또는 제한된 토지",
      "보호구역으로 지정된 기간",
      "최초의 경매기일",
      "최초의 공매일",
    ],
    keywordMode: "ALL",
  },

  // ── 국외자산·국외전출자 ────────────────────────────────────────────
  {
    id: "TRANSFER_DECREE.OVERSEAS_ASSET_MARKET_VALUE",
    citation: "소득세법 시행령 §178의3",
    keywords: [
      "국외자산의 시가",
      "외국정부",
      "양도일 또는 취득일전후 6월이내에 이루어진 실지거래가액",
      "보상가액",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.OVERSEAS_FX_CONVERSION",
    citation: "소득세법 시행령 §178의5",
    keywords: [
      "국외자산 양도차익의 외화환산",
      "기준환율 또는 재정환율",
      "장기할부조건",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.OVERSEAS_FOREIGN_TAX_CREDIT",
    citation: "소득세법 시행령 §178의7",
    keywords: [
      "국외자산 양도소득세액",
      "개인의 양도소득금액을 과세표준으로 하여 과세된 세액",
      "국외자산양도소득세액공제(필요경비 산입)신청서",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.EXPATRIATE_MAJOR_SHAREHOLDER",
    citation: "소득세법 시행령 §178의8",
    keywords: ["국외전출자 주식등", "양도가액의 합계가 5억원 이하", "외국인근로자"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.EXPATRIATE_DEPARTURE_VALUE",
    citation: "소득세법 시행령 §178의9",
    keywords: [
      "출국일 당시의 해당 주식등의 거래가액",
      "출국일 전후 각 3개월 이내에 해당 주식등의 매매사례",
      "국외주식등",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.EXPATRIATE_TAX_CREDIT",
    citation: "소득세법 시행령 §178의10",
    keywords: [
      "조정공제",
      "외국납부세액공제",
      "비거주자의 국내원천소득 세액공제",
      "2년 이내에",
    ],
    keywordMode: "ALL",
  },

  {
    // 복합 인용 "소득세법 §102 ② + 시행령 §167의2" 뒤쪽 조문
    id: "TRANSFER_DECREE.LOSS_OFFSET",
    citation: "소득세법 시행령 §167의2",
    keywords: [
      "양도차손의 통산",
      "같은 세율을 적용받는 자산의 양도소득금액",
      "안분하여 공제",
    ],
    keywordMode: "ALL",
  },

  // ══ 소득세법 시행규칙 ═══════════════════════════════════════════════
  {
    id: "TRANSFER_RULE.STD_PRICE_LAND_BUILDING",
    citation: "소득세법 시행규칙 §80",
    keywords: ["기준시가 조정월수", "전기의 기준시가", "취득당시의 기준시가"],
    keywordMode: "ALL",
  },
  {
    // 복합 인용 "소득세법 시행령 §168조의11 ② + 소득세법 시행규칙 §83조의4" 뒤쪽 조문 —
    // 앞 조문만 파싱되던 탓에 그동안 모수 밖이었다.
    id: "TRANSFER_RULE.NBL_OTHER_LAND_AREA",
    citation: "소득세법 시행규칙 §83의4",
    keywords: [
      "선수전용 체육시설의 기준면적",
      "종업원 체육시설의 기준면적",
      "대한체육회에 가맹된 경기단체",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_RULE.NBL_UNAVOIDABLE_PERIOD",
    citation: "소득세법 시행규칙 §83의5",
    keywords: [
      "부득이한 사유가 있어 비사업용 토지로 보지 아니하는 토지의 판정기준",
      "건축허가가 제한된 기간",
      "착공이 제한된 기간",
      "공공공지",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_RULE.STD_PRICE_OTHER_ASSET",
    citation: "소득세법 시행규칙 §81",
    keywords: [
      "「상속세 및 증여세법 시행규칙」 제17조에 따른 이자율",
      "생산자물가지수",
      "시가표준액",
    ],
    keywordMode: "ALL",
  },

  // ══ 조세특례제한법 시행령 (양도세 감면) ═════════════════════════════
  {
    id: "TRANSFER_DECREE.SELF_FARMING_REDUCTION",
    citation: "조특령 §66",
    keywords: [
      "자경농지에 대한 양도소득세의 감면",
      "농지소재지에 거주하는",
      "직선거리 30킬로미터 이내의 지역",
      "영농조합법인",
    ],
    keywordMode: "ALL",
  },
];
