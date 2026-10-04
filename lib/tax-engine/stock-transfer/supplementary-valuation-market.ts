/**
 * 비상장 보충평가(법 §99①4 → 영 §165④)로 기준시가를 구하는 시장 — 단일 소스
 *
 * 영 §165⑧1호: 법 §94①4호 나목~라목 «주식등»(기타자산 주식 — 다목 과점주주 · 라목 부동산과다보유법인)은
 * 법 §99①3·4에 따라 평가한다. 이 앱의 기타자산(`other_asset`) 화면은 순손익·순자산 보충평가 입력만 받고
 * (`EstimatedUnlistedBlock` — ⑧·⑫도 그 값을 필수로 요구한다) 상장 종가평균 입력은 받지 않는다 ⇒ 비상장과 같은 경로다.
 *
 * 엔진(`stock-acquisition-basis.ts`)·④(`stock-transfer-tax-api.ts` 토글·결산서 어댑터)·장부분실 leaf
 * (`isBookLostAtAcquisition`)·⑤ Step 2가 각자 `=== "unlisted"`를 적으면 한 층만 어긋나도 «입력은 받았는데
 * 엔진이 버리는» 결함이 된다(기타자산 환산 취득가액 0 — 계획서 §1). **이 함수 하나**를 쓴다.
 *
 * 범위 밖: 법인이 상장사인 기타자산(§99①3 종가평균)은 미지원이다 — 화면에 상장·비상장 구분 입력이 없고
 * 실무 사례도 없다(2026-10-04 사용자 확인). 계획서 §8 S-1d.
 *
 * 계획서: docs/00-pm/stock-other-asset-estimated-supplementary-valuation.plan.md
 */

export function usesUnlistedSupplementaryValuation(marketType: string | undefined): boolean {
  return marketType === "unlisted" || marketType === "other_asset";
}
