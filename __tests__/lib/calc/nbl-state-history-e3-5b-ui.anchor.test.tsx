// @vitest-environment jsdom
/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-1b U-2 — 꼬리 근거 «철거ㆍ멸실» 철거ㆍ멸실일 칸 + 종전 바닥면적 연혁 게이트의 UI 14지점 anchor.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.ui.plan.md §4.2 · §6.2 · §7.1(T1~T9 · T9는 K-28 구현 정정으로 «첫 카드 상속») · 엔진 K-28.
 *
 *  A  ⑧↔⑫ parity 격자 — **실제 ⑧**(`validateNblOtherLand`, AssetForm)과 **실제 ⑫′**(`refineNonBusinessLandRaw`, ④가 만든 raw)을 같은 입력에 돌린다.
 *     (a) ⑫′가 400이면 ⑧도 차단 (b) ⑧이 이 근거로 막으면 ⑫′도 같은 칸·같은 문구 (c) ⑧이 가리키는 칸은 ⑤가 그리는 칸 (d) ④ 와이어는 칸이 불요하면 비어 있다(stale 비전송).
 *  B  ⑤ 렌더 — 칸 노출 격자(철거 행 유무 · 이력 모드 stale · 양도일 경계 2024-05-31/06-01 · 2016-05-31/06-01) · 읽기 전용 줄 · 한도 경과 안내(엔진 함수)
 *  C  ④ 덮어쓰기 · ③ 복원 · 직접 사례(양도일 경계 · 주택 철거 행 · 지목 왕복 · 축 B 첫 카드 상속)
 *  D  ⑦ 결과 카드 — 접힘 사유별 문구(엔진 사유 표)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import type { z } from "zod";
import { OtherLandPropertyTaxBasisField } from "@/components/calc/transfer/nbl/OtherLandPropertyTaxBasisField";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { validateNblOtherLand } from "@/lib/calc/transfer-tax-validate-nbl-other";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { buildNonBusinessLandRaw, buildFractionalShareNblRecord } from "@/lib/calc/non-business-land-request";
import { demolishedFloorAreaNeededOf, demolishedOnFieldNeededOf } from "@/lib/calc/nbl-demolished-tail-scope";
import { refineNonBusinessLandRaw, type NblRawRefineInput } from "@/lib/api/transfer-tax-schema-nbl-refines";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES, type NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE } from "@/lib/tax-engine/non-business-land/demolished-temp-status";

afterEach(cleanup);

// ── 픽스처 ────────────────────────────────────────────────────────────────────

type Mode = "" | "unchanged" | "unknown" | "changed";
type Last = "none" | "built" | "removedValid" | "removedBlank" | "taxChanged";
type Ev = { kind: "building_built" | "building_removed" | "tax_type_changed"; date: string; propertyTaxTypeBefore: string };
const ROW_DATE = "2022-12-01";

function eventsOf(last: Last): Ev[] {
  switch (last) {
    case "none": return [];
    case "built": return [{ kind: "building_built", date: "2020-01-01", propertyTaxTypeBefore: "" }];
    case "removedValid": return [{ kind: "building_built", date: "2019-01-01", propertyTaxTypeBefore: "" }, { kind: "building_removed", date: ROW_DATE, propertyTaxTypeBefore: "separate" }];
    case "removedBlank": return [{ kind: "building_built", date: "2019-01-01", propertyTaxTypeBefore: "" }, { kind: "building_removed", date: "", propertyTaxTypeBefore: "separate" }];
    case "taxChanged": return [{ kind: "tax_type_changed", date: "2020-01-01", propertyTaxTypeBefore: "comprehensive" }];
  }
}

const BASE_ASSET = makeDefaultAsset(1);
const asset = (over: Partial<AssetForm>): AssetForm =>
  ({
    ...BASE_ASSET,
    assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "1000",
    isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
    nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: false, nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [],
    ...over,
  }) as AssetForm;

