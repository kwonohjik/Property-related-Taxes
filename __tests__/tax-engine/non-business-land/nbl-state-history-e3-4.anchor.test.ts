/**
 * NBL-STATE-HISTORY-E3-④ (E3e-1 · E3e-2) — 엔진 anchor: raw 와이어 칸 → ⑭ 매퍼 → `judgeNonBusinessLand` → 세액. 케이스 표 H·W·X 행 + UI 시료 N0~D2 전 행.
 *
 * 계획서: docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.engine.plan.md §4 · §6 · §7.2(mutation P-1~P-9)
 * 표: `_helpers/nbl-state-history-e3-4-table.ts` — E3e-0 Pre-Do anchor(`nbl-state-history-e3-4.predo.anchor.test.ts`)가 오라클로 검증한 값과 같다. 측정값이 표와 다르면 표를 맞추지 말고 원인을 먼저 본다.
 *
 * mutation 대응: P-1 leaf `!hasBuilding` 필터 제거 = H1·C4 · P-2 무주택 교집합 제거 = X1 · P-3 660㎡ 가드 제거 = H6 · P-4 core13off 대신 core = H3(꼬리 건물 + 13호) ·
 *   P-5 합집합 대신 대체 = X2 · P-6 40% 경계 off-by-one = H3a/H3b · P-8 `markOwn` 13호 가드 제거 = H1 · P-9 행 없는데 `householdFreePeriods` 생성 = W0·H0 바이트 동일.
 */
import { describe, it, expect } from "vitest";
import {
  E3E_ALL_ROWS,
  E3E_BARE_ROWS,
  E3E_HOUSE_ROWS,
  E3E_UI_ROWS,
  VACANT_HO,
  e3eRowRaw,
  e3eTax,
  type E3eRow,
} from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-4-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import {
  NBL_STATE_AT_TRANSFER_APPLIED_NOTICE,
  NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE,
  NBL_STATE_HISTORY_APPLIED_NOTICE,
  NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE,
  NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE,
  NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE,
  NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE,
  NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE,
  NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE,
  NBL_VACANT_LOT_SELF_DECLARED_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
/** E3e-2(⑭ 세대 주택 소유 기간 배선)가 들어가기 전에는 행 입력 행(W·X1)을 건너뛴다 — E3e-2 커밋이 `true`로 바꾼다. */
const HOUSE_WIRED = false;
const rows = (list: readonly E3eRow[]) => list.filter((r) => HOUSE_WIRED || (r.houseRows?.length ?? 0) === 0);
const describeHouse = HOUSE_WIRED ? describe : describe.skip;
const row = (id: string) => E3E_ALL_ROWS.find((r) => r.id === id)!;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
const taxOf = (input: NonBusinessLandInput) =>
  calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;

/** 이 행에서 기대하는 basis — 세대 주택 소유 행을 읽은 이력 OFF 경로는 `usage_periods`(R-3), 그 밖에는 현행과 같다. */
const expectedBasis = (r: E3eRow): string => ((r.houseRows?.length ?? 0) > 0 && (r.mode ?? "changed") !== "changed" && !r.tailBuilding ? "usage_periods" : r.current.basis);
/** 13호 echo(`periodEvaluation.vacantLot`)가 실려야 하는 행. */
const hasEcho = (r: E3eRow): boolean => {
  const ho13 = (r.ho ?? VACANT_HO) === VACANT_HO;
  if (!ho13) return false;
  const mode = r.mode ?? "changed";
  const tailBuilding = r.events.length > 0 ? r.events[r.events.length - 1][0] === "building_built" : (r.tailBuilding ?? false);
  const over = Number(r.area ?? "600") > 660;
  if (mode === "changed" && r.reads) return !over; // 이력 경로 leaf
  return (r.houseRows?.length ?? 0) > 0 && !tailBuilding; // 이력을 쓰지 않는 경로 — core가 행을 읽을 때
};

describe("E3e-1·2 케이스 표 전 행 — raw → ⑭ → 엔진 → 세액 (오라클 표와 같은 값)", () => {
  it.each(rows(E3E_ALL_ROWS).map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r: E3eRow) => {
    const input = fromRaw(e3eRowRaw(r));
    const j = judge(input);
    expect(j.isNonBusinessLand, `${r.id} 판정`).toBe(r.expect.nonBusiness);
    expect(j.effectiveBusinessDays, `${r.id} 사업용 일수`).toBe(r.expect.eff);
    expect(j.totalOwnershipDays).toBe(r.expect.total);
    expect(j.periodEvaluation?.basis, `${r.id} basis`).toBe(expectedBasis(r));
    // 세액: 전량 판정이라 B 또는 N(부분 면적 H5·C5는 안분 세액이라 제외)
    if (!j.areaProportioning || j.areaProportioning.nonBusinessRatio === 0 || j.areaProportioning.nonBusinessRatio === 1) {
      expect(taxOf(input), `${r.id} 세액`).toBe(e3eTax(r.expect.nonBusiness));
    }
  });

  it("스윙 행의 세액이 현행과 다르다 — H2 N→B(−55,750,000)", () => {
    expect(taxOf(fromRaw(e3eRowRaw(row("H2"))))).toBe(198_210_000);
  });

  it("행을 싣지 않으면 현행(Q-4 (가)) — W2에서 행을 빼면 B(13호 선택 = 전 기간 무주택 자기선언)", () => {
    expect(taxOf(fromRaw(e3eRowRaw(row("W2"), { houseRows: false })))).toBe(198_210_000);
  });
});

