/**
 * 증여세 메인 엔진 공유 헬퍼·상수·옵션 타입
 *
 * 800줄 정책으로 gift-tax.ts에서 분리 (2026-06-26).
 * gift-tax.ts(메인 calcGiftTax) ↔ gift-tax-two-stream.ts(calcGiftTaxTwoStream) 공용.
 * gift-tax.ts가 GiftTaxEngineOptions를 re-export하므로 기존 import 경로 무변경.
 */

import type { TaxBracket } from "./types";
import type { GiftTaxResult } from "./types/inheritance-gift.types";

/** 증여세 과세표준 최소값 (§55 단서) */
export const TAX_BASE_MIN = 500_000;

export interface GiftTaxEngineOptions {
  brackets?: TaxBracket[];
  /** @deprecated 미사용 */ foreignPropertyRatio?: number;
  /** 내부 전용(calcGiftTaxWithDonorPaidTax만). partialResult에 합체 → buildBesshi10Rows가 donorPaidTax 참조. 외부 세팅 금지. */
  _echoGrossUp?: GiftTaxResult["donorPaidTaxGrossUp"];
}

/** 세율 구간 라벨 (⑥ 표시용) */
export function formatBracketRate(taxBase: number, brackets: TaxBracket[]): string {
  for (const b of brackets) {
    if (taxBase <= 0) return "0%";
    if (b.max === null || taxBase <= b.max) {
      return `${(b.rate * 100).toFixed(0)}%`;
    }
  }
  return "—";
}
