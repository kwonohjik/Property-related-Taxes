/**
 * 국외자산 결과 카드 공용 — 「외화 × 환율 = 원화」 산식 문자열
 *
 * 주식(`ForeignStockResultCard`)과 부동산 결과 카드가 함께 쓴다(계획서 §11 U0).
 */

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

/**
 * 「USD 40,000 × 1,250 = 50,000,000」 — 외화 금액이 없으면(이 echo가 생기기 전 이력) 「—」.
 * 외화는 센트·소수 단가가 있어 소수 4자리까지 보인다(1주당 외화 × 주식 수의 부동소수 잔여는 이 자리에서 사라진다).
 */
export function fxFormula(foreign: number | undefined, currency: string | undefined, rate: number, krw: number): string {
  const foreignText =
    foreign === undefined
      ? "—"
      : `${currency && currency !== "OTHER" ? `${currency} ` : ""}${foreign.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}`;
  return `${foreignText} × ${fmt(rate)} = ${fmt(krw)}`;
}
