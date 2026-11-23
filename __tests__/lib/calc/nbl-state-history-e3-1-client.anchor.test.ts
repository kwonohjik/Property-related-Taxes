/**
 * NBL-STATE-HISTORY-E3-① (U4) — 클라이언트 ③ 복원 · ④ 와이어 · ⑤ 미리보기·술어 · ⑧ anchor (재산세 과세 구분 변경 사건 `tax_type_changed`).
 * 계획서: docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.ui.plan.md §5 · §6 · §7 · §8.2
 *
 * 침묵 소실 방어 — 네 곳(③④⑤ + 위젯)이 따로 `kind === "building_removed"`를 들고 있으면 새 종류의 «변경 직전 구분»이 `""`(모름)이 되어
 * «별도합산이라고 입력했는데 모름 처리 → 비사업용»이 된다. 곳마다 다른 파일이 잡도록 한 곳씩 고정한다(mutation 대응표는 UI 계획서 «구현 기록»).
 */
import { describe, it, expect } from "vitest";
import { buildStateHistoryPreview } from "@/lib/calc/nbl-other-state-history-preview";
import { effectiveOtherHasBuildingOf, nblOtherBuildingToggleHidden, stateHistoryWireFields } from "@/lib/calc/nbl-other-state-history-scope";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { validateNblStateHistory } from "@/lib/calc/transfer-tax-validate-nbl-state-history";
import { makeDefaultAsset, migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type Ev = AssetForm["nblOtherStateEvents"][number];
const tax = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "tax_type_changed", date, propertyTaxTypeBefore: before });
const removed = (date: string, before: Ev["propertyTaxTypeBefore"] = "separate"): Ev => ({ kind: "building_removed", date, propertyTaxTypeBefore: before });
const built = (date: string): Ev => ({ kind: "building_built", date, propertyTaxTypeBefore: "" });

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
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
const migrated = (over: Record<string, unknown>) => migrateAsset({ ...makeDefaultAsset(1), ...over }) as unknown as Record<string, unknown>;

