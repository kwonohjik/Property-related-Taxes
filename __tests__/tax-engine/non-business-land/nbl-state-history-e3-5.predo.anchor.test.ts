/**
 * NBL-STATE-HISTORY-E3-⑤ (E3f-0, 테스트만) — Pre-Do anchor. 지금 코드로 green이어야 한다(제품 코드 변경 0).
 *
 *   Anchor 1  오라클 표: 계획서 §7 행의 사업용 구간(`biz`)을 `meetsPeriodCriteria`에 직접 넣어 일수·판정 고정(제안 모델 적용 후의 기대).
 *             계획서 수치(774 · 592 · 578 · 760/761 · 425/609 · 1,462/1,096 · 943 · 547 · 1,094 · 365/1,096)와 전부 대조한다.
 *   Anchor 2  현행 엔진 실측: 같은 행을 raw → ⑭ → 판정 → 세액으로 돌린 값(`current`)을 고정하고, 오라클과 다른 행(`flipsIn`)을 PR별로 못 박는다.
 *             **E3f-1b가 반전했다** — 종전 «현행 결함 고정»(꼬리 근거 «철거ㆍ멸실»이 철거일을 읽지 않아 철거 6년 뒤에도 사업용 B 198,210,000)은 이제 «철거일을 읽는다»(6년 뒤 N 253,960,000 · 6일 뒤 B)로 바뀌었다.
 *   Anchor 3  6개월·1년 한시는 9호에 포함된다(격자 — 판정·일수 뒤집힘 0) · 빈집 3년만 9호가 덮지 못하는 셀이 있다.
 *   Anchor 4  나대지 구간 선언의 근거 `demolished` 현행 접힘(`demolished_unsupported`) · 선택지 제외 — **E3f-2가 반전하는 단언**(V-7 예고). 고지 «1년» 고정(F-1)·항 번호 단언은 **E3f-1a가 반전했다**(아래 «반전 완료»).
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.engine.plan.md v4 §3 · §7 · §8 «E3f-0»
 * 표: `_helpers/nbl-state-history-e3-5-table.ts` — E3f-1a·1b·2의 anchor가 같은 표를 쓴다.
 *
 * ⚠️ 반전 규칙(`feedback_shared_assertion_reversal_erases_sibling_net`): `flipsIn`이 붙은 행의 `current` 단언은 그 PR이 오라클 값으로 갱신한다. 같은 행의 오라클(`expect`)·형제 행(K-11b·K-12a·K-13·K-14 — 접지 않는 정합 시료)은
 * 바꾸지 않는다. 아래 «PR별 뒤집힘 id 목록» 단언이 그 PR의 변경 범위를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { E35_ROWS, E35_B, E35_N, E35_SWING, e35Base, e35Tail } from "@/__tests__/tax-engine/_helpers/nbl-state-history-e3-5-table";
import { evalDayRow } from "@/__tests__/tax-engine/_helpers/nbl-state-history-day-table";
import { baseTransferInput, makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { demolitionGraceYears } from "@/lib/tax-engine/data/nbl-historical-values-era";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { eventBasisOptions } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { propertyTaxBasisOptions } from "@/lib/tax-engine/non-business-land/property-tax-basis";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { addDays, addMonths, addYears, format, isBefore, parseISO } from "@/lib/tax-engine/utc-date";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const fromRaw = (raw: Record<string, unknown>) => buildNblEngineInput(raw as never)!;
const judge = (input: NonBusinessLandInput) => judgeNonBusinessLand(input, R);
function taxOf(input: NonBusinessLandInput): number {
  return calculateTransferTax(
    baseTransferInput({ propertyType: "land", transferPrice: 1_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: input.acquisitionDate, transferDate: input.transferDate, isOneHousehold: false, nonBusinessLandDetails: input }),
    makeMockRates(),
  ).calculatedTax;
}
const oracle = (r: (typeof E35_ROWS)[number]) =>
  evalDayRow({ acq: r.acq ?? "2014-01-01", transfer: r.transfer ?? "2024-01-01", biz: r.biz.map(([a, b]) => [a, b] as const), grace: r.grace?.map(([a, b]) => [a, b] as const) });
const row = (id: string) => E35_ROWS.find((r) => r.id === id)!;
const DEFAULT_DATES = (r: (typeof E35_ROWS)[number]) => (r.acq ?? "2014-01-01") === "2014-01-01" && (r.transfer ?? "2024-01-01") === "2024-01-01";

describe("E3f-0 Anchor 1 — 오라클 표: 판정 · 일수 (제안 모델 적용 후의 기대)", () => {
  it("표 규모·id 중복 없음 · 계획서 §7 핵심 행 포함", () => {
    expect(new Set(E35_ROWS.map((r) => r.id)).size).toBe(E35_ROWS.length);
    for (const id of ["K-1", "K-2a", "K-2b", "K-3", "K-5", "K-7", "K-8", "K-11a", "K-11b", "K-12", "K-13", "K-14", "D-1", "D-2"]) expect(E35_ROWS.map((r) => r.id), id).toContain(id);
  });

  it.each(E35_ROWS.map((r) => [r.id, r.scenario, r] as const))("%s — %s", (_id, _s, r) => {
    const res = oracle(r);
    expect(res.meets).toBe(!r.expect.nonBusiness);
    expect(res.effectiveBusinessDays).toBe(r.expect.eff);
    expect(res.totalOwnershipDays).toBe(r.expect.total);
  });

  it("계획서 수치 대조: K-1 774(창 182일 — 계획서 «183일»은 오기, 774 = 592 + 182) · 창 없음 592 비사업용", () => {
    expect(oracle(row("K-1")).effectiveBusinessDays).toBe(774);
    const noWindow = evalDayRow({ acq: "2014-01-01", transfer: "2024-01-01", biz: [["2021-06-02", "2022-12-15"], ["2023-12-01", "2024-01-01"]] });
    expect([noWindow.meets, noWindow.effectiveBusinessDays]).toEqual([false, 592]);
    expect(774 - 592).toBe(182);
  });

  it("Q-4 게이트 효과(K-2a/K-2b 쌍): 철거 2022-12-01은 게이트 실패(578 비사업용) — 게이트 없이 창을 주면 760 사업용(법 근거 없는 최대 6개월 유리 인정) · 철거 2022-12-02는 통과 761", () => {
    const gateOff = evalDayRow({ acq: "2014-01-01", transfer: "2024-01-01", biz: [["2021-06-02", "2022-12-01"], ["2022-12-01", "2023-06-01"], ["2023-12-01", "2024-01-01"]] });
    expect([gateOff.meets, gateOff.effectiveBusinessDays]).toEqual([true, 760]);
    expect([oracle(row("K-2a")).meets, oracle(row("K-2a")).effectiveBusinessDays]).toEqual([false, 578]);
    expect([oracle(row("K-2b")).meets, oracle(row("K-2b")).effectiveBusinessDays]).toEqual([true, 761]);
  });

  it("K-3: 6개월 안에 과세기준일이 없는 철거(2022-07-01) — 창을 줘도 609일 비사업용(판정 같음·일수만 다름) · 접으면 425", () => {
    const withWindow = evalDayRow({ acq: "2014-01-01", transfer: "2024-01-01", biz: [["2021-06-02", "2022-07-01"], ["2022-07-01", "2023-01-01"], ["2023-12-01", "2024-01-01"]] });
    expect([withWindow.meets, withWindow.effectiveBusinessDays]).toEqual([false, 609]);
    expect([oracle(row("K-3")).meets, oracle(row("K-3")).effectiveBusinessDays]).toEqual([false, 425]);
  });

  it("K-7 빈집 셀: 3년 창이면 사업용 1,462/2,283 · 9호 단독 비사업용 1,096/2,283 — 판정이 뒤집히는 유일한 셀", () => {
    const nine = evalDayRow({ acq: "2018-06-01", transfer: "2024-09-01", biz: [["2020-06-01", "2021-06-02"]], grace: [["2021-06-02", "2023-06-02"]] });
    expect([nine.meets, nine.effectiveBusinessDays, nine.totalOwnershipDays]).toEqual([false, 1096, 2283]);
    expect([oracle(row("K-7")).meets, oracle(row("K-7")).effectiveBusinessDays]).toEqual([true, 1462]);
  });

  it("K-8: 창 ∪ 9호 = 9호 단독과 같다(이중 계산 없음 — 합집합 943) · K-12a: 접음 + 9호 = 1,096", () => {
    expect(oracle(row("K-8")).effectiveBusinessDays).toBe(943);
    expect(oracle(row("K-12a")).effectiveBusinessDays).toBe(1096);
  });

  it("스윙: B − N 차이 = 55,750,000 — 세액이 B인 행은 사업용 · N인 행은 비사업용(부호가 판정 방향과 같다)", () => {
    expect(E35_N - E35_B).toBe(E35_SWING);
    expect(E35_SWING).toBe(55_750_000);
    for (const r of E35_ROWS.filter((x) => x.current.tax === E35_B)) expect(r.current.nonBusiness, r.id).toBe(false);
    for (const r of E35_ROWS.filter((x) => x.current.tax === E35_N)) expect(r.current.nonBusiness, r.id).toBe(true);
  });
});

describe("E3f-0 Anchor 2 — 현행 엔진 실측 (`current` 열) · 뒤집힘 id 고정", () => {
  it.each(E35_ROWS.map((r) => [r.id, r] as const))("%s 현행", (_id, r) => {
    const input = fromRaw(r.raw);
    const j = judge(input);
    expect([j.isNonBusinessLand, j.effectiveBusinessDays, j.totalOwnershipDays]).toEqual([r.current.nonBusiness, r.current.eff, r.current.total]);
    if (r.current.tax !== undefined) {
      expect(DEFAULT_DATES(r), `${r.id} 세액 단언은 기본 취득·양도일 행만`).toBe(true);
      expect(taxOf(input)).toBe(r.current.tax);
    }
  });

  /** E3f-1b가 뒤집은 행의 **반전 전 현행**(비사업용 여부 · 유효 일수). 반전 후 `current` = 오라클이고 `flipsIn`은 지웠다 — 이 표가 그 범위(판정 4건 + 일수 1건)를 고정한다. */
  const BEFORE_E3F_1B = { "K-11a": [false, 1094], "K-12": [false, 1826], "K-12a": [false, 1826], "D-1": [false, 3651], "D-1a": [false, 3651] } as const;

  it("flipsIn 행 = 현행 열 ≠ 오라클 열(판정 또는 일수)이고 그 밖의 행은 현행 = 오라클 — PR별 뒤집힘 id 목록 고정 (E3f-1b 행은 반전 완료 → 현행 = 오라클)", () => {
    const differs = (r: (typeof E35_ROWS)[number]) => r.current.nonBusiness !== r.expect.nonBusiness || r.current.eff !== r.expect.eff;
    for (const r of E35_ROWS) expect(differs(r), `${r.id} flipsIn=${r.flipsIn ?? "-"}`).toBe(r.flipsIn !== undefined);
    expect(E35_ROWS.filter((r) => r.flipsIn === "E3f-1b").map((r) => r.id)).toEqual([]);
    for (const id of ["K-11a", "K-12", "K-12a", "D-1", "D-1a"]) expect(row(id).flipsIn, id).toBeUndefined();
    expect(E35_ROWS.filter((r) => r.flipsIn === "E3f-2").map((r) => r.id)).toEqual(["K-1", "K-2b", "K-5", "K-7", "K-7a"]);
  });

  it("판정이 뒤집히는 행(비사업용 ↔ 사업용): E3f-1b가 뒤집은 판정 = K-11a·K-12·D-1·D-1a(사업용 → 비사업용 · 일수만 바뀌는 K-12a 제외) · E3f-2 = K-1·K-2b·K-7·K-7a(비사업용 → 사업용 · K-5는 일수만)", () => {
    const ids = Object.keys(BEFORE_E3F_1B) as Array<keyof typeof BEFORE_E3F_1B>;
    expect(ids.filter((id) => BEFORE_E3F_1B[id][0] !== row(id).expect.nonBusiness)).toEqual(["K-11a", "K-12", "D-1", "D-1a"]);
    expect(ids.filter((id) => BEFORE_E3F_1B[id][0] === row(id).expect.nonBusiness && BEFORE_E3F_1B[id][1] !== row(id).expect.eff)).toEqual(["K-12a"]);
    const flipped = (pr: string) => E35_ROWS.filter((r) => r.flipsIn === pr && r.current.nonBusiness !== r.expect.nonBusiness).map((r) => r.id);
    expect(flipped("E3f-2")).toEqual(["K-1", "K-2b", "K-7", "K-7a"]);
  });

  it("K-12a(접음 + 9호): 세액 불변 — E3f-1b 전에도 B(1,826일) · 접은 뒤에도 B(1,096일) — 일수만 줄고 판정·세액은 같다(9호 입력자 세액 불변)", () => {
    expect([row("K-12a").current.tax, oracle(row("K-12a")).meets, row("K-12a").current.eff]).toEqual([E35_B, true, 1096]);
  });
});

