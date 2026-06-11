/**
 * 증권거래세 정보성 산정 모듈
 *
 * 증권거래세는 양도소득세와 별도 납부 의무이므로 참고용으로만 표시.
 * 실제 납부 방식(원천징수/자진신고)은 시장·계좌 유형에 따라 다름.
 *
 * Phase 1 스코프 (2026-06-11):
 *   현행(2026.01.02~) 세율 단일화 + 2경로 echo 통합 + 과거 거래일 경고.
 * Phase 2 (후속 PR):
 *   시행령 §5 연혁(efYd별) KoreanLaw 전수 검증 → 거래일 기준 연도 매트릭스.
 *
 * 법령 근거 (KoreanLaw MCP 검증 2026-06-11):
 *   과세대상  — 증권거래세법 §2 본문 (주권·지분의 양도 전부)
 *   비과세    — 법 §2 단서 1호 (외국증권시장 상장 주권 — 해외주식 제외 근거)
 *   기본세율  — 법 §8① 본칙 (35/10000, 비상장 장외)
 *   위임      — 법 §8② (증권시장 거래분 대통령령 위임)
 *   코스피    — 시행령 §5 1호 (5/10000, 2026.01.02 시행)
 *   코넥스    — 시행령 §5 2호 (10/10000)
 *   코스닥    — 시행령 §5 3호 가목 (20/10000)
 *   K-OTC    — 시행령 §5 3호 나목 (20/10000, 자본시장법 영 §178① 금융투자협회)
 *   농특세    — 농특세법 §5①5호 (1만분의 15, 코스피만)
 *              비과세 체인: §4 7호 본문 → 단서 + 시행령 §4③ (유가증권시장만 과세)
 *   과세표준  — 법 §7①1·2호 (양도가액; 저가양도 의제는 정보성 범위 외)
 *
 * safeMultiply 불요 근거:
 *   양도가액 상한 1조원 가정 시 1e12 × 35 = 3.5e13 < Number.MAX_SAFE_INTEGER(9e15)
 *   → BigInt 불필요, Math.floor(price * num / den) 분수 정수연산으로 충분.
 *
 * PR-3 범위: 정보성 산출만. 납세의무·신고절차는 별도 도메인.
 */

import type { StockTransferInput } from "./types/stock-transfer.types";
import { STOCK_STX, STX_RATE_MATRIX } from "../legal-codes/stock";

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
   *   C-09: "2026-01-02 시행 세율 적용 — 거래일 당시 시행령 §5 세율 확인 필요"
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
 *   2. 세율 결정: KOTC(unlisted+isKOTCTrading) → kospi → kosdaq → konex → unlisted
 *   3. 분수 정수연산: Math.floor(price × num / den)
 *   4. transferDate < 2026-01-02 → C-09 경고 부착
 *
 * @param params  - 최소 파라미터 (SecuritiesTaxParams | StockTransferInput 모두 가능)
 * @param transferPrice - 양도가액 (원, 양수만 유의미; ≤ 0 시 전부 0)
 */
export function calcSecuritiesTransactionTax(
  params: SecuritiesTaxParams,
  transferPrice: number,
): SecuritiesTransactionTaxResult {
  const { marketType, isKOTCTrading, transferDate } = params;

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

  // ── STEP 3: 세율 결정 ──────────────────────────────────────────
  // 우선순위: K-OTC > kospi > kosdaq > konex > unlisted
  // (K-OTC는 marketType="unlisted"이므로 먼저 분기)
  let rateKey: string;
  let rateReference: string;

  if (isKOTCTrading && marketType === "unlisted") {
    // K-OTC(금융투자협회) — 시행령 §5 3호 나목 (20/10000)
    rateKey = "kotc";
    rateReference = STOCK_STX.STX_DECREE_5_3_NA_KOTC;
  } else if (marketType === "kospi") {
    // 유가증권시장 — 시행령 §5 1호 (5/10000) + 농특세법 §5①5호 (15/10000)
    rateKey = "kospi";
    rateReference = [
      STOCK_STX.STX_LAW_8_2_MARKET_DELEGATION,
      STOCK_STX.STX_DECREE_5_1_KOSPI,
      STOCK_STX.AGRI_LAW_5_1_5_KOSPI_RATE,
    ].join(" + ");
  } else if (marketType === "kosdaq") {
    // 코스닥 — 시행령 §5 3호 가목 (20/10000)
    rateKey = "kosdaq";
    rateReference = STOCK_STX.STX_DECREE_5_3_GA_KOSDAQ;
  } else if (marketType === "konex") {
    // 코넥스 — 시행령 §5 2호 (10/10000)
    rateKey = "konex";
    rateReference = STOCK_STX.STX_DECREE_5_2_KONEX;
  } else {
    // 비상장 장외 — 법 §8① 본칙 (35/10000)
    rateKey = "unlisted";
    rateReference = STOCK_STX.STX_LAW_8_1_UNLISTED;
  }

  const rate = STX_RATE_MATRIX[rateKey];

  // ── STEP 4: 분수 정수연산 ──────────────────────────────────────
  // 부동소수 곱(0.0020 등) 금지 — memory feedback_applyrate_fractional_rate_one_won_error
  // 양도가액 상한 1조 기준: 1e12 × 35 = 3.5e13 < Number.MAX_SAFE_INTEGER(9e15) → BigInt 불필요
  const securitiesTransactionTax = Math.floor(transferPrice * rate.num / rate.den);
  const agriculturalTax = rate.agriNum > 0
    ? Math.floor(transferPrice * rate.agriNum / rate.den)
    : 0;
  const totalTax = securitiesTransactionTax + agriculturalTax;

  // ── STEP 5: 과거 거래일 경고 ────────────────────────────────────
  // 2026.01.02 시행 이전 거래는 해당 시점 시행령 §5 세율이 달랐을 수 있음
  // 경계: 2026-01-02 당일은 경고 없음 (STX-10)
  const RATE_CHANGE_DATE = new Date("2026-01-02");
  let warning: string | undefined;

  if (transferDate !== undefined && transferDate instanceof Date && transferDate < RATE_CHANGE_DATE) {
    warning = STOCK_STX.WARNING_PRIOR_DATE;
  }

  return {
    securitiesTransactionTax,
    agriculturalTax,
    totalTax,
    appliedRateNum: rate.num,
    appliedRateDen: rate.den,
    appliedAgriRateNum: rate.agriNum,
    rateReference,
    warning,
    isInformational: true,
  };
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
