/**
 * 증여받은 주택 세대 사실 leaf (`gift-household-basis.ts`) — 날짜 선택 규칙 단위 anchor (결정 #33·#34·#38).
 */
import { describe, it, expect } from "vitest";
import {
  carryoverGiftHouseholdBasis,
  giftHouseholdConfirmedSeparate,
  giftHouseholdConsolidationStart,
  giftHouseholdHoldingStart,
  giftHouseholdMaxPriorResidenceMonths,
  giftHouseholdPriorResidenceMonths,
  giftHouseholdUnconfirmed,
  resolveGiftResidenceDates,
  resolveHouseCountExclusionDate,
  type GiftHouseholdBasis,
} from "@/lib/tax-engine/one-house/gift-household-basis";

const D = (s: string) => new Date(s);
const ymd = (d: Date | undefined) => d?.toISOString().slice(0, 10);
const base: GiftHouseholdBasis = { giftDate: D("2021-03-02"), donorAcquisitionDate: D("2010-03-01") };

describe("giftHouseholdConsolidationStart — 통산 성립 조건", () => {
  it("계속 같은 세대 + 증여자 취득일 ≤ 시작일 < 증여일이면 시작일", () => {
    expect(ymd(giftHouseholdConsolidationStart({ ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2012-01-01") }))).toBe("2012-01-01");
    // 경계 ±1: 증여자 취득일과 같은 날은 성립, 증여일과 같은 날은 불성립
    expect(giftHouseholdConsolidationStart({ ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2010-03-01") })).toBeDefined();
    expect(giftHouseholdConsolidationStart({ ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2010-02-28") })).toBeUndefined();
    expect(giftHouseholdConsolidationStart({ ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2021-03-01") })).toBeDefined();
    expect(giftHouseholdConsolidationStart({ ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2021-03-02") })).toBeUndefined();
  });
  it("아니오 · 미확인 · 시작일 없음 · 증여자 사망은 통산하지 않는다", () => {
    expect(giftHouseholdConsolidationStart({ ...base, continuousSameHousehold: false, householdHoldingStartDate: D("2012-01-01") })).toBeUndefined();
    expect(giftHouseholdConsolidationStart({ ...base, householdHoldingStartDate: D("2012-01-01") })).toBeUndefined();
    expect(giftHouseholdConsolidationStart({ ...base, continuousSameHousehold: true })).toBeUndefined();
    expect(giftHouseholdConsolidationStart({ ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2012-01-01"), donorDeceased: true })).toBeUndefined();
  });
  it("이월과세 A(보유 기산이 이미 증여자 취득일)는 보유 기산을 옮기지 않는다", () => {
    const b = { ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2012-01-01"), holdingAlreadyAtDonor: true };
    expect(giftHouseholdHoldingStart(b)).toBeUndefined();
    expect(ymd(giftHouseholdConsolidationStart(b))).toBe("2012-01-01"); // 취득 당시 기준일은 옮긴다
  });
});

describe("resolveGiftResidenceDates — 「취득 당시」 후보일과 경과규정 기준일", () => {
  it("통산 성립: 경과규정은 세대 보유 시작일, 조정 판정은 시작일·증여일 둘 다 지정 중일 때만(all) — 거울상은 증여일 기준", () => {
    const b = { ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2012-01-01") };
    const r = resolveGiftResidenceDates(b);
    expect(r.judgmentDates.map(ymd)).toEqual(["2012-01-01", "2021-03-02"]);
    expect(r.mode).toBe("all");
    expect(ymd(r.transitionDate)).toBe("2012-01-01");
    // 반사실(거울상을 세대 취득일로 읽는 쪽)은 시작일만
    const strict = resolveGiftResidenceDates({ ...b, householdDateStrict: true });
    expect(strict.judgmentDates.map(ymd)).toEqual(["2012-01-01"]);
    expect(strict.mode).toBe("any");
  });
  it("확인된 별도세대: 둘 다 증여일", () => {
    const r = resolveGiftResidenceDates({ ...base, continuousSameHousehold: false });
    expect(r.judgmentDates.map(ymd)).toEqual(["2021-03-02"]);
    expect(r.mode).toBe("any");
    expect(ymd(r.transitionDate)).toBe("2021-03-02");
  });
  it("미확인: 조정 판정은 증여일·증여자 취득일 둘 다, 경과규정은 늦은 날(증여일)", () => {
    const r = resolveGiftResidenceDates(base);
    expect(r.judgmentDates.map(ymd)).toEqual(["2021-03-02", "2010-03-01"]);
    expect(r.mode).toBe("any");
    expect(ymd(r.transitionDate)).toBe("2021-03-02");
    expect(giftHouseholdUnconfirmed(base)).toBe(true);
    expect(giftHouseholdUnconfirmed({ ...base, continuousSameHousehold: false })).toBe(false);
  });
});

describe("resolveHouseCountExclusionDate — D4-05", () => {
  it("통산 성립일 때만 세대 보유 시작일, 아니면 양도자 본인 취득일", () => {
    const acq = D("2021-03-02");
    expect(ymd(resolveHouseCountExclusionDate(acq, { ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2012-01-01") }))).toBe("2012-01-01");
    expect(ymd(resolveHouseCountExclusionDate(acq, base))).toBe("2021-03-02");
    expect(ymd(resolveHouseCountExclusionDate(acq, undefined))).toBe("2021-03-02");
  });
});

describe("이혼 후 재결합 (결정 #34 조건 · #38-6) — 「아니오」로 계산한다", () => {
  const rejoin = { ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2012-01-01"), rejoinedAfterDivorce: true };
  it("재결합이면 「예」·시작일이 있어도 통산하지 않고 확인된 별도세대로 읽는다 · 재결합이 아니면 통산한다(긍정 짝)", () => {
    expect(giftHouseholdConsolidationStart(rejoin)).toBeUndefined();
    expect(giftHouseholdConfirmedSeparate(rejoin)).toBe(true);
    expect(giftHouseholdUnconfirmed(rejoin)).toBe(false);
    expect(giftHouseholdConsolidationStart({ ...rejoin, rejoinedAfterDivorce: undefined })).toBeDefined();
  });
  it("「취득 당시」 후보일·경과규정 기준일은 별도세대와 같이 증여일이다", () => {
    const r = resolveGiftResidenceDates(rejoin);
    expect(r.judgmentDates.map(ymd)).toEqual(["2021-03-02"]);
    expect(r.mode).toBe("any");
    expect(ymd(r.transitionDate)).toBe("2021-03-02");
    expect(ymd(resolveHouseCountExclusionDate(D("2021-03-02"), rejoin))).toBe("2021-03-02");
  });
  it("이월과세 입력에서 재결합은 배우자 관계일 때만 읽는다", () => {
    const ct = {
      giftRegistryDate: D("2021-03-02"),
      donorAcquisitionDate: D("2010-03-01"),
      donorSameHouseholdContinuous: false,
      donorRejoinedAfterDivorce: true,
    };
    expect(carryoverGiftHouseholdBasis({ ...ct, donorRelation: "spouse" }, false).rejoinedAfterDivorce).toBe(true);
    expect(carryoverGiftHouseholdBasis({ ...ct, donorRelation: "lineal" }, false).rejoinedAfterDivorce).toBeUndefined();
    expect(carryoverGiftHouseholdBasis({ ...ct, donorRelation: "spouse", donorRejoinedAfterDivorce: undefined }, false).rejoinedAfterDivorce).toBeUndefined();
  });
});

describe("증여 전 동일세대 거주 개월 (결정 #38-7) — 통산 성립 때만 · 상한은 세대 보유 시작일~증여일 개월 수", () => {
  // 2012-01-01 → 2021-03-02 = 110개월(9년 2개월 1일) · 2012-01-03 → 109개월
  const yes = { ...base, continuousSameHousehold: true, householdHoldingStartDate: D("2012-01-01") };
  it("상한 — 시작일부터 증여일까지의 개월 수(내림) · 통산이 성립하지 않으면 0", () => {
    expect(giftHouseholdMaxPriorResidenceMonths(yes)).toBe(110);
    expect(giftHouseholdMaxPriorResidenceMonths({ ...yes, householdHoldingStartDate: D("2012-01-03") })).toBe(109);
    expect(giftHouseholdMaxPriorResidenceMonths({ ...yes, continuousSameHousehold: false })).toBe(0);
    expect(giftHouseholdMaxPriorResidenceMonths({ ...yes, donorDeceased: true })).toBe(0);
    expect(giftHouseholdMaxPriorResidenceMonths(undefined)).toBe(0);
  });
  it("더하는 개월 — 입력값 · 상한 초과는 상한으로 · 미답(undefined)·0·음수·통산 불성립은 0", () => {
    expect(giftHouseholdPriorResidenceMonths({ ...yes, priorHouseholdResidenceMonths: 30 })).toBe(30);
    expect(giftHouseholdPriorResidenceMonths({ ...yes, priorHouseholdResidenceMonths: 110 })).toBe(110);
    expect(giftHouseholdPriorResidenceMonths({ ...yes, priorHouseholdResidenceMonths: 111 })).toBe(110);
    expect(giftHouseholdPriorResidenceMonths({ ...yes, priorHouseholdResidenceMonths: undefined })).toBe(0);
    expect(giftHouseholdPriorResidenceMonths({ ...yes, priorHouseholdResidenceMonths: 0 })).toBe(0);
    expect(giftHouseholdPriorResidenceMonths({ ...yes, priorHouseholdResidenceMonths: -5 })).toBe(0);
    expect(giftHouseholdPriorResidenceMonths({ ...yes, continuousSameHousehold: false, priorHouseholdResidenceMonths: 30 })).toBe(0);
    expect(giftHouseholdPriorResidenceMonths({ ...yes, rejoinedAfterDivorce: true, priorHouseholdResidenceMonths: 30 })).toBe(0);
  });
  it("이월과세 입력에서도 읽는다 — 증여 전 거주 개월이 기본으로 따라온다", () => {
    const ct = { giftRegistryDate: D("2021-03-02"), donorAcquisitionDate: D("2010-03-01"), donorSameHouseholdContinuous: true, donorHouseholdHoldingStartDate: D("2012-01-01") };
    expect(carryoverGiftHouseholdBasis({ ...ct, donorPriorHouseholdResidenceMonths: 24, donorRelation: "lineal" }, true).priorHouseholdResidenceMonths).toBe(24);
    expect(carryoverGiftHouseholdBasis({ ...ct, donorRelation: "lineal" }, true).priorHouseholdResidenceMonths).toBeUndefined();
  });
});
