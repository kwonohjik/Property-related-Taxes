/**
 * NBL-STATE-HISTORY-E3-⑤ E3f-1b — 꼬리(양도일 현재) 근거 «철거ㆍ멸실» **철거일 한도** + **면적 범위 문언 연혁 정정** anchor (엔진 · ⑭ 매퍼).
 *
 *   A  연혁 leaf 경계: 마지막 과세기준일 · W_max · 면적 문언 시행본(2024.6.1.) — 하루 전/당일 쌍.
 *   B  `isTailDemolishedClearlyExpired` 충분조건 — 계획서 K-11a/b · K-13 · K-14 경계 쌍 · 시행 전(2016.6.1. 전) · Invalid Date.
 *   C  `resolvePropertyTaxBasis` — 사유 순서(바닥면적 → 철거일 없음 → 기간 경과) · 양도일 생략 = 한도 안 봄(나대지 구간 선언 호출처).
 *   D  raw → ⑭ → 판정 → 세액: E3f-0 표 행(K-11a/b · K-12 · K-12a · K-13 · K-14 · D-1 · D-1a)을 직접 대조하고, 출처 ①(철거 행)·② 새 칸(K-15)·K-17(철거 행 우선)·K-18(근거가 «철거ㆍ멸실»이 아니면 바이트 동일).
 *   E  고지: 접힘 사유별 문구(기간 경과 · 철거일 없음) 1건 · 시행본 고지는 접히면 나오지 않는다 · 엔진 echo.
 *   F  면적 범위 문언 연혁(사용자 결정 2026-11-24 — 2024.6.1. 전 시행본에는 면적 제한 없음): E3f-1b 전 → 후 표(`E35_AREA_ROWS`) · 줄어드는 방향만 바뀐다 · 경계 쌍 2024-05-31/06-01.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.engine.plan.md v4 §5.3 · §7.2 · §1.3
 */
import { describe, it, expect } from "vitest";
import { E35_AREA_ROWS, E35_B, E35_N, E35_ROWS, e35Base, e35Tail } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-5-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import {
  demolishedAreaClauseApplies,
  demolishedStatusMaxMonths,
  lastPropertyTaxBaseDateOnOrBefore,
} from "@/lib/tax-engine/data/nbl-historical-values-era";
import {
  NBL_PTAX_DEMOLISHED_DATE_MISSING_NOTICE,
  NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE,
  demolishedStatusNotice,
  isTailDemolishedClearlyExpired,
} from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { propertyTaxBasisUnconfirmedNotice, resolvePropertyTaxBasis } from "@/lib/tax-engine/non-business-land/property-tax-basis";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { format, parseISO } from "@/lib/tax-engine/utc-date";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = parseISO;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
const taxOf = (input: NonBusinessLandInput) =>
  calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;
const row = (id: string) => E35_ROWS.find((r) => r.id === id)!;
const expired = (r: string, t: string) => isTailDemolishedClearlyExpired(d(r), d(t));
const echoOf = (j: ReturnType<typeof judge>) => (j as unknown as { propertyTaxBasis?: { outcome: string; effective: string; unconfirmedReason?: string } }).propertyTaxBasis;

