/**
 * E3-③ 후속 #1·L2 — 기타토지 «철거된 건축물 = 주택» 행 입력(정착면적 · 수도권)을 **엔진이 읽는가**. ⑧ H9·H10 · ⑤ 필수 표시·수도권 칸이 같은 함수를 쓴다(단일 소스).
 *
 * 엔진이 이력을 읽지 않는 경우는 둘이다(`applyStateHistory`):
 *   · 양도일 의제(영 §168의14②) 사유가 선택됨 — 엔진 술어 `stateHistoryDeemedBlocks`(`stateHistoryDeemedBlocksOf` 래퍼).
 *   · core가 면적 일부만 비사업용으로 판정 — 호별 기준면적·공장 기준면적·건물 배율 초과·2% 바닥면적·복합용도 등. 판정은 **core 계산 결과**라 입력 몇 칸으로 근사하지 않고(분기가 7곳이고 서로 얽힌다)
 *     ④가 서버로 보내는 raw를 ⑭ 매퍼로 엔진 입력으로 바꿔 엔진 `otherLandAreaIsPartial`(= `applyStateHistory`가 쓰는 `isPartialArea`를 같은 core 결과에 적용)을 돌린다 — 서버와 같은 경로·같은 함수다.
 *
 * 이 모듈은 `non-business-land-request.ts`(④)를 import한다 — 순환을 피해 scope(`nbl-other-state-history-scope.ts`)와 분리했다. React를 import하지 않는다.
 * 엔진을 돌릴 수 없는 입력(양도일·취득일 누락·해석 불가 등)은 «읽는다»(= 입력 요구 · 종전 동작)로 접는다 — 다른 ⑧ 규칙이 먼저 막는 입력이다.
 *
 * 한계: 기본 판정 규칙(`DEFAULT_NON_BUSINESS_LAND_RULES`)으로 돈다 — 서버는 DB 규칙을 기본값 위에 덮어쓴다. 면적 안분은 규칙과 무관하고 기간기준 임계만 규칙을 읽으므로(3호·수입금액비율 경로)
 * DB 규칙이 기본값과 다르면 그 경로에서만 갈릴 수 있다. 축 B(공유 지분 번들)는 이 카드(첫 카드)의 raw로만 판정한다 — 지분별 취득일에 의존하는 기간 경로에서 지분 간 갈릴 수 있다(계획서 §19 #11).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { otherLandAreaIsPartial } from "@/lib/tax-engine/non-business-land/other-land";
import { otherLandStateHistoryIsRead } from "@/lib/tax-engine/non-business-land/other-land";
import { housingLandStateHistoryIsRead } from "@/lib/tax-engine/non-business-land/housing-state-history";
import { consumesHousingStateHistory } from "@/lib/tax-engine/non-business-land/land-category";
import { eventClosesHouseInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { VACANT_LOT_HO } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { buildNblEngineInput } from "./non-business-land-request";
import { buildNonBusinessLandRaw } from "./non-business-land-request";
import { nblHousingStateHistoryApplies } from "./nbl-other-state-history-scope";
import { nblOtherStateHistoryApplies } from "./nbl-other-state-history-scope";
import { stateHistoryDeemedBlocksOf } from "./nbl-other-state-history-scope";
import { stateHistoryWireFields } from "./nbl-other-state-history-scope";

/**
 * 기타토지 카드의 이력 입력을 엔진이 **읽지 않는가**(= H9·H10을 요구하지 않고 필수 표시를 하지 않고, 부분 면적 안내를 보인다).
 * 기타토지 질문이 적용되지 않거나(주택 카드는 `housingAreaLimitState`가 따로 정한다) 주택 구간을 닫는 와이어 철거 행이 없으면 거짓(요구할 칸 자체가 없다 — 기타토지 기존 입력 변화 0).
 *
 * E3-④ C-4 (UQ-7 (나)) — **13호(무주택 1세대 1필지 나지) 선택 시**에는 주택 철거 행이 없어도 «읽지 않는가»를 묻는다: 13호는 한도가 660㎡로 고정이라 부분 면적 경로(이력 미적용)가 가장 쉽게 열리는데
 * 입력 화면이 그 사실을 말하지 않았다(M-5). 이 확장은 **⑤ 안내 표시만** 바꾼다 — 주택 철거 행이 없으면 H9·H10이 요구할 칸이 없어 ⑧ 결과는 변하지 않는다(그 순회가 행 0건이다).
 */
