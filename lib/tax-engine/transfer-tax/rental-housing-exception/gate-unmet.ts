/**
 * ⑳ **적용 전제(게이트) 불성립** 상세 — 미등기(§91①) · 1세대 아님 · 세대 구성 초과(「그 밖의 1주택」).
 *
 * 호별·거주 요건(`checkEligibility`)에 들어가기 **전에** 막히는 경로라 판정 계산(`calculateRentalHousingException`)이
 * 돌지 않는다. 종전에는 사유가 접힌 「전체 엔진 계산 과정」(`steps`)에만 남아 결과 카드가 없었다(V-7 후속).
 * 결과 카드(`RentalHousingExceptionDetailCard`)의 미적용 분기가 읽는 `eligibility`만 채운 `applied: false` 상세를 만든다 — 세액 불변.
 */
import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";
import type { RentalHousingExceptionInput, RentalHousingExceptionResult } from "./types";

/**
 * 게이트 단계라 계산하지 않은 상세 — 미적용 카드는 `eligibility`만 읽는다.
 * `scenarioId`는 타입이 요구하는 값일 뿐(A→RH-A1 · B→RH-B1)이고 고가 여부(A2·B2)는 구하지 않았다. 금액은 모두 0이다.
 */
export function buildGateUnmetDetail(
  rh: Pick<RentalHousingExceptionInput, "scenario">,
  gateFailReasons: string[],
): RentalHousingExceptionResult {
  return {
    applied: false,
    scenarioId: rh.scenario === "B" ? "RH-B1" : "RH-A1",
    eligibility: {
      passed: false,
      failReasons: [],
      residenceFailReasons: [],
      gateFailReasons,
      laws: [TRANSFER_RENTAL_HOUSING.PIT_RD_155_20],
    },
    taxableGain: 0,
    exemptGain: 0,
    appliedTable: "table-1",
    formulaTrace: { gain95Table1: 0, gain95Table2: 0, capApplied: false },
  };
}

/** 세대 구성 초과 — 판정은 돌았으나(`rhe`) 전제가 막은 경우. 계산값은 두되 적용 아님으로 표시한다. */
export function withGateUnmet(rhe: RentalHousingExceptionResult, reason: string): RentalHousingExceptionResult {
  return {
    ...rhe,
    applied: false,
    eligibility: {
      ...rhe.eligibility,
      passed: false,
      gateFailReasons: [...(rhe.eligibility.gateFailReasons ?? []), reason],
    },
  };
}
