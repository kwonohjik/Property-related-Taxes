/**
 * NBL-STATE-HISTORY-E3-④ (E3e-0, 테스트만) — Pre-Do anchor. 지금 코드로 green이어야 한다(제품 코드 변경 0).
 *
 *   Anchor 1  일 단위 정답표: 계획서 §6 H·W·X 행과 UI 계획서 §1.3 시료(N0~D2 · R-8)를 `meetsPeriodCriteria`에 사업용 구간(`biz`)을 직접 넣어 일수·판정 고정(= 독립 오라클).
 *   현행 열  같은 입력을 **현행 엔진**(세대 주택 소유 칸 없음 · 13호는 꼬리 나지만)에 넣은 값 — 이 표가 왜 필요한가(`changes` 행이 현행과 갈린다). 구현 PR(E3e-1·2)이 `changes` 행을 신규 값으로 뒤집는다.
 *   Anchor 2  하위호환 골든: 13호 × 이력 `""`·`unchanged`·`unknown` × 나지·건물·900㎡ — 결과 객체 전체 + 세액 스냅샷. E3e-1·2 이후에도 **바이트 동일**(행 없음 = 현행 · Q-4 (가)).
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.engine.plan.md §2.2 · §6 · §7.1
 * 표: `_helpers/nbl-state-history-e3-4-table.ts` — 엔진·route·parity 격자 anchor가 같은 표를 쓴다. 측정값이 다르면 표를 맞추지 말고 원인을 먼저 본다.
 */
