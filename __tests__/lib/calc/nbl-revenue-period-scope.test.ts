/**
 * NBL-STATE-HISTORY-E3-② UI — ④⑤⑧이 같이 읽는 술어(`nbl-revenue-period-scope.ts`) · ⑤ 미리보기 · ③ 복원.
 * 계획서: docs/01-plan/features/nbl-state-history-e3-2-business-period.ui.plan.md §4.2 · §5
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset, migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { NBL_DEFAULTS } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { buildRevenuePeriodPreview } from "@/lib/calc/nbl-revenue-period-preview";
import {
  nblRevenuePeriodApplies,
  nblRevenuePeriodOn,
  revenuePeriodReadsYear,
  revenuePeriodRowYears,
  revenuePeriodWireFields,
  revenuePeriodWireRows,
} from "@/lib/calc/nbl-revenue-period-scope";

const T = "2024-06-30";
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  Object.assign({ ...makeDefaultAsset(1) }, {
    assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", acquisitionArea: "1000", addressJibun: "서울 강남구 테스트동 1",
    nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential", nblRevenueBusinessType: "parking_operation",
    nblRevenuePeriodOn: true,
  }, over) as AssetForm;
const rowsOf = (...years: number[]) => years.map((y) => ({ year: String(y), revenue: `${y}`, landValue: "100000000" }));

describe("술어 — 토글이 적용되는가 · 켜졌는가", () => {
  it("정밀판정 ON · 기타토지 · 업종 선택일 때만 적용된다", () => {
    expect(nblRevenuePeriodApplies(asset())).toBe(true);
    expect(nblRevenuePeriodApplies(asset({ nblUseDetailedJudgment: false }))).toBe(false);
    expect(nblRevenuePeriodApplies(asset({ nblLandType: "farmland" }))).toBe(false);
    expect(nblRevenuePeriodApplies(asset({ nblRevenueBusinessType: "" }))).toBe(false);
  });
  it("적용 ∧ 저장된 토글 — 저장값이 켜져 있어도 적용이 거짓이면 꺼진 것이다", () => {
    expect(nblRevenuePeriodOn(asset())).toBe(true);
    expect(nblRevenuePeriodOn(asset({ nblRevenuePeriodOn: false }))).toBe(false);
    expect(nblRevenuePeriodOn(asset({ nblRevenueBusinessType: "" }))).toBe(false);
  });
});

describe("표가 받는 연도 — 영위 범위 ∩ T−2 이전", () => {
  it("개시일 비움 = 소유 시작부터: 취득 2014 · 양도 2024 → 2014~2022(T−2)", () => {
    expect(revenuePeriodRowYears(asset(), T)).toEqual([2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022]);
  });
  it("개시일 2022-12-01 → 2022만(T−1·T는 기존 칸)", () => {
    expect(revenuePeriodRowYears(asset({ nblRevenueCurrentBusinessStartDate: "2022-12-01" }), T)).toEqual([2022]);
  });
  it("개시 2023(T−1) 이후 → 표 없음(기존 당해·직전 칸으로 충분)", () => {
    expect(revenuePeriodRowYears(asset({ nblRevenueCurrentBusinessStartDate: "2023-03-01" }), T)).toEqual([]);
  });
  it("폐업일은 영위 마지막 날(전날)까지: 2021-06-01 폐업 → 2014~2021 · 2021-01-01 폐업 → 2014~2020", () => {
    expect(revenuePeriodRowYears(asset({ nblRevenueBusinessEndDate: "2021-06-01" }), T).at(-1)).toBe(2021);
    expect(revenuePeriodRowYears(asset({ nblRevenueBusinessEndDate: "2021-01-01" }), T).at(-1)).toBe(2020);
  });
  it("취득연도 중간부터: 취득 2020-07-01 → 2020부터", () => {
    expect(revenuePeriodRowYears(asset({ acquisitionDate: "2020-07-01" }), T)[0]).toBe(2020);
  });
  it("OFF · 취득일/양도일 미입력 · 영위일 없는 입력 → []", () => {
    expect(revenuePeriodRowYears(asset({ nblRevenuePeriodOn: false }), T)).toEqual([]);
    expect(revenuePeriodRowYears(asset(), undefined)).toEqual([]);
    expect(revenuePeriodRowYears(asset({ acquisitionDate: "" }), T)).toEqual([]);
    expect(revenuePeriodRowYears(asset({ nblRevenueCurrentBusinessStartDate: "2025-01-01" }), T)).toEqual([]);
  });
});

describe("그 해의 기존 칸을 엔진이 읽는가 — 영위일이 있는 해만", () => {
  it("계속 영위: 당해·직전 모두 읽는다", () => {
    const a = asset({ nblRevenueCurrentBusinessStartDate: "2020-01-01" });
    expect(revenuePeriodReadsYear(a, T, "current")).toBe(true);
    expect(revenuePeriodReadsYear(a, T, "prior")).toBe(true);
  });
  it("폐업이 T−1(2023) 안 → 직전은 읽고 당해는 읽지 않는다", () => {
    const a = asset({ nblRevenueBusinessEndDate: "2023-06-01" });
    expect(revenuePeriodReadsYear(a, T, "prior")).toBe(true);
    expect(revenuePeriodReadsYear(a, T, "current")).toBe(false);
  });
  it("폐업이 T(2024) 안 → 둘 다 읽는다(그 해 영위일이 있다)", () => {
    const a = asset({ nblRevenueBusinessEndDate: "2024-03-01" });
    expect(revenuePeriodReadsYear(a, T, "current")).toBe(true);
    expect(revenuePeriodReadsYear(a, T, "prior")).toBe(true);
  });
  it("폐업일이 T 1월 1일 → 마지막 영위일 = 전년 12.31 → 당해는 읽지 않는다(경계)", () => {
    const a = asset({ nblRevenueBusinessEndDate: "2024-01-01" });
    expect(revenuePeriodReadsYear(a, T, "current")).toBe(false);
    expect(revenuePeriodReadsYear(a, T, "prior")).toBe(true);
  });
  it("폐업이 T−2 이전 → 둘 다 읽지 않는다", () => {
    const a = asset({ nblRevenueBusinessEndDate: "2021-06-01" });
    expect(revenuePeriodReadsYear(a, T, "current")).toBe(false);
    expect(revenuePeriodReadsYear(a, T, "prior")).toBe(false);
  });
  it("개시가 T(2024)면 직전은 읽지 않는다 — 영위일 없음", () => {
    const a = asset({ nblRevenueCurrentBusinessStartDate: "2024-02-01" });
    expect(revenuePeriodReadsYear(a, T, "prior")).toBe(false);
    expect(revenuePeriodReadsYear(a, T, "current")).toBe(true);
  });
  it("OFF·범위를 알 수 없으면 읽는다 = 현행 요구 유지(칸을 숨기거나 규칙을 건너뛰지 않는다)", () => {
    expect(revenuePeriodReadsYear(asset({ nblRevenuePeriodOn: false, nblRevenueBusinessEndDate: "2021-06-01" }), T, "current")).toBe(true);
    expect(revenuePeriodReadsYear(asset({ nblRevenueBusinessEndDate: "2021-06-01" }), undefined, "current")).toBe(true);
  });
});

describe("④ 전송 행 — 저장된 행 중 표가 받는 연도만(오름차순)", () => {
  it("범위 밖 연도는 보내지 않는다 · 순서 무관 저장 → 오름차순 전송 · 값은 그대로", () => {
    const a = asset({ nblRevenueCurrentBusinessStartDate: "2019-06-01", nblRevenueYearRows: rowsOf(2022, 2016, 2020, 2019, 2023, 2024) });
    expect(revenuePeriodWireRows(a, T).map((r) => r.year)).toEqual(["2019", "2020", "2022"]);
    expect(revenuePeriodWireRows(a, T)[0]).toEqual({ year: "2019", revenue: "2019", landValue: "100000000" });
  });
  it("개시일을 되돌리면 같은 저장 행이 복원돼 전송된다(값이 밀리지 않는다 — 연도 키)", () => {
    const rows = rowsOf(2016, 2017);
    expect(revenuePeriodWireRows(asset({ nblRevenueCurrentBusinessStartDate: "2019-06-01", nblRevenueYearRows: rows }), T)).toEqual([]);
    expect(revenuePeriodWireRows(asset({ nblRevenueCurrentBusinessStartDate: "", nblRevenueYearRows: rows }), T).map((r) => r.year)).toEqual(["2016", "2017"]);
  });
  it("와이어 3칸: ON이면 폐업일·행 · 술어 거짓이면 false·\"\"·[]로 덮는다", () => {
    const on = asset({ nblRevenueBusinessEndDate: "2021-06-01", nblRevenueYearRows: rowsOf(2020) });
    expect(revenuePeriodWireFields(on, T)).toEqual({ nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: "2021-06-01", nblRevenueYearRows: rowsOf(2020) });
    for (const off of [{ nblRevenuePeriodOn: false }, { nblRevenueBusinessType: "" as const }, { nblUseDetailedJudgment: false }, { nblLandType: "farmland" as const }]) {
      expect(revenuePeriodWireFields({ ...on, ...off } as AssetForm, T), JSON.stringify(off)).toEqual({ nblRevenuePeriodOn: false, nblRevenueBusinessEndDate: "", nblRevenueYearRows: [] });
    }
  });
});

describe("④ buildNonBusinessLandRaw — prefix-pick 뒤에서 덮어쓴다", () => {
  const full = (over: Partial<AssetForm> = {}) => asset({ nblRevenueBusinessEndDate: "2021-06-01", nblRevenueYearRows: rowsOf(2020, 2030), ...over });
  it("ON: 폐업일 + 범위 안 행만", () => {
    const raw = buildNonBusinessLandRaw(full(), T)!;
    expect(raw.nblRevenuePeriodOn).toBe(true);
    expect(raw.nblRevenueBusinessEndDate).toBe("2021-06-01");
    expect(raw.nblRevenueYearRows).toEqual(rowsOf(2020));
  });
  it("OFF: 저장된 stale 폐업일·행이 prefix-pick으로 닿지 않는다", () => {
    const raw = buildNonBusinessLandRaw(full({ nblRevenuePeriodOn: false }), T)!;
    expect(raw.nblRevenuePeriodOn).toBe(false);
    expect(raw.nblRevenueBusinessEndDate).toBe("");
    expect(raw.nblRevenueYearRows).toEqual([]);
  });
});

describe("③ 복원 — 새 키가 없던 기존 저장값", () => {
  it("키가 없는 구 저장값 → 꺼짐·빈 폐업일·빈 표(현행 경로) · 기존 값은 그대로", () => {
    const old = { nblRevenueBusinessType: "parking_operation", nblRevenueCurrentRevenue: "1,000,000", nblRevenueCurrentBusinessStartDate: "2022-01-01" };
    const restored = migrateAsset(old) as unknown as Record<string, unknown>;
    expect(restored.nblRevenuePeriodOn).toBe(false);
    expect(restored.nblRevenueBusinessEndDate).toBe("");
    expect(restored.nblRevenueYearRows).toEqual([]);
    expect(restored.nblRevenueCurrentRevenue).toBe("1,000,000");
    expect(restored.nblRevenueCurrentBusinessStartDate).toBe("2022-01-01");
  });
  it("형 방어: 토글·폐업일·표의 형이 틀리면 기본값 · 연도 4자리가 아닌 행 제거 · 같은 연도는 마지막 값 · 금액이 문자열이 아니면 빈 값", () => {
    const restored = migrateAsset({
      nblRevenuePeriodOn: "yes", nblRevenueBusinessEndDate: 20210601,
      nblRevenueYearRows: [{ year: "2020", revenue: "1", landValue: "2" }, { year: "20", revenue: "9", landValue: "9" }, null, { year: "2020", revenue: "5", landValue: 7 }],
    }) as unknown as Record<string, unknown>;
    expect(restored.nblRevenuePeriodOn).toBe(false);
    expect(restored.nblRevenueBusinessEndDate).toBe("");
    expect(restored.nblRevenueYearRows).toEqual([{ year: "2020", revenue: "5", landValue: "" }]);
  });
  it("저장된 켜짐·값은 보존한다", () => {
    const restored = migrateAsset({ nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: "2021-06-01", nblRevenueYearRows: rowsOf(2019, 2020) }) as unknown as Record<string, unknown>;
    expect(restored.nblRevenuePeriodOn).toBe(true);
    expect(restored.nblRevenueBusinessEndDate).toBe("2021-06-01");
    expect(restored.nblRevenueYearRows).toEqual(rowsOf(2019, 2020));
  });
  it("② 초기값: NBL_DEFAULTS = factory · 표 배열은 호출마다 새 인스턴스", () => {
    const a = makeDefaultAsset(1) as unknown as Record<string, unknown>;
    const b = makeDefaultAsset(2) as unknown as Record<string, unknown>;
    expect([a.nblRevenuePeriodOn, a.nblRevenueBusinessEndDate, a.nblRevenueYearRows]).toEqual([false, "", []]);
    expect(a.nblRevenueYearRows).not.toBe(b.nblRevenueYearRows);
    const d = NBL_DEFAULTS as unknown as Record<string, unknown>;
    expect([d.nblRevenuePeriodOn, d.nblRevenueBusinessEndDate, d.nblRevenueYearRows]).toEqual([false, "", []]);
  });
});

describe("⑤ 미리보기 — 엔진 leaf 그대로", () => {
  it("꺼짐 → null · 켜짐 → 연도별 판정(M9′: 2022·2023·2024 모두 충족)", () => {
    const base = asset({
      nblRevenueCurrentBusinessStartDate: "2022-12-01", nblRevenueCurrentRevenue: "2600000", nblRevenueCurrentLandValue: "100000000",
      nblRevenuePriorRevenue: "5000000", nblRevenuePriorLandValue: "100000000", nblRevenueYearRows: [{ year: "2022", revenue: "600000", landValue: "100000000" }],
    });
    expect(buildRevenuePeriodPreview({ ...base, nblRevenuePeriodOn: false }, T)).toBeNull();
    const p = buildRevenuePeriodPreview(base, T)!;
    expect(p.years.map((y) => [y.taxYear, y.source, y.known, y.pass])).toEqual([[2022, "row", true, true], [2023, "prior", true, true], [2024, "current", true, true]]);
    expect(p.operatingDays).toBe(577);
  });
  it("행이 비면 모름(불통과) — 자동 채움·가정값 없음", () => {
    const p = buildRevenuePeriodPreview(asset({ nblRevenueCurrentBusinessStartDate: "2022-12-01", nblRevenueCurrentRevenue: "2600000", nblRevenueCurrentLandValue: "100000000" }), T)!;
    expect(p.years.find((y) => y.taxYear === 2022)).toMatchObject({ known: false, pass: false });
    expect(p.unknownYears).toContain(2022);
  });
  it("취득일·양도일을 읽을 수 없으면 null", () => {
    expect(buildRevenuePeriodPreview(asset(), undefined)).toBeNull();
    expect(buildRevenuePeriodPreview(asset({ acquisitionDate: "" }), T)).toBeNull();
  });
});
