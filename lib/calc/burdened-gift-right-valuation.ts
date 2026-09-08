/**
 * 조합원입주권 증여재산 평가 — **⑤ 표시 · ④ API 변환 · ⑧ validate 공용 파생** (단일 소스).
 *
 * ## 왜 파생 함수인가 — 「진입 시 store write 1회」는 구현 수단이 없다
 *
 * 조합원권리가액은 재개발 정보의 「권리가액」에서 **프리필**하는 것이 자연스럽다. 그런데
 * 섹션 진입은 이벤트가 아니라 `useEffect`밖에 없고, 그것은 금지된 **값 미러링**이다
 * (`feedback_useeffect_store_mirror_forbidden` — 무한 루프 위험).
 *
 * ⇒ `feedback_store_default_vs_ui_display_fallback`의 **변형 B**를 쓴다. 파생을 **하나**만
 *   만들고 표시·전송·검증이 **전부 그것을 호출**한다. 그러면 「store는 0인데 화면에는 값이
 *   보이고 ⑧이 조용히 차단」하는 3중 패턴 위반이 **애초에 발생하지 않는다**.
 *
 * ## ⚠️ 두 값은 법문이 다르다 — 프리필이지 동일시가 아니다
 *
 * | | 조문 | 정의 |
 * |---|---|---|
 * | `bgRightMemberRightsValue` | 상증칙 **§16③** | 종전 토지·건축물 가격 × 비례율 |
 * | `redevRightsValue` | 소령 **§166④1호** | 관리처분계획등에 따라 **정하여진 가격** |
 *
 * 실무에서 같은 숫자가 되는 경우가 많아 프리필의 실익이 있지만, **다를 수 있으므로
 * 사용자가 덮어쓸 수 있어야 한다**. 그래서 store에 써 넣지 않고 「비어 있으면 파생」으로 둔다.
 * 파생값이 쓰이는 동안 화면에 그 사실을 배지로 알린다(⑤ 소관).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RightValuationAsset = Pick<
  AssetForm,
  "bgRightMemberRightsValue" | "bgRightPaidInstallments" | "bgRightPremium" | "redevRightsValue"
>;

/**
 * 조합원권리가액 — 명시 입력이 있으면 그것, 없으면 재개발 권리가액에서 파생.
 *
 * ⚠️ `> 0` 판정이다. `??`·`||`는 「0원을 명시 입력」과 「미입력」을 가르지 못하는데,
 *    조합원권리가액이 0원인 경우는 §16③ 산식상 성립하지 않으므로 0은 **미입력**으로 읽는다.
 */
export function deriveMemberRightsValue(asset: RightValuationAsset): number {
  const explicit = parseAmount(asset.bgRightMemberRightsValue) || 0;
  if (explicit > 0) return explicit;
  return parseAmount(asset.redevRightsValue) || 0;
}

/** 파생값을 쓰고 있는가 — ⑤가 「재개발 권리가액에서 파생됨」 배지를 띄우는 근거. */
export function isMemberRightsValueDerived(asset: RightValuationAsset): boolean {
  return (parseAmount(asset.bgRightMemberRightsValue) || 0) <= 0 && deriveMemberRightsValue(asset) > 0;
}

/**
 * 증여재산 평가액의 **보충적 평가 항** = 조합원권리가액 + 납입금 + 프리미엄 (상증령 §51②).
 *
 * 🔴 이것이 **최종 증여가액 C가 아니다.** 엔진의 C는
 *    `max(보충적, 담보(§66), 임대(§61⑤))`라 근저당이 크면 이 값보다 커진다
 *    (`burdened-gift-valuation.ts`). ⑤가 max를 재구현하면 UI와 엔진에 진실이 둘이 된다
 *    (`feedback_ui_engine_dual_truth_avoidance`) — 최종 C는 **결과 카드에서 엔진값으로** 보여준다.
 */
export function deriveRightValuationTotal(asset: RightValuationAsset): number {
  return (
    deriveMemberRightsValue(asset) +
    (parseAmount(asset.bgRightPaidInstallments) || 0) +
    (parseAmount(asset.bgRightPremium) || 0)
  );
}
