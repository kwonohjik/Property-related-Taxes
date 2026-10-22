/**
 * anchor — 「소득세법 시행령」 §167의3①8호의2 어린이집 6개월 요건 (다주택 중과 판정 메뉴 P1 · F-4 · Q-A).
 *
 * 법문(MST 290841 실독): 「…5년 이상 어린이집으로 사용하고 **어린이집으로 사용하지 않게 된 날부터 6개월이 경과하지 않은**
 * 주택」. 종전 엔진은 운영 연수만 봐서 사용을 그만둔 지 6개월이 지난 주택도 배제했다(과소과세).
 *
 * 「경과하지 않은」은 저당권 3년과 같은 독법이다 — 초일불산입, 말일 당일까지, 말일이 토요일·공휴일이면 익일(민법 §161).
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  isDayCareCenterExempt,
  dutyPeriodPendingReason,
  isGroupExcludable,
} from "@/lib/tax-engine/multi-house-surcharge-exclusion";
import { defaultRules, mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";

type Over = Parameters<typeof makeHouse>[1];
const dc = (over: Over) => makeHouse("d", { isDayCareCenter: true, dayCareOperationYears: 6, ...over });
const d = (s: string) => new Date(s);

describe("8호의2 사용 종료 후 6개월 — 경계 (초일불산입 · 말일 당일까지)", () => {
  // 종료 2025-03-10 → 기산 03-11 → 6개월 말일 2025-09-10(수)
  const ended = dc({ dayCareEndDate: d("2025-03-10") });

  it("DC-1 말일 전날 양도 → 배제", () => {
    expect(isDayCareCenterExempt(ended, d("2025-09-09"))).toBe(true);
  });
  it("DC-2 말일 당일 양도 → 배제", () => {
    expect(isDayCareCenterExempt(ended, d("2025-09-10"))).toBe(true);
  });
  it("DC-3 말일 다음 날 양도 → 배제 안 함", () => {
    expect(isDayCareCenterExempt(ended, d("2025-09-11"))).toBe(false);
  });

  it("DC-4 말일이 토요일이면 다음 월요일까지 연장(민법 §161)", () => {
    // 종료 2025-03-13 → 말일 2025-09-13(토) → 2025-09-15(월)
    const satEnd = dc({ dayCareEndDate: d("2025-03-13") });
    expect(isDayCareCenterExempt(satEnd, d("2025-09-15"))).toBe(true);
    expect(isDayCareCenterExempt(satEnd, d("2025-09-16"))).toBe(false);
  });
});

describe("8호의2 사용 상태 택일", () => {
  it("DC-5 양도일 현재 사용 중 → 배제", () => {
    expect(isDayCareCenterExempt(dc({ dayCareInUse: true }), d("2025-09-11"))).toBe(true);
  });
  it("DC-6 종료일도 「사용 중」도 없으면 「모름」 → 배제 안 함", () => {
    expect(isDayCareCenterExempt(dc({}), d("2025-09-11"))).toBe(false);
  });
  it("DC-7 사용 중이어도 5년 미만이면 8호의2 아님(④ 의무기간 충족 전 의제는 별도)", () => {
    const short = dc({ dayCareInUse: true, dayCareOperationYears: 3 });
    expect(isDayCareCenterExempt(short, d("2025-09-11"))).toBe(false);
    expect(isGroupExcludable(short, d("2025-09-11"))).toBe(false);
    expect(dutyPeriodPendingReason(short, d("2025-09-11"))).toContain("어린이집");
  });
  it("DC-8 5년 전에 사용을 그만뒀으면 ④ 의무기간 충족 전이 아니다(요건 미충족)", () => {
    const quit = dc({ dayCareEndDate: d("2025-08-01"), dayCareOperationYears: 3 });
    expect(dutyPeriodPendingReason(quit, d("2025-09-11"))).toBeNull();
  });
});

describe("8호의2 — 양도 주택 자체 · 다른 주택 행(⑩호) 경로", () => {
  const TD = d("2025-09-11");
  function run(selling: Over, others: Over[] = [{}, {}]) {
    const houses = [
      makeHouse("h1", { regionCode: "11680", ...selling }),
      ...others.map((o, i) => makeHouse(`h${i + 2}`, o)),
    ];
    return determineMultiHouseSurcharge(
      makeInput(houses, { sellingHouseId: "h1", transferDate: TD }),
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );
  }
  const types = (r: ReturnType<typeof run>) => r.exclusionReasons.map((e) => e.type);

  it("DC-9 양도 주택: 사용 종료 6개월 안 → daycare_center_5years 배제", () => {
    const r = run({ isDayCareCenter: true, dayCareOperationYears: 6, dayCareEndDate: d("2025-03-11") });
    expect(types(r)).toContain("daycare_center_5years");
    expect(r.surchargeApplicable).toBe(false);
  });
  it("DC-10 양도 주택: 사용 종료 6개월 경과 → 그 사유로 배제하지 않음(중과)", () => {
    const r = run({ isDayCareCenter: true, dayCareOperationYears: 6, dayCareEndDate: d("2025-03-10") });
    expect(types(r)).not.toContain("daycare_center_5years");
    expect(r.surchargeApplicable).toBe(true);
  });
  // 3주택: 다른 두 채가 모두 배제 주택(어린이집 + 저당권 3년)이면 양도 주택이 §167의3①10호 「유일한 일반주택」
  const MORTGAGE: Over = { isMortgageExecution: true, acquisitionDate: d("2024-01-01") };
  it("DC-11 다른 주택 행: 사용 중 어린이집 → 양도 주택은 10호 유일한 일반주택(배제)", () => {
    const r = run({}, [{ isDayCareCenter: true, dayCareOperationYears: 6, dayCareInUse: true }, MORTGAGE]);
    expect(r.surchargeApplicable).toBe(false);
  });
  it("DC-12 다른 주택 행: 사용 종료 6개월 경과 어린이집이면 10호 불성립 → 중과", () => {
    const r = run({}, [{ isDayCareCenter: true, dayCareOperationYears: 6, dayCareEndDate: d("2025-03-10") }, MORTGAGE]);
    expect(r.surchargeApplicable).toBe(true);
  });
});
