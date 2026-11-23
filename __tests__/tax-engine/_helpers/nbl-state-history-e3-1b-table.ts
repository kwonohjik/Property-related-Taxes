/**
 * NBL-STATE-HISTORY-E3-1b 「건축물 없는 구간(나대지)의 재산세 구분」 — 엔진 계획서 §5 케이스 매트릭스 R1~R18(+ 면적한도·근거 변형 행)을 **한 표**로 옮긴 것.
 * 같은 표를 ① E3b-0 Anchor 1(`meetsPeriodCriteria`에 `biz`를 직접 — 지금 코드로 green) · ② E3b-1 leaf 단위(사건 → 구간 → 사업용 구간 = `biz`) ·
 * ③ 엔진 단위(raw → ⑭ 매퍼 → 판정·세액) · ④ route 관통(raw → ⑫ → ⑭ → 엔진 → 세액)이 쓴다 — «입력 → 구간 → 판정 → 세액»이 같은 값인지 한 표로 대조한다.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-1b-bare-land-tax-type.engine.plan.md §4 · §5 · §7 · «결정 기록 (2026-11-23 사용자)»
 * 결정: V-1 일 단위(과세기준일 접기 ⛔) · Before 사슬 — 사건의 선언 3칸(`propertyTaxTypeBefore` · `propertyTaxBasisBefore` · `areaWithinLimitBefore`)은 그 사건이 **닫는 구간**을 말하고,
 *       닫는 구간이 나대지일 때만 근거·면적한도를 읽는다 · 나대지 근거 3종(`vacant_state`·`separate_taxation`·`statutory_exempt`) + 모름 · `demolished` 제외 ·
 *       신축 행 `""` = 선언 없음(종합합산 · 고지 없음), 구분 변경 행 `""` = 모름 ·
 *       **면적한도 «일부 초과»·«모름» = 그 구간을 종합합산으로 접고 확인 필요 고지**(엔진 원안 «일부 초과 = 이력 미적용»은 «모름»보다 유리해지는 역전이 실측돼 기각).
 *
 * 공통: 기타토지(잡종지) 1,000㎡ · 일반주거 · 양도가 10억 · 취득가 3억 · `makeMockRates`. 기본 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일).
 * 기댓값은 **오라클**(= `meetsPeriodCriteria`에 사업용 구간을 직접 넣은 값)이다. 구현 후 측정값이 다르면 표를 맞추지 말고 원인을 먼저 본다.
 */
import type { GraceSpec } from "./nbl-state-history-e2-table";

export type E3bEventKind = "building_built" | "building_removed" | "tax_type_changed";
export type E3bTaxType = "" | "separate" | "special_sum" | "exempt" | "comprehensive";
export type E3bBasis = "" | "statutory_exempt" | "separate_taxation" | "vacant_state" | "demolished" | "unknown";
export type E3bLimit = "" | "within" | "exceeded" | "unknown";

/** [종류, 날짜, 직전(닫는 구간) 재산세 구분, 근거(나대지 구간만 읽음), 면적한도(근거 vacant_state만 읽음)] */
export type E3bEventSpec = readonly [E3bEventKind, string, E3bTaxType?, E3bBasis?, E3bLimit?];

export interface E3bTail {
  /** 양도일 현재 재산세 구분(기존 입력 `nblOtherPropertyTaxType`). */
  type: Exclude<E3bTaxType, "">;
  /** 양도일 현재 건축물 유무 — 마지막 건축물 사건이 신축이면 true, 철거이면 false, 건축물 사건이 없으면 이 값이 초기 상태다. */
  hasBuilding: boolean;
  /** 꼬리 근거(건축물 없는 비종합합산일 때 — V1-A `nblOtherPropertyTaxBasis`). */
  basis?: E3bBasis;
}