describe("E3f-0 Anchor 2 ② — [E3f-1b 반전 완료] 꼬리 근거 «철거ㆍ멸실»은 철거일을 읽는다", () => {
  const demolishedTail = (removedOn: string, extra: Record<string, unknown> = {}) => fromRaw(e35Tail(removedOn, "2024-01-01", undefined, extra));

  it("철거 6년 전(2018-01-01) · 꼬리 근거 → 한시 기간이 확실히 지나 접힘: 비사업용 1,460/3,651 · N 253,960,000 — 철거 6일 전(2023-12-26)은 한시 안이라 사업용 3,651 · B 198,210,000", () => {
    const sixYears = demolishedTail("2018-01-01");
    const sixDays = demolishedTail("2023-12-26");
    expect([judge(sixYears).isNonBusinessLand, judge(sixYears).effectiveBusinessDays, judge(sixYears).totalOwnershipDays]).toEqual([true, 1460, 3651]);
    expect(taxOf(sixYears)).toBe(E35_N);
    expect([judge(sixDays).isNonBusinessLand, judge(sixDays).effectiveBusinessDays, judge(sixDays).totalOwnershipDays]).toEqual([false, 3651, 3651]);
    expect(taxOf(sixDays)).toBe(E35_B);
  });

  it("철거 6년 전 입력에서 근거를 빼고 9호 2년만 입력해도 N 253,960,000(비사업용 2,190) — 근거를 선언해도 9호만 입력한 것과 세액이 같다(종전: 근거 한 칸이 55,750,000을 갈랐다)", () => {
    const nineOnly = fromRaw(row("D-2").raw);
    expect([judge(nineOnly).isNonBusinessLand, judge(nineOnly).effectiveBusinessDays, judge(nineOnly).gracePeriodDays]).toEqual([true, 2190, 730]);
    expect(taxOf(nineOnly)).toBe(E35_N);
    expect(taxOf(demolishedTail("2018-01-01"))).toBe(taxOf(nineOnly));
  });

  it("근거 + 9호도 N — 9호 2년은 철거 후 2년만 덮고 근거는 접혀 6년 전체를 덮지 못한다(종전 과다 인정 해소)", () => {
    const both = demolishedTail("2018-01-01", { nblGracePeriods: [{ reasonCode: "demolition", anchorDate: "2018-01-01" }] });
    expect(judge(both).isNonBusinessLand).toBe(true);
    expect(taxOf(both)).toBe(E35_N);
  });

  it("경계 쌍 K-11a/K-11b: 철거일이 하루(2022-12-01 vs 12-02) 달라 K-11a만 비사업용 547로 접힌다 — K-11b는 사업용 1,094 그대로(접지 않는 정합 시료)", () => {
    expect(row("K-11a").current).toMatchObject({ nonBusiness: true, eff: 547 });
    expect(row("K-11b").current).toMatchObject({ nonBusiness: false, eff: 1094 });
    expect(oracle(row("K-11a")).meets).toBe(false);
    expect(oracle(row("K-11b")).meets).toBe(true);
  });

  it("새 칸 `nblOtherDemolishedOn`은 철거 행이 날짜를 대면 읽히지 않는다(K-17 — 철거 행 우선) → stray 값을 줘도 판정·세액·엔진 입력 바이트 동일", () => {
    const plain = demolishedTail("2018-01-01");
    const withStray = demolishedTail("2018-01-01", { nblOtherDemolishedOn: "2023-12-26" });
    expect(judge(withStray)).toEqual(judge(plain));
    expect(withStray.otherLand).toEqual(plain.otherLand);
  });
});