describe("E3e-1 echo — `periodEvaluation.vacantLot`(R-3 최상위) · 구간 `vacantLotDays`(R-2)", () => {
  it.each(rows(E3E_ALL_ROWS).map((r) => [r.id, r] as const))("%s — echo 유무가 §4.5 규칙과 같다(13호 + 구간 경로 ≤660㎡ 또는 행을 읽은 core 경로)", (_id, r) => {
    const j = judge(fromRaw(e3eRowRaw(r)));
    const echo = j.periodEvaluation?.vacantLot;
    expect(echo !== undefined, `${r.id} echo`).toBe(hasEcho(r));
    // 이력 경로의 echo 일수 = 건축물 없는 구간 중 13호로 센 일수 = 구간별 `vacantLotDays` 합
    if (echo && j.periodEvaluation?.stateHistory) {
      const rows = j.periodEvaluation.stateHistory.intervals;
      const sumDays = echo.intervals.reduce((s, i) => s + i.days, 0);
      expect(echo.scope).toBe("bare_intervals");
      expect(rows.reduce((s, x) => s + (x.vacantLotDays ?? 0), 0), `${r.id} 구간별 합`).toBe(sumDays);
      for (const x of rows) if (x.hasBuilding) expect(x.vacantLotDays, `${r.id} 건축물 구간은 13호가 닿지 않는다(P-1)`).toBeUndefined();
      expect(sumDays).toBeLessThanOrEqual(j.totalOwnershipDays);
    }
    if (!echo && j.periodEvaluation?.stateHistory) {
      for (const x of j.periodEvaluation.stateHistory.intervals) expect("vacantLotDays" in x, `${r.id} 키 부재`).toBe(false);
    }
  });

  it("H2: 13호 구간 = 앞 나지 3,437일 + 꼬리(건물이라 제외)… 꼬리 건물 구간은 13호가 아니라 나목(별도합산)으로 사업용 — echo 13호 일수 3,437", () => {
    const j = judge(fromRaw(e3eRowRaw(row("H2"))));
    expect(j.periodEvaluation?.vacantLot?.intervals.map((i) => i.days)).toEqual([3437]);
    expect(j.periodEvaluation?.vacantLot?.houseOwnedDays).toBe(0);
  });

  it("H4: 나지 2구간(2,190 + 214)이 병합 없이 두 구간으로 — 구간표 건물 구간(1,248일)에는 vacantLotDays 키가 없다", () => {
    const j = judge(fromRaw(e3eRowRaw(row("H4"))));
    expect(j.periodEvaluation?.vacantLot?.intervals.map((i) => i.days)).toEqual([2190, 214]);
    const rows = j.periodEvaluation!.stateHistory!.intervals;
    expect(rows.map((x) => x.vacantLotDays)).toEqual([2190, undefined, 214]);
  });
});

