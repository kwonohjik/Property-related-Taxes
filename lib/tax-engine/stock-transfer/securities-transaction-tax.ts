/**
 * 증권거래세 정보성 산정 모듈
 *
 * 증권거래세는 양도소득세와 별도 납부 의무이므로 참고용으로만 표시.
 * 실제 납부 방식(원천징수/자진신고)은 시장·계좌 유형에 따라 다름.
 *
 * Phase 2 (2026-06-11):
 *   양도일(거래일) 기준 연도별 탄력세율 자동 적용 — 2021-01-01 이후 전 구간.
 *   세율 매트릭스 단일 진실: lib/tax-engine/data/securities-transaction-tax-rates.ts
 *   (전 구간 KoreanLaw applicable_law 축자 검증 — 상세 출처는 data 파일 헤더)
 *
 * 법령 근거 (KoreanLaw MCP 검증 2026-06-11):
 *   과세대상  — 증권거래세법 §2 본문 (주권·지분의 양도 전부)
 *   비과세    — 법 §2 단서 1호 (외국증권시장 상장 주권 — 해외주식 제외 근거)
 *   기본세율  — 법 §8① 본칙 (35/10000, 비상장 장외; 2021~2022 한시 43/10000 단서)
 *   위임      — 법 §8② (증권시장 거래분 대통령령 위임)
 *   시장 차등 — 시행령 §5 각호 (현행 = 영 제36001호, 2025.12.31 공포, 2026.1.1 시행)
 *               코스피 §5 1호 / 코넥스 §5 2호 / 코스닥·K-OTC §5 3호 가·나목
 *   농특세    — 농특세법 §5①5호 (1만분의 15, 코스피만 — 전 구간 불변)
 *              비과세 체인: §4 7호 본문 → 단서 + 시행령 §4③ (유가증권시장만 과세.
 *              단서의 "영의 세율" 문구가 2025 코스피 영세율 구간의 농특세 과세 근거)
 *   과세표준  — 법 §7①1·2호 (양도가액; 저가양도 의제는 정보성 범위 외)
 *
 * safeMultiply 불요 근거:
 *   양도가액 상한 1조원 가정 시 1e12 × 35 = 3.5e13 < Number.MAX_SAFE_INTEGER(9e15)
 *   → BigInt 불필요, Math.floor(price * num / den) 분수 정수연산으로 충분.
 *
 * PR-3 범위: 정보성 산출만. 납세의무·신고절차는 별도 도메인.
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import { STOCK_STX } from "../legal-codes/stock";
import {
  STX_RATE_PERIODS,
  STX_RATE_DEN,
  STX_AGRI_NUM_KOSPI,
  STX_CUTOFF_DATE,
  type StxRatePeriod,
} from "../data/securities-transaction-tax-rates";

// ============================================================
// 외부 공개 타입 — SecuritiesTaxParams (함수 시그니처 narrow)
// ============================================================

/**
 * 증권거래세 산출에 필요한 최소 파라미터.
 * 메인 엔진(ⓐⓑ)은 full StockTransferInput을 그대로 전달해도 구조적 타이핑으로 호환.
 * Step3 inline은 폼 파싱 3필드만 구성 — 기존 `as StockTransferInput` 캐스팅 hack 제거.
 */
export interface SecuritiesTaxParams {
  marketType: StockTransferInput["marketType"];
  isKOTCTrading: boolean;
  /**
   * 미제공 시 과거 거래일 경고 생략 (C-09 게이트 건너뜀).
   * API JSON 직렬화 후 Date 도달 보장은 호출 측 책임.
   */
  transferDate?: Date;
  /**
   * **증권시장 안에서 양도했는가** — 탄력세율의 전제다.
   *
   * 증권거래세법 §8②은 「… **증권시장에서 거래되는 주권에 한정하여** … 낮추거나 영으로 할 수
   * 있다」이고, 그 위임을 받은 시행령 §5는 각 호가 전부 「~시장에서 **양도되는** 주권」이다.
   * 농어촌특별세법 §5①5호도 「**증권시장에서 거래된** 증권의 양도가액」을 과세표준으로 한다.
   * ⇒ 증권시장 **밖** 양도면 시장 구분과 무관하게 법 §8① 본칙(1만분의 35)이고 농특세는 0이다.
   *
   * 🔑 축은 이미 있었는데 **여기까지 오지 않았다** — `isOnMarketTransaction`이 14계층 배선을
   *    마쳤고 `calcSecuritiesTransactionTax(input, …)`로 input 전체가 넘어오는데도
   *    구조분해가 3필드뿐이라, 값을 뒤집어도 결과 JSON이 **바이트 동일**이었다.
   *
   * @default true (기존 동작 호환 — 미제공이면 장내로 본다)
   */
  isOnMarketTransaction?: boolean;
}

