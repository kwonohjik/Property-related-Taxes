/**
 * NBL-STATE-HISTORY-E3-② 「업종 개시·폐업(과세기간별 수입금액)」 — 엔진 계획서 §5 케이스 매트릭스를 **한 표**로 옮긴 것.
 * 같은 표를 ① E3c-0 Anchor 1(`meetsPeriodCriteria`에 `biz`를 직접 — 지금 코드로 green) · ② E3c-0 현행 열(OFF 입력의 현행 엔진 실측) ·
 * ③ E3c-1 leaf 단위(영위 기간 → 연도 판정 → 사업용 구간 = `biz`) · ④ 엔진 단위(raw → ⑭ 매퍼 → 판정·세액) · ⑤ route 관통(raw → ⑫ → ⑭ → 엔진 → 세액)이 쓴다.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-2-business-period.engine.plan.md §3.6 · §4 · §5 · «결정 기록 (2026-11-23 사용자)»
 * 결정: 모델 = 「영위 기간」 ON일 때만 새 경로(개시일·폐업일 1쌍 + T−2 이전 연도 행 — T·T−1은 기존 `nblRevenue*` 칸) · Q-2 (가) 통과 과세기간 ∩ 실제 영위일 ·
 *       연도 행 누락 = 모름(그 연도 불통과 + 확인 필요, 차단 없음) · ON이면 DM-01 대체 · V-7 영위 통산 2년 미만이면 그 10호 유예만 제외 · 업종 1개·영위 기간 1건.
 *
 * 공통: 기타토지(잡종지) 1,000㎡ · 일반주거 · 업종 주차장운영업(기준 3%) · 양도가 10억 · 취득가 3억 · `makeMockRates` · 연도별 토지가액 1억 · 통과 수입 5,000,000.
 * 기본 취득 2014-01-01 → 양도 2024-06-30(소유 3,832일). 구간은 반열린 `[start, end)`, **폐업일 = 영업을 하지 않게 된 첫날**(개시일 = 처음 영업한 날).
 * 기댓값 `expect`는 **오라클**(= `meetsPeriodCriteria`에 사업용 구간을 직접 넣은 값)이다. 구현 후 측정값이 다르면 표를 맞추지 말고 원인을 먼저 본다.
 * `current`는 같은 입력을 **영위 기간 OFF**(현행)로 돌린 엔진 실측이다 — 이 표가 왜 필요한지의 근거.
 */
import type { GraceSpec } from "./nbl-state-history-e2-table";

/** [수입금액, 토지가액] — 한쪽이 `undefined`이면 «모름»(그 연도 불통과 + 확인 필요). */
export type E3cYear = readonly [revenue: number | undefined, landValue: number | undefined];

export interface E3cRow {
  id: string;
  scenario: string;
  acq?: string;
  transfer?: string;
  /** 개시일 = 기존 `nblRevenueCurrentBusinessStartDate`(단일 소스). 비면 소유 시작부터 영위. */
  start?: string;
  /** 폐업일(영업을 하지 않게 된 첫날). 비면 양도일 현재도 영위. */
  end?: string;
  /** 과세연도 → [수입금액, 토지가액]. 양도연도 T·T−1은 기존 칸(`current*`·`prior*`)으로, T−2 이전은 연도 행으로 실린다. 생략한 연도 = 행 없음(모름). */
  years: Readonly<Record<number, E3cYear>>;
  grace?: readonly GraceSpec[];
  /** 건축물 이력(E3-①) — 철거 사건 1건(철거 직전 별도합산 · 꼬리 나대지 종합합산). C11 */
  buildingRemovedOn?: string;
  /** 사업용 구간(반열린) — 손으로 쓴 독립 정답. 영업 구간 ∩ 통과한 과세기간(건축물 이력이 있으면 합집합 후 구간까지 포함). */
  biz: ReadonlyArray<readonly [string, string]>;
  /** 오라클에 넣는 유예 구간(전제 검사로 제외된 10호는 넣지 않는다). */
  graceIntervals?: ReadonlyArray<readonly [string, string]>;
  expect: {
    nonBusiness: boolean;
    /** `effectiveBusinessDays` */
    eff: number;
    total: number;
    bucket: 1 | 2 | 3;
  };
  /** 같은 입력의 **현행**(OFF) 판정 — 엔진 실측. `eff`는 판정 경로별 의미가 달라 비사업용에서는 표시값이라 단언하지 않는다. */
  current: { nonBusiness: boolean; eff?: number };
  /**
   * 새 경로(엔진·route)로 돌릴 수 없는 행 — `oracle`: 영위 기간 1건 결정으로 표현 불가(휴업·재개) / `counterfactual`: 반사실 오라클(V-7 전제를 검사하지 않았다면).
   * 이 행은 Anchor 1·현행 열에서만 쓰고 ON 계층은 건너뛴다.
   */
  scope?: "oracle" | "counterfactual";
  /** 이 행이 내는 새 고지(E3c-1·2) — 생략 = 해당 고지 없음. */
  notices?: ReadonlyArray<"rowUnknown" | "grace10Premise" | "pastYears" | "closureGrace">;
}

