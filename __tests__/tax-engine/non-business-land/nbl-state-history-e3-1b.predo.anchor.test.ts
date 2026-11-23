/**
 * NBL-STATE-HISTORY-E3-1b (E3b-0, 테스트만) — Pre-Do anchor. 지금 코드로 green이어야 한다(제품 코드 변경 0).
 *
 *   Anchor 1  일 단위 정답표: 계획서 §5 R1~R18(+ 근거·면적한도 변형)을 `meetsPeriodCriteria`에 «이전 구간 ∪ 꼬리» 구간(`biz`)을 직접 넣어 일수·판정 고정.
 *             임계선 쌍 3개(R5/R6 나목 730/729 · R8/R9 다목 2,191/2,190 · R15/R16 윤일 창 731/730)는 E2·E3-① 표(M8a/b · Z-1460/1461 · M8c · T3a/b · T4a/b · T12a/b)와 **일수·판정이 같다**.
 *   Anchor 2  하위호환 게이트 근거 — ① «이 입력이 지금 왜 틀린가»(현행 엔진 실측: 이력 없음/신축 앞 종합합산 고정) ② 신축 행 stray Before의 경고 바이트(V-1 fixture — E3b-0 실측 후 E3b-1에서 «구간 판정 불변 · separate(근거 없음)만 새 고지»로 갱신) ③ 바꾸지 않는 행 R12·R13(철거 후 한시·건축 중은 유예가 이미 덮음).
 *   Anchor 3  해석기 재사용 전제: `resolvePropertyTaxBasis({hasBuilding:false})` 조합이 어디로 가는지 고정 — E3b-1이 **같은 함수**를 구간마다 부른다(함수가 바뀌면 둘이 함께 깨진다).
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.engine.plan.md §5 · §7.2 · «결정 기록 (2026-11-23 사용자)»
 * 표: `_helpers/nbl-state-history-e3-1b-table.ts` — E3b-1의 leaf 단위·엔진·route anchor가 같은 표를 쓴다.
 */