describe("③ 복원 — 새 종류 허용 · 재산세 변경 행의 직전 구분 보존 · 기존 행 byte-identical", () => {
  it("재산세 변경 행은 kind·date·직전 구분이 그대로 복원된다(허용값 밖 직전 구분만 \"\")", () => {
    const a = migrated({
      nblOtherStateEvents: [
        { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" },
        { kind: "tax_type_changed", date: "2023-01-01", propertyTaxTypeBefore: "toString" },
        { kind: "tax_type_changed", date: "2023-06-01", propertyTaxTypeBefore: 7 },
      ],
    });
    expect(a.nblOtherStateEvents).toEqual([
      { kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" },
      { kind: "tax_type_changed", date: "2023-01-01", propertyTaxTypeBefore: "" },
      { kind: "tax_type_changed", date: "2023-06-01", propertyTaxTypeBefore: "" },
    ]);
  });
  it("신축 행의 stale 직전 구분은 \"\" · 철거 행은 보존 · 허용값 밖 종류는 \"\"(⑧이 행 단위로 짚는다)", () => {
    const a = migrated({
      nblOtherStateEvents: [
        { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "separate" },
        { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "special_sum" },
        { kind: "tax_type_change", date: "2022-01-01", propertyTaxTypeBefore: "separate" },
      ],
    });
    expect(a.nblOtherStateEvents).toEqual([
      { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "special_sum" },
      { kind: "", date: "2022-01-01", propertyTaxTypeBefore: "" },
    ]);
  });
  it("구 스냅샷(신축·철거만) JSON 복원은 byte-identical — 기존 저장값이 이 PR로 달라지지 않는다", () => {
    const old = [
      { kind: "building_built", date: "2016-01-01", propertyTaxTypeBefore: "" },
      { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" },
    ];
    const out = migrated({ nblOtherStateHistoryMode: "changed", nblOtherStateEvents: JSON.parse(JSON.stringify(old)) });
    expect(JSON.stringify(out.nblOtherStateEvents)).toBe(JSON.stringify(old));
  });
});

describe("④ 와이어 — 재산세 변경 행의 직전 구분을 지우지 않는다", () => {
  it("changed + 재산세 변경: 행 그대로(직전 구분 보존) — 지우면 엔진이 «모름 → 종합합산»으로 읽는다", () => {
    const w = stateHistoryWireFields(asset({ nblOtherStateEvents: [tax("2022-06-01", "separate")] }));
    expect(w.nblOtherStateEvents).toEqual([{ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" }]);
  });
  it("신축 행의 stale 직전 구분은 \"\"로 정규화(불변) · 철거 행은 보존", () => {
    const stale = { kind: "building_built" as const, date: "2016-01-01", propertyTaxTypeBefore: "separate" as const };
    const w = stateHistoryWireFields(asset({ nblOtherStateEvents: [stale, tax("2018-01-01", "comprehensive"), removed("2021-01-01", "special_sum")] }));
    expect(w.nblOtherStateEvents.map((e) => e.propertyTaxTypeBefore)).toEqual(["", "comprehensive", "special_sum"]);
  });
  it("요청 body(`buildNonBusinessLandRaw`): tax-only 이력은 토글 저장값(true)을 그대로 싣는다 — 사건이 건축물 유무를 덮어쓰지 않는다", () => {
    const raw = buildNonBusinessLandRaw(asset({ nblOtherStateEvents: [tax("2022-06-01", "separate")] }), "2024-01-01") as Record<string, unknown>;
    expect(raw.nblOtherHasBuilding).toBe(true);
    expect(raw.nblOtherStateEvents).toEqual([{ kind: "tax_type_changed", date: "2022-06-01", propertyTaxTypeBefore: "separate" }]);
  });
});

describe("⑤ 술어 — effectiveOtherHasBuildingOf · nblOtherBuildingToggleHidden (S7·S13)", () => {
  it("tax-only 이력은 저장 토글값을 읽는다(건축물 사건이 0건이면 사건이 정하지 않는다)", () => {
    expect(effectiveOtherHasBuildingOf(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2022-06-01")] }))).toBe(true);
    expect(effectiveOtherHasBuildingOf(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [tax("2022-06-01")] }))).toBe(false);
  });
  it("신축 → 재산세 변경 = true(마지막 «건축물» 사건 · 마지막 행이 아님) · 재산세 변경 → 철거 = false · 토글과 모순돼도 건축물 사건이 이긴다", () => {
    expect(effectiveOtherHasBuildingOf(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [built("2016-01-01"), tax("2022-06-01")] }))).toBe(true);
    expect(effectiveOtherHasBuildingOf(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2018-01-01"), removed("2021-01-01", "comprehensive")] }))).toBe(false);
  });
  it("토글 숨김 = changed ∧ 건축물 사건 ≥ 1 — 행 0건 · tax-only · 미선택 행 · 모드 unchanged/unknown은 숨기지 않는다", () => {
    expect(nblOtherBuildingToggleHidden(asset({ nblOtherStateEvents: [] }))).toBe(false);
    expect(nblOtherBuildingToggleHidden(asset({ nblOtherStateEvents: [tax("2022-06-01")] }))).toBe(false);
    expect(nblOtherBuildingToggleHidden(asset({ nblOtherStateEvents: [{ kind: "", date: "", propertyTaxTypeBefore: "" }] }))).toBe(false);
    expect(nblOtherBuildingToggleHidden(asset({ nblOtherStateEvents: [tax("2018-01-01"), removed("2021-01-01")] }))).toBe(true);
    expect(nblOtherBuildingToggleHidden(asset({ nblOtherStateEvents: [built("2016-01-01")] }))).toBe(true);
    expect(nblOtherBuildingToggleHidden(asset({ nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [built("2016-01-01")] }))).toBe(false);
    expect(nblOtherBuildingToggleHidden(asset({ nblUseDetailedJudgment: false, nblOtherStateEvents: [built("2016-01-01")] }))).toBe(false);
  });
});

describe("⑤ 미리보기 — M12(건물 불변 · 별도합산 → 종합합산 2022-06-01)", () => {
  const m12 = (over: Partial<AssetForm> = {}) => buildStateHistoryPreview(asset({ nblOtherStateEvents: [tax("2022-06-01", "separate")], ...over }), "2024-01-01");

  it("구간 2개 · 3,072일(별도합산 충족) + 579일(꼬리) = 소유기간 3,651일 · 변경 전 구간의 구분은 사건의 직전 구분", () => {
    const p = m12()!;
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]).toMatchObject({ start: "2014-01-02", lastDay: "2022-05-31", days: 3072, hasBuilding: true, propertyTaxType: "separate", isTail: false, meetsBuildingRequirement: true });
    expect(p.rows[1]).toMatchObject({ start: "2022-06-01", lastDay: "2023-12-31", days: 579, hasBuilding: true, propertyTaxType: "comprehensive", isTail: true, meetsBuildingRequirement: null });
    expect(p.totalDays).toBe(3651);
    expect(p.hasBuildingAtTransfer).toBe(true);
  });
  it("tax-only 이력의 미리보기 — E3-1b 의도된 반전: 토글 off(건축물 없는 구간의 구분 변경)여도 그려진다 · 나대지 선언이므로 변경 전 구간은 근거 없는 별도합산 → 종합합산(접힘)", () => {
    const p = m12({ nblOtherHasBuilding: false })!;
    expect(p).not.toBeNull();
    expect(p.rows.map((r) => [r.hasBuilding, r.propertyTaxType, r.isTail])).toEqual([[false, "comprehensive", false], [false, "comprehensive", true]]);
    expect(p.hasBuildingAtTransfer).toBe(false);
  });
  it("«모름»(직전 구분 \"\")이면 변경 전 구간은 종합합산(모름) · 요건 미충족 — 직전 구분이 미리보기까지 운반된다(별도합산 → 모름으로 접히지 않는다)", () => {
    expect(m12({ nblOtherStateEvents: [tax("2022-06-01", "")] })!.rows[0]).toMatchObject({ propertyTaxType: "unknown", meetsBuildingRequirement: false });
    expect(m12()!.rows[0].propertyTaxType).toBe("separate");
  });
  it("T3: 신축 → 재산세 변경: 신축 앞 나대지(종합합산 고정) + 건축물 있음·변경 전 구분 + 꼬리 — 3구간", () => {
    const p = buildStateHistoryPreview(asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [built("2016-01-01"), tax("2022-06-01", "separate")] }), "2024-01-01")!;
    expect(p.rows.map((r) => [r.hasBuilding, r.propertyTaxType, r.isTail])).toEqual([
      [false, "comprehensive", false],
      [true, "separate", false],
      [true, "comprehensive", true],
    ]);
    expect(p.hasBuildingAtTransfer).toBe(true);
  });
  it("T4: 재산세 변경 → 철거: 철거 구간의 직전 구분은 철거 행 값 · 꼬리 나대지", () => {
    const p = buildStateHistoryPreview(asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [tax("2019-01-01", "separate"), removed("2021-01-01", "comprehensive")] }), "2024-01-01")!;
    expect(p.rows.map((r) => [r.hasBuilding, r.propertyTaxType])).toEqual([
      [true, "separate"],
      [true, "comprehensive"],
      [false, "comprehensive"],
    ]);
    expect(p.hasBuildingAtTransfer).toBe(false);
  });
  it("UV-5 클립: 사건일 ≤ 소유 첫날이면 앞 구간 0일을 버린다 — 첫 행이 소유 첫날에서 시작", () => {
    const p = buildStateHistoryPreview(asset({ acquisitionDate: "2023-12-30", nblOtherStateEvents: [tax("2023-12-31", "separate")] }), "2024-01-01")!;
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ start: "2023-12-31", days: 1, isTail: true });
  });
});

