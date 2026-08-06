/**
 * 가축별 기준면적 — 「소득세법 시행령」 [별표 1의3] (§168조의10③ 위임)
 *
 * 표 자체는 **세목 중립**이다 — 「지방세법 시행령」 §102①3호(재산세 분리과세)의 표와
 * 값·비고가 **완전히 동일**하다(2026-08-06 원문 대조). 정본은 `../../livestock-standard-area.ts`
 * 이고 여기서는 **재수출만** 한다. 사본을 두면 한쪽만 개정될 때 두 세목이 갈린다.
 *
 * ⚠️ **두수 산정은 세목별로 다르다** — 양도세는 별표1의3 2호(최근 3~6 과세기간 중 선택한
 * 기간의 최고사육두수 **평균**), 재산세는 §102①3호 본문(**직전 연도** 연중 최고 마릿수).
 * 정본 모듈은 **1두당 면적만** 제공하고 두수 산정은 각 세목이 맡는다.
 *
 * 🔴 **2026-08-06 산식 정정** — 「초지 **또는** 사료포」를 문언대로 **max**로 읽는다.
 * 종전에는 넷을 모두 합산했다(한우 사육 1두 7,512.5㎡ → 5,012.5㎡). 한도가 줄어
 * **비사업용 판정이 늘어나는 방향**이다. 권위 있는 근거는 찾지 못했다(해석례 0건) —
 * 경위·재검토 조건: `docs/02-design/features/livestock-standard-area-limit.plan.md`
 */

export {
  LIVESTOCK_STANDARD,
  LIVESTOCK_LABELS,
  perUnitStandardArea,
  computeLivestockStandardArea,
  type LivestockStandard,
} from "../../livestock-standard-area";

import { computeLivestockStandardArea } from "../../livestock-standard-area";

/**
 * @deprecated 정본 이름은 `computeLivestockStandardArea`다. 기존 호출부 하위 호환용 별칭.
 */
export const getLivestockStandardArea = computeLivestockStandardArea;
