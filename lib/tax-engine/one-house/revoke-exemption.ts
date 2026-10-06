import type { OneHouseJudgment } from "./types";

/**
 * 「임대주택을 주택 수에서 뺀」 전제로 낸 비과세를 거둔다 — 판정 메뉴(위)와 계산기 STEP 1(D12, §155⑳ 세대 구성
 * 불성립)이 같은 불변식을 쓴다.
 */
export function revokeOneHouseExemption(judgment: OneHouseJudgment): OneHouseJudgment {
  /**
   * 🔴 비과세를 끄면 **비과세 사유도 함께 지운다**(OH-53). 코어 판정이 남긴
   *    `exemptReason`(「1세대1주택 비과세」)과 `appliedExceptions`는 **비과세였을 때의 근거**다.
   *    그대로 두면 결과 화면이 「과세」 배지 바로 아래에 「1세대1주택 비과세」와 「적용된 특례」
   *    카드를 함께 그린다. 코어 판정도 과세일 때는 두 필드를 비워 낸다 — 같은 불변식을 지킨다.
   */
  //    요건 순차 검토(`requirementReview`)도 같은 이유로 지운다 — 코어 판정 기준으로 「전 요건 충족」인
  //    행을 과세 배지 아래에 그리면 모순이다. §155⑳ 불충족 사유는 임대주택 카드가 말한다(2026-09-29).
  return {
    ...judgment,
    isExempt: false,
    isPartialExempt: false,
    exemptReason: undefined,
    appliedExceptions: [],
    requirementReview: undefined,
  };
}
