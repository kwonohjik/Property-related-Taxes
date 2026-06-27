/**
 * 가상화폐(가상자산) §60② 평가 보조 — 일평균가액 평균 산정.
 *
 * 법령: 상증법 §65② → 상증령 §60②1호 (국세청장 고시 사업장: 평가기준일 전·이후 각 1개월
 *   동안 일평균가액의 평균액). 특금법 §2③ 가상자산. 2022.1.1. 이후 적용.
 *
 * 분리 사유: property-valuation.ts 비대화 방지 + 단위 테스트 용이 (예금 property-valuation-deposit.ts 동형).
 */

import type { EstateItem } from "./types/inheritance-gift.types";

/**
 * §60②1호 2단계: 거래일별 "일평균가액의 평균액"(P_d) 배열의 단순평균 → 1코인당 평가단가.
 *
 * 1단계(그 거래일에 코인을 거래하는 고시사업장들의 일평균가액 단순평균 → P_d)는 입력 P_d 배열에서
 * 이미 산정된 것으로 본다(모드B 입력 단위 = P_d). 엔진은 2단계(기간 평균)만 수행.
 *
 * @param dailyPrices 거래일별 일평균가액의 평균액(원) 배열
 * @returns 1코인당 평가단가(원, 원단위 절사). 빈 배열 → 0 (검증은 상위 Zod/validate가 차단).
 */
export function computeCryptoUnitPrice(dailyPrices: number[]): number {
  if (!dailyPrices || dailyPrices.length === 0) return 0;
  const sum = dailyPrices.reduce((a, b) => a + b, 0);
  return Math.floor(sum / dailyPrices.length); // 원단위 절사 (중간절사 정책)
}

/**
 * timeseries 모드 가상자산에 산정 단가(cryptoUnitPriceComputed)를 echo 주입.
 * lib/calc 입력빌드(buildInput/buildGiftTaxInput)·사이드바 추정 공용. (mirror-pattern: store 미러링 아님 — 빌드시 합성)
 */
export function injectCryptoUnitPriceIfTimeseries(item: EstateItem): EstateItem {
  if (item.category !== "crypto_asset") return item;
  const mode = item.cryptoValuationMode ?? "direct";
  if (mode !== "timeseries") return item;
  if (!item.cryptoDailyPrices || item.cryptoDailyPrices.length === 0) return item;
  return {
    ...item,
    cryptoUnitPriceComputed: computeCryptoUnitPrice(item.cryptoDailyPrices),
  };
}