export interface E3bRow {
  id: string;
  scenario: string;
  acq?: string;
  transfer?: string;
  events: readonly E3bEventSpec[];
  tail: E3bTail;
  grace?: readonly GraceSpec[];
  /** 양도가(원) — 양도차손 시료만 덮어쓴다. */
  transferPrice?: number;
  /** 사건 → 구간 → 사업용 구간(꼬리 포함, 반열린 `[start, end)`) — 손으로 쓴 독립 정답. */
  biz: ReadonlyArray<readonly [string, string]>;
  /** 유예(`meetsPeriodCriteria`용 구간) — R12·R13 */
  graceIntervals?: ReadonlyArray<readonly [string, string]>;
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
  /** 이 행이 낼 새 고지(E3b-1 고지 anchor) — 생략 = 새 고지 없음. */
  notices?: ReadonlyArray<"unconfirmed" | "accepted" | "area">;
}

export const E3B_B = 198_210_000; // 전량 사업용(2014-01-01 → 2024-01-01)
export const E3B_N = 253_960_000; // 전량 비사업용
export const E3B_SWING = E3B_N - E3B_B; // 55,750,000

const A = "2014-01-01";
const OS = "2014-01-02"; // 소유 첫날(취득일 다음날)
const T = "2024-01-01";

/** 나대지 구간을 닫는 사건 — 공지상태 별도합산(한도 이내). */
const VS = ["separate", "vacant_state", "within"] as const;
const tax = (date: string, before?: E3bTaxType, basis?: E3bBasis, limit?: E3bLimit): E3bEventSpec => ["tax_type_changed", date, before, basis, limit];
const built = (date: string, before?: E3bTaxType, basis?: E3bBasis, limit?: E3bLimit): E3bEventSpec => ["building_built", date, before, basis, limit];
const rm = (date: string, before: E3bTaxType = "separate"): E3bEventSpec => ["building_removed", date, before];

/** 꼬리 = 건축물 있음 + 별도합산(바닥면적 250㎡ × 4배 = 1,000㎡ 이내) */
const TAIL_BLD: E3bTail = { type: "separate", hasBuilding: true };
/** 꼬리 = 나대지 + 종합합산 */
const TAIL_BARE_COMP: E3bTail = { type: "comprehensive", hasBuilding: false };
/** 꼬리 = 나대지 + 공지상태 별도합산(V1-A 근거 `vacant_state` — 호별 한도 미판정 고지) */
const TAIL_BARE_VS: E3bTail = { type: "separate", hasBuilding: false, basis: "vacant_state" };