describe("E3f-0 Anchor 3 — 6개월·1년 한시는 9호에 포함된다(격자) · 빈집 3년만 셀", () => {
  const OS = "2014-01-02";
  const d = parseISO;
  const s1 = (y: number) => d(`${y}-06-01`);
  const FROM = { y2016: d("2016-06-01"), y2024: d("2024-06-01"), y2026: d("2026-06-01") };
  /** 과세기준일 s 시행본의 W(개월): 2016.6.1. 전 0 · 6 · 빈집정비 2024.6.1.~ 36 · 2026.6.1.~ 12. 계획서 §1.3 표 — 테스트용 오라클이며 제품 코드가 아니다. */
  const widthOf = (s: Date, vacantHouse: boolean): number => (isBefore(s, FROM.y2016) ? 0 : vacantHouse && !isBefore(s, FROM.y2024) ? 36 : !isBefore(s, FROM.y2026) ? 12 : 6);
  /** W* = 성립 요건(`r ≤ s ≤ T` ∧ `s < r + W(s)`)을 채우는 과세기준일들의 W 중 최대 — 하나도 없으면 undefined(한시 불성립). */
  function wStar(r: Date, T: Date, vacantHouse: boolean): number | undefined {
    let best: number | undefined;
    for (let y = r.getUTCFullYear(); y <= T.getUTCFullYear(); y++) {
      const s = s1(y);
      if (isBefore(s, r) || isBefore(T, s)) continue;
      const w = widthOf(s, vacantHouse);
      if (w > 0 && isBefore(s, addMonths(r, w))) best = Math.max(best ?? 0, w);
    }
    return best;
  }
  const f = (x: Date) => format(x, "yyyy-MM-dd");

  /**
   * 철거일 r(월 간격 1일·16일) × 양도일 T(월 간격) × 건물 보유 b년(1·2·3) × 취득~건물 신축 사이 나대지 m년(0~4) 격자 — 9호 단독 vs 9호 ∪ 한시 창.
   * 나대지 앞선 기간 m이 있어야 사업용 요건이 경계에 걸린다(m = 0 · 취득부터 건물이면 80%·5년 요건이 이미 충족돼 뒤집힘이 없다 — 실측).
   */
  const SHAPES = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 0], [2, 1], [2, 2], [3, 1]] as const;
  function grid(vacantHouse: boolean) {
    const rows: Array<{ r: string; T: string; shape: string; nine: { meets: boolean; eff: number }; union: { meets: boolean; eff: number } }> = [];
    for (let rm = d("2016-06-01"); isBefore(rm, d("2025-12-02")); rm = addMonths(rm, 1)) {
      for (const day of [0, 15]) {
        const r = addDays(rm, day);
        for (const [b, m] of SHAPES) {
          const bs = addYears(r, -b);
          const acq = addYears(bs, -m);
          for (let T = addMonths(rm, 1); !isBefore(d("2027-01-01"), T); T = addMonths(T, 1)) {
            const w = wStar(r, T, vacantHouse);
            if (w === undefined) continue;
            const grace: [string, string][] = [[f(r), f(addYears(r, demolitionGraceYears(T)))]];
            const winEnd = isBefore(addMonths(r, w), T) ? addMonths(r, w) : T;
            const base = { acq: f(acq), transfer: f(T), grace };
            const nine = evalDayRow({ ...base, biz: [[f(bs), f(r)]] });
            const union = evalDayRow({ ...base, biz: [[f(bs), f(r)], [f(r), f(winEnd)]] });
            rows.push({ r: f(r), T: f(T), shape: `${b}-${m}`, nine: { meets: nine.meets, eff: nine.effectiveBusinessDays }, union: { meets: union.meets, eff: union.effectiveBusinessDays } });
          }
        }
      }
    }
    return rows;
  }
  const inCell = (x: { r: string; T: string }) => x.r > "2021-06-01" && x.r <= "2022-06-01" && x.T >= "2024-06-01" && x.T <= "2025-03-20";

  it("일반 한시(6개월 · 2026.6.1.~ 1년 · 빈집정비 아님): 9호 단독 vs 9호 ∪ 창 — 판정·유효 일수 뒤집힘 0 (계획서 §3.2 대수 증명의 격자 확인)", () => {
    const rows = grid(false);
    expect(rows.length).toBeGreaterThan(50_000);
    const flips = rows.filter((x) => x.nine.meets !== x.union.meets || x.nine.eff !== x.union.eff);
    expect(flips.slice(0, 3)).toEqual([]);
  });

  it("빈집 3년(2024.6.1.~): 판정이 뒤집히는 행이 있고 **전부 셀 안**(철거 (2021-06-01, 2022-06-01] × 양도 [2024-06-01, 2025-03-20]) — 일수만 달라지는 행은 셀 밖에도 있다", () => {
    const rows = grid(true);
    const verdictFlips = rows.filter((x) => x.nine.meets !== x.union.meets);
    expect(verdictFlips.length).toBeGreaterThan(0);
    for (const x of verdictFlips) {
      expect([x.nine.meets, x.union.meets], `${x.r} → ${x.T} (${x.shape})`).toEqual([false, true]);
      expect(inCell(x), `${x.r} → ${x.T} (${x.shape})`).toBe(true);
    }
    expect(rows.filter((x) => x.nine.eff !== x.union.eff && !inCell(x)).length).toBeGreaterThan(0);
  });

  it("셀 경계(계획서 K-23): 9호가 2년인 시기에 과세기준일 2024-06-01 현재 3년 한시는 성립하나 9호 [r, r+2년)이 그날을 덮지 못하는 철거일은 (2021-06-01, 2022-06-01] — 경계 쌍 2021-06-01/02 · 2022-06-01/02", () => {
    const covered = (r: string, s = "2024-06-01") => {
      const end = addYears(d(r), 2);
      return !isBefore(d(s), d(r)) && isBefore(d(s), end);
    };
    const threeYearHolds = (r: string) => isBefore(d("2024-06-01"), addMonths(d(r), 36));
    const inCell = (r: string) => threeYearHolds(r) && !covered(r);
    expect(["2021-06-01", "2021-06-02", "2022-06-01", "2022-06-02"].map(inCell)).toEqual([false, true, true, false]);
  });
});

