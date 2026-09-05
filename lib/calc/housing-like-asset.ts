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

/**
 * 「이 자산이 §154① **1세대1주택 비과세 판정**을 받는가」 — ⑤ 렌더 게이트 전용.
 *
 * ## `isHousingLike`와 다르다 (2026-09-05)
 *
 * `isHousingLike`는 「세대 주택 목록을 입력받을 자산인가」(4종)이고, 이 술어는
 * 「§154① 보유·거주 요건 판정을 받는 자산인가」(2종)다. 조합원입주권·분양권이 빠진다.
 *
 * | 자산 | §154① 판정 | 근거 |
 * |---|---|---|
 * | `housing` | ✅ | 법 §89①3호가목 → 영 §154① |
 * | `redevelopment_apt` | ✅ | 재개발 신축주택은 §94①1호 「건물」이자 §89①3호가목의 「주택」. `checkExemption` 경계에서 `housing`으로 번역된다(`transfer-tax.ts:196~200` 주석) |
 * | `right_to_move_in` | ❌ | 비과세는 법 §89①**4호**. 「인가일 현재 §89①3호가목에 해당하는 **기존주택** 소유」 요건이고, 엔진은 그 판정을 `exemptionEligibleAtApproval` **자기선언**으로 받는다(`transfer-tax-redevelopment-transforms.ts:467`) — 이 자산의 조정대상지역 토글이 필요 없다 |
 * | `presale_right` | ❌ | 법 §89①4호가 **조합원입주권만** 열거한다. 분양권은 §89②에서 주택 비과세를 **방해하는 요소**로만 다뤄진다 |
 *
 * ## 🔴 넓히면 ④·엔진과 어긋난다
 *
 * ④(`transfer-tax-api.ts:399·401`)는 `residencePeriodMonths`·`wasRegulatedAtAcquisition`을
 * **자산종류 게이트 없이** 보낸다. 즉 화면 게이트가 유일한 통제점이다 — 여기에 입주권·분양권을
 * 넣으면 엔진이 §154① 요건을 안 보는 자산에 대해 사용자가 값을 채우게 되고, 그 값은
 * 조용히 버려진다(memory `feedback_ui_gate_removes_sole_input_path`의 역방향).
 */
export const ONE_HOUSE_EXEMPTION_ASSET_KINDS: ReadonlySet<string> = new Set([
  "housing",
  "redevelopment_apt",
]);

/** §154① 비과세 판정 대상 자산인가 (⑤ 렌더 게이트 · 리셋 게이트 공용). */
export function isOneHouseExemptionAsset(
  kind: AssetForm["assetKind"] | string | undefined,
): boolean {
  return kind !== undefined && ONE_HOUSE_EXEMPTION_ASSET_KINDS.has(kind);
}