import { describe, it, expect } from "vitest";
import { E3B_ROWS, E3B_UNCHANGED_ROWS, E3B_B, E3B_N, E3B_SWING } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1b-table";
import { DAY_ROWS, evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { E3_ROWS } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";
import { E2_ROWS, e2RowRaw, type E2Row } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { propertyTaxBasisOptions, resolvePropertyTaxBasis } from "@/lib/tax-engine/non-business-land/property-tax-basis";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";

const rowOf = (id: string) => [...E3B_ROWS, ...E3B_UNCHANGED_ROWS].find((r) => r.id === id)!;
const evalRow = (id: string) => {
  const r = rowOf(id);
  return evalDayRow({ acq: r.acq ?? "2014-01-01", transfer: r.transfer ?? "2024-01-01", biz: r.biz.map(([a, b]) => [a, b] as const), grace: r.graceIntervals });
};

describe("E3b-0 Anchor 1 — §5 매트릭스: 판정 · 일수 (일 단위 정답표)", () => {
  it("표 규모·id 중복 없음 · R1~R19 핵심 행 포함(R12·R13은 «바꾸지 않는 행» 표에 있다)", () => {
    const all = [...E3B_ROWS, ...E3B_UNCHANGED_ROWS];
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    const ids = E3B_ROWS.map((r) => r.id);
    for (const id of ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R14", "R15", "R16", "R17", "R18"]) expect(ids, id).toContain(id);
    expect(E3B_UNCHANGED_ROWS.map((r) => r.id)).toEqual(["R12a", "R12b", "R12c", "R13"]);
  });

  it.each([...E3B_ROWS, ...E3B_UNCHANGED_ROWS].map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, row) => {
    const res = evalRow(row.id);
    expect(res.meets).toBe(!row.expect.nonBusiness);
    expect(res.totalOwnershipDays).toBe(row.expect.total);
    expect(res.effectiveBusinessDays).toBe(row.expect.eff);
    expect(res.ownershipBucket).toBe(row.expect.bucket);
  });

  it("스윙: 전량 사업용 B와 전량 비사업용 N의 차이 = 55,750,000 — 세액이 B인 행은 사업용 · N인 행은 비사업용(부호가 판정 방향과 같다)", () => {
    expect(E3B_N - E3B_B).toBe(E3B_SWING);
    expect(E3B_SWING).toBe(55_750_000);
    for (const r of E3B_ROWS.filter((x) => x.expect.tax === E3B_B)) expect(r.expect.nonBusiness, r.id).toBe(false);
    for (const r of E3B_ROWS.filter((x) => x.expect.tax === E3B_N)) expect(r.expect.nonBusiness, r.id).toBe(true);
  });

  it("면적한도 역전 없음(결정 2026-11-23): 이내(R1) B · 일부 초과(R3)·모름(R2e)·미선택(R2f)은 모두 N — «일부 초과»가 «모름»보다 유리하지 않다", () => {
    expect(rowOf("R1").expect.tax).toBe(E3B_B);
    for (const id of ["R3", "R2e", "R2f"]) expect(rowOf(id).expect.tax, id).toBe(E3B_N);
    expect(rowOf("R3").expect.tax).toBe(rowOf("R2e").expect.tax);
    // 근거 미확인·호환 불가·demolished 선택도 «모름»과 같은 N
    for (const id of ["R2", "R2b", "R2c", "R2d"]) expect(rowOf(id).expect.tax, id).toBe(E3B_N);
  });
});

describe("E3b-0 Anchor 1 — 임계선 쌍: E2·E3-① 표와 일수·판정이 같다 (나대지 구간도 같은 `meetsPeriodCriteria`로 들어간다)", () => {
  const e2 = (id: string) => DAY_ROWS.find((r) => r.id === id)!;
  const e3 = (id: string) => E3_ROWS.find((r) => r.id === id)!;
  const PAIRS = [
    ["R5", "R6", "M8a", "M8b", "T3a", "T3b", "나목 «1년 초과»: 꼬리 730 → 사업용 / 729 → 비사업용"],
    ["R8", "R9", "Z-1460", "Z-1461", "T4a", "T4b", "다목 40%: 비사업 1,460 → 사업용 / 1,461 → 비사업용"],
    ["R15", "R16", "M8c-731", "M8c-730", "T12a", "T12b", "윤일 낀 창: 꼬리 731 → 사업용 / 730 → 비사업용(730/729가 아니다)"],
  ] as const;

  it.each(PAIRS)("%s ↔ %s (= E2 %s ↔ %s = E3-① %s ↔ %s) — %s", (front, back, e2Front, e2Back, e3Front, e3Back) => {
    const a = evalRow(front);
    const b = evalRow(back);
    expect(a.meets).toBe(true);
    expect(b.meets).toBe(false);
    expect(a.effectiveBusinessDays - b.effectiveBusinessDays).toBe(1);
    expect([a.effectiveBusinessDays, a.meets]).toEqual([e2(e2Front).expect.eff, e2(e2Front).expect.meets]);
    expect([b.effectiveBusinessDays, b.meets]).toEqual([e2(e2Back).expect.eff, e2(e2Back).expect.meets]);
    expect([a.effectiveBusinessDays, b.effectiveBusinessDays]).toEqual([e3(e3Front).expect.eff, e3(e3Back).expect.eff]);
  });

  it("R1(공지상태 앞 나대지 · 이내)은 E3-① T9c(신축 앞 종합합산 고정)와 «같은 거래·같은 꼬리»에서 정확히 스윙만큼 다르다 — 표현력의 증거", () => {
    const t9c = E3_ROWS.find((r) => r.id === "T9c")!;
    expect([t9c.expect.nonBusiness, t9c.expect.eff, t9c.expect.tax]).toEqual([true, 214, E3B_N]);
    expect([rowOf("R1").expect.nonBusiness, rowOf("R1").expect.eff, rowOf("R1").expect.tax]).toEqual([false, 3651, E3B_B]);
    expect(t9c.expect.tax! - rowOf("R1").expect.tax!).toBe(E3B_SWING);
  });
});

// ── Anchor 2 — 현행 엔진 실측 ──────────────────────────────────────────

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
function taxOf(input: NonBusinessLandInput, transferPrice = 1_000_000_000) {
  return calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;
}

/** E2 표 행(철거·신축 사건만)을 바탕으로 한 raw — 꼬리 구분·건축물 유무를 덮어쓰고 이력 질문을 끌 수 있다. */
const e2Base = (events: E2Row["events"], extra: Record<string, unknown> = {}) => ({ ...e2RowRaw({ id: "x", scenario: "x", events, expect: { nonBusiness: false, eff: 0, total: 0 } }), ...extra });

describe("E3b-0 Anchor 2 ① — 현행 엔진 실측: 이 표가 왜 필요한가 (이 값들은 E3b-1 이후에도 같다 — 새 칸 없이는 표현할 수 없는 입력의 값)", () => {
  it("R1 현행: 신축 사건을 입력하면 앞 나대지는 종합합산 고정 → 비사업용 214/3,651 N · 이력 칸을 비우면(신축 사실을 숨기면) 꼬리가 전 기간 → B(3,651)", () => {
    const withHistory = judge(fromRaw(e2Base([["building_built", "2023-06-01"]])));
    expect([withHistory.isNonBusinessLand, withHistory.effectiveBusinessDays]).toEqual([true, 214]);
    expect(taxOf(fromRaw(e2Base([["building_built", "2023-06-01"]])))).toBe(E3B_N);
    const noHistory = fromRaw(e2Base([["building_built", "2023-06-01"]], { nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));
    expect([judge(noHistory).isNonBusinessLand, judge(noHistory).effectiveBusinessDays]).toEqual([false, 3651]);
    expect(taxOf(noHistory)).toBe(E3B_B);
  });

  it("R4 현행(이력 없음): 꼬리 = 공지상태 별도합산 → 소유기간 전체에 적용돼 사업용 3,651 B (기대 N — 과소 해소 +55,750,000)", () => {
    const input = fromRaw(e2Base([["building_removed", "2018-01-01"]], { nblOtherPropertyTaxType: "separate", nblOtherPropertyTaxBasis: "vacant_state", nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));
    expect(input.landStateHistory).toBeUndefined();
    expect([judge(input).isNonBusinessLand, judge(input).effectiveBusinessDays, judge(input).totalOwnershipDays]).toEqual([false, 3651, 3651]);
    expect(taxOf(input)).toBe(E3B_B);
  });

  it("R7 현행(이력 없음): 꼬리 = 나대지 종합합산 → 전 기간 비사업용 N (기대 B — 과대 해소 −55,750,000)", () => {
    const input = fromRaw(e2Base([["building_removed", "2018-01-01"]], { nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));
    expect(judge(input).isNonBusinessLand).toBe(true); // 이력 없음 경로의 effectiveBusinessDays는 판정 경로별 의미가 달라 단언하지 않는다
    expect(taxOf(input)).toBe(E3B_N);
  });

  it("R10 현행 근사(철거 Before 별도합산 + 꼬리 공지상태): 2018~2022 종합합산 나대지 4.4년을 사업용으로 오계상 → B 3,651 (기대 N 2,039)", () => {
    const input = fromRaw(e2Base([["building_removed", "2018-01-01", "separate"]], { nblOtherPropertyTaxType: "separate", nblOtherPropertyTaxBasis: "vacant_state" }));
    const j = judge(input);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays]).toEqual([false, 3651]);
    expect(taxOf(input)).toBe(E3B_B);
  });
});

describe("E3b-0 Anchor 2 ② — V-1 fixture: 신축 행에 stray 재산세 구분 Before를 실은 직접 API 데이터의 판정·경고 바이트 (E3b-0 실측 → E3b-1 결과 기록)", () => {
  const stray = (before: string) => fromRaw({ ...e2Base([["building_built", "2023-06-01"]]), nblOtherStateEvents: [{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: before }] });
  const m6 = () => judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "M6")!)));

  it("E3b-0 실측(E3b-1 전): ⑭가 신축 행의 Before를 운반하지 않아(V-6 닫힘) `\"\"`·comprehensive·separate가 모두 같은 입력으로 엔진에 닿았다 — E3b-1 이후: `\"\"`는 키 없음(바이트 동일), 값이 있으면 나대지 선언으로 운반", () => {
    const keys = (before: string) => Object.keys(stray(before).landStateHistory!.events[0]).sort();
    expect(keys("")).toEqual(["date", "kind"]);
    expect(keys("comprehensive")).toEqual(["date", "kind", "propertyTaxTypeBefore"]);
    expect(keys("separate")).toEqual(["date", "kind", "propertyTaxTypeBefore"]);
  });

  it("V-1 결과: 판정·구간은 세 fixture 모두 E2 M6과 같다(근거 없는 별도합산은 종합합산으로 접힌다) · `\"\"`·comprehensive는 경고·echo까지 바이트 동일 · separate(근거 없음)만 새 «근거 미확인» 고지가 추가된다", () => {
    const base = m6();
    expect([base.isNonBusinessLand, base.effectiveBusinessDays]).toEqual([true, 214]);
    for (const before of ["", "comprehensive"]) {
      const j = judge(stray(before));
      expect(j.warnings, before).toEqual(base.warnings);
      expect(JSON.stringify(j.periodEvaluation), before).toBe(JSON.stringify(base.periodEvaluation));
      expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_APPLIED_NOTICE), before).toHaveLength(1);
    }
    const sep = judge(stray("separate"));
    expect([sep.isNonBusinessLand, sep.effectiveBusinessDays, sep.totalOwnershipDays]).toEqual([base.isNonBusinessLand, base.effectiveBusinessDays, base.totalOwnershipDays]);
    expect(sep.warnings).toEqual([...base.warnings, NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE]);
    // 구간 형태는 같고 echo에 접힘 사유만 더해진다
    const iv = sep.periodEvaluation!.stateHistory!.intervals;
    expect(iv.map((i) => [i.hasBuilding, i.propertyTaxType, i.days, i.businessDays])).toEqual(base.periodEvaluation!.stateHistory!.intervals.map((i) => [i.hasBuilding, i.propertyTaxType, i.days, i.businessDays]));
    expect(iv[0]).toMatchObject({ basisOutcome: "unconfirmed", declaredPropertyTaxType: "separate", foldReason: "unselected" });
  });
});