/** 계획서 §5 R1~R18 + 근거·면적한도 변형. 임계선 쌍 3개(R5/R6 나목 730/729 · R8/R9 다목 2,191/2,190 · R15/R16 윤일 창 731/730). */
export const E3B_ROWS: readonly E3bRow[] = [
  { id: "R1", scenario: "신축 2023-06-01 + 앞 나대지 = 공지상태 별도합산(한도 이내) · 꼬리 건축물 별도합산 — 앞 나대지가 사업용 구간으로 이어져 전 기간 사업용", events: [built("2023-06-01", ...VS)], tail: TAIL_BLD,
    biz: [[OS, T]], expect: { nonBusiness: false, eff: 3651, total: 3651, tax: E3B_B, bucket: 1 }, notices: ["accepted"] },
  { id: "R1b", scenario: "R1에서 앞 나대지 = 분리과세(`separate_taxation`)", events: [built("2023-06-01", "special_sum", "separate_taxation")], tail: TAIL_BLD,
    biz: [[OS, T]], expect: { nonBusiness: false, eff: 3651, total: 3651, tax: E3B_B, bucket: 1 }, notices: ["accepted"] },
  { id: "R1c", scenario: "R1에서 앞 나대지 = 비과세·면제(`statutory_exempt`)", events: [built("2023-06-01", "exempt", "statutory_exempt")], tail: TAIL_BLD,
    biz: [[OS, T]], expect: { nonBusiness: false, eff: 3651, total: 3651, tax: E3B_B, bucket: 1 }, notices: ["accepted"] },
  { id: "R1d", scenario: "신축 행에 선언이 없다(`\"\"`) — 종합합산 · **고지 없음** · 기존 이력과 바이트 동일(= E2 M6·E3-① T9c)", events: [built("2023-06-01", "")], tail: TAIL_BLD,
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3B_N, bucket: 1 } },
  { id: "R2", scenario: "R1에서 앞 나대지 근거 «모름» — 근거 없는 별도합산은 인정하지 않는다(종합합산으로 접음) + 새 고지", events: [built("2023-06-01", "separate", "unknown")], tail: TAIL_BLD,
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3B_N, bucket: 1 }, notices: ["unconfirmed"] },
  { id: "R2b", scenario: "R1에서 근거 미선택(`\"\"`) — 모름과 같다", events: [built("2023-06-01", "separate", "")], tail: TAIL_BLD,
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3B_N, bucket: 1 }, notices: ["unconfirmed"] },
  { id: "R2c", scenario: "R1에서 구분과 맞지 않는 근거(별도합산 + `separate_taxation`) — 호환 불가는 접힘", events: [built("2023-06-01", "separate", "separate_taxation")], tail: TAIL_BLD,
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3B_N, bucket: 1 }, notices: ["unconfirmed"] },
  { id: "R2d", scenario: "R1에서 근거 `demolished`(직접 API 전용 — 나대지 구간은 받지 않는다 · 철거 후 한시는 유예기간 9호로) — 접힘 + 고지(400 아님)", events: [built("2023-06-01", "separate", "demolished")], tail: TAIL_BLD,
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3B_N, bucket: 1 }, notices: ["unconfirmed"] },
  { id: "R3", scenario: "R1에서 공지상태 면적한도 «일부 초과» — **그 구간을 종합합산으로 접고 확인 필요**(결정 2026-11-23 · 이력 미적용이 아니다) — «모름»(R2e)보다 유리해지지 않는다", events: [built("2023-06-01", "separate", "vacant_state", "exceeded")], tail: TAIL_BLD,
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3B_N, bucket: 1 }, notices: ["accepted", "area"] },
  { id: "R2e", scenario: "R1에서 면적한도 «모름» — «일부 초과»와 같다(종합합산으로 접음)", events: [built("2023-06-01", "separate", "vacant_state", "unknown")], tail: TAIL_BLD,
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3B_N, bucket: 1 }, notices: ["accepted", "area"] },
  { id: "R2f", scenario: "R1에서 면적한도 미선택(`\"\"`) — «모름»과 같다", events: [built("2023-06-01", "separate", "vacant_state", "")], tail: TAIL_BLD,
    biz: [["2023-06-01", T]], expect: { nonBusiness: true, eff: 214, total: 3651, tax: E3B_N, bucket: 1 }, notices: ["accepted", "area"] },
  { id: "R1e", scenario: "면적한도는 `vacant_state`만 묻는다 — 분리과세 근거에 «일부 초과»를 실어 보내도 읽지 않는다(stale 값)", events: [built("2023-06-01", "special_sum", "separate_taxation", "exceeded")], tail: TAIL_BLD,
    biz: [[OS, T]], expect: { nonBusiness: false, eff: 3651, total: 3651, tax: E3B_B, bucket: 1 }, notices: ["accepted"] },
  { id: "R4", scenario: "나대지 계속 · 종합합산 → 공지상태 별도합산 2022-06-01(꼬리 공지상태) — 앞 3,072일 종합합산 나대지 = 비사업용(꼬리 579일뿐)", events: [tax("2022-06-01", "comprehensive")], tail: TAIL_BARE_VS,
    biz: [["2022-06-01", T]], expect: { nonBusiness: true, eff: 579, total: 3651, tax: E3B_N, bucket: 1 } },
  { id: "R5", scenario: "임계선 쌍 ①(나목): 공지상태 시작 2022-01-01(꼬리 730일 «1년 초과» 충족)", events: [tax("2022-01-01", "comprehensive")], tail: TAIL_BARE_VS,
    biz: [["2022-01-01", T]], expect: { nonBusiness: false, eff: 730, total: 3651, tax: E3B_B, bucket: 1 } },
  { id: "R6", scenario: "임계선 쌍 ②(나목): 2022-01-02(꼬리 729일 미충족)", events: [tax("2022-01-02", "comprehensive")], tail: TAIL_BARE_VS,
    biz: [["2022-01-02", T]], expect: { nonBusiness: true, eff: 729, total: 3651, tax: E3B_N, bucket: 1 } },
  { id: "R7", scenario: "나대지 공지상태(한도 이내) → 종합합산 2022-06-01(유휴 꼬리) — 3,072일 사업용이라 사업용", events: [tax("2022-06-01", ...VS)], tail: TAIL_BARE_COMP,
    biz: [[OS, "2022-06-01"]], expect: { nonBusiness: false, eff: 3072, total: 3651, tax: E3B_B, bucket: 1 }, notices: ["accepted"] },
  { id: "R8", scenario: "임계선 쌍 ①(다목 40%): 공지상태 → 종합 2020-01-02 — 비사업 1,460 ≤ floor(3,651×0.4)=1,460", events: [tax("2020-01-02", ...VS)], tail: TAIL_BARE_COMP,
    biz: [[OS, "2020-01-02"]], expect: { nonBusiness: false, eff: 2191, total: 3651, tax: E3B_B, bucket: 1 }, notices: ["accepted"] },
  { id: "R9", scenario: "임계선 쌍 ②(다목 40%): 2020-01-01 — 비사업 1,461", events: [tax("2020-01-01", ...VS)], tail: TAIL_BARE_COMP,
    biz: [[OS, "2020-01-01"]], expect: { nonBusiness: true, eff: 2190, total: 3651, tax: E3B_N, bucket: 1 }, notices: ["accepted"] },
  { id: "R10", scenario: "건물 철거 2018-01-01(직전 별도합산) → 나대지 종합 → 2022-06-01 공지상태(꼬리) — 건물 1,460 + 꼬리 579 = 2,039 (2018~2022 종합합산 나대지는 비사업용)",
    events: [rm("2018-01-01"), tax("2022-06-01", "comprehensive")], tail: TAIL_BARE_VS,
    biz: [[OS, "2018-01-01"], ["2022-06-01", T]], expect: { nonBusiness: true, eff: 2039, total: 3651, tax: E3B_N, bucket: 1 } },
  { id: "R11", scenario: "3단 나대지: 비과세 ~2016-01-01 → 분리과세 ~2018-01-01 → 공지상태 ~2021-01-01 → 종합합산(꼬리) — 세 구간 합집합 2,556일",
    events: [tax("2016-01-01", "exempt", "statutory_exempt"), tax("2018-01-01", "special_sum", "separate_taxation"), tax("2021-01-01", ...VS)], tail: TAIL_BARE_COMP,
    biz: [[OS, "2016-01-01"], ["2016-01-01", "2018-01-01"], ["2018-01-01", "2021-01-01"]], expect: { nonBusiness: false, eff: 2556, total: 3651, tax: E3B_B, bucket: 1 }, notices: ["accepted"] },
  { id: "R14", scenario: "단기보유: 취득 2022-07-01(소유 548일 · 3호) · 공지상태 ~2023-10-01 · 종합합산 꼬리 — 사업용 456/548", acq: "2022-07-01", events: [tax("2023-10-01", ...VS)], tail: TAIL_BARE_COMP,
    biz: [["2022-07-02", "2023-10-01"]], expect: { nonBusiness: false, eff: 456, total: 548, tax: 279_000_000, bucket: 3 }, notices: ["accepted"] },
  { id: "R15", scenario: "윤일 창 쌍(앞): 양도 2024-03-01(3,711일) · 종합 → 공지상태 2022-03-01(꼬리 731일)", transfer: "2024-03-01", events: [tax("2022-03-01", "comprehensive")], tail: TAIL_BARE_VS,
    biz: [["2022-03-01", "2024-03-01"]], expect: { nonBusiness: false, eff: 731, total: 3711, bucket: 1 } },
  { id: "R16", scenario: "윤일 창 쌍(뒤): 2022-03-02(꼬리 730일 — 729가 아니다)", transfer: "2024-03-01", events: [tax("2022-03-02", "comprehensive")], tail: TAIL_BARE_VS,
    biz: [["2022-03-02", "2024-03-01"]], expect: { nonBusiness: true, eff: 730, total: 3711, bucket: 1 } },
  { id: "R17", scenario: "축 B 지분 클립: 지분 취득 2022-09-01 · 선언 사건 2022-06-01(소유 전) — 첫 구간 0일 버림, 선언이 닫은 구간은 소유기간에 없다 → 꼬리(종합합산)만", acq: "2022-09-01", events: [tax("2022-06-01", ...VS)], tail: TAIL_BARE_COMP,
    biz: [], expect: { nonBusiness: true, eff: 0, total: 486, bucket: 3 } },
  { id: "R18", scenario: "양도차손(양도 2억 < 취득 3억) · R7과 같은 이력 — 판정만 바뀌고 세액 0", transferPrice: 200_000_000, events: [tax("2022-06-01", ...VS)], tail: TAIL_BARE_COMP,
    biz: [[OS, "2022-06-01"]], expect: { nonBusiness: false, eff: 3072, total: 3651, tax: 0, bucket: 1 }, notices: ["accepted"] },
  { id: "R19", scenario: "구분 변경 행 «모름»(`\"\"`) — 나대지 위 구분 변경 직전 구분 모름 = 종합합산 + 확인 필요(E3-① T15와 같은 정책) · 꼬리 공지상태 579일", events: [tax("2022-06-01", "")], tail: TAIL_BARE_VS,
    biz: [["2022-06-01", T]], expect: { nonBusiness: true, eff: 579, total: 3651, tax: E3B_N, bucket: 1 } },
];

