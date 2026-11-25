/**
 * PSA-S1 — 철거 요건 사슬 걷기(순차 노출) 격자 anchor.
 * 계획서: docs/01-plan/features/property-separate-demolished-sequential.engine.plan.md §2 · §4 · §5(T1~T4)
 *
 * - T1 판정 동치: 동결 복제본(`_helpers/property-demolished-frozen-s1.ts` — master 79e1eadf6)과 새 `judgePropertyDemolishedLand`를 격자 전수로 대조(판정·사유·인정 면적·고지).
 *   과세기준일 9 × 철거일 경계 × 종류 3(없음 포함) × 사실 칸 4^5 × 면적 칸 4조합(없음·바닥+용도지역·용도지역만·바닥만). 의도된 차이(SQ-5·SQ-6·stale 빈집 «예»)는 규칙으로 명시하고 건수를 센다.
 * - T2 완화만: 새 사슬이 읽는 칸 ⊆ 현행이 묻던 칸, 현행 통과(첫 결함 null) → 새 통과 · 강화 0건.
 * - T3 최소성 오라클(계획서 §2.2 (다) — 사슬(가)과 독립 측정): 읽힌 칸은 값을 바꾸면 판정 또는 읽는 칸 집합이 달라지고(over-ask 0), 첫 미답 칸은 답하면 달라진다(under-ask 0).
 * - T4 stale 무해: 읽히지 않은 칸은 어떤 값으로 바꿔도 판정 전체(`required`·`periodMonths`·고지 포함)와 `order`가 같다.
 *
 * ⏱ 격자 크기 — 기본(CI)은 «연혁 경계 연도 × 철거일 경계 전수 × 사실 칸 대표 표본(답 3지 전수 3^5 + 고정 시드 4^5 무작위 + 깊은 사슬 고정 조합)»으로 줄여 로컬 각 5초 안팎이다.
 * 전수(과세기준일 9 × 사실 칸 4^5 × 면적 4조합 = 1,105,920셀 · T3·T4 368,640셀 — 로컬 약 26초·44초)는 `PSA_FULL_GRID=1`로 켠다(PR 본문에 1회 실행 결과 기록).
 * 축소해도 의도한 차이(SQ-5·SQ-6·읽히지 않은 칸 영향 제거)의 규칙 단언과 over-ask·under-ask 0 단언은 그대로다.
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
const FULL = process.env.PSA_FULL_GRID === "1";
/** 과세기준일 — 연혁 경계(시행 전 2015 · 2016.6.1.(한시 6개월·허가 문언 전) · 2019.6.1.(허가) · 2024.6.1.(건축 외·빈집·면적) · 2026.6.1.(일반 1년))만. 전수는 사이 연도 포함. */
const SS = FULL
  ? ["2015-06-01", "2016-06-01", "2018-06-01", "2019-06-01", "2023-06-01", "2024-06-01", "2025-06-01", "2026-06-01", "2027-06-01"]
  : ["2015-06-01", "2016-06-01", "2019-06-01", "2024-06-01", "2026-06-01"];
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

const ALL_FACTS: PropertyDemolishedFacts[] = [];
for (const permit of FACT) for (const otherUse of FACT) for (const vacantHouse of FACT) for (const publicUse of FACT) for (const publicUsePaid of FACT) {
  ALL_FACTS.push({ permit, otherUse, vacantHouse, publicUse, publicUsePaid });
}