// ============================================================
// 결과 타입 (설계 문서 확정안)
// ============================================================

export interface SecuritiesTransactionTaxResult {
  /** 증권거래세 = Math.floor(양도가액 × num / den) */
  securitiesTransactionTax: number;
  /** 농어촌특별세 (코스피만 — 농특세법 §5①5호 1만분의 15) */
  agriculturalTax: number;
  /** 합계 = 증권거래세 + 농어촌특별세 */
  totalTax: number;
  /** 적용 세율 분자 (예: 20) */
  appliedRateNum: number;
  /** 적용 세율 분모 (항상 10000) */
  appliedRateDen: number;
  /**
   * 농특세율 분자 (코스피: 15, 기타: 0).
   * UI에서 표시용 % 파생: (appliedAgriRateNum / 10000 * 100).toFixed(2)
   */
  appliedAgriRateNum: number;
  /** 법령 근거 문자열 (legal-codes 상수 조합) */
  rateReference: string;
  /**
   * 경고 문자열:
   *   C-06: "주권 양도 해당 시 증권거래세 별도 발생 — 시장 구분 확인 필요"
   *   A-30: 매트릭스 커버(2021-01-01) 미만 양도 — 당시 세율 미지원 안내
   */
  warning?: string;
  /** 항상 true — 납세의무 별도 확인 안내 */
  isInformational: true;
}

// ============================================================
// 계산 함수 (단일 진입점)
// ============================================================

/**
 * 증권거래세 정보성 산출
 *
 * 계산 흐름:
 *   1. other_asset → 0 + C-06 경고 (단정 금지 — §2 본문 기타자산에도 과세 가능)
 *   2. 양도일 기준 세율 구간 resolve (2021-01-01 미만 → 현행 fallback + 미지원 경고)
 *   3. 시장 분기: KOTC(unlisted+isKOTCTrading) → kospi → kosdaq → konex → unlisted
 *   4. 분수 정수연산: Math.floor(price × num / den)
 *
 * @param params  - 최소 파라미터 (SecuritiesTaxParams | StockTransferInput 모두 가능)
 * @param transferPrice - 양도가액 (원, 양수만 유의미; ≤ 0 시 전부 0)
 */