/**
 * 이 계획이 **일부러 바꾸지 않는** 행(R12·R13) — 철거 후 한시(⑤)·건축 중은 이미 유예 입력으로 표현된다. 현행 엔진 값(실측)과 같아야 하고, E3b-1 이후에도 같아야 한다.
 */
export const E3B_UNCHANGED_ROWS: readonly E3bRow[] = [
  { id: "R12a", scenario: "철거 2020-01-01(Before 별도합산) → 나대지 종합 꼬리 — 유예 없음", events: [rm("2020-01-01")], tail: TAIL_BARE_COMP,
    biz: [[OS, "2020-01-01"]], expect: { nonBusiness: true, eff: 2190, total: 3651, tax: E3B_N, bucket: 1 } },
  { id: "R12b", scenario: "R12a + 9호 유예 2년(양도 2025.3.21. 전) — 유예가 한시 1년·빈집 3년을 덮는다", events: [rm("2020-01-01")], tail: TAIL_BARE_COMP,
    grace: [{ reasonCode: "demolition", anchorDate: "2020-01-01" }], biz: [[OS, "2020-01-01"]], graceIntervals: [["2020-01-01", "2022-01-01"]],
    expect: { nonBusiness: false, eff: 2921, total: 3651, tax: E3B_B, bucket: 1 } },
  { id: "R12c", scenario: "양도 2025-06-01 + 9호 유예 5년 — 4,017/4,168", transfer: "2025-06-01", events: [rm("2020-01-01")], tail: TAIL_BARE_COMP,
    grace: [{ reasonCode: "demolition", anchorDate: "2020-01-01" }], biz: [[OS, "2020-01-01"]], graceIntervals: [["2020-01-01", "2025-01-01"]],
    expect: { nonBusiness: false, eff: 4017, total: 4168, tax: 192_330_000, bucket: 1 } },
  { id: "R13", scenario: "건축 중: 신축 2023-06-01 + 5호 유예(취득 후 2년 + 착공 2022-06-01~준공 2023-06-01) + 앞 나대지 종합 — 별도합산 근거를 새로 받지 않는다(5호가 덮음)", events: [built("2023-06-01")], tail: TAIL_BLD,
    grace: [{ reasonCode: "construction_in_progress", secondaryDate: "2022-06-01", endDate: "2023-06-01" }], biz: [["2023-06-01", T]],
    graceIntervals: [[OS, "2016-01-01"], ["2022-06-01", "2023-06-01"]], expect: { nonBusiness: true, eff: 1308, total: 3651, tax: E3B_N, bucket: 1 } },
];

export const E3B_ACQ_DEFAULT = A;
export const E3B_TRANSFER_DEFAULT = T;
