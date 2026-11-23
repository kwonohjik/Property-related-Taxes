/**
 * NBL-STATE-HISTORY-E3-① 「재산세 구분 변경 사건」 — 엔진 계획서 §5 케이스 매트릭스(일 단위 정본) 21행을 **한 표**로 옮긴 것.
 * 같은 표를 ① E0 Anchor 1(`meetsPeriodCriteria`에 `biz`를 직접 — 지금 코드로 green) · ② E3-1a leaf 단위(사건 → 구간 → 사업용 구간 = `biz`) ·
 * ③ 엔진 단위(raw → ⑭ 매퍼 → 판정·세액) · ④ route 관통(raw → ⑫ → ⑭ → 엔진 → 세액)이 쓴다 — «입력 → 구간 → 판정 → 세액»이 같은 값인지 한 표로 대조한다.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-1-tax-type-change.engine.plan.md §3.1(Before 사슬) · §5(매트릭스) · §7.2 · «결정 기록 (2026-11-23 사용자)»
 * 결정: V-1 일 단위(과세기준일 접기 ⛔) · Before 사슬 — 사건의 `propertyTaxTypeBefore` = 그 사건이 **닫는 구간**의 재산세 구분, 꼬리 구분은 기존 입력 ·
 *       «모름»(`""`) = 혜택 불성립 + 확인 필요 · V-6 닫힘(신축 앞 나대지 구간은 종합합산 고정 — 신축 행의 Before는 뜻이 없다).
 *
 * 공통: 기타토지(잡종지) 1,000㎡ · 일반주거 · 양도가 10억 · 취득가 3억 · `makeMockRates`. 기본 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일).
 * 꼬리 = «양도일 현재» — 마지막 건축물 사건이 철거이면 나대지, 그 밖에는 건축물 있음(바닥면적 250㎡ ≤ 배율 한도 1,000㎡)에 `tail` 구분.
 * 기댓값은 계획서 §5 수치 그대로다(2026-11-23 probe). 구현 후 측정값이 다르면 표를 맞추지 말고 원인을 먼저 본다.
 */

export type E3EventKind = "building_built" | "building_removed" | "tax_type_changed";
export type E3TaxType = "" | "separate" | "special_sum" | "exempt" | "comprehensive";

/** [종류, 날짜, 직전(닫는 구간) 재산세 구분 — 건축물 신축 행에서는 뜻이 없다] */
export type E3EventSpec = readonly [E3EventKind, string, E3TaxType?];

export interface E3Row {
  id: string;
  scenario: string;
  acq?: string;
  transfer?: string;
  events: readonly E3EventSpec[];
  /** 양도일 현재 재산세 구분(기존 입력 `nblOtherPropertyTaxType`). */
  tail: Exclude<E3TaxType, "">;
  /** 양도가(원) — 양도차손 시료만 덮어쓴다. */
  transferPrice?: number;
  /** 사건 → 구간 → 사업용 구간(꼬리 포함, 반열린 `[start, end)`) — 손으로 쓴 독립 정답. leaf 단위 테스트가 `derive`의 결과와 대조한다. */
  biz: ReadonlyArray<readonly [string, string]>;
  expect: {
    nonBusiness: boolean;
    /** `effectiveBusinessDays` */
    eff: number;
    total: number;
    /** 산출세액 — 계획서 §5에 값이 있는 행만 */
    tax?: number;
    /** 소유기간 버킷(영 §168의6 1~3호) */
    bucket: 1 | 2 | 3;
  };
}

export const E3_B = 198_210_000; // 전량 사업용(2014-01-01 → 2024-01-01)
export const E3_N = 253_960_000; // 전량 비사업용
export const E3_SWING = E3_N - E3_B; // 55,750,000

const A = "2014-01-01";
const OS = "2014-01-02"; // 소유 첫날(취득일 다음날)
const T = "2024-01-01";

const tax = (date: string, before: E3TaxType): E3EventSpec => ["tax_type_changed", date, before];

