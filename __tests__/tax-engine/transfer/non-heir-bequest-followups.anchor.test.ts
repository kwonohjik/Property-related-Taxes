/**
 * 상속인이 아닌 수유자(유증·사인증여) — 후속 묶음 엔진 단위 anchor (2026-10-20)
 * 계획서: docs/00-pm/non-heir-bequest-followups.plan.md
 *
 * route anchor(`__tests__/api/transfer.route.non-heir-bequest-followups.anchor.test.ts` · 겸용 2벌 · 일반건물 D3)가 고정하지 않는
 * 엔진 지점을 잠근다 — §104②1호 기산일(분할 토지·건물 파트) · §167의3①7호 · §167의3②2호 소수지분 · §167의10①4호 대리 지표 ·
 * §156의2⑤ 대체주택 양도일 현재 구성의 상속 권리.
 */
import { describe, it, expect } from "vitest";
import { resolveRateBasis } from "@/lib/tax-engine/transfer-rate-holding-basis";
import { buildSplitPartCauseEcho } from "@/lib/tax-engine/transfer-split-part-echo";
import { isSurchargeExemptInherited, countEffectiveHouses } from "@/lib/tax-engine/multi-house-surcharge-count";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import { replacementHouseHeldAfterAcquisitionUnits } from "@/lib/tax-engine/one-house/replacement-house";
import { defaultRules, mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";
import type { HouseInfo, PresaleRight } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);

describe("B §104②1호 — 기산일", () => {
  const facts = { acquisitionCause: "inheritance" as const, acquisitionDate: D("2026-03-01"), decedentAcquisitionDate: D("2010-01-01") };
  it("상속인 = 피상속인 취득일 · 수유자 = 본인 취득일(상속개시일)", () => {
    expect(resolveRateBasis(facts)).toEqual({ date: D("2010-01-01"), rule: "decedent" });
    expect(resolveRateBasis({ ...facts, nonHeirBequest: true })).toEqual({ date: D("2026-03-01"), rule: "own" });
  });

  it("분할 파트 echo — 토지 파트(토지 취득원인 상속)와 건물 파트 모두 수유자면 본인 취득일", () => {
    const input = {
      acquisitionCause: "inheritance",
      acquisitionDate: D("2026-03-01"),
      decedentAcquisitionDate: D("2010-01-01"),
      landAcquisitionDate: D("2026-03-01"),
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: D("2005-01-01"),
      transferDate: D("2026-09-18"),
    } as unknown as TransferTaxInput;
    const heir = buildSplitPartCauseEcho(input);
    const nonHeir = buildSplitPartCauseEcho({ ...input, nonHeirBequest: true });
    expect([heir.building.rateBasisRule, heir.land.rateBasisRule]).toEqual(["decedent", "decedent"]);
    expect([nonHeir.building.rateBasisRule, nonHeir.land.rateBasisRule]).toEqual(["own", "own"]);
  });
});

describe("A 다주택 중과 — 수유자 주택은 「제155조제2항에 해당하는 상속받은 주택」이 아니다", () => {
  const TD = D("2021-09-18");
  const inherited = (over: Partial<HouseInfo> = {}) =>
    makeHouse("h2", { isInherited: true, inheritedDate: D("2019-06-01"), decedentSameHouseholdAtInheritance: false, ...over });

  it("§167의3①7호 — 상속인만 중과 배제", () => {
    expect(isSurchargeExemptInherited(inherited(), TD)).toBe(true);
    expect(isSurchargeExemptInherited(inherited({ nonHeirBequest: true }), TD)).toBe(false);
  });

  it("§167의3②2호 공동상속 소수지분 — 수유자는 주택 수에 넣고 확인 필요를 밝힌다", () => {
    const minor = { isCoInherited: true, isLargestCoInheritedShareholder: false };
    const heir = countEffectiveHouses([makeHouse("h1"), inherited(minor)], TD, [], defaultRules);
    const nonHeir = countEffectiveHouses([makeHouse("h1"), inherited({ ...minor, nonHeirBequest: true })], TD, [], defaultRules);
    expect([heir.count, nonHeir.count]).toEqual([1, 2]);
    expect(heir.warnings.join()).not.toContain("상속인이 아닌 사람");
    expect(nonHeir.warnings.join()).toContain("상속인이 아닌 사람이 유증·사인증여로 받은 공동소유 주택은 공동상속주택 소수지분");
  });

  it("§167의10①4호 대리 지표(⑧ 행 표시 없음) — 다른 주택이 수유자 주택이면 상속주택이 아니라 4호 배제가 선다", () => {
    const evaluate = (other: HouseInfo) =>
      determineMultiHouseSurcharge(
        makeInput([makeHouse("h1", { regionCode: "11680", acquisitionDate: D("2015-01-01") }), other], {
          sellingHouseId: "h1", transferDate: TD, unavoidableOutsideCapitalHouse: true,
        }),
        defaultRules, mockRegulatedHistory, suspensionNone, true,
      ).exclusionReasons.some((e) => e.type === "unavoidable_outside_capital");
    const other = (over: Partial<HouseInfo>) => makeHouse("h2", { isInherited: true, inheritedDate: D("2010-01-01"), ...over });
    expect([evaluate(other({})), evaluate(other({ nonHeirBequest: true }))]).toEqual([false, true]);
  });
});

describe("C §156의2⑤ 대체주택 — 양도일 현재 구성에서 상속받은 권리는 세지 않지만 수유자 권리는 센다", () => {
  it("대체주택 취득 뒤 보유한 상속 입주권 1개", () => {
    const right = (over: Partial<PresaleRight>): PresaleRight =>
      ({ id: "r1", type: "redevelopment_right", acquisitionDate: D("2021-01-01"), region: "capital", isInherited: true, ...over }) as PresaleRight;
    const input = (r: PresaleRight) =>
      ({ acquisitionDate: D("2020-01-01"), transferDate: D("2024-01-01"), sellingHouseId: "rep", houses: [], presaleRights: [r] }) as never;
    expect(replacementHouseHeldAfterAcquisitionUnits(input(right({})))).toBe(0);
    expect(replacementHouseHeldAfterAcquisitionUnits(input(right({ nonHeirBequest: true })))).toBe(1);
  });
});