/** 고정 시드 PRNG(mulberry32) — 표본이 실행마다 같다. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 깊은 사슬 고정 조합 — 허가·건축 외·빈집정비·공용·유료를 «예»로 따라가다 각 칸에서 갈라지는 경로(표본이 못 맞혀도 끝까지 가는 셀을 보장). */
const DEEP: PropertyDemolishedFacts[] = [
  { permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "no" },
  { permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "unknown" },
  { permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "" },
  { permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "no", publicUsePaid: "yes" },
  { permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "", publicUsePaid: "yes" },
  { permit: "yes", otherUse: "yes", vacantHouse: "no", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "yes", otherUse: "yes", vacantHouse: "", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "yes", otherUse: "no", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "yes", otherUse: "unknown", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "yes", otherUse: "", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "no", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "unknown", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" },
  { permit: "yes", otherUse: "no", vacantHouse: "no", publicUse: "no", publicUsePaid: "no" },
  { permit: "no", otherUse: "no", vacantHouse: "no", publicUse: "no", publicUsePaid: "no" },
  { permit: "", otherUse: "", vacantHouse: "", publicUse: "", publicUsePaid: "" },
];
const key = (f: PropertyDemolishedFacts) => JSON.stringify(f);
/** 사실 칸 대표 표본 — 답 3지 전수(3^5=243) 중 `triN` + 4^5 무작위 `quadN`(빈칸 포함) + 깊은 사슬 고정. 전수 모드는 4^5 전부. */
function factSet(triN: number, quadN: number, seed: number): PropertyDemolishedFacts[] {
  if (FULL) return ALL_FACTS;
  const rand = rng(seed);
  const pick = (pool: PropertyDemolishedFacts[], n: number) => {
    const copy = [...pool];
    const out: PropertyDemolishedFacts[] = [];
    while (out.length < n && copy.length > 0) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
    return out;
  };
  const tri = ALL_FACTS.filter((f) => Object.values(f).every((v) => v !== ""));
  const merged = new Map<string, PropertyDemolishedFacts>();
  for (const f of [...DEEP, ...pick(tri, triN), ...pick(ALL_FACTS, quadN)]) if (!merged.has(key(f))) merged.set(key(f), f);
  return [...merged.values()];
}
const FACTS_T1 = factSet(100, 100, 20261125);
const FACTS_T3 = factSet(40, 40, 20261126);

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
  it("격자 — 시간 제한 300초(PSA_FULL_GRID=1 전수)", { timeout: FULL ? 600_000 : 300_000 }, () => {
    let cells = 0;
    const exceptions = { periodAllKindsEcho: 0, dateDeterminedNotice: 0, dateDeterminedPeriodMonths: 0, kindlessDateDetermined: 0, staleVacantPeriodMonths: 0 };
    let strictening = 0;
    let relaxed = 0;
    for (const sRaw of SS) {
      const s = d(sRaw);
      const longest = demolishedStatusPeriodMonths(s, true);
      const general = demolishedStatusPeriodMonths(s, false);
      for (const r of removals(s)) {
        for (const kind of KINDS) {
          for (const facts of FACTS_T1) {
            const oldAsked = askedFieldsOfOld(s, r, kind, facts);
            for (const area of FULL || DEEP.includes(facts) ? AREAS : AREAS.slice(0, 2)) {
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

              // 날짜 확정 기간 접힘의 병기 echo — 일반·빈집 기간이 다른 시행본(2024.6.1.~)에서만, 그 밖 모든 셀에는 없다
              if (dateDetermined && n.foldReason === "period" && general !== longest) {
                expect(n.periodAllKinds).toEqual({ general, vacantHouse: longest });
                exceptions.periodAllKindsEcho++;
              } else expect(n.periodAllKinds).toBeUndefined();
              expect(o).not.toHaveProperty("periodAllKinds");

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
    expect(cells).toBeGreaterThan(FULL ? 1_000_000 : 50_000);
    // 의도된 차이가 실제로 나타난다(공허 방지) — 격자가 규칙을 검사하고 있다
    expect(exceptions.periodAllKindsEcho).toBeGreaterThan(0);
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
  it("읽힌 칸은 값을 바꾸면 달라지고(over-ask 0) · 첫 미답 칸은 답하면 달라지며(under-ask 0) · 읽히지 않은 칸은 무엇으로 바꿔도 같다 — 시간 제한 300초(PSA_FULL_GRID=1 전수)", { timeout: FULL ? 900_000 : 300_000 }, () => {
    let cells = 0;
    let readChecks = 0;
    let nextChecks = 0;
    let unreadChecks = 0;
    // 칸마다 세 갈래(읽혀 답함 · 첫 미답 · 읽히지 않음)가 모두 한 번 이상 검사돼야 한다(공허 방지)
    const perField: Record<string, { read: number; next: number; unread: number }> = {};
    for (const sRaw of SS) {
      const s = d(sRaw);
      for (const r of removals(s)) {
        for (const kind of ["", "house", "building"] as const) {
          for (const facts of FACTS_T3) {
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
                const pf = (perField[field] ??= { read: 0, next: 0, unread: 0 });
                const others = alternatives(field).map((v) => snapshot(vary(field, v)));
                if (!chain.asked[field]) {
                  // T4 — 읽히지 않은 칸: 어떤 값이든 결과·읽는 칸이 같다
                  for (const o of others) expect(o).toBe(baseSnap);
                  unreadChecks++;
                  pf.unread++;
                } else if (field === chain.next) {
                  // 첫 미답 칸 — 답하면(예·아니오·모름 / 종류 / 면적 입력) 달라진다
                  const answers = alternatives(field).filter((v) => !(v === "" || v === "blank"));
                  expect(answers.some((v) => snapshot(vary(field, v)) !== baseSnap)).toBe(true);
                  nextChecks++;
                  pf.next++;
                } else {
                  // 답한 칸 — 다른 값으로 바꾸면 달라지는 값이 있다(없으면 묻지 않아도 되는 칸 = over-ask)
                  expect(others.some((o) => o !== baseSnap)).toBe(true);
                  readChecks++;
                  pf.read++;
                }
              }
            }
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(FULL ? 100_000 : 10_000);
    for (const [field, c] of Object.entries(perField)) {
      // 종류 칸은 철거일 확정 구간에서만 «읽히지 않음» · 빈집정비·유료는 «읽혀 답함»이 깊은 사슬에서만 — 그래도 세 갈래 모두 비어 있지 않아야 한다
      expect(c.read, `${field} read`).toBeGreaterThan(0);
      expect(c.next, `${field} next`).toBeGreaterThan(0);
      expect(c.unread, `${field} unread`).toBeGreaterThan(0);
    }
    expect(readChecks).toBeGreaterThan(FULL ? 100_000 : 10_000);
    expect(nextChecks).toBeGreaterThan(FULL ? 10_000 : 1_000);
    expect(unreadChecks).toBeGreaterThan(FULL ? 100_000 : 10_000);
     
    console.log(`[PSA-S1 T3·T4] cells=${cells} readChecks(over-ask 0)=${readChecks} nextChecks(under-ask 0)=${nextChecks} unreadChecks(stale 무해)=${unreadChecks}`);
  });
});