const A = "2014-01-01";
const OS = "2014-01-02"; // 소유 첫날(취득일 다음날)
const T24 = "2024-06-30";
export const E3C_LV = 100_000_000;
const PASS: E3cYear = [5_000_000, E3C_LV];

/** 취득일 → 양도일 거래의 «전량 사업용 B · 전량 비사업용 N» 산출세액(원) — 계획서 §0 실측. 같은 거래 안에서 판정이 갈릴 때 세액 차이의 근거. */
export const E3C_TRADE_TAX: Readonly<Record<string, { B: number; N: number }>> = {
  "2014-01-01|2024-06-30": { B: 198_210_000, N: 253_960_000 },
  "2014-01-01|2024-01-01": { B: 198_210_000, N: 253_960_000 },
  "2022-07-01|2024-06-30": { B: 257_010_000, N: 326_760_000 },
  "2022-12-31|2023-12-31": { B: 279_000_000, N: 326_760_000 },
  "2023-12-31|2024-06-30": { B: 348_750_000, N: 348_750_000 },
  "2021-01-01|2024-09-30": { B: 239_370_000, N: 304_920_000 },
};
export const E3C_SWING_2014 = 55_750_000;
export const E3C_SWING_V7 = 69_750_000;

/** [연도 a..b] 같은 값. */
const span = (a: number, b: number, v: E3cYear): Record<number, E3cYear> => Object.fromEntries(Array.from({ length: b - a + 1 }, (_, i) => [a + i, v]));

const M9_YEARS = { 2022: [600_000, E3C_LV], 2023: PASS, 2024: [2_600_000, E3C_LV] } as const satisfies Record<number, E3cYear>;

