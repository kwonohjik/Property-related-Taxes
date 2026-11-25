/**
 * PSA-S1 — 철거 요건 사슬 걷기(순차 노출) 격자 anchor.
 * 계획서: docs/01-plan/features/property-separate-demolished-sequential.engine.plan.md §2 · §4 · §5(T1~T4)
 *
 * - T1 판정 동치: 동결 복제본(`_helpers/property-demolished-frozen-s1.ts` — master 79e1eadf6)과 새 `judgePropertyDemolishedLand`를 격자 전수로 대조(판정·사유·인정 면적·고지).
 *   과세기준일 9 × 철거일 경계 × 종류 3(없음 포함) × 사실 칸 4^5 × 면적 칸 4조합(없음·바닥+용도지역·용도지역만·바닥만). 의도된 차이(SQ-5·SQ-6·stale 빈집 «예»)는 규칙으로 명시하고 건수를 센다.
 * - T2 완화만: 새 사슬이 읽는 칸 ⊆ 현행이 묻던 칸, 현행 통과(첫 결함 null) → 새 통과 · 강화 0건.
 * - T3 최소성 오라클(계획서 §2.2 (다) — 사슬(가)과 독립 측정): 읽힌 칸은 값을 바꾸면 판정 또는 읽는 칸 집합이 달라지고(over-ask 0), 첫 미답 칸은 답하면 달라진다(under-ask 0).
 * - T4 stale 무해: 읽히지 않은 칸은 어떤 값으로 바꿔도 판정 전체(`required`·`periodMonths`·고지 포함)와 `order`가 같다.
 */
import { describe, expect, it } from "vitest";
import {
  frozenJudgePropertyDemolishedLand,
  frozenPropertyDemolishedFactIssue,
  frozenPropertyDemolishedPublicUseAsked,
  frozenPropertyDemolishedRequired,
} from "../_helpers/property-demolished-frozen-s1";
import { judgePropertyDemolishedLand, propertyDemolishedChain, propertyDemolishedFactIssue, propertyDemolishedPeriodAllKindsNotice } from "../../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedAskField, PropertyDemolishedFacts, PropertyDemolishedKind, PropertyRequirementFact } from "../../../lib/tax-engine/property-separate-requirements";
import { demolishedStatusPeriodMonths } from "../../../lib/tax-engine/data/nbl-historical-values-era";
import { addMonthsUtc, periodEndFromMonths } from "../../../lib/tax-engine/civil-period";
import { parseISO } from "../../../lib/tax-engine/utc-date";

const d = parseISO;
const FACT: PropertyRequirementFact[] = ["", "yes", "no", "unknown"];
const SS = ["2015-06-01", "2016-06-01", "2018-06-01", "2019-06-01", "2023-06-01", "2024-06-01", "2025-06-01", "2026-06-01", "2027-06-01"];
const KINDS: Array<PropertyDemolishedKind | ""> = ["", "house", "building"];
const DAY = 86_400_000;

/** 철거일 후보 — 과세기준일 뒤 · 당일 · 2개월 전 · 6/12/36개월 만료일 당일과 다음 날(앞뒤 3일 중 경계인 것) · 2010-01-01. */
function removals(s: Date): Date[] {
  const out: Date[] = [new Date(s.getTime() + DAY), s, addMonthsUtc(s, -2), d("2010-01-01")];
  for (const m of [6, 12, 36]) {
    const r = addMonthsUtc(s, -m);
    for (let k = -3; k <= 3; k++) {
      const cand = new Date(r.getTime() + k * DAY);
      const end = periodEndFromMonths(cand, m).getTime();
      if (end === s.getTime() || end === s.getTime() - DAY) out.push(cand);
    }
  }
  return out;
}

const AREAS: Array<{ label: string; buildingFloorArea?: number; zoningDistrict?: string }> = [
  { label: "none" },
  { label: "both", buildingFloorArea: 100, zoningDistrict: "commercial" },
  { label: "zoneOnly", zoningDistrict: "commercial" },
  { label: "floorOnly", buildingFloorArea: 100 },
];

