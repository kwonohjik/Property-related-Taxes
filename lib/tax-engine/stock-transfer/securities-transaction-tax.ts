/**
 * 증권거래세 정보성 산정 모듈
 *
 * 증권거래세는 양도소득세와 별도 납부 의무이므로 참고용으로만 표시.
 * 실제 납부 방식(원천징수/자진신고)은 시장·계좌 유형에 따라 다름.
 *
 * 법령 근거:
 *   - 증권거래세법 §3 — 납세의무자
 *   - 증권거래세법 §8 — 세율
 *   - 증권거래세법 §8①1 — 코스피: 0.05% (농어촌특별세 0.15% 포함 0.20%)
 *   - 증권거래세법 §8①2 — 코스닥: 0.15% (2025년 기준)
 *   - 증권거래세법 §8①3 — 코넥스: 0.10%
 *   - 증권거래세법 §8①4 — 비상장: 0.35%
 *   - K-OTC: 증권거래세법 §8①2 준용 → 0.15% (한국금융투자협회 운영 OTC)
 *   - 조특법 §104의4 — ATS 상장주식 = 증권시장 거래 의제
 *
 * 주의: 2025년 세율 기준. 연도별 세율 변경 시 이 파일 갱신 필요.
 *
 * PR-3 범위: 정보성 산출만. 납세의무·신고절차는 별도 도메인.
 */

import type { StockTransferInput } from "./types/stock-transfer.types";

// ============================================================
// 시장별 증권거래세율 (2025년 기준)
// ============================================================

/**
 * 코스피 증권거래세율 (증권거래세법 §8①1)
 * 농어촌특별세 0.15% 포함 합계 0.20% → 증권거래세분만 0.05%
 */
const STX_RATE_KOSPI = 0.0005 as const;        // 0.05%

/**
 * 코스다 증권거래세율 (증권거래세법 §8①2)
 */
const STX_RATE_KOSDAQ = 0.0015 as const;       // 0.15%

/**
 * 코넥스 증권거래세율 (증권거래세법 §8①3)
 */
const STX_RATE_KONEX = 0.0010 as const;        // 0.10%

/**
 * 비상장 증권거래세율 (증권거래세법 §8①4)
 */
const STX_RATE_UNLISTED = 0.0035 as const;     // 0.35%

/**
 * K-OTC 증권거래세율 (비상장에 준하나 한국금융투자협회 운영 OTC — 0.15%)
 */
const STX_RATE_KOTC = 0.0015 as const;         // 0.15%

/**
 * 농어촌특별세율 (코스피에만 부과 — 농어촌특별세법 §5①1호)
 */
const AGRI_TAX_RATE_KOSPI = 0.0015 as const;   // 0.15%

// ============================================================
// 결과 타입
// ============================================================

export interface SecuritiesTransactionTaxResult {
  /** 증권거래세 (양도가액 × 세율) */
  securitiesTransactionTax: number;
  /** 농어촌특별세 (코스피 한정) */
  agriculturalTax: number;
  /** 합계 */
  totalTax: number;
  /** 적용 세율 */
  appliedRate: number;
  /** 농어촌특별세율 (코스피: 0.15%, 기타: 0) */
  appliedAgriRate: number;
  /** 세율 근거 */
  rateReference: string;
  /** 정보성 여부 (항상 true — 납세의무 확인 필요) */
  isInformational: true;
}

// ============================================================
// 계산 함수
// ============================================================

/**
 * 증권거래세 정보성 산출
 *
 * 양도가액 기준 시장별 세율 적용.
 * 기타자산(§94①4)은 증권거래세 과세 대상 아님 → rate: 0 반환.
 */
export function calcSecuritiesTransactionTax(
  input: StockTransferInput,
  transferPrice: number,
): SecuritiesTransactionTaxResult {
  const { marketType, isKOTCTrading } = input;

  // 기타자산은 증권거래세 과세 대상 아님
  if (marketType === "other_asset") {
    return buildZeroResult("기타자산(§94①4)은 증권거래세 과세 대상 아님");
  }

  // K-OTC 거래는 별도 세율
  if (isKOTCTrading && marketType === "unlisted") {
    return buildResult(transferPrice, STX_RATE_KOTC, 0, "증권거래세법 §8①2 준용 (K-OTC 0.15%)");
  }

  switch (marketType) {
    case "kospi":
      // 코스피: 증권거래세 0.05% + 농어촌특별세 0.15%
      return buildResult(
        transferPrice,
        STX_RATE_KOSPI,
        AGRI_TAX_RATE_KOSPI,
        "증권거래세법 §8①1 (코스피 0.05%) + 농어촌특별세법 §5①1호 (0.15%)",
      );

    case "kosdaq":
      return buildResult(transferPrice, STX_RATE_KOSDAQ, 0, "증권거래세법 §8①2 (코스닥 0.15%)");

    case "konex":
      return buildResult(transferPrice, STX_RATE_KONEX, 0, "증권거래세법 §8①3 (코넥스 0.10%)");

    case "unlisted":
      return buildResult(transferPrice, STX_RATE_UNLISTED, 0, "증권거래세법 §8①4 (비상장 0.35%)");

    default:
      return buildZeroResult("해당 없음");
  }
}

function buildResult(
  transferPrice: number,
  rate: number,
  agriRate: number,
  rateReference: string,
): SecuritiesTransactionTaxResult {
  const securitiesTransactionTax = Math.floor(transferPrice * rate);
  const agriculturalTax = agriRate > 0 ? Math.floor(transferPrice * agriRate) : 0;
  const totalTax = securitiesTransactionTax + agriculturalTax;

  return {
    securitiesTransactionTax,
    agriculturalTax,
    totalTax,
    appliedRate: rate,
    appliedAgriRate: agriRate,
    rateReference,
    isInformational: true,
  };
}

function buildZeroResult(rateReference: string): SecuritiesTransactionTaxResult {
  return {
    securitiesTransactionTax: 0,
    agriculturalTax: 0,
    totalTax: 0,
    appliedRate: 0,
    appliedAgriRate: 0,
    rateReference,
    isInformational: true,
  };
}
