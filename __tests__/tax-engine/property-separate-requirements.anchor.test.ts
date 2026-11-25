/**
 * PSA-E1 — 재산세 별도합산 철거ㆍ멸실 부속토지 요건 판정 leaf anchor (지방세법 시행령 §103의2).
 * 계획서: docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md v3 §5 · §7(K-1~K-26 · 격자)
 *
 * leaf 단독 — 엔진(`isSeparateAggregateLand`)에는 연결하지 않았다(PSA-E2·E4). 세액 열은 인정 면적에서 독립 산식(공시지가 100만원/㎡ × 70% → 천원 절사 → 별도합산 누진)으로 대조한다.
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { judgePropertyDemolishedLand } from "../../lib/tax-engine/property-separate-requirements";
import { propertyBuildingPermitRequired } from "../../lib/tax-engine/property-separate-requirements";
import { propertyDemolishedFactIssue } from "../../lib/tax-engine/property-separate-requirements";
import { propertyDemolishedChain } from "../../lib/tax-engine/property-separate-requirements";
import { resolvePropertyTaxBaseDate } from "../../lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_ISSUE_MESSAGE } from "../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedAskField } from "../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedFacts } from "../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedJudgeInput } from "../../lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedKind } from "../../lib/tax-engine/property-separate-requirements";
import { demolishedAreaClauseApplies } from "../../lib/tax-engine/data/nbl-historical-values-era";
import { demolishedAreaClauseAppliesOn } from "../../lib/tax-engine/data/nbl-historical-values-era";
import { demolishedOtherUseClauseApplies } from "../../lib/tax-engine/data/nbl-historical-values-era";
import { demolishedPermitClauseApplies } from "../../lib/tax-engine/data/nbl-historical-values-era";
import { demolishedVacantHouseClauseApplies } from "../../lib/tax-engine/data/nbl-historical-values-era";
import { addMonthsUtc } from "../../lib/tax-engine/civil-period";
import { periodEndFromMonths } from "../../lib/tax-engine/civil-period";
import { parseISO } from "../../lib/tax-engine/utc-date";

const d = parseISO;
const OK: PropertyDemolishedFacts = { permit: "yes", otherUse: "no" };

/** 공통: 건축물 300㎡ 상업(3배) · 바닥 100(한도 300) · 허가 yes · 건축 외 용도 no · s = 2026-06-01 · 철거 2026-01-01. */
function building(over: Partial<PropertyDemolishedJudgeInput> = {}): PropertyDemolishedJudgeInput {
  return { taxBaseDate: d("2026-06-01"), removedOn: d("2026-01-01"), kind: "building", facts: OK, landArea: 300, buildingFloorArea: 100, zoningDistrict: "commercial", ...over };
}
/** 주택: 부속토지 400㎡ 일반주거 — 바닥면적·용도지역 입력 없음(비요구). */
function house(over: Partial<PropertyDemolishedJudgeInput> = {}): PropertyDemolishedJudgeInput {
  return { taxBaseDate: d("2026-06-01"), removedOn: d("2026-01-01"), kind: "house", facts: { ...OK, vacantHouse: "no" }, landArea: 400, ...over };
}

/** 별도합산 본세 — 공시지가 100만원/㎡ × 공정시장가액비율 70% → 천원 절사 → 0.2%/0.3%-20만/0.4%-120만(독립 산식). */
function separateTax(area: number): number {
  const base = Math.floor((area * 1_000_000 * 70) / 100 / 1000) * 1000;
  if (base <= 200_000_000) return Math.floor(base * 0.002);
  if (base <= 1_000_000_000) return Math.floor(base * 0.003) - 200_000;
  return Math.floor(base * 0.004) - 1_200_000;
}

interface Expect {
  kind: "holds" | "fold";
  reason?: string;
  recognized: number;
  excess: number;
  tax?: number;
}
function check(label: string, input: PropertyDemolishedJudgeInput, e: Expect) {
  it(label, () => {
    const v = judgePropertyDemolishedLand(input);
    expect({ kind: v.kind, reason: v.foldReason, recognized: v.recognizedArea, excess: v.excessArea }).toEqual({ kind: e.kind, reason: e.reason, recognized: e.recognized, excess: e.excess });
    if (e.tax !== undefined) expect(separateTax(v.recognizedArea)).toBe(e.tax);
  });
}

