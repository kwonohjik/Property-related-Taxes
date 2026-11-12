/**
 * 자산-수준 매매계약일(`assetContractDate`)을 이 취득원인에서 읽는가 — ⑤·④·엔진 단일 소스 (rental-97-5-textbook-gaps.plan.md V-11).
 *
 * 상속에는 상속인의 매매계약이 없다. 그런데 이 날짜는 조특법 §97의5①1호 괄호 「2018년 12월 31일까지 매매계약을 체결하고
 * 계약금을 납부한 경우를 포함」과 대통령령 제29241호 부칙 §2②2호(기준시가 한도 예외)에 그대로 쓰여, 매매로 입력했다가
 * 상속으로 바꾼 자산에 남은 값이 시한·한도를 풀었다(실측: 상속개시일 2019-02-01 + 남은 계약일 2018-12-01 → 감면 0 → 129,060,000).
 * 상속이면 읽지 않는다. 증여는 칸을 유지한다(사용자 결정 2026-11-12 (a) — 증여받은 분양권 등은 해석 미확보).
 */
export function assetContractDateForCause<T>(acquisitionCause: string | undefined, assetContractDate: T | undefined): T | undefined {
  return acquisitionCause === "inheritance" ? undefined : assetContractDate;
}
