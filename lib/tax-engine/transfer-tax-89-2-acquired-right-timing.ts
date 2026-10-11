/**
 * §89② 단서 — 권리를 **취득함으로써** 1주택 + 1권리가 된 세대의 타이밍 예외(800줄 정책 분리).
 *
 * · §156의2③·④ — 조합원입주권(승계취득 — 원조합원은 `one-house/original-member-right.ts`)
 * · §156의3②·③ — 분양권
 *
 * 부모 `transfer-tax-89-2-exclusion.ts`가 진입 조건(권리 1개 · 상속 ⑥ · 합가 ⑧⑨ · 대체주택 ⑤)을 모두 거른 뒤 부른다.
 * 이 파일은 부모를 **타입으로만** 참조한다(런타임 순환 없음).
 */
import type { PresaleRight } from "./types/multi-house-surcharge.types";
import type { Article89Clause2Input, Article89Clause2Result } from "./transfer-tax-89-2-exclusion";
import { presaleRightDefinitionAcquisitionDate } from "./presale-right-definition-date";
import { waivesPriorHouseOneYearGap } from "./transfer-tax-exemption-requirements";
import { rightTimingCore } from "./transfer-tax-89-2-right-timing-core";

/** 동일세대 상속 분양권을 피상속인 취득일로 셌는데 상속개시일로 세면 예외가 성립하는 경우의 확인 필요 문구. */
export const INHERITED_PRESALE_RIGHT_TIMING_START_NOTE =
  "동일세대원으로부터 상속받은 분양권은 피상속인이 취득한 날을 분양권 취득일로 보아 「종전주택 취득 후 1년」·" +
  "「분양권 취득일부터 3년」을 판정했습니다(동일세대 안의 상속은 새로운 취득이 아니라고 본 사전-2023-법규재산-0464 · " +
  "기획재정부 재산세제과-1033과 같은 기준). 분양권을 직접 다룬 해석은 확인되지 않았고 상속개시일로 세면 특례가 " +
  "적용되므로 확인이 필요합니다.";

/**
 * 권리를 **취득함으로써** 1주택 + 1권리가 된 세대의 타이밍 예외 — §156의2③·④(승계취득 입주권) · §156의3②·③(분양권).
 *
 * 권리 취득일은 `presaleRightDefinitionAcquisitionDate` — 동일세대 상속 분양권이면 피상속인 취득일이다
 * (§89② 대상 여부와 같은 leaf · 사용자 결정 2026-10-09). 상속개시일로 세면 예외가 성립하는데 피상속인 취득일로는
 * 성립하지 않으면 확인 필요를 얹는다(`confirmNotes`).
 */
export function resolveAcquiredRightTiming(
  input: Article89Clause2Input,
  right: PresaleRight,
  viaArticle: string | undefined,
): Article89Clause2Result {
  const householdAcq = presaleRightDefinitionAcquisitionDate(right);
  const result = timingFrom(input, right, householdAcq, viaArticle);
  if (householdAcq.getTime() === right.acquisitionDate.getTime() || result.status === "exception_met") return result;
  if (timingFrom(input, right, right.acquisitionDate, viaArticle).status !== "exception_met") return result;
  return { ...result, confirmNotes: [...(result.confirmNotes ?? []), INHERITED_PRESALE_RIGHT_TIMING_START_NOTE] };
}

function timingFrom(
  input: Article89Clause2Input,
  right: PresaleRight,
  rightAcq: Date,
  viaArticle: string | undefined,
): Article89Clause2Result {
  return rightTimingCore(input, waivesPriorHouseOneYearGap(input), right, rightAcq, viaArticle);
}
