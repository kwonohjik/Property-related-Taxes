/**
 * NBL-STATE-HISTORY-E3-② (E3c-0, 테스트만) — Pre-Do anchor. 지금 코드로 green이어야 한다(제품 코드 변경 0).
 *
 *   Anchor 1  일 단위 정답표: 계획서 §5 행(M9′·M9-orig·M10′·M11′·C4·V7·B/A/L 임계쌍·C9~C12)을 `meetsPeriodCriteria`에 사업용 구간(`biz`)을 직접 넣어 일수·판정 고정.
 *   Anchor 2  하위호환 골든 + 현행 열: ① 같은 입력을 **영위 기간 OFF(키 없음)**로 돌린 현행 엔진 값(= 이 표가 왜 필요한가) ② OFF 판정 결과 객체 전체 스냅샷(E3c-1 이후에도 바이트 동일 — echo 키 부재 R-3).
 *   Anchor 4~7  E3c-1이 활성화한다(자리만 `todo`): 연도 판정 일반화 parity · ⑧↔⑫ parity 격자 · route 관통 · Q-15 교차.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-2-business-period.engine.plan.md §5 · §7.2 · «결정 기록 (2026-11-23 사용자)»
 * 표: `_helpers/nbl-state-history-e3-2-table.ts` — E3c-1의 leaf·엔진·route anchor가 같은 표를 쓴다.
 */
import { describe, it, expect } from "vitest";
import { E3C_ROWS, E3C_ON_ROWS, E3C_THRESHOLD_PAIRS, E3C_SWING_2014, E3C_SWING_V7, E3C_TRADE_TAX, e3cExpectedTax, e3cRowRaw, type E3cRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-2-table";
import { evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

const row = (id: string) => E3C_ROWS.find((r) => r.id === id)!;
const evalRow = (r: E3cRow) => evalDayRow({ acq: r.acq ?? "2014-01-01", transfer: r.transfer ?? "2024-06-30", biz: r.biz, grace: r.graceIntervals });
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
const taxOf = (input: NonBusinessLandInput) =>
  calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;

describe("E3c-0 Anchor 1 — §5 매트릭스: 판정 · 일수 (일 단위 정답표)", () => {
  it("표 규모·id 중복 없음 · 핵심 행 포함 · 표현 불가(C9)·반사실(V7a) 행만 ON 계층에서 빠진다", () => {
    expect(new Set(E3C_ROWS.map((r) => r.id)).size).toBe(E3C_ROWS.length);
    for (const id of ["M9p", "M9-orig", "M10p", "M11p", "M11p-10ho", "C4a", "C4b", "V7a", "V7b", "V7c", "V7d", "B-3.0M", "B-2.999M", "A-2515069", "A-2515068", "L-1000000", "L-999999", "C9", "C10a", "C10b", "C10c", "C11", "C12b"])
      expect(E3C_ROWS.map((r) => r.id), id).toContain(id);
    expect(E3C_ROWS.filter((r) => r.scope).map((r) => [r.id, r.scope])).toEqual([["V7a", "counterfactual"], ["C9", "oracle"]]);
    expect(E3C_ON_ROWS).toHaveLength(E3C_ROWS.length - 2);
  });

  it.each(E3C_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const res = evalRow(r);
    expect(res.meets).toBe(!r.expect.nonBusiness);
    expect(res.totalOwnershipDays).toBe(r.expect.total);
    expect(res.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.ownershipBucket).toBe(r.expect.bucket);
  });

  it("스윙: 거래별 전량 사업용 B와 전량 비사업용 N의 차이 — 2014 취득 거래 +55,750,000 · 2022-07 취득 거래 +69,750,000 · 단기 거래(2023-12-31 → 2024-06-30)는 세율이 지배해 0", () => {
    expect(E3C_TRADE_TAX["2014-01-01|2024-06-30"].N - E3C_TRADE_TAX["2014-01-01|2024-06-30"].B).toBe(E3C_SWING_2014);
    expect(E3C_TRADE_TAX["2022-07-01|2024-06-30"].N - E3C_TRADE_TAX["2022-07-01|2024-06-30"].B).toBe(E3C_SWING_V7);
    expect(E3C_TRADE_TAX["2022-12-31|2023-12-31"].N - E3C_TRADE_TAX["2022-12-31|2023-12-31"].B).toBe(47_760_000);
    expect(E3C_TRADE_TAX["2023-12-31|2024-06-30"].N - E3C_TRADE_TAX["2023-12-31|2024-06-30"].B).toBe(0);
    expect(E3C_TRADE_TAX["2021-01-01|2024-09-30"].N - E3C_TRADE_TAX["2021-01-01|2024-09-30"].B).toBe(65_550_000);
  });

  it("임계쌍 4개: 한 쌍은 판정이 갈리고(통과 / 불통과) 일수·영위 입력이 정확히 이웃이다", () => {
    for (const [pass, fail] of E3C_THRESHOLD_PAIRS) {
      const p = evalRow(row(pass));
      const f = evalRow(row(fail));
      expect([p.meets, f.meets], `${pass}/${fail}`).toEqual([true, false]);
      expect(row(pass).expect.nonBusiness).toBe(false);
      expect(row(fail).expect.nonBusiness).toBe(true);
    }
    // V-7 경계쌍은 영업 구간 1일 차이(731 / 730) — 개시일이 하루 늦다
    expect(evalDayRow({ acq: "2021-01-01", transfer: "2024-09-30", biz: row("V7c").biz }).effectiveBusinessDays - evalDayRow({ acq: "2021-01-01", transfer: "2024-09-30", biz: row("V7d").biz }).effectiveBusinessDays).toBe(1);
  });

  it("기대가 현행과 반대인 행 vs 일치하는 행 — 표의 존재 이유: 새 칸 없이는 표현할 수 없는 입력(반대 행)과 회귀 가드(일치 행)", () => {
    for (const id of ["M9p", "M9-orig", "M11p", "M11p-10ho", "C4b", "C10b", "C11", "C12b", "V7b", "V7d"]) {
      const r = row(id);
      expect(r.expect.nonBusiness, `${id} 기대`).not.toBe(r.current.nonBusiness);
    }
    for (const id of ["M10p", "C4a", "V7c", "B-3.0M", "B-2.999M", "A-2515069", "A-2515068", "L-1000000", "L-999999", "C10a"]) {
      const r = row(id);
      expect(r.expect.nonBusiness, `${id} 일치 행`).toBe(r.current.nonBusiness);
    }
  });
});

describe("E3c-0 Anchor 2 ① — 현행 열: 같은 입력(영위 기간 OFF)을 현행 엔진에 넣은 값 — E3c-1·2 이후에도 같다 (OFF 키 부재 = 바이트 동일)", () => {
  it.each(E3C_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const raw = e3cRowRaw(r, false);
    for (const key of ["nblRevenuePeriodOn", "nblRevenueBusinessEndDate", "nblRevenueYearRows"]) expect(raw, key).not.toHaveProperty(key);
    const input = fromRaw(raw);
    const j = judge(input);
    expect(j.isNonBusinessLand).toBe(r.current.nonBusiness);
    if (r.current.eff !== undefined) expect(j.effectiveBusinessDays).toBe(r.current.eff);
    expect(j.totalOwnershipDays).toBe(r.expect.total);
    const expected = e3cExpectedTax(r, r.current.nonBusiness);
    if (expected !== undefined) expect(taxOf(input)).toBe(expected);
  });

  it("현행과 기대의 세액 차이(과소/과대 해소): M9p·M9-orig·C10b·C11·C12b +55,750,000 · M11p·M11p-10ho·C4b −55,750,000 · V7b +69,750,000(OFF의 V7 B=257,010,000)", () => {
    const swing = (id: string) => {
      const r = row(id);
      return (e3cExpectedTax(r, r.expect.nonBusiness) ?? 0) - (e3cExpectedTax(r, r.current.nonBusiness) ?? 0);
    };
    for (const id of ["M9p", "M9-orig", "C10b", "C11", "C12b"]) expect(swing(id), id).toBe(E3C_SWING_2014);
    for (const id of ["M11p", "M11p-10ho", "C4b"]) expect(swing(id), id).toBe(-E3C_SWING_2014);
    expect(swing("V7b")).toBe(E3C_SWING_V7);
    for (const id of ["M10p", "C4a", "C10a"]) expect(swing(id), id).toBe(0);
  });
});

