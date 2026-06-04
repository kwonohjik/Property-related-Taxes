/**
 * 검증 매니페스트 추가분 — 지방세법(취득·재산) + 지방세특례제한법 (KoreanLaw 실측)
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

export const LOCAL_ADDITIONS: VerificationRule[] = [
  // ── 지방세법 — 취득세 계열 ────────────────────────────────────────
  {
    id: "ACQUISITION.STANDARD_PRICE",
    citation: "지방세법 §4",
    keywords: ["시가표준액", "부동산 가격공시에 관한 법률", "공시된 가액", "개별공시지가"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.DEFINITION",
    citation: "지방세법 §6",
    keywords: ["취득", "원시취득", "승계취득", "중과기준세율"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.TAXPAYER",
    citation: "지방세법 §7",
    keywords: ["사실상 취득", "과점주주", "부담부", "지목을 사실상 변경"],
    keywordMode: "ALL",
  },
  // ⚠️ 지방세법 §7의2 (acquisition.ts DEEMED_ACQUISITION, 간주취득)는 현행 지방세법에 부재
  //    (간주취득은 §7로 통합 추정) → coverage.ts KNOWN_ABSENT_ARTICLES 로 분리. 현행 조문 확정 후 정정 필요.
  {
    id: "ACQUISITION.NON_TAXABLE",
    citation: "지방세법 §9",
    keywords: ["취득세를 부과하지 아니한다", "신탁재산의 취득", "임시건축물"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.TAX_BASE_STANDARD",
    citation: "지방세법 §10",
    keywords: ["취득 당시의 가액", "연부금액"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.TAX_BASE_GRATUITOUS",
    citation: "지방세법 §10의2",
    keywords: ["무상취득", "시가인정액", "상속에 따른 무상취득", "시가불인정 감정기관"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.TAX_BASE_ONEROUS",
    citation: "지방세법 §10의3",
    keywords: ["유상거래", "사실상취득가격", "부당행위계산"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.TAX_BASE_ORIGINAL",
    citation: "지방세법 §10의4",
    keywords: ["원시취득", "사실상취득가격", "사실상취득가격을 확인할 수 없는 경우"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.TAX_BASE_SPECIAL",
    citation: "지방세법 §10의5",
    keywords: ["차량 또는 기계장비", "시가표준액", "대물변제", "법인의 합병"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.HOUSING_COUNT",
    citation: "지방세법 §13의3",
    keywords: ["주택 수에 가산", "조합원입주권", "주택분양권", "신탁된 주택"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.RATE_SPECIAL",
    citation: "지방세법 §15",
    keywords: ["중과기준세율을 뺀 세율", "환매등기", "공유물", "재산분할"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.FILING_PAYMENT",
    citation: "지방세법 §20",
    keywords: ["60일", "신고하고 납부", "상속개시일이 속하는 달의 말일", "3개월"],
    keywordMode: "ALL",
  },

  // ── 지방세법 — 재산세 계열 ────────────────────────────────────────
  {
    id: "PROPERTY.LOCAL_INCOME_TAX_RATE",
    citation: "지방세법 §103의3",
    keywords: ["양도소득에 대한 개인지방소득세", "양도소득과세표준", "보유기간", "비사업용 토지"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.TAXABLE_OBJECT",
    citation: "지방세법 §105",
    keywords: ["토지", "건축물", "주택", "항공기", "선박", "과세대상"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.LAND_CLASSIFICATION",
    citation: "지방세법 §106",
    keywords: ["종합합산과세대상", "별도합산과세대상", "분리과세대상", "과세기준일 현재 납세의무자"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.TAXPAYER",
    citation: "지방세법 §107",
    keywords: ["재산세 과세기준일 현재", "사실상 소유하고 있는 자", "납부할 의무", "수탁자"],
    keywordMode: "ALL",
  },
  // ⚠️ 지방세법 §107의2 (property.ts TAXPAYER_TRUSTEE, 신탁재산 납세의무자)는 현행 지방세법에 부재
  //    → coverage.ts KNOWN_ABSENT_ARTICLES 로 분리. 현행 조문 확정 후 정정 필요.
  {
    id: "PROPERTY.NON_TAXABLE",
    citation: "지방세법 §109",
    keywords: ["재산세를 부과하지 아니한다", "국가", "지방자치단체", "공용 또는 공공용"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.TAX_BASE",
    citation: "지방세법 §110",
    keywords: ["시가표준액", "공정시장가액비율", "과세표준", "과세표준상한액"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.URBAN_AREA_RATE",
    citation: "지방세법 §112",
    keywords: ["재산세 도시지역분", "도시지역", "1천분의 1.4", "지방의회의 의결"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.RATE_APPLICATION",
    citation: "지방세법 §113",
    keywords: ["종합합산과세대상", "별도합산과세대상", "분리과세대상", "가액을 모두 합한 금액을 과세표준"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.ASSESSMENT_DATE",
    citation: "지방세법 §114",
    keywords: ["과세기준일", "매년 6월 1일"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.PAYMENT_PERIOD",
    citation: "지방세법 §115",
    keywords: ["토지", "9월 16일부터 9월 30일", "건축물", "7월 16일부터 7월 31일", "주택", "2분의 1"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.REGIONAL_RESOURCE_TAX",
    citation: "지방세법 §146",
    keywords: ["소방분 지역자원시설세", "건축물", "시가표준액", "화재위험 건축물"],
    keywordMode: "ALL",
  },
  {
    id: "PROPERTY.LOCAL_EDU_TAX",
    citation: "지방세법 §151",
    keywords: ["재산세액", "100분의 20", "지방교육세", "납부하여야 할"],
    keywordMode: "ALL",
  },

  // ── 지방세특례제한법 ──────────────────────────────────────────────
  {
    id: "LOCAL_SPECIAL.FARMLAND_REDUCTION",
    citation: "지방세특례제한법 §6",
    keywords: ["자경농민", "직접 경작", "취득세의 100분의 50", "2년 이상 영농"],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_SPECIAL.DISABLED_VEHICLE",
    citation: "지방세특례제한법 §17",
    keywords: ["장애인", "보철용", "생업활동용", "취득세 및 자동차세를 각각"],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_SPECIAL.PUBLIC_RENTAL",
    citation: "지방세특례제한법 §31",
    keywords: ["공공주택사업자", "임대할 목적", "전용면적 60제곱미터 이하", "취득세를 면제"],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_SPECIAL.LONG_TERM_PRIVATE_RENTAL",
    citation: "지방세특례제한법 §31의3",
    keywords: ["장기일반민간임대주택", "공공지원민간임대주택", "임대사업자", "임대의무기간"],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_SPECIAL.FIRST_HOME_NEWLYWED",
    citation: "지방세특례제한법 §36의2",
    keywords: ["혼인한 날", "신혼부부", "취득세의 100분의 50", "합산 소득이 7천만원"],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_SPECIAL.CULTURE_ARTS",
    citation: "지방세특례제한법 §52",
    keywords: ["문화예술단체", "문화예술사업에 직접 사용", "체육단체", "취득세를"],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_SPECIAL.VENTURE_ENTERPRISE",
    citation: "지방세특례제한법 §58",
    keywords: ["벤처기업집적시설", "신기술창업집적지역", "취득세 및 재산세", "100분의 35"],
    keywordMode: "ALL",
  },
];
