/**
 * NBL-STATE-HISTORY-E2 — 엔진 계획서 §6 케이스 매트릭스 «일 단위» 열을 **raw 입력(= 와이어 칸 이름)** 으로 옮긴 표.
 * 같은 표를 엔진 단위 테스트(`mapAssetToNblInput` → `judgeNonBusinessLand`)와 route 관통 테스트(`POST /api/calc/transfer`)가 쓴다 —
 * «입력 → ⑫ → ⑭ → 엔진 → 세액»이 같은 값인지 한 표로 대조한다.
 *
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §6(기대값 정본 «일 단위» 열) · §7.2
 * 결정: V-1 일 단위(과세기준일 접기 재제안 금지) · Q-15 (가′).
 *
 * 공통: 기타토지(잡종지) 1,000㎡ · 일반주거 · 양도가 10억 · 취득가 3억 · `makeMockRates`. 기본 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일).
 * 꼬리(양도일 현재 상태): 마지막 사건이 신축이면 «건축물 있음 + 별도합산(바닥면적 250㎡ × 4배 = 1,000㎡ 이내)», 철거이면 «나대지 + 종합합산».
 * 철거 사건의 `propertyTaxTypeBefore`는 별도합산(건축물 있던 구간을 사업용으로 선언)이 기본이고 R3만 «모름».
 * `tax`는 계획서 §6의 «이력 반영 시 세액»(산출세액) — 값이 있는 행만 단언한다.
 */

export type EventSpec = readonly ["building_built" | "building_removed", string, ("" | "separate" | "special_sum" | "exempt" | "comprehensive")?];

export interface GraceSpec {
  reasonCode: string;
  anchorDate?: string;
  endDate?: string;
  secondaryDate?: string;
}

export interface E2Row {
  id: string;
  scenario: string;
  acq?: string;
  transfer?: string;
  events: readonly EventSpec[];
  grace?: readonly GraceSpec[];
  /** 기본 tail 대신 쓰는 raw 덮어쓰기(3호·DM-01 시료) */
  extra?: Record<string, unknown>;
  expect: {
    nonBusiness: boolean;
    /** `effectiveBusinessDays`(= 사업용 구간 ∪ 유예) */
    eff: number;
    total: number;
    /** `gracePeriodDays`(유예 가산) — 있는 행만 */
    graceDays?: number;
    /** 산출세액 — 계획서 §6 값이 있는 행만 */
    tax?: number;
  };
}

const B = 198_210_000; // 전량 사업용(2014-01-01 → 2024-01-01)
const N = 253_960_000; // 전량 비사업용

const rm = (date: string, before: EventSpec[2] = "separate"): EventSpec => ["building_removed", date, before];
const built = (date: string): EventSpec => ["building_built", date];