describe("E3b-0 Anchor 2 ③ — 바꾸지 않는 행 R12·R13: 철거 후 한시(⑤)·건축 중은 유예 입력이 이미 덮는다 — 현행 엔진 값(실측)", () => {
  const SPEC_TO_E2 = (r: (typeof E3B_UNCHANGED_ROWS)[number]): E2Row => ({
    id: r.id,
    scenario: r.scenario,
    acq: r.acq,
    transfer: r.transfer,
    events: r.events.map(([k, d, b]) => [k as "building_built" | "building_removed", d, (b || undefined) as never] as const),
    grace: r.grace,
    expect: { nonBusiness: r.expect.nonBusiness, eff: r.expect.eff, total: r.expect.total },
  });

  it.each(E3B_UNCHANGED_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const input = fromRaw(e2RowRaw(SPEC_TO_E2(r)));
    const j = judge(input);
    expect(j.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(j.effectiveBusinessDays).toBe(r.expect.eff);
    expect(j.totalOwnershipDays).toBe(r.expect.total);
    if (r.expect.tax !== undefined) expect(taxOf(input)).toBe(r.expect.tax);
  });

  it("R12: 유예 입력 시 «한시 1년» 모델의 추가효과 0 — 오라클: 한시 1년 구간(2020-01-01~2021-01-01)을 사업용에 더해도 유예 2년과 합집합이라 2,921 그대로", () => {
    const withTemp = evalDayRow({ acq: "2014-01-01", transfer: "2024-01-01", biz: [["2014-01-02", "2021-01-01"]], grace: [["2020-01-01", "2022-01-01"]] });
    expect(withTemp.effectiveBusinessDays).toBe(rowOf("R12b").expect.eff);
  });
});

