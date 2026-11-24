/**
 * NBL-STATE-HISTORY-E3-⑤ 「철거 후 재산세 한시 지위(지방세법 시행령 §103의2)」 — 엔진 계획서 §7 케이스 표(K-n) 중 **일 단위 사업용 구간(`biz`)을 정할 수 있는 행**을 한 표로 옮긴 것.
 * 같은 표를 ① E3f-0 Pre-Do anchor(오라클 = `meetsPeriodCriteria`에 사업용 구간을 직접 + **현행 엔진** 실측) ② E3f-1b 꼬리 한도 anchor ③ E3f-2 구간 근거 leaf·엔진·route anchor가 쓴다.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.engine.plan.md v4 §3 · §4 · §7
 * 결정: V-1 일 단위(과세기준일 6.1. 단위 «접기» ⛔ 재제안 금지) · Q-4 (가) 과세기준일 «존재 검사» 게이트(창은 일 단위) · Q-6 (가) 꼬리 한도는 충분조건 접기만 · Q-1 (다) 나대지 구간 근거 `demolished`.
 *
 * 두 열
 *   · **오라클 열**(`biz` · `expect`) — 제안 모델(E3f-1b·E3f-2 적용 후)의 기대. `evalDayRow`(= `meetsPeriodCriteria`)에 사업용 구간을 직접 넣은 값이다. 구현 후 측정값이 다르면 표를 맞추지 말고 원인을 먼저 본다.
 *   · **현행 열**(`raw` · `current`) — 엔진(raw → ⑭ 매퍼 → 판정 → 세액) 실측. `flipsIn`이 있으면 그 PR에서 이 값이 오라클 열로 **뒤집힌다**(의도된 반전 — 그 PR이 `current`를 오라클로 갱신하고 `flipsIn`을 지운다).
 *     **E3f-1b가 K-11a · K-12 · K-12a · D-1 · D-1a를 뒤집었다**(꼬리 근거 «철거ㆍ멸실»이 철거일을 읽어 한시 기간이 확실히 지나면 접는다 — `current` = 오라클, `flipsIn` 삭제). E3f-2 행(K-1 · K-2b · K-5 · K-7 · K-7a)은 그대로다.
 *
 * 공통: 기타토지(잡종지) 1,000㎡ · 일반주거(배율 4) · 양도가 10억 · 취득가 3억 · `makeMockRates` · 기본 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일). 건물은 별도합산(사업용).
 * 세액 두 값: 전량 사업용 B = 198,210,000 · 전량 비사업용 N = 253,960,000 (차 55,750,000) — 취득·양도일이 기본값인 행만 단언한다.
 *
 * 이 표에 **없는** 행(근거): K-10~K-10h·K-16~K-18·K-29(⑧·⑫ 검증·격자 — 입력 칸이 E3f-1b·2에서 생긴다) · K-19~K-23(고지 — E3f-1a 연혁 anchor가 쓴다) · K-24~K-28(주택 철거·주택부수토지·축 B — 닫는 날·정착면적·수도권 시료가
 * 계획서에 없어 E3f-2 PR이 행을 더한다 · K-24는 «K-1과 같은 일수·판정»이라 K-1 행이 대신한다) · K-26·K-30.
 */

export type E35Interval = readonly [string, string];

export interface E35Row {
  id: string;
  scenario: string;
  acq?: string;
  transfer?: string;
  /** 오라클 — 제안 모델 적용 후의 사업용 구간(반열린 `[start, end)`, 꼬리 포함). */
  biz: readonly E35Interval[];
  /** 오라클 — 유예(9호) 구간. */
  grace?: readonly E35Interval[];
  expect: { nonBusiness: boolean; eff: number; total: number };
  /** 현행 엔진에 넣는 raw(= 와이어 칸). 아직 없는 입력 칸(사실 4칸·철거일)은 넣지 않는다 — 현행이 그 칸을 읽지 않는다는 사실 자체가 «현행 열»이다. */
  raw: Record<string, unknown>;
  /** 현행 엔진 실측. `tax`는 취득·양도일이 기본값인 행만. */
  current: { nonBusiness: boolean; eff: number; total: number; tax?: number };
  /** 이 PR에서 `current`가 `expect`로 뒤집힌다(판정 또는 일수). 없음 = 현행 = 오라클. */
  flipsIn?: "E3f-1b" | "E3f-2";
}