describe("⑧ — tailHasBuilding 3중 패턴(⑤ 미리보기 ↔ ⑧): 같은 입력은 같이 통과하고 같이 막힌다", () => {
  /** ⑧ 결과 — 메시지와 필드 점프 앵커(`fieldError` 수집기). */
  const issue = (a: AssetForm) => {
    const { result, fieldOf } = collectWithFields(() => validateNblStateHistory(a, "자산", { transferDate: "2024-01-01", floorDate: "2014-01-01" }));
    return result === null ? null : { message: result, field: fieldOf(result) };
  };
  const preview = (a: AssetForm) => buildStateHistoryPreview(a, "2024-01-01", "2014-01-01");

  it("M12 + 토글 on → 통과 + 미리보기 있음", () => {
    const a = asset({ nblOtherStateEvents: [tax("2022-06-01")] });
    expect(issue(a)).toBeNull();
    expect(preview(a)).not.toBeNull();
  });
  it("M12 + 토글 off → E3-1b 의도된 반전: ⑧ 통과 + 미리보기 있음(건축물 없는 구간의 구분 변경 차단 규칙 삭제 — 나대지 선언이다)", () => {
    const a = asset({ nblOtherHasBuilding: false, nblOtherStateEvents: [tax("2022-06-01")] });
    expect(issue(a)).toBeNull();
    expect(preview(a)).not.toBeNull();
  });
  it("철거 뒤 구분 변경(나대지 위) → E3-1b 의도된 반전: ⑧ 통과 + 미리보기 있음(토글과 무관) · 3구간(건축물 | 나대지 접힘 | 꼬리)", () => {
    const a = asset({ nblOtherHasBuilding: true, nblOtherStateEvents: [removed("2019-01-01"), tax("2021-01-01")] });
    expect(issue(a)).toBeNull();
    expect(preview(a)!.rows.map((r) => [r.hasBuilding, r.propertyTaxType])).toEqual([[true, "separate"], [false, "comprehensive"], [false, "comprehensive"]]);
  });
  it("재산세 변경 + 철거 같은 날 → ⑧ 차단(날짜 칸) + 미리보기 null", () => {
    const a = asset({ nblOtherStateEvents: [tax("2021-01-01"), removed("2021-01-01", "comprehensive")] });
    expect(issue(a)!.field).toBe("nblOtherStateEvents.1.date");
    expect(preview(a)).toBeNull();
  });
});
