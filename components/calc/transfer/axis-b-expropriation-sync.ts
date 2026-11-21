/**
 * 축 B(같은 물건 지분 분할)에서 첫 카드의 «공익수용·협의매수» 선택·해제를 지분 카드의 §77 감면 행에도 일관되게 적용 (NBL2611-C9).
 *
 * 지분 카드는 ② 양도정보(`TransferModeBlock`)를 숨기고 `transferCause`만 첫 카드에서 병합받는다. 종전에는 첫 카드의 선택이 **그 카드에만**
 * §77 기본행을 만들어, 둘째 이후 지분은 같은 수용인데도 §77 감면이 조용히 빠졌다(세액 과다 — 실측 단건 47,985,100 vs 지분 51,827,387).
 * 순수 함수라 상태가 없다 — 호출부는 **사용자 입력 핸들러**(`CompanionAssetsSection.updateAsset` · `addAsset` · Step1 지분 토글)뿐이다(useEffect → store 미러링 금지).
 *
 * 규칙
 *  - 첫 카드 `transferCause`가 수용으로 **바뀌는** 패치: §77 행이 없는 지분 카드에 기본행(`getStandaloneDefault`)을 추가한다. 이미 있으면 건드리지 않는다(사용자 입력 보존).
 *  - 수용에서 **벗어나는** 패치(일반 양도·부담부증여): 지분 카드의 §77 행을 제거한다 — 첫 카드가 같은 패치로 자기 행을 지우는 것과 대칭.
 *  - 기본행의 보상액은 «0»이다. 지분마다 받은 보상액은 지분 카드 ⑤ 감면 칸에 직접 입력한다(⑧이 비면 막는다) — 첫 카드 값을 복제하거나 비어 있으면 대신 쓰는 숨은 fallback은 없다.
 *  - 고시일은 행에 복제하지 않는다 — 비어 있으면 첫 카드 값을 ④·⑧이 같은 술어(`axis-b-reduction-notice-date`)로 읽고 ⑤는 표시만 한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { getStandaloneDefault } from "./UnifiedReductionPanel-defaults";

const EXPR = "public_expropriation";

const hasExprRow = (a: AssetForm): boolean => (a.reductions ?? []).some((r) => r.type === EXPR);

/** `share`에 §77 기본행을 더한다(이미 있으면 그대로). */
export function withAxisBExpropriationRow(share: AssetForm): AssetForm {
  return hasExprRow(share) ? share : { ...share, reductions: [...(share.reductions ?? []), getStandaloneDefault(EXPR)] };
}

/**
 * `assets[index]`에 `patch`를 적용한 새 배열. 축 B(`axisB`)의 첫 카드(index 0)가 수용 여부를 바꾸는 패치면 지분 카드(index > 0)의 §77 행도 함께 맞춘다.
 * 그 밖의 모든 경우(축 B 아님 · 지분 카드 패치 · 수용 여부가 안 바뀌는 패치)는 단순 병합이다.
 */
export function applyCardPatchWithAxisBExpropriation(assets: AssetForm[], index: number, patch: Partial<AssetForm>, axisB: boolean): AssetForm[] {
  const next = assets.map((a, i) => (i === index ? { ...a, ...patch } : a));
  if (!axisB || index !== 0 || patch.transferCause === undefined) return next;
  const wasExpr = assets[0]?.transferCause === EXPR;
  const isExpr = patch.transferCause === EXPR;
  if (wasExpr === isExpr) return next;
  return next.map((a, i) => {
    if (i === 0) return a;
    if (isExpr) return withAxisBExpropriationRow(a);
    return hasExprRow(a) ? { ...a, reductions: (a.reductions ?? []).filter((r) => r.type !== EXPR) } : a;
  });
}
