/**
 * NBL-STATE-HISTORY-E3-1b — 클라이언트 ④ 와이어 · ⑤ 미리보기 anchor (나대지 구간 선언 칸 2개 + 신축 행 직전 구분).
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.ui.plan.md §6 · §10
 *
 * 한 표(`E3B_ROWS` R1~R19 + 변형)로 «④ 전송 = ⑭ 매퍼 입력 = ⑤ 미리보기»를 대조한다 — 화면 입력(AssetForm) → `buildNonBusinessLandRaw` → ⑭ → 엔진 판정이
 * 표의 raw를 직접 넣은 판정과 같아야 한다(화면에 있는데 전송에서 사라지거나, 전송은 되는데 미리보기와 다른 칸 금지). 개별 mutation 대응은 각 `it`에 적는다.
 */
import { describe, it, expect } from "vitest";
import { buildStateHistoryPreview } from "@/lib/calc/nbl-other-state-history-preview";
import { stateEventWireRow, stateHistoryWireFields } from "@/lib/calc/nbl-other-state-history-scope";
import { buildNblEngineInput, buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { E3B_ROWS, e3bRowRaw, type E3bRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-1b-table";

type Ev = AssetForm["nblOtherStateEvents"][number];

const baseAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionArea: "1000",
    acquisitionDate: "2014-01-01",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherStateHistoryMode: "changed",
    nblOtherHasBuilding: true,
    ...over,
  }) as AssetForm;

/** 표의 행 → 화면 입력(AssetForm). 사건 칸은 화면이 쓰는 모양(`propertyTaxTypeBefore`는 항상 문자열 · 근거·한도는 값이 있을 때만). */
function assetOfRow(r: E3bRow): AssetForm {
  const raw = e3bRowRaw(r) as Record<string, unknown>;
  const events = (raw.nblOtherStateEvents as Array<Record<string, string>>).map((e): Ev => ({ propertyTaxTypeBefore: "", ...e }) as Ev);
  return baseAsset({
    acquisitionDate: raw.acquisitionDate as string,
    nblOtherPropertyTaxType: raw.nblOtherPropertyTaxType as AssetForm["nblOtherPropertyTaxType"],
    nblOtherPropertyTaxBasis: ((raw.nblOtherPropertyTaxBasis as string | undefined) ?? "") as AssetForm["nblOtherPropertyTaxBasis"],
    nblOtherHasBuilding: raw.nblOtherHasBuilding as boolean,
    nblOtherBuildingFloorArea: raw.nblOtherBuildingFloorArea as string,
    nblOtherStateEvents: events,
  });
}

const judge = (raw: Record<string, unknown>) => judgeNonBusinessLand(buildNblEngineInput(raw as never)!, DEFAULT_NON_BUSINESS_LAND_RULES);
const transferOf = (r: E3bRow) => r.transfer ?? "2024-01-01";
const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

describe("④ 전송 = 표의 raw — 화면 입력 → `buildNonBusinessLandRaw` → ⑭ → 엔진 판정이 raw 직접 입력과 같다 (R1~R19 전 행 · 변형 포함)", () => {
  it.each(E3B_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r: E3bRow) => {
    const direct = judge(e3bRowRaw(r));
    const viaWire = judge(buildNonBusinessLandRaw(assetOfRow(r), transferOf(r))!);
    expect(viaWire.isNonBusinessLand, "판정").toBe(direct.isNonBusinessLand);
    expect(viaWire.effectiveBusinessDays).toBe(direct.effectiveBusinessDays);
    expect(viaWire.totalOwnershipDays).toBe(direct.totalOwnershipDays);
    expect(viaWire.warnings, "고지(근거 미확인 · 수용 · 면적한도 포함)").toEqual(direct.warnings);
    // 구간 echo — 근거 해석(basisOutcome)·접힘 사유까지. 선택지에 없는 근거(R2c 구분과 맞지 않는 근거 · R2d 직접 API 전용 `demolished`)는 화면에서도 «미선택»으로 보이고 ④가 보내지 않는다 —
    // 접힘·고지·세액은 같고 echo의 근거 값·사유(incompatible/demolished_unsupported → unselected)만 다르다.
    const stale = r.id === "R2c" || r.id === "R2d";
    const strip = (j: ReturnType<typeof judge>) => j.periodEvaluation!.stateHistory!.intervals.map((iv) => ({ ...iv, ...(stale ? { basis: undefined, foldReason: undefined } : {}) }));
    expect(strip(viaWire)).toEqual(strip(direct));
  });
});

describe("⑤ 미리보기 = 엔진 구간 — 같은 표 전 행에서 구간 · 구분 · 근거 해석이 판정 구간과 같다", () => {
  it.each(E3B_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r: E3bRow) => {
    const preview = buildStateHistoryPreview(assetOfRow(r), transferOf(r));
    expect(preview, "미리보기가 그려져야 한다").not.toBeNull();
    const ivs = judge(buildNonBusinessLandRaw(assetOfRow(r), transferOf(r))!).periodEvaluation!.stateHistory!.intervals;
    expect(preview!.rows.map((p) => [p.start, p.days, p.propertyTaxType, p.basisOutcome, p.basis, p.foldReason])).toEqual(
      ivs.map((iv) => [iso(iv.start), iv.days, iv.propertyTaxType, iv.basisOutcome, iv.basis, iv.foldReason]),
    );
    expect(preview!.totalDays).toBe(r.expect.total);
  });
});

