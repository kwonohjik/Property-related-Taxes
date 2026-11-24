/**
 * NBL-STATE-HISTORY-E3-④ UI — ④ 전송 · ⑧ HH-1~3 · ③ 복원 · ⑧ ↔ ⑫ ↔ 엔진 parity 격자.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.ui.plan.md §5~§7 · §11 (UM-5·UM-6·UM-7·UM-8)
 *
 * 격자 핵심: 술어 `vacantLotHousePeriodsReadOf`(④ 전송 · ⑤ 노출 · ⑧ 요구가 부르는 단일 래퍼) ⟺ «④가 싣는 행이 엔진 판정을 실제로 바꾼다».
 * 같은 폼에서 질문 «있습니다 + 행»과 «없습니다»의 ④ raw → ⑭ 매퍼 → 엔진 판정(비사업용 여부 · 사업용 일수 · 면적 안분 · echo)을 비교한다 — 술어 참인데 안 변하거나 거짓인데 변하면 UI와 엔진이 갈린 것이다.
 */
import { describe, it, expect } from "vitest";
import { buildNonBusinessLandRaw, buildNblEngineInput, buildFractionalShareNblRecord } from "@/lib/calc/non-business-land-request";
import { householdHouseWireFields, vacantLotHousePeriodsReadOf } from "@/lib/calc/nbl-vacant-lot-household-scope";
import { validateNblVacantLotHousehold } from "@/lib/calc/transfer-tax-validate-nbl-vacant-lot";
import { validateNblStateHistory } from "@/lib/calc/transfer-tax-validate-nbl-state-history";
import { housePriorHistoryIgnoredOf } from "@/lib/calc/nbl-other-state-history-read";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { NBL_HOUSEHOLD_HOUSE_PERIODS_MAX, nblHouseholdHousePeriodsCapMessage } from "@/lib/calc/nbl-household-house-periods-cap";
import { migrateNblB1Fields } from "@/lib/stores/calc-wizard-asset-migrate-nbl";
import { nonBusinessLandRawSchema } from "@/lib/api/transfer-tax-schema-nbl";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER = "2024-01-01";
const HO13 = "vacant_lot_1household" as const;

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionArea: "600",
    acquisitionDate: "2014-01-01",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherRelatedBusinessType: HO13,
    nblOtherHasBuilding: false,
    ...over,
  }) as AssetForm;

const removed = (date: string) => ({ kind: "building_removed" as const, date, propertyTaxTypeBefore: "comprehensive" as const });
const built = (date: string) => ({ kind: "building_built" as const, date, propertyTaxTypeBefore: "" as const });
const rowOf = (startDate: string, endDate = "") => ({ startDate, endDate });
const wire = (a: AssetForm) => buildNonBusinessLandRaw(a, TRANSFER) as Record<string, unknown>;
const issueOf = (a: AssetForm, ctx: { skip?: boolean } = {}) => {
  const { result, fieldOf } = collectWithFields(() => validateNblVacantLotHousehold(a, "자산", { transferDate: TRANSFER, ...ctx }));
  return result ? { message: result, field: fieldOf(result) } : null;
};

