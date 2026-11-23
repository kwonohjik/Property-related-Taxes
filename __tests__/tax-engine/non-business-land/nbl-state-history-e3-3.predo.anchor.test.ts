/**
 * NBL-STATE-HISTORY-E3-③ (E3d-0, 테스트만) — Pre-Do anchor. 지금 코드로 green이어야 한다(제품 코드 변경 0).
 *
 *   Anchor 1  일 단위 정답표: 계획서 §6.1 A 행을 `meetsPeriodCriteria`에 사업용 구간(`biz`)을 직접 넣어 일수·판정 고정 + 기타토지 E2 신축 행과 «같은 일수» parity +
 *             §6.2 배율 판정 경계(`getHousingMultiplier` → `areaTimes` → `judgeAreaLimit` 직접 호출) + B 행의 «위장 실측» 연결(E2 표).
 *   현행 열  같은 입력을 **이력 칸 없이**(= 현행 엔진이 이력을 읽지 않던 때와 같은 입력) 넣은 값 — 전부 `not_judged` 사업용(이 표가 왜 필요한가). E3d-1 이후에도 «이력을 쓰지 않는 입력»의 값이다.
 *   Anchor 2  하위호환 골든: 주택부수토지 행 × 모드 4종 — `judgeNonBusinessLand` 결과 객체 전체 + 세액(E3d-1 이후 `unknown`만 고지 한 줄이 늘고 나머지는 바이트 동일).
 *   Anchor 3  Q-3a (나) 보존: 초과분 + 이력 `changed`는 판정·세액·echo가 현행과 같다(E3d-1은 `PARTIAL_AREA` 고지만 더한다).
 *   Anchor 4  T-1(뒤집힘 + `areaProportioning` 유지) — E3d-0에서는 skip, **E3d-1이 활성화했다**(`nbl-state-history-e3-3.anchor.test.ts`에 같은 단언 + 변형).
 *   Anchor 12 `judgeHousingLand` 결과 객체(steps·warnings·echo) 격자 스냅샷 — `housing-limit.ts` 추출 전후 바이트 동일.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §2.1 · §6 · §7.2
 * 표: `_helpers/nbl-state-history-e3-3-table.ts` — E3d-1의 leaf·엔진·route anchor가 같은 표를 쓴다.
 */