function* factGrid(): Generator<PropertyDemolishedFacts> {
  for (const permit of FACT) for (const otherUse of FACT) for (const vacantHouse of FACT) for (const publicUse of FACT) for (const publicUsePaid of FACT) {
    yield { permit, otherUse, vacantHouse, publicUse, publicUsePaid };
  }
}

const askedFieldsOfOld = (s: Date, r: Date, kind: PropertyDemolishedKind | "", facts: PropertyDemolishedFacts): Set<PropertyDemolishedAskField> => {
  const need = frozenPropertyDemolishedRequired({ taxBaseDate: s, removedOn: r, kind });
  const asked = frozenPropertyDemolishedPublicUseAsked(need, facts);
  const out = new Set<PropertyDemolishedAskField>(["demolishedKind"]);
  if (need.permit) out.add("demolishedPermit");
  if (need.otherUse) out.add("demolishedOtherUse");
  if (need.vacantHouse) out.add("demolishedVacantHouse");
  if (need.floorArea) out.add("buildingFloorArea");
  if (asked.publicUse) out.add("demolishedPublicUse");
  if (asked.paid) out.add("demolishedPublicUsePaid");
  return out;
};

describe("PSA-S1 T1 — 판정 동치(동결 복제본 vs 새 사슬 judge) · T2 완화만", () => {
  it("격자 전수 — 시간 제한 120초", { timeout: 120_000 }, () => {
    let cells = 0;
    const exceptions = { dateDeterminedNotice: 0, dateDeterminedPeriodMonths: 0, kindlessDateDetermined: 0, staleVacantPeriodMonths: 0 };
    let strictening = 0;
    let relaxed = 0;
    for (const sRaw of SS) {
      const s = d(sRaw);
      const longest = demolishedStatusPeriodMonths(s, true);
      const general = demolishedStatusPeriodMonths(s, false);
      for (const r of removals(s)) {
        for (const kind of KINDS) {
          for (const facts of factGrid()) {
            const oldAsked = askedFieldsOfOld(s, r, kind, facts);
            for (const area of AREAS) {
              const input = { taxBaseDate: s, removedOn: r, kind, facts, buildingFloorArea: area.buildingFloorArea, zoningDistrict: area.zoningDistrict };
              const o = frozenJudgePropertyDemolishedLand({ ...input, landArea: 400 });
              const n = judgePropertyDemolishedLand({ ...input, landArea: 400 });
              cells++;
              const chain = propertyDemolishedChain(input);
              const dateDetermined = chain.resolved?.kind === "fold" && chain.resolved.at === "date";

              // 판정 — 접힘/성립 · 인정 면적 · 이관 면적 · 면적 문언 · 근거 조문은 전부 같다(종류 «없음» + 날짜 확정만 사유 라벨이 다르다 — SQ-6)
              expect({ k: n.kind, a: n.recognizedArea, e: n.excessArea, c: n.areaClauseApplied, l: n.legalBasis }).toEqual({ k: o.kind, a: o.recognizedArea, e: o.excessArea, c: o.areaClauseApplied, l: o.legalBasis });
              if (kind === "" && dateDetermined) {
                exceptions.kindlessDateDetermined++;
                expect(o.foldReason).toBe("input");
                expect(n.foldReason).toBe(longest === 0 ? "not_yet" : "period");
              } else {
                expect(n.foldReason).toBe(o.foldReason);
              }

              // 고지 — 같다. 단 날짜만으로 확정된 기간 접힘은 일반·빈집 기간 병기 문장(SQ-5)
              if (dateDetermined && n.foldReason === "period") {
                exceptions.dateDeterminedNotice++;
                expect(n.notices).toEqual([propertyDemolishedPeriodAllKindsNotice(general as 6 | 12, longest as 6 | 12 | 36)]);
              } else if (!(kind === "" && dateDetermined)) {
                expect(n.notices).toEqual(o.notices);
              }
              expect(n.vacantHouseExtensionUnconfirmed).toBe(o.vacantHouseExtensionUnconfirmed);

              // 적용 기간 echo — 같다. 단 ① 날짜 확정 기간 접힘은 가장 긴 가능 기간 ② 읽히지 않은 stale 빈집정비 «예»는 36을 만들지 못한다
              if (n.periodMonths !== o.periodMonths) {
                if (dateDetermined && n.foldReason === "period" && kind !== "") {
                  exceptions.dateDeterminedPeriodMonths++;
                  expect(n.periodMonths).toBe(longest);
                } else if (kind === "" && dateDetermined) {
                  expect(o.periodMonths).toBe(0); // 현행은 종류 없음 → input 접힘(기간 0)
                } else {
                  exceptions.staleVacantPeriodMonths++;
                  expect(o.periodMonths).toBe(36);
                  expect(facts.vacantHouse).toBe("yes");
                  expect(kind).toBe("house");
                  expect(n.required.vacantHouse).toBe(false);
                  expect(n.periodMonths).toBe(general);
                }
              }

              // T2 — 새로 읽는 칸 ⊆ 현행이 묻던 칸
              for (const f of chain.order) expect(oldAsked.has(f)).toBe(true);
              // `required` echo도 현행 ⊆ 관계
              for (const key of ["permit", "otherUse", "vacantHouse", "floorArea", "publicUse", "publicUsePaid"] as const) {
                if (n.required[key]) expect(o.required[key]).toBe(true);
              }

              // T2 — 현행 통과 → 새 통과(강화 0) · 새 차단 → 현행 차단
              const fi = { ...input, isFactory: false as const };
              const oIssue = frozenPropertyDemolishedFactIssue(fi);
              const nIssue = propertyDemolishedFactIssue(fi);
              if (oIssue === null && nIssue !== null) strictening++;
              if (oIssue !== null && nIssue === null) relaxed++;
              if (nIssue !== null) expect(oIssue).not.toBeNull();
              // 새 통과 ⇒ 판정이 «결함 입력»으로 접지 않는다
              if (nIssue === null) expect(["input", "area_input"]).not.toContain(n.foldReason);
            }
          }
        }
      }
    }
    expect(strictening).toBe(0);
    expect(relaxed).toBeGreaterThan(0);
    expect(cells).toBeGreaterThan(1_000_000);
    // 의도된 차이가 실제로 나타난다(공허 방지) — 격자가 규칙을 검사하고 있다
    expect(exceptions.dateDeterminedNotice).toBeGreaterThan(0);
    expect(exceptions.dateDeterminedPeriodMonths).toBeGreaterThan(0);
    expect(exceptions.kindlessDateDetermined).toBeGreaterThan(0);
    expect(exceptions.staleVacantPeriodMonths).toBeGreaterThan(0);
     
    console.log(`[PSA-S1 T1·T2] cells=${cells} strictening=${strictening} relaxed(현행 차단→새 통과)=${relaxed} exceptions=${JSON.stringify(exceptions)}`);
  });
});