import { describe, it, expect } from "vitest";
import {
  E3E_ALL_ROWS,
  E3E_B,
  E3E_BARE_ROWS,
  E3E_HOUSE_ROWS,
  E3E_N,
  E3E_SWING,
  E3E_UI_ROWS,
  OS,
  e3eRowRaw,
  e3eTax,
  type E3eRow,
} from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-4-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { meetsPeriodCriteria } from "@/lib/tax-engine/non-business-land/period-criteria";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { GracePeriod, NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { NBL_STATE_AT_TRANSFER_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const row = (id: string) => E3E_ALL_ROWS.find((r) => r.id === id)!;

/** 오라클 — 사업용 구간(`biz`)과 유예 구간을 `meetsPeriodCriteria`(categoryGroup `other_land`)에 직접 넣는다. */
function evalRow(r: Pick<E3eRow, "acq" | "transfer" | "biz" | "graceIntervals">) {
  const grace: GracePeriod[] = (r.graceIntervals ?? []).map(([a, b]) => ({ reasonCode: "use_prohibited", startDate: d(a), endDate: d(b) }));
  return meetsPeriodCriteria(
    r.biz.map(([a, b]) => ({ start: d(a), end: d(b) })),
    d(r.acq ?? "2014-01-01"),
    d(r.transfer ?? "2024-01-01"),
    "other_land",
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

describe("E3e-0 Anchor 1 — 일 단위 정답표(오라클): 판정 · 일수", () => {
  it("표 규모·id 중복 없음 · 핵심 행 포함", () => {
    expect(new Set(E3E_ALL_ROWS.map((r) => r.id)).size).toBe(E3E_ALL_ROWS.length);
    for (const id of ["H0", "H1", "H1c", "H2", "H3", "H3a", "H3b", "H4", "H5", "H6", "X1", "X2", "X3", "W0", "W1", "W2", "W3", "W4a", "W4b", "W5", "W6", "W7", "W8", "N0", "N1", "N1b", "C1", "C1p", "C2", "C3", "C3p", "C4", "C5", "C6", "D1", "D2"])
      expect(E3E_ALL_ROWS.map((r) => r.id), id).toContain(id);
  });

  const reading = E3E_ALL_ROWS.filter((r) => r.reads);
  it.each(reading.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const res = evalRow(r);
    expect(res.meets).toBe(!r.expect.nonBusiness);
    expect(res.totalOwnershipDays).toBe(r.expect.total);
    expect(res.effectiveBusinessDays).toBe(r.expect.eff);
  });

  it("40% 경계 쌍: 신축 2020-01-02(H3a · 비사업 1,460 → 사업용) / 2020-01-01(H3b · 1,461 → 비사업용) · 주택 취득 2020-01-02(W1) / 2020-01-01(W2) — 한 쌍은 판정이 갈린다", () => {
    expect([evalRow(row("H3a")).meets, evalRow(row("H3b")).meets]).toEqual([true, false]);
    expect([evalRow(row("W1")).meets, evalRow(row("W2")).meets]).toEqual([true, false]);
    expect([evalRow(row("H3a")).nonBizTotal, evalRow(row("H3b")).nonBizTotal]).toEqual([1460, 1461]);
  });

  it("스윙: 2014 취득 거래 N − B = 55,750,000(실측)", () => {
    expect(E3E_SWING).toBe(55_750_000);
    expect(e3eTax(true) - e3eTax(false)).toBe(E3E_SWING);
  });
});

describe("E3e-0 현행 열 — 같은 입력을 **세대 주택 소유 칸 없이** 현행 엔진에 넣은 값(이 표가 왜 필요한가)", () => {
  it.each(E3E_ALL_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const input = fromRaw(e3eRowRaw(r, { houseRows: false }));
    const j = judge(input);
    expect(j.isNonBusinessLand, `${r.id} 판정`).toBe(r.current.nonBusiness);
    expect(j.effectiveBusinessDays, `${r.id} 일수`).toBe(r.current.eff);
    expect(j.periodEvaluation?.basis, `${r.id} basis`).toBe(r.current.basis);
    // 세액: 전량 판정이라 B 또는 N(부분 면적 H5·C5는 별도 — 안분 세액이라 제외)
    if (!j.areaProportioning || j.areaProportioning.nonBusinessRatio === 0 || j.areaProportioning.nonBusinessRatio === 1) {
      expect(taxOf(input), `${r.id} 세액`).toBe(e3eTax(r.current.nonBusiness));
    }
  });

  it("행을 **입력해도** 현행 엔진은 읽지 않는다 — W 행은 13호 선택 시 전부 B(칸이 없다)", () => {
    for (const r of E3E_HOUSE_ROWS.filter((x) => x.houseRows && x.houseRows.length > 0 && !x.tailBuilding)) {
      const j = judge(fromRaw(e3eRowRaw(r, { houseRows: true })));
      expect(j.isNonBusinessLand, r.id).toBe(false);
      expect(j.effectiveBusinessDays, r.id).toBe(3651);
    }
  });

  it("현행 값과 신규 오라클이 다른 행(스윙 대상)의 목록 — 표의 존재 이유", () => {
    const swing = E3E_ALL_ROWS.filter((r) => r.changes).map((r) => r.id);
    expect(swing).toEqual(["H2", "H3", "H3a", "H4", "X1", "X3", "W2", "W3", "W5b", "W6", "W7", "C3", "C4"]);
    // 판정(사업용↔비사업용)까지 뒤집히는 행
    const flipped = E3E_ALL_ROWS.filter((r) => r.changes && r.expect.nonBusiness !== r.current.nonBusiness).map((r) => r.id);
    expect(flipped).toEqual(["H2", "H3", "H3a", "H4", "W2", "W3", "W5b", "W6", "W7", "C3"]);
  });

  it("세액 스윙: 현행 N → 신규 B(H2) = −55,750,000 · 현행 B → 신규 N(W2·13호를 고른 뒤 주택 취득 2020-01-01) = +55,750,000", () => {
    const h2 = fromRaw(e3eRowRaw(row("H2")));
    expect(taxOf(h2)).toBe(E3E_N);
    expect(e3eTax(row("H2").expect.nonBusiness)).toBe(E3E_B);
    const w2 = fromRaw(e3eRowRaw(row("W2")));
    expect(taxOf(w2)).toBe(E3E_B);
    expect(e3eTax(row("W2").expect.nonBusiness)).toBe(E3E_N);
  });

  it("기존 e2 anchor가 고정한 13호 «꼬리만 사업용(214/3,651 비사업용)»은 H1 — 신규 모델에서도 불변(건물 구간은 나지가 아니다)", () => {
    expect(row("H1").expect).toEqual({ nonBusiness: true, eff: 214, total: 3651 });
    expect(row("H1").current).toMatchObject({ nonBusiness: true, eff: 214 });
    expect(row("H1").changes).toBe(false);
  });
});

describe("E3e-0 Anchor 2 — 하위호환 골든: 13호 × 이력 `\"\"`·`unchanged`·`unknown` (행 없음 = 현행 · 구현 후에도 바이트 동일)", () => {
  /** 13호 격자 — 나지 · 건물(종합합산) · 건물(별도합산) · 660 초과 나지 · 소유 단기. */
  const GRID: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["V01 나지 600㎡", {}],
    ["V02 건물 종합합산(13호 불인정)", { nblOtherHasBuilding: true, nblOtherPropertyTaxType: "comprehensive" }],
    ["V03 건물 별도합산(나목)", { nblOtherHasBuilding: true, nblOtherPropertyTaxType: "separate", nblOtherBuildingFloorArea: "250" }],
    ["V04 나지 900㎡(660 초과 — 부분 면적)", { acquisitionArea: "900" }],
    ["V05 나지 소유 단기(취득 2022-07-01)", { acquisitionDate: "2022-07-01" }],
    ["V06 나지 + 9호 유예", { nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2021-01-01" }] }],
  ];
  const MODES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ["미전송", {}],
    ["\"\"", { nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }],
    ["unchanged", { nblOtherStateHistoryMode: "unchanged", nblOtherStateEvents: [] }],
    ["unknown", { nblOtherStateHistoryMode: "unknown", nblOtherStateEvents: [] }],
  ];
  const base = (extra: Record<string, unknown>) => ({ ...e3eRowRaw(row("H0")), ...extra });
  const snapshotOf = (raw: Record<string, unknown>) => {
    const input = fromRaw(raw);
    return { judgment: judge(input), tax: taxOf(input) };
  };

  it.each(GRID.flatMap(([n, extra]) => MODES.map(([m, mode]) => [n, m, extra, mode] as const)))("%s × %s — 결과 객체 전체 + 세액 스냅샷", (name, modeName, extra, mode) => {
    const raw = base({ ...extra, ...mode });
    const { nblOtherStateHistoryMode: _m, ...rawWithoutMode } = raw;
    void _m;
    // 미전송은 칸 자체가 없는 입력(⑭가 이력을 싣지 않는다)
    const snap = snapshotOf(modeName === "미전송" ? { ...rawWithoutMode, nblOtherStateEvents: undefined } : raw);
    expect(JSON.parse(JSON.stringify(snap))).toMatchSnapshot(`${name.slice(0, 3)}-${modeName}`);
  });

  it("미전송·`\"\"`·`unchanged`는 서로 같은 결과 객체(고지만 `unchanged` 문구가 다르다 — 현행 그대로) · `unknown`은 고지 한 줄이 늘 뿐", () => {
    for (const [n, extra] of GRID) {
      const none = snapshotOf(base({ ...extra, nblOtherStateHistoryMode: "", nblOtherStateEvents: [] }));
      expect(none.judgment.warnings, n).toContain(NBL_STATE_AT_TRANSFER_APPLIED_NOTICE);
      const unknown = snapshotOf(base({ ...extra, nblOtherStateHistoryMode: "unknown", nblOtherStateEvents: [] }));
      expect(unknown.judgment.isNonBusinessLand, n).toBe(none.judgment.isNonBusinessLand);
      expect(unknown.tax, n).toBe(none.tax);
    }
  });
});

describe("E3e-0 표 분류 — 행 수", () => {
  it("나지 축 13 + 무주택 축 11 + UI 시료 13", () => {
    expect([E3E_BARE_ROWS.length, E3E_HOUSE_ROWS.length, E3E_UI_ROWS.length]).toEqual([13, 11, 13]);
    void OS;
  });
});
