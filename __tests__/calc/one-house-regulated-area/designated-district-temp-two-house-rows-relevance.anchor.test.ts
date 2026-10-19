/**
 * 1주택 코드 리뷰 별건 ⑤ — 일시적 2주택 명부 행(종전 주택 · 신규 주택)의 「지정 지구 안인가」 미선언 고지도 그 선언이 결론을 가를 때만 낸다.
 *
 * 양도 주택(S02-7)·입주권 행(#32-4)은 이미 «그 행의 지구 답을 안·밖으로 바꿔 판정을 다시 돌렸을 때 비과세 결론이 달라지는가»로 걸렀는데,
 * 명부 행은 게이트 기본값(`() => true`)이라 지구 한정 지정 구간이면 결론과 무관하게 늘 냈다.
 * 두 답은 §155①2호 「신규 주택 취득 당시 두 주택 모두 조정대상지역」 판정(`resolveRegulatedAtNewAcquisition` — 처분기한·전입 요건)에만 쓰인다.
 * 중과는 비과세 판정 결과를 주입받아 따로 판정하지 않는다(`multi-house-surcharge.types.ts` `deemedOneHouseBy155` 주석).
 *
 * 시료: 양도(종전) 주택 강남 2015-01-01 취득 · 신규 주택 고양 대화동(2019.11.8.~2020.6.18. 킨텍스1단계 도시개발지구만 조정대상지역) 2020-01-15 취득 · 지구 미선언.
 * 미선언은 지구 안(조정대상지역)으로 판정한다(모름=불리 — 2026-10-08) — 판정 자체는 바뀌지 않고 고지만 거른다.
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { designatedDistrictUndeclared } from "@/lib/tax-engine/one-house/designated-district-undeclared";
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const DAEHWA = "4128710400";
const GANGNAM = "1168010100";
const NEW = "regulated-district-undeclared:new-house";
const PREV = "regulated-district-undeclared:previous-house";
const rules = () => parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;

type Case = { acq?: string; td: string; moveIn?: string; newIn?: boolean; prevRoster?: boolean; prevIn?: boolean };
function input(c: Case): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    acquisitionDate: D(c.acq ?? "2015-01-01"),
    transferDate: D(c.td),
    regionCode: GANGNAM,
    residencePeriodMonths: 60,
    temporaryTwoHouse: {
      previousAcquisitionDate: D(c.acq ?? "2015-01-01"),
      newAcquisitionDate: D("2020-01-15"),
      newHouseRegionCode: DAEHWA,
      ...(c.newIn !== undefined ? { newHouseInDesignatedDistrict: c.newIn } : {}),
      ...(c.moveIn ? { wholeHouseholdMoveInDate: D(c.moveIn) } : {}),
      ...(c.prevRoster
        ? { previousHouseIsRosterRow: true, previousHouseRegionCode: DAEHWA, ...(c.prevIn !== undefined ? { previousHouseInDesignatedDistrict: c.prevIn } : {}) }
        : {}),
    },
  } as never);
}
const judge = (c: Case) => checkExemption(input(c) as never, rules(), D("2021-01-01"));
const ids = (c: Case) => judge(c).undetermined.map((u: { id: string }) => u.id);
const verdict = (c: Case) => {
  const r = judge(c);
  return `${r.isExempt}|${r.isPartialExempt}`;
};

describe("별건 ⑤ — 신규 주택 행: 지구 답이 결론을 가를 때만 고지", () => {
  it("A 1년 내 양도 · 전입일 없음 — 지구 안이면 과세(전입 요건), 밖이면 비과세 → 고지", () => {
    expect(verdict({ td: "2020-12-01", newIn: true })).not.toBe(verdict({ td: "2020-12-01", newIn: false }));
    expect(judge({ td: "2020-12-01" }).isExempt).toBe(false);
    expect(ids({ td: "2020-12-01" })).toContain(NEW);
  });

  it("C 2022-06-01 양도 — 지구 안이면 처분기한 경과로 과세, 밖이면 비과세 → 고지", () => {
    expect(verdict({ td: "2022-06-01", newIn: true })).not.toBe(verdict({ td: "2022-06-01", newIn: false }));
    expect(ids({ td: "2022-06-01" })).toContain(NEW);
  });

  it("B 1년 내 양도 · 전입 완료 — 어느 쪽이든 비과세 → 고지 없음(종전: 고지)", () => {
    const c = { td: "2020-12-01", moveIn: "2020-06-01" };
    expect(verdict({ ...c, newIn: true })).toBe(verdict({ ...c, newIn: false }));
    expect(judge(c).isExempt).toBe(true);
    expect(ids(c)).not.toContain(NEW);
  });

  it("D 양도 주택 보유 2년 미달 — 어느 쪽이든 과세 → 고지 없음(종전: 고지)", () => {
    const c = { acq: "2019-06-01", td: "2020-12-01", moveIn: "2020-06-01" };
    expect(verdict({ ...c, newIn: true })).toBe(verdict({ ...c, newIn: false }));
    expect(judge(c).isExempt).toBe(false);
    expect(ids(c)).not.toContain(NEW);
  });

  it("E 2024-06-01 양도 — 어느 쪽이든 과세 → 고지 없음(종전: 고지)", () => {
    const c = { td: "2024-06-01" };
    expect(verdict({ ...c, newIn: true })).toBe(verdict({ ...c, newIn: false }));
    expect(ids(c)).not.toContain(NEW);
  });

  it("판정은 그대로다 — 미선언 = 지구 안(모름=불리)과 같은 결론", () => {
    for (const c of [{ td: "2020-12-01" }, { td: "2022-06-01" }, { td: "2020-12-01", moveIn: "2020-06-01" }]) {
      expect(verdict(c)).toBe(verdict({ ...c, newIn: true }));
    }
  });
});

describe("별건 ⑤ — 합가 D8 짝의 종전 주택 행: 같은 규약", () => {
  it("F 종전 주택(명부 행) 대화동 · 1년 내 양도 · 전입 완료 — 종전·신규 어느 답이든 비과세 → 둘 다 고지 없음(종전: 둘 다 고지)", () => {
    const c = { td: "2020-12-01", moveIn: "2020-06-01", prevRoster: true };
    expect(verdict({ ...c, prevIn: true })).toBe(verdict({ ...c, prevIn: false }));
    expect(judge(c).isExempt).toBe(true);
    expect(ids(c)).not.toContain(PREV);
    expect(ids(c)).not.toContain(NEW);
  });

  it("F' 같음 · 전입일 없음 — 종전 주택 답이 결론을 가르면 종전 주택 고지", () => {
    const c = { td: "2020-12-01", prevRoster: true };
    expect(verdict({ ...c, prevIn: true })).not.toBe(verdict({ ...c, prevIn: false }));
    expect(ids(c)).toContain(PREV);
  });
});

describe("leaf — 명부 행 게이트가 각 행에만 걸린다", () => {
  const base = input({ td: "2020-12-01", prevRoster: true });
  const off = () => false;
  const on = () => true;
  it("newHouse만 거짓 → 신규 주택 고지만 빠진다 · previousHouse만 거짓 → 종전 주택 고지만 빠진다", () => {
    const run = (previousHouse: () => boolean, newHouse: () => boolean) =>
      designatedDistrictUndeclared(base, { selling: off, right: off, previousHouse, newHouse }).map((x) => x.id);
    expect(run(on, on)).toEqual([PREV, NEW]);
    expect(run(on, off)).toEqual([PREV]);
    expect(run(off, on)).toEqual([NEW]);
    expect(run(off, off)).toEqual([]);
  });
  it("relevance를 안 넘기면 게이트 없음(기존 호출부 호환)", () => {
    expect(designatedDistrictUndeclared(base).map((x) => x.id)).toEqual([PREV, NEW]);
  });
});
