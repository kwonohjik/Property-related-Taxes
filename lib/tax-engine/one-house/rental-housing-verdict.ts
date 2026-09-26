/**
 * §155⑳ 장기임대주택 보유자 거주주택 특례 — **판정 메뉴용 결론** (P4-3a)
 *
 * 계획서 Q-7. 「판정 사실은 판정 메뉴 · 세액 산식 입력은 계산기」의 판정 쪽 절반이다.
 *
 * ## 🔴 이것이 없으면 판정 메뉴가 **오답을 낸다**
 *
 * §155⑳은 계산기에서 **STEP 2.5**(`checkExemption` 이후)에 돈다. 판정 route는
 * `judgeOneHouseExemptionFromInput`까지만 가므로 그 단계에 **닿지 않는다**.
 * 그래서 장기임대주택 보유자가 임대주택을 명부에서 빼고 판정하면, 요건을 **하나도 보지 않은 채**
 * 「1주택 → 비과세」가 나왔다. 임대 요건을 못 갖춘 세대에게 비과세라고 답하는 것이다.
 *
 * ## 🔑 판정은 **계산기와 같은 leaf**가 한다
 *
 * `judgeRentalHousingEligibility`(`transfer-tax-rental-housing-step.ts`)가 유일한 소스다.
 * 보유·거주 연수 도출과 §155의3 거주기간 면제까지 그 안에 있다 — 여기서 다시 세지 않는다.
 * §161 안분 입력(`priorResidenceTransferDate`·`standardPriceAt*`)은 **보지 않는다**(Q-7 분할선).
 */
import { judgeRentalHousingEligibility } from "../transfer-tax-rental-housing-step";
import { TRANSFER_RENTAL_HOUSING } from "../legal-codes/transfer";
import type { TransferTaxInput } from "../types/transfer.types";
import type { OneHouseJudgment } from "./types";

/** 판정 메뉴 ④가 읽는 §155⑳ 결론. 금액·안분은 담지 않는다(세액은 계산기의 몫). */
export type OneHouseRentalHousingVerdict = {
  /** A: 거주주택 양도 · B: 임대주택→거주주택 전환 후 양도(§161① 안분) */
  scenario: "A" | "B";
  /** 요건 충족 여부 — 최소 1호 통과 + 거주주택 보유·거주 2년 */
  passed: boolean;
  /** 거주주택 요건 미충족 사유(보유 2년·거주 2년) */
  residenceFailReasons: string[];
  /** 임대주택 호별 미충족 사유 */
  unitFailReasons: { unitIndex: number; message: string }[];
  /** §155㉑로 통과한 호(0-based) — ㉒ 사후 추징 대상임을 알린다 */
  periodPendingUnitIndexes: number[];
  legalBasis: string;
};

/**
 * 특례를 선언하지 않았으면 `null` — 「판정할 것이 없다」이지 「미충족」이 아니다.
 * 이 둘을 한 값으로 합치면 화면이 선언하지도 않은 특례를 「미충족」이라 표시한다.
 */
export function buildRentalHousingVerdict(
  input: TransferTaxInput,
): OneHouseRentalHousingVerdict | null {
  const eligibility = judgeRentalHousingEligibility(input);
  if (!eligibility) return null;
  return {
    scenario: input.rentalHousingException?.scenario ?? "A",
    passed: eligibility.passed,
    residenceFailReasons: eligibility.residenceFailReasons,
    unitFailReasons: eligibility.failReasons.map((f) => ({
      unitIndex: f.unitIndex,
      message: f.message,
    })),
    periodPendingUnitIndexes: eligibility.periodPendingUnitIndexes ?? [],
    legalBasis: TRANSFER_RENTAL_HOUSING.PIT_RD_155_20,
  };
}

/**
 * 판정에 §155⑳ 결론을 **반영**한다.
 *
 * 🔴 **미충족이면 비과세를 끈다.** 판정 메뉴에서 임대주택은 명부에 넣지 않는 것이 전제라
 *    (특례가 주택 수에서 빼 주므로) 요건을 못 갖추면 그 주택들이 **다시 주택 수에 들어온다**.
 *    그대로 두면 계산기는 과세인데 판정 메뉴만 비과세라고 답한다 — 계산기의 STEP 1a
 *    조기반환 억제(`isPrhpScenarioAIneligible`)가 막고 있는 것과 **같은 over-exemption**이다.
 *
 * 🔑 **충족이면 손대지 않는다.** §155⑳은 거주주택을 1주택으로 «보아» §154①을 적용하라는
 *    조문이고, 그 §154① 판정은 이미 `checkExemption`이 했다. 여기서 비과세를 «주면»
 *    거주·보유요건을 두 번째 경로로 우회시키는 셈이 된다.
 *
 * 🔑 새 객체를 돌려준다 — 입력 judgment를 제자리에서 고치면 호출부가 원본을 로그에 남겼을 때
 *    이미 바뀐 값이 찍힌다.
 */
export function applyRentalHousingVerdict(
  judgment: OneHouseJudgment,
  verdict: OneHouseRentalHousingVerdict | null,
): OneHouseJudgment {
  if (!verdict || verdict.passed) return judgment;
  /**
   * 🔴 비과세를 끄면 **비과세 사유도 함께 지운다**(OH-53). 코어 판정이 남긴
   *    `exemptReason`(「1세대1주택 비과세」)과 `appliedExceptions`는 **비과세였을 때의 근거**다.
   *    그대로 두면 결과 화면이 「과세」 배지 바로 아래에 「1세대1주택 비과세」와 「적용된 특례」
   *    카드를 함께 그린다. 코어 판정도 과세일 때는 두 필드를 비워 낸다 — 같은 불변식을 지킨다.
   */
  return {
    ...judgment,
    isExempt: false,
    isPartialExempt: false,
    exemptReason: undefined,
    appliedExceptions: [],
  };
}
