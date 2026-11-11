/**
 * 무신고·과소신고가산세 **기준금액 시기 구분** (정적 상수) — 계획서 `docs/00-pm/stock-penalty-base-guideline-v15.plan.md` Q-2 a.
 *
 * 국세기본법 §47조의2①·§47조의3①의 «그 신고로 납부하여야 할 세액»(무신고납부세액·과소신고납부세액등) 기준은 개정 부칙
 * **제12848호(2014.12.23.) 제10조②**에 따라 양도소득세에서 **2015년 7월 1일 이후 양도하는 분부터** 적용된다
 * (KoreanLaw 부칙 원문 실독, 2026-11-11). 그 전 양도분은 종전 규정 — 무신고는 «산출세액등»의 20%(서면법규과-623이 인용한 2011년 시행본),
 * 국세청 구 해석 재일46014-686(1994.4.23.)은 «예정신고납부세액공제가 있는 경우라도 산출세액을 기준»이라 했다. 과소신고는 과소신고
 * 소득금액 비율 × 산출세액이라 구조가 다르다.
 *
 * 엔진 `calculateFilingPenalty`(`transfer-tax-penalty.ts`)는 양도일을 받지 않고 모든 양도일에 현행 기준(결정세액 − 기납부 − 당초신고 − 이자상당액)을
 * 쓴다. 종전 규정을 구현하지 않고(시행본별 내용·한시 특례가 달라 범위가 크다 — 계획서 Q-2 b 비권고) **세액 불변 고지**만 싣는다.
 */
import { PENALTY } from "../legal-codes";

/** 양도일 기준 경계 — 이 날 **이후** 양도분부터 현행 «납부세액» 기준 (부칙 제12848호 제10조②). */
export const FILING_PENALTY_BASE_ERA_START = "2015-07-01";

const dayKey = (d: string | Date): string => {
  if (typeof d === "string") return d.slice(0, 10);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
};

/** 양도일이 2015-07-01 **전**인가(종전 규정 적용 양도분). */
export function isFilingPenaltyBaseEraBefore(transferDate: string | Date): boolean {
  return dayKey(transferDate) < FILING_PENALTY_BASE_ERA_START;
}

/** 고정 문구 — 값이 없는 정적 문자열이라 종목 행 경고에서 동등 비교로 걷어낼 수 있다. */
export const FILING_PENALTY_BASE_ERA_NOTICE =
  `${PENALTY.NON_FILING}·${PENALTY.UNDER_FILING}의 가산세 기준(그 신고로 납부하여야 할 세액)은 2015년 7월 1일 이후 양도하는 분부터 적용됩니다` +
  `(${PENALTY.ADDENDUM_2015}). 그 전에 양도한 분은 종전 규정(산출세액 기준 등)이 적용돼 이 가산세 계산(현행 기준)과 다를 수 있습니다 — ` +
  `양도일 시점의 규정을 직접 확인하세요(확인 필요).`;

/**
 * 시기 고지 문구 — 신고 위반을 **선언했고**, 가산세가 **실제로 계산됐고**(`penalty > 0`), 양도일이 2015-07-01 전일 때만.
 * 가산세가 0이면 기준 차이가 금액에 영향을 주지 않으므로 싣지 않는다(`penaltyEcho`의 «0이면 아무것도 싣지 않는다» 규약과 같다).
 */
export function stockFilingPenaltyEraNotice(input: {
  filingViolation?: "none" | "under_report" | "non_report";
  transferDate?: string | Date;
  penalty: number;
}): string | undefined {
  if (!input.filingViolation || input.filingViolation === "none") return undefined;
  if (input.penalty <= 0) return undefined;
  if (!input.transferDate) return undefined;
  return isFilingPenaltyBaseEraBefore(input.transferDate) ? FILING_PENALTY_BASE_ERA_NOTICE : undefined;
}