/** 계획서 §5 21행 — T1~T15 · 임계선 쌍(T3a/b 나목 730/729 · T4a/b 다목 1,460/1,461 · T12a/b 윤일 창 731/730). */
export const E3_ROWS: readonly E3Row[] = [
  { id: "T1", scenario: "M12: 별도합산 → 종합합산 2022-06-01(꼬리 종합합산 · 건축물 유지) — 현행 비사업용 → 사업용(사업 3,072 · 비사업 579)", events: [tax("2022-06-01", "separate")], tail: "comprehensive",
    biz: [[OS, "2022-06-01"]], expect: { nonBusiness: false, eff: 3072, total: 3651, tax: E3_B, bucket: 1 } },
  { id: "T1b", scenario: "같은 변경 2022-06-02", events: [tax("2022-06-02", "separate")], tail: "comprehensive",
    biz: [[OS, "2022-06-02"]], expect: { nonBusiness: false, eff: 3073, total: 3651, tax: E3_B, bucket: 1 } },
  { id: "T2", scenario: "종합합산 → 별도합산 2023-06-01(사용승인 후 · 꼬리 별도합산) — 현행 사업용 → 비사업용(사업 214)", events: [tax("2023-06-01", "comprehensive")], tail: "separate",
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3_N, bucket: 1 } },
  { id: "T3a", scenario: "임계선 쌍 ①(나목): 종합 → 별도 2022-01-01 — 꼬리 730일 «1년 초과» 충족", events: [tax("2022-01-01", "comprehensive")], tail: "separate",
    biz: [["2022-01-01", T]], expect: { nonBusiness: false, eff: 730, total: 3651, tax: E3_B, bucket: 1 } },
  { id: "T3b", scenario: "임계선 쌍 ②(나목): 2022-01-02 — 꼬리 729일 미충족", events: [tax("2022-01-02", "comprehensive")], tail: "separate",
    biz: [["2022-01-02", T]], expect: { nonBusiness: true, eff: 729, total: 3651, tax: E3_N, bucket: 1 } },
  { id: "T4a", scenario: "임계선 쌍 ①(다목 40%): 별도 → 종합 2020-01-02 — 비사업 1,460 ≤ floor(3,651×0.4)=1,460", events: [tax("2020-01-02", "separate")], tail: "comprehensive",
    biz: [[OS, "2020-01-02"]], expect: { nonBusiness: false, eff: 2191, total: 3651, tax: E3_B, bucket: 1 } },
  { id: "T4b", scenario: "임계선 쌍 ②(다목 40%): 2020-01-01 — 비사업 1,461", events: [tax("2020-01-01", "separate")], tail: "comprehensive",
    biz: [[OS, "2020-01-01"]], expect: { nonBusiness: true, eff: 2190, total: 3651, tax: E3_N, bucket: 1 } },
  { id: "T5", scenario: "분리과세 → 종합합산 2021-07-01(공장 용도 폐지 등)", events: [tax("2021-07-01", "special_sum")], tail: "comprehensive",
    biz: [[OS, "2021-07-01"]], expect: { nonBusiness: false, eff: 2737, total: 3651, tax: E3_B, bucket: 1 } },
  { id: "T6", scenario: "3단: 비과세(~2016-01-01) → 분리과세(~2018-01-01) → 별도합산(~2021-01-01) → 종합합산(꼬리) — 구간 3개가 사업용으로 이어진다",
    events: [tax("2016-01-01", "exempt"), tax("2018-01-01", "special_sum"), tax("2021-01-01", "separate")], tail: "comprehensive",
    biz: [[OS, "2016-01-01"], ["2016-01-01", "2018-01-01"], ["2018-01-01", "2021-01-01"]], expect: { nonBusiness: false, eff: 2556, total: 3651, tax: E3_B, bucket: 1 } },
  { id: "T7", scenario: "구분 변경 + 철거: 별도 → 종합 2019-01-01 · 철거 2021-01-01(철거 직전 종합) · 꼬리 나대지 종합합산 — 별도합산이던 5년만 사업용",
    events: [tax("2019-01-01", "separate"), ["building_removed", "2021-01-01", "comprehensive"]], tail: "comprehensive",
    biz: [[OS, "2019-01-01"]], expect: { nonBusiness: true, eff: 1825, total: 3651, tax: E3_N, bucket: 1 } },
  { id: "T8", scenario: "복합: 신축 2019-01-01(앞 나대지) + 별도 → 종합 2022-06-01 · 꼬리 종합합산 — 앞 나대지 1,826일은 비사업용이나 가목은 직전 5년 비사업 579라 충족",
    events: [["building_built", "2019-01-01"], tax("2022-06-01", "separate")], tail: "comprehensive",
    biz: [["2019-01-01", "2022-06-01"]], expect: { nonBusiness: false, eff: 1247, total: 3651, tax: E3_B, bucket: 1 } },
  { id: "T9c", scenario: "V-6 닫힘: 신축 2023-06-01 · 앞 나대지는 종합합산으로 접힌다 · 꼬리 별도합산 (= E2 M6)", events: [["building_built", "2023-06-01"]], tail: "separate",
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3_N, bucket: 1 } },
  { id: "T9o", scenario: "V-6 가드(E3-1b 갱신): 신축 행에 «앞 나대지 = 별도합산» Before만 실어 보내면(근거 없음) 근거 없는 별도합산은 인정하지 않아 종합합산으로 접힌다 — T9c와 같은 판정(⑭는 E3-1b부터 운반, 경고만 새 고지가 붙는다)",
    events: [["building_built", "2023-06-01", "separate"]], tail: "separate",
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3_N, bucket: 1 } },
  { id: "T10", scenario: "단기 보유: 취득 2022-07-01(소유 548일 · 3호) · 별도 → 종합 2023-10-01 — 현행 비사업용 326,760,000", acq: "2022-07-01", events: [tax("2023-10-01", "separate")], tail: "comprehensive",
    biz: [["2022-07-02", "2023-10-01"]], expect: { nonBusiness: false, eff: 456, total: 548, tax: 279_000_000, bucket: 3 } },
  { id: "T11", scenario: "축 B 지분(취득 2020-01-01 · 소유 1,460일 · 2호) · 별도 → 종합 2022-06-01 — 현행 비사업용 297,640,000", acq: "2020-01-01", events: [tax("2022-06-01", "separate")], tail: "comprehensive",
    biz: [["2020-01-02", "2022-06-01"]], expect: { nonBusiness: false, eff: 881, total: 1460, tax: 233_490_000, bucket: 2 } },
  { id: "T11b", scenario: "지분 취득 2022-09-01 · 사건 2022-06-01(소유 전) → 클립: 첫 구간 0일 버림 — 구분 변경이 소유 첫날 상태로 접힌다", acq: "2022-09-01", events: [tax("2022-06-01", "separate")], tail: "comprehensive",
    biz: [], expect: { nonBusiness: true, eff: 0, total: 486, bucket: 3 } },
  { id: "T12a", scenario: "윤일 낀 창(앞): 양도 2024-03-01 · 종합 → 별도 2022-03-01(꼬리 731일)", transfer: "2024-03-01", events: [tax("2022-03-01", "comprehensive")], tail: "separate",
    biz: [["2022-03-01", "2024-03-01"]], expect: { nonBusiness: false, eff: 731, total: 3711, bucket: 1 } },
  { id: "T12b", scenario: "윤일 낀 창(뒤): 2022-03-02(꼬리 730일)", transfer: "2024-03-01", events: [tax("2022-03-02", "comprehensive")], tail: "separate",
    biz: [["2022-03-02", "2024-03-01"]], expect: { nonBusiness: true, eff: 730, total: 3711, bucket: 1 } },
  { id: "T13", scenario: "소유 1일(취득 2023-12-30) · 변경 2023-12-31 = 소유 첫날 → 앞 구간 0일 버림 — 꼬리만 사업용(별도합산)", acq: "2023-12-30", events: [tax("2023-12-31", "comprehensive")], tail: "separate",
    biz: [["2023-12-31", T]], expect: { nonBusiness: false, eff: 1, total: 1, tax: 348_750_000, bucket: 3 } },
  { id: "T14", scenario: "양도차손(양도 2억 < 취득 3억) · T1과 같은 변경 — 판정만 바뀌고 세액 0", transferPrice: 200_000_000, events: [tax("2022-06-01", "separate")], tail: "comprehensive",
    biz: [[OS, "2022-06-01"]], expect: { nonBusiness: false, eff: 3072, total: 3651, tax: 0, bucket: 1 } },
  { id: "T15", scenario: "«모름»: 별도합산 → ? 2022-06-01(변경 직전 구분 «모름» = 종합합산 + 확인 필요) · 꼬리 별도합산 — 혜택 불성립", events: [tax("2022-06-01", "")], tail: "separate",
    biz: [["2022-06-01", T]], expect: { nonBusiness: true, eff: 579, total: 3651, tax: E3_N, bucket: 1 } },
];

