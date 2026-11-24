/**
 * NBL-STATE-HISTORY-E3-④ M-1 — 13호(무주택 1세대 1필지 나지)의 「세대 주택 소유 기간」 행이 **판정에 닿을 수 있는가**를 엔진 core 실측으로 판정한다.
 *
 * 순수 입력 술어 `vacantLotHousePeriodsRead`(호 · 꼬리 건물 · 이력 · 의제 · 면적)는 «읽을 수 있는» 필요조건일 뿐이다. 판정 흐름은 그 앞에서 끝날 수 있다 —
 *   · 나목 Step 3-1(비종합합산 선언 + 확인된 근거 — 별도합산·분리과세·비과세)이 13호보다 먼저 사업용으로 통과(이력 경로도 13호를 끈 core가 이미 전 구간을 사업용으로 본다)
 *   · 수입금액비율(§168의11② 업종) 경로가 먼저 결론
 *   · 꼬리 건물 + 이력 `changed`인데 core가 부분 면적(건물 배율 초과 · 2% 미달 등)이라 `applyStateHistory`가 이력 전체를 접음
 * 이 경로들은 행이 있어도 판정에 닿지 않는다. 입력 몇 칸으로 근사하지 않고(분기가 여럿이고 서로 얽힌다 — E3-③ `otherLandAreaIsPartial` 선례) **엔진을 그대로 두 번 돌려** 얻는다:
 * 행 없음 vs 소유기간 전체를 덮는 «탐침 행» 하나. 두 판정(사업용 여부 · 사업용 일수 · 면적 안분 · 단계)이 다르면 행이 판정에 닿는다. 13호 기여는 행이 많을수록 줄기만 하므로(합집합 항 — D-3)
 * 전부 덮는 탐침 행과 같으면 어떤 행도 판정을 바꾸지 못한다. 판정 로직을 따로 재구현하지 않으므로 엔진과 어긋날 수 없다.
 *
 * ④ 전송 · ⑤ 위젯 노출·미리보기 · ⑧ HH-1~3이 모두 이 함수(UI 래퍼 `vacantLotHousePeriodsReadOf`가 호출)만 쓴다.
 * 한계: 호출자가 넘기는 규칙(기본 규칙)으로 돈다 — 서버는 DB 규칙을 덮어쓴다. 행 영향 여부는 기간기준 임계가 아니라 경로로 정해지지만 임계 경계의 판정 뒤집힘은 규칙에 따라 다를 수 있다.
 */
import { VACANT_LOT_HO } from "./other-land-vacant-lot-history";
import { judgeOtherLand } from "./other-land";
import { getOwnershipStart } from "./utils/period-math";
import type { CategoryJudgeResult } from "./types";
import type { DateInterval } from "./types";
import type { NonBusinessLandInput } from "./types";
import type { NonBusinessLandJudgmentRules } from "./types";

const judgmentSignature = (r: CategoryJudgeResult): string =>
  JSON.stringify({
    isBusiness: r.isBusiness,
    effectiveBusinessDays: r.effectiveBusinessDays,
    ratio: r.businessUseRatio,
    area: r.areaProportioning?.nonBusinessRatio ?? null,
    steps: r.steps.map((s) => `${s.id}:${s.status}`),
  });

export function otherLandReadsHouseholdHousePeriods(rawInput: NonBusinessLandInput, rules: NonBusinessLandJudgmentRules): boolean {
  const o = rawInput.otherLand;
  if (!o || o.relatedBusinessType !== VACANT_LOT_HO) return false;
  const start = getOwnershipStart(rawInput.acquisitionDate);
  const end = rawInput.transferDate;
  if (end.getTime() <= start.getTime()) return false;
  const withRows = (householdHousePeriods: DateInterval[] | undefined): NonBusinessLandInput => ({ ...rawInput, otherLand: { ...o, householdHousePeriods } });
  return judgmentSignature(judgeOtherLand(withRows(undefined), rules)) !== judgmentSignature(judgeOtherLand(withRows([{ start, end }]), rules));
}