function refine(raw: Record<string, unknown>): { path: (string | number)[]; message: string }[] {
  const out: { path: (string | number)[]; message: string }[] = [];
  refineNonBusinessLandRaw(raw as unknown as NblRawRefineInput, { addIssue: (i: { path: (string | number)[]; message: string }) => out.push({ path: i.path, message: i.message }) } as unknown as z.RefinementCtx);
  return out;
}

const DEMOLISHED_PATHS = new Set(["nblOtherDemolishedOn", "nblOtherDemolishedFloorArea", "nblZoneType"]);
const IS_DEMOLISHED_MESSAGE = (m: string) => m.includes("철거ㆍ멸실 근거 —");

// ── A. ⑧↔⑫ parity 격자 ────────────────────────────────────────────────────────

const MODES: Mode[] = ["", "unchanged", "unknown", "changed"];
const LASTS: Last[] = ["none", "built", "removedValid", "removedBlank", "taxChanged"];
const ONS = ["", "2023-12-26", "2030-01-01", "abc"];
const TRANSFERS = ["", "2024-05-31", "2024-06-01", "2025-06-01"];
const FLOORS = ["", "400"];
const ZONES = ["general_residential", "residential"];
const BASES: AssetForm["nblOtherPropertyTaxBasis"][] = ["demolished", "vacant_state", ""];

interface Cell { parcels: boolean; mode: Mode; last: Last; toggle: boolean; basis: AssetForm["nblOtherPropertyTaxBasis"]; on: string; transfer: string; floor: string; zone: string }

function cellAsset(c: Cell): AssetForm {
  return asset({
    // 연접 다필지 ON이면 이력 질문이 적용되지 않는다(`nblStateHistoryApplies` 거짓) — 저장된 `changed`·사건은 ④가 비워 보내고 ⑧·⑫·⑤ 어디서도 읽히지 않아야 한다(stale)
    nblOtherUseParcels: c.parcels,
    nblOtherStateHistoryMode: c.mode,
    // 비`changed` 모드에는 stale 사건을 남긴다 — 화면에 없는 사건은 ⑧·④·⑫ 어디서도 읽히지 않아야 한다.
    nblOtherStateEvents: c.mode !== "" ? (eventsOf(c.last) as never) : [],
    nblOtherHasBuilding: c.toggle,
    nblOtherPropertyTaxBasis: c.basis,
    nblOtherDemolishedOn: c.on,
    nblOtherDemolishedFloorArea: c.floor,
    nblZoneType: c.zone,
  });
}

const GRID: Cell[] = [];
for (const parcels of [false, true]) for (const mode of MODES) for (const last of LASTS) for (const toggle of [false, true]) for (const basis of BASES)
  for (const on of ONS) for (const transfer of TRANSFERS) for (const floor of FLOORS) for (const zone of ZONES)
    GRID.push({ parcels, mode, last, toggle, basis, on, transfer, floor, zone });