/** 계획서 §6 대표 행 — 철거·신축 이력의 일 단위 정답(판정·일수·세액). 임계선 쌍(나목 730/729 · 윤일 창 731/730 · 다목 1,460/1,461 · 가목 730/731)을 모두 포함한다. */
export const E2_ROWS: readonly E2Row[] = [
  { id: "M1", scenario: "철거 후 나대지: 건물(별도합산) 2014-01-02~2021-01-01 → 나대지", events: [rm("2021-01-01")], expect: { nonBusiness: false, eff: 2556, total: 3651, tax: B } },
  { id: "M2", scenario: "M1 + 9호 유예 2년(양도 2025.3.21. 전)", events: [rm("2021-01-01")], grace: [{ reasonCode: "demolition", anchorDate: "2021-01-01" }], expect: { nonBusiness: false, eff: 3286, total: 3651, graceDays: 730, tax: B } },
  { id: "M3", scenario: "철거 2019-01-01 + 9호 유예(731일)", events: [rm("2019-01-01")], grace: [{ reasonCode: "demolition", anchorDate: "2019-01-01" }], expect: { nonBusiness: false, eff: 2556, total: 3651, graceDays: 731, tax: B } },
  { id: "M4", scenario: "철거 2022-06-01 — 직전 3년 비사업 579일(가 미충족)", events: [rm("2022-06-01")], expect: { nonBusiness: false, eff: 3072, total: 3651, tax: B } },
  { id: "M4b", scenario: "철거 2022-06-02", events: [rm("2022-06-02")], expect: { nonBusiness: false, eff: 3073, total: 3651, tax: B } },
  {
    id: "M5", scenario: "양도 2025-06-01(9호 5년) · 철거 2021-01-01 · 9호 행", transfer: "2025-06-01", events: [rm("2021-01-01")],
    grace: [{ reasonCode: "demolition", anchorDate: "2021-01-01" }], expect: { nonBusiness: false, eff: 4168, total: 4168, graceDays: 1612, tax: 192_330_000 },
  },
  { id: "M6", scenario: "신축 직후 양도: 나대지 → 준공 2023-06-01, 현재 별도합산+건물", events: [built("2023-06-01")], expect: { nonBusiness: true, eff: 214, total: 3651, tax: N } },
  { id: "M6b", scenario: "준공 2023-06-02", events: [built("2023-06-02")], expect: { nonBusiness: true, eff: 213, total: 3651, tax: N } },
  {
    id: "M7", scenario: "M6 + 5호 유예(취득 후 2년 + 착공 2022-06-01~준공 2023-06-01) — 합집합이라 이중 계상 없음", events: [built("2023-06-01")],
    grace: [{ reasonCode: "construction_in_progress", secondaryDate: "2022-06-01", endDate: "2023-06-01" }], expect: { nonBusiness: true, eff: 1308, total: 3651, graceDays: 1094, tax: N },
  },
  {
    id: "M7b", scenario: "M7 변형: 5호 건설진행이 준공 2023-09-01까지 이어져 신축 이후 구간(2023-06-01~)과 92일 겹침 — 합집합이라 M7과 같은 1,308 (산술 합산이면 1,400)", events: [built("2023-06-01")],
    grace: [{ reasonCode: "construction_in_progress", secondaryDate: "2022-06-01", endDate: "2023-09-01" }], expect: { nonBusiness: true, eff: 1308, total: 3651, graceDays: 1094, tax: N },
  },
  { id: "M8a", scenario: "나목 경계: 준공 2022-01-01 — 직전 3년 비사업 365(미충족)", events: [built("2022-01-01")], expect: { nonBusiness: false, eff: 730, total: 3651, tax: B } },
  { id: "M8b", scenario: "나목 경계: 준공 2022-01-02 — 비사업 366(충족)", events: [built("2022-01-02")], expect: { nonBusiness: true, eff: 729, total: 3651, tax: N } },
  { id: "M8c-731", scenario: "윤일 낀 창: 양도 2024-03-01 · 준공 2022-03-01(꼬리 731일)", transfer: "2024-03-01", events: [built("2022-03-01")], expect: { nonBusiness: false, eff: 731, total: 3711 } },
  { id: "M8c-730", scenario: "윤일 낀 창: 양도 2024-03-01 · 준공 2022-03-02(꼬리 730일)", transfer: "2024-03-01", events: [built("2022-03-02")], expect: { nonBusiness: true, eff: 730, total: 3711 } },
  { id: "G1", scenario: "v2 폐기 가드: 준공 2022-06-01(6.1. 당일) — 6.1.은 특별하지 않다", events: [built("2022-06-01")], expect: { nonBusiness: true, eff: 579, total: 3651, tax: N } },
  { id: "G2", scenario: "v2 폐기 가드: 철거 2020-06-01(6.1. 당일)", events: [rm("2020-06-01")], expect: { nonBusiness: false, eff: 2342, total: 3651, tax: B } },
  { id: "M13", scenario: "단기 보유(취득 2022-07-01, 소유 548일) · 준공 2023-10-01 — 3호 단서(소유 2년 미만)", acq: "2022-07-01", events: [built("2023-10-01")], expect: { nonBusiness: true, eff: 92, total: 548, tax: 326_760_000 } },
  { id: "M14-1", scenario: "축 B 지분1(취득 2014-01-01): 같은 이력 철거 2021-01-01", events: [rm("2021-01-01")], expect: { nonBusiness: false, eff: 2556, total: 3651, tax: B } },
  { id: "M14-2", scenario: "축 B 지분2(취득 2020-01-01, 소유 1,460일): 소유 후 365일만 건축물 구간", acq: "2020-01-01", events: [rm("2021-01-01")], expect: { nonBusiness: true, eff: 365, total: 1460, tax: 297_640_000 } },
  { id: "M14-3", scenario: "축 B 지분3(취득 2021-06-01, 소유 943일): 철거 사건이 소유 시작 전 — 클립", acq: "2021-06-01", events: [rm("2021-01-01")], expect: { nonBusiness: true, eff: 0, total: 943, tax: 326_760_000 } },
  { id: "M16c-built", scenario: "소유 1일 + 사건일 = 소유 첫날(2023-12-31): 꼬리 건축물(별도합산) → 사업용(비사업 0 > 0 아님)", acq: "2023-12-30", events: [built("2023-12-31")], expect: { nonBusiness: false, eff: 1, total: 1 } },
  { id: "M16c-bare", scenario: "소유 1일 + 사건일 = 소유 첫날(2023-12-31): 꼬리 나대지 → 비사업용(1 > 0)", acq: "2023-12-30", events: [rm("2023-12-31")], expect: { nonBusiness: true, eff: 0, total: 1 } },
  { id: "M16", scenario: "소유 0일(취득 2023-12-31 · 양도 2024-01-01) — 이력과 무관 비사업용(B = N = 348,750,000)", acq: "2023-12-31", events: [rm("2023-12-31")], expect: { nonBusiness: true, eff: 0, total: 0, tax: 348_750_000 } },
  { id: "M17", scenario: "윤년: 취득 2020-02-29 · 양도 2024-02-29(소유 1,460일), 준공 2023-01-01", acq: "2020-02-29", transfer: "2024-02-29", events: [built("2023-01-01")], expect: { nonBusiness: true, eff: 424, total: 1460, tax: 297_640_000 } },
  { id: "M17b", scenario: "윤일 사건: 철거 2020-02-29(별도합산 선언)", events: [rm("2020-02-29")], expect: { nonBusiness: false, eff: 2249, total: 3651, tax: B } },
  { id: "Z-1462", scenario: "다목 40% 쌍: 철거 2019-12-31 — 비사업 1,462(> 1,460)", events: [rm("2019-12-31")], expect: { nonBusiness: true, eff: 2189, total: 3651, tax: N } },
  { id: "Z-1461", scenario: "다목 40% 쌍: 철거 2020-01-01 — 비사업 1,461(> 1,460)", events: [rm("2020-01-01")], expect: { nonBusiness: true, eff: 2190, total: 3651, tax: N } },
  { id: "Z-1460", scenario: "다목 40% 쌍: 철거 2020-01-02 — 비사업 1,460(≤ 1,460)", events: [rm("2020-01-02")], expect: { nonBusiness: false, eff: 2191, total: 3651, tax: B } },
  { id: "R1a", scenario: "철거 2020-05-31", events: [rm("2020-05-31")], expect: { nonBusiness: false, eff: 2341, total: 3651, tax: B } },
  { id: "R1b", scenario: "철거 2020-06-02", events: [rm("2020-06-02")], expect: { nonBusiness: false, eff: 2343, total: 3651, tax: B } },
  { id: "GA-730", scenario: "가목 쌍: 건물 2019-01-01~철거 2022-01-01 — 직전 5년 비사업 730(미충족)", events: [built("2019-01-01"), rm("2022-01-01")], expect: { nonBusiness: false, eff: 1096, total: 3651, tax: B } },
  { id: "GA-731", scenario: "가목 쌍: 건물 2019-01-01~철거 2021-12-31 — 직전 5년 비사업 731(가·나·다 충족)", events: [built("2019-01-01"), rm("2021-12-31")], expect: { nonBusiness: true, eff: 1095, total: 3651, tax: N } },
  { id: "R2", scenario: "철거 2020-06-01 + 9호 유예 2년", events: [rm("2020-06-01")], grace: [{ reasonCode: "demolition", anchorDate: "2020-06-01" }], expect: { nonBusiness: false, eff: 3072, total: 3651, graceDays: 730, tax: B } },
  { id: "R3", scenario: "철거 2020-06-01 + 철거 직전 재산세 구분 «모름»(종합합산) — 사업용 구간 없음", events: [rm("2020-06-01", "")], expect: { nonBusiness: true, eff: 0, total: 3651, tax: N } },
  { id: "S1", scenario: "같은 해 두 번: 철거 2022-03-01 → 재신축 2022-05-01", events: [rm("2022-03-01"), built("2022-05-01")], expect: { nonBusiness: false, eff: 3590, total: 3651, tax: B } },
  { id: "S2", scenario: "같은 해 두 번: 신축 2023-03-01 → 철거 2023-04-01", events: [built("2023-03-01"), rm("2023-04-01")], expect: { nonBusiness: true, eff: 31, total: 3651, tax: N } },
  { id: "P1", scenario: "취득 2021-09-01 · 신축 2022-03-01 · 양도 2024-01-01(소유 851일, 3호 버킷)", acq: "2021-09-01", events: [built("2022-03-01")], expect: { nonBusiness: false, eff: 671, total: 851, tax: 257_010_000 } },
  { id: "P2", scenario: "양도 2024-03-15 · 철거 2024-02-01(꼬리 43일)", transfer: "2024-03-15", events: [rm("2024-02-01")], expect: { nonBusiness: false, eff: 3682, total: 3725, tax: B } },
  { id: "P3", scenario: "양도 2024-09-15 · 신축 2024-07-01", transfer: "2024-09-15", events: [built("2024-07-01")], expect: { nonBusiness: true, eff: 76, total: 3909, tax: N } },
  // ── Q-15 (가′) — core 자체 사업기간(3호 · DM-01)과 이력 ──
  {
    id: "V21-3호", scenario: "3호 조성 완료 2021-01-02 · 취득 2021-01-01 · 신축 2021-07-01 — (가′) 소유기간 ∩ 3호 = 730/1,094 사업용(초판 (가) 문언은 550 비사업용)",
    acq: "2021-01-01", events: [built("2021-07-01")],
    extra: { nblZoneType: "management", nblOtherPropertyTaxType: "comprehensive", nblOtherRelatedBusinessType: "private_investment_land", nblOtherPrivateInvestCompletionDate: "2021-01-02" },
    expect: { nonBusiness: false, eff: 730, total: 1094 },
  },
  {
    id: "V21-DM01", scenario: "DM-01 개시일 2022-01-01 · 신축 2023-01-01 · 양도 2024-06-30 — (가′) 911/3,832 사업용(초판 (가) 문언은 546 비사업용)",
    transfer: "2024-06-30", events: [built("2023-01-01")],
    extra: { nblZoneType: "commercial", ...revenueRaw("2022-01-01") },
    expect: { nonBusiness: false, eff: 911, total: 3832 },
  },
  {
    id: "Q15a", scenario: "DM-01 개시일 2024-03-01 · 철거 2016-01-01(별도합산) · 양도 2024-06-30 — 비사업용 유지(사업 850 = 건축물 729 + 121)",
    transfer: "2024-06-30", events: [rm("2016-01-01")],
    extra: { nblZoneType: "commercial", ...revenueRaw("2024-03-01") },
    expect: { nonBusiness: true, eff: 850, total: 3832 },
  },
];

