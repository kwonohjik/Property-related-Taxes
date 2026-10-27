/**
 * 축 B(같은 물건 지분 분할) — 둘째 이후 원조합원 지분의 「권리가액」이 첫 카드의 「권리가액」과 다른가.
 *
 * 「권리가액」(`redevRightsValue`)은 「소득세법 시행령」 제166조 제4항 제1호의 「관리처분계획등에 따라 정하여진 가격」으로,
 * 화면 규약상 **물건 전체(100%) 기준**으로 입력한다(`RedevelopmentBlock` 힌트 · 지분율은 ④가 적용). 같은 물건의 지분이면
 * 같은 값이어야 하므로 다르면 입력 실수일 수 있다 — ⑤가 그 지분 카드의 칸에 경고만 한다(막지 않는다).
 *
 * ⚠️ 증여재산 평가의 조합원권리가액(`bgRightMemberRightsValue` · 상증칙 §16③)과는 비교하지 않는다 — 법문이 달라
 *    다를 수 있다(`burdened-gift-right-valuation.ts` 헤더). 계획서 `bg-axis-b-right-share-inputs.plan.md` §9.2.
 *
 * 승계조합원(입주권 `isSuccessorRightToMoveIn` · 완공 아파트 `redevIsSuccessorMember`)은 §166 권리가액 칸이 없어 비교하지 않는다 —
 * 승계로 바꿔도 남아 있을 수 있는 옛 값을 읽지 않으려고 명시로 뺀다.
 *
 * @returns 다르면 첫 카드 값, 같거나 해당 없으면 undefined
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RedevRightsAsset = Pick<AssetForm, "redevRightsValue" | "isSuccessorRightToMoveIn" | "redevIsSuccessorMember">;

function originalMemberRightsValue(asset: RedevRightsAsset): number {
  if (asset.isSuccessorRightToMoveIn === true || asset.redevIsSuccessorMember === "yes") return 0;
  return parseAmount(asset.redevRightsValue) || 0;
}

export function shareRedevRightsValueMismatch(
  share: RedevRightsAsset,
  primary: RedevRightsAsset & Pick<AssetForm, "assetKind">,
): number | undefined {
  if (primary.assetKind !== "right_to_move_in" && primary.assetKind !== "redevelopment_apt") return undefined;
  const own = originalMemberRightsValue(share);
  const first = originalMemberRightsValue(primary);
  return own > 0 && first > 0 && own !== first ? first : undefined;
}
