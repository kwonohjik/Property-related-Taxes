/**
 * NBL-STATE-HISTORY-E3-1b — ③ 복원 정규화 anchor: 나대지 선언 칸 2개(`propertyTaxBasisBefore`·`areaWithinLimitBefore`) 허용값 방어 · 키를 새로 만들지 않는다(byte-identical).
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.ui.plan.md §6 ③
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset, migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";

const migrated = (over: Record<string, unknown>) => migrateAsset({ ...makeDefaultAsset(1), ...over }) as unknown as Record<string, unknown>;
const events = (rows: unknown[]) => migrated({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: rows }).nblOtherStateEvents;

describe("③ E3-1b — 선언 칸 보존 · 허용값 방어 · byte-identical", () => {
  it("선언이 있는 신축 행·구분 변경 행은 그대로 보존(직전 구분 · 근거 · 면적한도)", () => {
    const rows = [
      { kind: "building_built", date: "2023-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" },
      { kind: "tax_type_changed", date: "2023-09-01", propertyTaxTypeBefore: "special_sum", propertyTaxBasisBefore: "separate_taxation" },
    ];
    expect(events(JSON.parse(JSON.stringify(rows)))).toEqual(rows);
  });

  it("키가 없던 기존 행에는 키를 만들지 않는다 — 구 스냅샷 JSON byte-identical(신축 행 `\"\"` 포함)", () => {
    const old = [
      { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" },
      { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" },
    ];
    expect(JSON.stringify(events(JSON.parse(JSON.stringify(old))))).toBe(JSON.stringify(old));
  });

  it("허용값 밖 근거·면적한도는 키째 제거 · 빈 값(\"\")도 키를 남기지 않는다", () => {
    const out = events([
      { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "toString", areaWithinLimitBefore: "maybe" },
      { kind: "building_built", date: "2017-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: 7, areaWithinLimitBefore: null },
      { kind: "building_built", date: "2018-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "", areaWithinLimitBefore: "" },
    ]) as Array<Record<string, unknown>>;
    for (const r of out) {
      expect(r).not.toHaveProperty("propertyTaxBasisBefore");
      expect(r).not.toHaveProperty("areaWithinLimitBefore");
      expect(r.propertyTaxTypeBefore).toBe("separate");
    }
  });

  it("나대지 구간을 닫을 수 없는 종류(철거 · 미선택 · 허용값 밖)의 선언 칸은 제거한다 — 직전 구분은 종전대로", () => {
    const out = events([
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" },
      { kind: "", date: "2021-02-01", propertyTaxTypeBefore: "", propertyTaxBasisBefore: "vacant_state" },
      { kind: "x", date: "2021-03-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state" },
    ]);
    expect(out).toEqual([
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" },
      { kind: "", date: "2021-02-01", propertyTaxTypeBefore: "" },
      { kind: "", date: "2021-03-01", propertyTaxTypeBefore: "" },
    ]);
  });

  it("구분 변경 행의 선언 칸은 건축물 토글과 무관하게 보존한다 — 숨은 값은 지우지 않고 ④가 갈래에 맞을 때만 보낸다(토글 복원)", () => {
    const row = { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "vacant_state", areaWithinLimitBefore: "within" };
    for (const hasBuilding of [true, false]) {
      const a = migrated({ nblOtherHasBuilding: hasBuilding, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [{ ...row }] });
      expect(a.nblOtherStateEvents).toEqual([row]);
    }
  });
});
