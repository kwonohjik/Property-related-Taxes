/**
 * NH-14 후속 — 「세대 기준 폼 뷰」(계획서 `docs/00-pm/nh14-companion-household-followups.plan.md`).
 *
 * 세대 판정 leaf들(일시적 2주택 도출 · 명부 행 ⑥ 게이트 · 신규 주택 경위 · 명부 양도 행 등)은 「양도 주택 = `form.assets[0]`」 규약으로 짜여 있다.
 * 첫 자산이 토지·건물이고 함께 양도하는 주택이 세대·주택 현황의 기준 자산이면(`householdFactsAssetOf`), 그 주택을 **맨 앞으로 돌린 읽기 전용 폼**을
 * 넘겨 leaf를 고치지 않고 같은 결론을 얻는다. 첫 자산이 기준 자산이면 `form` 그대로다(종전 경로 불변).
 *
 * ⚠️ 뷰는 세대 축 판정과 ② 1세대1주택 비과세 판정 축(함께 양도 주택 자신의 거주기간·취득 당시 조정대상지역·§154① 단서 —
 *   `docs/00-pm/nh14-companion-house-own-facts.plan.md`)에 쓴다. 첫 자산 자신의 사실(비사업용 토지 등)은 원래 폼으로 판정한다.
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { householdFactsAssetOf } from "./household-facts-asset";
import { isOneHouseExemptionAsset } from "./housing-like-asset";

type ViewForm = Pick<TransferFormData, "assets" | "assetSplitMode">;

/** 기준 주택의 index — 첫 자산이 기준이면 0, 자산이 없으면 -1. */
function householdIndexOf(form: ViewForm): number {
  const hh = householdFactsAssetOf(form.assets, form.assetSplitMode);
  return hh ? (form.assets ?? []).indexOf(hh) : -1;
}

/** 세대 기준 폼 뷰 — 기준 주택을 맨 앞으로 돌린다(나머지는 상대 순서 그대로). 첫 자산이 기준이면 같은 객체를 돌려준다. */
export function householdFactsFormView<T extends ViewForm>(form: T): T {
  const k = householdIndexOf(form);
  if (k <= 0) return form;
  const assets = form.assets;
  return { ...form, assets: [assets[k], ...assets.filter((_, i) => i !== k)] };
}

/**
 * ④⑫⑭ — 함께 양도 **주택**이 세대 기준 자산이면 그 주택의 `assetId`, 아니면 undefined.
 *
 * 세대 기준 자산이 함께 양도 조합원입주권이면(주택이 없는 구성 — `householdFactsAssetOf`) undefined다: 이 id는 주택 카드에 «세대 단위 1주택 사실»을 덮고
 * 명부 행 감면·거주기간을 싣는 용도라 입주권 카드에는 맞지 않는다. 입주권 카드의 §89①4호 세대 사실은 `oneRightHouseholdFacts`(⑭)가 싣는다.
 */
export function householdFactsCompanionAssetId(form: ViewForm): string | undefined {
  const k = householdIndexOf(form);
  return k > 0 && isOneHouseExemptionAsset(form.assets[k].assetKind) ? form.assets[k].assetId : undefined;
}

/**
 * ⑤ 뷰에서 나온 patch를 원래 폼에 저장한다 — `assets` patch는 원래 순서로 되돌린다(뷰의 맨 앞 = 원래 k번째).
 * 그 밖의 키(세대 단위 폼-전역 값)는 그대로 넘긴다. 첫 자산이 기준이면 `onChange` 그대로다.
 */
export function householdViewOnChange(
  form: ViewForm,
  onChange: (patch: Partial<TransferFormData>) => void,
): (patch: Partial<TransferFormData>) => void {
  const k = householdIndexOf(form);
  if (k <= 0) return onChange;
  return (patch) => {
    if (!patch.assets) return onChange(patch);
    const [head, ...rest] = patch.assets;
    onChange({ ...patch, assets: [...rest.slice(0, k), head, ...rest.slice(k)] });
  };
}