describe("E3f-0 Anchor 4 — 반전 예고 단언 (이 단언을 E3f-1a·E3f-2가 의도적으로 반전한다)", () => {
  it("[E3f-2 반전] 나대지 구간 선언의 근거 선택지에서 `demolished`는 제외 — V1-A 선택지에는 있다(별도합산 + 건축물 없음)", () => {
    expect(propertyTaxBasisOptions("separate", false)).toEqual(["vacant_state", "demolished", "unknown"]);
    expect(eventBasisOptions("separate")).toEqual(["vacant_state", "unknown"]);
  });

  it("[E3f-2 반전] 나대지 구간의 근거 `demolished`는 종합합산으로 접힌다(`demolished_unsupported`) — 창을 만들지 않는다", () => {
    const j = judge(fromRaw(row("K-1").raw));
    const iv = j.periodEvaluation?.stateHistory?.intervals ?? [];
    const folded = iv.filter((x) => x.basis === "demolished");
    expect(folded).toHaveLength(1);
    expect([folded[0].basisOutcome, folded[0].foldReason, folded[0].business]).toEqual(["unconfirmed", "demolished_unsupported", false]);
    expect(iv.some((x) => "temporaryStatusWindow" in x)).toBe(false);
  });

  it("[E3f-2 반전] 같은 입력에서 근거를 빼도(종합합산 선언 없음) 판정·일수·세액이 같다 — `demolished`가 접힌 구간은 근거 없는 구간과 구별되지 않는다", () => {
    const withBasis = fromRaw(row("K-1").raw);
    const noBasis = fromRaw(e35Base({
      nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [
        { kind: "building_built", date: "2021-06-02" },
        { kind: "building_removed", date: "2022-12-15", propertyTaxTypeBefore: "separate" },
        { kind: "building_built", date: "2023-12-01", propertyTaxTypeBefore: "separate" },
      ],
    }));
    expect([judge(withBasis).isNonBusinessLand, judge(withBasis).effectiveBusinessDays, taxOf(withBasis)]).toEqual([judge(noBasis).isNonBusinessLand, judge(noBasis).effectiveBusinessDays, taxOf(noBasis)]);
  });

  it("[E3f-1a 반전 완료] 꼬리 근거 고지는 양도일 시행본 연혁 — 양도 2018-12-01(6개월 시행본)에는 «6개월», «1년»이 아니다(F-1 해소 · 상세는 e3-5a-notice anchor)", () => {
    const input = fromRaw(e35Tail("2018-03-01", "2018-12-01", undefined, { acquisitionDate: "2014-01-01" }));
    const notice = judge(input).warnings.find((w) => w.includes("철거ㆍ멸실된 날부터"));
    expect(notice).toBeDefined();
    expect(notice).toContain("6개월이 지나지 않은");
    expect(notice).not.toContain("1년이 지나지 않은");
  });

  it("[E3f-1a 반전 완료] 상수 인용 «시행령 §103의2 1호» — 조문에 항(①)이 없다", () => {
    const input = fromRaw(e35Tail("2018-03-01", "2018-12-01", undefined));
    const warnings = judge(input).warnings;
    expect(warnings.some((w) => w.includes("§103의2 ① 1호"))).toBe(false);
    expect(warnings.some((w) => w.includes("§103의2"))).toBe(true);
  });
});