describe("E3f-1b U-2 A — ⑧↔⑫ parity 격자(실제 ⑧ · 실제 ⑫′ · ④ 와이어 · ⑤ 술어)", () => {
  it("격자 규모(공허 방지) · 칸이 필요한 칸·불요한 칸이 모두 포함된다", () => {
    expect(GRID.length).toBe(2 * 4 * 5 * 2 * 3 * 4 * 4 * 2 * 2);
    expect(GRID.filter((c) => demolishedOnFieldNeededOf(cellAsset(c))).length).toBeGreaterThan(500);
    expect(GRID.filter((c) => !demolishedOnFieldNeededOf(cellAsset(c))).length).toBeGreaterThan(5000);
  });

  it("(a)(b)(c)(d): ⑫′가 400이면 ⑧도 차단 · ⑧이 이 근거로 막으면 ⑫′도 같은 칸·같은 문구 · ⑧이 가리키는 칸은 ⑤가 그리는 칸 · ④는 불요한 칸을 비워 보낸다", () => {
    const bad: string[] = [];
    // 공허 방지 — 격자가 실제로 ⑧·⑫′ 양쪽을 막는 칸 · 한쪽만 거치는 칸을 모두 지나는지 센다
    const seen = { eightDemolished: 0, twelveDemolished: 0, onField: 0, floorField: 0, zoneField: 0 };
    for (const c of GRID) {
      const a = cellAsset(c);
      const raw = buildNonBusinessLandRaw(a, c.transfer);
      if (!raw) { bad.push(`④ raw 없음 ${JSON.stringify(c)}`); continue; }
      const twelve = refine(raw).filter((i) => DEMOLISHED_PATHS.has(String(i.path[0])) && IS_DEMOLISHED_MESSAGE(i.message));
      const { result: eight, fieldOf } = collectWithFields(() => validateNblOtherLand(a, "자산", { transferDate: c.transfer }));

      if (eight !== null && IS_DEMOLISHED_MESSAGE(eight)) {
        seen.eightDemolished++;
        const f = fieldOf(eight);
        if (f === "nblOtherDemolishedOn") seen.onField++;
        if (f === "nblOtherDemolishedFloorArea") seen.floorField++;
        if (f === "nblZoneType") seen.zoneField++;
      }
      if (twelve.length > 0) seen.twelveDemolished++;
      // (a) «⑫ 400이면 ⑧도 차단»
      if (twelve.length > 0 && eight === null) bad.push(`(a) ⑫ 400인데 ⑧ 통과 ${JSON.stringify(c)}`);
      // (b) ⑧이 철거 근거로 막으면 ⑫′도 같은 문구 · 같은 칸(⑧은 사건 행 결함을 먼저 막으므로 이 분기에 오면 행 결함은 없다)
      if (eight !== null && IS_DEMOLISHED_MESSAGE(eight)) {
        const hit = twelve.find((t) => eight.endsWith(t.message));
        if (!hit) bad.push(`(b) ⑧만 차단 ${JSON.stringify(c)} ⑧=${eight.slice(0, 60)}`);
        else if (fieldOf(eight) !== hit.path[0]) bad.push(`(b) 칸 불일치 ${JSON.stringify(c)} ⑧=${fieldOf(eight)} ⑫=${String(hit.path[0])}`);
      }
      // (c) «화면에 없는 칸 요구 금지» — ⑧이 철거일·바닥면적 칸을 가리키면 ⑤가 그 칸을 그린다
      if (eight !== null && IS_DEMOLISHED_MESSAGE(eight)) {
        const f = fieldOf(eight);
        if (f === "nblOtherDemolishedOn" && !demolishedOnFieldNeededOf(a)) bad.push(`(c) 철거일 칸 없는데 ⑧ 요구 ${JSON.stringify(c)}`);
        if (f === "nblOtherDemolishedFloorArea" && !demolishedFloorAreaNeededOf(a, c.transfer)) bad.push(`(c) 바닥면적 칸 없는데 ⑧ 요구 ${JSON.stringify(c)}`);
      }
      // (d) ④ — 칸이 불요하면 비어 있다(저장값은 그대로 두고 와이어만 비운다)
      if (!demolishedOnFieldNeededOf(a) && raw.nblOtherDemolishedOn !== "") bad.push(`(d) 철거일 stale 전송 ${JSON.stringify(c)}`);
      if (!demolishedFloorAreaNeededOf(a, c.transfer) && raw.nblOtherDemolishedFloorArea !== "") bad.push(`(d) 바닥면적 stale 전송 ${JSON.stringify(c)}`);
      if (demolishedOnFieldNeededOf(a) && raw.nblOtherDemolishedOn !== c.on) bad.push(`(d) 필요한 철거일을 안 보냄 ${JSON.stringify(c)}`);
    }
    expect(bad.slice(0, 8)).toEqual([]);
    expect(seen.onField).toBeGreaterThan(100);
    expect(seen.floorField).toBeGreaterThan(50);
    expect(seen.zoneField).toBeGreaterThan(20);
    expect(seen.twelveDemolished).toBeGreaterThanOrEqual(seen.eightDemolished);
  }, 120_000);
});

