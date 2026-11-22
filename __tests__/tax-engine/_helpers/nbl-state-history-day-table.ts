/**
 * NBL-STATE-HISTORY-E0 — 일 단위 «정답표»(엔진 계획서 §6 «일 단위» 열 정본). Anchor 1이 `meetsPeriodCriteria`에 직접 넣어 단언하고,
 * E1 leaf(`deriveOtherLandStateIntervals`) 단위 테스트가 «사건 → 구간»이 이 표의 `biz` 구간과 같은지 대조할 때 같은 표를 쓴다.
 *
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §4.2 · §6 · §7.2
 * 결정: V-1 일 단위(과세기준일 단위·«접기» 재제안 금지) · Q-15 (가).
 *
 * 구간은 반열린 `[start, end)`. `biz` = 사업용 구간(건축물 있던 구간 중 별도합산·분리과세·비과세 선언분 + 꼬리), `grace` = 영 §168조의14① 유예 구간.
 * 기대값 `lens` = 가·나·다 «비사업용 요건 충족» 여부("T" 충족 / "F" 미충족) — 1·2호 소유기간 버킷만(3호는 버킷 구조가 달라 생략).
 * 검증: 모든 행을 throwaway probe로 `meetsPeriodCriteria`에 직접 넣어 실측했고 계획서 §6 «일 단위» 열과 전 행 일치했다(2026-11-22).
 */
import { meetsPeriodCriteria, type PeriodCriteriaResult } from "@/lib/tax-engine/non-business-land/period-criteria";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { GracePeriod } from "@/lib/tax-engine/non-business-land/types";

export const dayDate = (s: string) => new Date(`${s}T00:00:00Z`);

export type DayInterval = readonly [string, string];

export interface DayRow {
  id: string;
  scenario: string;
  /** 취득일(소유는 다음날부터). */
  acq: string;
  /** 양도일(반열린 끝). */
  transfer: string;
  biz: readonly DayInterval[];
  grace?: readonly DayInterval[];
  expect: {
    meets: boolean;
    total: number;
    /** `effectiveBusinessDays` — 사업 구간 ∪ 유예. */
    eff: number;
    graceDays?: number;
    bizIn3?: number;
    bizIn5?: number;
    bucket: 1 | 2 | 3;
    /** 가·나·다 «비사업용 요건 충족» — 예: "TTF" = 가 충족·나 충족·다 미충족. 1·2호만. */
    lens?: string;
  };
}

export function evalDayRow(row: Pick<DayRow, "acq" | "transfer" | "biz" | "grace">): PeriodCriteriaResult {
  const grace: GracePeriod[] = (row.grace ?? []).map(([a, b]) => ({ reasonCode: "use_prohibited", startDate: dayDate(a), endDate: dayDate(b) }));
  return meetsPeriodCriteria(
    row.biz.map(([a, b]) => ({ start: dayDate(a), end: dayDate(b) })),
    dayDate(row.acq),
    dayDate(row.transfer),
    "other_land",
    DEFAULT_NON_BUSINESS_LAND_RULES,
    grace,
  );
}

/** 가·나·다 «비사업용 요건 충족» 문자열 — `criteria`는 «사업용 lens»(각 목 미충족)라 반전한다. */
export function lensOf(r: PeriodCriteriaResult): string {
  return `${r.criteria.rule5Years ? "F" : "T"}${r.criteria.rule2of3Years ? "F" : "T"}${r.criteria.rule80Percent ? "F" : "T"}`;
}

const A = "2014-01-01";
const T = "2024-01-01";
const OS = "2014-01-02"; // 소유 첫날(취득일 다음날)

