/**
 * NBL-STATE-HISTORY-E3-③ A (E3d-1) — 엔진 anchor: raw 와이어 칸(`nblOtherStateEvents`·`houseFootprintBefore`) → ⑭ 매퍼 → `judgeNonBusinessLand` → 세액.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §4 · §6.1 · §7.2 Anchor 1·2·3·4·12 · §7.3 Y-1~Y-14
 * 표: `_helpers/nbl-state-history-e3-3-table.ts` — E3d-0 Anchor 1(오라클)과 같은 표를 «엔진이 낸 값»으로 대조한다. 측정값이 표와 다르면 표를 맞추지 말고 원인을 먼저 본다.
 */
import { describe, it, expect } from "vitest";
import { E3D_A_ROWS, E3D_SWING_2014, e3dARowRaw, e3dTradeTax, type E3dARow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-3-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import {
  NBL_STATE_AT_TRANSFER_APPLIED_NOTICE,
  NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
  NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE,
  NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE,
  NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE,
  NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_UNKNOWN_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const row = (id: string) => E3D_A_ROWS.find((r) => r.id === id)!;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
const taxResult = (input: NonBusinessLandInput) =>
  calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  );
const taxOf = (input: NonBusinessLandInput) => taxResult(input).calculatedTax;

const NOTICE_OF = {
  unconfirmed: NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE,
  exceeded: NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE,
  houseBefore: NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE,
  daywise: NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE,
} as const;

describe("E3d-1 §6.1 A 행 — raw → ⑭ → 엔진 → 세액 (오라클 표와 같은 값)", () => {
  it.each(E3D_A_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r: E3dARow) => {
    const input = fromRaw(e3dARowRaw(r));
    expect(input.landStateHistory?.mode, "⑭가 이력을 싣는다 — 주택부수토지 소비표").toBe("changed");
    const j = judge(input);
    expect(j.periodEvaluation?.basis).toBe("state_history");
    expect(j.isNonBusinessLand).toBe(r.expect.nonBusiness);
    expect(j.effectiveBusinessDays).toBe(r.expect.eff);
    expect(j.totalOwnershipDays).toBe(r.expect.total);
    expect(j.criteria).toBeDefined();
    const tax = e3dTradeTax(r, r.expect.nonBusiness);
    if (tax !== undefined) expect(taxOf(input), `${r.id} 세액`).toBe(tax);
    // 고지: 이력 없음 고지는 한정 고지로 **대체**된다 · 일 단위 합산(Q-2) · R-6 안내는 항상
    expect(j.warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE)).toHaveLength(1);
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE)).toHaveLength(1);
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE)).toHaveLength(1);
    const expected = new Set<string>(r.notices ?? []);
    if (r.events.some(([k]) => k === "building_removed")) expected.add("houseBefore");
    for (const [kind, text] of Object.entries(NOTICE_OF)) {
      if (kind === "daywise") continue;
      expect(j.warnings.filter((w) => w === text), `${r.id} ${kind}`).toHaveLength(expected.has(kind) ? 1 : 0);
    }
    // 비사업용 전환 시 T-1: 안분 echo가 없고(전량) 비율 1 · 사업용이면 비율 0
    if (r.expect.nonBusiness) {
      expect(j.areaProportioning, "T-1").toBeUndefined();
      expect(j.surcharge.nonBusinessAreaRatio, "T-1").toBe(1);
    } else {
      expect(j.surcharge.nonBusinessAreaRatio).toBe(0);
    }
  });

  it("세액 변동: M15 B 198,210,000 → N 253,960,000(+55,750,000 · 과소 해소) · 경계 M8a(0) / M8b(+)", () => {
    expect(taxOf(fromRaw(e3dARowRaw(row("M15"))))).toBe(253_960_000);
    expect(taxOf(fromRaw(e3dARowRaw(row("M15"), { history: false })))).toBe(198_210_000);
    expect(taxOf(fromRaw(e3dARowRaw(row("M15")))) - taxOf(fromRaw(e3dARowRaw(row("M15"), { history: false })))).toBe(E3D_SWING_2014);
    expect(taxOf(fromRaw(e3dARowRaw(row("M8a"))))).toBe(taxOf(fromRaw(e3dARowRaw(row("M8a"), { history: false }))));
    expect(taxOf(fromRaw(e3dARowRaw(row("M8b"))))).toBeGreaterThan(taxOf(fromRaw(e3dARowRaw(row("M8b"), { history: false }))));
  });
});

