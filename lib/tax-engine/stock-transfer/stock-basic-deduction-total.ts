/**
 * 합산 기본공제 총액 — **표시 계층 단일 정본** (소득세법 §103①)
 *
 * 기본공제는 그룹마다 연 250만원이 **따로** 붙는다:
 *   · §103①1호 — 부동산·기타자산 그룹
 *   · §103①2호 — 주식 그룹
 * 엔진 `totalTaxBase`는 **두 그룹 공제를 모두 차감한** 값이므로, 화면이 주식 그룹만 더하면
 * 「양도소득금액 − 기본공제 = 과세표준」 항등식이 깨진다.
 *
 * 🔑 종전에는 요약카드 tfoot·사이드바가 `byGroup.stock`만 읽고, 별지 제84호서식 20행은
 *    두 그룹을 더해 **같은 화면 안에서 값이 갈렸다**. 도달 범위도 「기타자산을 골랐을 때」보다
 *    넓다 — §94②(`stock-classification.ts`) 강제 분류로 kospi·unlisted 종목이라도
 *    과점주주·부동산과다보유 플래그만 켜면 같은 그룹으로 넘어간다.
 */
export function sumBasicDeductionByGroup(byGroup: {
  stock: number;
  real_estate_and_other_asset: number;
}): number {
  return byGroup.stock + byGroup.real_estate_and_other_asset;
}