export function housePriorHistoryIgnoredOf(asset: AssetForm, transferDate: string | undefined): boolean {
  if (nblHousingStateHistoryApplies(asset) || !nblOtherStateHistoryApplies(asset)) return false;
  const wire = stateHistoryWireFields(asset).nblOtherStateEvents;
  if (asset.nblOtherRelatedBusinessType !== VACANT_LOT_HO && !wire.some((_, i) => eventClosesHouseInterval(wire, i, undefined))) return false;
  if (stateHistoryDeemedBlocksOf(asset)) return true;
  return otherAreaIsPartialOf(asset, transferDate);
}

/** ④ raw → ⑭ 매퍼 → 엔진 core의 면적 일부 비사업용 여부. 엔진 입력을 만들 수 없으면(raw 없음·날짜 해석 불가) 거짓. */
function otherAreaIsPartialOf(asset: AssetForm, transferDate: string | undefined): boolean {
  try {
    const raw = buildNonBusinessLandRaw(asset, transferDate ?? "");
    const input = buildNblEngineInput(raw as Parameters<typeof buildNblEngineInput>[0]);
    return !!input && otherLandAreaIsPartial(input, DEFAULT_NON_BUSINESS_LAND_RULES);
  } catch {
    return false;
  }
}

/**
 * E3-⑤ E3f-2 (계획서 §6.2 D-2) — **엔진이 이 raw의 소유기간 중 상태 이력(건축물·주택 사건)을 읽는가**. ⑧(`buildNonBusinessLandRaw(asset)`로 raw를 만든 뒤)과 ⑫′(`refineNonBusinessLandRaw` — raw 그대로)가
 * **같은 함수**를 불러, 나대지 구간 근거 «철거ㆍ멸실»의 사실 칸 4개(허가·건축 외 용도·빈집정비·바닥면적)를 «엔진이 읽을 때만» 요구한다(UQ-8 (가)). raw → ⑭ 매퍼 → 엔진 술어:
 *   · 기타토지 카드 — `otherLandStateHistoryIsRead`(모드 `changed` ∧ 사건 ≥ 1 ∧ 양도일 의제 아님 ∧ core 면적 전량(`isPartialArea` 아님)).
 *   · 주택부수토지 카드 — `housingLandStateHistoryIsRead`(모드 `changed` ∧ 사건 ≥ 1 ∧ 양도일 현재 배율 이내 — V-26).
 * 이 함수는 사실 칸을 읽지 않는다(사실 칸은 `applyStateHistory` 안에서만 쓰인다) — ④ 조립·⑧·⑫′ 사이에 순환이 없다. 엔진 입력을 만들 수 없으면(날짜 누락·해석 불가) «읽는다»(= 입력 요구)로 접는다 — 다른 ⑧ 규칙이 먼저 막는 입력이다.
 * 한계(V-27): 기본 판정 규칙(`DEFAULT_NON_BUSINESS_LAND_RULES`)으로 돈다 — `housePriorHistoryIgnoredOf`와 같다. 꼬리 철거일은 이 게이트와 무관하다(core가 이력 적용과 별개로 읽는다 — V-29).
 */
export function nblStateHistoryIsRead(raw: Record<string, unknown>): boolean {
  try {
    const input = buildNblEngineInput(raw as Parameters<typeof buildNblEngineInput>[0]);
    if (!input) return true;
    return consumesHousingStateHistory(input.landType) ? housingLandStateHistoryIsRead(input) : otherLandStateHistoryIsRead(input, DEFAULT_NON_BUSINESS_LAND_RULES);
  } catch {
    return true;
  }
}