describe("E3b-0 Anchor 3 — 해석기 재사용 전제: `resolvePropertyTaxBasis({ hasBuilding: false })` — 새 모델이 구간마다 부르는 같은 함수", () => {
  const resolve = (declared: "exempt" | "special_sum" | "separate" | "comprehensive", basis?: Parameters<typeof resolvePropertyTaxBasis>[0]["propertyTaxBasis"], area?: number) =>
    resolvePropertyTaxBasis({ propertyTaxType: declared, hasBuilding: false, propertyTaxBasis: basis, demolishedFloorArea: area });

  it("종합합산은 근거 모델이 개입하지 않는다(not_applicable) — 근거가 실려 있어도", () => {
    expect(resolve("comprehensive")).toEqual({ kind: "not_applicable" });
    expect(resolve("comprehensive", "vacant_state")).toEqual({ kind: "not_applicable" });
  });

  it.each([
    ["exempt", "statutory_exempt", { kind: "accepted", basis: "statutory_exempt" }],
    ["special_sum", "separate_taxation", { kind: "accepted", basis: "separate_taxation" }],
    ["separate", "vacant_state", { kind: "accepted", basis: "vacant_state" }],
  ] as const)("나대지 %s + %s → accepted (선언을 근거 선택으로 받아들인다)", (declared, basis, expected) => {
    expect(resolve(declared, basis)).toEqual(expected);
  });

  it.each([
    ["exempt", undefined, "unselected"],
    ["special_sum", undefined, "unselected"],
    ["separate", undefined, "unselected"],
    ["exempt", "unknown", "unknown"],
    ["separate", "unknown", "unknown"],
    ["exempt", "vacant_state", "incompatible"],
    ["special_sum", "statutory_exempt", "incompatible"],
    ["separate", "separate_taxation", "incompatible"],
    ["separate", "demolished", "demolished_area_missing"],
  ] as const)("나대지 %s + %s → unconfirmed(%s) — 근거 없는 비종합합산은 종합합산으로 접는다", (declared, basis, reason) => {
    expect(resolve(declared, basis)).toEqual({ kind: "unconfirmed", reason });
  });

  it("`demolished`는 바닥면적이 있으면 demolished 해석이 된다 — E3b-1은 면적을 넘기지 않아 이 경로를 쓰지 않는다(한시 지위는 유예 9호 — 결정 Q-3)", () => {
    expect(resolve("separate", "demolished", 100)).toEqual({ kind: "demolished", floorArea: 100 });
  });

  it("나대지 근거 선택지(`propertyTaxBasisOptions(declared, false)`): demolished는 별도합산에만 있다 — E3b-1 `eventBasisOptions`는 여기서 demolished를 뺀 3종 + 모름", () => {
    expect(propertyTaxBasisOptions("exempt", false)).toEqual(["statutory_exempt", "unknown"]);
    expect(propertyTaxBasisOptions("special_sum", false)).toEqual(["separate_taxation", "unknown"]);
    expect(propertyTaxBasisOptions("separate", false)).toEqual(["vacant_state", "demolished", "unknown"]);
    expect(propertyTaxBasisOptions("comprehensive", false)).toEqual([]);
  });
});