import { describe, it, expect } from "vitest";
import {
  E3D_A_ROWS,
  E3D_HOUSE_LIMIT_ROWS,
  E3D_SWING_2014,
  E3D_TRADE_TAX,
  OS,
  e3dARowRaw,
  e3dTradeTax,
  type E3dARow,
} from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-3-table";
import { E2_ROWS, e2RowRaw } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e2-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { GRID, MODES } from "@/__tests__/tax-engine/_helpers/nbl-state-history-grid";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { areaTimes, judgeAreaLimit } from "@/lib/tax-engine/area-limit";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { meetsPeriodCriteria } from "@/lib/tax-engine/non-business-land/period-criteria";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { GracePeriod, NonBusinessLandInput, ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE, NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE, NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const row = (id: string) => E3D_A_ROWS.find((r) => r.id === id)!;

/** 오라클 — 사업용 구간(`biz`)과 유예 구간을 `meetsPeriodCriteria`(categoryGroup `housing`)에 직접 넣는다. */
function evalHouseRow(r: Pick<E3dARow, "acq" | "transfer" | "biz" | "graceIntervals">) {
  const grace: GracePeriod[] = (r.graceIntervals ?? []).map(([a, b]) => ({ reasonCode: "use_prohibited", startDate: d(a), endDate: d(b) }));
  return meetsPeriodCriteria(
    r.biz.map(([a, b]) => ({ start: d(a), end: d(b) })),
    d(r.acq ?? "2014-01-01"),
    d(r.transfer ?? "2024-01-01"),
    "housing",
    R,
    grace,
  );
}

const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
const taxOf = (input: NonBusinessLandInput) =>
  calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;

describe("E3d-0 Anchor 1 — §6.1 A 행: 판정 · 일수 (일 단위 정답표)", () => {
  it("표 규모·id 중복 없음 · 핵심 행 포함", () => {
    expect(new Set(E3D_A_ROWS.map((r) => r.id)).size).toBe(E3D_A_ROWS.length);
    for (const id of ["M15", "M15b", "M15c", "M15d", "M8a", "M8b", "G1", "M8c-731", "M8c-730", "H3", "H3b", "H3c", "H3d", "H3e", "H3f", "H8", "H8b", "H9", "M13p", "P3p", "P2-1", "P2-2", "P3-clip"])
      expect(E3D_A_ROWS.map((r) => r.id), id).toContain(id);
  });

  it.each(E3D_A_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const res = evalHouseRow(r);
    expect(res.meets).toBe(!r.expect.nonBusiness);
    expect(res.totalOwnershipDays).toBe(r.expect.total);
    expect(res.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.ownershipBucket).toBe(r.expect.bucket);
  });

  it("M15 핵심 수치: 사업 214 · 직전5년 비사업 1,612 > 730 · 직전3년 비사업 881 > 365 · 총 비사업 3,437 > 1,460 (가·나·다 모두 충족 = 비사업용)", () => {
    const r = evalHouseRow(row("M15"));
    expect([r.nonBizInWindow5, r.nonBizInWindow3, r.nonBizTotal]).toEqual([1612, 881, 3437]);
  });

  it("경계쌍: 나목 365/366(M8a/M8b) · 윤일 낀 창 731/730(M8c) — 한 쌍은 판정이 갈린다", () => {
    expect([evalHouseRow(row("M8a")).meets, evalHouseRow(row("M8b")).meets]).toEqual([true, false]);
    expect([evalHouseRow(row("M8c-731")).meets, evalHouseRow(row("M8c-730")).meets]).toEqual([true, false]);
  });

  it("스윙: 거래별 B와 N의 차이 — 2014 취득 거래 +55,750,000 · 2022-07 취득 단기(729일) +69,750,000 · 2022-07 취득 547일 +47,760,000", () => {
    const t = (k: string) => E3D_TRADE_TAX[k].N - E3D_TRADE_TAX[k].B;
    expect(t("2014-01-01|2024-01-01")).toBe(E3D_SWING_2014);
    expect(t("2014-01-01|2024-06-30")).toBe(E3D_SWING_2014);
    expect(t("2022-07-01|2024-06-30")).toBe(69_750_000);
    expect(t("2022-07-01|2023-12-31")).toBe(47_760_000);
  });

  it("기타토지 E2 신축 행과 **같은 일수** parity — 주택 구간 = 사업용 · 나대지 구간 = 비사업용이라 구간 구조가 같다(오라클이 이미 검증된 표를 재사용)", () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [["M15", "M6"], ["M15b", "M6b"], ["M15c", "M7"], ["M8a", "M8a"], ["M8b", "M8b"], ["M8c-731", "M8c-731"], ["M8c-730", "M8c-730"], ["G1", "G1"], ["M13p", "M13"], ["P3p", "P3"]];
    for (const [aId, eId] of pairs) {
      const a = row(aId);
      const e = E2_ROWS.find((r) => r.id === eId)!;
      expect(a.expect.eff, `${aId}↔${eId} eff`).toBe(e.expect.eff);
      expect(a.expect.total, `${aId}↔${eId} total`).toBe(e.expect.total);
      expect(a.expect.nonBusiness, `${aId}↔${eId} 판정`).toBe(e.expect.nonBusiness);
    }
  });

  it("OS(소유 첫날)는 취득일 다음날이다 — 표의 첫 구간 시작", () => {
    expect(OS).toBe("2014-01-02");
  });
});

describe("E3d-0 현행 열 — 같은 입력을 **이력 칸 없이** 넣은 값: 현행 엔진은 이력을 읽지 않으므로 전부 `not_judged` 사업용 (이 표가 왜 필요한가)", () => {
  it.each(E3D_A_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const withoutHistory = fromRaw(e3dARowRaw(r, { history: false }));
    expect(Object.keys(withoutHistory), r.id).not.toContain("landStateHistory");
    const j = judge(withoutHistory);
    expect(j.isNonBusinessLand).toBe(r.current.nonBusiness);
    expect(j.periodEvaluation?.basis).toBe("not_judged");
    expect(j.warnings).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    const tax = e3dTradeTax(r, false);
    if (tax !== undefined) expect(taxOf(withoutHistory), r.id).toBe(tax);
  });

  it("기대와 현행이 반대인 행(과소 해소 대상) vs 일치하는 행 — 표의 존재 이유", () => {
    const flipIds = E3D_A_ROWS.filter((r) => r.expect.nonBusiness !== r.current.nonBusiness).map((r) => r.id);
    expect(flipIds).toEqual(["M15", "M15b", "M15c", "M15d", "M8b", "G1", "M8c-730", "H3c", "H3d", "H3e", "H3f", "H8", "H9", "M13p", "P3p", "P2-1", "P2-2"]);
    const sameIds = E3D_A_ROWS.filter((r) => r.expect.nonBusiness === r.current.nonBusiness).map((r) => r.id);
    expect(sameIds).toEqual(["M8a", "M8c-731", "H3", "H3b", "H8b", "P3-clip"]);
  });

  it("세액 변동(과소 해소): 2014 취득 거래 N − B = 55,750,000", () => {
    const r = row("M15");
    expect(e3dTradeTax(r, true)! - e3dTradeTax(r, false)!).toBe(E3D_SWING_2014);
    expect(taxOf(fromRaw(e3dARowRaw(r, { history: false })))).toBe(198_210_000);
  });
});