describe("E3c-0 Anchor 2 ② — 하위호환 골든: OFF 입력 판정 결과 객체(전 필드)와 세액을 스냅샷으로 고정 — E3c-1은 이 스냅샷을 **한 글자도** 바꾸지 않는다(OFF에서 echo·고지 키 부재)", () => {
  it("OFF 격자 전체(표 24행 + 영위 기간 칸 없음)", () => {
    const golden = Object.fromEntries(
      E3C_ROWS.map((r) => {
        const input = fromRaw(e3cRowRaw(r, false));
        return [r.id, { judgment: judge(input), tax: taxOf(input) }];
      }),
    );
    expect(JSON.parse(JSON.stringify(golden))).toMatchSnapshot();
  });

  it("영위 기간 칸을 싣지 않으면 엔진 입력에 `revenueHistory` 키가 없다 — 판정 객체에도 `periodEvaluation.revenueHistory`·E3-② 고지 키가 없다", () => {
    for (const r of E3C_ROWS) {
      const input = fromRaw(e3cRowRaw(r, false));
      expect(Object.keys(input), r.id).not.toContain("revenueHistory");
      const j = judge(input);
      expect(JSON.stringify(j), r.id).not.toContain("revenueHistory");
    }
  });
});

describe("E3c-0 — Anchor 4~7: E3c-1이 활성화한다 (자리)", () => {
  it.todo("Anchor 4 연도 판정 일반화 parity — `computeRevenueTest`를 연도 y 입력으로 부르는 래퍼가 T 입력에서 현행 결과와 모든 필드 동일 + 3% 경계쌍·연환산 경계쌍·윤년쌍 (revenue-history leaf)");
  it.todo("Anchor 5 ⑧↔⑫ parity 격자 — 영위 기간 칸(폐업일·연도 행) 격자에서 leaf 결과(문구 포함)가 ⑧·⑫ 호출에서 같다");
  it.todo("Anchor 6 route 관통 — raw(`nblRevenuePeriodOn`·`nblRevenueBusinessEndDate`·`nblRevenueYearRows`) → ⑫ → ⑭ → 엔진: M9p·M11p·C4b·C10b·C11 판정·세액 — ⑫ strip 가드");
  it.todo("Anchor 7 Q-15 교차 — 건축물 이력 × 업종 영위 기간 합집합이 중복 계상 없이 같은 일수(C11 + 겹치는 행) · `daMokAndNaMok` 호 probe에 영위 구간이 섞이지 않음");
  it("자리 표시 — ON 행 수(E3c-1이 활성화할 대상)", () => {
    expect(E3C_ON_ROWS.map((r) => r.id)).toEqual(["M9p", "M9-orig", "M10p", "M11p", "M11p-10ho", "C4a", "C4b", "V7b", "V7c", "V7d", "B-3.0M", "B-2.999M", "A-2515069", "A-2515068", "L-1000000", "L-999999", "C10a", "C10b", "C10c", "C11", "C12b"]);
  });
});