describe("E3e-1 고지 — Q-5 (가) 변형 대체 · T-4 · D-2", () => {
  const w = (id: string) => judge(fromRaw(e3eRowRaw(row(id)))).warnings;

  it.each(["H1", "H1c", "H2", "H3", "H4", "C1", "C3", "C4", "X2"])("%s — 13호 구간 판정(≤660㎡)은 `APPLIED`를 13호 변형으로 대체한다(두 문구가 함께 실리지 않는다)", (id) => {
    const warnings = w(id);
    expect(warnings.filter((x) => x === NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE)).toHaveLength(1);
    expect(warnings).not.toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
    expect(warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    expect(warnings).not.toContain(NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE);
  });

  it("T-4: 꼬리가 건물이어도 구간별로 13호를 적용했으면 자기 선언 고지가 1회 실린다(core는 13호를 인정하지 않아 싣지 않는다) · 꼬리 나지는 core가 이미 실어 중복이 없다", () => {
    expect(w("H2").filter((x) => x === NBL_VACANT_LOT_SELF_DECLARED_NOTICE)).toHaveLength(1);
    expect(w("H4").filter((x) => x === NBL_VACANT_LOT_SELF_DECLARED_NOTICE)).toHaveLength(1);
  });

  it("D-2: 660㎡ 초과 + 꼬리 건물(H6) — 13호 기여 0 + 면적 고지 · `APPLIED`는 기존 문구 그대로", () => {
    const warnings = w("H6");
    expect(warnings).toContain(NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE);
    expect(warnings).toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
    expect(warnings).not.toContain(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
    expect(judge(fromRaw(e3eRowRaw(row("H6")))).periodEvaluation?.vacantLot).toBeUndefined();
  });

  it("H5(꼬리 나지 + 660㎡ 초과)는 부분 면적이라 이력 미적용 — 기존 `PARTIAL_AREA` 고지만 · 13호 변형·면적 고지 없음", () => {
    const warnings = w("H5");
    expect(warnings).toContain(NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE);
    expect(warnings).not.toContain(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
    expect(warnings).not.toContain(NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE);
  });

  it("13호가 아닌 호(C1p · C3p · 11호 D1 · D2)는 기존 `APPLIED` 그대로 · 13호 고지 없음(기존 상수 바이트 불변)", () => {
    for (const id of ["C1p", "C3p", "D1", "D2"]) {
      const warnings = w(id);
      expect(warnings, id).toContain(NBL_STATE_HISTORY_APPLIED_NOTICE);
      expect(warnings, id).not.toContain(NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE);
      expect(warnings, id).not.toContain(NBL_STATE_HISTORY_VACANT_LOT_AREA_NOTICE);
    }
  });

  it("재산세 구분 변경 사건이 있는 13호 이력은 TAX_CHANGE의 13호 짝으로 대체된다 · 13호가 아니면 기존 TAX_CHANGE", () => {
    const raw13 = {
      ...e3eRowRaw(row("H2")),
      nblOtherHasBuilding: false,
      nblOtherPropertyTaxType: "comprehensive",
      nblOtherBuildingFloorArea: "",
      nblOtherStateEvents: [
        { kind: "building_built", date: "2016-01-01" },
        { kind: "tax_type_changed", date: "2019-01-01", propertyTaxTypeBefore: "" },
        { kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" },
      ],
    };
    const j13 = judge(fromRaw(raw13));
    expect(j13.warnings).toContain(NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE);
    expect(j13.warnings).not.toContain(NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE);
    const jNone = judge(fromRaw({ ...raw13, nblOtherRelatedBusinessType: "none" }));
    expect(jNone.warnings).toContain(NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE);
    expect(jNone.warnings).not.toContain(NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE);
  });
});

describe("E3e-1 불변 경계 — H1 회귀 가드(T-1·P-8) · 일수 중복 제거(X2·V-8) · 호 없음", () => {
  it("H1: 건물 구간(2014-01-02~2023-06-01 종합합산)은 13호 구간이 아니다 — 비사업용 유지 · 사업용 214일(꼬리)", () => {
    const j = judge(fromRaw(e3eRowRaw(row("H1"))));
    expect([j.isNonBusinessLand, j.effectiveBusinessDays]).toEqual([true, 214]);
    expect(j.periodEvaluation?.vacantLot?.intervals.map((i) => i.days)).toEqual([214]);
  });

  it("X2: 신축 앞 나지 구간을 E3-1b 선언(accepted)과 13호가 둘 다 사업용으로 선언해도 일수는 1배다(3,651 — 합집합)", () => {
    const j = judge(fromRaw(e3eRowRaw(row("X2"))));
    expect(j.effectiveBusinessDays).toBe(3651);
    expect(j.effectiveBusinessDays).toBeLessThanOrEqual(j.totalOwnershipDays);
    const rows = j.periodEvaluation!.stateHistory!.intervals;
    expect(rows[0].basisOutcome).toBe("accepted");
    expect(rows[0].vacantLotDays).toBe(rows[0].days); // 13호도 같은 구간을 센다 — 대체가 아니라 합집합
  });

  it("호만 바꾼 대조: H2에서 13호 → 호 없음이면 현행 값(꼬리 214 · N) — 13호 선택이 이제 효과가 있다", () => {
    const on = judge(fromRaw(e3eRowRaw(row("H2"))));
    const off = judge(fromRaw({ ...e3eRowRaw(row("H2")), nblOtherRelatedBusinessType: "none" }));
    expect([on.isNonBusinessLand, on.effectiveBusinessDays]).toEqual([false, 3651]);
    expect([off.isNonBusinessLand, off.effectiveBusinessDays]).toEqual([true, 214]);
  });
});

describeHouse("E3e-2 세대 주택 소유 기간 — 행을 읽는 경로 · 읽지 않는 경로", () => {
  it("W 행: 이력 OFF·`unchanged`·`unknown` 모두 같은 행을 읽는다(Q-3 (가) — 이력과 무관) · basis `usage_periods` + echo `whole_period`", () => {
    for (const id of ["W1", "W2", "W6", "W7"]) {
      const j = judge(fromRaw(e3eRowRaw(row(id))));
      expect(j.periodEvaluation?.basis, id).toBe("usage_periods");
      expect(j.periodEvaluation?.vacantLot?.scope, id).toBe("whole_period");
      expect(j.periodEvaluation?.stateHistory, id).toBeUndefined();
    }
    const w2 = judge(fromRaw(e3eRowRaw(row("W2")))).periodEvaluation!.vacantLot!;
    expect(w2.intervals.map((i) => i.days)).toEqual([2190]);
    expect(w2.houseOwnedDays).toBe(1461);
  });

  it("W0·H0(행 없음)은 바이트 동일 — 행 키가 없는 입력과 빈 배열 입력이 같은 결과(Q-4 (가) · P-9)", () => {
    for (const id of ["W0", "H0", "N0", "N1", "C6"]) {
      const a = judge(fromRaw(e3eRowRaw(row(id))));
      const b = judge(fromRaw({ ...e3eRowRaw(row(id)), nblOtherHouseholdHousePeriods: [] }));
      expect(JSON.parse(JSON.stringify(b)), id).toEqual(JSON.parse(JSON.stringify(a)));
      expect(a.periodEvaluation?.vacantLot, id).toBeUndefined();
    }
  });

  it("W 행 고지: `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`를 변형으로 대체 · 자기 선언 고지는 기존 그대로 + 보강 고지", () => {
    const warnings = judge(fromRaw(e3eRowRaw(row("W2")))).warnings;
    expect(warnings).toContain(NBL_STATE_AT_TRANSFER_VACANT_LOT_HOUSE_PERIODS_APPLIED_NOTICE);
    expect(warnings).not.toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
    expect(warnings.filter((x) => x === NBL_VACANT_LOT_SELF_DECLARED_NOTICE)).toHaveLength(1);
    expect(warnings.filter((x) => x === NBL_VACANT_LOT_HOUSE_PERIODS_NOTICE)).toHaveLength(1);
  });

  it("W8: 꼬리 건물 + 이력 OFF — 호 요건 실패(건축물 있음)라 행을 읽지 않는다(echo 없음 · 13호 불인정 판정 그대로)", () => {
    const j = judge(fromRaw(e3eRowRaw(row("W8"))));
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.periodEvaluation?.vacantLot).toBeUndefined();
  });

  it("종료일 빈칸 = 양도일까지(D-7): W5b(종료일 = 양도일 명시)는 W2(빈칸)와 같은 값", () => {
    const a = judge(fromRaw(e3eRowRaw(row("W2"))));
    const b = judge(fromRaw(e3eRowRaw(row("W5b"))));
    expect([b.isNonBusinessLand, b.effectiveBusinessDays]).toEqual([a.isNonBusinessLand, a.effectiveBusinessDays]);
  });

  it("행이 겹쳐도 병합된다(엔진 병합) — 같은 행 두 번 = 한 번 · 소유기간 앞에서 시작한 행은 잘린다", () => {
    const dup = judge(fromRaw({ ...e3eRowRaw(row("W2")), nblOtherHouseholdHousePeriods: [{ startDate: "2020-01-01" }, { startDate: "2021-01-01", endDate: "2022-01-01" }] }));
    expect(dup.effectiveBusinessDays).toBe(2190);
    const early = judge(fromRaw({ ...e3eRowRaw(row("W2")), nblOtherHouseholdHousePeriods: [{ startDate: "2010-01-01", endDate: "2014-01-02" }, { startDate: "2020-01-01" }] }));
    expect(early.effectiveBusinessDays).toBe(2190);
  });

  it("행 + 유예(9호): 유예는 무주택 기간에 합집합 — W2에 유예 2020-01-01~2021-01-01을 얹으면 사업용 일수가 늘고 유예 후 판정이 사업용으로 뒤집힐 수 있다(유예 단독 재판정이 사업용 구간을 버리지 않는다)", () => {
    const withGrace = judge(fromRaw({ ...e3eRowRaw(row("W2")), nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "2020-01-01", endDate: "2021-01-01" }] }));
    expect(withGrace.effectiveBusinessDays).toBeGreaterThan(2190);
    expect(withGrace.gracePeriodDays).toBeGreaterThan(0);
    // 비사업 1,461 − 유예 366 = 1,095 ≤ 1,460.4 → 사업용
    expect(withGrace.isNonBusinessLand).toBe(false);
  });

  it("행 + 이력 `changed`: X1 — 행은 이력 구간 leaf에서도 같은 무주택 기간으로 읽는다(주택 소유 2023-01-01~ → 꼬리 나지 214일 제외)", () => {
    const j = judge(fromRaw(e3eRowRaw(row("X1"))));
    expect(j.periodEvaluation?.vacantLot?.intervals.map((i) => i.days)).toEqual([2190]);
    expect(j.periodEvaluation?.vacantLot?.houseOwnedDays).toBe(365); // 2023-01-01 ~ 2024-01-01
  });
});

describe("표 규모", () => {
  it("나지 축 13 + 무주택 축 11 + UI 시료 13 = 37 · E3e-1은 행 입력이 없는 행만 돈다", () => {
    expect(rows(E3E_ALL_ROWS).length).toBe(HOUSE_WIRED ? 37 : 37 - 11);
    expect([E3E_BARE_ROWS.length, E3E_HOUSE_ROWS.length, E3E_UI_ROWS.length]).toEqual([13, 11, 13]);
  });
});