/** 계획서 §6 대표 행 — 철거·신축 이력의 일 단위 정답. */
export const DAY_ROWS: readonly DayRow[] = [
  { id: "M1", scenario: "철거 후 나대지: 건물(별도합산) 2014-01-02~2021-01-01 → 나대지, 유예 없음", acq: A, transfer: T, biz: [[OS, "2021-01-01"]],
    expect: { meets: true, total: 3651, eff: 2556, bizIn3: 0, bizIn5: 731, bucket: 1, lens: "TTF" } },
  { id: "M2", scenario: "M1 + 9호 유예 2021-01-01~2023-01-01(2년)", acq: A, transfer: T, biz: [[OS, "2021-01-01"]], grace: [["2021-01-01", "2023-01-01"]],
    expect: { meets: true, total: 3651, eff: 3286, graceDays: 730, bizIn3: 730, bizIn5: 1461, bucket: 1, lens: "FFF" } },
  { id: "M3", scenario: "철거 2019-01-01 + 9호 유예 2019-01-01~2021-01-01(731일)", acq: A, transfer: T, biz: [[OS, "2019-01-01"]], grace: [["2019-01-01", "2021-01-01"]],
    expect: { meets: true, total: 3651, eff: 2556, graceDays: 731, bizIn3: 0, bizIn5: 731, bucket: 1, lens: "TTF" } },
  { id: "M4", scenario: "철거 2022-06-01, 유예 없음 — 직전 3년 비사업 579일", acq: A, transfer: T, biz: [[OS, "2022-06-01"]],
    expect: { meets: true, total: 3651, eff: 3072, bizIn3: 516, bizIn5: 1247, bucket: 1, lens: "FTF" } },
  { id: "M4b", scenario: "철거 2022-06-02", acq: A, transfer: T, biz: [[OS, "2022-06-02"]],
    expect: { meets: true, total: 3651, eff: 3073, bizIn3: 517, bizIn5: 1248, bucket: 1, lens: "FTF" } },
  { id: "M5", scenario: "양도 2025-06-01(9호 5년) · 철거 2021-01-01 · 9호 5년 행(양도일 클립)", acq: A, transfer: "2025-06-01", biz: [[OS, "2021-01-01"]], grace: [["2021-01-01", "2026-01-01"]],
    expect: { meets: true, total: 4168, eff: 4168, graceDays: 1612, bucket: 1, lens: "FFF" } },
  { id: "M6", scenario: "신축 직후 양도: 나대지 → 준공 2023-06-01", acq: A, transfer: T, biz: [["2023-06-01", T]],
    expect: { meets: false, total: 3651, eff: 214, bizIn3: 214, bizIn5: 214, bucket: 1, lens: "TTT" } },
  { id: "M6b", scenario: "준공 2023-06-02", acq: A, transfer: T, biz: [["2023-06-02", T]],
    expect: { meets: false, total: 3651, eff: 213, bizIn3: 213, bizIn5: 213, bucket: 1, lens: "TTT" } },
  { id: "M7", scenario: "M6 + 5호 유예(취득 후 2년 + 착공 2022-06-01~준공 2023-06-01, 유예 1,094일) — 합집합이라 이중 계상 없음", acq: A, transfer: T,
    biz: [["2023-06-01", T]], grace: [[OS, "2016-01-01"], ["2022-06-01", "2023-06-01"]],
    expect: { meets: false, total: 3651, eff: 1308, graceDays: 1094, bizIn3: 579, bizIn5: 579, bucket: 1, lens: "TTT" } },
  { id: "M8a", scenario: "나목 경계(앞): 준공 2022-01-01 — 사업 730 · 직전 3년 비사업 365", acq: A, transfer: T, biz: [["2022-01-01", T]],
    expect: { meets: true, total: 3651, eff: 730, bizIn3: 730, bizIn5: 730, bucket: 1, lens: "TFT" } },
  { id: "M8b", scenario: "나목 경계(뒤): 준공 2022-01-02 — 사업 729 · 직전 3년 비사업 366", acq: A, transfer: T, biz: [["2022-01-02", T]],
    expect: { meets: false, total: 3651, eff: 729, bizIn3: 729, bizIn5: 729, bucket: 1, lens: "TTT" } },
  { id: "M8c-731", scenario: "윤일 낀 창(앞): 양도 2024-03-01 · 준공 2022-03-01(꼬리 731일) — 창 1,096일이라 경계가 731/730", acq: A, transfer: "2024-03-01", biz: [["2022-03-01", "2024-03-01"]],
    expect: { meets: true, total: 3711, eff: 731, bizIn3: 731, bizIn5: 731, bucket: 1, lens: "TFT" } },
  { id: "M8c-730", scenario: "윤일 낀 창(뒤): 준공 2022-03-02(꼬리 730일)", acq: A, transfer: "2024-03-01", biz: [["2022-03-02", "2024-03-01"]],
    expect: { meets: false, total: 3711, eff: 730, bizIn3: 730, bizIn5: 730, bucket: 1, lens: "TTT" } },
  { id: "Z-1460", scenario: "다목 40% 경계(앞): 철거 2020-01-02 — 전체 비사업 1,460 = floor(3,651×40/100)", acq: A, transfer: T, biz: [[OS, "2020-01-02"]],
    expect: { meets: true, total: 3651, eff: 2191, bizIn3: 0, bizIn5: 366, bucket: 1, lens: "TTF" } },
  { id: "Z-1461", scenario: "다목 40% 경계(뒤): 철거 2020-01-01 — 비사업 1,461", acq: A, transfer: T, biz: [[OS, "2020-01-01"]],
    expect: { meets: false, total: 3651, eff: 2190, bizIn3: 0, bizIn5: 365, bucket: 1, lens: "TTT" } },
  { id: "Z-1462", scenario: "철거 2019-12-31 — 비사업 1,462", acq: A, transfer: T, biz: [[OS, "2019-12-31"]],
    expect: { meets: false, total: 3651, eff: 2189, bizIn3: 0, bizIn5: 364, bucket: 1, lens: "TTT" } },
  { id: "GA-730", scenario: "가목 경계(앞): 건물 2019-01-01~철거 2022-01-01 — 직전 5년 비사업 730(= 창 1,826 − 사업 1,096)", acq: A, transfer: T, biz: [["2019-01-01", "2022-01-01"]],
    expect: { meets: true, total: 3651, eff: 1096, bizIn3: 365, bizIn5: 1096, bucket: 1, lens: "FTT" } },
  { id: "GA-731", scenario: "가목 경계(뒤): 철거 2021-12-31 — 직전 5년 비사업 731", acq: A, transfer: T, biz: [["2019-01-01", "2021-12-31"]],
    expect: { meets: false, total: 3651, eff: 1095, bizIn3: 364, bizIn5: 1095, bucket: 1, lens: "TTT" } },
  { id: "GA-729", scenario: "철거 2022-01-02 — 직전 5년 비사업 729", acq: A, transfer: T, biz: [["2019-01-01", "2022-01-02"]],
    expect: { meets: true, total: 3651, eff: 1097, bizIn3: 366, bizIn5: 1097, bucket: 1, lens: "FTT" } },
  { id: "R1a", scenario: "철거 2020-05-31 — 비사업 1,310", acq: A, transfer: T, biz: [[OS, "2020-05-31"]],
    expect: { meets: true, total: 3651, eff: 2341, bizIn3: 0, bizIn5: 516, bucket: 1, lens: "TTF" } },
  { id: "R1b", scenario: "철거 2020-06-02 — 비사업 1,308", acq: A, transfer: T, biz: [[OS, "2020-06-02"]],
    expect: { meets: true, total: 3651, eff: 2343, bizIn3: 0, bizIn5: 518, bucket: 1, lens: "TTF" } },
  { id: "R2", scenario: "철거 2020-06-01 + 9호 유예 2년(2020-06-01~2022-06-01)", acq: A, transfer: T, biz: [[OS, "2020-06-01"]], grace: [["2020-06-01", "2022-06-01"]],
    expect: { meets: true, total: 3651, eff: 3072, graceDays: 730, bizIn3: 516, bizIn5: 1247, bucket: 1, lens: "FTF" } },
  { id: "R3", scenario: "철거 2020-06-01 + 철거 전 재산세 구분 미선택(모름 = 종합합산) → 사업 구간 없음", acq: A, transfer: T, biz: [],
    expect: { meets: false, total: 3651, eff: 0, bizIn3: 0, bizIn5: 0, bucket: 1, lens: "TTT" } },
  { id: "S1", scenario: "같은 해 두 번: 철거 2022-03-01 → 재신축 2022-05-01 — 비사업 61일", acq: A, transfer: T, biz: [[OS, "2022-03-01"], ["2022-05-01", T]],
    expect: { meets: true, total: 3651, eff: 3590, bizIn3: 1034, bizIn5: 1765, bucket: 1, lens: "FFF" } },
  { id: "S2", scenario: "같은 해 두 번: 신축 2023-03-01 → 철거 2023-04-01 — 사업 31일", acq: A, transfer: T, biz: [["2023-03-01", "2023-04-01"]],
    expect: { meets: false, total: 3651, eff: 31, bizIn3: 31, bizIn5: 31, bucket: 1, lens: "TTT" } },
  { id: "P2", scenario: "양도 2024-03-15 · 철거 2024-02-01(꼬리 43일) — 철거가 양도 직전이어도 사업용 구간이 길다", acq: A, transfer: "2024-03-15", biz: [[OS, "2024-02-01"]],
    expect: { meets: true, total: 3725, eff: 3682, bizIn3: 1053, bizIn5: 1784, bucket: 1, lens: "FFF" } },
  { id: "P3", scenario: "양도 2024-09-15 · 신축 2024-07-01", acq: A, transfer: "2024-09-15", biz: [["2024-07-01", "2024-09-15"]],
    expect: { meets: false, total: 3909, eff: 76, bizIn3: 76, bizIn5: 76, bucket: 1, lens: "TTT" } },
  { id: "M17", scenario: "윤년: 취득 2020-02-29 · 양도 2024-02-29(소유 1,460일, 2호) · 준공 2023-01-01", acq: "2020-02-29", transfer: "2024-02-29", biz: [["2023-01-01", "2024-02-29"]],
    expect: { meets: false, total: 1460, eff: 424, bizIn3: 424, bizIn5: 424, bucket: 2, lens: "TTT" } },
  { id: "M17b", scenario: "윤일 사건: 철거 2020-02-29(별도합산 선언) — 사업 2,249 · 비사업 1,402", acq: A, transfer: T, biz: [[OS, "2020-02-29"]],
    expect: { meets: true, total: 3651, eff: 2249, bizIn3: 0, bizIn5: 424, bucket: 1, lens: "TTF" } },
  { id: "M13", scenario: "단기 보유: 취득 2022-07-01 · 준공 2023-10-01 (소유 548일 · 3호 단서 — 가목 미적용, 비사업 456 > floor(548×40/100)=219)", acq: "2022-07-01", transfer: T, biz: [["2023-10-01", T]],
    expect: { meets: false, total: 548, eff: 92, bizIn3: 92, bizIn5: 92, bucket: 3 } },
  { id: "P1", scenario: "취득 2021-09-01 · 신축 2022-03-01(소유 851일, 3호) — 가목 충족(180 > 121)이나 나목(40%) 미충족", acq: "2021-09-01", transfer: T, biz: [["2022-03-01", T]],
    expect: { meets: true, total: 851, eff: 671, bizIn3: 671, bizIn5: 671, bucket: 3 } },
  { id: "M14-지분1", scenario: "축 B 지분1(취득 2014-01-01): 건물 2014-01-02~2021-01-01 → 나대지", acq: A, transfer: T, biz: [[OS, "2021-01-01"]],
    expect: { meets: true, total: 3651, eff: 2556, bizIn3: 0, bizIn5: 731, bucket: 1, lens: "TTF" } },
  { id: "M14-지분2", scenario: "축 B 지분2(취득 2020-01-01, 소유 1,460일·2호): 사건을 지분 소유 첫날로 클립 → 사업 2020-01-02~2021-01-01 365일", acq: "2020-01-01", transfer: T, biz: [["2020-01-02", "2021-01-01"]],
    expect: { meets: false, total: 1460, eff: 365, bizIn3: 0, bizIn5: 365, bucket: 2, lens: "TTT" } },
  { id: "M14-지분3", scenario: "축 B 지분3(취득 2021-06-01, 소유 943일·3호): 건물 구간이 소유 시작 전에 끝나 사업 0일", acq: "2021-06-01", transfer: T, biz: [],
    expect: { meets: false, total: 943, eff: 0, bizIn3: 0, bizIn5: 0, bucket: 3 } },
  { id: "M16", scenario: "소유 0일: 취득 2023-12-31 · 양도 2024-01-01(초일불산입) — 사업 구간이 있어도 0일이면 비사업용", acq: "2023-12-31", transfer: T, biz: [],
    expect: { meets: false, total: 0, eff: 0, bizIn3: 0, bizIn5: 0, bucket: 3 } },
  { id: "M16b-사업", scenario: "소유 1일(취득 2023-12-30 · 양도 2024-01-01), 꼬리 사업용 — 비사업 0 > floor(1×40/100)=0 아님", acq: "2023-12-30", transfer: T, biz: [["2023-12-31", T]],
    expect: { meets: true, total: 1, eff: 1, bizIn3: 1, bizIn5: 1, bucket: 3 } },
  { id: "M16b-나대지", scenario: "소유 1일, 꼬리 나대지 — 비사업 1 > 0", acq: "2023-12-30", transfer: T, biz: [],
    expect: { meets: false, total: 1, eff: 0, bizIn3: 0, bizIn5: 0, bucket: 3 } },
  { id: "M16c", scenario: "소유 1일 + 사건일 = 소유 첫날(2023-12-31): 첫 구간 0일(빈 구간)은 판정에 영향이 없다 — M16b와 같다", acq: "2023-12-30", transfer: T, biz: [["2023-12-31", "2023-12-31"], ["2023-12-31", T]],
    expect: { meets: true, total: 1, eff: 1, bizIn3: 1, bizIn5: 1, bucket: 3 } },
  { id: "E=T-1", scenario: "사건일 = 양도일 − 1(꼬리 1일): 사업 1/3,651 → 비사업용", acq: A, transfer: T, biz: [["2023-12-31", T]],
    expect: { meets: false, total: 3651, eff: 1, bizIn3: 1, bizIn5: 1, bucket: 1, lens: "TTT" } },
  { id: "E=OS", scenario: "사건일 = 소유 첫날(철거 2014-01-02): 첫 구간 0일 → 사업 0일", acq: A, transfer: T, biz: [[OS, OS]],
    expect: { meets: false, total: 3651, eff: 0, bizIn3: 0, bizIn5: 0, bucket: 1, lens: "TTT" } },
  { id: "G1", scenario: "v2 폐기 가드: 준공 2022-06-01(6.1. 당일) — 일 단위로는 사업 579 → 비사업용(과세기준일 접기면 사업 730 → 사업용으로 뒤집힌다)", acq: A, transfer: T, biz: [["2022-06-01", T]],
    expect: { meets: false, total: 3651, eff: 579, bizIn3: 579, bizIn5: 579, bucket: 1, lens: "TTT" } },
  { id: "G2", scenario: "v2 폐기 가드: 철거 2020-06-01(6.1. 당일) — 일 단위로는 비사업 1,309 → 사업용(접기면 비사업 1,461+ → 비사업용으로 뒤집힌다)", acq: A, transfer: T, biz: [[OS, "2020-06-01"]],
    expect: { meets: true, total: 3651, eff: 2342, bizIn3: 0, bizIn5: 517, bucket: 1, lens: "TTF" } },
];

/** 소유기간 버킷 경계(영 §168조의6 1호 5년 이상 · 2호 3년 이상 5년 미만 · 3호 3년 미만) — 일수는 취득일로 맞춘다. 사업 구간 없음. */
export const BUCKET_ROWS: ReadonlyArray<{ id: string; acq: string; total: number; bucket: 1 | 2 | 3 }> = [
  { id: "1,825일 → 1호", acq: "2019-01-01", total: 1825, bucket: 1 },
  { id: "1,824일 → 2호", acq: "2019-01-02", total: 1824, bucket: 2 },
  { id: "1,095일 → 2호", acq: "2020-12-31", total: 1095, bucket: 2 },
  { id: "1,094일 → 3호", acq: "2021-01-01", total: 1094, bucket: 3 },
];
