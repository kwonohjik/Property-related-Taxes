/**
 * 기한 후 신고 무신고가산세 감면 — 「국세기본법」 §48②2호 · §48②3호라목 (🔴 G-05)
 *
 * ## 왜 별도 파일인가
 *
 * 이 감면은 **세목 중립**이다. `calculateFilingPenalty`(부동산·주식 정본)와
 * `calcInheritanceGiftFilingPenalty`(상속·증여)가 **같은 규칙**을 쓰므로, 감면율 결정을
 * 세목 파일 안에 두면 조문 개정 때 한쪽만 고쳐져 조용히 갈린다. 이 저장소가 반복해서
 * 잡은 결함 유형이다(가산세 코드리뷰 뿌리 R-1 「같은 규칙의 복수 구현」).
 *
 * ## 두 조문의 우열 — 라목이 지배한다
 *
 * §48②3호라목은 「**제2호에도 불구하고**」로 시작한다. 예정신고기한까지 예정신고를 하지
 * 않았고 **확정신고기한까지** 기한 후 신고를 했다면 경과기간과 무관하게 **일률 50%**이고,
 * 2호의 체감표(50/30/20)는 배제된다. 그래서 확정신고기한을 넘긴 뒤에야 2호로 내려온다.
 *
 * ## 대상 가산세
 *
 * 두 조문 모두 「**제47조의2에 따른 가산세만** 해당」이다 — 무신고가산세 전용이다.
 * 과소신고(§47의3)는 §48②**1호**(수정신고)가, 납부지연(§47의4)은 어느 쪽도 담당하지 않는다.
 * 호출부가 `filingType === "none"` 으로 게이트한다.
 *
 * ## 배제 단서
 *
 * 두 조문 모두 「과세표준과 세액을 결정(경정)할 것을 **미리 알고** 기한 후 신고를 한 경우는
 * 제외」한다. 이것이 `priorAssessmentNotified` 다 — §48②1호(수정신고) 경로가 이미 같은
 * 이름으로 모델링하고 있고(`transfer-tax-amendment.ts`), 그 계약을 그대로 따른다.
 * **입력 없이 감면율을 무조건 곱하면 반대 방향(과소산정) 결함이 된다.**
 *
 * @see docs/reviews/penalty-code-review-2026-09.md §G-05
 */

import { addMonths, isAfter, parseISO } from "date-fns";
import {
  LATE_FILING_45_3,
  LATE_FILING_REDUCTION_48_2_2,
  LATE_FILING_REDUCTION_48_2_2_TABLE,
  LATE_FILING_REDUCTION_48_2_3_RA,
  LATE_FILING_REDUCTION_48_2_3_RA_RATE,
} from "./legal-codes/common";

/** 기한 후 신고 감면 판정 입력 */
export interface LateFilingReductionInput {
  /**
   * 법정신고기한. 양도소득세는 **예정신고기한**(소득세법 §105①)이고,
   * 상속은 §67①·§67④, 증여는 §68① 이다. 호출부가 파생해 넘긴다.
   */
  statutoryDeadline?: Date | string;
  /** 실제 기한 후 신고일 (「국세기본법」 §45의3) */
  actualFilingDate?: Date | string;
  /**
   * 확정신고기한. **있으면 §48②3호라목 판정에 쓴다** — 양도소득세 §110①(다음 해 5월 31일).
   *
   * ⚠️ 예정신고 제도가 없는 세목(상속·증여)은 **넘기지 않는다**. 넘기면 라목이 성립하지
   *    않는 국면에 일률 50%가 붙어 과소산정이 된다.
   */
  finalReturnDeadline?: Date | string;
  /** 「결정·경정할 것을 미리 알고」 제출 — 두 조문 공통 배제 단서 */
  priorAssessmentNotified?: boolean;
}

/** 감면 판정 결과 */
export interface LateFilingReduction {
  /** 감면율 (0 · 0.2 · 0.3 · 0.5) */
  rate: number;
  /** 적용 조문 — 감면이 없으면 빈 문자열 */
  ruleRef: string;
}

const NONE: LateFilingReduction = { rate: 0, ruleRef: "" };

function toDateOrNull(v: Date | string | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? parseISO(v) : v;
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 기한 후 신고 감면율 결정 — 라목 우선, 그다음 2호 체감표.
 *
 * 기한·신고일이 없으면 0을 돌려준다(방어적 — 입력이 없으면 감면을 만들지 않는다).
 */
export function resolveLateFilingReduction(
  input: LateFilingReductionInput,
): LateFilingReduction {
  if (input.priorAssessmentNotified) return NONE;

  const deadline = toDateOrNull(input.statutoryDeadline);
  const filingDate = toDateOrNull(input.actualFilingDate);
  if (!deadline || !filingDate) return NONE;

  // 기한 내 신고면 애초에 기한 후 신고가 아니다.
  if (!isAfter(filingDate, deadline)) return NONE;

  // ── §48②3호라목 — 「제2호에도 불구하고」 확정신고기한 이내면 일률 50% ──
  const finalDeadline = toDateOrNull(input.finalReturnDeadline);
  if (finalDeadline && !isAfter(filingDate, finalDeadline)) {
    return {
      rate: LATE_FILING_REDUCTION_48_2_3_RA_RATE,
      ruleRef: `${LATE_FILING_REDUCTION_48_2_3_RA} (${LATE_FILING_45_3})`,
    };
  }

  // ── §48②2호 — 1개월 50% · 3개월 30% · 6개월 20% (오름차순 순차 매칭) ──
  for (const { maxMonths, rate } of LATE_FILING_REDUCTION_48_2_2_TABLE) {
    if (!isAfter(filingDate, addMonths(deadline, maxMonths))) {
      return { rate, ruleRef: `${LATE_FILING_REDUCTION_48_2_2} (${LATE_FILING_45_3})` };
    }
  }

  return NONE; // 6개월 초과 — 감면 없음
}