describe("PSA-E1 K-1~K-14 — 건축물 요건 ① ② · 기간 · 연혁", () => {
  check("K-1 철거 2026-01-01 · 요건 충족 → 별도합산 300㎡ · 430,000", building(), { kind: "holds", recognized: 300, excess: 0, tax: 430_000 });
  check("K-2 허가 no → fold permit", building({ facts: { permit: "no", otherUse: "no" } }), { kind: "fold", reason: "permit", recognized: 0, excess: 300 });
  check("K-3 허가 unknown → fold permit", building({ facts: { permit: "unknown", otherUse: "no" } }), { kind: "fold", reason: "permit", recognized: 0, excess: 300 });
  check("K-4 허가 '' (직접 호출 — 입구는 ⑧·⑫가 막는다) → fold permit", building({ facts: { permit: "", otherUse: "no" } }), { kind: "fold", reason: "permit", recognized: 0, excess: 300 });
  check("K-5 건축 외 용도 yes → fold other_use", building({ facts: { permit: "yes", otherUse: "yes" } }), { kind: "fold", reason: "other_use", recognized: 0, excess: 300 });
  check("K-6 건축 외 용도 unknown → fold other_use", building({ facts: { permit: "yes", otherUse: "unknown" } }), { kind: "fold", reason: "other_use", recognized: 0, excess: 300 });
  check("K-7 철거 2025-06-01(1년 만료일 당일) → 별도합산", building({ removedOn: d("2025-06-01") }), { kind: "holds", recognized: 300, excess: 0, tax: 430_000 });
  check("K-8 철거 2025-05-31 → fold period", building({ removedOn: d("2025-05-31"), facts: {} }), { kind: "fold", reason: "period", recognized: 0, excess: 300 });
  check("K-9 토지 1,000㎡ 공업 4배 바닥 100 → 400㎡ + 이관 600㎡ · 640,000", building({ landArea: 1000, zoningDistrict: "industrial" }), { kind: "holds", recognized: 400, excess: 600, tax: 640_000 });
  check("K-10 s=2018-06-01 · 허가 no → 별도합산(허가 문언 전)", building({ taxBaseDate: d("2018-06-01"), removedOn: d("2018-03-01"), facts: { permit: "no" } }), { kind: "holds", recognized: 300, excess: 0, tax: 430_000 });
  check("K-11 s=2019-06-01 · 허가 no → fold permit", building({ taxBaseDate: d("2019-06-01"), removedOn: d("2019-02-01"), facts: { permit: "no" } }), { kind: "fold", reason: "permit", recognized: 0, excess: 300 });
  check("K-12 s=2023-06-01 · 건축 외 용도 yes → 별도합산(문언 전)", building({ taxBaseDate: d("2023-06-01"), removedOn: d("2023-03-01"), facts: { permit: "yes", otherUse: "yes" } }), { kind: "holds", recognized: 300, excess: 0, tax: 430_000 });
  check("K-13 s=2024-06-01 · 건축 외 용도 yes → fold other_use", building({ taxBaseDate: d("2024-06-01"), removedOn: d("2024-03-01"), facts: { permit: "yes", otherUse: "yes" } }), { kind: "fold", reason: "other_use", recognized: 0, excess: 300 });
  check("K-14 s=2016-05-31 → fold not_yet", building({ taxBaseDate: d("2016-05-31"), removedOn: d("2016-03-01"), facts: {} }), { kind: "fold", reason: "not_yet", recognized: 0, excess: 300 });

  it("K-3 «확인되지 않아» 고지 · K-2 «받지 않은» 고지 — 사유별 문구가 다르다", () => {
    expect(judgePropertyDemolishedLand(building({ facts: { permit: "unknown", otherUse: "no" } })).notices[0]).toContain("확인되지 않아");
    expect(judgePropertyDemolishedLand(building({ facts: { permit: "no", otherUse: "no" } })).notices[0]).toContain("받지 않은");
  });
  it("K-12 건축 외 용도 문언 전 시행본 고지 · 요구 칸 아님", () => {
    const v = judgePropertyDemolishedLand(building({ taxBaseDate: d("2023-06-01"), removedOn: d("2023-03-01"), facts: { permit: "yes" } }));
    expect(v.required.otherUse).toBe(false);
    expect(v.notices.join("")).toContain("사용 용도를 묻지 않고");
  });
});

