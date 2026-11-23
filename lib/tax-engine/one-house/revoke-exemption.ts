import { FINAL_ONE_HOUSE_RESTART_UNVERIFIED_ID } from "./era-undetermined";
import { deriveLegalBasis } from "./legal-basis";
import { REVERSE_DOUBLE_MERGE_UNVERIFIED_ID } from "./pending";
import { INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID } from "./overlap-notice";
import type { OneHouseJudgment } from "./types";
import { NEW_HOUSE_ORIGIN_UNCOLLECTED_ID, NEW_HOUSE_PRESALE_HOLDING_ID } from "./new-house-origin";
import { RURAL_FARMLAND_990_ERA_ID } from "./rural-return-to-farm-facts";
import { PRE2010_PARENTAL_CARE_EXCEPTION_ID, REINHERITANCE_REFERENCE_DATE_ID } from "./era-undetermined";
import { TRANSITION_2002_UNVERIFIED_ID } from "./era-undetermined-temp-two-house";

/**
 * **비과세로 판정됐을 때만** 내는 판정 보류 — 「그 비과세 결론의 전제」를 확인하라는 고지다
 * (`collectUndetermined`·`reverseDoubleMergeUndetermined`가 `settled`로 게이트한다). 비과세를 거두면 전제가 없다.
 */
const SETTLED_PREMISE_UNDETERMINED_IDS: ReadonlySet<string> = new Set([
  FINAL_ONE_HOUSE_RESTART_UNVERIFIED_ID,
  REVERSE_DOUBLE_MERGE_UNVERIFIED_ID,
  INHERITED_SPECIAL_OVERLAP_UNVERIFIED_ID,
  // 2026-11 리뷰 D-37 — 결정 #43·#44 고지도 `settled`로 게이트한다(`era-undetermined.ts`). 빠져 있어 비거주자·멸실 회수 뒤에도 남았다.
  NEW_HOUSE_PRESALE_HOLDING_ID,
  NEW_HOUSE_ORIGIN_UNCOLLECTED_ID,
  RURAL_FARMLAND_990_ERA_ID,
  // D-69 — 재상속 기준일·2010.2.18. 전 동거봉양 예외 고지(이제 `settled` 게이트)
  REINHERITANCE_REFERENCE_DATE_ID,
  PRE2010_PARENTAL_CARE_EXCEPTION_ID,
  // 2026-11 리뷰 I-26 — 2002 부칙 경과조치 고지(이제 `settled` 게이트)
  TRANSITION_2002_UNVERIFIED_ID,
]);

/**
 * 비과세 전제 고지인가 — 고정 id 집합 + §89② 판정 보류 `89-2-open:*`·독법 고지 `89-2-reading:*`(`pending.ts`가 `settled`로 게이트 ·
 * id가 동적이라 접두로 · D-37 2차 보강 → I-26 모든 항 · 표 확장에서 독법 고지).
 */
function isSettledPremiseUndetermined(id: string): boolean {
  return SETTLED_PREMISE_UNDETERMINED_IDS.has(id) || id.startsWith("89-2-open:") || id.startsWith("89-2-reading:");
}

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
    undetermined: judgment.undetermined.filter((u) => !isSettledPremiseUndetermined(u.id)),
    legalBasis: deriveLegalBasis(appliedExceptions, judgment.pending),
    requirementReview: undefined,
    // 사후관리(추징)는 받은 비과세가 전제다 — 거두면 고지도 없다(G5-7).
    postManagementNotices: undefined,
    // §89② 예외 표시 줄도 받은 비과세가 전제다 — 거두면 지운다(위 `legalBasis` 재수집과 같은 이유).
    article89ExceptionApplied: undefined,
  };
}
