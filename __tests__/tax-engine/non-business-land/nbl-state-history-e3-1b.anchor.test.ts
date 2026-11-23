/**
 * NBL-STATE-HISTORY-E3-1b (E3b-1) — 판정 연결 anchor: 와이어 칸(raw) → ⑭ 매퍼(`buildNblEngineInput`) → 엔진(`judgeNonBusinessLand`) → 세액.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.engine.plan.md §5(R1~R18) · §4.7(바이트 동일) · §4.8(고지 3종) · §7.2 Anchor 2·4·7 · «결정 기록 (2026-11-23)»
 * route 관통은 `__tests__/api/nbl-state-history-e3-1b-route.anchor.test.ts`가 같은 표(`_helpers/nbl-state-history-e3-1b-table.ts`)를 쓴다.
 *
 * mutation 대응(엔진 계획서 §7.3): P-b1(derive가 나대지 선언을 무시) = R1·R4·R7·R10·R11·R14 · P-b2(선언 없는 신축 행을 별도합산으로 오해) = R1d + 하위호환 ·
 * P-b3(근거 확인 없이 선언만 믿음) = R2·R2b·R2c·R2d · P-b4/b5(한도 초과 처리) = R3 · P-b6(`unknown`·`""` 한도를 within으로) = R2e·R2f ·
 * P-b8(⑭ 운반 누락) = R1·R4 · P-b10(건축물 구간 행의 선언 칸을 읽음) = ⑭ stale 가드 · P-b12(새 고지) = 고지 anchor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { E3B_B, E3B_N, E3B_ROWS, E3B_UNCHANGED_ROWS, e3bRowRaw, type E3bRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1b-table";
import { E2_ROWS, e2RowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";
import { E3_ROWS, e3RowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1-table";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
const row = (id: string) => [...E3B_ROWS, ...E3B_UNCHANGED_ROWS].find((r) => r.id === id)!;
const NOTICE = { unconfirmed: NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE, accepted: NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE, area: NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE } as const;

function taxOf(input: NonBusinessLandInput, transferPrice = 1_000_000_000) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice,
      acquisitionPrice: 300_000_000,
      acquisitionDate: input.acquisitionDate,
      transferDate: input.transferDate,
      isOneHousehold: false,
      nonBusinessLandDetails: input,
    }),
    makeMockRates(),
  ).calculatedTax;
}

describe("E3b-1 — 엔진 계획서 §5 R1~R18 (+ 변형): raw → ⑭ 매퍼 → 엔진 (판정 · 일수 · 세액 · 고지) — 오라클과 대조", () => {
  it.each(E3B_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r: E3bRow) => {
    const input = fromRaw(e3bRowRaw(r));
    const j = judge(input);
    expect(j.periodEvaluation?.basis).toBe("state_history");
    expect(j.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(j.effectiveBusinessDays).toBe(r.expect.eff);
    expect(j.totalOwnershipDays).toBe(r.expect.total);
    if (r.expect.tax !== undefined) expect(taxOf(input, r.transferPrice)).toBe(r.expect.tax);
    // 새 고지는 표의 `notices`와 정확히 같은 종류만(없으면 하나도 없다) · 각 1회
    const expected = new Set(r.notices ?? []);
    for (const [kind, text] of Object.entries(NOTICE)) {
      expect(j.warnings.filter((w) => w === text), `${r.id} ${kind} 고지`).toHaveLength(expected.has(kind as keyof typeof NOTICE) ? 1 : 0);
    }
  });

  it("바꾸지 않는 행 R12·R13: 철거 후 한시·건축 중은 유예 입력이 이미 덮는다 — 새 고지·새 echo 필드 없음(E3b-0 현행 값과 같다)", () => {
    for (const r of E3B_UNCHANGED_ROWS) {
      const j = judge(fromRaw(e3bRowRaw(r)));
      expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays], r.id).toEqual([r.expect.nonBusiness, r.expect.eff, r.expect.total]);
      if (r.expect.tax !== undefined) expect(taxOf(fromRaw(e3bRowRaw(r))), r.id).toBe(r.expect.tax);
      for (const text of Object.values(NOTICE)) expect(j.warnings, r.id).not.toContain(text);
      for (const iv of j.periodEvaluation!.stateHistory!.intervals) expect("basisOutcome" in iv, r.id).toBe(false);
    }
  });

  it("echo 불변식(표 전수): 구간 Σ days = 소유일수 · 모든 구간 days > 0 · 사업용 일수 ≤ 일수 · 구간 수 ≤ 사건 수 + 1(클립은 구간을 줄인다)", () => {
    for (const r of E3B_ROWS) {
      const j = judge(fromRaw(e3bRowRaw(r)));
      const iv = j.periodEvaluation!.stateHistory!.intervals;
      expect(iv.reduce((s, i) => s + i.days, 0), r.id).toBe(j.totalOwnershipDays);
      for (const i of iv) {
        expect(i.days, `${r.id} 구간 길이`).toBeGreaterThan(0);
        expect(i.businessDays, r.id).toBeLessThanOrEqual(i.days);
      }
      expect(iv.length, r.id).toBeLessThanOrEqual(r.events.length + 1);
    }
  });

  it("현행(이력 없음) 대비 변동: R4 과소 해소 +55,750,000(현행 B → 기대 N) · R7 과대 해소 −55,750,000(현행 N → 기대 B) — 같은 거래에서 이력 칸만 뺀 입력과 대조", () => {
    const noHistory = (r: E3bRow) => fromRaw({ ...e3bRowRaw(r), nblOtherStateHistoryMode: "", nblOtherStateEvents: [] });
    expect([taxOf(noHistory(row("R4"))), taxOf(fromRaw(e3bRowRaw(row("R4"))))]).toEqual([E3B_B, E3B_N]);
    expect([taxOf(noHistory(row("R7"))), taxOf(fromRaw(e3bRowRaw(row("R7"))))]).toEqual([E3B_N, E3B_B]);
    expect(E3B_N - E3B_B).toBe(55_750_000);
  });

  it("면적한도 역전 없음: 이내 → B · 일부 초과 = 모름 = 미선택 → N (세액까지) — «일부 초과»가 «모름»보다 유리하지 않다(결정 2026-11-23)", () => {
    const tax = (id: string) => taxOf(fromRaw(e3bRowRaw(row(id))));
    expect(tax("R1")).toBe(E3B_B);
    expect([tax("R3"), tax("R2e"), tax("R2f")]).toEqual([E3B_N, E3B_N, E3B_N]);
    expect(tax("R3")).toBeGreaterThanOrEqual(tax("R1"));
    // 판정 echo도 같다 — 세 변형 모두 같은 접힘 사유군(area_*)이고 구간 구분은 종합합산
    for (const [id, reason] of [["R3", "area_exceeded"], ["R2e", "area_unknown"], ["R2f", "area_unknown"]] as const) {
      const first = judge(fromRaw(e3bRowRaw(row(id)))).periodEvaluation!.stateHistory!.intervals[0];
      expect(first, id).toMatchObject({ hasBuilding: false, propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", basis: "vacant_state", declaredPropertyTaxType: "separate", foldReason: reason });
    }
  });
});

describe("E3b-1 echo — 나대지 구간 선언의 근거 해석(`basisOutcome`·`basis`·`declaredPropertyTaxType`·`foldReason`)", () => {
  const first = (id: string) => judge(fromRaw(e3bRowRaw(row(id)))).periodEvaluation!.stateHistory!.intervals[0];

  it("accepted: 구분은 선언 그대로 · 사업용 구간 · 근거·선언 구분이 echo에 실린다 (R1·R1b·R1c)", () => {
    expect(first("R1")).toMatchObject({ hasBuilding: false, propertyTaxType: "separate", basisOutcome: "accepted", basis: "vacant_state", declaredPropertyTaxType: "separate", business: true, days: 3437 });
    expect(first("R1b")).toMatchObject({ propertyTaxType: "special_sum", basisOutcome: "accepted", basis: "separate_taxation", business: true });
    expect(first("R1c")).toMatchObject({ propertyTaxType: "exempt", basisOutcome: "accepted", basis: "statutory_exempt", business: true });
    expect("foldReason" in first("R1")).toBe(false);
  });

  it("unconfirmed: 구분은 종합합산으로 접히고 사유가 실린다 — 미선택 `unselected` · 모름 `unknown` · 호환 불가 `incompatible` · `demolished` `demolished_unsupported`(R2·R2b·R2c·R2d)", () => {
    expect(first("R2b")).toMatchObject({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", declaredPropertyTaxType: "separate", foldReason: "unselected", business: false });
    expect("basis" in first("R2b")).toBe(false);
    expect(first("R2")).toMatchObject({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", basis: "unknown", foldReason: "unknown" });
    expect(first("R2c")).toMatchObject({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", basis: "separate_taxation", foldReason: "incompatible" });
    expect(first("R2d")).toMatchObject({ propertyTaxType: "comprehensive", basisOutcome: "unconfirmed", basis: "demolished", foldReason: "demolished_unsupported" });
  });

  it("선언 없음(R1d 신축 행 `\"\"`) · 구분 변경 행 `comprehensive`: 키 자체가 없다(종전 echo와 같은 모양)", () => {
    const iv = first("R1d");
    expect(iv).toMatchObject({ hasBuilding: false, propertyTaxType: "comprehensive" });
    for (const k of ["basisOutcome", "basis", "declaredPropertyTaxType", "foldReason"]) expect(k in iv, k).toBe(false);
    expect("basisOutcome" in first("R4")).toBe(false);
  });

  it("구분 변경 행 `\"\"` = 모름(R19): 구간 구분 `unknown` + 종전 모름 고지(TAX_CHANGE_UNKNOWN) · 근거 echo 없음", () => {
    const j = judge(fromRaw(e3bRowRaw(row("R19"))));
    const iv = j.periodEvaluation!.stateHistory!.intervals[0];
    expect([iv.hasBuilding, iv.propertyTaxType]).toEqual([false, "unknown"]);
    expect("basisOutcome" in iv).toBe(false);
    expect(j.warnings).toContain(NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE);
  });

  it("R10 echo: 건축물 별도합산(사업용) → 나대지 종합합산 `comprehensive`(근거 해석 없음) → 꼬리 — 구간표가 사건 순서대로", () => {
    const iv = judge(fromRaw(e3bRowRaw(row("R10")))).periodEvaluation!.stateHistory!.intervals;
    expect(iv.map((i) => [i.hasBuilding, i.propertyTaxType, i.business])).toEqual([
      [true, "separate", true],
      [false, "comprehensive", false],
      [false, "separate", true], // 꼬리: core가 공지상태 별도합산(V1-A 근거 수용)으로 사업용 판정
    ]);
    expect(iv.reduce((s, i) => s + i.businessDays, 0)).toBe(2039);
  });
});

describe("E3b-1 고지 — 새 3종은 나대지 선언이 있을 때만 · 기존 고지 문구는 바이트 동일 (P-b12)", () => {
  it("기존 이력(신축·철거·구분 변경 · 나대지 선언 없음)은 새 고지가 하나도 없다 — E2 표 전 행 + E3-① 표 전 행", () => {
    for (const r of E2_ROWS) {
      const w = judge(fromRaw(e2RowRaw(r))).warnings;
      for (const text of Object.values(NOTICE)) expect(w, `E2 ${r.id}`).not.toContain(text);
    }
    for (const r of E3_ROWS.filter((x) => x.id !== "T9o")) {
      const w = judge(fromRaw(e3RowRaw(r))).warnings;
      for (const text of Object.values(NOTICE)) expect(w, `E3-① ${r.id}`).not.toContain(text);
    }
  });

  it("V-1 결과(직접 API stray): E3-① T9o(신축 행에 «별도합산» Before만, 근거 없음)는 판정이 T9c와 같고 «근거 미확인» 고지 1종만 더 붙는다 — UI 산출 데이터(신축 행 `\"\"`)는 영향 없다", () => {
    const o = judge(fromRaw(e3RowRaw(E3_ROWS.find((r) => r.id === "T9o")!)));
    const c = judge(fromRaw(e3RowRaw(E3_ROWS.find((r) => r.id === "T9c")!)));
    expect([o.isNonBusinessLand, o.effectiveBusinessDays]).toEqual([c.isNonBusinessLand, c.effectiveBusinessDays]);
    expect(o.warnings).toEqual([...c.warnings, NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE]);
  });

  it("구분 변경 사건이 있는 나대지 선언 행(R4~R11·R14~R19)은 변형 한정 고지(TAX_CHANGE_APPLIED)가 종전 APPLIED를 **대체** — 신축 행 선언만(R1~R3)은 종전 APPLIED 그대로", () => {
    for (const r of E3B_ROWS) {
      const hasTax = r.events.some(([k]) => k === "tax_type_changed");
      const w = judge(fromRaw(e3bRowRaw(r))).warnings;
      expect(w, r.id).toContain(hasTax ? NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE : NBL_STATE_HISTORY_APPLIED_NOTICE);
      expect(w, r.id).not.toContain(hasTax ? NBL_STATE_HISTORY_APPLIED_NOTICE : NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE);
    }
  });

  it("고지 문구: 새 상수는 «확인 필요» · 유예기간 안내(근거 미확인) · 부분 면적 자동 안분 없음(면적한도) · 호별 한도 미판정(수용)", () => {
    for (const t of Object.values(NOTICE)) expect(t).toContain("확인 필요");
    expect(NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE).toContain("유예기간");
    expect(NBL_STATE_HISTORY_BARE_AREA_LIMIT_NOTICE).toContain("자동으로 안분하지 않으므로");
    expect(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE).toContain("호별 면적한도를 판정하지 않았습니다");
  });

  it("복수 구간·복수 종류: 접힘(근거 미선택) + 수용(분리과세) + 한도(공지상태 일부 초과)가 한 이력에 있으면 3종이 각각 정확히 1회", () => {
    const j = judge(fromRaw({
      ...e3bRowRaw(row("R11")),
      nblOtherStateEvents: [
        { kind: "tax_type_changed", date: "2016-01-01", propertyTaxTypeBefore: "exempt" }, // 근거 미선택 → unconfirmed
        { kind: "tax_type_changed", date: "2018-01-01", propertyTaxTypeBefore: "special_sum", propertyTaxBasisBefore: "separate_taxation" }, // accepted
        { kind: "tax_type_changed", date: "2021-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "exceeded" }, // area
      ],
    }));
    for (const text of Object.values(NOTICE)) expect(j.warnings.filter((w) => w === text)).toHaveLength(1);
  });

  it("철거의 «모름» 고지와 나대지 선언 고지는 서로 다른 사건에 따로 붙는다 — 철거 «모름» + 신축 행 근거 모름이면 두 고지가 각각 1회", () => {
    const j = judge(fromRaw({
      ...e2RowRaw(E2_ROWS.find((r) => r.id === "R3")!),
      nblOtherStateEvents: [
        { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "unknown" },
        { kind: "building_removed", date: "2020-06-01", propertyTaxTypeBefore: "" },
      ],
    }));
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE)).toHaveLength(1);
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_BARE_BASIS_UNCONFIRMED_NOTICE)).toHaveLength(1);
  });

  it("R17 클립: 소유 전 선언 구간은 0일이라 버려지고 고지도 없다(수용 고지가 소유기간 밖 구간 때문에 뜨지 않는다)", () => {
    const j = judge(fromRaw(e3bRowRaw(row("R17"))));
    expect(j.warnings).not.toContain(NBL_STATE_HISTORY_BARE_ACCEPTED_NOTICE);
  });
});

describe("E3b-1 ⑭ 매퍼 — 운반 술어(`eventClosesBareInterval`): 나대지 구간을 닫는 행만 선언 칸을 싣는다 (P-b8 · P-b10 · P-b11)", () => {
  const evs = (raw: Record<string, unknown>) => fromRaw(raw).landStateHistory!.events;
  const base = e3bRowRaw(row("R1"));

  it("신축 행: 값이 있으면 3칸을 싣는다 · `\"\"`는 키가 없다(종전 입력과 바이트 동일)", () => {
    const [e] = evs(base);
    expect([e.propertyTaxTypeBefore, e.propertyTaxBasisBefore, e.areaWithinLimitBefore]).toEqual(["separate", "vacant_state", "within"]);
    const [none] = evs({ ...base, nblOtherStateEvents: [{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "", propertyTaxBasisBefore: "", areaWithinLimitBefore: "" }] });
    expect(Object.keys(none).sort()).toEqual(["date", "kind"]);
  });

  it("철거 행(건축물 구간을 닫는다): 근거·면적한도 칸의 숨은 stale 값은 싣지 않는다 · Before는 `\"\"`(모름)도 싣는다 — 종전과 같다", () => {
    const raw = e2RowRaw(E2_ROWS.find((r) => r.id === "M1")!);
    const [rm] = evs({ ...raw, nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" }] });
    expect(rm.propertyTaxTypeBefore).toBe("separate");
    expect("propertyTaxBasisBefore" in rm).toBe(false);
    expect("areaWithinLimitBefore" in rm).toBe(false);
    const [rmEmpty] = evs({ ...raw, nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" }] });
    expect(rmEmpty.propertyTaxTypeBefore).toBe("");
  });

  it("구분 변경 행: 직전 건축물 상태 replay — 건축물 있음이면 stale 선언 칸을 싣지 않고, 건축물 없음(철거 뒤 · tax-only 토글 off · 신축 앞)이면 싣는다", () => {
    const decl = { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" };
    const carries = (e: { propertyTaxBasisBefore?: unknown; areaWithinLimitBefore?: unknown }) => ["propertyTaxBasisBefore" in e, "areaWithinLimitBefore" in e];
    // tax-only · 토글 on(건축물 있음) → 안 싣는다 / 토글 off → 싣는다 (P-b11: replay 초기 상태 = 입력 토글)
    const taxOnly = { ...e3bRowRaw(row("R4")), nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2022-06-01", ...decl }] };
    expect(carries(evs({ ...taxOnly, nblOtherHasBuilding: true })[0])).toEqual([false, false]);
    expect(carries(evs({ ...taxOnly, nblOtherHasBuilding: false })[0])).toEqual([true, true]);
    // 신축 → 구분 변경(건축물 있음) → 싣지 않는다 · 철거 → 구분 변경(나대지) → 싣는다
    const afterBuilt = evs({ ...e3bRowRaw(row("R1")), nblOtherStateEvents: [{ kind: "building_built", date: "2019-01-01" }, { kind: "tax_type_changed", date: "2021-01-01", ...decl }] });
    expect(carries(afterBuilt[1])).toEqual([false, false]);
    const afterRemoved = evs({ ...e3bRowRaw(row("R10")), nblOtherStateEvents: [{ kind: "building_removed", date: "2018-01-01", propertyTaxTypeBefore: "separate" }, { kind: "tax_type_changed", date: "2021-01-01", ...decl }] });
    expect(carries(afterRemoved[1])).toEqual([true, true]);
  });

  it("종류가 허용값 밖인 행은 건너뛰고 replay도 건너뛴 목록 기준이다 — 불량 행이 뒤 행의 «닫는 구간» 판정을 바꾸지 않는다", () => {
    const decl = { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" };
    const e = evs({ ...e3bRowRaw(row("R4")), nblOtherHasBuilding: false, nblOtherStateEvents: [{ kind: "foo", date: "2021-01-01" }, { kind: "tax_type_changed", date: "2022-06-01", ...decl }] });
    expect(e.map((x) => x.kind)).toEqual(["tax_type_changed"]);
    expect(e[0].propertyTaxBasisBefore).toBe("vacant_state");
  });
});

describe("E3b-1 하위호환 — 선언 칸이 없는 이력은 종전과 바이트 동일 (Anchor 2)", () => {
  it("E2 표(신축·철거 사건만) · E3-① 표(구분 변경) 전 행의 엔진 input 이력에 새 칸이 하나도 없다(`propertyTaxBasisBefore`·`areaWithinLimitBefore`)", () => {
    for (const r of E2_ROWS) for (const e of fromRaw(e2RowRaw(r)).landStateHistory!.events) expect(Object.keys(e).filter((k) => k.endsWith("Before") && k !== "propertyTaxTypeBefore"), `E2 ${r.id}`).toEqual([]);
    for (const r of E3_ROWS) for (const e of fromRaw(e3RowRaw(r)).landStateHistory!.events) expect(Object.keys(e).filter((k) => k.endsWith("Before") && k !== "propertyTaxTypeBefore"), `E3-① ${r.id}`).toEqual([]);
  });

  it("신축 행에 선언 없는 이력의 echo는 종전 모양 — `basisOutcome` 등 새 키가 없다(E2 M6)", () => {
    const j = judge(fromRaw(e2RowRaw(E2_ROWS.find((r) => r.id === "M6")!)));
    for (const iv of j.periodEvaluation!.stateHistory!.intervals) for (const k of ["basisOutcome", "basis", "declaredPropertyTaxType", "foldReason"]) expect(k in iv, k).toBe(false);
  });
});

describe("E3b-1 Anchor 7 — Q-15 (가′) 교차: core 자체 사업기간(DM-01 · 3호)과 나대지 선언 구간의 합집합 — 중복 계상 없음", () => {
  const dm01 = (extra: Record<string, unknown> = {}) => ({
    ...e3bRowRaw(row("R4")),
    transferDate: "2024-06-30",
    nblZoneType: "commercial",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherPropertyTaxBasis: undefined,
    nblRevenueBusinessType: "parking_operation",
    nblRevenueCurrentRevenue: "20000000",
    nblRevenueCurrentLandValue: "100000000",
    nblRevenueCurrentBusinessStartDate: "2022-01-01",
    ...extra,
  });

  it("공지상태 선언 구간 [소유 첫날, 2023-01-01) ∪ DM-01 [2022-01-01, 2024-06-30) = 소유기간 전체 3,832 — 겹치는 2022-01-01~2023-01-01(365일)을 두 번 세지 않는다", () => {
    const j = judge(fromRaw(dm01({ nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2023-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" }] })));
    expect([j.effectiveBusinessDays, j.totalOwnershipDays, j.isNonBusinessLand]).toEqual([3832, 3832, false]);
  });

  it("선언이 접히면(근거 모름) 나대지 구간은 비사업용이지만 DM-01 구간(개시일 이후)은 사업용으로 센다 — 구간 [소유 첫날, 2023-01-01) 3,286일 중 365일", () => {
    const j = judge(fromRaw(dm01({ nblOtherStateEvents: [{ kind: "tax_type_changed", date: "2023-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "unknown" }] })));
    const first = j.periodEvaluation!.stateHistory!.intervals[0];
    expect([first.propertyTaxType, first.basisOutcome, first.days, first.businessDays]).toEqual(["comprehensive", "unconfirmed", 3286, 365]);
  });
});

describe("E3b-1 배선 가드(grep) — 침묵 strip·소실은 TS가 못 잡는다 (P-b8 · P-b9 · P-b13의 엔진·API 쪽)", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("⑫ Zod 사건 행 스키마가 새 칸 2개를 enum으로 선언한다 — 빠지면 중첩 칸이 침묵 strip", () => {
    const schema = src("lib/api/transfer-tax-schema-nbl.ts");
    expect(schema).toMatch(/propertyTaxBasisBefore:\s*z\.enum\(PROPERTY_TAX_BASIS_VALUES\)/);
    expect(schema).toMatch(/areaWithinLimitBefore:\s*z\.enum\(NBL_AREA_WITHIN_LIMIT_VALUES\)/);
  });

  it("⑭ 매퍼가 새 칸을 leaf 단일 술어(`eventClosesBareInterval`)로만 운반한다 — 종류 리터럴 분기 금지", () => {
    const mapper = src("lib/tax-engine/non-business-land/form-mapper-helpers.ts");
    expect(mapper).toMatch(/\beventClosesBareInterval\(/);
    expect(mapper).toMatch(/propertyTaxBasisBefore/);
    expect(mapper).toMatch(/areaWithinLimitBefore/);
    expect(mapper).not.toMatch(/kind === "building_built"/);
  });

  it("차단 규칙이 되살아나지 않는다 — leaf에 «건축물 없는 구간 구분 변경» 문구 호출이 없다", () => {
    expect(src("lib/tax-engine/non-business-land/other-land-state-history.ts")).not.toMatch(/TaxChangeWithoutBuilding/);
    expect(src("lib/tax-engine/non-business-land/nbl-validation-messages.ts")).not.toMatch(/stateEventTaxChangeWithoutBuildingMessage/);
  });
});
