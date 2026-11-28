/**
 * 국외자산 결과 카드 공용 — 「외화 × 환율 = 원화」 산식 문자열
 *
 * 주식(`ForeignStockResultCard`)과 부동산 결과 카드가 함께 쓴다(계획서 §11 U0).
 */

import { FX_MAX_DECIMALS } from "@/lib/tax-engine/fx-krw";

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

/**
 * 환율 표시 — 소수 **4자리까지**(`FX_MAX_DECIMALS`). `toLocaleString`의 기본 최대 3자리로는 1300.1234가 «1,300.123»으로 잘려
 * 입력과 다르게 보인다(사용자가 «외화 × 환율 = 원화»를 계산기로 검산하면 어긋난다). 정수 환율은 소수점 없이 그대로 나온다.
 * 환율이 없으면(국외주식 분할 수령은 양도일 환율 칸이 없고, 금액 0인 필요경비는 적용 환율도 없다) 「—」.
 */
export function fmtRate(rate: number | undefined): string {
  if (rate === undefined) return "—";
  return rate.toLocaleString("ko-KR", { maximumFractionDigits: FX_MAX_DECIMALS });
}

/**
 * 「USD 40,000 × 1,250 = 50,000,000」 — 외화 금액이 없으면(이 echo가 생기기 전 이력) 「—」.
 * 외화는 센트·소수 단가가 있어 소수 4자리까지 보인다(1주당 외화 × 주식 수의 부동소수 잔여는 이 자리에서 사라진다).
 */
export function fxFormula(foreign: number | undefined, currency: string | undefined, rate: number | undefined, krw: number): string {
  const foreignText =
    foreign === undefined
      ? "—"
      : `${currency && currency !== "OTHER" ? `${currency} ` : ""}${foreign.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}`;
  return `${foreignText} × ${fmtRate(rate)} = ${fmt(krw)}`;
}
