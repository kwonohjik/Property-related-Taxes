import { FINAL_ONE_HOUSE_RESTART_UNVERIFIED_ID } from "./era-undetermined";
import { deriveLegalBasis } from "./legal-basis";
import { REVERSE_DOUBLE_MERGE_UNVERIFIED_ID } from "./pending";
import { INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID } from "./overlap-notice";
import type { OneHouseJudgment } from "./types";

/**
 * **비과세로 판정됐을 때만** 내는 판정 보류 — 「그 비과세 결론의 전제」를 확인하라는 고지다
 * (`collectUndetermined`·`reverseDoubleMergeUndetermined`가 `settled`로 게이트한다). 비과세를 거두면 전제가 없다.
 */
const SETTLED_PREMISE_UNDETERMINED_IDS: ReadonlySet<string> = new Set([
  FINAL_ONE_HOUSE_RESTART_UNVERIFIED_ID,
  REVERSE_DOUBLE_MERGE_UNVERIFIED_ID,
  INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID,
]);

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
  /*
   * 🔴 S07-7 — 위 둘만 지우면 **같은 비과세를 전제로 한 파생값**이 남았다. 과세 판정의 불변식(코어가 과세를 낼 때와 같은 모양):
   *   - `deemedOneHouseBy155` — 표2 「1주택」은 §155 각 항 의제가 **실제로 성립한** 경우다(영 §159의4). 비과세를 거뒀으면
   *     의제도 없다. 남기면 계산기 D12가 장기보유특별공제를 표2로 낸다(실측 56% ↔ 표1 22%).
   *   - `legalBasis` — 「appliedExceptions·pending에서 모은다」는 파생값이다(`types.ts`). 다시 모은다(남은 pending은 유지).
   *   - `undetermined` 중 비과세 결론을 전제로 한 보류(재기산 이력 미답·D4 역순 이중 합가).
   * 비거주자(`non-resident.ts`)·판정 메뉴 §155⑳(`rental-housing-verdict.ts`)·계산기 D12(`transfer-tax-rental-housing-judge.ts`)
   * 세 호출부가 이 한 함수를 거친다.
   */
  const appliedExceptions: OneHouseJudgment["appliedExceptions"] = [];
  return {
    ...judgment,
    isExempt: false,
    isPartialExempt: false,
    exemptReason: undefined,
    deemedOneHouseBy155: undefined,
    appliedExceptions,
    undetermined: judgment.undetermined.filter((u) => !SETTLED_PREMISE_UNDETERMINED_IDS.has(u.id)),
    legalBasis: deriveLegalBasis(appliedExceptions, judgment.pending),
    requirementReview: undefined,
    // 사후관리(추징)는 받은 비과세가 전제다 — 거두면 고지도 없다(G5-7).
    postManagementNotices: undefined,
  };
}