describe("E3d-0 §6.2 배율 판정 경계 — 현행 함수(`getHousingMultiplier` → `areaTimes` → `judgeAreaLimit`) 직접 호출 (E3d-1이 `judgeHousingLimit`으로 추출해도 같다)", () => {
  it.each(E3D_HOUSE_LIMIT_ROWS.map((r) => [r.id, r] as const))("%s", (_id, r) => {
    const { multiplier } = getHousingMultiplier(r.zone as ZoneType, r.metro, d(r.transfer));
    const allowed = areaTimes(r.footprint, multiplier);
    const limit = judgeAreaLimit(r.landArea, allowed);
    expect(multiplier).toBe(r.expect.multiplier);
    expect(allowed).toBe(r.expect.allowedArea);
    expect(limit.within).toBe(r.expect.within);
    expect(limit.excess).toBe(r.expect.excess);
  });
});

describe("E3d-0 B 행 연결 — 기타토지 카드 철거 행의 «위장 실측»(E2 표)과 «모름·종합합산 현행» (B1~B4 · Z · GA · P2)", () => {
  const e2 = (id: string) => E2_ROWS.find((r) => r.id === id)!;
  /** E2 행의 철거 행 `propertyTaxTypeBefore`만 바꿔 현행 엔진에 넣는다. */
  const withBefore = (id: string, before: "" | "separate" | "comprehensive") => {
    const r = e2(id);
    return judge(fromRaw(e2RowRaw({ ...r, events: r.events.map((e) => (e[0] === "building_removed" ? ["building_removed", e[1], before] : e)) as never })));
  };

  it("위장(`separate`)은 E2 표 그대로(회귀 가드 B1′): 이내 판정된 주택 구간은 이 값을 그대로 내야 한다", () => {
    for (const id of ["M1", "M2", "M3", "M4", "Z-1462", "Z-1461", "Z-1460", "GA-730", "GA-731", "P2"]) {
      const j = withBefore(id, "separate");
      expect(j.isNonBusinessLand, id).toBe(e2(id).expect.nonBusiness);
      expect(j.effectiveBusinessDays, id).toBe(e2(id).expect.eff);
    }
  });

  it("현행(철거 직전 구분 모름 · 종합합산): B1 N · B2 **B**(유예 단독 730) · B3 N · B4 N · Z N · GA N · P2 N — 주택 구간을 사업용으로 세는 모델이 도입되면 B1·B3·B4·Z-1460·GA-731이 아닌 GA-730·P2도 사업용이 된다", () => {
    const expected: Record<string, boolean> = { M1: true, M2: false, M3: true, M4: true, "Z-1462": true, "Z-1461": true, "Z-1460": true, "GA-730": true, "GA-731": true, P2: true };
    for (const [id, nonBusiness] of Object.entries(expected)) {
      expect(withBefore(id, "").isNonBusinessLand, `${id} 모름`).toBe(nonBusiness);
      expect(withBefore(id, "comprehensive").isNonBusinessLand, `${id} 종합합산`).toBe(nonBusiness);
    }
  });
});

