/**
 * 상속·증여 자산이 자산 종류 변경·겸용 해제로 **일반 범위**(`giftEstimationGenericScope`)에 들어올 때의 산정 방식 플래그 정리
 * (계획서 `docs/02-design/features/inherit-gift-scope-entry-stale-acq-flags.plan.md` — #2594 V-1).
 *
 * 재개발·입주권 §166③ 라디오 · 승계조합원 산정 방식 · 겸용 「개별주택가격 미공시」 토글은 범위 밖에서 같은 플래그
 * (`useEstimatedAcquisition`·`isAppraisalAcquisition`·`isSalesCaseAcquisition`)를 정당하게 켠다. 범위에 들어온 뒤의 상속·증여 카드에는
 * 그 라디오가 없어 남은 플래그가 계산을 막았다(상속 감정 ⑧ 통과 → 서버 400 · 매매사례·환산 화면에 없는 칸 요구 · 증여 ⑧ 차단).
 * 원인 전환(`giftEstimationClearPatch`)·복원(`clearInheritedStaleAcqInputs` · `migrateAsset` B1)과 **같은 규칙**을 경계를 넘는 순간에 건다 —
 * 화면 세션의 전환 결과가 저장 폼을 다시 연 결과와 같아진다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { giftEstimationGenericScope } from "./transfer-tax-validate-gift-163-9";
import { giftEstimatedModeBlocked } from "./transfer-tax-validate-gift-163-9";
import { giftEstimationClearPatch } from "./transfer-tax-split-acq-mode";
import { effectiveBuildingCauseMix } from "./transfer-land-part-cause";

/** `prev`(전환 전) → `merged`(전환 patch를 합친 자산)가 일반 범위 경계를 넘으면 비울 patch. 넘지 않으면 빈 patch. */
export function genericScopeEntryClearPatch(prev: AssetForm, merged: AssetForm): ReturnType<typeof giftEstimationClearPatch> {
  if (giftEstimationGenericScope(prev) || !giftEstimationGenericScope(merged)) return {};
  if (merged.acquisitionCause === "inheritance") {
    return effectiveBuildingCauseMix(merged) ? {} : giftEstimationClearPatch("inheritance", merged);
  }
  return giftEstimatedModeBlocked(merged) ? giftEstimationClearPatch("gift") : {};
}
