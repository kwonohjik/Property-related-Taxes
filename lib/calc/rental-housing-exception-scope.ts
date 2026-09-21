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

/**
 * 이 자산 **위치**에서 §155⑳ 특례를 **선언**할 수 있는가 — ⑤·⑧ 공용 (P6-c-4).
 *
 * ## 🔴 종류 축과 왜 갈라 두는가
 *
 * 자산 **종류** 축(`isRentalHousingExceptionApplicable`)은 ④도 쓴다 — ④는 이미 primary만
 * 보므로 위치 축이 필요 없다. 둘을 한 술어로 묶으면 ④가 「자기 자신이 primary인가」를 묻는
 * 무의미한 인자를 받게 된다(P6-c-3에서 한 술어가 두 요구를 담아 깨진 것과 같은 층위).
 *
 * ## 🔴 실측 — 컴패니언에 켜면 차단만 되고 엔진엔 닿지 않았다
 *
 * 엔진 입력의 `rentalHousingException`은 `TransferTaxInput` **top-level 단일 객체**다
 * (`transfer.types.ts:1032`) — 자산별이 아니다. 그래서 ④는 단건·다건 모두 primary만 보낸다
 * (`transfer-tax-api.ts:696` · `multi-transfer-tax-api.ts:170`).
 *
 * 그런데 ⑤는 모든 주택 자산에 카드를 띄우고 ⑧은 **모든 자산**을 돌았다
 * (`transfer-tax-validate.ts:378` 루프). 실측:
 *
 * | 자산 | ⑤ 카드 | ⑧ 검증 | ④ 전송 | 엔진 도달 |
 * |---|---|---|---|---|
 * | primary (i=0) | ✅ | ✅ | ✅ | ✅ |
 * | 컴패니언 (i>0) | ✅ | ✅ **차단** | ✗ | ✗ |
 *
 * 컴패니언 자산에서 토글을 켜면 「임대주택 정보를 1호 이상 입력하세요」로 **계산이 막히는데**,
 * 다 채워도 ④가 보내지 않아 세액은 **한 푼도 달라지지 않는다**. 아무 효과 없는 입력 때문에
 * 계산이 차단된 셈이다.
 *
 * ⇒ 엔진 구조가 정본이므로 ④가 옳고 ⑤·⑧이 넓었다. 둘을 이 술어로 좁힌다.
 *
 * ⚠️ **값은 지우지 않는다.** 세액 영향이 0이라 남아도 무해하고, 첫 자산을 지우면 컴패니언이
 *    primary로 승격하는데 그때 선언이 살아 있어야 한다. 대신 stale 선언이 남은 컴패니언
 *    카드는 ⑤가 **말로 밝힌다**(침묵 제거 금지 — OH-20).
 */
export function canDeclareRentalHousingException(
  assetKind: AssetForm["assetKind"],
  assetIndex: number,
): boolean {
  return assetIndex === 0 && isRentalHousingExceptionApplicable(assetKind);
}