describe("E3f-1b A — 연혁 leaf 경계 (하루 전/당일 쌍)", () => {
  it("양도일 이전(당일 포함) 마지막 과세기준일(6.1.) — 6.1. 당일은 그날 · 하루 전은 전년 6.1.", () => {
    const s = (t: string) => format(lastPropertyTaxBaseDateOnOrBefore(d(t))!, "yyyy-MM-dd");
    expect([s("2024-05-31"), s("2024-06-01"), s("2024-12-31"), s("2025-01-01"), s("2016-05-31"), s("2016-06-01")]).toEqual([
      "2023-06-01", "2024-06-01", "2024-06-01", "2024-06-01", "2015-06-01", "2016-06-01",
    ]);
    expect(lastPropertyTaxBaseDateOnOrBefore(d("not-a-date"))).toBeUndefined();
  });

  it("과세기준일 시행본의 최대 한시(개월): 2016.6.1. 전 0(시행 전) · 2016.6.1.~2024.5.31. 6 · 2024.6.1.~ 36(빈집정비 3년 — 일반 6개월·2026.6.1.~ 1년보다 길다)", () => {
    expect(["2015-06-01", "2016-05-31", "2016-06-01", "2023-06-01", "2024-05-31", "2024-06-01", "2026-06-01"].map((s) => demolishedStatusMaxMonths(d(s)))).toEqual([0, 0, 6, 6, 6, 36, 36]);
  });

  it("면적 범위 문언(영 §103의2 1호 후단 — 2024.5.28. 시행본)은 과세기준일 2024.6.1.~ 시행본부터: 양도 2024-05-31 ✗ · 2024-06-01 ✓ · 2016-06-01 ✗ · 2026-06-01 ✓ · 양도일 미입력·Invalid Date = 적용(입력 누락이 제한을 풀지 않는다)", () => {
    expect(["2016-05-31", "2016-06-01", "2023-12-31", "2024-05-31", "2024-06-01", "2026-06-01"].map((t) => demolishedAreaClauseApplies(d(t)))).toEqual([false, false, false, false, true, true]);
    expect(demolishedAreaClauseApplies(undefined)).toBe(true);
    expect(demolishedAreaClauseApplies(d("not-a-date"))).toBe(true);
  });
});

describe("E3f-1b B — `isTailDemolishedClearlyExpired` 충분조건 (경계 쌍)", () => {
  it("K-11a/K-11b: 철거 2022-12-01(철거일 + 6개월 = 과세기준일 2023-06-01 — «6개월이 지나지 않은»이 아님) → 지남 · 12-02 → 한시 안 (양도 2024-05-31)", () => {
    expect([expired("2022-12-01", "2024-05-31"), expired("2022-12-02", "2024-05-31")]).toEqual([true, false]);
  });

  it("K-13: 철거 후 첫 과세기준일이 아직 안 왔다(철거 2023-07-01 · 양도 2023-12-01 — 직전 과세기준일 2023-06-01 < 철거일) → 접지 않는다", () => {
    expect(expired("2023-07-01", "2023-12-01")).toBe(false);
    expect(expired("2023-06-01", "2023-12-01")).toBe(false); // 철거일 = 과세기준일: s ≥ r 이지만 r + 6개월 > s
  });

  it("K-14: 2024.6.1.~ 시행본은 W_max = 3년(빈집 가능성) — 철거 2022-12-01 · 양도 2024-06-01 → 접지 않는다 · 경계 철거 2021-06-01(+3년 = 2024-06-01 → 지남) / 2021-06-02(안)", () => {
    expect(expired("2022-12-01", "2024-06-01")).toBe(false);
    expect([expired("2021-06-01", "2024-06-01"), expired("2021-06-02", "2024-06-01")]).toEqual([true, false]);
  });

  it("양도일이 과세기준일 당일이어도 그날이 마지막 과세기준일(포함) · 하루 전이면 전년 — 철거 2022-12-01은 양도 2023-06-01(6개월 시행본)에서 지남, 2023-05-31에서는 직전 과세기준일 2022-06-01 < 철거일이라 안 지남", () => {
    expect([expired("2022-12-01", "2023-06-01"), expired("2022-12-01", "2023-05-31")]).toEqual([true, false]);
  });

  it("시행 전(과세기준일 2016.6.1. 전)은 한시 규정이 없어 판정하지 않는다(고지 `not_yet`과 같다) — 양도 2016-05-31 · 철거 아무리 오래전이어도 접지 않는다 · 2016-06-01 당일은 6개월 시행본 적용", () => {
    expect(expired("2000-01-01", "2016-05-31")).toBe(false);
    expect([expired("2015-12-01", "2016-06-01"), expired("2015-12-02", "2016-06-01")]).toEqual([true, false]);
  });

  it("D-1: 철거 6년 전 → 지남 · 철거 6일 전 → 안 / Invalid Date 어느 쪽이든 접지 않는다(입력 누락이 불리하게 작동하지 않는다)", () => {
    expect([expired("2018-01-01", "2024-01-01"), expired("2023-12-26", "2024-01-01")]).toEqual([true, false]);
    expect(isTailDemolishedClearlyExpired(d("not-a-date"), d("2024-01-01"))).toBe(false);
    expect(isTailDemolishedClearlyExpired(d("2018-01-01"), d("not-a-date"))).toBe(false);
  });
});

