/**
 * NBL-STATE-HISTORY-E3-③ 「주택부수토지(법 §104의3①5호) 신축·철거 이력」 — 엔진 계획서 §6 케이스 매트릭스(A · B)와 배율 경계 §6.2를 **한 표**로 옮긴 것.
 * 같은 표를 ① E3d-0 Anchor 1(`meetsPeriodCriteria`에 사업용 구간을 직접 — 지금 코드로 green) · ② 현행 열(이력 입력의 현행 엔진 실측) ·
 * ③ E3d-1 엔진 단위(raw → ⑭ 매퍼 → 판정·세액) · ④ route 관통(raw → ⑫ → ⑭ → 엔진 → 세액)이 쓴다(UI E2E도 같은 표를 인용 — UI R-7).
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-3-house-appurtenant.engine.plan.md §2.1 · §6 · §7.2
 * 결정: Q-2 (가) 일 단위 합산 · Q-3 (가) 신축 앞 나대지 구간 E3-1b 선언 재사용 · Q-5 (나) 배율 초과·모름 = 그 구간 비사업용 · Q-10 (가) 정착면적 ⑧ 차단(직접 API는 접힘) ·
 *       Q-11 (나) A도 `houseFootprintBefore`(㎡) · D-11 배율은 양도일 시행 법령.
 *
 * 공통(A): 주택부수토지 **500㎡** · 일반주거 · 수도권 밖(5배) · **양도일 현재 정착면적 100㎡**(허용 500㎡ → 배율 이내) · 양도 10억 · 취득 3억 · `makeMockRates`.
 * 기본 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일). 구간은 반열린 `[start, end)`. 구옥(철거 전 주택) 정착면적은 별도 표기가 없으면 100㎡(이내).
 * `expect`는 **오라클**(= `meetsPeriodCriteria`에 사업용 구간 `biz`를 직접 넣은 값 · 손으로 쓴 독립 정답)이다. 구현 후 측정값이 다르면 표를 맞추지 말고 원인을 먼저 본다.
 * `current`는 같은 입력을 **현행 엔진**(이력 칸을 읽지 않음 — `not_judged`)에 넣은 실측이다 — 이 표가 왜 필요한가의 근거.
 */
import type { GraceSpec } from "./nbl-state-history-e2-table";

export type { GraceSpec };

/** `[kind, date, 철거 전 정착면적(㎡ 문자열 — 철거 행만)]`. 정착면적이 `undefined`이면 빈칸. */
export type HouseEventSpec = readonly ["building_built" | "building_removed", string, string?];

export interface E3dARow {
  id: string;
  scenario: string;
  acq?: string;
  transfer?: string;
  /** 토지 면적(㎡ 문자열) — 기본 "500". */
  area?: string;
  /** 양도일 현재 정착면적(㎡ 문자열) — 기본 "100". */
  footprint?: string;
  /** 수도권 여부 — 기본 "no". */
  metro?: "yes" | "no";
  events: readonly HouseEventSpec[];
  grace?: readonly GraceSpec[];
  /** 사업용 구간(반열린) — 손으로 쓴 독립 정답. 꼬리(양도일 현재 주택 = 배율 이내)와 «이내» 판정된 과거 주택 구간. */
  biz: ReadonlyArray<readonly [string, string]>;
  /** 오라클에 넣는 유예 구간. */
  graceIntervals?: ReadonlyArray<readonly [string, string]>;
  expect: {
    nonBusiness: boolean;
    /** `effectiveBusinessDays` */
    eff: number;
    total: number;
    bucket: 1 | 2 | 3;
  };
  /** 같은 입력의 **현행** 판정 — 이력 칸을 읽지 않으므로 전부 «사업용(이내)»다. */
  current: { nonBusiness: false };
  /** 이 행이 내는 새 고지(구현 후). */
  notices?: ReadonlyArray<"daywise" | "houseBefore" | "exceeded" | "unconfirmed">;
}