// ── B. ⑤ 렌더 ─────────────────────────────────────────────────────────────────

const tail = (a: AssetForm, transferDate?: string) =>
  render(<OtherLandPropertyTaxBasisField asset={a} onAssetChange={() => {}} transferDate={transferDate} />);
const dateField = () => document.querySelector('[data-field="nblOtherDemolishedOn"]');
const floorField = () => document.querySelector('[data-field="nblOtherDemolishedFloorArea"]');
const sourceLine = () => document.querySelector('[data-testid="nbl-other-demolished-on-source"]');
const expiredNotice = () => document.querySelector('[data-testid="nbl-other-demolished-expired-notice"]');

describe("E3f-1b U-2 B — ⑤ 칸 노출(T1~T9)", () => {
  const DEMO = { nblOtherPropertyTaxBasis: "demolished" as const };
  it("T3·T8: 이력 없음/바뀐 적 없음/모름 + 근거 «철거ㆍ멸실» → 새 칸이 보이고 required", () => {
    for (const mode of ["", "unchanged", "unknown"] as const) {
      tail(asset({ ...DEMO, nblOtherStateHistoryMode: mode }), "2025-06-01");
      expect(dateField(), mode).not.toBeNull();
      expect(sourceLine()).toBeNull();
      expect(dateField()!.textContent).toContain("*");
      cleanup();
    }
  });

  it("T1·T2: 철거 행이 날짜를 대면 새 칸은 숨고 읽기 전용 한 줄(철거일 표시) — 새 칸의 저장값은 그대로", () => {
    tail(asset({ ...DEMO, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: eventsOf("removedValid") as never, nblOtherDemolishedOn: "abc" }), "2025-06-01");
    expect(dateField()).toBeNull();
    expect(sourceLine()!.textContent).toContain(ROW_DATE);
  });

  it("T3: 이력 changed + 철거 행 날짜 빈칸 → 새 칸(행 결함은 사건 행 검증이 먼저 막는다) · 구분 변경 행만 있어도 새 칸", () => {
    tail(asset({ ...DEMO, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: eventsOf("removedBlank") as never }), "2025-06-01");
    expect(dateField()).not.toBeNull();
    cleanup();
    tail(asset({ ...DEMO, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: eventsOf("taxChanged") as never }), "2025-06-01");
    expect(dateField()).not.toBeNull();
  });

  it("X-13 이력 모드 stale: 모드를 «바뀐 적 없음»으로 바꾸면 남은 철거 행은 읽히지 않는다 → 새 칸이 다시 보인다", () => {
    tail(asset({ ...DEMO, nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: eventsOf("removedValid") as never }), "2025-06-01");
    expect(dateField()).not.toBeNull();
    expect(sourceLine()).toBeNull();
  });

  it("T6·T7: 근거가 «철거ㆍ멸실»이 아니거나 건축물이 있으면 철거 블록 전체가 없다", () => {
    for (const a of [
      asset({ nblOtherPropertyTaxBasis: "vacant_state" }),
      asset({ nblOtherPropertyTaxBasis: "" }),
      asset({ ...DEMO, nblOtherHasBuilding: true }),
      asset({ ...DEMO, nblOtherPropertyTaxType: "comprehensive" }),
    ]) {
      tail(a, "2025-06-01");
      expect(dateField()).toBeNull();
      expect(floorField()).toBeNull();
      expect(document.querySelector('[data-testid="nbl-other-demolished-tail"]')).toBeNull();
      cleanup();
    }
  });

  it("건축물 있음 토글 + 이력 changed 마지막 사건 «철거» → 양도일 현재 건축물 없음(사건이 이긴다) → 칸 노출", () => {
    tail(asset({ ...DEMO, nblOtherHasBuilding: true, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: eventsOf("removedBlank") as never }), "2025-06-01");
    expect(dateField()).not.toBeNull();
  });

  it("바닥면적 칸 양도일 경계 — 2024-05-31 숨김 · 2024-06-01 노출 · 2016-05-31/2016-06-01(첫 과세기준일 전후)도 숨김 · 양도일 미입력은 노출. 철거 안내 문단(testid)은 항상 남는다", () => {
    const cases: [string | undefined, boolean][] = [
      ["2016-05-31", false], ["2016-06-01", false], ["2024-05-31", false], ["2024-06-01", true], ["2024-06-03", true], ["", true], [undefined, true],
    ];
    for (const [transfer, shown] of cases) {
      tail(asset({ ...DEMO }), transfer);
      expect(floorField() !== null, `${transfer}`).toBe(shown);
      expect(document.querySelector('[data-testid="nbl-other-tax-basis-demolished-notice"]'), `${transfer} 안내 문단`).not.toBeNull();
      expect(document.querySelector('[data-testid="nbl-other-tax-basis-demolished-direction"]')).not.toBeNull();
      expect(dateField(), `${transfer} 철거일 칸은 양도일과 무관`).not.toBeNull();
      cleanup();
    }
  });

  it("바닥면적 칸 노출 = ⑧ 요구 = ④ 전송(같은 술어) — 양도일 2024-05-31이면 ⑧은 바닥면적·용도지역을 요구하지 않고 ④는 비운다", () => {
    const a = asset({ ...DEMO, nblOtherDemolishedOn: "2023-12-26", nblOtherDemolishedFloorArea: "", nblZoneType: "residential" });
    expect(validateNblOtherLand(a, "자산", { transferDate: "2024-05-31" })).toBeNull();
    expect(buildNonBusinessLandRaw({ ...a, nblZoneType: "general_residential", nblOtherDemolishedFloorArea: "400" }, "2024-05-31")?.nblOtherDemolishedFloorArea).toBe("");
    expect(validateNblOtherLand(a, "자산", { transferDate: "2024-06-01" })).toMatch(/바닥면적/);
  });

  it("한도 경과 안내 — 엔진 `isTailDemolishedClearlyExpired`: 철거 2018-01-01 · 양도 2024-01-01 → 안내(엔진 상수) · 철거 2023-12-26 → 없음 · 날짜 해석 불가·미입력 → 없음 · 철거 행 날짜도 같다", () => {
    tail(asset({ ...DEMO, nblOtherDemolishedOn: "2018-01-01" }), "2024-01-01");
    expect(expiredNotice()!.textContent).toBe(NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE);
    cleanup();
    // 경계(2026-11-24 정정 — 민법 §157·§160): 철거 2022-12-01의 6개월 만료일 2023-06-01 = 직전 과세기준일(양도 2024-05-31) → 한시 안 → 안내 없음 · 철거 2022-11-30 → 만료일 2023-05-31 → 안내
    tail(asset({ ...DEMO, nblOtherDemolishedOn: "2022-11-30" }), "2024-05-31");
    expect(expiredNotice()!.textContent).toBe(NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE);
    cleanup();
    for (const [on, transfer] of [["2022-12-01", "2024-05-31"], ["2023-12-26", "2024-01-01"], ["", "2024-01-01"], ["abc", "2024-01-01"], ["2018-01-01", ""], ["2018-01-01", undefined]] as const) {
      tail(asset({ ...DEMO, nblOtherDemolishedOn: on }), transfer);
      expect(expiredNotice(), `${on}/${transfer}`).toBeNull();
      cleanup();
    }
    tail(asset({ ...DEMO, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [{ kind: "building_built", date: "2010-01-01", propertyTaxTypeBefore: "" }, { kind: "building_removed", date: "2018-01-01", propertyTaxTypeBefore: "separate" }] as never }), "2024-01-01");
    expect(expiredNotice(), "철거 행 날짜가 출처여도 같은 안내").not.toBeNull();
    expect(sourceLine()!.textContent).toContain("2018-01-01");
  });

  it("입력: 새 칸에 날짜를 쓰면 onAssetChange({nblOtherDemolishedOn}) — 가정값 없음(빈 칸은 빈 칸)", () => {
    const patches: Partial<AssetForm>[] = [];
    render(<OtherLandPropertyTaxBasisField asset={asset({ ...DEMO })} onAssetChange={(p) => patches.push(p)} transferDate="2025-06-01" />);
    const [y, m, d] = [screen.getByLabelText("연도"), screen.getByLabelText("월"), screen.getByLabelText("일")];
    expect((y as HTMLInputElement).value).toBe("");
    fireEvent.change(y, { target: { value: "2025" } });
    fireEvent.change(m, { target: { value: "01" } });
    fireEvent.change(d, { target: { value: "05" } });
    expect(patches.some((p) => p.nblOtherDemolishedOn === "2025-01-05")).toBe(true);
  });
});

