/**
 * 「소득세법」 §95② **표2**(1세대1주택 장기보유특별공제)의 연혁 (OH-31 · Q-4 결정: 2009~2020 소급)
 * (개정 없는 확정 역사 데이터. 정적 상수.)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.7. 본문·부칙은 법제처 DRF 실독(2026-09-26).
 *
 * | 양도일 | 표2 공제율 | 표2 대상 거주요건 | 근거 |
 * |---|---|---|---|
 * | < 2009-01-01 | **미지원**(2008-03-21~12-31 시행본은 보유 연 4% — MST 84761 실측, 그 전은 미확인) | — | 호출부가 고지 |
 * | 2009-01-01 ~ 2019-12-31 | 보유 3년 이상 **연 8%**, 10년 이상 80% | **없음** | 법률 제9270호(MST 90470) 부칙 제2조② 「이 법 중 양도소득에 관한 개정규정은 이 법 시행 후 최초로 양도하는 분부터 적용한다」 |
 * | 2020-01-01 ~ 2020-12-31 | 같음(MST 212777 표2: 3년 24% … 10년 이상 80%) | **거주 2년** | 시행령 §159의3, 대통령령 제29242호 부칙 제1조 단서(2020-01-01 시행)·제3조(시행일 이후 양도분) |
 * | ≥ 2021-01-01 | 보유 4%(40%) + 거주 4%(40%) | 거주 2년(§159의4) | 법률 제17477호 부칙 제1조(2021-01-01 시행)·제2조(시행 이후 양도분) |
 */

import { TRANSFER } from "../legal-codes";

export type LthdTable2Era =
  | "unsupported"
  | "holding_8pct"
  | "holding_8pct_residence_2y"
  | "holding_residence_split";

/** 법률 제9270호 시행일 — 표2 연 8%(10년 80%) 적용 첫 양도일. 이 날 전은 미지원. */
export const LTHD_TABLE2_8PCT_TRANSFER_START = new Date("2009-01-01");
/** 대통령령 제29242호 부칙 제1조 단서 — 표2 대상에 거주 2년 요건(§159의3)이 붙는 첫 양도일. */
export const LTHD_TABLE2_RESIDENCE_REQ_TRANSFER_START = new Date("2020-01-01");
/** 법률 제17477호 시행일 — 표2가 보유분·거주분으로 나뉘는 첫 양도일. */
export const LTHD_TABLE2_SPLIT_TRANSFER_START = new Date("2021-01-01");

export function resolveLthdTable2Era(transferDate: Date): LthdTable2Era {
  const t = transferDate.getTime();
  if (t >= LTHD_TABLE2_SPLIT_TRANSFER_START.getTime()) return "holding_residence_split";
  if (t >= LTHD_TABLE2_RESIDENCE_REQ_TRANSFER_START.getTime()) return "holding_8pct_residence_2y";
  if (t >= LTHD_TABLE2_8PCT_TRANSFER_START.getTime()) return "holding_8pct";
  return "unsupported";
}

/** 2009~2020 표2 단일축 공제율 — 보유 3년 이상 연 8%, 80% 한도. 정수 %로 계산해 부동소수 누적을 피한다. */
export function table2HoldingOnlyRate(holdingYears: number): number {
  if (holdingYears < 3) return 0;
  return Math.min(holdingYears * 8, 80) / 100;
}

/**
 * 2009-01-01 전 양도분의 표2 **미지원 고지** — 현행 식으로 계산했다는 사실을 숨기지 않는다
 * (종합부동산세 미지원 연도 고지와 같은 층위 — `comprehensive-tax.ts`).
 */
export const LTHD_TABLE2_UNSUPPORTED_NOTICE =
  "2009년 1월 1일 전에 양도한 1세대1주택(고가주택)의 장기보유특별공제 표2 연혁은 지원하지 않습니다 — " +
  `현행 표2(보유 연 4% + 거주 연 4%)와 거주 2년 요건으로 계산했습니다. 양도 당시 ${TRANSFER.LONG_TERM_DEDUCTION} 표2` +
  "(예: 2008-03-21~2008-12-31 시행분은 보유 연 4%)로 직접 확인하세요.";