/**
 * 참고 행(엔진 도달 불가 · 계획서 §5) — E0 Anchor 1이 `meetsPeriodCriteria`에만 넣어 «이 표가 왜 필요한가»를 고정한다.
 *   T7'  : 현행 모델로 T7을 근사(철거 Before = 별도합산) → 2019~2021 종합합산 2년을 사업용으로 오계상(과소).
 *   T7'' : 현행 모델로 근사(철거 Before = 종합합산) → 별도합산이던 5년을 놓친다.
 *   T9o* : V-6을 **열었다면**(신축 앞 나대지 = 별도합산 선언) 전 기간 사업용 — 닫힘(T9c)과의 스윙 55,750,000.
 */
export const E3_REFERENCE_ROWS: ReadonlyArray<{ id: string; scenario: string; biz: ReadonlyArray<readonly [string, string]>; expect: { meets: boolean; eff: number; total: number } }> = [
  { id: "T7'", scenario: "현행 모델 근사: 철거 2021-01-01 Before = 별도합산 — 종합합산이던 2019~2021을 사업용으로 오계상", biz: [[OS, "2021-01-01"]], expect: { meets: true, eff: 2556, total: 3651 } },
  { id: "T7''", scenario: "현행 모델 근사: 철거 Before = 종합합산 — 별도합산이던 2014~2019를 놓침", biz: [], expect: { meets: false, eff: 0, total: 3651 } },
  { id: "T9o*", scenario: "V-6 열림 가정: 신축 2023-06-01 + 앞 나대지 별도합산 선언 + 꼬리 별도합산", biz: [[OS, T]], expect: { meets: true, eff: 3651, total: 3651 } },
];