export const E35_B = 198_210_000; // 전량 사업용(2014-01-01 → 2024-01-01)
export const E35_N = 253_960_000; // 전량 비사업용
export const E35_SWING = E35_N - E35_B; // 55,750,000

const OS = "2014-01-02"; // 소유 첫날(취득일 다음날)
const T = "2024-01-01";

/** 공통 raw 바탕(기타토지 1,000㎡ · 일반주거). */
export const e35Base = (over: Record<string, unknown>): Record<string, unknown> => ({
  nblUseDetailedJudgment: true,
  nblLandType: "other_land",
  nblZoneType: "general_residential",
  acquisitionArea: "1000",
  acquisitionDate: "2014-01-01",
  transferDate: T,
  ...over,
});

/**
 * 나대지 구간 선언 행(E3f-2 대상) — 건물(별도합산) `bldStart`~철거 `removedOn`, 나대지, 신축 `builtOn`(닫는 행: Before = 별도합산 + 근거 «철거ㆍ멸실»), 꼬리 = 건물 + 별도합산.
 * 현행은 닫는 행의 `demolished`를 `demolished_unsupported`로 접는다. 사실 4칸(허가·건축 외 용도·빈집정비·바닥면적)은 E3f-2 전에는 읽는 곳이 없어 넣지 않는다.
 */
