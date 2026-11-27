/**
 * 국외자산 양도소득 기본공제 배분 — 소득세법 §118의7.
 *
 * ①: 「해당 과세기간의 양도소득금액에서 연 250만원을 공제한다」 — 미등기 배제 단서 없음(국내 §103①1호 단서와 다름), 국내 §103과 별도 한도.
 * ②: 「감면소득금액 외의 양도소득금액에서 먼저 공제하고, … 해당 과세기간에 먼저 양도하는 자산의 양도소득금액에서부터 순서대로 공제한다」.
 *   v1에는 감면소득금액이 없으므로 양도일 오름차순으로 각 자산 양도소득금액을 한도까지 차감한다. 같은 날 양도는 입력 순서.
 *   세액 합계는 순서와 무관하다(과세표준 합계 = Σ양도소득금액 − 기본공제) — 순서는 자산별 몫(`taxBaseAllocated`)에만 나타난다.
 */
import type { ForeignRealEstateAssetRow } from "./types";

export function allocateBasicDeduction(
  rows: ForeignRealEstateAssetRow[],
  annualLimit: number,
): { rows: ForeignRealEstateAssetRow[]; basicDeduction: number } {
  const incomeTotal = rows.reduce((s, r) => s + r.incomeAmount, 0);
  const basicDeduction = Math.min(incomeTotal, annualLimit);
  const order = rows
    .map((r, i) => ({ date: r.transferDate, i })) // yyyy-MM-dd 문자열은 사전순 = 날짜순
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
  const allocated = new Array<number>(rows.length).fill(0);
  let remaining = basicDeduction;
  for (const { i } of order) {
    const take = Math.min(rows[i].incomeAmount, remaining);
    allocated[i] = take;
    remaining -= take;
  }
  return {
    basicDeduction,
    rows: rows.map((r, i) => ({
      ...r,
      basicDeductionAllocated: allocated[i],
      taxBaseAllocated: r.incomeAmount - allocated[i],
    })),
  };
}