function revenueRaw(startDate: string): Record<string, unknown> {
  return {
    nblRevenueBusinessType: "parking_operation",
    nblRevenueCurrentRevenue: "20000000",
    nblRevenueCurrentLandValue: "100000000",
    nblRevenueCurrentBusinessStartDate: startDate,
  };
}

/** 행 → raw 와이어 칸(`nonBusinessLandRaw`) — 마지막 사건이 신축이면 꼬리 = 건축물 있음 + 별도합산, 철거이면 나대지 + 종합합산. 숨은 토글(`nblOtherHasBuilding`)은 사건과 같은 값으로 둔다(모순은 V-19 anchor가 따로 본다). */
export function e2RowRaw(row: E2Row): Record<string, unknown> {
  const last = row.events[row.events.length - 1];
  const builtTail = last[0] === "building_built";
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    acquisitionArea: "1000",
    acquisitionDate: row.acq ?? "2014-01-01",
    transferDate: row.transfer ?? "2024-01-01",
    nblOtherPropertyTaxType: builtTail ? "separate" : "comprehensive",
    nblOtherHasBuilding: builtTail,
    nblOtherBuildingFloorArea: builtTail ? "250" : "",
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: row.events.map(([kind, date, before]) => ({ kind, date, ...(kind === "building_removed" ? { propertyTaxTypeBefore: before ?? "separate" } : {}) })),
    nblGracePeriods: (row.grace ?? []).map((g) => ({ ...g })),
    ...row.extra,
  };
}