export const e35BareDecl = (removedOn: string, over: Record<string, unknown> = {}, bldStart = "2021-06-02", builtOn = "2023-12-01"): Record<string, unknown> =>
  e35Base({
    nblOtherPropertyTaxType: "separate",
    nblOtherHasBuilding: true,
    nblOtherBuildingFloorArea: "250",
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [
      { kind: "building_built", date: bldStart },
      { kind: "building_removed", date: removedOn, propertyTaxTypeBefore: "separate" },
      { kind: "building_built", date: builtOn, propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished" },
    ],
    ...over,
  });

/**
 * 꼬리 근거 행(E3f-1b 대상) — 건물(별도합산) `bldStart`~철거 `removedOn`, 꼬리 = 나대지 + 별도합산 + 근거 «철거ㆍ멸실»(종전 바닥면적 400㎡ × 4배 = 1,600㎡ ≥ 토지 1,000㎡).
 * E3f-1b 전 현행은 철거일을 읽지 않아 꼬리 전체를 사업용으로 셌다. 지금은 철거 행(이력 마지막 건축물 사건 = 철거)의 날짜를 출처 ①로 읽는다 — 이력 없이 새 칸(`nblOtherDemolishedOn`)을 쓰는 입력은 `over`로 준다.
 */
export const e35Tail = (removedOn: string, transfer: string, bldStart: string | undefined, over: Record<string, unknown> = {}): Record<string, unknown> =>
  e35Base({
    transferDate: transfer,
    nblOtherPropertyTaxType: "separate",
    nblOtherHasBuilding: false,
    nblOtherPropertyTaxBasis: "demolished",
    nblOtherDemolishedFloorArea: "400",
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [
      ...(bldStart ? [{ kind: "building_built", date: bldStart }] : []),
      { kind: "building_removed", date: removedOn, propertyTaxTypeBefore: "separate" },
    ],
    ...over,
  });

const NINE = (anchorDate: string) => ({ nblGracePeriods: [{ reasonCode: "demolition", anchorDate }] });

/** K-7 빈집 셀 — 건물 2020-06-01~철거 2021-06-02, 취득 2018-06-01, 양도 2024-09-01, 닫는 행 = 2024-08-01 구분 변경(Before 별도합산 + `demolished`). */
export const e35VacantCell = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  e35Base({
    acquisitionDate: "2018-06-01",
    transferDate: "2024-09-01",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherHasBuilding: false,
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: [
      { kind: "building_built", date: "2020-06-01" },
      { kind: "building_removed", date: "2021-06-02", propertyTaxTypeBefore: "separate" },
      { kind: "tax_type_changed", date: "2024-08-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished" },
    ],
    ...over,
  });

export const E35_ROWS: readonly E35Row[] = [
  // ── §7.1 나대지 구간 선언 (E3f-2) ──
  {
    id: "K-1", scenario: "건물 2021-06-02~철거 2022-12-15 · 신축 2023-12-01(근거 철거ㆍ멸실 · 허가 예 · 건축 외 용도 아니오 · 바닥면적 250㎡) — 창 [2022-12-15, 2023-06-15) 182일",
    biz: [["2021-06-02", "2022-12-15"], ["2022-12-15", "2023-06-15"], ["2023-12-01", T]],
    expect: { nonBusiness: false, eff: 774, total: 3651 },
    raw: e35BareDecl("2022-12-15"), current: { nonBusiness: true, eff: 592, total: 3651, tax: E35_N }, flipsIn: "E3f-2",
  },
  {
    id: "K-2a", scenario: "K-1에서 철거 2022-12-01 — 철거일 + 6개월 = 2023-06-01 = 과세기준일(「6개월이 지나지 않은」이 아님) → 게이트 실패 → 접음",
    biz: [["2021-06-02", "2022-12-01"], ["2023-12-01", T]],
    expect: { nonBusiness: true, eff: 578, total: 3651 },
    raw: e35BareDecl("2022-12-01"), current: { nonBusiness: true, eff: 578, total: 3651, tax: E35_N },
  },
  {
    id: "K-2b", scenario: "K-1에서 철거 2022-12-02 — 게이트 통과 → 창 [2022-12-02, 2023-06-02)",
    biz: [["2021-06-02", "2022-12-02"], ["2022-12-02", "2023-06-02"], ["2023-12-01", T]],
    expect: { nonBusiness: false, eff: 761, total: 3651 },
    raw: e35BareDecl("2022-12-02"), current: { nonBusiness: true, eff: 579, total: 3651, tax: E35_N }, flipsIn: "E3f-2",
  },
  {
    id: "K-3", scenario: "철거 2022-07-01(6개월 안에 과세기준일 없음) → 접음 `demolished_never_period` (창을 줘도 609일 비사업용 — 판정은 같고 일수만 다르다)",
    biz: [["2021-06-02", "2022-07-01"], ["2023-12-01", T]],
    expect: { nonBusiness: true, eff: 425, total: 3651 },
    raw: e35BareDecl("2022-07-01"), current: { nonBusiness: true, eff: 425, total: 3651, tax: E35_N },
  },
  {
    id: "K-5", scenario: "철거 2018-03-01 · 신축 2019-12-01(후보 과세기준일 2018-06-01만 성립 — 허가·건축 외 용도 칸을 요구하지 않는다) · 창 [2018-03-01, 2018-09-01) — 계획서에 수치 없음(오라클 계산값)",
    biz: [[OS, "2018-03-01"], ["2018-03-01", "2018-09-01"], ["2019-12-01", T]],
    expect: { nonBusiness: false, eff: 3195, total: 3651 },
    raw: e35Base({
      nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "250", nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [
        { kind: "building_removed", date: "2018-03-01", propertyTaxTypeBefore: "separate" },
        { kind: "building_built", date: "2019-12-01", propertyTaxTypeBefore: "separate", propertyTaxBasisBefore: "demolished" },
      ],
    }),
    current: { nonBusiness: false, eff: 3011, total: 3651, tax: E35_B }, flipsIn: "E3f-2",
  },
  {
    id: "K-7", scenario: "빈집 셀: 건물 2020-06-01~철거 2021-06-02 · 취득 2018-06-01 · 양도 2024-09-01 · 닫는 행 2024-08-01 근거 철거ㆍ멸실 + 빈집정비 예 — W* 3년 창 [2021-06-02, 2024-06-02)",
    acq: "2018-06-01", transfer: "2024-09-01",
    biz: [["2020-06-01", "2021-06-02"], ["2021-06-02", "2024-06-02"]],
    expect: { nonBusiness: false, eff: 1462, total: 2283 },
    // 현행: 9호도 없으므로 건물 366일만 — 9호 단독(K-7 9호 행)은 아래 K-7a.
    raw: e35VacantCell(), current: { nonBusiness: true, eff: 366, total: 2283 }, flipsIn: "E3f-2",
  },
  {
    id: "K-7a", scenario: "K-7 + 9호 유예(철거일 기산 · 양도 2025.3.21. 전 2년) — 9호 단독은 비사업용 1,096/2,283 (이 행이 «빈집 셀»의 현행 결함: 법문상 3년이면 사업용)",
    acq: "2018-06-01", transfer: "2024-09-01",
    biz: [["2020-06-01", "2021-06-02"], ["2021-06-02", "2024-06-02"]],
    expect: { nonBusiness: false, eff: 1462, total: 2283 },
    raw: e35VacantCell(NINE("2021-06-02")), current: { nonBusiness: true, eff: 1096, total: 2283 }, flipsIn: "E3f-2",
  },
  {
    id: "K-8", scenario: "K-1(철거 2022-12-15) + 9호 2년 행 — 창 ∪ 9호 = 9호 단독과 같음(이중 계산 없음)",
    biz: [["2021-06-02", "2022-12-15"], ["2022-12-15", "2023-06-15"], ["2023-12-01", T]], grace: [["2022-12-15", "2024-12-15"]],
    expect: { nonBusiness: false, eff: 943, total: 3651 },
    raw: e35BareDecl("2022-12-15", NINE("2022-12-15")), current: { nonBusiness: false, eff: 943, total: 3651, tax: E35_B },
  },
  // ── §7.2 꼬리 근거 (E3f-1b) ──
  {
    id: "K-11a", scenario: "꼬리 근거 · 철거 2022-12-01 · 양도 2024-05-31(직전 과세기준일 2023-06-01 ≥ 철거일 + 6개월) → 확실히 지남 → 접음(종합합산 + 확인 필요)",
    transfer: "2024-05-31",
    biz: [["2021-06-02", "2022-12-01"]],
    expect: { nonBusiness: true, eff: 547, total: 3802 },
    raw: e35Tail("2022-12-01", "2024-05-31", "2021-06-02"), current: { nonBusiness: true, eff: 547, total: 3802 },
  },
  {
    id: "K-11b", scenario: "철거 2022-12-02 · 양도 2024-05-31 — 직전 과세기준일 < 철거일 + 6개월 → 접지 않음 → 꼬리 전체 사업용(경계 쌍 — 날짜 하나 차이로 갈린다)",
    transfer: "2024-05-31",
    biz: [["2021-06-02", "2024-05-31"]],
    expect: { nonBusiness: false, eff: 1094, total: 3802 },
    raw: e35Tail("2022-12-02", "2024-05-31", "2021-06-02"), current: { nonBusiness: false, eff: 1094, total: 3802 },
  },
  {
    id: "K-12", scenario: "v1 D4 시료(건물 2019-01-01~철거 2020-01-01 · 양도 2024-01-01) 접음 + 9호 없음 → 비사업용 365",
    biz: [["2019-01-01", "2020-01-01"]],
    expect: { nonBusiness: true, eff: 365, total: 3651 },
    raw: e35Tail("2020-01-01", T, "2019-01-01"), current: { nonBusiness: true, eff: 365, total: 3651, tax: E35_N },
  },
  {
    id: "K-12a", scenario: "K-12 + 9호 2년 — 접음 + 9호 = 사업용 1,096(E3f-1b 전 현행은 철거 후 4년 전체를 사업용으로 세어 1,826) · 판정·세액 불변(B)",
    biz: [["2019-01-01", "2020-01-01"]], grace: [["2020-01-01", "2022-01-01"]],
    expect: { nonBusiness: false, eff: 1096, total: 3651 },
    raw: e35Tail("2020-01-01", T, "2019-01-01", NINE("2020-01-01")), current: { nonBusiness: false, eff: 1096, total: 3651, tax: E35_B },
  },
  {
    id: "K-13", scenario: "철거 2023-07-01 · 양도 2023-12-01(철거 후 과세기준일 없음 — 직전 과세기준일 지위는 건축물 부속토지) → 접지 않음 — 현행과 같다",
    transfer: "2023-12-01",
    biz: [["2021-06-02", "2023-12-01"]],
    expect: { nonBusiness: false, eff: 912, total: 3620 },
    raw: e35Tail("2023-07-01", "2023-12-01", "2021-06-02"), current: { nonBusiness: false, eff: 912, total: 3620 },
  },
  {
    id: "K-14", scenario: "철거 2022-12-01 · 양도 2024-06-01 — 2024 시행본이라 W_max = 3년(빈집 가능성을 배제할 수 없다) → 접지 않음",
    transfer: "2024-06-01",
    biz: [["2021-06-02", "2024-06-01"]],
    expect: { nonBusiness: false, eff: 1095, total: 3803 },
    raw: e35Tail("2022-12-01", "2024-06-01", "2021-06-02"), current: { nonBusiness: false, eff: 1095, total: 3803 },
  },
  // ── 현행 결함 고정 — 철거 6년 뒤에도 꼬리 근거가 전량 사업용 ──
  {
    id: "D-1", scenario: "건물 취득~철거 2018-01-01(6년 전) · 꼬리 근거 «철거ㆍ멸실» · 9호 없음 — E3f-1b 전 현행은 철거 후 6년 전체를 사업용으로 세어 B(198,210,000), 한시(철거 후 6개월·1년)가 지났으니 접어 N(253,960,000)",
    biz: [[OS, "2018-01-01"]],
    expect: { nonBusiness: true, eff: 1460, total: 3651 },
    raw: e35Tail("2018-01-01", T, undefined), current: { nonBusiness: true, eff: 1460, total: 3651, tax: E35_N },
  },
  {
    id: "D-1a", scenario: "D-1 + 9호 2년 — 9호는 철거 후 2년만 덮는다 → 접어 N(E3f-1b 전 현행 B). 9호 입력자도 6년 뒤 꼬리는 사업용이 아니다",
    biz: [[OS, "2018-01-01"]], grace: [["2018-01-01", "2020-01-01"]],
    expect: { nonBusiness: true, eff: 2190, total: 3651 },
    raw: e35Tail("2018-01-01", T, undefined, NINE("2018-01-01")), current: { nonBusiness: true, eff: 2190, total: 3651, tax: E35_N },
  },
  {
    id: "D-2", scenario: "철거 2018-01-01 · 근거 없음(종합합산 꼬리) + 9호 2년만 — 현행도 N(253,960,000). 같은 입력에 근거를 선언하면 B로 바뀌는 비일관이 D-1의 정체",
    biz: [[OS, "2018-01-01"]], grace: [["2018-01-01", "2020-01-01"]],
    expect: { nonBusiness: true, eff: 2190, total: 3651 },
    raw: e35Base({
      nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false, nblOtherStateHistoryMode: "changed",
      nblOtherStateEvents: [{ kind: "building_removed", date: "2018-01-01", propertyTaxTypeBefore: "separate" }], ...NINE("2018-01-01"),
    }),
    current: { nonBusiness: true, eff: 2190, total: 3651, tax: E35_N },
  },
];

/**
 * E3f-1b 연혁 정정 — 철거 전 바닥면적 × 영 §101② 배율 **면적 범위 문언은 2024.6.1. 과세기준일 시행본부터**(사용자 결정 2026-11-24 · `demolishedAreaClauseApplies`).
 * 양도일 직전 마지막 과세기준일이 그 전이면 면적 제한 없이 부속토지 전체를 별도합산 범위로 본다. `before` = E3f-1b 전(모든 양도일에 배율 적용 · `OLD_AREA=1` probe 실측) · `after` = 지금.
 * 공통: 취득 2014-01-01 · 건물 2021-06-02~철거 · 꼬리 근거 «철거ㆍ멸실»(별도합산 + 나대지) · 잡종지 1,000㎡ · 일반주거(배율 4). 세액은 양도가 10억 · 취득가 3억 `makeMockRates`(취득 2014-01-01 → 양도 2024-01-01 기본 시료만 B/N 대조).
 * **세액이 줄어드는 방향만** 바뀐다(면적 제한이 풀리거나 그대로). 모름·미입력 방향 변화는 없다(`transferDate` 미입력 = 제한 적용 — 입력 누락이 제한을 풀지 않는다).
 */
export interface E35AreaRow {
  id: string;
  scenario: string;
  raw: Record<string, unknown>;
  /** 비사업용 판정 · 비사업용 면적 비율 · 산출세액(`calculatedTax`) */
  before: { nonBusiness: boolean; ratio: number; tax: number };
  after: { nonBusiness: boolean; ratio: number; tax: number };
}

const AREA_TAX_PARTIAL_60 = 205_990_000; // 비사업용 면적 60%(바닥면적 100㎡ × 4 = 400㎡ < 1,000㎡) — E35_B보다 7,780,000 많다
export const E35_AREA_ROWS: readonly E35AreaRow[] = [
  {
    id: "K-31a", scenario: "바닥면적 100㎡(허용 400㎡) · 철거 2023-12-01 · 양도 2024-01-01 — 직전 과세기준일 2023-06-01은 면적 범위 문언이 없는 시행본 → 부속토지 1,000㎡ 전체 별도합산 범위",
    raw: e35Tail("2023-12-01", T, "2021-06-02", { nblOtherDemolishedFloorArea: "100" }),
    before: { nonBusiness: true, ratio: 0.6, tax: AREA_TAX_PARTIAL_60 }, after: { nonBusiness: false, ratio: 0, tax: E35_B },
  },
  {
    id: "K-31b", scenario: "K-31a와 같은 면적 · 철거 2024-03-01 · 양도 2024-05-31(경계 하루 전) — 직전 과세기준일 2023-06-01 → 면적 제한 없음",
    raw: e35Tail("2024-03-01", "2024-05-31", "2021-06-02", { nblOtherDemolishedFloorArea: "100" }),
    before: { nonBusiness: true, ratio: 0.6, tax: AREA_TAX_PARTIAL_60 }, after: { nonBusiness: false, ratio: 0, tax: E35_B },
  },
  {
    id: "K-31c", scenario: "K-31b에서 양도 2024-06-01(경계 당일) — 직전 과세기준일 2024-06-01은 면적 범위 문언이 있는 시행본 → 종전과 같다(허용 400㎡ · 비사업용 60%)",
    raw: e35Tail("2024-03-01", "2024-06-01", "2021-06-02", { nblOtherDemolishedFloorArea: "100" }),
    before: { nonBusiness: true, ratio: 0.6, tax: AREA_TAX_PARTIAL_60 }, after: { nonBusiness: true, ratio: 0.6, tax: AREA_TAX_PARTIAL_60 },
  },
  {
    id: "K-31d", scenario: "바닥면적 200㎡(허용 800㎡ · 비사업용 20%) · 양도 2024-01-01 — 판정은 비사업용 → 사업용으로 뒤집히나 세액은 같다 — 결함이 아니다: 한 필지 일부 비사업용은 §104⑤ 비교과세(max(1호 합산 누진, 2호 호별 합))라 비율이 낮으면(이 시료 ≤ 0.4) 1호가 이긴다(`e3-5b-tail` G가 산식으로 고정)",
    raw: e35Tail("2023-12-01", T, "2021-06-02", { nblOtherDemolishedFloorArea: "200" }),
    before: { nonBusiness: true, ratio: 0.2, tax: E35_B }, after: { nonBusiness: false, ratio: 0, tax: E35_B },
  },
];
