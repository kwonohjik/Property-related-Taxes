/**
 * 일괄양도 「양도가액 결정방식」의 **실효 값** — ⑤ 표시 · ⑧ 검증 · ④ 전송 공용 술어.
 *
 * ## 왜 파생이어야 하는가
 *
 * 증환지 증가분(`isReplotIncrement`)이 있으면 당초분·증가분은 **한 필지·한 계약**이라
 * 양도가액을 구분해 적을 수 없다. 유효한 것은 양도시 기준시가 안분(§166⑥ 단서)뿐이므로
 * ⑤는 결정방식 토글을 **숨기고** `apportioned`를 강제한다.
 *
 * ## 🔴 store 값은 그대로 남는다 (2026-09-07 재검증 H8)
 *
 * 강제는 파생일 뿐이라 `form.bundledSaleMode`에는 사용자가 미리 골라 둔 `"actual"`이 남고,
 * 토글이 숨겨져 **되돌릴 화면이 없다**. ⑤(`Step1`)와 ⑧(`transfer-tax-validate-asset`)는
 * 각자 같은 식을 인라인으로 갖고 있었지만 ④(`transfer-tax-api`)는 컴패니언 자산 페이로드에만
 * override를 걸고 **신고 단위 `bundledSaleMode`와 `primaryActualSalePrice`는 raw**로 보냈다.
 *
 * 그러면 한 요청 안에서 자산별 계산은 안분, 신고 단위 선언은 구분기재가 되어 서로 어긋나고,
 * 주 자산에는 안분되지 않은 계약서상 양도가액이 그대로 실린다.
 *
 * ⇒ 세 층이 **같은 함수**를 부른다. 인라인으로 복제하지 말 것.
 */

/** 증환지 증가분이 하나라도 있으면 결정방식은 `apportioned`로 강제된다. */
export function effectiveBundledSaleMode(form: {
  bundledSaleMode: "actual" | "apportioned";
  assets: { isReplotIncrement?: boolean }[];
}): "actual" | "apportioned" {
  return form.assets.some((a) => a.isReplotIncrement) ? "apportioned" : form.bundledSaleMode;
}
