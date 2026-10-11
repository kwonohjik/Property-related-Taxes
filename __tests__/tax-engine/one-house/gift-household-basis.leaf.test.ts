/**
 * 증여받은 주택 세대 사실 leaf (`gift-household-basis.ts`) — 날짜 선택 규칙 단위 anchor (결정 #33·#34·#38).
 */
import { describe, it, expect } from "vitest";
import {
  giftHouseholdConsolidationStart,
  giftHouseholdHoldingStart,
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