describe("E3f-1b C — `resolvePropertyTaxBasis` 해석 순서", () => {
  const facts = (over: Record<string, unknown> = {}) => ({ propertyTaxType: "separate" as const, hasBuilding: false, propertyTaxBasis: "demolished" as const, demolishedFloorArea: 400, ...over });

  it("바닥면적 없음이 먼저 → 철거일 없음 → 기간 경과 → 인정", () => {
    const T = d("2024-01-01");
    expect(resolvePropertyTaxBasis(facts({ demolishedFloorArea: undefined }), T)).toEqual({ kind: "unconfirmed", reason: "demolished_area_missing" });
    expect(resolvePropertyTaxBasis(facts({ demolishedFloorArea: undefined, demolishedOn: d("2018-01-01") }), T)).toEqual({ kind: "unconfirmed", reason: "demolished_area_missing" });
    expect(resolvePropertyTaxBasis(facts(), T)).toEqual({ kind: "unconfirmed", reason: "demolished_date_missing" });
    expect(resolvePropertyTaxBasis(facts({ demolishedOn: d("2018-01-01") }), T)).toEqual({ kind: "unconfirmed", reason: "demolished_period_elapsed" });
    expect(resolvePropertyTaxBasis(facts({ demolishedOn: d("2023-12-26") }), T)).toEqual({ kind: "demolished", floorArea: 400 });
  });

  it("양도일을 안 넘기면 한도를 보지 않는다(나대지 구간 선언 호출처 — 그곳은 `demolished`를 먼저 접는다) · 철거일 없어도 인정(종전과 같다)", () => {
    expect(resolvePropertyTaxBasis(facts())).toEqual({ kind: "demolished", floorArea: 400 });
    expect(resolvePropertyTaxBasis(facts({ demolishedOn: d("2000-01-01") }))).toEqual({ kind: "demolished", floorArea: 400 });
  });

  it("근거가 «철거ㆍ멸실»이 아니면 철거일은 읽히지 않는다(별도합산 + 공지상태 · 종합합산 선언 · 건축물 있음)", () => {
    const T = d("2024-01-01");
    expect(resolvePropertyTaxBasis(facts({ propertyTaxBasis: "vacant_state", demolishedOn: d("2000-01-01") }), T)).toEqual({ kind: "accepted", basis: "vacant_state" });
    expect(resolvePropertyTaxBasis(facts({ propertyTaxType: "comprehensive", demolishedOn: d("2000-01-01") }), T)).toEqual({ kind: "not_applicable" });
    expect(resolvePropertyTaxBasis(facts({ hasBuilding: true, demolishedOn: d("2000-01-01") }), T)).toEqual({ kind: "not_applicable" });
  });
});

