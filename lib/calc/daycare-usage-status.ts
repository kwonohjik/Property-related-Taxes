/**
 * 「소득세법 시행령」 §167의3①8호의2 어린이집의 **사용 상태** — ⑤·④·⑧·⑫ 공용 (다주택 중과 판정 메뉴 P1 · Q-A).
 *
 * 법문(MST 290841 실독): 「…고유번호를 부여받은 후 5년 이상 어린이집으로 사용하고 **어린이집으로 사용하지 않게 된 날부터
 * 6개월이 경과하지 않은** 주택」. 종전 화면은 운영 연수만 받아, 사용을 그만둔 지 6개월이 지난 주택도 배제됐다.
 *
 * 「양도일 현재 어린이집으로 사용 중」과 사용 종료일은 택일이다 — §167의10①3호·7호의 기산 상태와 같은 규약
 * (`two-house-exclusion-status.ts`). 날짜도 선택도 없으면 「모름」이라 ⑧·⑫가 막고, 엔진은 불성립으로 본다
 * (`isDayCareCenterExempt`).
 */

export interface DayCareUsageStatusSource {
  isDayCareCenter?: boolean;
  dayCareEndDate?: string;
  dayCareInUse?: boolean;
}

const STATUS_MISSING =
  "어린이집: 사용하지 않게 된 날을 입력하거나 「양도일 현재 어린이집으로 사용 중」을 고르세요 (소득세법 시행령 §167의3①8호의2)";

/** ⑧·⑫ — 어린이집이 켜졌는데 사용 종료일도 「사용 중」 선택도 없으면 막는다. */
export function dayCareUsageStatusIssue(h: DayCareUsageStatusSource): { field: "dayCareEndDate"; message: string } | null {
  if (h.isDayCareCenter && h.dayCareInUse !== true && !h.dayCareEndDate) {
    return { field: "dayCareEndDate", message: STATUS_MISSING };
  }
  return null;
}

/** ⑫ 전용 — 사용 종료일과 「사용 중」이 함께 오면 모순(⑤가 선택 시 날짜를 지우고 ④가 남은 날짜를 싣지 않는다). */
export function dayCareUsageStatusConflict(h: DayCareUsageStatusSource): { field: "dayCareEndDate"; message: string } | null {
  if (h.isDayCareCenter && h.dayCareInUse === true && h.dayCareEndDate) {
    return {
      field: "dayCareEndDate",
      message: "어린이집 사용 종료일과 「양도일 현재 어린이집으로 사용 중」은 함께 보낼 수 없습니다 (소득세법 시행령 §167의3①8호의2)",
    };
  }
  return null;
}

/** ④ — 어린이집이 켜졌을 때만 싣는다. 「사용 중」을 골랐으면 남은 날짜는 싣지 않는다. */
export function dayCareUsageStatusPayload(h: DayCareUsageStatusSource): { dayCareEndDate?: string; dayCareInUse?: true } {
  if (!h.isDayCareCenter) return {};
  if (h.dayCareInUse === true) return { dayCareInUse: true };
  return h.dayCareEndDate ? { dayCareEndDate: h.dayCareEndDate } : {};
}
