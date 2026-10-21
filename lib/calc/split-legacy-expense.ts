/**
 * 이전 형식 필요경비(`directExpenses`)를 토지·건물 분리 계산에서 **파트 칸으로 옮기게** 하는가.
 *
 * 계획서: `docs/00-pm/split-v7-era-and-legacy-expense.plan.md` §2 · §3.2 (Q-2 a)
 *
 * `directExpenses`는 옛 저장 형식의 단일 필요경비다 — 마이그레이션(`calc-wizard-migration.ts`)으로만 채워지고 새 입력 경로는 없다.
 * 분리 계산에서는 엔진이 이 총액을 파트에 나누는데(`transfer-tax-split-gain.ts` `splitPair`), 파트 칸이 비면 **취득시 기준시가 비율**을
 * 써서 ⑧이 그 3칸을 요구했다. 신축 + 토지 상속·증여 화면에는 그 칸이 없어 막다른 길이었고, 양도비를 넣으면 칸이 숨어
 * **보이지 않는 값이 세액을 바꿨다**.
 *
 * 현행 자산 단위 자본적지출(`capitalExpenditure`)은 이미 파트 칸으로 보낸다(`transfer-tax-validate-split.ts` ④절 —
 * 「소득세법」 §100② 후문은 자본적지출을 안분 대상으로 열거하지 않고 §97②2호는 파트마다 갈린다 · 예규 법인46012-2439).
 * 이전 형식도 같은 규칙으로 둔다. ⑤ 칸 표시 · ⑧ 차단 · ④ 전송(단건·다건·함께 양도)이 이 함수 하나를 읽는다.
 *
 * 제외: 일반건물(자체 경로 `transfer-tax-validate-gb.ts`) · 부담부증여(④가 분리 축을 싣지 않는다 — 옮긴 파트 칸이 전송되지 않아
 * 경비가 사라진다) · 파트 이월과세(④가 이미 0을 싣고 숨은 잔재는 세액에 닿지 않는다 — P2~P6 결정).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount } from "./number-parse";
import { effectiveSelfOwns } from "./self-owns-scope";
import { anyPartCarryover, normalizeBuildingCauseInputs } from "./transfer-land-part-cause";

export function legacyExpenseMovesToParts(rawAsset: AssetForm, opts?: { isNonPrimary?: boolean }): boolean {
  const asset = normalizeBuildingCauseInputs(rawAsset); // ⑧ `validateSplitDirectInputs`와 같은 사본
  if (asset.assetKind === "general_building") return false;
  if (asset.transferType === "burdened_gift" || asset.acquisitionCause === "burdened_gift") return false;
  if (anyPartCarryover(asset, opts)) return false;
  // ⑧ `validateSplitDirectInputs` 진입 게이트와 같다 — 별개 취득 또는 소유자 분리
  return asset.hasSeperateLandAcquisitionDate === true || (effectiveSelfOwns(asset) ?? "both") !== "both";
}

/** 분리 계산에서 파트 칸으로 옮겨야 하는 이전 형식 필요경비 금액(옮길 것이 없으면 0). */
export function legacyExpenseToMove(asset: AssetForm, opts?: { isNonPrimary?: boolean }): number {
  return legacyExpenseMovesToParts(asset, opts) ? parseAmount(asset.directExpenses ?? "") : 0;
}
