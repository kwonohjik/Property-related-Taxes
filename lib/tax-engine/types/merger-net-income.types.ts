/**
 * 합병 후 3년 미경과 합병법인 순손익액 계산 — 입력/결과 타입
 *
 * 법령·예규: 상증령 §56③(각 사업연도 주식수=종료일 발행주식총수),
 *   상증통 63-56…12 · 서서-1071(2004.7.13.) · 재재산-181(2020.2.18.)
 *   "합병전 각 사업연도 1주당 순손익액 = (합병법인 + 피합병법인 순손익액 합계) ÷ 합병후 발행주식총수.
 *    1년 미만 사업연도는 연환산하되, 합병일이 속한 피합병 사업연도가 1년 미만으로 합병후부터
 *    합산되는 경우에는 연환산하지 않는다."
 *
 * 설계: docs/02-design/features/unlisted-net-income-fiscal-year-change.engine.design.md §2
 */

/** 합병법인 전1/2/3년 사업연도 */
export interface MergerAcquirerYear {
  /** 해당 사업연도 종료일 현재 발행주식총수(>0). 합병 전 단독연도에 사용 */
  shares: number;
  /** 순손익액(총액, 음수 허용 — 결손 통산) */
  netIncome: number;
  /** 합병법인 사업연도 범위(피합병 안분 overlap 계산용) */
  startDate: Date;
  endDate: Date;
}

/** 피합병법인 사업연도(개수 가변 — 한 역년에 복수 사업연도가 걸칠 수 있음) */
export interface MergerTargetYear {
  /** 순손익액(총액, 음수 허용) */
  netIncome: number;
  startDate: Date;
  endDate: Date;
}

/** 합병 순손익 합산 컨텍스트 — UnlistedStockValuationInput.mergerContext */
export interface MergerNetIncomeContext {
  /** 합병등기일 */
  mergerRegistrationDate: Date;
  /** 합병법인 전1/2/3년 (인덱스 0=전1년 ×3, 1=전2년 ×2, 2=전3년 ×1) */
  acquirer: [MergerAcquirerYear, MergerAcquirerYear, MergerAcquirerYear];
  /** 피합병 전체 사업연도. 소멸·합병전 미존재 연도는 목록에 없음(overlap=0으로 자연 처리) */
  targetFiscalYears: MergerTargetYear[];
  /** 합병후 발행주식총수(§56③) */
  postMergerShares: number;
}

/** 연도별 합산 근거 echo (결과 표시·검증용) */
export interface MergerYearEcho {
  acquirerNetIncome: number; // 합병법인 순손익액
  targetApportioned: number; // 피합병 안분 합산액(Σ netIncome × overlap월수/12)
  combinedNetIncome: number; // 합산 순손익액(음수 통산)
  sharesUsed: number; // 적용 주식수(합병후총수 or 합병법인 당시)
  perShare: number; // 1주당 순손익액(floor)
}

/** computeMergerPerShareNetIncome 반환 */
export interface MergerNetIncomeResult {
  /** 연도별 1주당 순손익액 [전1년, 전2년, 전3년] → calcWeightedAvg3y 입력 */
  perShare: [number, number, number];
  /** 연도별 합산 순손익액 총액 [전1년, 전2년, 전3년] → 영업권 companyWeighted 입력 */
  combined: [number, number, number];
  breakdown: [MergerYearEcho, MergerYearEcho, MergerYearEcho];
}