describe("④ stateEventWireRow — 나대지 구간을 닫는 행에서만 선언 칸을 싣는다 · 값이 있을 때만 키를 만든다", () => {
  const B = (extra: Partial<Ev>): Ev => ({ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "", ...extra });
  const wire = (events: Ev[], i: number, tailHasBuilding = true) => stateEventWireRow(events, i, tailHasBuilding);

  it("신축 행 — 선언이 없으면 종전 와이어와 byte-identical(키 3개) · 비워둔 근거·한도(\"\")·미설정(undefined)은 키를 만들지 않는다", () => {
    const old = JSON.stringify({ kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "" });
    expect(JSON.stringify(wire([B({})], 0))).toBe(old);
    expect(JSON.stringify(wire([B({ propertyTaxBasisBefore: "", areaWithinLimitBefore: "" })], 0))).toBe(old);
    expect(JSON.stringify(wire([B({ propertyTaxBasisBefore: undefined, areaWithinLimitBefore: undefined })], 0))).toBe(old);
  });

  it("신축 행 선언 — 별도합산 + 공지상태 + 한도 이내(R1)는 3칸 모두 · 분리과세 + 분리과세대상(R1b)은 한도 없음 · 비과세 + 근거 모름도 «모름»을 싣는다", () => {
    expect(wire([B({ propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" })], 0)).toEqual({
      kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within",
    });
    expect(wire([B({ propertyTaxTypeBefore: "special_sum", propertyTaxBasisBefore: "separate_taxation", areaWithinLimitBefore: "exceeded" })], 0)).toEqual({
      kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "special_sum", propertyTaxBasisBefore: "separate_taxation",
    });
    expect(wire([B({ propertyTaxTypeBefore: "exempt", propertyTaxBasisBefore: "unknown" })], 0).propertyTaxBasisBefore).toBe("unknown");
  });

  it("선택지에 없는 근거는 보내지 않는다 — 구분을 바꿔 맞지 않게 된 값 · 종합합산 위의 stale 근거 · 직접 입력된 `demolished`(나대지 구간에서 받지 않는다)", () => {
    expect(wire([B({ propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "separate_taxation" })], 0)).not.toHaveProperty("propertyTaxBasisBefore");
    expect(wire([B({ propertyTaxTypeBefore: "comprehensive", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" })], 0)).toEqual({
      kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "comprehensive",
    });
    expect(wire([B({ propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished" })], 0)).not.toHaveProperty("propertyTaxBasisBefore");
  });

  it("면적한도는 근거가 공지상태일 때만 — 근거를 바꾼 뒤 남은 stale 한도는 보내지 않는다(R1e)", () => {
    const w = wire([B({ propertyTaxTypeBefore: "special_sum", propertyTaxBasisBefore: "separate_taxation", areaWithinLimitBefore: "exceeded" })], 0);
    expect(w).not.toHaveProperty("areaWithinLimitBefore");
    expect(wire([B({ propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "unknown", areaWithinLimitBefore: "within" })], 0)).not.toHaveProperty("areaWithinLimitBefore");
  });

  it("건축물 구간을 닫는 행(철거 · 건축물 위 구분 변경)의 stale 근거·한도는 보내지 않는다 — 직전 구분은 종전대로 보존", () => {
    const stale = { propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" } as const;
    const rm: Ev = { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate", ...stale };
    expect(wire([rm], 0)).toEqual({ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" });
    const t: Ev = { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate", ...stale };
    expect(wire([t], 0, true), "tax-only + 건축물 있음(토글 on)").toEqual({ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" });
  });

  it("tax-only 구분 변경 행은 토글에 따라 갈래가 바뀐다 — 토글 off(나대지)는 선언 칸을 싣고, on이면 싣지 않으며 값은 store에 남아 되돌리면 복원된다(P-b13)", () => {
    const t: Ev = { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" };
    expect(wire([t], 0, false)).toEqual(t);
    expect(wire([t], 0, true)).not.toHaveProperty("propertyTaxBasisBefore");
    expect(wire([t], 0, false)).toEqual(t);
  });

  it("행 순서 replay — 철거 뒤 구분 변경 = 나대지 · 신축 뒤 구분 변경 = 건축물 위 · 철거→신축→구분 변경 = 건축물 위", () => {
    const decl = { propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" } as const;
    const t = (date: string): Ev => ({ kind: "tax_type_changed", date, ...decl });
    const rm = (date: string): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: "separate" });
    const bl = (date: string): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "" });
    expect(wire([bl("2016-01-01"), rm("2019-01-01"), t("2022-06-01")], 2)).toHaveProperty("propertyTaxBasisBefore", "vacant_state");
    expect(wire([bl("2016-01-01"), t("2018-01-01"), rm("2021-01-01")], 1)).not.toHaveProperty("propertyTaxBasisBefore");
    expect(wire([rm("2018-01-01"), bl("2020-01-01"), t("2022-06-01")], 2)).not.toHaveProperty("propertyTaxBasisBefore");
  });

  it("stateHistoryWireFields: changed 행 전체가 이 규칙을 지난다 — 모드 unchanged·\"\"이면 사건은 비운다(종전과 같다)", () => {
    const a = baseAsset({ nblOtherStateEvents: [B({ propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" })] });
    expect(stateHistoryWireFields(a).nblOtherStateEvents[0]).toMatchObject({ propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" });
    expect(stateHistoryWireFields({ ...a, nblOtherStateHistoryMode: "unchanged" }).nblOtherStateEvents).toEqual([]);
  });
});
