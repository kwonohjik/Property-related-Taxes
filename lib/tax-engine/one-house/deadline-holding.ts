/**
 * §155⑦3호·⑧ 기한 축 — **기한일에 양도했더라도 §154① 보유·거주 요건이 충족되는가** (S07-4)
 *
 * §155⑦ 단서와 ⑧은 기한 안에 일반주택을 양도해도 「제154조제1항을 적용한다」. 일반주택의 보유 2년은 **양도일**에 판정하므로,
 * 기한일(귀농주택 취득일 + 5년 · 부득이 사유 해소일 + 3년)에 양도했다면 그 날 기준으로 보유 2년이 채워져 있어야 비과세다.
 * 입력 양도일이 기한 뒤라 보유 2년을 채웠어도 기한일에는 못 채웠다면 「이 날까지 양도하면 비과세」는 이룰 수 없는 약속이다.
 *
 * 🔑 판정을 다시 쓰지 않는다 — 양도일만 기한일로 바꿔 정본 술어(`meetsOneHouseHoldingResidence`)를 그대로 부른다.
 *    `pending.ts`(안내를 낼지)와 `unmet-exceptions.ts`(안내를 내지 않는 사유)가 같은 함수를 쓴다.
 */
import { baseRequirementPhrase } from "./base-requirement-phrase";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import { meetsOneHouseHoldingResidence, type ExemptionReqInput } from "../transfer-tax-exemption-requirements";

type OneHouseRule = OneHouseSpecialRulesData["one_house_exemption"];

/** 기한 말일(`deadlineEnd`)에 양도했다면 §154① 보유·거주 요건을 충족하는가. */
export function meetsHoldingResidenceOnDeadline(
  input: ExemptionReqInput,
  rule: OneHouseRule,
  deadlineEnd: Date,
): boolean {
  return meetsOneHouseHoldingResidence({ ...input, transferDate: deadlineEnd }, rule);
}

/**
 * 기한이 지난 뒤 양도한 세대가 **기한 안내를 받지 못하는 이유** — 입력 양도일 기준으로는 §154①을 충족하지만(그 요건 하나만 모자란 게 아니다)
 * 기한 말일 기준으로는 충족하지 못할 때의 사유 문장. 그 밖에는 `undefined`.
 *
 * 호출부가 「양도일이 기한 뒤이고, 이 축의 다른 요건은 모두 충족」을 먼저 확인한다.
 */
export function deadlineHoldingUnmetReason(
  input: ExemptionReqInput,
  rule: OneHouseRule,
  deadlineEnd: Date,
  deadlineLabel: string,
): string | undefined {
  if (meetsHoldingResidenceOnDeadline(input, rule, deadlineEnd)) return undefined;
  return (
    `${deadlineLabel}의 말일(${deadlineEnd.toISOString().slice(0, 10)})이 지난 뒤 양도했습니다. 그 말일에 양도했더라도 ` +
    // 그 말일에 양도한 것으로 판정했으므로 연혁도 말일 기준이다(X2-3).
    `${baseRequirementPhrase(deadlineEnd, rule)} 요건을 충족하지 못해, ` +
    "기한 안에 양도하는 것으로는 이 특례가 성립하지 않습니다."
  );
}
