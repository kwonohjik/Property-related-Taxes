/**
 * ⑧ 구주택 멸실·신축 통산(`landRebuildPriorHouse`, 해석 (5)) 검증 — UI 설계 §3 ⑧.
 *
 * 엔진 진입·⑫와 **같은 leaf**(`collectLandRebuildIssues`)에 ④가 실제로 보내는 값(`landRebuildFactsOfAsset`)을 넣고,
 * **첫 위반**을 입력 칸(`data-field`)에 붙인다 — 문구가 ⑫ 400과 같다(⑧ 차단 ⇔ ⑫ 400 격자로 고정).
 * 토글이 꺼졌거나 호스트가 닫혀 있으면 입력이 없어 leaf가 빈 배열을 돌려준다(통과).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { collectLandRebuildIssues, type LandRebuildField } from "@/lib/tax-engine/transfer-land-rebuild-rate";
import { landRebuildFactsOfAsset, type LandRebuildScopeOpts } from "./transfer-land-rebuild";
import { fieldError, type IssueField } from "./transfer-tax-validate-field";

/** leaf 위반 칸(API 경로) → 화면 입력 칸(`data-field`). */
const FIELD_OF: Record<LandRebuildField, IssueField> = {
  landRebuildPriorHouse: "landRebuildEnabled",
  "landRebuildPriorHouse.startMode": "landRebuildStartMode",
  "landRebuildPriorHouse.priorHouseStartDate": "landRebuildPriorHouseStartDate",
  "landRebuildPriorHouse.demolitionDate": "landRebuildDemolitionDate",
  "landRebuildPriorHouse.footprintUnchanged": "landRebuildFootprintUnchanged",
  landAcquisitionDate: "landAcquisitionDate",
};

export function validateLandRebuild(asset: AssetForm, label: string, opts?: LandRebuildScopeOpts): string | null {
  const [issue] = collectLandRebuildIssues(landRebuildFactsOfAsset(asset, opts));
  return issue ? fieldError(FIELD_OF[issue.field], `${label}: ${issue.message}`) : null;
}
