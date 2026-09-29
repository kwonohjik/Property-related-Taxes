/**
 * 다건 집계의 **자산별 세율** — 자산마다 그 양도일의 세율 행(E-14n).
 *
 * 세율 행은 `effective_date` 이하 최신 1건을 고른다(`preload_tax_rates` · `loadFallbackTransferRates`).
 * 연중에 시작하는 행(예: `surcharge:_default` 2022-05-10 · `special:house_count_exclusion` 2018-04-01)이
 * 있으므로 **한 날짜로 읽은 세율을 여러 양도일에 쓰면** 시작일 전 양도분이 그 행을 받는다.
 * 단건 route는 양도일로 읽는다 — 다건도 자산 단위 계산에는 같은 기준을 쓴다.
 *
 * 자산별 항목(§104①·⑦ 세율 · 중과 · 장특 · 감면 · 비과세)은 개정 부칙이 「이 법 시행 이후 양도하는
 * 분부터」로 정하므로 **양도일**의 규정을 따른다(예: 법률 제15225호 부칙 제2조② · 제17757호 부칙 제2조②).
 * 신고 단위 단계(§103 기본공제 · §104⑤1호 §55① 누진표)는 호출자가 넘긴 과세기간 세율을 그대로 쓴다
 * (제19196호 부칙 제14조 — §104⑤1호 등의 §55① 세율은 「과세기간」 기준 경과조치).
 *
 * 순수 함수 — DB 호출 없음.
 */
import type { TaxRatesMap } from "@/lib/db/tax-rates";

/** 양도일(`YYYY-MM-DD`) → 그 날짜로 읽은 세율. 키는 {@link rateDateKey}로 만든다. */
export type RatesByTransferDate = ReadonlyMap<string, TaxRatesMap>;

/**
 * 세율 조회 날짜 키 — `preloadTaxRates`·`loadFallbackTransferRates`가 RPC에 넘기는 문자열과 **같은 식**이다
 * (`toISOString()`의 날짜 부분). 식이 다르면 route가 만든 키를 엔진이 찾지 못한다.
 */
export function rateDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 자산의 양도일 세율. 맵이 없거나 그 날짜가 없으면 신고 단위 세율(`fallback`)을 쓴다(종전 동작). */
export function ratesForTransferDate(
  transferDate: Date,
  fallback: TaxRatesMap,
  byDate: RatesByTransferDate | undefined,
): TaxRatesMap {
  return byDate?.get(rateDateKey(transferDate)) ?? fallback;
}