describe("E3f-1b D — raw → ⑭ → 판정 → 세액 (E3f-0 표 · 출처 ① ②)", () => {
  it.each(["K-11a", "K-11b", "K-12", "K-12a", "K-13", "K-14", "D-1", "D-1a"].map((id) => [id, row(id)] as const))("%s — 철거 행 날짜가 출처 ① (새 칸 없음)", (_id, r) => {
    const input = fromRaw(r.raw);
    const j = judge(input);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([r.expect.nonBusiness, r.expect.eff, r.expect.total]);
    if (r.current.tax !== undefined) expect(taxOf(input)).toBe(r.current.tax);
  });

  it("9호 입력자 세액 불변(K-12a): 접어도 9호 2년이 철거 후 구간을 덮어 B 198,210,000 — 일수만 1,826 → 1,096으로 줄고 판정·세액은 같다 / 9호 없으면 N", () => {
    expect(taxOf(fromRaw(row("K-12a").raw))).toBe(E35_B);
    expect(taxOf(fromRaw(row("K-12").raw))).toBe(E35_N);
    expect(E35_N - E35_B).toBe(55_750_000);
  });

  it("K-15 출처 ② — 이력 없음(모드 `unchanged`·빈 값) + 근거 «철거ㆍ멸실» + 새 칸: 철거 6년 전이면 접힘(N) · 6일 전이면 인정(B) · 철거 행이 있는 같은 시나리오와 판정·세액이 같다", () => {
    const noHistory = (on: string, mode: string) => fromRaw(e35Tail("2018-01-01", "2024-01-01", undefined, { nblOtherStateHistoryMode: mode, nblOtherStateEvents: [], nblOtherDemolishedOn: on }));
    for (const mode of ["unchanged", ""]) {
      const old = noHistory("2018-01-01", mode);
      expect(old.landStateHistory?.events ?? []).toEqual([]);
      expect(old.otherLand?.demolishedOn).toEqual(d("2018-01-01"));
      expect([judge(old).isNonBusinessLand, taxOf(old)], mode).toEqual([true, E35_N]);
      const fresh = noHistory("2023-12-26", mode);
      expect([judge(fresh).isNonBusinessLand, taxOf(fresh)], mode).toEqual([false, E35_B]);
    }
    // 취득 전 철거(K-16b 취득일 이전 허용): 취득 2014-01-01 · 철거 2013-06-01 → 지남 → 접힘
    const beforeAcq = noHistory("2013-06-01", "unchanged");
    expect([judge(beforeAcq).isNonBusinessLand, echoOf(judge(beforeAcq))?.unconfirmedReason]).toEqual([true, "demolished_period_elapsed"]);
  });

  it("K-17 — 철거 행이 날짜를 대면 그 날짜가 이긴다(새 칸 stray는 읽히지 않는다): 행 2018-01-01(지남) + 새 칸 2023-12-26(안) → 접힘 · 행 2023-12-26 + 새 칸 2018-01-01 → 인정 · 엔진 입력 `demolishedOn`은 행 날짜", () => {
    const a = fromRaw(e35Tail("2018-01-01", "2024-01-01", undefined, { nblOtherDemolishedOn: "2023-12-26" }));
    expect(a.otherLand?.demolishedOn).toEqual(d("2018-01-01"));
    expect([judge(a).isNonBusinessLand, taxOf(a)]).toEqual([true, E35_N]);
    const b = fromRaw(e35Tail("2023-12-26", "2024-01-01", undefined, { nblOtherDemolishedOn: "2018-01-01" }));
    expect(b.otherLand?.demolishedOn).toEqual(d("2023-12-26"));
    expect([judge(b).isNonBusinessLand, taxOf(b)]).toEqual([false, E35_B]);
  });

  it("K-18 — 근거가 «철거ㆍ멸실»이 아닌 입력: `demolishedOn` 키가 없고 stray 새 칸 값은 읽히지 않는다(엔진 입력 바이트 동일)", () => {
    const base = (over: Record<string, unknown>) => e35Tail("2018-01-01", "2024-01-01", undefined, over);
    for (const over of [
      { nblOtherPropertyTaxBasis: "vacant_state" },
      { nblOtherPropertyTaxBasis: "" },
      { nblOtherPropertyTaxBasis: "unknown" },
      { nblOtherPropertyTaxType: "comprehensive" },
      { nblOtherStateHistoryMode: "" , nblOtherStateEvents: [], nblOtherPropertyTaxBasis: "vacant_state" },
    ]) {
      const plain = fromRaw(base(over));
      const stray = fromRaw(base({ ...over, nblOtherDemolishedOn: "2018-01-01" }));
      expect("demolishedOn" in (plain.otherLand ?? {}), JSON.stringify(over)).toBe(false);
      expect(stray.otherLand).toEqual(plain.otherLand);
      expect(judge(stray)).toEqual(judge(plain));
    }
  });

  it("꼬리에 건축물이 있으면(마지막 사건 = 신축 · 숨은 stale 근거) 철거일은 읽히지 않는다 — K-16e", () => {
    const raw = e35Base({
      nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: false, nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedFloorArea: "400", nblOtherDemolishedOn: "2018-01-01",
      nblOtherBuildingFloorArea: "250", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [{ kind: "building_removed", date: "2018-01-01", propertyTaxTypeBefore: "separate" }, { kind: "building_built", date: "2019-06-01", propertyTaxTypeBefore: "separate" }],
    });
    const input = fromRaw(raw);
    expect(input.otherLand?.hasBuilding).toBe(true);
    expect("demolishedOn" in (input.otherLand ?? {})).toBe(false);
    expect(echoOf(judge(input))).toBeUndefined();
  });
});

