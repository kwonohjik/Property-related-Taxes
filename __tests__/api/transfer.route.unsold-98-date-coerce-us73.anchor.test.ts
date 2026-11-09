/**
 * anchor — US-73 ⑭ 매퍼의 §98 시리즈 일자 필드를 date-coerce(toOptionalDate)로 변환한다.
 *
 * - 문자열 일자 → Date
 * - 파싱 불가 문자열(⑫를 우회한 직접 호출 가정) → undefined (Invalid Date가 엔진에 도달하지 않는다)
 * - 엔진 측 toHybridDate는 Invalid Date 인스턴스도 undefined로 거른다
 * 정상 입력의 세액은 바뀌지 않는다(변환 결과가 new Date와 동일 — 1990~2035 전 일자 동치는 리뷰 문서 US-73 실측).
 */
import { describe, it, expect } from "vitest";
import { mapReductionsToEngine } from "@/app/api/calc/transfer/route-reductions-mapper";
import { toHybridDate } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid";

type Raw = Parameters<typeof mapReductionsToEngine>[0];
const map = (r: unknown): Record<string, unknown> =>
  (mapReductionsToEngine([r] as unknown as Raw) as unknown as Array<Record<string, unknown>>)[0];

/** [조문 type, 일자 키들] — §98 시리즈 전수(§98·§98의2~§98의9) */
const CASES: Array<[string, string[]]> = [
  ["unsold_98", ["contractDate98"]],
  ["unsold_98_2", ["contractDate982"]],
  ["unsold_98_3", ["contractDate983", "downPaymentCompletedDate983", "constructionStartDate983", "usageApprovalDate983"]],
  ["unsold_98_4", ["contractDate984"]],
  ["unsold_98_5", ["contractDate985"]],
  ["unsold_98_6", ["rentalContractDate986", "rentalStartDate986", "businessRegistrationDate986", "rentalRegistrationDate986", "rentalEndDate986"]],
  ["unsold_98_7", ["contractDate987"]],
  ["unsold_98_8", ["contractDate988", "rentalContractDate988", "rentalStartDate988", "rentalEndDate988"]],
  ["unsold_98_9", ["unsoldHouseAcquisitionDate"]],
];

describe("US-73 — §98 시리즈 ⑭ 일자 변환", () => {
  it.each(CASES)("%s: 문자열 일자는 Date로 도달한다", (type, keys) => {
    const payload: Record<string, unknown> = { type };
    for (const k of keys) payload[k] = "2012-03-04";
    const out = map(payload);
    for (const k of keys) {
      expect(out[k], k).toBeInstanceOf(Date);
      expect((out[k] as Date).getTime(), k).toBe(new Date("2012-03-04").getTime());
    }
  });

  it.each(CASES)("%s: 파싱 불가 문자열은 Invalid Date가 아니라 undefined다", (type, keys) => {
    const payload: Record<string, unknown> = { type };
    for (const k of keys) payload[k] = "abc";
    const out = map(payload);
    for (const k of keys) expect(out[k], k).toBeUndefined();
  });

  it.each(CASES)("%s: 미입력은 undefined", (type, keys) => {
    const out = map({ type });
    for (const k of keys) expect(out[k], k).toBeUndefined();
  });

  it("toHybridDate: Invalid Date 인스턴스·무효 문자열은 undefined, 정상 Date·문자열은 통과", () => {
    expect(toHybridDate(new Date("abc"))).toBeUndefined();
    expect(toHybridDate("abc")).toBeUndefined();
    expect(toHybridDate("")).toBeUndefined();
    const d = new Date("2012-03-04");
    expect(toHybridDate(d)).toBe(d);
    expect(toHybridDate("2012-03-04")?.getTime()).toBe(d.getTime());
  });
});
