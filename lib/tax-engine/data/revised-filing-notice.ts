/**
 * 주식 «수정신고» 선택 시 **계산하지 않음** 고지 (정적 상수) — 계획서 `docs/00-pm/stock-revised-filing-v14.plan.md` Q-1 a · Q-2 항상.
 *
 * Step3 신고 유형에 «수정신고»가 있으나 엔진·결과는 `filingType === "revised"`를 읽지 않아 확정신고와 결과 객체가 같다.
 * 부동산 양도세에는 수정신고 전용 모듈(`transfer-tax-amendment.ts`)이 있지만 주식에는 없다 — 수정신고의 추가납부세액
 * (수정 결정세액 − 당초 결정세액)과 가산세 감면(국세기본법 §48②1호)을 계산하지 않는다. 세액은 바꾸지 않고 그 사실만 알린다.
 */
import { AMENDMENT_45, AMENDMENT_48_2 } from "../legal-codes/common";

/** 고정 문구 — 값이 없는 정적 문자열이라 종목 행 경고에서 동등 비교로 걷어낼 수 있다. */
export const REVISED_FILING_NOT_COMPUTED_NOTICE =
  `수정신고(${AMENDMENT_45})는 이 계산기가 추가납부세액과 가산세 감면(${AMENDMENT_48_2})을 계산하지 않습니다. ` +
  `표시되는 결정세액은 수정 후 전체 세액이므로, 이미 신고·납부한 당초 세액을 빼서 추가로 낼 세액을 직접 확인하세요.`;

/** 수정신고를 골랐을 때만 고지한다. */
export function stockRevisedFilingNotice(filingType: string | undefined): string | undefined {
  return filingType === "revised" ? REVISED_FILING_NOT_COMPUTED_NOTICE : undefined;
}

/** 합산 신고 단위 — 신고 유형은 **유형을 가진 마지막 종목**(편집기) 값이다(국외 입력은 신고 유형이 없다 — 전자신고 공제 판정과 같은 규약). */
export function stockRevisedFilingNoticeOfFiling(
  // transferDate 는 쓰지 않는다 — 국외 입력(신고 유형 필드 없음)이 약한 타입 검사에 걸리지 않게 겹치는 필드를 둔다
  items: ReadonlyArray<{ filingType?: string; transferDate?: Date }>,
): string | undefined {
  let filingType: string | undefined;
  for (const i of items) if (i.filingType !== undefined) filingType = i.filingType;
  return stockRevisedFilingNotice(filingType);
}
