/**
 * 검증 매니페스트 추가분 — 지방세법 **시행령** (취득세·재산세)
 *
 * 배경은 `additions-transfer-decree.ts` 상단과 같다 — `LAW_ALIAS` 키 집합이
 * 커버리지 화이트리스트를 겸하므로, 등재 전까지 "지방세법 시행령 §…" 인용은
 * `isLegalCitation === false`로 떨어져 **모수에서 조용히 빠져 있었다**(미검사).
 *
 * 2026-08-05에 "지방세법 시행령"을 등재하며 드러난 **13개 조문**을 등록한다.
 *
 * ⚠️ 이 13개는 취득세 중과 판정(§28의2~§28의6)과 재산세 토지 3분류(§101·§102)의
 *    실질 근거다 — 개정이 잦은 데다(§28의2는 2020~2026년에만 15회 개정) 개정되면
 *    계산 결과가 직접 바뀐다. 본법보다 이 게이트의 실익이 크다.
 *
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

export const LOCAL_DECREE_ADDITIONS: VerificationRule[] = [
  // ── 시가표준액·취득시기 ────────────────────────────────────────────
  {
    id: "LOCAL_DECREE.BUILDING_STD_PRICE_PROCEDURE",
    citation: "지방세법 시행령 §4의2",
    keywords: [
      "건축물의 시가표준액",
      "시장ㆍ군수ㆍ구청장",
      "매년 6월 1일까지 고시",
      "100분의 20을 초과하여",
    ],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_DECREE.ACQUISITION_TIMING",
    citation: "지방세법 시행령 §20",
    keywords: [
      "무상취득의 경우에는 그 계약일",
      "사실상의 잔금지급일",
      "계약일부터 60일이 경과한 날",
      "계약해제신고서",
    ],
    keywordMode: "ALL",
  },
  {
    /**
     * acquisition.ts `RELATED_PARTY_LOW_PRICE_TYPE` — 법 §10의3② 부당행위계산의 유형(교재 대조 T1).
     * 키워드는 KoreanLaw 실측 본문(MST 290815, 시행 2026-10-01).
     */
    id: "LOCAL_DECREE.RELATED_PARTY_LOW_PRICE_TYPE",
    citation: "지방세법 시행령 §18의2",
    keywords: [
      "부당행위계산",
      "특수관계인으로부터 시가인정액",
      "차액이 3억원 이상이거나 시가인정액의 100분의 5에 상당하는 금액 이상",
    ],
    keywordMode: "ALL",
  },
  {
    /** acquisition.ts `INHERITANCE_ONE_HOUSE_RANGE` — 상속 1가구 1주택 범위·고급주택 제외(교재 대조 T9, MST 290815 실독 2026-11-28) */
    id: "LOCAL_DECREE.INHERITANCE_ONE_HOUSE_RANGE",
    citation: "지방세법 시행령 §29",
    keywords: [
      "1가구 1주택",
      "제28조제4항에 따른 고급주택은 제외한다",
      "지분이 가장 큰 상속인",
    ],
    keywordMode: "ALL",
  },
  {
    /**
     * acquisition.ts `DEEMED_LAND_BASE_STANDARD` — 지목변경 과세표준의 **보충법** 계산방법.
     * 법 §10의6②이 「대통령령으로 정하는 방법」으로 위임한 곳이다.
     * 키워드는 KoreanLaw 실측 본문(MST 287223, 시행 2026-07-01).
     */
    id: "LOCAL_DECREE.DEEMED_TAX_BASE_SUPPLEMENT",
    citation: "지방세법 시행령 §18의6",
    keywords: [
      "사실상취득가격을 확인할 수 없는 경우",
      "토지의 지목이 사실상 변경된 때",
      "가목의 가액에서 나목의 가액을 뺀 가액",
      "토지가격비준표",
    ],
    keywordMode: "ALL",
  },

  // ── 취득세 주택 중과 (법 §13의2 위임) ───────────────────────────────
  {
    id: "LOCAL_DECREE.HOUSE_SURCHARGE_EXCEPTION",
    citation: "지방세법 시행령 §28의2",
    keywords: [
      "주택 유상거래 취득 중과세의 예외",
      "중과세 대상으로 보지 않는다",
      "공공주택사업자",
      "노인복지주택",
      // 17호 — 2026.1.1. 이후 비수도권 미분양 아파트(종료일은 사용자 결정 2027.12.31.이라 키워드에서 뺐다)
      "분양되지 않은 아파트를 2026년 1월 1일부터",
      "전용면적 85제곱미터 이하이고 취득당시가액이 6억원 이하일 것",
    ],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_DECREE.HOUSEHOLD_CRITERIA",
    citation: "지방세법 시행령 §28의3",
    keywords: [
      "세대의 기준",
      "세대별 주민등록표",
      "미혼인 30세 미만의 자녀",
      "동거봉양",
    ],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_DECREE.HOUSE_COUNT_METHOD",
    citation: "지방세법 시행령 §28의4",
    keywords: [
      "주택 수의 산정방법",
      "조합원입주권",
      "주택분양권",
      "오피스텔",
      // ⑥1호바목 — 보유 중인 §28의2 17호 주택 제외
      "제28조의2제17호에 해당하는 주택",
    ],
    keywordMode: "ALL",
  },
  // ── §28의4⑥ 호 번호 고정 (D-9) ──
  // 조문 단위 규칙만으로는 ⑥ 각 호의 **번호**가 바뀌어도 통과한다. 법제처 호내용은 「N. 」으로
  // 시작하므로 번호를 붙인 verbatim 키워드로 호 번호까지 검증한다. 상수값 ↔ 키워드 번호의 일치는
  // `__tests__/tax-engine/acquisition-tax/house-count-legal-codes-numbering.anchor.test.ts`가 지킨다.
  {
    id: "ACQUISITION.HOUSE_COUNT_INHERITANCE_5YR",
    citation: "지방세법 시행령 §28의4⑥3호",
    keywords: [
      "3. 상속을 원인으로 취득한 주택, 조합원입주권, 주택분양권 또는 오피스텔로서 상속개시일부터 5년이 지나지 않은",
    ],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.HOUSE_COUNT_PRE_MARRIAGE_RIGHT",
    citation: "지방세법 시행령 §28의4⑥6호",
    keywords: [
      "6. 혼인한 사람이 혼인 전 소유한 주택분양권으로 주택을 취득하는 경우 다른 배우자가 혼인 전부터 소유하고 있는 주택",
    ],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.HOUSE_COUNT_HANSI_EXCLUSION",
    citation: "지방세법 시행령 §28의4⑥7호",
    keywords: ["7. 제2항제1호부터 제3호까지의 규정에 해당하는 주택"],
    keywordMode: "ALL",
  },
  // ── §28의4⑥8·9호 오피스텔 한시 특례 (S03-7 — 2026-10-11 KoreanLaw 현행 MST 290815 본문 verbatim) ──
  {
    id: "ACQUISITION.HOUSE_COUNT_OFFICE_HANSI_NEW_BUILD",
    citation: "지방세법 시행령 §28의4⑥8호",
    keywords: [
      "신축 오피스텔을 같은 기간 내에 최초로 유상승계취득하는 오피스텔로서 전용면적이 60제곱미터 이하이고 취득당시가액이 3억원",
    ],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.HOUSE_COUNT_OFFICE_HANSI_LEASE",
    citation: "지방세법 시행령 §28의4⑥9호",
    keywords: [
      "유상승계취득하는 오피스텔(신축 후 최초로 유상승계취득한 오피스텔은 제외한다)로서 다음 각 목의 요건을 모두 갖춘 오피스텔",
      "그 오피스텔을 임대주택으로 등록할 것",
    ],
    keywordMode: "ALL",
  },
  // ── §28의4③·⑤ (계획서 I-7·I-6 — 2026-09-30 KoreanLaw 현행 MST 288831 본문 verbatim) ──
  {
    id: "ACQUISITION.HOUSE_COUNT_SIMULTANEOUS_ACQUISITION",
    citation: "지방세법 시행령 §28의4③",
    keywords: ["동시에 2개 이상 취득하는 경우에는 납세의무자가 정하는 바에 따라 순차적으로 취득하는 것으로 본다"],
    keywordMode: "ALL",
  },
  {
    id: "ACQUISITION.HOUSE_COUNT_JOINT_INHERITANCE",
    citation: "지방세법 시행령 §28의4⑤",
    keywords: [
      "상속으로 여러 사람이 공동으로 1개의 주택, 조합원입주권, 주택분양권 또는 오피스텔을 소유하는 경우 지분이 가장 큰 상속인",
      "그 주택 또는 오피스텔에 거주하는 사람",
      "나이가 가장 많은 사람",
    ],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_DECREE.TEMPORARY_TWO_HOUSE",
    citation: "지방세법 시행령 §28의5",
    keywords: [
      "일시적 2주택",
      "종전 주택등",
      "일시적 2주택 기간",
      "이사ㆍ학업ㆍ취업ㆍ직장이전",
      // 2026.9.30. 개정 — 조정→조정 2년 (교재 대조 T2)
      "조정대상지역에 있는 경우에는 2년으로",
    ],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_DECREE.GIFT_SURCHARGE_TARGET",
    citation: "지방세법 시행령 §28의6",
    keywords: [
      "중과세 대상 무상취득",
      "시가표준액",
      "3억원 이상인 주택",
      "1세대 1주택을 소유한 사람",
    ],
    keywordMode: "ALL",
  },

  // ── 재산세 토지 3분류 (법 §106 위임) ────────────────────────────────
  {
    id: "LOCAL_DECREE.SEPARATE_AGGREGATE_LAND",
    citation: "지방세법 시행령 §101",
    keywords: [
      "별도합산과세대상 토지의 범위",
      "공장용 건축물의 부속토지",
      "용도지역별 적용배율",
      "전용주거지역",
      "부설주차장 설치기준면적 이내의 토지",
      // NBL2611-V1-A — ③ 공지상태 별도합산의 호별 면적 한도 고지(`NBL_PTAX_VACANT_STATE_LIMIT_NOTICE`)가 기댄 문언.
      "최저보유차고면적기준의 1.5배에 해당하는 면적 이내의 토지",
      // NBL2611-B2 — ① 단서(`NBL.BUILDING_SITE_SEPARATE_AGG_PROVISO`): 재산세 분류 칸 혼재 고지서 안내가 기댄다.
      "사용승인(임시사용승인을 포함한다)을 받지 아니하고 사용 중인 건축물의 부속토지는 제외한다",
      // PSA-E1 — 허가 요건 절(`PROPERTY_SEPARATE.BUILDING_PERMIT_101`): 사용승인 절과 짝인 앞 절.
      "허가 등을 받아야 할 건축물로서 허가 등을 받지 아니한 건축물",
    ],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_DECREE.SEPARATE_TAXATION_LAND",
    citation: "지방세법 시행령 §102",
    keywords: [
      "분리과세대상 토지의 범위",
      "공장입지기준면적",
      "전ㆍ답ㆍ과수원",
      "목장용지",
      // PSE-E1 — 면적 한도(`PROPERTY.SEPARATE.STANDARD_FACTORY`·`LOW_RATE_LIVESTOCK`): 한도 안만 분리과세, 밖은 종합합산 이관.
      "공장입지기준면적 범위의 토지",
      "계산한 토지면적의 범위에서 소유하는 토지",
    ],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_DECREE.DEMOLISHED_BUILDING_LAND",
    citation: "지방세법 시행령 §103의2",
    keywords: [
      "철거ㆍ멸실된 건축물 또는 주택의 범위",
      "1년이 지나지 않은 건축물 또는 주택의 부속토지",
      "용도지역별 적용배율",
      "빈집정비사업",
      // NBL2611-V1-A · E3-⑤ E3f-1a — 철거ㆍ멸실 근거의 한시 지위 고지(`demolishedStatusNotice` 현행 시행본 문구 · 빈집 셀 고지)가 기댄 빈집 3년·건축 용도 외 사용 제외·허가 요건 문언.
      "3년이 지나지 않은 빈집의 부속토지",
      "건축물 또는 주택의 건축을 위한 용도 외의 다른 용도로 사용하는 부속토지는 제외한다",
      "허가 등을 받지 않은 건축물 또는 주택",
      // E3-⑤ E3f-3 — 2호 단서(빈집정비 철거 빈집 부속토지의 국가 등 공용·공공용 사용 기간 포함 — `PTAX_BASIS_DEMOLISHED_VACANT_HOUSE_PUBLIC_USE`). 2024.5.28. 시행본 괄호형은 연혁이라 현행 문언만 검증한다.
      "국가, 지방자치단체 또는 지방자치단체조합이 1년 이상 공용 또는 공공용으로 사용",
      "그 공용 또는 공공용으로 사용하는 기간 동안의 그 부속토지는 포함한다",
      "법 제109조제2항 단서에 따른 재산세의 부과대상이 되는 부속토지",
      // PSA-E1 — 재산세 별도합산 철거 요건 leaf(`property-separate-requirements.ts`)가 기댄 본문 후단(사용승인)·1호 후단(면적 범위)·2호(빈집 철거일) 문언.
      "사용승인을 받아야 하는 건축물 또는 주택으로서 사용승인(임시사용승인을 포함한다)을 받지 않은 건축물 또는 주택의 부속토지는 제외한다",
      "철거ㆍ멸실되기 전 건축물의 바닥면적",
      "빈집이 사실상 철거된 날",
    ],
    keywordMode: "ALL",
  },
  {
    // PSA-E4 — 토지 세부담상한의 직전 연도 세액상당액(`PROPERTY_LAND_SPLIT.CAP_BASIS`): 과세대상 구분 변경 시 해당 연도 구분을 직전 연도에도 적용(다목).
    id: "LOCAL_DECREE.TAX_CAP_METHOD",
    citation: "지방세법 시행령 §118",
    keywords: [
      "세 부담 상한의 계산방법",
      "과세대상 구분의 변경이 있는 경우",
      "해당 연도의 과세대상의 구분이 직전 연도 과세대상 토지에 적용되는 것으로 보아",
    ],
    keywordMode: "ALL",
  },
  {
    id: "LOCAL_DECREE.HOUSE_APPURTENANT_LAND",
    citation: "지방세법 시행령 §105",
    keywords: [
      "주택 부속토지의 범위 산정",
      "경계가 명백하지 아니한 경우",
      "바닥면적의 10배",
    ],
    keywordMode: "ALL",
  },

  // ── 재산세 과세표준 ────────────────────────────────────────────────
  {
    id: "LOCAL_DECREE.FAIR_MARKET_RATIO",
    citation: "지방세법 시행령 §109",
    keywords: [
      "공정시장가액비율",
      "토지 및 건축물: 시가표준액의 100분의 70",
      "주택: 시가표준액의 100분의 60",
    ],
    keywordMode: "ALL",
  },

  // ── 사치성 재산 중과 (법 §13⑤ 위임) ────────────────────────────────
  {
    // 복합 인용 "지방세법 §111①1호 다목(2), 시행령 §28" 뒤쪽 조문
    id: "LOCAL_DECREE.LUXURY_PROPERTY_SCOPE",
    citation: "지방세법 시행령 §28",
    keywords: [
      "골프장 등의 범위와 적용기준",
      "고급주택",
      "고급오락장",
      "331제곱미터",
      "662제곱미터",
    ],
    keywordMode: "ALL",
  },

  // ── 과세자료 통보 ──────────────────────────────────────────────────
  {
    id: "LOCAL_DECREE.TAX_DATA_ANALYSIS_UNIT",
    citation: "지방세법 시행령 §119의2",
    keywords: [
      "부동산 과세자료분석 전담기구",
      "재산세 및 종합부동산세 과세자료",
      "납세의무자별 과세표준과 세액",
    ],
    keywordMode: "ALL",
  },
];
