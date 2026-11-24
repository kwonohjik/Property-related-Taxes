/**
 * NBL-STATE-HISTORY-E3-④ M-1 — **엔진이 13호 「세대 주택 소유 기간」 행을 실제로 읽는가**의 UI 단일 래퍼. ⑤ 위젯 노출·미리보기 · ⑧ HH-1~3 · ④ 전송(조립은 `non-business-land-request.ts`가 같은 함수로)이 이것만 부른다.
 *
 *   읽는다 = 필요조건(`vacantLotHousePeriodsPrecondition` — 엔진 순수 술어에 폼 값 공급) ∧ 엔진 core 실측(`engineReadsHouseholdHousePeriods` — ④ base raw → ⑭ 매퍼 → `otherLandReadsHouseholdHousePeriods`)
 *
 * 필요조건만으로는 부족하다 — 나목 Step 3-1(확인된 비종합합산 근거) · 수입금액비율 · 부분 면적(건물 배율 초과·2% 미달)이 13호보다 먼저 끝나면 엔진은 행을 읽지 않는데 입력을 요구하는 막다른 길이 된다.
 * 실측은 행을 뺀 raw로 돈다(질문 상태 `none`으로 ④를 조립 — 행 와이어는 비어 나가고 탐침 행이 엔진 안에서 행을 대신한다). 날짜를 읽을 수 없으면 «읽는다»로 접는다(다른 ⑧ 규칙이 먼저 막는다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { buildNonBusinessLandRaw } from "./non-business-land-request";
import { engineReadsHouseholdHousePeriods } from "./non-business-land-request";
import { vacantLotHousePeriodsPrecondition } from "./nbl-vacant-lot-household-scope";

export function vacantLotHousePeriodsReadOf(asset: AssetForm, transferDate: string | undefined): boolean {
  if (!vacantLotHousePeriodsPrecondition(asset)) return false;
  try {
    // `none` — 행 와이어 조립이 실측을 다시 부르지 않게 한다(재귀 방지). 이 raw의 행 칸은 비고 엔진 탐침 행이 대신한다.
    const raw = buildNonBusinessLandRaw({ ...asset, nblOtherHouseholdHouseStatus: "none" }, transferDate ?? "");
    return raw ? engineReadsHouseholdHousePeriods(raw) : true;
  } catch {
    return true;
  }
}
