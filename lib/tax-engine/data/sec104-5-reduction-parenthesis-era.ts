/**
 * 「소득세법」 제104조 제5항 본문 **감면 괄호**의 적용 시점 (정적 상수).
 *
 * > (이 법 또는 다른 조세에 관한 법률에 따른 양도소득세 감면액이 있는 경우에는 해당 감면세액을 차감한 세액이 더 큰 경우의 산출세액을 말한다)
 *
 * 적용 기준은 **양도일**이다 — 법률 제16834호(2019.12.31.) 부칙 제2조②가 «이 법 중 양도소득세에 관한 개정규정은 이 법 시행 이후 양도하는 분부터
 * 적용한다»로 정한다(KoreanLaw 부칙 원문 실독, 2026-10-16). 제1조 단서(2020.7.1.)는 §94①4호다목·§108뿐이라 무관하다.
 *
 * | 양도일 | 감면 괄호 | 근거 |
 * |---|---|---|
 * | ~ 2019-12-31 | **없음** — 2019.1.1. 시행본(제16104호) §104⑤ 본문에 괄호가 없다. 산출세액을 **감면 전 MAX**로 정한 뒤 그 세액에 감면을 적용한다 | `get_law_text` efYd=20190101 |
 * | 2020-01-01 ~ | 적용 — **감면 차감 후** 더 큰 쪽의 산출세액 | 제16834호 부칙 제2조② |
 *
 * 계획서: `docs/02-design/features/transfer-104-5-adjacent-era-gates.review.md` §1.1 · §2.2
 */
export const SEC104_5_REDUCTION_PARENTHESIS_FROM = "2020-01-01";

/**
 * 과세기간(=양도연도)으로 본 적용 여부. 2019년 과세기간의 양도는 전부 2020.1.1. 전이다.
 * 다건 합산 엔진(`input.taxYear`)과 크로스 계산기(`taxYear`)는 양도일이 아니라 과세기간만 가진다.
 */
export function isSec104_5ReductionParenthesisInForceForTaxYear(taxYear: number): boolean {
  return taxYear >= Number(SEC104_5_REDUCTION_PARENTHESIS_FROM.slice(0, 4));
}