describe("E3d-0 Anchor 2 — 하위호환 골든: 주택부수토지 격자 × 모드 4종", () => {
  type Housing = NonBusinessLandInput;
  const housing = (over: Partial<Housing> = {}): Housing =>
    ({ landType: "housing_site", landArea: 500, zoneType: "general_residential", acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"), housingFootprint: 100, isMetropolitanArea: false, businessUsePeriods: [], gracePeriods: [], ...over }) as Housing;
  const grace = (start: string, end: string): GracePeriod => ({ reasonCode: "use_prohibited", startDate: d(start), endDate: d(end) });

  /** 이내 · 초과 · 정착면적 0 · 유예 · 수도권 미입력 · 별장 REDIRECT · 축 B 지분 · 이월과세(수증일 취득) · 소유 0일 · 도시지역 밖(10배). */
  const HOUSING_GRID: Record<string, Housing> = {
    "H01 이내(500㎡ · 정착 100 · 5배)": housing(),
    "H02 초과(1,000㎡ → 허용 500 · 초과 500)": housing({ landArea: 1000 }),
    "H03 정착면적 0 → 전량 비사업용": housing({ housingFootprint: 0 }),
    "H04 이내 + 유예(2014-01-02~2024-01-01)": housing({ gracePeriods: [grace("2014-01-02", "2024-01-01")] }),
    "H05 초과 + 전 기간 유예(D1)": housing({ landArea: 1000, gracePeriods: [grace("2014-01-02", "2024-01-01")] }),
    "H06 초과 + 유예 일부(2014~2022)": housing({ landArea: 1000, gracePeriods: [grace("2014-01-02", "2022-01-01")] }),
    "H07 수도권 미입력(보수적 3배 + 경고) 이내": housing({ isMetropolitanArea: undefined, landArea: 300 }),
    "H08 수도권 3배(주·상·공)에서 초과(400 > 300)": housing({ isMetropolitanArea: true, landArea: 400 }),
    "H09 양도 2021-12-31 수도권 5배(종전) 이내": housing({ isMetropolitanArea: true, landArea: 500, transferDate: d("2021-12-31") }),
    "H10 녹지 수도권 5배 이내": housing({ zoneType: "green", isMetropolitanArea: true }),
    "H11 도시지역 밖(관리) 10배 이내": housing({ zoneType: "management", landArea: 1000 }),
    "H12 축 B 지분2(취득 2020-01-01 · 소유 1,460일)": housing({ acquisitionDate: d("2020-01-01") }),
    "H13 축 B 지분3(취득 2021-06-01 · 소유 943일)": housing({ acquisitionDate: d("2021-06-01") }),
    "H14 이월과세 시나리오 B(취득일 = 수증일 2023-12-01)": housing({ acquisitionDate: d("2023-12-01") }),
    "H15 소유 0일(취득 2023-12-31 · 양도 2024-01-01)": housing({ acquisitionDate: d("2023-12-31") }),
    "H16 별장 REDIRECT → 주택부수토지 재분류": { landType: "villa_land", landArea: 500, zoneType: "general_residential", acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"), housingFootprint: 100, isMetropolitanArea: false, villa: { villaUsePeriods: [], isEupMyeon: false, isRuralHousing: false }, businessUsePeriods: [], gracePeriods: [] } as unknown as Housing,
  };
  const snapshotOf = (nbl: Housing) => ({ judgment: judge(nbl), tax: taxOf(nbl) });

  it("격자 규모 ≥ 12 · 이내 행이 있다(E0 골든 격자의 주택부수토지 행은 초과 1행뿐이었다 — 엔진 계획서 §7.1 P-2)", () => {
    expect(Object.keys(HOUSING_GRID).length).toBeGreaterThanOrEqual(12);
    expect(Object.values(HOUSING_GRID).filter((g) => judge(g).areaProportioning?.nonBusinessRatio === 0).length).toBeGreaterThan(5);
  });

  it.each(Object.entries(HOUSING_GRID))("%s — 결과 객체 전체 + 세액 스냅샷", (name, input) => {
    expect(JSON.parse(JSON.stringify(snapshotOf(input)))).toMatchSnapshot(name.slice(0, 3));
  });

  const same = Object.entries(HOUSING_GRID).flatMap(([name, input]) => MODES.slice(1, 3).map(([modeName, extra]) => [name, modeName, input, extra] as const));
  it.each(same)("%s × %s — 미전송과 결과 객체 전체가 같다(`\"\"`·`unchanged`는 영구히 현행)", (_n, _m, input, extra) => {
    expect(snapshotOf({ ...input, ...extra } as Housing)).toEqual(snapshotOf(input));
  });

  const unknown = Object.entries(HOUSING_GRID).map(([name, input]) => [name, input, MODES[3][1]] as const);
  it.each(unknown)("%s × unknown — 배율 **이내**(전량 사업용 core)에서만 `UNKNOWN` 고지 한 줄이 늘고 나머지(판정·steps·echo·세액)는 미전송과 같다 · 정착면적 0·초과·별장 REDIRECT 등 이내 분기 밖은 전부 같다", (name, input, extra) => {
    const base = snapshotOf(input);
    const got = snapshotOf({ ...input, ...extra } as Housing);
    // E3d-1 — 이내 분기 후처리(`applyHousingStateHistory`)는 `unknown`일 때 고지 1줄만 더한다. 이내 분기를 타는 행 = 안분 echo가 있고 비율 0이며 core 사업용인 행(재분류된 별장 H16 포함 — 별장은 이력 칸을 싣지 않지만 엔진 입력에 직접 넣으면 같은 후처리를 탄다).
    const isWithin = base.judgment.periodEvaluation?.basis === "not_judged" && base.judgment.areaProportioning?.nonBusinessRatio === 0 && !base.judgment.isNonBusinessLand;
    expect(got.judgment.warnings.filter((w) => w === NBL_STATE_HISTORY_UNKNOWN_NOTICE), name).toHaveLength(isWithin ? 1 : 0);
    expect({ ...got, judgment: { ...got.judgment, warnings: got.judgment.warnings.filter((w) => w !== NBL_STATE_HISTORY_UNKNOWN_NOTICE) } }, name).toEqual(base);
  });

  it("E0 격자의 타 지목(주택부수토지 초과 G19 · 농지 G20)도 모드와 무관하다 — 기존 compat anchor와 같은 값을 여기서도 확인", () => {
    for (const [name, input] of Object.entries(GRID).filter(([n]) => n.startsWith("G19") || n.startsWith("G20"))) {
      for (const [, extra] of MODES.slice(1)) expect(snapshotOf({ ...input, ...extra } as Housing), name).toEqual(snapshotOf(input));
    }
  });
});

describe("E3d-0 Anchor 3 — Q-3a (나) 보존: 양도일 현재 배율 초과 + 이력 `changed`는 판정·세액·echo가 현행과 같다 (S1·S2·S3)", () => {
  const rawExcess = (extra: Record<string, unknown> = {}) => ({
    ...e3dARowRaw(row("M15")),
    acquisitionArea: "1000", // 허용 500 → 초과 500㎡
    ...extra,
  });
  /** `PARTIAL_AREA` 고지만 뺀 판정 — E3d-1이 `changed`일 때 이 한 줄을 더한다. */
  const stripPartial = (j: ReturnType<typeof judge>) => ({ ...j, warnings: j.warnings.filter((w) => w !== NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE) });

  it("S1: 초과 + 신축 앞 나대지 — 현행과 같은 판정(비율 0.5)·세액 199,720,000", () => {
    const withHistory = fromRaw(rawExcess());
    const without = fromRaw({ ...rawExcess(), nblOtherStateHistoryMode: "", nblOtherStateEvents: [] });
    expect(stripPartial(judge(withHistory))).toEqual(stripPartial(judge(without)));
    expect(judge(withHistory).areaProportioning?.nonBusinessRatio).toBe(0.5);
    expect(taxOf(withHistory)).toBe(taxOf(without));
    expect(taxOf(withHistory)).toBe(199_720_000);
  });

  it("S2: 초과 + 전 기간 유예(D1) — 사업용 유지(HG-1 보존)", () => {
    const raw = rawExcess({ nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2014-01-02", endDate: "2024-01-01" }] });
    const withHistory = fromRaw(raw);
    const without = fromRaw({ ...raw, nblOtherStateHistoryMode: "", nblOtherStateEvents: [] });
    expect(judge(withHistory).isNonBusinessLand).toBe(false);
    expect(stripPartial(judge(withHistory))).toEqual(stripPartial(judge(without)));
    expect(taxOf(withHistory)).toBe(taxOf(without));
  });

  it("S3: 정착면적 0 + 이력 — 현행과 같다(전량 비사업용 253,960,000 · 이력 미사용)", () => {
    const raw = e3dARowRaw(row("M15"));
    const withHistory = fromRaw({ ...raw, nblHousingFootprint: "0" });
    const without = fromRaw({ ...raw, nblHousingFootprint: "0", nblOtherStateHistoryMode: "", nblOtherStateEvents: [] });
    expect(judge(withHistory).isNonBusinessLand).toBe(true);
    expect(judge(withHistory)).toEqual(judge(without));
    expect(taxOf(withHistory)).toBe(253_960_000);
  });
});

describe("E3d-0 Anchor 4 — T-1: 이내 core를 비사업용으로 뒤집으며 `areaProportioning`(비율 0)을 유지하면 판정은 비사업용인데 세액은 사업용 (E3d-1이 활성화)", () => {
  it("M15(E3d-1 활성): 판정 비사업용 · `areaProportioning` 없음 · `nonBusinessAreaRatio === 1` · 세액 N 253,960,000 — 뒤집을 때 `areaProportioning = undefined`", () => {
    const j = judge(fromRaw(e3dARowRaw(row("M15"))));
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.areaProportioning).toBeUndefined();
    expect(j.surcharge.nonBusinessAreaRatio).toBe(1);
    expect(taxOf(fromRaw(e3dARowRaw(row("M15"))))).toBe(253_960_000);
  });
});

describe("E3d-0 Anchor 12 — `judgeHousingLand` 결과 객체(steps·warnings·echo) 격자 스냅샷 (`housing-limit.ts` 추출 전후 바이트 동일)", () => {
  type Housing = NonBusinessLandInput;
  const housing = (over: Partial<Housing> = {}): Housing =>
    ({ landType: "housing_site", landArea: 500, zoneType: "general_residential", acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"), housingFootprint: 100, isMetropolitanArea: false, businessUsePeriods: [], gracePeriods: [], ...over }) as Housing;
  const L: Record<string, Housing> = {
    이내: housing(),
    초과: housing({ landArea: 1000 }),
    "수도권 미제공(보수 기본값 경고)": housing({ isMetropolitanArea: undefined }),
    "수도권 3배 이내(333.34)": housing({ isMetropolitanArea: true, landArea: 1000, housingFootprint: 333.34 }),
    "수도권 3배 초과(333.33)": housing({ isMetropolitanArea: true, landArea: 1000, housingFootprint: 333.33 }),
    "양도 2021-12-31(종전 5배)": housing({ isMetropolitanArea: true, landArea: 1000, housingFootprint: 200, transferDate: d("2021-12-31") }),
    "양도 2022-01-01(3배)": housing({ isMetropolitanArea: true, landArea: 1000, housingFootprint: 200, transferDate: d("2022-01-01") }),
    "녹지 수도권": housing({ zoneType: "green", isMetropolitanArea: true, landArea: 1000, housingFootprint: 200 }),
    "관리(도시 밖) 10배": housing({ zoneType: "management", landArea: 1000, housingFootprint: 100 }),
    "미지정 10배": housing({ zoneType: "undesignated", landArea: 1000, housingFootprint: 100 }),
    "정착면적 0": housing({ housingFootprint: 0 }),
    "초과 + 유예": housing({ landArea: 1000, gracePeriods: [{ reasonCode: "use_prohibited", startDate: d("2014-01-02"), endDate: d("2024-01-01") }] }),
    "수용 양도 이내": housing({ unconditionalExemption: { isPublicExpropriation: true } } as Partial<Housing>),
  };

  it.each(Object.entries(L))("%s — 판정 결과 객체 전체", (name, input) => {
    expect(JSON.parse(JSON.stringify(judge(input)))).toMatchSnapshot(name);
  });

  it("경계 판정값(스냅샷과 별개로 고정): 이내/초과/수도권 보수 기본값 경고", () => {
    expect(judge(L["이내"]).areaProportioning).toMatchObject({ nonBusinessRatio: 0, buildingMultiplier: 5 });
    expect(judge(L["초과"]).areaProportioning).toMatchObject({ nonBusinessArea: 500, nonBusinessRatio: 0.5 });
    expect(judge(L["수도권 미제공(보수 기본값 경고)"]).warnings.some((w) => w.includes("수도권 여부(isMetropolitanArea) 미제공"))).toBe(true);
    expect(judge(L["수도권 3배 이내(333.34)"]).areaProportioning?.nonBusinessRatio).toBe(0);
    expect(judge(L["수도권 3배 초과(333.33)"]).areaProportioning?.nonBusinessArea).toBe(0.01);
  });
});