// ── C. ④ · ③ · 직접 사례 ──────────────────────────────────────────────────────

describe("E3f-1b U-2 C — ④ 덮어쓰기 · ③ 복원 · 직접 사례", () => {
  const DEMO = { nblOtherPropertyTaxBasis: "demolished" as const };

  it("④: 철거 행이 날짜를 대는 입력의 숨은 새 칸 값은 전송되지 않는다(store 값은 그대로) — T2·MU-5", () => {
    const a = asset({ ...DEMO, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: eventsOf("removedValid") as never, nblOtherDemolishedOn: "2013-06-01", nblOtherDemolishedFloorArea: "400" });
    const raw = buildNonBusinessLandRaw(a, "2025-06-01")!;
    expect(raw.nblOtherDemolishedOn).toBe("");
    expect(raw.nblOtherDemolishedFloorArea).toBe("400");
    expect(a.nblOtherDemolishedOn).toBe("2013-06-01");
  });

  it("④: 근거를 바꾸면(공지상태) 철거 입력은 둘 다 비워 보낸다 · 새 칸이 필요한 입력은 값을 싣는다", () => {
    const stale = buildNonBusinessLandRaw(asset({ nblOtherPropertyTaxBasis: "vacant_state", nblOtherDemolishedOn: "2013-06-01", nblOtherDemolishedFloorArea: "400" }), "2025-06-01")!;
    expect([stale.nblOtherDemolishedOn, stale.nblOtherDemolishedFloorArea]).toEqual(["", ""]);
    const live = buildNonBusinessLandRaw(asset({ ...DEMO, nblOtherDemolishedOn: "2013-06-01", nblOtherDemolishedFloorArea: "400" }), "2025-06-01")!;
    expect([live.nblOtherDemolishedOn, live.nblOtherDemolishedFloorArea]).toEqual(["2013-06-01", "400"]);
  });

  it("X-12 지목 왕복(기타토지 → 임야 → 기타토지): 값은 보존되고 임야 동안은 ④가 둘 다 비운다 — ⑧도 보지 않는다", () => {
    const stored = { ...DEMO, nblOtherDemolishedOn: "2023-12-26", nblOtherDemolishedFloorArea: "400" };
    const forest = asset({ ...stored, nblLandType: "forest" });
    const raw = buildNonBusinessLandRaw(forest, "2025-06-01");
    expect(raw?.nblOtherDemolishedOn ?? "").toBe("");
    expect(raw?.nblOtherDemolishedFloorArea ?? "").toBe("");
    expect(validateNblOtherLand(forest, "자산", { transferDate: "2025-06-01" })).toBeNull();
    const back = { ...forest, nblLandType: "other_land" } as AssetForm;
    expect(buildNonBusinessLandRaw(back, "2025-06-01")?.nblOtherDemolishedOn).toBe("2023-12-26");
  });

  it("주택 철거 행(철거된 건축물 = 주택)도 철거 행 날짜가 출처다 — 새 칸 없음 · 읽기 전용 줄", () => {
    const rows = [{ kind: "building_built", date: "2019-01-01", propertyTaxTypeBefore: "" }, { kind: "building_removed", date: ROW_DATE, propertyTaxTypeBefore: "", buildingKindBefore: "house", houseFootprintBefore: "100" }];
    const a = asset({ ...DEMO, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: rows as never });
    expect(demolishedOnFieldNeededOf(a)).toBe(false);
    tail(a, "2025-06-01");
    expect(dateField()).toBeNull();
    expect(sourceLine()!.textContent).toContain(ROW_DATE);
  });

  it("양도일 경계 — 철거일이 양도일 당일·이후면 ⑧ 차단(취득일 이전은 통과 — 취득 전 철거 W-3)", () => {
    const base = asset({ ...DEMO, nblOtherDemolishedFloorArea: "400" });
    expect(validateNblOtherLand({ ...base, nblOtherDemolishedOn: "2024-06-03" }, "자산", { transferDate: "2024-06-03" })).toMatch(/양도일\(2024-06-03\)보다 앞이어야/);
    expect(validateNblOtherLand({ ...base, nblOtherDemolishedOn: "2024-06-02" }, "자산", { transferDate: "2024-06-03" })).toBeNull();
    expect(validateNblOtherLand({ ...base, nblOtherDemolishedOn: "2010-01-01" }, "자산", { transferDate: "2024-06-03" })).toBeNull(); // 취득일(2014-01-01) 이전
    expect(validateNblOtherLand({ ...base, nblOtherDemolishedOn: "abc" }, "자산", { transferDate: "2024-06-03" })).toMatch(/날짜로 읽을 수 없습니다/);
  });

  it("⑧ 순서 — 사건 행 결함이 철거ㆍ멸실일 안내보다 먼저(⑫′ stateRowIssued 억제와 같은 방향) · 철거일 → 바닥면적 → 용도지역", () => {
    const rowBad = asset({ ...DEMO, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: eventsOf("removedBlank") as never });
    const msg = validateNblOtherLand(rowBad, "자산", { transferDate: "2025-06-01" })!;
    expect(msg).not.toMatch(/철거ㆍ멸실일을 입력/);
    const all = asset({ ...DEMO, nblZoneType: "residential" });
    const order: string[] = [];
    for (const patch of [{}, { nblOtherDemolishedOn: "2023-12-26" }, { nblOtherDemolishedOn: "2023-12-26", nblOtherDemolishedFloorArea: "400" }] as Partial<AssetForm>[]) {
      const { result, fieldOf } = collectWithFields(() => validateNblOtherLand({ ...all, ...patch }, "자산", { transferDate: "2025-06-01" }));
      order.push(String(fieldOf(result!)));
    }
    expect(order).toEqual(["nblOtherDemolishedOn", "nblOtherDemolishedFloorArea", "nblZoneType"]);
  });

  it("K-28 구현 정정 — 축 B 둘째 이후 지분 카드는 칸이 없다: 첫 카드의 값을 상속한 raw가 같은 판정을 받는다(복사·미러링 없이 `buildFractionalShareNblRecord`)", () => {
    const first = asset({ ...DEMO, nblOtherDemolishedOn: "2023-12-26", nblOtherDemolishedFloorArea: "400" });
    const second = { ...makeDefaultAsset(2), assetKind: "land", acquisitionDate: "2016-01-01", acquisitionCause: "purchase", nblLandType: "", nblOtherDemolishedOn: "" } as unknown as AssetForm;
    const record = buildFractionalShareNblRecord(second, first);
    const raw = buildNonBusinessLandRaw(record, "2025-06-01")!;
    expect(raw.nblOtherDemolishedOn).toBe("2023-12-26");
    expect(refine(raw).filter((i) => DEMOLISHED_PATHS.has(String(i.path[0])) && IS_DEMOLISHED_MESSAGE(i.message))).toEqual([]);
    // 첫 카드 철거일이 비면 첫 카드 ⑧이 막고 둘째 카드의 ⑫′도 같은 칸으로 400 — 둘째 카드 자신의 칸은 없다.
    const blank = buildNonBusinessLandRaw(buildFractionalShareNblRecord(second, { ...first, nblOtherDemolishedOn: "" }), "2025-06-01")!;
    expect(refine(blank).map((i) => String(i.path[0]))).toContain("nblOtherDemolishedOn");
    expect(validateNblOtherLand({ ...first, nblOtherDemolishedOn: "" }, "자산", { transferDate: "2025-06-01" })).toMatch(/철거ㆍ멸실일을 입력/);
    expect(second.nblLandType).toBe(""); // 둘째 카드에는 NBL 칸 자체가 없다
  });

  it("③ 복원 — 구 세션(칸 없음)은 빈 값으로만 채운다(날짜 추정 금지) · 근거 «철거ㆍ멸실»인 구 세션은 ⑧이 칸을 요구한다", () => {
    const legacy = { ...asset({ ...DEMO, nblOtherDemolishedFloorArea: "400" }) } as Record<string, unknown>;
    delete legacy.nblOtherDemolishedOn;
    const restored = migrateAsset(legacy) as AssetForm;
    expect(restored.nblOtherDemolishedOn).toBe("");
    expect(validateNblOtherLand(restored, "자산", { transferDate: "2025-06-01" })).toMatch(/철거ㆍ멸실일을 입력/);
    // 이미 값이 있으면 건드리지 않는다
    expect((migrateAsset({ ...legacy, nblOtherDemolishedOn: "2023-12-26" }) as AssetForm).nblOtherDemolishedOn).toBe("2023-12-26");
  });
});