type Snap = string;
function snapshot(i: Parameters<typeof judgePropertyDemolishedLand>[0]): Snap {
  const v = judgePropertyDemolishedLand(i);
  const chain = propertyDemolishedChain({ taxBaseDate: i.taxBaseDate, removedOn: i.removedOn, kind: i.kind, facts: i.facts, buildingFloorArea: i.buildingFloorArea, zoningDistrict: i.zoningDistrict });
  return JSON.stringify({ v, order: chain.order, next: chain.next, resolved: chain.resolved, pos: chain.vacantHousePosition });
}

const FACT_FIELD_KEY: Record<string, keyof PropertyDemolishedFacts> = {
  demolishedPermit: "permit",
  demolishedOtherUse: "otherUse",
  demolishedVacantHouse: "vacantHouse",
  demolishedPublicUse: "publicUse",
  demolishedPublicUsePaid: "publicUsePaid",
};

describe("PSA-S1 T3·T4 — 최소성 오라클(독립 측정) · stale 무해", () => {
  it("읽힌 칸은 값을 바꾸면 달라지고(over-ask 0) · 첫 미답 칸은 답하면 달라지며(under-ask 0) · 읽히지 않은 칸은 무엇으로 바꿔도 같다 — 시간 제한 180초", { timeout: 180_000 }, () => {
    let cells = 0;
    let readChecks = 0;
    let nextChecks = 0;
    let unreadChecks = 0;
    for (const sRaw of SS) {
      const s = d(sRaw);
      for (const r of removals(s)) {
        for (const kind of ["house", "building"] as const) {
          for (const facts of factGrid()) {
            for (const area of [AREAS[0], AREAS[1]]) {
              const base = { taxBaseDate: s, removedOn: r, kind: kind as PropertyDemolishedKind | "", facts, landArea: 400, buildingFloorArea: area.buildingFloorArea, zoningDistrict: area.zoningDistrict };
              const baseSnap = snapshot(base);
              const chain = propertyDemolishedChain(base);
              cells++;
              const vary = (field: PropertyDemolishedAskField, value: string): Parameters<typeof judgePropertyDemolishedLand>[0] => {
                if (field === "demolishedKind") return { ...base, kind: value as PropertyDemolishedKind | "" };
                if (field === "buildingFloorArea") {
                  return value === "alt" ? { ...base, buildingFloorArea: 10, zoningDistrict: "commercial" } : value === "blank" ? { ...base, buildingFloorArea: undefined, zoningDistrict: undefined } : { ...base, buildingFloorArea: 100, zoningDistrict: "commercial" };
                }
                return { ...base, facts: { ...facts, [FACT_FIELD_KEY[field]]: value } };
              };
              const alternatives = (field: PropertyDemolishedAskField): string[] =>
                field === "demolishedKind" ? ["", "house", "building"] : field === "buildingFloorArea" ? ["blank", "alt", "ok"] : ["", "yes", "no", "unknown"];

              for (const field of ["demolishedKind", "demolishedVacantHouse", "demolishedPermit", "demolishedOtherUse", "demolishedPublicUse", "demolishedPublicUsePaid", "buildingFloorArea"] as PropertyDemolishedAskField[]) {
                const others = alternatives(field).map((v) => snapshot(vary(field, v)));
                if (!chain.asked[field]) {
                  // T4 — 읽히지 않은 칸: 어떤 값이든 결과·읽는 칸이 같다
                  for (const o of others) expect(o).toBe(baseSnap);
                  unreadChecks++;
                } else if (field === chain.next) {
                  // 첫 미답 칸 — 답하면(예·아니오·모름 / 종류 / 면적 입력) 달라진다
                  const answers = alternatives(field).filter((v) => !(v === "" || v === "blank"));
                  expect(answers.some((v) => snapshot(vary(field, v)) !== baseSnap)).toBe(true);
                  nextChecks++;
                } else {
                  // 답한 칸 — 다른 값으로 바꾸면 달라지는 값이 있다(없으면 묻지 않아도 되는 칸 = over-ask)
                  expect(others.some((o) => o !== baseSnap)).toBe(true);
                  readChecks++;
                }
              }
            }
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(100_000);
    expect(readChecks).toBeGreaterThan(100_000);
    expect(nextChecks).toBeGreaterThan(10_000);
    expect(unreadChecks).toBeGreaterThan(100_000);
     
    console.log(`[PSA-S1 T3·T4] cells=${cells} readChecks(over-ask 0)=${readChecks} nextChecks(under-ask 0)=${nextChecks} unreadChecks(stale 무해)=${unreadChecks}`);
  });
});
