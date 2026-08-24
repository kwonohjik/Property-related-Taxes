/**
 * §164⑧ 자동 조회 파생 — §164③ 연도 선택 · 조정월수 파생 · 추정 공시일 가드.
 *
 * 계획: docs/00-pm/transfer-same-adjustment-period-std-price.plan.md P-8
 */
import { describe, it, expect } from "vitest";
import {
  noticeYearFor,
  priorNoticeYearFor,
  deriveAdjustmentMonths,
} from "@/lib/calc/same-adjustment-period-lookup";

describe("§164③ — 고시 연도 선택", () => {
  it("5월 이전은 직전(전년도) 고시분", () => {
    expect(noticeYearFor("2006-03-24")).toBe(2005);
    expect(noticeYearFor("1997-02-03")).toBe(1996);
  });

  it("6월 이후는 당해 고시분", () => {
    expect(noticeYearFor("2005-07-28")).toBe(2005);
    expect(noticeYearFor("2006-06-10")).toBe(2006);
  });

  it("취득·양도에 **같은 규칙**을 쓴다 (비대칭 금지)", () => {
    // 한쪽만 당해, 다른 쪽만 직전으로 잡으면 환산취득가액이 통째로 어긋난다.
    expect(noticeYearFor("2006-05-31")).toBe(2005);
    expect(noticeYearFor("2006-06-01")).toBe(2006);
  });

  it("전기는 취득당시 고시연도의 1년 전", () => {
    expect(priorNoticeYearFor("2005-07-28")).toBe(2004);
    expect(priorNoticeYearFor("2006-03-24")).toBe(2004);
  });
});

describe("§80②1호 — 조정월수 파생", () => {
  const real = (d: string) => ({ price: 1, announcedDate: d });

  it("가목: 전기 결정일 ~ 취득 결정일 전일 (2004-07-01 ~ 2005-06-30 = 12월)", () => {
    const r = deriveAdjustmentMonths("prev", real("20050701"), real("20040701"));
    expect(r.months).toBe(12);
  });

  it("나목: 취득 결정일 ~ 새 결정일 전일 (2005-07-01 ~ 2006-06-30 = 12월)", () => {
    const r = deriveAdjustmentMonths("new", real("20050701"), real("20060701"));
    expect(r.months).toBe(12);
  });

  it("🔴 추정 공시일이면 파생하지 않는다 — 월 경계에서 1개월 어긋난다", () => {
    const est = { price: 1, announcedDate: "20050429", announcedDateEstimated: true };
    const r = deriveAdjustmentMonths("prev", est, real("20040701"));
    expect(r.months).toBeNull();
    expect(r.reason).toBe("estimated_notice_date");
  });

  it("공시일이 없으면 파생하지 않는다", () => {
    expect(deriveAdjustmentMonths("prev", undefined, real("20040701")).months).toBeNull();
    expect(deriveAdjustmentMonths("prev", real("20050701"), { price: 1, announcedDate: "" }).months)
      .toBeNull();
  });
});