export const E3_ACQ_DEFAULT = A;
export const E3_TRANSFER_DEFAULT = T;

/** 행 → raw 와이어 칸(`nonBusinessLandRaw`). 마지막 건축물 사건이 철거이면 꼬리 = 나대지, 그 밖에는 건축물 있음(250㎡). 숨은 토글(`nblOtherHasBuilding`)은 그 값과 같게 둔다. */
export function e3RowRaw(row: E3Row): Record<string, unknown> {
  const buildingEvents = row.events.filter(([k]) => k !== "tax_type_changed");
  const lastBuilding = buildingEvents[buildingEvents.length - 1];
  const tailHasBuilding = lastBuilding ? lastBuilding[0] === "building_built" : true;
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    acquisitionArea: "1000",
    acquisitionDate: row.acq ?? A,
    transferDate: row.transfer ?? T,
    nblOtherPropertyTaxType: row.tail,
    nblOtherHasBuilding: tailHasBuilding,
    nblOtherBuildingFloorArea: tailHasBuilding ? "250" : "",
    nblOtherStateHistoryMode: "changed",
    nblOtherStateEvents: row.events.map(([kind, date, before]) => ({ kind, date, ...(before !== undefined ? { propertyTaxTypeBefore: before } : {}) })),
    nblGracePeriods: [],
  };
}
