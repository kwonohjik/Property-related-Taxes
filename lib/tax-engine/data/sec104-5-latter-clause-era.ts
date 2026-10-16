/**
 * 「소득세법」 제104조 제5항 본문 **후단**의 **8호·9호 동일자산 의제** 적용 시점 (정적 상수).
 *
 * > 이 경우 제2호의 금액을 계산할 때 제1항제8호 및 제9호의 자산은 동일한 자산으로 보고, …
 *
 * 적용 기준은 **양도일**이다 — 법률 제15225호(2017.12.19.) 부칙 제2조②가 «이 법 시행 이후 양도하는 자산으로부터 발생하는 소득분부터»로 정한다
 * (KoreanLaw 부칙 원문 실독, 2026-10-16).
 *
 * | 양도일 | 8호·9호 동일자산 의제 | 근거 |
 * |---|---|---|
 * | ~ 2017-12-31 | **없음** — 2017.7.1. 시행본 §104⑤에 후단이 없다 | `get_law_text` efYd=20171231 |
 * | 2018-01-01 ~ | 적용 | 부칙 제1조 본문(2018.1.1. 시행). 단서 1호가 4.1.로 미룬 것은 «제5항**제2호**»·⑦·⑧ 등뿐이고 §104⑤ 각 호 외의 부분은 열거에 없다 |
 *
 * ⚠️ «2018.4.1.»이 아니다. 4.1.은 같은 부칙이 §104⑤**2호**(「및 제7항」 추가)·⑦(다주택 중과)에 정한 시행일이다.
 *    계획서: `docs/02-design/features/transfer-104-5-latter-clause-start-date.plan.md`
 *
 * 필지 분리(「한 필지의 토지가 … 각각을 별개의 자산으로 보아」)는 이 게이트에 **포함하지 않는다** — 2018.1.1. 전 양도분도 같은 계산을 하기로
 * 결정했다(계획서 Q-1, 2026-10-16). 이 상수는 8호·9호 의제(크로스 계산) 전용이다.
 */
export const SEC104_5_LATTER_CLAUSE_FROM = "2018-01-01";

const dayKey = (d: string | Date): string => {
  if (typeof d === "string") return d.slice(0, 10);
  // 로컬 달력 기준(`new Date("2018-01-01")`은 UTC 자정이라 KST에서도 같은 날이지만, 다른 TZ에서 어긋나지 않게 로컬 필드로 만든다)
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

/** 양도일(경계일 포함)로 본 후단 8호·9호 동일자산 의제 적용 여부. */
export function isSec104_5LatterClauseInForce(transferDate: string | Date): boolean {
  return dayKey(transferDate) >= SEC104_5_LATTER_CLAUSE_FROM;
}

/**
 * 과세기간(=양도연도)으로 본 적용 여부. 2018년 과세기간의 양도는 전부 2018.1.1. 이후다.
 * 크로스 계산기(`/api/calc/cross-104-5`)처럼 양도일 없이 `taxYear`만 있는 경로 전용.
 */
export function isSec104_5LatterClauseInForceForTaxYear(taxYear: number): boolean {
  return taxYear >= Number(SEC104_5_LATTER_CLAUSE_FROM.slice(0, 4));
}
