/**
 * §155①2호 「모름」 고지의 **반사실 입력** — 결론을 가를 때만 확인 필요를 고지하기 위한 두 독법 (#30 · #32)
 *
 * 신규 취득 당시 두 주택의 조정 여부·세대전원 전입일을 모르면 엔진은 불성립 독법(두 주택 모두 조정대상지역 · 전입 미충족)으로
 * 계산한다. 그 독법이 비과세·부분과세 **결론**을 실제로 바꿀 때만 판정 보류(확인 필요)를 고지한다 — 결론이 같으면 입력을 요구해도
 * 달라지는 것이 없다(2026-10-04 원칙 1). 이 파일은 그 판단에 쓰는 반사실 입력을 만든다. 판정 본체를 두 번 돌리는 일은
 * `transfer-tax-exemption.ts`의 `checkExemption`이 한다(거주요건 `residenceDecidesConclusion`과 같은 방식).
 */
import type { OneHouseJudgeInput } from "./types";

/**
 * 「신규 취득 당시 두 주택이 모두 조정대상지역은 아니었다」고 읽은 입력 — 신규 주택 소재지 코드를 지우고 선언을 `false`로 둔다.
 * (코드가 있으면 선언을 이기므로 코드를 지워야 공고일 표 미확인 같은 코드 기반 판정도 같은 독법으로 바뀐다.)
 */
export function withNotBothRegulated(input: OneHouseJudgeInput): OneHouseJudgeInput | undefined {
  const tt = input.temporaryTwoHouse;
  if (!tt) return undefined;
  return {
    ...input,
    temporaryTwoHouse: { ...tt, newHouseRegionCode: undefined, newHouseRegulatedAtAcquisition: false },
  };
}

/** 「세대전원이 신규 주택 취득일에 전입했다」고 읽은 입력 — 가목의 1년 기한(기존 임차인 단서 포함) 안이다. */
export function withMoveInWithinYear(input: OneHouseJudgeInput): OneHouseJudgeInput | undefined {
  const tt = input.temporaryTwoHouse;
  if (!tt) return undefined;
  return { ...input, temporaryTwoHouse: { ...tt, wholeHouseholdMoveInDate: tt.newAcquisitionDate } };
}

/**
 * 반사실 입력으로 본체 판정을 다시 돌려 비과세·부분과세 결론이 달라지는가 — §89② 배제가 확정이면 본체 판정과 무관하게 과세라 가르지 않는다.
 * `core`는 `checkExemptionCore`다(순환 import를 피하려고 함수로 받는다).
 */
export function counterfactualVerdictDiffers(
  input: OneHouseJudgeInput,
  core: (i: OneHouseJudgeInput) => { isExempt: boolean; isPartialExempt: boolean },
  article89Excluded: boolean,
  counterfactual: (i: OneHouseJudgeInput) => OneHouseJudgeInput | undefined,
): boolean {
  const other = counterfactual(input);
  if (article89Excluded || !other) return false;
  const key = (r: { isExempt: boolean; isPartialExempt: boolean }) => `${r.isExempt}|${r.isPartialExempt}`;
  return key(core(input)) !== key(core(other));
}