describe("PSA-E1 K-15~K-26 — 주택 · 빈집 · 단서 · 면적", () => {
  check("K-15 주택 · 철거 2026-01-01 · 요건 충족 → 400㎡ 전부(배율 한도 없음) · 640,000", house(), { kind: "holds", recognized: 400, excess: 0, tax: 640_000 });
  check("K-16 주택 · 철거 2024-06-15 · 빈집 yes → 3년 안 별도합산 400㎡", house({ removedOn: d("2024-06-15"), facts: { ...OK, vacantHouse: "yes" } }), { kind: "holds", recognized: 400, excess: 0, tax: 640_000 });
  check("K-17 같은 · 빈집 no → fold period", house({ removedOn: d("2024-06-15"), facts: { ...OK, vacantHouse: "no" } }), { kind: "fold", reason: "period", recognized: 0, excess: 400 });
  check("K-18 같은 · 빈집 unknown → fold period", house({ removedOn: d("2024-06-15"), facts: { ...OK, vacantHouse: "unknown" } }), { kind: "fold", reason: "period", recognized: 0, excess: 400 });
  const vac = { ...OK, vacantHouse: "yes" as const, otherUse: "yes" as const };
  check("K-19 빈집 yes · 건축 외 yes · 공용 yes · 유료 yes → 단서 포함", house({ removedOn: d("2024-06-15"), facts: { ...vac, publicUse: "yes", publicUsePaid: "yes" } }), { kind: "holds", recognized: 400, excess: 0, tax: 640_000 });
  check("K-20 유료 no → fold public_use_unpaid", house({ removedOn: d("2024-06-15"), facts: { ...vac, publicUse: "yes", publicUsePaid: "no" } }), { kind: "fold", reason: "public_use_unpaid", recognized: 0, excess: 400 });
  check("K-20b 유료 unknown → fold other_use(비과세 고지 아님)", house({ removedOn: d("2024-06-15"), facts: { ...vac, publicUse: "yes", publicUsePaid: "unknown" } }), { kind: "fold", reason: "other_use", recognized: 0, excess: 400 });
  check("K-21a 공용 no → fold other_use", house({ removedOn: d("2024-06-15"), facts: { ...vac, publicUse: "no" } }), { kind: "fold", reason: "other_use", recognized: 0, excess: 400 });
  check("K-21b 공용 unknown → fold other_use", house({ removedOn: d("2024-06-15"), facts: { ...vac, publicUse: "unknown" } }), { kind: "fold", reason: "other_use", recognized: 0, excess: 400 });
  check("K-22 건축 외 yes · 빈집 no(철거 2026-01-01) → 단서 불성립 — stale 공용·유료 yes 무시", house({ facts: { ...OK, otherUse: "yes", vacantHouse: "no", publicUse: "yes", publicUsePaid: "yes" } }), { kind: "fold", reason: "other_use", recognized: 0, excess: 400 });
  check("K-23 건축물 · 직접 API가 빈집 yes를 보내도 무시 → fold period", building({ removedOn: d("2024-06-15"), facts: { ...OK, vacantHouse: "yes" } }), { kind: "fold", reason: "period", recognized: 0, excess: 300 });
  check("K-24 주택 · s=2023-06-01 · 철거 2023-03-01 → 400㎡ 전부", house({ taxBaseDate: d("2023-06-01"), removedOn: d("2023-03-01"), facts: OK }), { kind: "holds", recognized: 400, excess: 0, tax: 640_000 });
  check("K-25 건축물 · s=2023-06-01 · 공업 1,000㎡ 바닥 100 → 1,000㎡ 전부 · 1,900,000", building({ taxBaseDate: d("2023-06-01"), removedOn: d("2023-03-01"), facts: { permit: "yes" }, landArea: 1000, zoningDistrict: "industrial" }), { kind: "holds", recognized: 1000, excess: 0, tax: 1_900_000 });
  check("K-26 같은 시료 s=2024-06-01 · 철거 2024-03-01 → 400㎡ + 이관 600㎡", building({ taxBaseDate: d("2024-06-01"), removedOn: d("2024-03-01"), landArea: 1000, zoningDistrict: "industrial" }), { kind: "holds", recognized: 400, excess: 600, tax: 640_000 });

  it("K-16 빈집 3년 만료일 경계 — 철거 2023-06-01은 s=2026-06-01 당일까지 안 · 2023-05-31은 밖", () => {
    const f = { ...OK, vacantHouse: "yes" as const };
    expect(judgePropertyDemolishedLand(house({ removedOn: d("2023-06-01"), facts: f })).kind).toBe("holds");
    expect(judgePropertyDemolishedLand(house({ removedOn: d("2023-05-31"), facts: f })).foldReason).toBe("period");
  });
  it("K-18 3년 연장 미확인 고지 — unknown·'' 이고 결과가 달라질 수 있을 때만", () => {
    const at = (vacantHouse: "" | "yes" | "no" | "unknown", removedOn: string) => judgePropertyDemolishedLand(house({ removedOn: d(removedOn), facts: { ...OK, vacantHouse } }));
    expect(at("unknown", "2024-06-15").vacantHouseExtensionUnconfirmed).toBe(true);
    expect(at("unknown", "2024-06-15").notices.join("")).toContain("3년 연장");
    expect(at("", "2024-06-15").vacantHouseExtensionUnconfirmed).toBe(true);
    expect(at("no", "2024-06-15").vacantHouseExtensionUnconfirmed).toBe(false);
    expect(at("unknown", "2020-01-01").vacantHouseExtensionUnconfirmed).toBe(false); // 3년도 지남 — 결과 불변
  });
  it("K-20 무상 공용 고지 — 비과세 가능성(§109②)·비과세를 판정하지 않음", () => {
    const v = judgePropertyDemolishedLand(house({ removedOn: d("2024-06-15"), facts: { ...vac, publicUse: "yes", publicUsePaid: "no" } }));
    expect(v.notices[0]).toContain("재산세가 부과되지 않을 수 있습니다");
    expect(v.notices[0]).toContain("비과세를 판정하지 않아");
  });
  it("K-24·K-25 면적 고지 — 주택 10배(영 §105) · 문언 전 시행본", () => {
    expect(judgePropertyDemolishedLand(house()).notices.join("")).toContain("바닥면적의 10배");
    expect(judgePropertyDemolishedLand(building({ taxBaseDate: d("2023-06-01"), removedOn: d("2023-03-01"), facts: { permit: "yes" } })).notices.join("")).toContain("적용배율 범위 문언");
  });
  it("K-26 면적 범위 직접 호출 결함 — 바닥면적 없음·용도지역 미등재는 종합합산 접힘(throw 없음)", () => {
    expect(judgePropertyDemolishedLand(building({ buildingFloorArea: undefined })).foldReason).toBe("area_input");
    expect(judgePropertyDemolishedLand(building({ zoningDistrict: "residential" })).foldReason).toBe("area_input");
  });
  it("면적 round2 — 바닥면적 8.045 × 4배 = 32.18 (부동소수 잔여 제거)", () => {
    const v = judgePropertyDemolishedLand(building({ landArea: 100, buildingFloorArea: 8.045, zoningDistrict: "industrial" }));
    expect(v.recognizedArea).toBe(32.18);
    expect(v.excessArea).toBe(67.82);
  });
});