const A0 = "2014-01-01";
export const OS = "2014-01-02"; // 소유 첫날(취득일 다음날)
const T24 = "2024-01-01";

/** 취득일 → 양도일 거래의 «전량 사업용 B · 전량 비사업용 N» 산출세액(원) — 계획서 머리말 실측. */
export const E3D_TRADE_TAX: Readonly<Record<string, { B: number; N: number }>> = {
  "2014-01-01|2024-01-01": { B: 198_210_000, N: 253_960_000 },
  "2014-01-01|2024-06-30": { B: 198_210_000, N: 253_960_000 },
  "2022-07-01|2024-06-30": { B: 257_010_000, N: 326_760_000 },
  "2022-07-01|2023-12-31": { B: 279_000_000, N: 326_760_000 },
};
export const E3D_SWING_2014 = 55_750_000;

const built = (date: string): HouseEventSpec => ["building_built", date];
/** 철거 행 — 정착면적 기본 "100"(500㎡ 토지의 5배 허용 500㎡ → 이내). */
const rm = (date: string, footprint: string | undefined = "100"): HouseEventSpec => ["building_removed", date, footprint];

/** 계획서 §6.1 A 행 — 주택부수토지 카드(양도일 현재 주택 있음). */
export const E3D_A_ROWS: readonly E3dARow[] = [
  { id: "M15", scenario: "신축 직후: 나대지 → 준공 2023-06-01(주택) — 사업 214/3,651", events: [built("2023-06-01")], biz: [["2023-06-01", T24]],
    expect: { nonBusiness: true, eff: 214, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M15b", scenario: "준공 2023-06-02 — 사업 213", events: [built("2023-06-02")], biz: [["2023-06-02", T24]],
    expect: { nonBusiness: true, eff: 213, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M15c", scenario: "M15 + 5호 유예(취득 후 2년 + 착공 2022-06-01~준공 2023-06-01) — 합집합이라 이중 계상 없음(기타토지 M7과 같은 일수)", events: [built("2023-06-01")],
    grace: [{ reasonCode: "construction_in_progress", secondaryDate: "2022-06-01", endDate: "2023-06-01" }],
    biz: [["2023-06-01", T24]], graceIntervals: [[A0, "2016-01-01"], ["2022-06-01", "2023-06-01"]],
    expect: { nonBusiness: true, eff: 1308, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M15e", scenario: "M15c 변형(기타토지 M7b와 같은 구조): 5호 건설진행이 준공 2023-09-01까지 이어져 신축 이후 구간(2023-06-01~)과 92일 겹침 — 합집합이라 M15c와 같은 1,308 (산술 합산이면 1,400)", events: [built("2023-06-01")],
    grace: [{ reasonCode: "construction_in_progress", secondaryDate: "2022-06-01", endDate: "2023-09-01" }],
    biz: [["2023-06-01", T24]], graceIntervals: [[A0, "2016-01-01"], ["2022-06-01", "2023-09-01"]],
    expect: { nonBusiness: true, eff: 1308, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M15d", scenario: "M15 + 취득 후 2년 유예만(6호 저당권 실행·청산 `[취득일, +2년)` — 5호는 route가 착공일을 필수로 요구해 «취득 후 2년만»을 말할 수 없다). 계획서는 eff 944(유예 730)로 적었으나 소유 첫날이 취득일 다음날이라 유예는 729일 → eff 943", events: [built("2023-06-01")],
    grace: [{ reasonCode: "mortgage_or_liquidation" }],
    biz: [["2023-06-01", T24]], graceIntervals: [[A0, "2016-01-01"]],
    expect: { nonBusiness: true, eff: 943, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M8a", scenario: "경계: 준공 2022-01-01 — 직전 3년 비사업 365(나목 미충족 → 사업용)", events: [built("2022-01-01")], biz: [["2022-01-01", T24]],
    expect: { nonBusiness: false, eff: 730, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M8b", scenario: "경계: 준공 2022-01-02 — 비사업 366(나목 충족)", events: [built("2022-01-02")], biz: [["2022-01-02", T24]],
    expect: { nonBusiness: true, eff: 729, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "G1", scenario: "v2 폐기 가드: 준공 2022-06-01(6.1. 당일) — 6.1.은 특별하지 않다", events: [built("2022-06-01")], biz: [["2022-06-01", T24]],
    expect: { nonBusiness: true, eff: 579, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M8c-731", scenario: "윤일 낀 창: 양도 2024-03-01 · 준공 2022-03-01(꼬리 731일)", transfer: "2024-03-01", events: [built("2022-03-01")], biz: [["2022-03-01", "2024-03-01"]],
    expect: { nonBusiness: false, eff: 731, total: 3711, bucket: 1 }, current: { nonBusiness: false } },
  { id: "M8c-730", scenario: "윤일 낀 창: 양도 2024-03-01 · 준공 2022-03-02(꼬리 730일)", transfer: "2024-03-01", events: [built("2022-03-02")], biz: [["2022-03-02", "2024-03-01"]],
    expect: { nonBusiness: true, eff: 730, total: 3711, bucket: 1 }, current: { nonBusiness: false } },
  { id: "H3", scenario: "철거 2018-01-01 → 재신축 2020-01-01(갭 730) · 구옥 정착 100(이내) — 비사업 730뿐", events: [rm("2018-01-01"), built("2020-01-01")], biz: [[OS, "2018-01-01"], ["2020-01-01", T24]],
    expect: { nonBusiness: false, eff: 2921, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "H3b", scenario: "갭 881일(철거 2021-01-01 → 재신축 2023-06-01) — 총 비사업 881 ≤ 1,460", events: [rm("2021-01-01"), built("2023-06-01")], biz: [[OS, "2021-01-01"], ["2023-06-01", T24]],
    expect: { nonBusiness: false, eff: 2770, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "H3c", scenario: "철거 2016-01-01 → 재신축 2023-01-01(갭 2,557) · within — 5y 1,461>730 · 3y 730>365 · 총 2,557>1,460", events: [rm("2016-01-01"), built("2023-01-01")], biz: [[OS, "2016-01-01"], ["2023-01-01", T24]],
    expect: { nonBusiness: true, eff: 1094, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "H3d", scenario: "H3c + 9호 유예 2016-01-01~2018-01-01(731일)", events: [rm("2016-01-01"), built("2023-01-01")], grace: [{ reasonCode: "demolition", anchorDate: "2016-01-01" }],
    biz: [[OS, "2016-01-01"], ["2023-01-01", T24]], graceIntervals: [["2016-01-01", "2018-01-01"]],
    expect: { nonBusiness: true, eff: 1825, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "H3e", scenario: "H3c에서 구옥 정착면적 빈칸(UI는 ⑧ 차단 — 직접 API만) — 철거 전 주택 구간도 접힘: 사업 `[재신축~양도일)` 365뿐", events: [rm("2016-01-01", ""), built("2023-01-01")], biz: [["2023-01-01", T24]],
    expect: { nonBusiness: true, eff: 365, total: 3651, bucket: 1 }, current: { nonBusiness: false }, notices: ["unconfirmed"] },
  { id: "H3f", scenario: "H3c에서 구옥 정착면적 50㎡(허용 250 < 토지 500 → 초과 250) — Q-5 (나): 그 구간 접힘 → H3e와 같은 수", events: [rm("2016-01-01", "50"), built("2023-01-01")], biz: [["2023-01-01", T24]],
    expect: { nonBusiness: true, eff: 365, total: 3651, bucket: 1 }, current: { nonBusiness: false }, notices: ["exceeded"] },
  { id: "H8", scenario: "취득 2022-07-01 · 양도 2024-06-30(소유 729) · 신축 2023-10-01 — 3호 단서(소유 2년 이상: 가목 소유−2년 · 나목 40%) 비사업 456 > 291", acq: "2022-07-01", transfer: "2024-06-30", events: [built("2023-10-01")], biz: [["2023-10-01", "2024-06-30"]],
    expect: { nonBusiness: true, eff: 273, total: 729, bucket: 3 }, current: { nonBusiness: false } },
  { id: "H8b", scenario: "같은 거래 · 신축 2022-09-01 — 비사업 61 → 사업용", acq: "2022-07-01", transfer: "2024-06-30", events: [built("2022-09-01")], biz: [["2022-09-01", "2024-06-30"]],
    expect: { nonBusiness: false, eff: 668, total: 729, bucket: 3 }, current: { nonBusiness: false } },
  { id: "H9", scenario: "취득 2022-07-01 · 양도 2023-12-31(소유 547) · 신축 2023-10-01 — 총 비사업 456 > floor(547×0.4)=218", acq: "2022-07-01", transfer: "2023-12-31", events: [built("2023-10-01")], biz: [["2023-10-01", "2023-12-31"]],
    expect: { nonBusiness: true, eff: 91, total: 547, bucket: 3 }, current: { nonBusiness: false } },
  { id: "M13p", scenario: "단기 보유(기타토지 M13과 같은 입력): 취득 2022-07-01 · 신축 2023-10-01 · 양도 2024-01-01(소유 548)", acq: "2022-07-01", events: [built("2023-10-01")], biz: [["2023-10-01", T24]],
    expect: { nonBusiness: true, eff: 92, total: 548, bucket: 3 }, current: { nonBusiness: false } },
  { id: "P3p", scenario: "양도 2024-09-15 · 신축 2024-07-01(기타토지 P3과 같은 입력)", transfer: "2024-09-15", events: [built("2024-07-01")], biz: [["2024-07-01", "2024-09-15"]],
    expect: { nonBusiness: true, eff: 76, total: 3909, bucket: 1 }, current: { nonBusiness: false } },
  { id: "P2-1", scenario: "축 B 지분1(취득 2014-01-01 · 소유 3,651일): 같은 이력 신축 2023-06-01 — 사업 214", events: [built("2023-06-01")], biz: [["2023-06-01", T24]],
    expect: { nonBusiness: true, eff: 214, total: 3651, bucket: 1 }, current: { nonBusiness: false } },
  { id: "P2-2", scenario: "축 B 지분2(취득 2020-01-01 · 소유 1,460일): 신축 2023-06-01 — 사업 214/1,460(2호: 가 1,246>365 · 나 881>365 · 다 1,246>584)", acq: "2020-01-01", events: [built("2023-06-01")], biz: [["2023-06-01", T24]],
    expect: { nonBusiness: true, eff: 214, total: 1460, bucket: 2 }, current: { nonBusiness: false } },
  { id: "P3-clip", scenario: "이월과세 시나리오 B(취득일 = 수증일 2023-12-01 · 소유 30일) + 신축 2023-06-01(수증일 앞) — 앞 구간 클립 → 소유 기간 전부 주택 → 사업용(30/30)", acq: "2023-12-01", events: [built("2023-06-01")], biz: [["2023-12-02", T24]],
    expect: { nonBusiness: false, eff: 30, total: 30, bucket: 3 }, current: { nonBusiness: false } },
];

/** 계획서 §6.1 이력이 판정을 바꾸지 않는 행(Q-3a (나) 경계·T-2·정착면적 0·소유 0일·양도차손) — 현행 값 고정용. */
export const E3D_A_UNCHANGED_IDS = ["M8a", "M8c-731", "H3", "H3b", "H8b", "P3-clip"] as const;

/**
 * 거래별 세액(원) — 행의 `acq|transfer` 거래에서 전량 사업용 B · 비사업용 N. 거래 키에 없으면 undefined(세액 단언 생략).
 */
export function e3dTradeTax(row: Pick<E3dARow, "acq" | "transfer">, nonBusiness: boolean): number | undefined {
  const t = E3D_TRADE_TAX[`${row.acq ?? A0}|${row.transfer ?? T24}`];
  return t ? (nonBusiness ? t.N : t.B) : undefined;
}

/** A 행 → raw 와이어 칸(`nonBusinessLandRaw`). 철거 행에만 `houseFootprintBefore`를 싣는다(신축 행에는 없다). */
export function e3dARowRaw(row: E3dARow, opts: { history?: boolean } = {}): Record<string, unknown> {
  const history = opts.history ?? true;
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "housing_site",
    nblZoneType: "general_residential",
    acquisitionArea: row.area ?? "500",
    acquisitionDate: row.acq ?? A0,
    transferDate: row.transfer ?? T24,
    nblHousingFootprint: row.footprint ?? "100",
    nblIsMetropolitanArea: row.metro ?? "no",
    ...(history
      ? {
          nblOtherStateHistoryMode: "changed",
          nblOtherStateEvents: row.events.map(([kind, date, footprint]) => ({ kind, date, ...(kind === "building_removed" ? { houseFootprintBefore: footprint ?? "" } : {}) })),
        }
      : {}),
    nblGracePeriods: (row.grace ?? []).map((g) => ({ ...g })),
  };
}

/** 배율 판정 경계(엔진 계획서 §6.2 «배율 판정 경계» — 토지 1,000㎡ · 실측: `getHousingMultiplier` → `areaTimes` → `judgeAreaLimit` 직접 호출). */
export interface HouseLimitRow {
  id: string;
  zone: "general_residential" | "green" | "management" | "undesignated";
  /** 수도권 여부 — 도시지역 밖·미지정은 값이 판정을 가르지 않는다. */
  metro: boolean;
  transfer: string;
  footprint: number;
  landArea: number;
  expect: { multiplier: number; allowedArea: number; within: boolean; excess: number };
}

export const E3D_HOUSE_LIMIT_ROWS: readonly HouseLimitRow[] = [
  { id: "5배-200.00", zone: "general_residential", metro: false, transfer: T24, footprint: 200, landArea: 1000, expect: { multiplier: 5, allowedArea: 1000, within: true, excess: 0 } },
  { id: "5배-199.99", zone: "general_residential", metro: false, transfer: T24, footprint: 199.99, landArea: 1000, expect: { multiplier: 5, allowedArea: 999.95, within: false, excess: 0.05 } },
  { id: "3배-333.34", zone: "general_residential", metro: true, transfer: T24, footprint: 333.34, landArea: 1000, expect: { multiplier: 3, allowedArea: 1000.02, within: true, excess: 0 } },
  { id: "3배-333.33", zone: "general_residential", metro: true, transfer: T24, footprint: 333.33, landArea: 1000, expect: { multiplier: 3, allowedArea: 999.99, within: false, excess: 0.01 } },
  { id: "수도권-양도2021-12-31", zone: "general_residential", metro: true, transfer: "2021-12-31", footprint: 200, landArea: 1000, expect: { multiplier: 5, allowedArea: 1000, within: true, excess: 0 } },
  { id: "수도권-양도2022-01-01", zone: "general_residential", metro: true, transfer: "2022-01-01", footprint: 200, landArea: 1000, expect: { multiplier: 3, allowedArea: 600, within: false, excess: 400 } },
  { id: "녹지-수도권", zone: "green", metro: true, transfer: T24, footprint: 200, landArea: 1000, expect: { multiplier: 5, allowedArea: 1000, within: true, excess: 0 } },
  { id: "관리지역-10배", zone: "management", metro: false, transfer: T24, footprint: 100, landArea: 1000, expect: { multiplier: 10, allowedArea: 1000, within: true, excess: 0 } },
  { id: "미지정-10배", zone: "undesignated", metro: false, transfer: T24, footprint: 100, landArea: 1000, expect: { multiplier: 10, allowedArea: 1000, within: true, excess: 0 } },
];
