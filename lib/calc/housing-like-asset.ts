/**
 * 「이 자산이 **주택 계열**인가」 — ⑤ 렌더 게이트 · ④ 전송 게이트 **공용 단일 소스**.
 *
 * ## 왜 뽑았나 (2026-08-25 · Q-3(b))
 *
 * 같은 이름·같은 목적의 술어가 **세 파일에 복제**돼 있었고 정의가 **2:1로 갈렸다**:
 *
 * | 위치 | `redevelopment_apt` | 통제 대상 |
 * |---|---|---|
 * | `transfer-tax-api-helpers.ts` | ❌ 없음 | ④ 단건 `houses[]` 전송 · 분양권 목록 전송 |
 * | `multi-transfer-tax-api.ts` | ❌ 없음 | ④ 다건 `houses[]` 전송 |
 * | `app/calc/transfer-tax/steps/Step4.tsx` | ✅ 있음 | ⑤ `HousesListSection` 렌더 · 조정대상지역 자동조회 |
 *
 * ⇒ 사용자는 재개발APT에서 세대 주택 목록을 **화면에서 채울 수 있는데 ④가 서버로 보내지 않아**
 *   그 값이 조용히 버려졌다. 다주택 중과 정밀 판정이 아예 돌지 않았다
 *   (memory `feedback_api_trigger_without_input_path_is_noop`).
 *
 * ## ⚠️ 엔진의 중과 술어와 **합치지 않는다**
 *
 * `lib/tax-engine/transfer-tax-surcharge-predicate.ts`의
 * `SURCHARGE_FALLBACK_PROPERTY_TYPES`와 현재 원소가 같지만 **축이 다르다**:
 *
 * - 이 집합 = 「세대 주택 목록·분양권 목록을 **입력받고 보낼** 자산인가」
 * - 엔진 집합 = 「§104⑦ 중과 **대상** 자산인가」
 *
 * 둘은 곧 갈린다 — §104⑦은 「**주택**」만 대상이고 조합원입주권은 §94①2호가목의 **권리**라
 * 엔진 집합에서 `right_to_move_in`이 빠질 예정이다(별건). 그러나 **이 집합에서는 빠지면 안 된다**
 * — 입주권 양도자도 세대 주택 수를 세야 하기 때문이다. 한 상수로 합치면 그 정정이
 * 입력 경로까지 끊는다.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 세대 주택 목록(`houses[]`)·분양권 목록 입력과 전송의 대상이 되는 자산 종류.
 *
 * ⚠️ 넓히면 ⑤(렌더)와 ④(전송)가 **동시에** 열린다 — 한쪽만 열면 「화면엔 있는데 안 보내진다」
 *    또는 「보내는데 채울 화면이 없다」가 된다.
 */
export const HOUSING_LIKE_ASSET_KINDS: ReadonlySet<string> = new Set([
  "housing",
  "right_to_move_in",
  "presale_right",
  "redevelopment_apt",
]);

/** `AssetForm["assetKind"]`·평문 `string` 양쪽을 받는다 — 호출부 세 곳의 시그니처가 달랐다. */
export function isHousingLike(kind: AssetForm["assetKind"] | string | undefined): boolean {
  return kind !== undefined && HOUSING_LIKE_ASSET_KINDS.has(kind);
}