export function calcSecuritiesTransactionTax(
  params: SecuritiesTaxParams,
  transferPrice: number,
): SecuritiesTransactionTaxResult {
  const { marketType, isKOTCTrading, transferDate } = params;
  const isOnMarket = params.isOnMarketTransaction ?? true; // 3중 패턴 default

  // ── STEP 1: 기타자산 — 단정 금지, 경고 반환 ─────────────────────
  // 증권거래세법 §2 본문: "주권·지분의 양도 전부" 과세 대상.
  // other_asset 분류여도 실제 주권 양도이면 과세 가능.
  // 시장 구분이 없어 세율 단정 불가 → 0 반환 + C-06 경고.
  if (marketType === "other_asset") {
    return buildZeroResult(
      "주권 양도 해당 시 증권거래세 별도 발생 — 시장 구분 확인 필요",
    );
  }

  // ── STEP 2: transferPrice 음수·0 가드 ──────────────────────────
  if (transferPrice <= 0) {
    return buildZeroResult(undefined);
  }

  // ── STEP 3: 양도일 기준 세율 구간 resolve ───────────────────────
  const { period, cutoffWarning } = resolveStxRates(transferDate);

  // ── STEP 4: 시장 분기 — num·인용 선택 ──────────────────────────
  // 우선순위: K-OTC > kospi > kosdaq > konex > unlisted
  // (K-OTC는 marketType="unlisted"이므로 먼저 분기)
  let num: number;
  let agriNum = 0;
  let rateReference: string;

  if (isKOTCTrading && marketType === "unlisted") {
    // K-OTC(금융투자협회) — 시행령 §5 3호 나목 (코스닥과 동률)
    //
    // ⚠️ K-OTC는 증권시장 **밖**이지만 시행령 §5 3호 나목이 **별도로** 세율을 준다 —
    //    아래 장외 분기를 타지 않는다. 그래서 이 분기가 장외 게이트보다 앞에 있다.
    num = period.kosdaqKotcNum;
    rateReference = `${STOCK_STX.STX_DECREE_5_3_NA_KOTC} ${period.refSuffix}`;
  } else if (!isOnMarket) {
    /**
     * 증권시장 **밖** 양도 — 시장 구분과 무관하게 법 §8① 본칙, 농특세 0.
     *
     * 탄력세율(시행령 §5)의 위임 근거인 법 §8②이 「**증권시장에서 거래되는 주권에 한정하여**」로
     * 스스로 범위를 그었고, 시행령 §5 각 호도 「~시장에서 **양도되는** 주권」이다.
     * 농특세도 「**증권시장에서 거래된** 증권의 양도가액」이 과세표준이라(농특세법 §5①5호)
     * 장외에는 붙지 않는다.
     */
    num = period.unlistedNum;
    rateReference = period.unlistedRef;
  } else if (marketType === "kospi") {
    // 유가증권시장 — 시행령 §5 1호 + 농특세법 §5①5호 (15/10000, 전 구간)
    num = period.kospiNum;
    agriNum = STX_AGRI_NUM_KOSPI;
    rateReference = [
      STOCK_STX.STX_LAW_8_2_MARKET_DELEGATION,
      `${STOCK_STX.STX_DECREE_5_1_KOSPI} ${period.refSuffix}`,
      STOCK_STX.AGRI_LAW_5_1_5_KOSPI_RATE,
    ].join(" + ");
  } else if (marketType === "kosdaq") {
    // 코스닥 — 시행령 §5 3호 가목
    num = period.kosdaqKotcNum;
    rateReference = `${STOCK_STX.STX_DECREE_5_3_GA_KOSDAQ} ${period.refSuffix}`;
  } else if (marketType === "konex") {
    // 코넥스 — 시행령 §5 2호 (10/10000, 전 구간 불변)
    num = period.konexNum;
    rateReference = STOCK_STX.STX_DECREE_5_2_KONEX;
  } else {
    // 비상장 장외 — 법 §8① (2021~2022 한시 43/10000 단서 포함)
    num = period.unlistedNum;
    rateReference = period.unlistedRef;
  }

  // ── STEP 5: 분수 정수연산 ──────────────────────────────────────
  // 부동소수 곱(0.0020 등) 금지 — memory feedback_applyrate_fractional_rate_one_won_error
  // 양도가액 상한 1조 기준: 1e12 × 43 = 4.3e13 < Number.MAX_SAFE_INTEGER(9e15) → BigInt 불필요
  const securitiesTransactionTax = Math.floor(transferPrice * num / STX_RATE_DEN);
  const agriculturalTax = agriNum > 0
    ? Math.floor(transferPrice * agriNum / STX_RATE_DEN)
    : 0;
  const totalTax = securitiesTransactionTax + agriculturalTax;

  return {
    securitiesTransactionTax,
    agriculturalTax,
    totalTax,
    appliedRateNum: num,
    appliedRateDen: STX_RATE_DEN,
    appliedAgriRateNum: agriNum,
    rateReference,
    warning: cutoffWarning ? STOCK_STX.WARNING_UNSUPPORTED_PERIOD : undefined,
    isInformational: true,
  };
}

// ============================================================
// 내부 — 양도일 기준 세율 구간 resolve
// ============================================================