describe("E3f-1b E — 고지 · echo", () => {
  it("기간 경과로 접히면 echo `unconfirmed`·`demolished_period_elapsed` + 고지 1건(`NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE`) · 시행본 고지(`demolishedStatusNotice`)는 인정될 때만 나온다", () => {
    const folded = judge(fromRaw(row("K-12").raw));
    expect(echoOf(folded)).toMatchObject({ outcome: "unconfirmed", effective: "comprehensive", unconfirmedReason: "demolished_period_elapsed" });
    expect(folded.warnings.filter((w) => w === NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE)).toHaveLength(1);
    expect(folded.warnings).not.toContain(demolishedStatusNotice(d("2024-01-01")));
    const kept = judge(fromRaw(row("K-11b").raw));
    expect(echoOf(kept)).toMatchObject({ outcome: "accepted", effective: "separate" });
    expect(kept.warnings).toContain(demolishedStatusNotice(d("2024-05-31")));
    expect(kept.warnings).not.toContain(NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE);
  });

  it("엔진 직접 호출(철거일 없음)은 접는다 — `demolished_date_missing` + 안전망 고지(⑧·⑫가 먼저 막아 화면·API 경로는 도달하지 않는다)", () => {
    const raw = e35Tail("2023-12-26", "2024-01-01", undefined);
    const input = fromRaw(raw);
    const j = judge({ ...input, otherLand: { ...input.otherLand!, demolishedOn: undefined } });
    expect(echoOf(j)).toMatchObject({ outcome: "unconfirmed", unconfirmedReason: "demolished_date_missing" });
    expect(j.warnings.filter((w) => w === NBL_PTAX_DEMOLISHED_DATE_MISSING_NOTICE)).toHaveLength(1);
  });

  it("고지 문구: 조문 인용(상수) · 9호 입력 시 반영 · 확인 필요 / 일반 접힘 고지는 종전 문구 그대로(근거 확인 안내)", () => {
    expect(NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE).toContain("지방세법 §106 ① 2호 다목 + 지방세법 시행령 §103의2");
    for (const need of ["6개월", "빈집정비사업으로 철거된 빈집은 3년", "종합합산으로 판정", "(9호)", "확인 필요"]) expect(NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE, need).toContain(need);
    expect(propertyTaxBasisUnconfirmedNotice("별도합산", "demolished_period_elapsed")).toBe(NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE);
    expect(propertyTaxBasisUnconfirmedNotice("별도합산", "demolished_date_missing")).toBe(NBL_PTAX_DEMOLISHED_DATE_MISSING_NOTICE);
    expect(propertyTaxBasisUnconfirmedNotice("별도합산", "unknown")).toContain("재산세 과세내역(고지서)에서 근거를 확인해 선택하면");
  });
});

