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

  // ── 취득세 주택 중과 (법 §13의2 위임) ───────────────────────────────
  {
    id: "LOCAL_DECREE.HOUSE_SURCHARGE_EXCEPTION",
    citation: "지방세법 시행령 §28의2",
    keywords: [
      "주택 유상거래 취득 중과세의 예외",
      "중과세 대상으로 보지 않는다",
      "공공주택사업자",
      "노인복지주택",
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
    keywords: ["주택 수의 산정방법", "조합원입주권", "주택분양권", "오피스텔"],
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