/**
 * 양도일 → 세율 구간 매칭.
 *
 *   1. transferDate 미제공 → 현행 구간 + 경고 없음 (Step3 inline 양도일 미입력 호환 — A-31)
 *   2. < STX_CUTOFF_DATE(2021-01-01) → 현행 구간 fallback + 미지원 경고 (A-30)
 *   3. 구간 매칭 [from, to] 경계 포함 (anchor A-26~29로 고정)
 *
 * Date 비교는 new Date("YYYY-MM-DD") UTC ISO 자정 파싱끼리만 — data 파일 헤더 규칙.
 */
function resolveStxRates(transferDate?: Date): {
  period: StxRatePeriod;
  cutoffWarning: boolean;
} {
  const current = STX_RATE_PERIODS[STX_RATE_PERIODS.length - 1];

  if (transferDate === undefined || !(transferDate instanceof Date)) {
    return { period: current, cutoffWarning: false };
  }
  if (transferDate < new Date(STX_CUTOFF_DATE)) {
    return { period: current, cutoffWarning: true };
  }

  // from 역순 매칭 — 구간이 연속(데이터 가드 보장)이므로 to 상한 비교 불필요.
  // 시간 성분이 있는 Date(예: 2022-12-31T10:00)도 [from, next.from) 사이로 안전 매칭.
  for (let i = STX_RATE_PERIODS.length - 1; i >= 0; i--) {
    if (transferDate >= new Date(STX_RATE_PERIODS[i].from)) {
      return { period: STX_RATE_PERIODS[i], cutoffWarning: false };
    }
  }
  // cutoff 가드를 통과했으므로 이론상 도달 불가 — 방어적 현행 fallback + 경고
  return { period: current, cutoffWarning: true };
}

// ============================================================
// 다자산 합산 echo (Phase 2 — B-E1)
// ============================================================

/** 다자산 합산용 증권거래세 합계 (StockTransferAggregateResult.totalSecuritiesTransactionTax) */
export interface SecuritiesTransactionTaxTotal {
  securitiesTransactionTax: number;
  agriculturalTax: number;
  totalTax: number;
}

/**
 * 종목별 증권거래세 echo 단순합 — 두 합산 모드(each_item·aggregate) 공통.
 * 이미 floor된 종목별 값의 단순합 — 안분·잔액흡수 비해당.
 * 비과세 종목 echo도 포함 (증권거래세는 양도세 비과세와 독립).
 */
export function sumSecuritiesTransactionTax(
  items: ReadonlyArray<{ securitiesTransactionTax?: SecuritiesTransactionTaxResult }>,
): SecuritiesTransactionTaxTotal {
  return items.reduce<SecuritiesTransactionTaxTotal>(
    (acc, r) => ({
      securitiesTransactionTax:
        acc.securitiesTransactionTax + (r.securitiesTransactionTax?.securitiesTransactionTax ?? 0),
      agriculturalTax: acc.agriculturalTax + (r.securitiesTransactionTax?.agriculturalTax ?? 0),
      totalTax: acc.totalTax + (r.securitiesTransactionTax?.totalTax ?? 0),
    }),
    { securitiesTransactionTax: 0, agriculturalTax: 0, totalTax: 0 },
  );
}

// ============================================================
// 내부 헬퍼
// ============================================================

/** 0 반환 — 기타자산 경고 또는 음수·0 가드 */
function buildZeroResult(warning: string | undefined): SecuritiesTransactionTaxResult {
  return {
    securitiesTransactionTax: 0,
    agriculturalTax: 0,
    totalTax: 0,
    appliedRateNum: 0,
    appliedRateDen: 10000,
    appliedAgriRateNum: 0,
    rateReference: warning
      // 기타자산: §2 본문 참조
      ? "증권거래세법 §2 본문 (기타자산 분류 무관 — 주권 양도 시 해당 시장 세율 확인)"
      // 음수·0: 과세표준 없음
      : "과세표준 0 이하 — 증권거래세 미발생",
    warning,
    isInformational: true,
  };
}
