/**
 * listed-stock-valuation.types — 상장주식 평가조서(갑·을) 100% 재현 전용 타입.
 *
 * 본 파일은 inheritance-gift.types.ts 800줄 정책 회피를 위한 sibling 분리.
 * inheritance-gift.types.ts 의 EstateItem 이 본 파일 타입들을 import해 사용.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md
 * Design: docs/02-design/features/listed-stock-besshi-form-replica.engine.design.md
 * 법령: 상증법 §63①1가·§63②3호·§63③ · 상증령 §52의2·§53④·§53⑧ · 상증규 §18②
 */

// ============================================================
// 갑지 1.평가대상 상장법인
// ============================================================

/** 갑지 ⑤ 평가대상 주식 종류 */
export type ListedStockClass = "common" | "preferred";

// ============================================================
// §63③ 최대주주 할증
// ============================================================

/** §53④ 기업 규모 */
export type ListedCompanySize = "small" | "medium" | "large";

/**
 * §53⑧ 1~9호 할증 배제 사유 + 중소·중견 자동 배제(smb_med) + 미적용(none).
 * 라벨 문구 단일 출처: lib/tax-engine/data/listed-premium-exclusion-labels.ts
 */
export type ListedPremiumExclusionReason =
  | "none"
  | "smb_med"
  | "art53_8_1"
  | "art53_8_2"
  | "art53_8_3"
  | "art53_8_4"
  | "art53_8_5"
  | "art53_8_6"
  | "art53_8_7"
  | "art53_8_8"
  | "art53_8_9";

// ============================================================
// 을지 일자별 종가 4그룹 (NO 1~31 × 4그룹)
// ============================================================

export interface ListedStockDailyRow {
  /** 1~31 */
  no: number;
  /** ISO YYYY-MM-DD */
  date: string;
  /** 표시용 "MM월 DD일" */
  monthDay: string;
  /** 종가(원) — 영업일·closing 있을 때만 숫자, 그 외 null */
  closing: number | null;
  /** 종가 셀 라벨: "" | "일요일" | "토요일" | "휴무일" | "종가 없음" | "기간외" | "상장전" */
  label: string;
}

/**
 * 을지 표 4그룹 (이미지 5: 좌측 beforeM1+beforeM2 5열×31행, 우측 afterM1+afterM2 5열×31행).
 *
 * NO 1 = 평가기준일 D (beforeM1·afterM1 양쪽 모두 D 표시 + closing 양쪽 카운트).
 * NO 31 = D ± 30일 (M1) / D ± 31일 시작 30일 끝(M2).
 *
 * 일수·소계·합계·평균은 좌·우 양쪽 closing 합 기준 (D 중복 카운트 포함).
 */
export interface ListedStockMonthGroups {
  beforeM1: ListedStockDailyRow[];
  beforeM2: ListedStockDailyRow[];
  afterM1: ListedStockDailyRow[];
  afterM2: ListedStockDailyRow[];
  /** 좌측 closing 합 = beforeM1+beforeM2 closing 누계 */
  beforeSubtotal: number;
  /** 우측 closing 합 */
  afterSubtotal: number;
  /** 거래일수 (좌·우 closing 있는 행 합) */
  tradingDays: number;
  /** beforeSubtotal + afterSubtotal */
  closingSum: number;
  /** Math.floor(closingSum / tradingDays) — 갑지 ⑨·⑱ */
  closingAverage: number;
}

// ============================================================
// 갑지 echo data (evaluateListedStock result.besshiData)
// ============================================================

/** 갑지 page1 라벨/메타 — 입력값 그대로 echo */
export interface ListedStockBesshiPage1Meta {
  companyName?: string;
  representative?: string;
  companyAddress?: string;
  /** 갑지 ④ 평가기준일 (ISO) — orchestrator context에서 결정 */
  valuationDate: string;
  /** 갑지 ⑤ */
  stockClass: ListedStockClass;
  /** 갑지 ⑥ */
  listingDate?: string;
  /** 갑지 ⑦ */
  capitalIncreaseDate?: string;
  /** 갑지 ⑧ */
  mergerDate?: string;
  /** 3.미상장주식 섹션 활성 여부 (⑪~⑰ 표시 토글) */
  isUnlistedShareSection: boolean;
}

/** 갑지 page1 산식 결과값 */
export interface ListedStockBesshiPage1Values {
  /** ⑨ = ⑱ */
  closingAvg: number;
  /** ⑩ = floor(⑨ × (1 + premiumRate)) */
  perShareMajorShareholder: number;
  /** ⑪ */
  priorDividendRate?: number;
  /** 1주당 액면가 */
  faceValuePerShare?: number;
  /** ⑫ = floor(액면가 × ⑪) */
  priorDividendAmount?: number;
  /** ⑬ */
  dividendBaseDate?: string;
  /** ⑭ = differenceInDays(valuationDate, dividendBaseDate) */
  daysUntilDividendBase?: number;
  /** ⑮ = floor(⑫ × ⑭ / 365) */
  dividendDifference?: number;
  /** ⑯ = ⑨ − ⑮ */
  perShareValue?: number;
  /** ⑰ = floor(⑯ × (1 + premiumRate)) */
  perShareMajorShareholderUnlisted?: number;
  /** §63③ 적용 할증률 (0 또는 0.20) */
  majorShareholderRate: 0 | 0.2;
  /** §53⑧ 배제 사유 라벨 (premiumRate=0 이고 사유 있는 경우만) */
  premiumExclusionLabel?: string;
}

/** evaluateListedStock 결과에 echo되는 부표 데이터 단일 source */
export interface ListedStockBesshiData {
  page1: ListedStockBesshiPage1Meta;
  page1Values: ListedStockBesshiPage1Values;
  page2: ListedStockMonthGroups;
}

// ============================================================
// 헬퍼 상수
// ============================================================

/** 빈 4그룹 factory — 자동조회 응답 없을 때 echo */
export const EMPTY_LISTED_STOCK_MONTH_GROUPS: ListedStockMonthGroups = {
  beforeM1: [],
  beforeM2: [],
  afterM1: [],
  afterM2: [],
  beforeSubtotal: 0,
  afterSubtotal: 0,
  tradingDays: 0,
  closingSum: 0,
  closingAverage: 0,
};
