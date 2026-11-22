/**
 * NBL-STATE-HISTORY-U0 — 기타토지 건축물 이력 폼 상태(①②③) anchor.
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.ui.plan.md §6 ①②③ · §11.1
 *
 *   · ② initial — 모드 `""`(미답) · 사건 `[]` · 자산마다 새 배열 인스턴스(공유 참조 금지). NBL_DEFAULTS↔factory 일치는 기존 `nbl-defaults-and-migrate-guards` 가드가 강제한다.
 *   · ③ normalize — 칸 없음(구 이력)은 `""`·`[]`. 허용값 밖은 접되 **`""`을 `unchanged`로 접지 않는다**(미입력 ≠ 미해당).
 *     행 수준 방어: kind·propertyTaxTypeBefore 허용값 밖 → `""` · date가 문자열이 아니면 `""` · 신축 행의 철거 직전 구분은 `""`.
 */
import { describe, it, expect } from "vitest";
import { NBL_DEFAULTS } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeDefaultAsset, migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";

const migrated = (over: Record<string, unknown>) => migrateAsset({ ...makeDefaultAsset(1), ...over }) as unknown as Record<string, unknown>;

describe("② initial", () => {
  it("factory·NBL_DEFAULTS 모두 모드 \"\" · 사건 []", () => {
    const f = makeDefaultAsset(1) as unknown as Record<string, unknown>;
    expect([f.nblOtherStateHistoryMode, f.nblOtherStateEvents]).toEqual(["", []]);
    expect([NBL_DEFAULTS.nblOtherStateHistoryMode, NBL_DEFAULTS.nblOtherStateEvents]).toEqual(["", []]);
  });
  it("사건 배열은 자산마다 새 인스턴스", () => {
    expect(makeDefaultAsset(1).nblOtherStateEvents).not.toBe(makeDefaultAsset(2).nblOtherStateEvents);
  });
});

describe("③ normalize — 칸 없음(구 이력·sessionStorage)", () => {
  it("칸이 없으면 모드 \"\"(미답 — ⑧이 질문을 요구) · 사건 []", () => {
    const a = migrateAsset({}) as unknown as Record<string, unknown>;
    expect([a.nblOtherStateHistoryMode, a.nblOtherStateEvents]).toEqual(["", []]);
  });
  it("구 이력(필드 없음)을 `unchanged`로 접지 않는다", () => {
    const old = { ...makeDefaultAsset(1) } as Record<string, unknown>;
    delete old.nblOtherStateHistoryMode;
    delete old.nblOtherStateEvents;
    expect(migrateAsset(old).nblOtherStateHistoryMode).toBe("");
  });
});

describe("③ normalize — 값·행 수준 방어", () => {
  it("모드가 허용값 밖이면 \"\" (unchanged로 접지 않는다)", () => {
    expect(migrated({ nblOtherStateHistoryMode: "x" }).nblOtherStateHistoryMode).toBe("");
    expect(migrated({ nblOtherStateHistoryMode: 1 }).nblOtherStateHistoryMode).toBe("");
    expect(migrated({ nblOtherStateHistoryMode: null }).nblOtherStateHistoryMode).toBe("");
  });
  it.each(["", "unchanged", "changed", "unknown"])("허용값 %s는 그대로", (mode) => {
    expect(migrated({ nblOtherStateHistoryMode: mode }).nblOtherStateHistoryMode).toBe(mode);
  });
  it("사건이 배열이 아니면 []", () => {
    expect(migrated({ nblOtherStateEvents: "x" }).nblOtherStateEvents).toEqual([]);
    expect(migrated({ nblOtherStateEvents: null }).nblOtherStateEvents).toEqual([]);
  });
  it("행의 kind·propertyTaxTypeBefore가 허용값 밖이면 \"\" · date가 문자열이 아니면 \"\"", () => {
    const a = migrated({
      nblOtherStateEvents: [
        { kind: "y", date: 1, propertyTaxTypeBefore: "z" },
        { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "toString" },
        "문자열 행",
        null,
      ],
    });
    expect(a.nblOtherStateEvents).toEqual([
      { kind: "", date: "", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "" },
      { kind: "", date: "", propertyTaxTypeBefore: "" },
      { kind: "", date: "", propertyTaxTypeBefore: "" },
    ]);
  });
  it("정상 행은 그대로 · 신축 행의 stale 철거 직전 구분은 \"\"", () => {
    const a = migrated({
      nblOtherStateEvents: [
        { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "separate" },
        { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "special_sum" },
      ],
    });
    expect(a.nblOtherStateEvents).toEqual([
      { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "special_sum" },
    ]);
  });
});