describe("E3f-1b F — 면적 범위 문언 연혁 정정 (2024.6.1. 전 시행본에는 면적 제한이 없다)", () => {
  it.each(E35_AREA_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const input = fromRaw(r.raw);
    const j = judge(input);
    expect([j.isNonBusinessLand, j.surcharge.nonBusinessAreaRatio, taxOf(input)]).toEqual([r.after.nonBusiness, r.after.ratio, r.after.tax]);
  });

  it("세액은 줄어드는 방향으로만 바뀐다 — 변경 전 ≥ 변경 후(K-31a 205,990,000 → 198,210,000 = −7,780,000) · 경계 쌍 K-31b(2024-05-31)/K-31c(2024-06-01)에서 갈린다", () => {
    for (const r of E35_AREA_ROWS) expect(r.after.tax, r.id).toBeLessThanOrEqual(r.before.tax);
    const a = E35_AREA_ROWS.find((r) => r.id === "K-31a")!;
    expect(a.before.tax - a.after.tax).toBe(7_780_000);
    const [b, c] = ["K-31b", "K-31c"].map((id) => E35_AREA_ROWS.find((r) => r.id === id)!);
    expect([b.after.nonBusiness, c.after.nonBusiness]).toEqual([false, true]);
    expect(c.after).toEqual(c.before);
  });

  it("배율 이내(바닥면적 400㎡ × 4 ≥ 1,000㎡)는 양도일과 무관하게 같다 — 연혁 정정은 면적 초과 시료에서만 효과가 난다", () => {
    for (const t of ["2024-05-31", "2024-06-01"]) {
      const j = judge(fromRaw(e35Tail("2024-03-01", t, "2021-06-02", {})));
      expect([j.isNonBusinessLand, j.surcharge.nonBusinessAreaRatio], t).toEqual([false, 0]);
    }
  });

  it("Step 0.6 단계 문구: 2024.6.1. 전 시행본은 «면적 제한을 적용하지 않고 … 확인 필요»(참고로 이후 시행본 허용 범위 · 초과분) · 이후 시행본은 종전 문구", () => {
    const stepOf = (t: string) => judge(fromRaw(e35Tail("2024-03-01", t, "2021-06-02", { nblOtherDemolishedFloorArea: "100" }))).judgmentSteps.find((s) => s.id === "other_demolished_multiplier")!;
    const before = stepOf("2024-05-31");
    expect(before.status).toBe("PASS");
    for (const need of ["면적 제한을 적용하지 않고 부속토지 1000㎡ 전체를 별도합산 범위로 봄", "허용 범위 400㎡", "초과분 600㎡", "확인 필요"]) expect(before.detail, need).toContain(need);
    const after = stepOf("2024-06-01");
    expect(after.status).toBe("FAIL");
    expect(after.detail).toContain("허용 400㎡ 초과분 600㎡는 별도합산 제외");
  });

  it("고지(`demolishedStatusNotice`): 2024.6.1. 전 시행본 고지는 «그 범위를 적용하지 않고 부속토지 전체를 별도합산 범위로 보았습니다» · 2024.6.1.~ 시행본에는 그 문장이 없다", () => {
    for (const t of ["2016-06-01", "2019-06-01", "2024-05-31"]) expect(demolishedStatusNotice(d(t)), t).toContain("그 범위를 적용하지 않고 부속토지 전체를 별도합산 범위로 보았습니다");
    for (const t of ["2024-06-01", "2026-06-01"]) expect(demolishedStatusNotice(d(t)), t).not.toContain("면적 범위 문언이 없어");
  });
});