describe("E3d-1 Anchor 4 — T-1: 이내 core를 비사업용으로 뒤집을 때 `areaProportioning = undefined` (판정은 비사업용인데 세액은 사업용이 되는 침묵 과소 방지)", () => {
  it("M15: 판정 비사업용 · `areaProportioning` 없음 · `nonBusinessAreaRatio === 1` · 세액 N 253,960,000(사업용 세액 198,210,000이 아니다)", () => {
    const j = judge(fromRaw(e3dARowRaw(row("M15"))));
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.areaProportioning).toBeUndefined();
    expect(j.surcharge.nonBusinessAreaRatio).toBe(1);
    expect(taxOf(fromRaw(e3dARowRaw(row("M15"))))).toBe(253_960_000);
    expect(taxResult(fromRaw(e3dARowRaw(row("M15")))).calculatedTax).not.toBe(198_210_000);
  });

  it("사업용으로 남는 행은 core의 안분 echo(비율 0)를 유지한다(H3)", () => {
    const j = judge(fromRaw(e3dARowRaw(row("H3"))));
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.areaProportioning?.nonBusinessRatio).toBe(0);
  });
});

describe("E3d-1 Q-3a (나) 보존 · Anchor 3 — 양도일 현재 배율 초과 + 이력 `changed`: 판정·세액·echo는 현행 그대로, `PARTIAL_AREA` 고지만 추가 (S1·S2·S3)", () => {
  const rawExcess = (extra: Record<string, unknown> = {}) => ({ ...e3dARowRaw(row("M15")), acquisitionArea: "1000", ...extra });
  const withoutPartial = (j: ReturnType<typeof judge>) => ({ ...j, warnings: j.warnings.filter((w) => w !== NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE) });

  it("S1: 초과 + 신축 앞 나대지 — 비율 0.5 · 세액 199,720,000 · 이력 미반영(`not_judged`) + PARTIAL 고지 1줄", () => {
    const withHistory = judge(fromRaw(rawExcess()));
    const without = judge(fromRaw({ ...rawExcess(), nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));
    expect(withHistory.warnings.filter((w) => w === NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE)).toHaveLength(1);
    expect(without.warnings).not.toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    expect(withoutPartial(withHistory)).toEqual(without);
    expect(withHistory.periodEvaluation?.basis).toBe("not_judged");
    expect(withHistory.areaProportioning?.nonBusinessRatio).toBe(0.5);
    expect(taxOf(fromRaw(rawExcess()))).toBe(199_720_000);
  });

  it("S2: 초과 + 전 기간 유예(D1) — 사업용 유지, 이력 미반영 + PARTIAL 고지", () => {
    const raw = rawExcess({ nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2014-01-02", endDate: "2024-01-01" }] });
    const withHistory = judge(fromRaw(raw));
    const without = judge(fromRaw({ ...raw, nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));
    expect(withHistory.isNonBusinessLand).toBe(false);
    expect(withHistory.warnings).toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    expect(withoutPartial(withHistory)).toEqual(without);
    expect(withHistory.periodEvaluation?.basis).toBe("state_at_transfer");
  });

  it("S3: 정착면적 0 + 이력 — 전량 비사업용 조기 반환(이력 미사용 · 고지 0건)", () => {
    const raw = { ...e3dARowRaw(row("M15")), nblHousingFootprint: "0" };
    const withHistory = judge(fromRaw(raw));
    const without = judge(fromRaw({ ...raw, nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));
    expect(withHistory.isNonBusinessLand).toBe(true);
    expect(withHistory).toEqual(without);
    expect(taxOf(fromRaw(raw))).toBe(253_960_000);
  });

  it("초과 + `unknown`/`unchanged`/`\"\"`: 고지도 없다(이내 분기만 `unknown` 한 줄 — E0 compat G19 보존)", () => {
    for (const mode of ["unknown", "unchanged", ""]) {
      const j = judge(fromRaw(rawExcess({ nblOtherStateHistoryMode: mode, nblOtherStateEvents: [] })));
      expect(j.warnings, mode).not.toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
      expect(j.warnings, mode).not.toContain(NBL_STATE_HISTORY_UNKNOWN_NOTICE);
    }
  });
});

describe("E3d-1 모드 — `\"\"`·`unchanged`·미전송은 영구히 현행(바이트 동일) · `unknown`은 이내 분기에서 고지 한 줄만 (세액·판정·echo 불변)", () => {
  const base = e3dARowRaw(row("M15"));
  const mode = (m: string) => judge(fromRaw({ ...base, nblOtherStateHistoryMode: m, nblOtherStateEvents: [] }));
  const none = judge(fromRaw({ ...base, nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));

  it('`""`·`unchanged` = 이력 칸이 없는 입력과 판정 결과 객체 전체가 같다', () => {
    const nothing = judge(fromRaw(e3dARowRaw(row("M15"), { history: false })));
    expect(mode("")).toEqual(nothing);
    expect(mode("unchanged")).toEqual(nothing);
    expect(none).toEqual(nothing);
    expect(mode("").periodEvaluation?.basis).toBe("not_judged");
    expect(mode("").warnings).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
  });

  it("`unknown`: 고지 1줄만 더한다 — 세액 198,210,000 불변", () => {
    const u = mode("unknown");
    expect(u.warnings.filter((w) => w === NBL_STATE_HISTORY_UNKNOWN_NOTICE)).toHaveLength(1);
    expect({ ...u, warnings: u.warnings.filter((w) => w !== NBL_STATE_HISTORY_UNKNOWN_NOTICE) }).toEqual(none);
    expect(u.isNonBusinessLand).toBe(false);
    expect(u.warnings).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    expect(taxOf(fromRaw({ ...base, nblOtherStateHistoryMode: "unknown", nblOtherStateEvents: [] }))).toBe(198_210_000);
  });
});

describe("E3d-1 §6.1 구간 echo — 주택 구간 종류·배율 판정 근거(허용 면적 vs 토지 면적)가 결과 구간표에 실린다", () => {
  const echoOf = (id: string) => judge(fromRaw(e3dARowRaw(row(id)))).periodEvaluation!.stateHistory!.intervals;

  it("H3c: 구옥 구간(주택 · within · 정착 100 × 5배 = 허용 500 vs 토지 500) · 나대지 구간(종합합산 · 비사업) · 꼬리(주택)", () => {
    const iv = echoOf("H3c");
    expect(iv).toHaveLength(3);
    expect(iv[0]).toMatchObject({ hasBuilding: true, buildingKind: "house", houseOutcome: "within", propertyTaxType: "unknown", business: true });
    expect(iv[0].houseCheck).toEqual({ footprint: 100, multiplier: 5, multiplierDetail: "수도권 밖 도시 5배", allowedArea: 500, landArea: 500, excessArea: 0 });
    expect(iv[1]).toMatchObject({ hasBuilding: false, propertyTaxType: "comprehensive", business: false });
    expect(iv[1].buildingKind).toBeUndefined();
    expect(iv[2]).toMatchObject({ hasBuilding: true, buildingKind: "house", business: true });
    expect(iv[2].houseOutcome).toBeUndefined();
    expect(iv.reduce((n, v) => n + v.days, 0)).toBe(3651);
  });

  it("H3f: 정착 50㎡ → 허용 250 < 토지 500 → `exceeded`(초과 250㎡ · 접힘 — 사업 일수 0) · `exceeded`와 `unconfirmed`(H3e)는 같은 수", () => {
    const f = echoOf("H3f")[0];
    expect(f).toMatchObject({ houseOutcome: "exceeded", business: false, businessDays: 0 });
    expect(f.houseCheck).toMatchObject({ footprint: 50, allowedArea: 250, landArea: 500, excessArea: 250 });
    const e = echoOf("H3e")[0];
    expect(e).toMatchObject({ houseOutcome: "unconfirmed", business: false, businessDays: 0 });
    expect(e.houseCheck).toBeUndefined();
    expect(judge(fromRaw(e3dARowRaw(row("H3e")))).effectiveBusinessDays).toBe(judge(fromRaw(e3dARowRaw(row("H3f")))).effectiveBusinessDays);
    expect(taxOf(fromRaw(e3dARowRaw(row("H3e"))))).toBe(taxOf(fromRaw(e3dARowRaw(row("H3f")))));
  });

  it("신축 앞 나대지 구간 선언(Q-3 (가) — E3-1b 재사용): 신축 행에 별도합산 + 공지상태 근거 + 면적한도 이내면 그 구간이 사업용 → M15가 사업용으로 돌아온다", () => {
    const raw = e3dARowRaw(row("M15"));
    const withDeclaration = {
      ...raw,
      nblOtherStateEvents: [{ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" }],
    };
    const j = judge(fromRaw(withDeclaration));
    expect(j.isNonBusinessLand).toBe(false);
    expect(j.periodEvaluation?.stateHistory?.intervals[0]).toMatchObject({ hasBuilding: false, propertyTaxType: "separate", basisOutcome: "accepted", business: true });
    expect(taxOf(fromRaw(withDeclaration))).toBe(198_210_000);
  });
});

describe("E3d-1 Q-8 (가) · Q-5 (나) · 고지 — 초과 구간 뒤 9호 유예는 합집합 + `EXCEEDED_GRACE` 고지", () => {
  it("H3f + 9호 유예(철거일 앵커): 유예 그대로 합집합 + EXCEEDED · EXCEEDED_GRACE 고지(면적별 안분 없음)", () => {
    const r: E3dARow = { ...row("H3f"), id: "H3f-g", grace: [{ reasonCode: "demolition", anchorDate: "2016-01-01" }] };
    const j = judge(fromRaw(e3dARowRaw(r)));
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE)).toHaveLength(1);
    expect(j.warnings.filter((w) => w === NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE)).toHaveLength(1);
    // 유예 731일이 사업용 구간(꼬리 365)에 합집합 — 하나도 이중 계상되지 않는다: 365 + 731 = 1,096
    expect(j.effectiveBusinessDays).toBe(1096);
    expect(j.gracePeriodDays).toBe(731);
    // 초과가 없으면(H3d) 이 고지는 없다
    expect(judge(fromRaw(e3dARowRaw(row("H3d")))).warnings).not.toContain(NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE);
  });
});

describe("E3d-1 D-11 — 과거 주택 구간의 배율은 **양도일 시행 법령**으로 판정한다 (구간 당시 법령이 아니다)", () => {
  /** 수도권 일반주거 · 토지 1,000㎡ · 현재 정착 400(×3 = 1,200 이내) · 철거 전 정착 200: 양도 2021-12-31 → 5배 1,000 이내 / 2022-01-01 → 3배 600 초과(400㎡). */
  const make = (transfer: string) =>
    fromRaw({
      ...e3dARowRaw(row("H3c")),
      acquisitionArea: "1000",
      nblHousingFootprint: "400",
      nblIsMetropolitanArea: "yes",
      transferDate: transfer,
      nblOtherStateEvents: [
        { kind: "building_removed", date: "2016-01-01", houseFootprintBefore: "200" },
        { kind: "building_built", date: "2019-01-01" },
      ],
    });

  it("양도 2021-12-31(종전 5배): within · 양도 2022-01-01(현행 3배): exceeded(허용 600 · 초과 400㎡)", () => {
    const before = judge(make("2021-12-31")).periodEvaluation!.stateHistory!.intervals[0];
    const after = judge(make("2022-01-01")).periodEvaluation!.stateHistory!.intervals[0];
    expect(before).toMatchObject({ houseOutcome: "within" });
    expect(before.houseCheck).toMatchObject({ multiplier: 5, allowedArea: 1000, excessArea: 0 });
    expect(after).toMatchObject({ houseOutcome: "exceeded" });
    expect(after.houseCheck).toMatchObject({ multiplier: 3, allowedArea: 600, excessArea: 400 });
  });
});

describe("E3d-1 정착면적 > 토지 면적(Y-31) · 비수치(T-8) — 엔진은 접는다(400 없음), «이내»로 읽지 않는다", () => {
  const withFootprint = (fp: string) => fromRaw({ ...e3dARowRaw(row("H3c")), nblOtherStateEvents: [{ kind: "building_removed", date: "2016-01-01", houseFootprintBefore: fp }, { kind: "building_built", date: "2023-01-01" }] });

  it.each([
    ["빈칸", ""],
    ["0", "0"],
    ["-5", "-5"],
    ["abc", "abc"],
    ["정착 600 > 토지 500", "600"],
  ])("%s → unconfirmed(접힘) — H3c의 within과 같은 구간이 사업용이 되지 않는다", (_n, fp) => {
    const j = judge(withFootprint(fp));
    expect(j.periodEvaluation!.stateHistory!.intervals[0].houseOutcome).toBe("unconfirmed");
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.warnings).toContain(NBL_STATE_HISTORY_HOUSE_WITHIN_UNCONFIRMED_NOTICE);
  });

  it("쉼표·소수 입력: `1,00` 같은 쉼표는 제거 후 읽는다(100) · 99.99는 within(허용 499.95 < 500 → exceeded 0.05)", () => {
    expect(judge(withFootprint("100.00")).periodEvaluation!.stateHistory!.intervals[0].houseOutcome).toBe("within");
    const f = judge(withFootprint("99.99")).periodEvaluation!.stateHistory!.intervals[0];
    expect(f.houseOutcome).toBe("exceeded");
    expect(f.houseCheck).toMatchObject({ allowedArea: 499.95, excessArea: 0.05 });
  });
});

describe("E3d-1 ⑭ 매퍼 — T-4(`tailHasBuilding = true`) · Y-16(주택 구간 철거 행은 재산세 구분을 싣지 않는다) · 정착면적 운반", () => {
  it("T-4: 철거를 먼저 입력(첫 건축물 사건 = 철거)해도 초기 주택 구간이 맞다 — 토글(`nblOtherHasBuilding`)이 없어도 `hasBuilding=true`로 읽는다", () => {
    const input = fromRaw(e3dARowRaw(row("H3c")));
    expect(input.landStateHistory?.events.map((e) => e.kind)).toEqual(["building_removed", "building_built"]);
    const iv = judge(input).periodEvaluation!.stateHistory!.intervals;
    expect(iv.map((v) => [v.hasBuilding, v.buildingKind ?? "none"])).toEqual([[true, "house"], [false, "none"], [true, "house"]]);
  });

  it("Y-16: 철거 행에 숨은 stale `propertyTaxTypeBefore`(별도합산)가 와이어에 남아도 엔진 입력에 싣지 않는다 — 위장 값이 새지 않는다(정착면적 빈칸이면 H3e와 같은 N)", () => {
    const raw = {
      ...e3dARowRaw(row("H3e")),
      nblOtherStateEvents: [{ kind: "building_removed", date: "2016-01-01", propertyTaxTypeBefore: "separate", houseFootprintBefore: "" }, { kind: "building_built", date: "2023-01-01" }],
    };
    const input = fromRaw(raw);
    expect(input.landStateHistory?.events[0]).not.toHaveProperty("propertyTaxTypeBefore");
    expect(input.landStateHistory?.events[0]).not.toHaveProperty("houseFootprintBefore");
    expect(judge(input).isNonBusinessLand).toBe(true);
    expect(taxOf(input)).toBe(253_960_000);
  });

  it("정착면적은 철거 행에서만 숫자로 싣는다(신축 행의 `houseFootprintBefore`는 무시)", () => {
    const raw = { ...e3dARowRaw(row("H3c")), nblOtherStateEvents: [{ kind: "building_removed", date: "2016-01-01", houseFootprintBefore: "100" }, { kind: "building_built", date: "2023-01-01", houseFootprintBefore: "999" }] };
    const events = fromRaw(raw).landStateHistory!.events;
    expect(events[0].houseFootprintBefore).toBe(100);
    expect(events[1]).not.toHaveProperty("houseFootprintBefore");
  });

  it("별장(`villa_land`)은 이력을 싣지 않는다(T-2) — 별장 REDIRECT(주택 재분류)에 이력이 도달하지 않는다", () => {
    const raw = { ...e3dARowRaw(row("M15")), nblLandType: "villa_land" };
    const input = fromRaw(raw);
    expect(input.landStateHistory).toBeUndefined();
  });
});
