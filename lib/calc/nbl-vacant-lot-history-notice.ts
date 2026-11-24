/**
 * NBL-STATE-HISTORY-E3-④ C-1·C-2 — 13호(무주택 1세대 1필지 나지) 선택 + 이력 `changed`일 때 **입력 화면에 어떤 안내를 보이는가**(표시 전용 — ④⑧ 게이트가 아니다).
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §4.1
 *
 * 엔진이 이력을 읽을 때(= 의제·부분 면적이 아닐 때 — `housePriorHistoryIgnoredOf`)만 안내한다. 읽지 않으면 기존 부분 면적·의제 안내가 말한다(C-4).
 *   · `bare_only` — 660㎡ 이내: 13호는 소유기간 중 건축물이 없던 구간에 적용된다(엔진 `applyStateHistory`가 구간별로 적용 — C-1).
 *   · `area_over` — 660㎡ 초과(꼬리 건물): 엔진이 면적 × 이력을 함께 판정하지 않고 13호 구간을 인정하지 않는다(D-2 — C-2).
 * 문구는 엔진 상수가 단일 소스다(`NBL_VACANT_LOT_BARE_ONLY_INPUT_NOTICE`·`NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE`) — 화면이 문구를 짓지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { VACANT_LOT_HO } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { vacantLotWithinAreaLimit } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { parseDecimal } from "./number-parse";
import { housePriorHistoryIgnoredOf } from "./nbl-other-state-history-read";
import { nblOtherStateEventsInUse } from "./nbl-other-state-history-scope";

export type VacantLotHistoryNoticeKind = "bare_only" | "area_over";

export function vacantLotHistoryNoticeOf(asset: AssetForm, transferDate: string | undefined): VacantLotHistoryNoticeKind | null {
  if (asset.nblOtherRelatedBusinessType !== VACANT_LOT_HO || !nblOtherStateEventsInUse(asset)) return null;
  if (housePriorHistoryIgnoredOf(asset, transferDate)) return null;
  return vacantLotWithinAreaLimit(parseDecimal(asset.acquisitionArea)) ? "bare_only" : "area_over";
}