describe("④ 전송 — 행은 술어 참 ∧ 질문 «있습니다»일 때만, 질문 상태는 서버로 보내지 않는다", () => {
  const owned = { nblOtherHouseholdHouseStatus: "owned" as const, nblOtherHouseholdHousePeriods: [rowOf("2020-01-01", "2021-06-01"), rowOf("2022-01-01")] };

  it("술어 참 + owned → 행을 싣고 종료일 비움(`\"\"`)은 키를 생략한다(UM-8 — `\"\"`을 보내면 ⑫ 날짜 형식 400)", () => {
    const w = wire(asset(owned));
    expect(w.nblOtherHouseholdHousePeriods).toEqual([{ startDate: "2020-01-01", endDate: "2021-06-01" }, { startDate: "2022-01-01" }]);
    expect((w.nblOtherHouseholdHousePeriods as Array<Record<string, unknown>>)[1]).not.toHaveProperty("endDate");
  });
  it("질문 상태(`nblOtherHouseholdHouseStatus`)는 와이어에 없다(UI 전용)", () => {
    expect(wire(asset(owned))).not.toHaveProperty("nblOtherHouseholdHouseStatus");
    expect(wire(asset())).not.toHaveProperty("nblOtherHouseholdHouseStatus");
  });
  it("질문 none → [] (stale 행을 싣지 않는다) · 미선택 → []", () => {
    expect(wire(asset({ ...owned, nblOtherHouseholdHouseStatus: "none" })).nblOtherHouseholdHousePeriods).toEqual([]);
    expect(wire(asset({ ...owned, nblOtherHouseholdHouseStatus: "" })).nblOtherHouseholdHousePeriods).toEqual([]);
  });
  it("술어 거짓(UM-7) — 꼬리 건물 + 이력 unchanged · 13호 아님 · 660 초과 + 꼬리 건물 changed → [] (숨은 stale 행이 ⑫′ 400을 만들지 않는다)", () => {
    expect(wire(asset({ ...owned, nblOtherHasBuilding: true, nblOtherStateHistoryMode: "unchanged" })).nblOtherHouseholdHousePeriods).toEqual([]);
    expect(wire(asset({ ...owned, nblOtherRelatedBusinessType: "fish_farm_licensed" })).nblOtherHouseholdHousePeriods).toEqual([]);
    expect(wire(asset({ ...owned, acquisitionArea: "900", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2020-06-01")] })).nblOtherHouseholdHousePeriods).toEqual([]);
  });
  it("술어 참 — 꼬리 건물 + changed + 660 이내(과거 나지 구간을 읽는다)", () => {
    expect(wire(asset({ ...owned, nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2020-06-01")] })).nblOtherHouseholdHousePeriods).toHaveLength(2);
  });
  it("householdHouseWireFields — 결함 행(빈 시작일)도 그대로 싣는다(⑧이 먼저 막는 몫 · ④가 고치지 않는다)", () => {
    expect(householdHouseWireFields(asset({ ...owned, nblOtherHouseholdHousePeriods: [rowOf("")] })).nblOtherHouseholdHousePeriods).toEqual([{ startDate: "" }]);
  });
});

describe("⑧ HH-1~3 — 술어 참일 때만 요구한다", () => {
  it("HH-1 질문 미선택 → nblOtherHouseholdHouseStatus", () => {
    const r = issueOf(asset());
    expect(r?.field).toBe("nblOtherHouseholdHouseStatus");
    expect(r?.message).toMatch(/^자산: 기타토지 무주택1세대 1필지 나지\(13호\) — .*세대가 주택을 소유한 적이 있는지 선택하세요/);
  });
  it("HH-0 술어 거짓이면 요구하지 않는다 — 꼬리 건물 + unchanged · 13호 아님 · 660 초과 + 꼬리 건물 changed", () => {
    expect(issueOf(asset({ nblOtherHasBuilding: true, nblOtherStateHistoryMode: "unchanged" }))).toBeNull();
    expect(issueOf(asset({ nblOtherRelatedBusinessType: "fish_farm_licensed" }))).toBeNull();
    expect(issueOf(asset({ acquisitionArea: "900", nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [built("2020-06-01")] }))).toBeNull();
  });
  it("축 B 둘째 이후 지분 카드(skip)는 요구하지 않는다", () => {
    expect(issueOf(asset(), { skip: true })).toBeNull();
  });
  it("none → 통과", () => {
    expect(issueOf(asset({ nblOtherHouseholdHouseStatus: "none" }))).toBeNull();
  });
  it("HH-2 owned인데 행 0건 → nblOtherHouseholdHousePeriods", () => {
    const r = issueOf(asset({ nblOtherHouseholdHouseStatus: "owned" }));
    expect(r?.field).toBe("nblOtherHouseholdHousePeriods");
    expect(r?.message).toMatch(/주택을 소유한 기간을 1건 이상 입력하세요/);
  });
  it("HH-3 행 결함은 ⑫′와 같은 leaf·같은 문구 — 시작일 빈칸 → .0.startDate · 종료일 역순 → .1.endDate · 양도일 이후 시작", () => {
    const base = { nblOtherHouseholdHouseStatus: "owned" as const };
    expect(issueOf(asset({ ...base, nblOtherHouseholdHousePeriods: [rowOf("")] }))?.field).toBe("nblOtherHouseholdHousePeriods.0.startDate");
    const rev = issueOf(asset({ ...base, nblOtherHouseholdHousePeriods: [rowOf("2020-01-01", "2021-01-01"), rowOf("2022-05-01", "2022-04-01")] }));
    expect(rev?.field).toBe("nblOtherHouseholdHousePeriods.1.endDate");
    expect(rev?.message).toMatch(/보다 빠릅니다/);
    expect(issueOf(asset({ ...base, nblOtherHouseholdHousePeriods: [rowOf("2024-02-01")] }))?.field).toBe("nblOtherHouseholdHousePeriods.0.startDate");
    expect(issueOf(asset({ ...base, nblOtherHouseholdHousePeriods: [rowOf("2020-01-01", "2020-01-01")] }))?.field).toBe("nblOtherHouseholdHousePeriods.0.endDate");
  });
  it("행 상한 — 단일 소스 상수 초과 시 같은 문구", () => {
    const rows = Array.from({ length: NBL_HOUSEHOLD_HOUSE_PERIODS_MAX + 1 }, (_, i) => rowOf(`20${String(10 + i).padStart(2, "0")}-01-01`, `20${String(10 + i).padStart(2, "0")}-06-01`));
    const r = issueOf(asset({ nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: rows }));
    expect(r?.message).toContain(nblHouseholdHousePeriodsCapMessage());
  });
  it("정상 행(종료일 비움 포함) → 통과", () => {
    expect(issueOf(asset({ nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [rowOf("2020-01-01", "2021-01-01"), rowOf("2022-01-01")] }))).toBeNull();
  });
});

describe("③ 복원 — 구 저장 13호 자산은 질문 미선택으로 남고(가정값 채움 금지) ⑧이 막는다", () => {
  const mig = (a: Record<string, unknown>) => {
    migrateNblB1Fields(a);
    return a;
  };
  it("칸이 없던 구 스냅샷 → status \"\" · 행 []  (\"none\"을 채우지 않는다)", () => {
    const a = mig({ nblOtherRelatedBusinessType: HO13 });
    expect(a.nblOtherHouseholdHouseStatus).toBe("");
    expect(a.nblOtherHouseholdHousePeriods).toEqual([]);
    expect(issueOf({ ...asset(), ...a } as AssetForm)?.field).toBe("nblOtherHouseholdHouseStatus");
  });
  it("허용값 밖 status → \"\" · 행은 문자열 칸만 보존 · 잘못된 날짜 문자열은 지우지 않는다(⑧이 막는다)", () => {
    const a = mig({ nblOtherHouseholdHouseStatus: "yes", nblOtherHouseholdHousePeriods: [{ startDate: "2020-13-45", endDate: 3 }, null, "x"] });
    expect(a.nblOtherHouseholdHouseStatus).toBe("");
    expect(a.nblOtherHouseholdHousePeriods).toEqual([{ startDate: "2020-13-45", endDate: "" }]);
  });
  it("유효 값은 그대로", () => {
    const a = mig({ nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [{ startDate: "2020-01-01", endDate: "" }] });
    expect(a.nblOtherHouseholdHouseStatus).toBe("owned");
    expect(a.nblOtherHouseholdHousePeriods).toEqual([{ startDate: "2020-01-01", endDate: "" }]);
  });
});

// ─── 격자: 호 × 꼬리 × 이력 × 의제 × 면적 ─────────────────────────────────
type Ho = typeof HO13 | "fish_farm_licensed" | "none";
type Mode = "" | "unchanged" | "unknown" | "changed";
interface Point { ho: Ho; tail: "bare" | "building"; mode: Mode; deemed: boolean; area: string }
const HOS: Ho[] = [HO13, "fish_farm_licensed", "none"];
const MODES: Mode[] = ["", "unchanged", "unknown", "changed"];
const GRID: Point[] = HOS.flatMap((ho) => (["bare", "building"] as const).flatMap((tail) => MODES.flatMap((mode) => [false, true].flatMap((deemed) => ["600", "900"].map((area) => ({ ho, tail, mode, deemed, area })))))) as Point[];

function pointAsset(p: Point, status: "none" | "owned"): AssetForm {
  const building = p.tail === "building";
  return asset({
    nblOtherRelatedBusinessType: p.ho,
    acquisitionArea: p.area,
    nblOtherHasBuilding: building,
    nblOtherStateHistoryMode: p.mode,
    nblOtherStateEvents: p.mode === "changed" ? [building ? built("2020-06-01") : removed("2023-06-01")] : [],
    ...(p.deemed ? { nblDeemedTransferReason: "auction" as const, nblDeemedTransferDate: "2023-12-01" } : {}),
    nblOtherHouseholdHouseStatus: status,
    nblOtherHouseholdHousePeriods: [rowOf("2014-01-02")],
  });
}
const sigOf = (a: AssetForm) => {
  const j = judgeNonBusinessLand(buildNblEngineInput(wire(a) as never)!, DEFAULT_NON_BUSINESS_LAND_RULES);
  return JSON.stringify({ nb: j.isNonBusinessLand, eff: j.effectiveBusinessDays, ratio: j.areaProportioning?.nonBusinessRatio ?? null, steps: j.judgmentSteps.map((s) => `${s.id}:${s.status}`), echo: j.periodEvaluation?.vacantLot !== undefined });
};

describe("parity 격자 96점 — 술어(④ 전송 · ⑧ 요구) ⟺ 행이 엔진 판정을 바꾼다 · ⑧ 통과 ⇒ ⑫ 400 없음 · ⑧ 차단 ⇒ 엔진이 읽는다", () => {
  it("격자 규모 96 · 술어 참 점이 존재한다(공허 검증 방지)", () => {
    expect(GRID.length).toBe(96);
    const reading = GRID.filter((p) => vacantLotHousePeriodsReadOf(pointAsset(p, "owned")));
    expect(reading.length).toBeGreaterThanOrEqual(10);
    expect(reading.every((p) => p.ho === HO13)).toBe(true);
  });

  it.each(GRID.map((p) => [`${p.ho} · 꼬리 ${p.tail} · 이력 "${p.mode}" · 의제 ${p.deemed ? "경매" : "없음"} · ${p.area}㎡`, p] as const))("%s", (_n, p) => {
    const read = vacantLotHousePeriodsReadOf(pointAsset(p, "owned"));
    // ① 술어 ⟺ 행이 엔진 판정을 바꾼다 (같은 폼의 «있습니다 + 행» vs «없습니다»)
    const changed = sigOf(pointAsset(p, "owned")) !== sigOf(pointAsset(p, "none"));
    expect(changed, `술어 ${read} ↔ 행이 판정을 ${changed ? "바꿈" : "안 바꿈"}`).toBe(read);
    // ② ⑧ 질문 요구 ⟺ 술어
    expect(issueOf(pointAsset(p, "none") /* 질문 응답 */) === null).toBe(true);
    const unanswered = { ...pointAsset(p, "none"), nblOtherHouseholdHouseStatus: "" as const };
    expect(issueOf(unanswered)?.field === "nblOtherHouseholdHouseStatus").toBe(read);
    // ③ ⑧ 통과(owned + 정상 행) → ④ raw의 ⑫ 행 검증 400 없음 (⑫′가 13호 + 행에서 구조를 본다)
    expect(issueOf(pointAsset(p, "owned"))).toBeNull();
    const parsed = nonBusinessLandRawSchema.safeParse(wire(pointAsset(p, "owned")));
    const hhIssues = parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] === "nblOtherHouseholdHousePeriods");
    expect(hhIssues).toEqual([]);
  });

  it("⑧만 차단하는 행(HH-1 질문 미응답 · HH-2 owned + 0행)은 ⑫ 200 — 직접 API는 행 없음 = 현행(Q-4 (가))", () => {
    const base = pointAsset({ ho: HO13, tail: "bare", mode: "", deemed: false, area: "600" }, "none");
    for (const a of [{ ...base, nblOtherHouseholdHouseStatus: "" as const }, { ...base, nblOtherHouseholdHouseStatus: "owned" as const, nblOtherHouseholdHousePeriods: [] }]) {
      expect(issueOf(a)).not.toBeNull();
      const parsed = nonBusinessLandRawSchema.safeParse(wire(a));
      expect(parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] === "nblOtherHouseholdHousePeriods")).toEqual([]);
    }
  });

  it("X12 연접 다필지(`nblOtherUseParcels`) + 13호 + 꼬리 나지 — 엔진이 행을 읽는다(행이 판정을 바꾼다 · UV-5 실측) → 술어 참 · ⑧ 요구 · ④ 전송이 같다", () => {
    const parcels = {
      nblOtherUseParcels: true,
      nblOtherParcels: [
        { id: "p1", landArea: "300", acquisitionDate: "2014-01-01", hasBuilding: false, buildingFootprintArea: "" },
        { id: "p2", landArea: "300", acquisitionDate: "2016-01-01", hasBuilding: false, buildingFootprintArea: "" },
      ],
    };
    const owned = asset({ ...parcels, nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [rowOf("2020-01-01")] });
    const none = asset({ ...parcels, nblOtherHouseholdHouseStatus: "none" });
    expect(vacantLotHousePeriodsReadOf(owned)).toBe(true);
    expect(sigOf(owned)).not.toBe(sigOf(none));
    expect(issueOf({ ...owned, nblOtherHouseholdHouseStatus: "" })?.field).toBe("nblOtherHouseholdHouseStatus");
    expect(wire(owned).nblOtherHouseholdHousePeriods).toEqual([{ startDate: "2020-01-01" }]);
  });

  it("X15 축 B 지분 번들 — 둘째 지분 레코드(`buildFractionalShareNblRecord`)의 ④ 와이어도 첫 카드의 행·술어를 그대로 싣고, ⑧은 둘째 이후 카드에서 요구하지 않는다(skip)", () => {
    const primary = asset({ ownershipNumerator: "50", ownershipDenominator: "100", nblOtherHouseholdHouseStatus: "owned", nblOtherHouseholdHousePeriods: [rowOf("2020-01-01", "2021-06-01")] });
    const share = { ...makeDefaultAsset(2), acquisitionDate: "2016-01-01", acquisitionCause: "purchase" as const, ownershipNumerator: "50", ownershipDenominator: "100" } as AssetForm;
    const rec = buildFractionalShareNblRecord(share, primary);
    expect(vacantLotHousePeriodsReadOf(rec)).toBe(true);
    expect(wire(rec).nblOtherHouseholdHousePeriods).toEqual([{ startDate: "2020-01-01", endDate: "2021-06-01" }]);
    expect(issueOf({ ...primary, nblOtherHouseholdHouseStatus: "" }, { skip: true })).toBeNull();
    expect(issueOf({ ...primary, nblOtherHouseholdHouseStatus: "" })?.field).toBe("nblOtherHouseholdHouseStatus");
  });

  it("행 도달 — ⑫ 침묵 strip 가드(UM-5): 술어 참 + owned의 행이 zod 통과 후에도 남는다", () => {
    const parsed = nonBusinessLandRawSchema.safeParse(wire(pointAsset({ ho: HO13, tail: "bare", mode: "", deemed: false, area: "600" }, "owned")));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as Record<string, unknown>).nblOtherHouseholdHousePeriods).toEqual([{ startDate: "2014-01-02" }]);
  });
});

describe("C-4 술어 확장(13호 선택 시 «이력을 읽지 않는가»를 묻는다)은 ⑧ H9·H10에 번지지 않는다 (UM-3)", () => {
  const houseRow = (date: string) => ({ kind: "building_removed" as const, date, propertyTaxTypeBefore: "" as const, buildingKindBefore: "house" as const, houseFootprintBefore: "" });
  const h = (over: Partial<AssetForm>) => validateNblStateHistory(asset(over), "자산", { transferDate: TRANSFER });
  const changed = { nblOtherStateHistoryMode: "changed" as const };

  it("주택 철거 행이 없으면 ⑧ 이력 검증이 요구할 칸이 없다 — 13호 800㎡·600㎡ 모두 null(확장이 H9·H10을 만들지 않는다)", () => {
    expect(h({ ...changed, acquisitionArea: "800", nblOtherStateEvents: [removed("2023-06-01")] })).toBeNull();
    expect(h({ ...changed, nblOtherStateEvents: [removed("2023-06-01")] })).toBeNull();
  });
  it("주택 철거 행 + 660㎡ 이내(엔진이 이력을 읽는다) → H9가 정착면적을 여전히 요구한다 — 확장이 요구를 건너뛰게 하지 않는다", () => {
    expect(h({ ...changed, nblOtherStateEvents: [houseRow("2021-01-01")] })).toMatch(/철거 직전 주택 정착면적/);
  });
  it("주택 철거 행 + 660㎡ 초과(13호는 core가 부분 면적 — 엔진이 이력을 읽지 않는다) → H9 요구 없음(확장 전후 같은 결과 — 종전 «주택 철거 행이 있을 때» 경로)", () => {
    expect(h({ ...changed, acquisitionArea: "800", nblOtherStateEvents: [houseRow("2021-01-01")] })).toBeNull();
  });
  it("확장은 표시 술어만 바꾼다 — 13호 + 800㎡ + changed는 «읽지 않음», 호 «해당 없음» + 주택 철거 행 없음은 종전대로 «해당 없음»", () => {
    expect(housePriorHistoryIgnoredOf(asset({ acquisitionArea: "800", ...changed, nblOtherStateEvents: [removed("2023-06-01")] }), TRANSFER)).toBe(true);
    expect(housePriorHistoryIgnoredOf(asset({ nblOtherRelatedBusinessType: "none", acquisitionArea: "800", ...changed, nblOtherStateEvents: [removed("2023-06-01")] }), TRANSFER)).toBe(false);
  });
});
