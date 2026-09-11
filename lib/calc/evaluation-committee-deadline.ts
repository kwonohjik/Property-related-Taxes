/**
 * 평가심의위원회 신청·통지 기한 (상증령 §49의2⑤·⑥)
 *
 * ## 실측 근거 (KoreanLaw · 상증법 시행령 제49조의2, 시행 2026-02-27)
 *
 * - **⑤ 신청기한**: 「법 제67조에 따른 상속세 과세표준 신고기한 만료 **4개월 전**
 *   (증여의 경우에는 법 제68조에 따른 증여세 과세표준 신고기한 만료 **70일 전**)까지 신청해야 한다」
 * - **⑥ 통지기한**: 「해당 상속세 과세표준 신고기한 만료 **1개월 전**
 *   (증여의 경우에는 증여세 과세표준 신고기한 만료 **20일 전**)까지 그 결과를 서면으로 통지해야 한다」
 *
 * ## 이 모듈이 왜 다시 쓰였나 (IG-058)
 *
 * 종전 `inheritanceApplicationDeadline`·`giftApplicationDeadline`은 이름이 「신청기한」인데
 * **신고기한 그 자체**를 반환했다. 결과 카드가 그 값을 D-N으로 표시해 **상속은 4개월,
 * 증여는 70일 늦은 날짜**를 신청기한으로 안내했다 — 그 카운트다운을 믿고 기다리면
 * §54⑥ 신청 자체가 불가능해진다. 같은 화면의 `EvaluationCommitteeFilingGuideCard`는
 * 「4개월 전」이라 적어 **두 카드가 서로 다른 기한**을 말하고 있었다.
 *
 * ⇒ 이름을 사실과 맞추고(`…FilingDeadline` = 신고기한), 신청·통지 기한을 별도 파생한다.
 * 신고기한 산정은 저장소 정본 헬퍼(`inheritance-gift-filing-deadline.ts`)에 위임한다 —
 * §67④ 비거주자 9개월 분기가 그쪽에만 있다.
 *
 * 본 모듈은 UI 카운트다운(D-N일) 표시용이다. 본 결과(보충적 평가가액)에 영향 없음.
 */

import { addMonths, differenceInCalendarDays, parseISO, subDays, subMonths } from "date-fns";
import {
  getGiftFilingDueDates,
  getInheritanceFilingDueDates,
} from "@/lib/calc/inheritance-gift-filing-deadline";

export type EvaluationTaxKind = "inheritance" | "gift";

/** 상속세 신고기한 (§67① 말일 + 6개월 · §67④ 비거주자 9개월). 정본 헬퍼 위임. */
export function inheritanceFilingDeadline(
  deathDate: Date,
  decedentType?: "resident" | "non_resident",
): Date {
  const iso = getInheritanceFilingDueDates(toISO(deathDate), decedentType).filing;
  return iso ? parseISO(iso) : addMonths(deathDate, 6);
}

/** 증여세 신고기한 (§68① 말일 + 3개월). 정본 헬퍼 위임. */
export function giftFilingDeadline(giftDate: Date): Date {
  const d = getGiftFilingDueDates(toISO(giftDate));
  return d ? parseISO(d.filing) : addMonths(giftDate, 3);
}

/**
 * 평가심의위 **신청기한** (§49의2⑤).
 *   상속 = 신고기한 − 4개월 · 증여 = 신고기한 − 70일
 */
export function evaluationCommitteeApplicationDeadline(
  baseDate: Date,
  taxKind: EvaluationTaxKind,
  decedentType?: "resident" | "non_resident",
): Date {
  return taxKind === "inheritance"
    ? subMonths(inheritanceFilingDeadline(baseDate, decedentType), 4)
    : subDays(giftFilingDeadline(baseDate), 70);
}

/**
 * 평가심의위 **통지기한** (§49의2⑥).
 *   상속 = 신고기한 − 1개월 · 증여 = 신고기한 − 20일
 */
export function evaluationCommitteeNotificationDeadline(
  baseDate: Date,
  taxKind: EvaluationTaxKind,
  decedentType?: "resident" | "non_resident",
): Date {
  return taxKind === "inheritance"
    ? subMonths(inheritanceFilingDeadline(baseDate, decedentType), 1)
    : subDays(giftFilingDeadline(baseDate), 20);
}

/** 기한까지 남은 일수 (양수 = 미래, 음수 = 초과). */
export function daysUntilDeadline(deadline: Date, today: Date = new Date()): number {
  return differenceInCalendarDays(deadline, today);
}

/** Date → "YYYY-MM-DD" (로컬 기준 — 정본 헬퍼가 parseISO로 로컬 자정을 쓴다). */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
