/**
 * §155⑳ 장기임대주택 보유자 **거주주택** 비과세 특례의 적용 자산 범위 — 단일 소스.
 *
 * ## 왜 필요한가
 *
 * 종전에는 이 술어가 ⑤에만 있었다(`AssetSectionExtras.tsx:28`
 * — `assetKind === "housing" || assetKind === "right_to_move_in"`). ⑧
 * (`transfer-tax-validate-rental-exception.ts`)과 ④(`transfer-tax-api-rental-housing.ts`)는
 * **자산 종류를 보지 않았다**.
 *
 * 그래서 주택 자산에서 특례를 켠 뒤 종류를 토지·일반건물·상가로 바꾸면 두 갈래로 갈렸다:
 *
 * - 임대주택 행이 **비어 있으면** → 「임대주택 정보를 1호 이상 입력하세요」로 계산이
 *   영구 차단된다. 그 입력 카드는 ⑤ 게이트 밖이라 **화면에 없다**(dead-end).
 * - 행이 **채워져 있으면** → 검증을 통과해 **주택이 아닌 자산에 §155⑳ 거주주택 비과세가
 *   적용된 payload**가 엔진까지 도달한다(세액 오류).
 *
 * ⇒ 술어를 여기 한 곳에 두고 ⑤·⑧·④가 **같은 것을 부른다**(3중 패턴,
 *   memory `feedback_mirror_pattern` · `feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ 자산 종류 전환 시 값 정리도 이 술어를 쓴다(`housing-flag-reset.ts`) — 다만
 *    정리만으로는 부족하다. stale sessionStorage·이력 복원분은 전환을 거치지 않으므로
 *    ⑧·④ 게이트가 정본이다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * 이 자산 종류에 §155⑳ 특례를 적용할 수 있는가.
 *
 * 「거주주택」이 대상이므로 주택과 조합원입주권만 해당한다 — 입주권은 §155⑳ 판정에서
 * 주택으로 취급되는 축이 있어 ⑤가 처음부터 함께 열어 두었다.
 */
export function isRentalHousingExceptionApplicable(
  assetKind: AssetForm["assetKind"],
): boolean {
  return assetKind === "housing" || assetKind === "right_to_move_in";
}