export const E3C_ROWS: readonly E3cRow[] = [
  { id: "M9p", scenario: "개시 2022-12-01 계속 · 2022 수입 600,000(영위 31일) · 2023 5,000,000 · 2024 2,600,000(영위 182일 — 연환산 ×366/182) · 직전 통과 — 현행은 «2022 개시»를 말할 칸이 없어 직전 통과로 전 기간 사업용",
    start: "2022-12-01", years: M9_YEARS, biz: [["2022-12-01", T24]], notices: ["pastYears"],
    expect: { nonBusiness: true, eff: 577, total: 3832, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M9-orig", scenario: "원표 M9: 개시 2022-06-01 · 양도 2024-01-01(당해 영위 1일, 수입 100,000 ×366) · 직전 통과 — 영위 579/3,651", transfer: "2024-01-01",
    start: "2022-06-01", years: { 2022: [3_000_000, E3C_LV], 2023: PASS, 2024: [100_000, E3C_LV] }, biz: [["2022-06-01", "2024-01-01"]], notices: ["pastYears"],
    expect: { nonBusiness: true, eff: 579, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M10p", scenario: "같은 개시 · **직전(2023) 수입 0**(DM-01 경로) — 2023은 비율②(0+2022 연환산 7.06M)/2억 = 3.5%로 통과 · 현행 DM-01 결론을 보존하는 일치 행", start: "2022-12-01",
    years: { 2022: [600_000, E3C_LV], 2023: [0, E3C_LV], 2024: [2_600_000, E3C_LV] }, biz: [["2022-12-01", T24]], notices: ["pastYears"],
    expect: { nonBusiness: true, eff: 577, total: 3832, bucket: 1 }, current: { nonBusiness: true } },
  { id: "M11p", scenario: "폐업 2021-06-01 후 나대지 · 2014~2021 연도 통과(2021 영위 151일 · 연환산) · 양도연도 수입 0 — 영업 2,707일 · 다목 비사업 1,125 ≤ 1,532(= floor(3,832×0.4))", end: "2021-06-01",
    years: { ...span(2014, 2020, PASS), 2021: [2_000_000, E3C_LV], 2024: [0, E3C_LV] }, biz: [[OS, "2021-06-01"]], notices: ["pastYears", "closureGrace"],
    expect: { nonBusiness: false, eff: 2707, total: 3832, bucket: 1 }, current: { nonBusiness: true } },
  { id: "M11p-10ho", scenario: "M11p + 10호 유예 `[2021-06-01, 2023-06-01)` — 전제(영위 통산 2,707 ≥ 2년) 충족 · 3,437/3,832", end: "2021-06-01",
    years: { ...span(2014, 2020, PASS), 2021: [2_000_000, E3C_LV], 2024: [0, E3C_LV] }, grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2021-06-01" }],
    biz: [[OS, "2021-06-01"]], graceIntervals: [["2021-06-01", "2023-06-01"]], notices: ["pastYears"],
    expect: { nonBusiness: false, eff: 3437, total: 3832, bucket: 1 }, current: { nonBusiness: true } },
  { id: "C4a", scenario: "폐업 2019-01-01 · 유예 없음 — 영업 1,825일 · 비사업 2,007 > 1,532 → 비사업용(일수·echo만 달라짐)", end: "2019-01-01",
    years: { ...span(2014, 2018, PASS), 2024: [0, E3C_LV] }, biz: [[OS, "2019-01-01"]], notices: ["pastYears", "closureGrace"],
    expect: { nonBusiness: true, eff: 1825, total: 3832, bucket: 1 }, current: { nonBusiness: true } },
  { id: "C4b", scenario: "C4a + 10호 유예 `[2019-01-01, 2021-01-01)` — 전제 영위 1,825일 ≥ 2년 충족 · 2,556/3,832", end: "2019-01-01",
    years: { ...span(2014, 2018, PASS), 2024: [0, E3C_LV] }, grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2019-01-01" }],
    biz: [[OS, "2019-01-01"]], graceIntervals: [["2019-01-01", "2021-01-01"]], notices: ["pastYears"],
    expect: { nonBusiness: false, eff: 2556, total: 3832, bucket: 1 }, current: { nonBusiness: true } },
  { id: "V7a", scenario: "**반사실**(전제를 검사하지 않았다면): 취득 2022-07-01 · 개시 2022-09-01 · 폐업 2023-03-01(영위 181일) + 10호 유예 `[2023-03-01, 2025-03-01)` · 양도 2024-06-30 — 영업 181 ∪ 유예 487 = 668/729",
    acq: "2022-07-01", start: "2022-09-01", end: "2023-03-01", years: { 2022: [1_500_000, E3C_LV], 2023: [700_000, E3C_LV], 2024: [0, E3C_LV] },
    grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2023-03-01" }], biz: [["2022-09-01", "2023-03-01"]], graceIntervals: [["2023-03-01", "2025-03-01"]], scope: "counterfactual",
    expect: { nonBusiness: false, eff: 668, total: 729, bucket: 3 }, current: { nonBusiness: false, eff: 487 } },
  { id: "V7b", scenario: "V7a와 같은 입력 — **전제 검사**(영위 181 < 730) → 10호 유예 제외 · 181/729(다목 비사업 548 > floor(729×0.4)=291) → 비사업용",
    acq: "2022-07-01", start: "2022-09-01", end: "2023-03-01", years: { 2022: [1_500_000, E3C_LV], 2023: [700_000, E3C_LV], 2024: [0, E3C_LV] },
    grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2023-03-01" }], biz: [["2022-09-01", "2023-03-01"]], notices: ["pastYears", "grace10Premise"],
    expect: { nonBusiness: true, eff: 181, total: 729, bucket: 3 }, current: { nonBusiness: false, eff: 487 } },
  { id: "V7c", scenario: "V-7 경계(충족): 취득 2021-01-01 · 개시 2022-03-01 · 폐업 2024-03-01(영위 731일 = differenceInDays(2024-03-01, 2022-03-01)) + 10호 유예 → 유예 인정 · 영업 731 ∪ 유예 213",
    acq: "2021-01-01", transfer: "2024-09-30", start: "2022-03-01", end: "2024-03-01", years: { 2022: PASS, 2023: PASS, 2024: [1_000_000, E3C_LV] },
    grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2024-03-01" }], biz: [["2022-03-01", "2024-03-01"]], graceIntervals: [["2024-03-01", "2026-03-01"]], notices: ["pastYears"],
    expect: { nonBusiness: false, eff: 944, total: 1367, bucket: 2 }, current: { nonBusiness: false } },
  { id: "V7d", scenario: "V-7 경계(미충족): 개시 2022-03-02 → 영위 730일 < 731 → 10호 유예 제외 · 영업 730뿐",
    acq: "2021-01-01", transfer: "2024-09-30", start: "2022-03-02", end: "2024-03-01", years: { 2022: PASS, 2023: PASS, 2024: [1_000_000, E3C_LV] },
    grace: [{ reasonCode: "business_closure_relocation", anchorDate: "2024-03-01" }], biz: [["2022-03-02", "2024-03-01"]], notices: ["pastYears", "grace10Premise"],
    expect: { nonBusiness: true, eff: 730, total: 1367, bucket: 2 }, current: { nonBusiness: false } },
  { id: "B-3.0M", scenario: "**비율 경계(3.00% 정확)**: 취득 2022-12-31 · 개시 2023-01-01 계속 · 양도 2023-12-31 · 2023 수입 3,000,000(토지가액 1억) — 364/364",
    acq: "2022-12-31", transfer: "2023-12-31", start: "2023-01-01", years: { 2023: [3_000_000, E3C_LV] }, biz: [["2023-01-01", "2023-12-31"]],
    expect: { nonBusiness: false, eff: 364, total: 364, bucket: 3 }, current: { nonBusiness: false } },
  { id: "B-2.999M", scenario: "**비율 경계(3.00% 미달 1원)**: 수입 2,999,999 — 불통과 0/364",
    acq: "2022-12-31", transfer: "2023-12-31", start: "2023-01-01", years: { 2023: [2_999_999, E3C_LV] }, biz: [],
    expect: { nonBusiness: true, eff: 0, total: 364, bucket: 3 }, current: { nonBusiness: true } },
  { id: "A-2515069", scenario: "**연환산 경계**: 개시 2023-03-01(영위 306일) · 수입 2,515,069 → ×365/306 = 3,000,000 정확 — 305/364",
    acq: "2022-12-31", transfer: "2023-12-31", start: "2023-03-01", years: { 2023: [2_515_069, E3C_LV] }, biz: [["2023-03-01", "2023-12-31"]],
    expect: { nonBusiness: false, eff: 305, total: 364, bucket: 3 }, current: { nonBusiness: false } },
  { id: "A-2515068", scenario: "**연환산 경계(1원 미달)**: 수입 2,515,068 → 2,999,999 — 0/364",
    acq: "2022-12-31", transfer: "2023-12-31", start: "2023-03-01", years: { 2023: [2_515_068, E3C_LV] }, biz: [],
    expect: { nonBusiness: true, eff: 0, total: 364, bucket: 3 }, current: { nonBusiness: true } },
  { id: "L-1000000", scenario: "**윤년(366) 연환산 경계**: 취득 2023-12-31 · 개시 2024-03-01(영위 122일) · 양도 2024-06-30 · 수입 1,000,000 → ×366/122 = 3,000,000 — 121/181(세액은 단기 세율이 지배해 변동 0)",
    acq: "2023-12-31", start: "2024-03-01", years: { 2024: [1_000_000, E3C_LV] }, biz: [["2024-03-01", T24]],
    expect: { nonBusiness: false, eff: 121, total: 181, bucket: 3 }, current: { nonBusiness: false } },
  { id: "L-999999", scenario: "**윤년 경계(1원 미달)**: 수입 999,999 → 2,999,997 — 0/181",
    acq: "2023-12-31", start: "2024-03-01", years: { 2024: [999_999, E3C_LV] }, biz: [],
    expect: { nonBusiness: true, eff: 0, total: 181, bucket: 3 }, current: { nonBusiness: true } },
  { id: "C9", scenario: "휴업·재개: 개시 2016-01-01 → 폐업 2018-01-01 → 재개 2021-01-01 계속(연도 모두 통과) — 영업 두 구간 합 2,007/3,832 · **영위 기간 1건 결정으로 표현 불가**(현행 = 전 기간)",
    start: "2016-01-01", years: { 2016: PASS, 2017: PASS, 2021: PASS, 2022: PASS, 2023: PASS, 2024: [2_600_000, E3C_LV] }, biz: [["2016-01-01", "2018-01-01"], ["2021-01-01", T24]], scope: "oracle",
    expect: { nonBusiness: false, eff: 2007, total: 3832, bucket: 1 }, current: { nonBusiness: false } },
  { id: "C10a", scenario: "개시 2022-01-01 · 2022 5M · 2023 **2M(①2% 미달, ②(2M+5M)/2억 = 3.5% 통과)** · 2024 2.6M — 911/3,832(3년 중 비사업 185 ≤ 365)",
    start: "2022-01-01", years: { 2022: PASS, 2023: [2_000_000, E3C_LV], 2024: [2_600_000, E3C_LV] }, biz: [["2022-01-01", T24]], notices: ["pastYears"],
    expect: { nonBusiness: false, eff: 911, total: 3832, bucket: 1 }, current: { nonBusiness: false } },
  { id: "C10b", scenario: "C10a에서 **2022 행 누락**(모름 → 2022 불통과, 2023 ②도 불가) — 2024만 통과 181/3,832 · 모름 = 혜택 불성립 + 확인 필요",
    start: "2022-01-01", years: { 2023: [2_000_000, E3C_LV], 2024: [2_600_000, E3C_LV] }, biz: [["2024-01-01", T24]], notices: ["rowUnknown"],
    expect: { nonBusiness: true, eff: 181, total: 3832, bucket: 1 }, current: { nonBusiness: false } },
  { id: "C10c", scenario: "C10b의 변형 — 2022 행은 있으나 **토지가액이 비었다**(수입만 입력) — 같은 «모름»", start: "2022-01-01",
    years: { 2022: [5_000_000, undefined], 2023: [2_000_000, E3C_LV], 2024: [2_600_000, E3C_LV] }, biz: [["2024-01-01", T24]], notices: ["rowUnknown"],
    expect: { nonBusiness: true, eff: 181, total: 3832, bucket: 1 }, current: { nonBusiness: false } },
  { id: "C11", scenario: "건축물(별도합산) 2016-01-01 철거(E3-① 이력) + 업종 개시 2022-12-01 · 직전 통과 — 건축물 729 ∪ 영업 577 = 1,306/3,832(중복 계상 없이 합집합). 현행은 수입금액비율 «전 기간 사업용»이 이력을 덮는다",
    start: "2022-12-01", years: M9_YEARS, buildingRemovedOn: "2016-01-01", biz: [[OS, "2016-01-01"], ["2022-12-01", T24]], notices: ["pastYears"],
    expect: { nonBusiness: true, eff: 1306, total: 3832, bucket: 1 }, current: { nonBusiness: false } },
  { id: "C12b", scenario: "ON인데 개시일 칸을 비우고 연도 행을 하나도 안 넣음 — 소유 시작부터 영위로 읽혀 2014~2022가 전부 «모름»(불통과), 기존 칸의 2023·2024만 통과 → 546/3,832 · 비사업용 + 확인 필요(차단 없음)",
    years: { 2023: PASS, 2024: [2_600_000, E3C_LV] }, biz: [["2023-01-01", T24]], notices: ["rowUnknown"],
    expect: { nonBusiness: true, eff: 546, total: 3832, bucket: 1 }, current: { nonBusiness: false } },
];

/** 임계쌍 — 판정이 정확히 1원(또는 1일) 차이로 갈린다. */
export const E3C_THRESHOLD_PAIRS = [
  ["B-3.0M", "B-2.999M", "수입금액비율 3.00% 정확 경계"],
  ["A-2515069", "A-2515068", "연환산(365/306) 후 3.00% 경계"],
  ["L-1000000", "L-999999", "윤년 연환산(366/122) 후 3.00% 경계"],
  ["V7c", "V7d", "V-7 전제 영위 통산 731일 / 730일 경계"],
] as const;

export const E3C_ACQ_DEFAULT = A;
export const E3C_TRANSFER_DEFAULT = T24;

const yearOf = (iso: string) => Number(iso.slice(0, 4));

/** 연도 → 와이어 문자열 칸(`undefined` = 빈 칸). */
const cell = (v: number | undefined) => (v === undefined ? "" : String(v));

/** T−2 이전 연도 행(`nblRevenueYearRows` — 와이어 형태 `{ year, revenue, landValue }`, 연도 오름차순). */
export function e3cYearRows(row: E3cRow): Array<{ year: string; revenue: string; landValue: string }> {
  const t = yearOf(row.transfer ?? T24);
  return Object.keys(row.years)
    .map(Number)
    .filter((y) => y <= t - 2)
    .sort((a, b) => a - b)
    .map((y) => ({ year: String(y), revenue: cell(row.years[y][0]), landValue: cell(row.years[y][1]) }));
}

/**
 * 행 → raw 와이어 칸(`nonBusinessLandRaw`). `on`이면 영위 기간 칸 3개(`nblRevenuePeriodOn` · `nblRevenueBusinessEndDate` · `nblRevenueYearRows`)를 얹고,
 * OFF이면 **키 자체를 싣지 않는다**(현행과 바이트 동일). 양도연도 T → 당해 칸, T−1 → 직전 칸(직전 영위일수는 비운다 — ON에서는 날짜에서 파생).
 */
export function e3cRowRaw(row: E3cRow, on: boolean): Record<string, unknown> {
  const t = yearOf(row.transfer ?? T24);
  const cur = row.years[t];
  const prior = row.years[t - 1];
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    acquisitionArea: "1000",
    acquisitionDate: row.acq ?? A,
    transferDate: row.transfer ?? T24,
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherHasBuilding: false,
    nblOtherBuildingFloorArea: "",
    nblRevenueBusinessType: "parking_operation",
    nblRevenueCurrentRevenue: cell(cur?.[0]),
    nblRevenueCurrentLandValue: cell(cur?.[1]),
    nblRevenueCurrentBusinessStartDate: row.start ?? "",
    nblRevenuePriorRevenue: cell(prior?.[0]),
    nblRevenuePriorLandValue: cell(prior?.[1]),
    nblRevenuePriorBusinessDays: "",
    ...(row.buildingRemovedOn
      ? { nblOtherStateHistoryMode: "changed", nblOtherStateEvents: [{ kind: "building_removed", date: row.buildingRemovedOn, propertyTaxTypeBefore: "separate" }] }
      : {}),
    nblGracePeriods: (row.grace ?? []).map((g) => ({ ...g })),
    ...(on ? { nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: row.end ?? "", nblRevenueYearRows: e3cYearRows(row) } : {}),
  };
}

/** ON 계층(leaf·엔진·route)이 돌리는 행 — 반사실·표현 불가 행은 뺀다. */
export const E3C_ON_ROWS: readonly E3cRow[] = E3C_ROWS.filter((r) => !r.scope);

/** 거래 키 → 산출세액 (판정 방향이 정한다). */
export function e3cExpectedTax(row: E3cRow, nonBusiness: boolean = row.expect.nonBusiness): number | undefined {
  const t = E3C_TRADE_TAX[`${row.acq ?? A}|${row.transfer ?? T24}`];
  return t ? (nonBusiness ? t.N : t.B) : undefined;
}