// ── D. ⑦ 결과 카드 ────────────────────────────────────────────────────────────

describe("E3f-1b U-2 D — ⑦ 결과 카드 접힘 사유", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const input = (ol: Record<string, unknown>): NonBusinessLandInput => ({
    landType: "other_land", landArea: 1000, zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
    otherLand: { propertyTaxType: "separate", hasBuilding: false, isRelatedToResidenceOrBusiness: false, propertyTaxBasis: "demolished", ...ol } as never,
    businessUsePeriods: [], gracePeriods: [],
  });
  const echo = (ol: Record<string, unknown>) => {
    const j = judgeNonBusinessLand(input(ol), DEFAULT_NON_BUSINESS_LAND_RULES);
    const { getByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    return { text: getByTestId("nbl-property-tax-basis-echo").textContent ?? "", j };
  };

  it("한도 경과(`demolished_period_elapsed`): «근거를 확인하지 못해»가 아니라 한시 기간 경과 사유 · 판정에 쓴 분류 = 종합합산", () => {
    const { text, j } = echo({ demolishedOn: d("2018-01-01"), demolishedFloorArea: 400 });
    expect(j.propertyTaxBasis?.unconfirmedReason).toBe("demolished_period_elapsed");
    expect(text).toContain("한시 별도합산 기간이 확실히 지나");
    expect(text).not.toContain("근거를 확인하지 못해");
    expect(text).toContain("종합합산으로 판정했습니다 — 확인 필요");
  });

  it("철거ㆍ멸실일 없음(`demolished_date_missing` — 직접 호출 안전망): 날짜 없음 사유", () => {
    const { text } = echo({ demolishedFloorArea: 400 });
    expect(text).toContain("철거ㆍ멸실일이 없어");
    expect(text).not.toContain("근거를 확인하지 못해");
  });

  it("다른 사유(근거 미선택 등)는 종전 문구 그대로 — 바이트 동일", () => {
    const { text } = echo({ propertyTaxBasis: undefined });
    expect(text).toContain("근거를 확인하지 못해 종합합산으로 판정했습니다 — 확인 필요.");
  });

  it("한시 안(철거 2023-12-26 · 양도 2024-01-01): 접히지 않는다(accepted) — 확인 필요 줄 없음", () => {
    const j = judgeNonBusinessLand(input({ demolishedOn: d("2023-12-26"), demolishedFloorArea: 400 }), DEFAULT_NON_BUSINESS_LAND_RULES);
    const { queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(queryByTestId("nbl-property-tax-basis-unconfirmed-echo")).toBeNull();
  });
});