describe("PSA-E1 읽는 칸(사슬) · 하위 칸 사슬 · 입구 결함 — PSA-S1이 요구 술어 2개를 사슬 걷기로 대체", () => {
  /** 이 답으로 엔진이 읽는 칸 — 사슬(`propertyDemolishedChain().order`)이 ⑤·⑧·④·⑫의 단일 소스다. */
  const read = (kind: PropertyDemolishedKind | "", s: string, r: string, facts: PropertyDemolishedFacts = { permit: "yes", otherUse: "no", vacantHouse: "yes" }): PropertyDemolishedAskField[] =>
    propertyDemolishedChain({ taxBaseDate: d(s), removedOn: d(r), kind, facts }).order;
  it("읽는 칸 집합 — 시행본별(건축물·주택) · 모든 요건을 «통과» 답으로 걸었을 때", () => {
    expect(read("building", "2026-06-01", "2026-01-01")).toEqual(["demolishedKind", "demolishedPermit", "demolishedOtherUse", "buildingFloorArea"]);
    expect(read("house", "2026-06-01", "2026-01-01")).toEqual(["demolishedKind", "demolishedPermit", "demolishedOtherUse"]); // 주택 — 바닥면적 비요구 · 빈집정비는 건축 외 «예» 뒤 단서 하위일 때만
    expect(read("building", "2023-06-01", "2023-03-01")).toEqual(["demolishedKind", "demolishedPermit"]);
    expect(read("house", "2023-06-01", "2023-03-01")).toEqual(["demolishedKind", "demolishedPermit"]);
    expect(read("building", "2018-06-01", "2018-03-01")).toEqual(["demolishedKind"]);
    expect(read("building", "2024-06-01", "2024-03-01")).toEqual(["demolishedKind", "demolishedPermit", "demolishedOtherUse", "buildingFloorArea"]);
  });
  it("한시 기간 밖·철거일 없음·종류 없음·철거일 > 과세기준일 → 앞 답이 확정하면 뒤 칸을 읽지 않는다", () => {
    expect(read("building", "2026-06-01", "2025-05-31")).toEqual(["demolishedKind"]); // 일반 기간(1년) 밖 — 건축물은 종류만 읽고 period
    expect(read("house", "2026-06-01", "2023-05-31")).toEqual([]); // 빈집 3년 만료 다음 날 — 날짜만으로 확정(종류도 안 물음)
    expect(read("house", "2026-06-01", "2023-06-01", {})).toEqual(["demolishedKind", "demolishedVacantHouse"]); // 3년 만료일 당일 — 빈집정비 관문 열림(미답이라 거기서 멈춘다)
    expect(read("house", "2026-06-01", "2023-06-01", { vacantHouse: "yes" })).toEqual(["demolishedKind", "demolishedVacantHouse", "demolishedPermit"]); // «예» → 허가로 이어진다
    expect(read("", "2026-06-01", "2026-01-01")).toEqual(["demolishedKind"]); // 종류 미답 — 거기서 멈춘다
    expect(read("building", "2026-06-01", "2026-06-02")).toEqual([]);
    expect(read("building", "2016-05-31", "2016-03-01")).toEqual([]);
    expect(propertyDemolishedChain({ taxBaseDate: d("2026-06-01"), removedOn: undefined, kind: "house", facts: {} }).order).toEqual([]);
    expect(propertyDemolishedChain({ taxBaseDate: d("2026-06-01"), removedOn: d("not-a-date"), kind: "house", facts: {} }).order).toEqual([]);
  });
  it("공용 사용 사슬 — 건축 외 yes ∧ 빈집 yes일 때만 공용 칸, 공용 yes일 때만 유료 칸 (날짜 칸 없음)", () => {
    const chain = (facts: PropertyDemolishedFacts) => propertyDemolishedChain({ taxBaseDate: d("2026-06-01"), removedOn: d("2025-12-01"), kind: "house", facts });
    const base = { permit: "yes", otherUse: "yes" } as const;
    expect(chain({ ...base, vacantHouse: "yes" }).next).toBe("demolishedPublicUse");
    expect(chain({ ...base, vacantHouse: "yes", publicUse: "yes" }).next).toBe("demolishedPublicUsePaid");
    expect(chain({ ...base, vacantHouse: "yes", publicUse: "no" }).asked.demolishedPublicUsePaid).toBe(false);
    expect(chain({ ...base, vacantHouse: "no", publicUse: "yes" }).asked.demolishedPublicUse).toBe(false);
    expect(chain({ permit: "yes", otherUse: "no", vacantHouse: "yes", publicUse: "yes" }).asked.demolishedPublicUse).toBe(false);
    // 건축물은 단서가 없다 — 건축 외 «예»에서 접힌다
    expect(propertyDemolishedChain({ taxBaseDate: d("2026-06-01"), removedOn: d("2025-12-01"), kind: "building", facts: { ...base, vacantHouse: "yes", publicUse: "yes" } }).asked.demolishedPublicUse).toBe(false);
  });

  const issue = (o: Partial<Parameters<typeof propertyDemolishedFactIssue>[0]> = {}) =>
    propertyDemolishedFactIssue({ taxBaseDate: d("2026-06-01"), removedOn: d("2026-01-01"), kind: "building", facts: OK, buildingFloorArea: 100, zoningDistrict: "commercial", ...o });
  it("K-4 허가 '' → demolishedPermit 결함 · K-31 종류 '' → demolishedKind · K-30 철거일 > 과세기준일 → demolishedDate", () => {
    expect(issue({ facts: { permit: "", otherUse: "no" } })?.field).toBe("demolishedPermit");
    expect(issue({ kind: "" })).toEqual({ field: "demolishedKind", message: PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedKind });
    expect(issue({ removedOn: d("2026-06-02") })).toEqual({ field: "demolishedDate", message: PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedAfterBaseDate });
    expect(issue({ removedOn: undefined })?.field).toBe("demolishedDate");
  });
  it("명시 «모름»·«아니오»·«예»는 막지 않는다 — 미선택만 막는다(Q-1)", () => {
    expect(issue({ facts: { permit: "unknown", otherUse: "yes" } })).toBeNull();
    expect(issue({ facts: { permit: "no", otherUse: "unknown" } })).toBeNull();
  });
  it("첫 결함 순서 — 허가 → 건축 외 용도 → 빈집정비(단서 하위) → 공용 → 유료 → 용도지역 → 바닥면적", () => {
    const h = (facts: PropertyDemolishedFacts) => propertyDemolishedFactIssue({ taxBaseDate: d("2026-06-01"), removedOn: d("2026-01-01"), kind: "house", facts });
    expect(h({})?.field).toBe("demolishedPermit");
    expect(h({ permit: "yes" })?.field).toBe("demolishedOtherUse");
    expect(h({ permit: "yes", otherUse: "yes" })?.field).toBe("demolishedVacantHouse");
    expect(h({ permit: "yes", otherUse: "yes", vacantHouse: "yes" })?.field).toBe("demolishedPublicUse");
    expect(h({ permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes" })?.field).toBe("demolishedPublicUsePaid");
    expect(h({ permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", publicUsePaid: "yes" })).toBeNull();
    expect(h({ permit: "yes", otherUse: "yes", vacantHouse: "no" })).toBeNull(); // 사슬 불성립 — 공용 칸 비요구
    expect(h({ permit: "yes", otherUse: "no" })).toBeNull(); // 건축 외 «아니오» — 빈집정비도 안 묻는다(주택·일반 기간 안)
    // 빈집정비 관문(철거일이 일반 기간 밖·빈집 기간 안) — 허가보다 먼저
    const gate = (facts: PropertyDemolishedFacts) => propertyDemolishedFactIssue({ taxBaseDate: d("2026-06-01"), removedOn: d("2024-06-15"), kind: "house", facts });
    expect(gate({})?.field).toBe("demolishedVacantHouse");
    expect(gate({ vacantHouse: "no" })).toBeNull(); // 접힘 확정 — 허가·건축 외를 묻지 않는다
    expect(gate({ vacantHouse: "yes" })?.field).toBe("demolishedPermit");
    expect(gate({ vacantHouse: "yes", permit: "yes" })?.field).toBe("demolishedOtherUse");
    expect(issue({ buildingFloorArea: undefined })?.field).toBe("buildingFloorArea");
    expect(issue({ buildingFloorArea: 0 })?.field).toBe("buildingFloorArea");
    expect(issue({ buildingFloorArea: Number.NaN })?.field).toBe("buildingFloorArea");
    expect(issue({ zoningDistrict: undefined })?.field).toBe("zoningDistrict");
    expect(issue({ zoningDistrict: "residential" })?.field).toBe("zoningDistrict"); // 세분 전 주거지역은 배율 결정 불가
    expect(issue({ buildingFloorArea: undefined, zoningDistrict: undefined })?.field).toBe("zoningDistrict"); // 둘 다 비면 용도지역 먼저(비철거 ⑧·⑫와 같은 순서 — SV-8)
  });
  it("K-15·K-25 주택·문언 전 시행본은 바닥면적·용도지역 비요구 — ⑧ 통과·⑫ 200 막다른 길 없음(M12)", () => {
    expect(propertyDemolishedFactIssue({ taxBaseDate: d("2026-06-01"), removedOn: d("2026-01-01"), kind: "house", facts: { ...OK, vacantHouse: "no" } })).toBeNull();
    expect(propertyDemolishedFactIssue({ taxBaseDate: d("2023-06-01"), removedOn: d("2023-03-01"), kind: "building", facts: { permit: "yes" } })).toBeNull();
  });
  it("공장용지 ∧ 주택 모순 차단(UQ-8)", () => {
    expect(issue({ kind: "house", isFactory: true, facts: { ...OK, vacantHouse: "no" } })).toEqual({ field: "demolishedKind", message: PROPERTY_DEMOLISHED_ISSUE_MESSAGE.demolishedFactoryHouse });
    expect(issue({ isFactory: true })).toBeNull();
  });
  it("K-8 기간 밖이면 사실 칸을 묻지 않는다", () => {
    expect(issue({ removedOn: d("2025-05-31"), facts: {}, buildingFloorArea: undefined, zoningDistrict: undefined })).toBeNull();
  });
});

describe("PSA-E1 과세기준일 해석 · 연혁 술어", () => {
  it("resolvePropertyTaxBaseDate — targetDate 연도 6.1. · 없으면 now의 UTC 연도 6.1.", () => {
    expect(resolvePropertyTaxBaseDate("2025-03-15").toISOString()).toBe("2025-06-01T00:00:00.000Z");
    expect(resolvePropertyTaxBaseDate(d("2024-12-31")).toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(resolvePropertyTaxBaseDate(undefined, new Date("2026-12-31T23:30:00Z")).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(Number.isNaN(resolvePropertyTaxBaseDate("garbage").getTime())).toBe(true);
  });
  it("M13 서버 시간대 — 12.31. 23:30 UTC는 KST 로컬로는 이듬해지만 과세기준일은 UTC 연도(브라우저·서버 일치)", () => {
    const prev = process.env.TZ;
    process.env.TZ = "Asia/Seoul";
    try {
      const now = new Date("2026-12-31T23:30:00Z");
      expect(now.getFullYear()).toBe(2027); // 전제 — 로컬 달력은 이듬해
      expect(resolvePropertyTaxBaseDate(undefined, now).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
  it("면적 문언 시행본 술어 — 2024.6.1.부터 · 양도세 `demolishedAreaClauseApplies`는 같은 경계(동작 불변)", () => {
    expect(demolishedAreaClauseAppliesOn(d("2024-05-31"))).toBe(false);
    expect(demolishedAreaClauseAppliesOn(d("2024-06-01"))).toBe(true);
    expect(demolishedAreaClauseApplies(d("2024-06-01"))).toBe(true);
    expect(demolishedAreaClauseApplies(d("2024-05-31"))).toBe(false); // 양도일 2024-05-31 → 마지막 과세기준일 2023-06-01
    expect(demolishedAreaClauseApplies(undefined)).toBe(true);
  });
  it("연혁 술어 경계 — 허가 2019.6.1. · 건축 외 용도·빈집 2024.6.1.(과세기준일은 6.1.뿐이라 경계 하루 전 날짜로 직접 단언)", () => {
    expect([demolishedPermitClauseApplies(d("2019-05-31")), demolishedPermitClauseApplies(d("2019-06-01"))]).toEqual([false, true]);
    expect([demolishedOtherUseClauseApplies(d("2024-05-31")), demolishedOtherUseClauseApplies(d("2024-06-01"))]).toEqual([false, true]);
    expect([demolishedVacantHouseClauseApplies(d("2024-05-31")), demolishedVacantHouseClauseApplies(d("2024-06-01"))]).toEqual([false, true]);
  });
  it("본 경로 허가 요건(Q-2 — PSA-E3가 연결) — 2011.6.1. 과세기준일부터", () => {
    expect(propertyBuildingPermitRequired(d("2010-06-01"))).toBe(false);
    expect(propertyBuildingPermitRequired(d("2011-06-01"))).toBe(true);
  });
});

describe("PSA-E1·S1 ⑧↔⑫ 패리티 격자 — 읽는 칸(사슬) ≡ 차단 ≡ 읽기 (종류 × 과세기준일 × 철거일 경계 × 사실 칸 전수)", () => {
  const FACT: Array<"" | "yes" | "no" | "unknown"> = ["", "yes", "no", "unknown"];
  const SS = ["2016-05-31", "2016-06-01", "2018-06-01", "2019-06-01", "2023-06-01", "2024-06-01", "2026-06-01"];
  const KINDS: Array<PropertyDemolishedKind | ""> = ["", "house", "building"];
  /** 철거일 후보 — s 뒤 · 당일 · 6/12/36개월 만료일 당일과 다음 날 · 기간 안. */
  function removals(s: Date): Date[] {
    const out: Date[] = [new Date(s.getTime() + 86_400_000), s, addMonthsUtc(s, -2)];
    for (const m of [6, 12, 36]) {
      const r = addMonthsUtc(s, -m);
      for (let k = -3; k <= 3; k++) {
        const cand = new Date(r.getTime() + k * 86_400_000);
        const end = periodEndFromMonths(cand, m).getTime();
        if (end === s.getTime() || end === s.getTime() - 86_400_000) out.push(cand);
      }
    }
    return out;
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  it("전수 불변식 — 시간 제한 60초", { timeout: 60_000 }, () => {
    let cells = 0;
    const FIELD_OF: Record<string, keyof PropertyDemolishedFacts> = {
      demolishedPermit: "permit", demolishedOtherUse: "otherUse", demolishedVacantHouse: "vacantHouse", demolishedPublicUse: "publicUse", demolishedPublicUsePaid: "publicUsePaid",
    };
    for (const sRaw of SS) {
      const s = d(sRaw);
      for (const r of removals(s)) {
        for (const kind of KINDS) {
          for (const permit of FACT) for (const otherUse of FACT) for (const vacantHouse of FACT) for (const publicUse of FACT) for (const publicUsePaid of FACT) {
            const facts: PropertyDemolishedFacts = { permit, otherUse, vacantHouse, publicUse, publicUsePaid };
            const input = { taxBaseDate: s, removedOn: r, kind, facts, buildingFloorArea: 100, zoningDistrict: "commercial" };
            const chain = propertyDemolishedChain(input);
            const iss = propertyDemolishedFactIssue(input);
            const v = judgePropertyDemolishedLand({ ...input, landArea: 400 });
            cells++;

            // (1) 입구가 통과시킨 입력을 판정이 «결함 입력»으로 접지 않는다
            if (iss === null) expect(["input", "area_input"]).not.toContain(v.foldReason);
            // (2) 입구 통과 ⇔ 사슬에 미답 칸이 없다 · 결함이 칸이면 그 칸은 사슬이 읽었고 비어 있다(첫 미답 칸 = next)
            if (iss === null) expect(chain.next).toBeNull();
            else if (FIELD_OF[iss.field]) {
              expect(chain.next).toBe(iss.field);
              expect(chain.asked[iss.field as keyof typeof chain.asked]).toBe(true);
              expect(facts[FIELD_OF[iss.field]] === "" || facts[FIELD_OF[iss.field]] === undefined).toBe(true);
            } else expect(["demolishedKind", "demolishedDate"]).toContain(iss.field);
            // (3) kind·철거일 결함이 있으면 날짜 결함은 읽는 칸 0, 종류 결함은 종류만 읽는다
            if (utcLater(r, s)) expect(chain.order).toEqual([]);
            else if (kind === "" && chain.order.length > 0) expect(chain.order).toEqual(["demolishedKind"]);
            // (4) 판정 완결 — 인정 + 이관 = 부속토지 전체
            expect(v.recognizedArea + v.excessArea).toBe(400);
            // (5) stale 무해 — 읽히지 않은 칸은 값이 무엇이든 판정이 같다
            const stale: PropertyDemolishedFacts = {
              permit: chain.asked.demolishedPermit ? permit : "no",
              otherUse: chain.asked.demolishedOtherUse ? otherUse : "yes",
              vacantHouse: chain.asked.demolishedVacantHouse ? vacantHouse : "yes",
              publicUse: chain.asked.demolishedPublicUse ? publicUse : "yes",
              publicUsePaid: chain.asked.demolishedPublicUsePaid ? publicUsePaid : "yes",
            };
            if (!same(stale, facts)) {
              const v2 = judgePropertyDemolishedLand({ ...input, facts: stale, landArea: 400 });
              expect(v2).toEqual(v);
            }
            // (6) 판정 `required` echo = 사슬이 읽은 칸
            expect(v.required).toEqual({
              permit: chain.asked.demolishedPermit,
              otherUse: chain.asked.demolishedOtherUse,
              vacantHouse: chain.asked.demolishedVacantHouse,
              floorArea: chain.asked.buildingFloorArea,
              publicUse: chain.asked.demolishedPublicUse,
              publicUsePaid: chain.asked.demolishedPublicUsePaid,
            });
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(100_000);
  });
});

function utcLater(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}
