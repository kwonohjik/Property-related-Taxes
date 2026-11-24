/**
 * NBL-STATE-HISTORY-E3-④ 「13호(무주택 1세대 1필지 나지) × 소유기간 중 이력」 — 엔진 계획서 §6 케이스 매트릭스(H·W·X 행)와 UI 계획서 §1.3 시료(N0~D2 · R-8)를 **한 표**로 옮긴 것.
 * 같은 표를 ① E3e-0 Pre-Do anchor(`meetsPeriodCriteria`에 사업용 구간 `biz`를 직접 · 현행 열 고정) ② 엔진 단위(raw → ⑭ 매퍼 → 판정·세액) ③ route 관통(raw → ⑫ → ⑭ → 엔진 → 세액)
 * ④ R-1 술어 parity 격자가 쓴다 — «입력 → 판정 → 세액»이 같은 값인지 한 표로 대조한다.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-4-ho13-bare-land.engine.plan.md §2.2 · §6 · §7 / `…ui.plan.md` §1.3
 * 결정(2026-11-24): Q-1 (가) 나지 구간(꼬리 + 과거 나지)에만 13호 · Q-2 (다) 세대 주택 소유 기간 행 · Q-3 (가) 이력과 무관 · Q-4 (가) 행 없음 = 현행 · Q-5 (가) 변형 고지 대체.
 *
 * 공통: 기타토지(잡종지) 600㎡(660㎡ 이내) · 일반주거 · 13호 · 양도가 10억 · 취득가 3억 · `makeMockRates`. 기본 취득 2014-01-01 → 양도 2024-01-01(소유 3,651일).
 * 꼬리: 마지막 건축물 사건이 신축이면 «건축물 있음»(꼬리 재산세 구분 `tailTax` — 기본 별도합산), 철거이면 «나대지 + 종합합산». 철거 사건의 `propertyTaxTypeBefore` 기본 = 종합합산(건축물 구간 비사업용).
 * 기댓값은 **오라클**(= `meetsPeriodCriteria`에 사업용 구간 `biz`를 직접 넣은 값)이다. 구현 후 측정값이 다르면 표를 맞추지 말고 원인을 먼저 본다.
 * `current`는 같은 입력을 **현행 엔진**(13호를 구간으로 세지 않고 세대 주택 소유 칸이 없던 때)에 넣은 실측이다 — 이 표가 왜 필요한가의 근거.
 */
import type { GraceSpec } from "./nbl-state-history-e2-table";

export type { GraceSpec };

export const OS = "2014-01-02"; // 소유 첫날(취득일 다음날)
export const A0 = "2014-01-01";
export const T24 = "2024-01-01";

export const VACANT_HO = "vacant_lot_1household";

/** 취득 2014-01-01 → 양도 2024-01-01 거래의 «전량 사업용 B · 전량 비사업용 N» 산출세액(원) — 엔진 계획서 머리말 실측. */
export const E3E_B = 198_210_000;
export const E3E_N = 253_960_000;
export const E3E_SWING = E3E_N - E3E_B; // 55,750,000

/** [종류, 날짜, 직전(닫는 구간) 재산세 구분, 근거, 면적한도] */
export type E3eEventSpec = readonly ["building_built" | "building_removed", string, ("" | "separate" | "special_sum" | "exempt" | "comprehensive")?, string?, string?];

export type E3eMode = "" | "unchanged" | "changed" | "unknown";

/** 세대 주택 소유 기간 행 — [시작일(소유 첫날), 종료일(소유하지 않게 된 첫날 · 생략 = 양도일까지)]. */
export type E3eHouseRowSpec = readonly [string, string?];

export interface E3eRow {
  id: string;
  scenario: string;
  acq?: string;
  transfer?: string;
  /** 토지 면적(㎡ 문자열) — 기본 "600". */
  area?: string;
  /** 호 — 기본 13호. */
  ho?: string;
  /** 이력 질문 답 — 기본 `changed`. */
  mode?: E3eMode;
  events: readonly E3eEventSpec[];
  /** 건축물 사건이 없을 때 양도일 현재 건축물 유무(`unchanged`·`""`) — 기본 false. */
  tailBuilding?: boolean;
  /** 꼬리가 건축물일 때의 재산세 구분 — 기본 별도합산. */
  tailTax?: "separate" | "comprehensive";
  /** 세대 주택 소유 기간 행(E3e-2) — 없으면 현행(전 기간 무주택 자기선언). */
  houseRows?: readonly E3eHouseRowSpec[];
  grace?: readonly GraceSpec[];
  /** 이 행이 신규 모델에서 사업용으로 세는 구간(반열린) — 손으로 쓴 독립 정답. `unchangedByModel` 행은 비워 둔다. */
  biz: ReadonlyArray<readonly [string, string]>;
  graceIntervals?: ReadonlyArray<readonly [string, string]>;
  /** 신규 모델의 기댓값(오라클). */
  expect: { nonBusiness: boolean; eff: number; total: number };
  /** 현행 엔진 실측 — 칸이 없어 같은 값이면 `same: true`. */
  current: { nonBusiness: boolean; eff: number; basis: string };
  /** 신규 모델이 현행과 판정·수치를 바꾸는 행(스윙). */
  changes: boolean;
  /** 신규 판정이 이력·행을 읽는가(= 이력 `state_history` 또는 행을 읽는 core 경로) — 안 읽는 행(부분 면적 등)은 false. */
  reads: boolean;
}

const rm = (date: string, before: E3eEventSpec[2] = "comprehensive"): E3eEventSpec => ["building_removed", date, before];
const built = (date: string): E3eEventSpec => ["building_built", date];

/** 엔진 계획서 §6.1 나지 축 + §6.3 결합 행. */
export const E3E_BARE_ROWS: readonly E3eRow[] = [
  { id: "H0", scenario: "이력 OFF(질문 미선택) · 나지 전 기간 — 하위호환", mode: "", events: [], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
  { id: "H1", scenario: "철거 2023-06-01(건물 구간 종합합산) · 꼬리 나지 — 건물 구간은 나지가 아니다(회귀 가드)", events: [rm("2023-06-01")], biz: [["2023-06-01", T24]],
    expect: { nonBusiness: true, eff: 214, total: 3651 }, current: { nonBusiness: true, eff: 214, basis: "state_history" }, changes: false, reads: true },
  { id: "H1c", scenario: "H1 + 철거 직전 별도합산 선언 — 나목 선언 경로", events: [rm("2023-06-01", "separate")], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_history" }, changes: false, reads: true },
  { id: "H2", scenario: "신축 2023-06-01(앞 나지 종합 접힘) · 꼬리 건물(별도합산) — 과거 나지 3,437일이 13호로 인정", events: [built("2023-06-01")], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: true, eff: 214, basis: "state_history" }, changes: true, reads: true },
  { id: "H3", scenario: "신축 2020-06-01 · 꼬리 건물(종합합산) — 앞 나지 2,342일(비사업 1,309 < 1,460.4)", events: [built("2020-06-01")], tailTax: "comprehensive", biz: [[OS, "2020-06-01"]],
    expect: { nonBusiness: false, eff: 2342, total: 3651 }, current: { nonBusiness: true, eff: 0, basis: "state_history" }, changes: true, reads: true },
  { id: "H3a", scenario: "신축 2020-01-02 — 40% 경계(비사업 1,460 ≤ 1,460.4 → 사업용)", events: [built("2020-01-02")], tailTax: "comprehensive", biz: [[OS, "2020-01-02"]],
    expect: { nonBusiness: false, eff: 2191, total: 3651 }, current: { nonBusiness: true, eff: 0, basis: "state_history" }, changes: true, reads: true },
  { id: "H3b", scenario: "신축 2020-01-01 — 40% 경계 쌍(비사업 1,461 > 1,460.4 → 비사업용)", events: [built("2020-01-01")], tailTax: "comprehensive", biz: [[OS, "2020-01-01"]],
    expect: { nonBusiness: true, eff: 2190, total: 3651 }, current: { nonBusiness: true, eff: 0, basis: "state_history" }, changes: false, reads: true },
  { id: "H4", scenario: "신축 2020-01-01 · 철거 2023-06-01(종합) · 꼬리 나지 — 나지 2구간 합집합(2,190 + 214)", events: [built("2020-01-01"), rm("2023-06-01")], biz: [[OS, "2020-01-01"], ["2023-06-01", T24]],
    expect: { nonBusiness: false, eff: 2404, total: 3651 }, current: { nonBusiness: true, eff: 214, basis: "state_history" }, changes: true, reads: true },
  { id: "H5", scenario: "철거 2023-06-01 · 꼬리 나지 · 900㎡ — 부분 면적(core)이라 이력 미적용(`isPartialArea`)", area: "900", events: [rm("2023-06-01")], biz: [],
    expect: { nonBusiness: true, eff: 3651, total: 3651 }, current: { nonBusiness: true, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
  { id: "H6", scenario: "신축 2020-06-01 · 꼬리 건물 · 900㎡ — 660 초과 × 이력은 13호 기여 0 + 고지(D-2)", area: "900", events: [built("2020-06-01")], tailTax: "comprehensive", biz: [],
    expect: { nonBusiness: true, eff: 0, total: 3651 }, current: { nonBusiness: true, eff: 0, basis: "state_history" }, changes: false, reads: true },
  { id: "X1", scenario: "H4 + 세대 주택 소유 2023-01-01~(양도일까지) — 나지 ∩ 무주택 = 2014-01-02~2020-01-01 2,190일뿐", events: [built("2020-01-01"), rm("2023-06-01")], houseRows: [["2023-01-01"]], biz: [[OS, "2020-01-01"]],
    expect: { nonBusiness: true, eff: 2190, total: 3651 }, current: { nonBusiness: true, eff: 214, basis: "state_history" }, changes: true, reads: true },
  { id: "X2", scenario: "H2 + 신축 앞 나지 구간에 E3-1b 나대지 선언(별도합산·공지상태 이내 = 받아들임) — 두 경로 합집합(일수 중복 제거)", events: [["building_built", "2023-06-01", "separate", "vacant_state", "within"]], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_history" }, changes: false, reads: true },
  { id: "X3", scenario: "신축 2019-01-01 · 철거 2021-01-01(종합) · 꼬리 나지 + 9호 유예(철거 2021-01-01 · 2년) — 유예는 꼬리와 겹쳐 합집합 불변", events: [built("2019-01-01"), rm("2021-01-01")],
    grace: [{ reasonCode: "demolition", anchorDate: "2021-01-01" }], biz: [[OS, "2019-01-01"], ["2021-01-01", T24]], graceIntervals: [["2021-01-01", "2023-01-01"]],
    expect: { nonBusiness: false, eff: 2920, total: 3651 }, current: { nonBusiness: false, eff: 1095, basis: "state_history" }, changes: true, reads: true },
];

/** 엔진 계획서 §6.2 무주택 축 — 이력 OFF(질문 미선택·`""`) · 나지 전 기간 · 행 입력. 현행은 13호 선택 시 칸이 없어 전부 B(S0). */
export const E3E_HOUSE_ROWS: readonly E3eRow[] = [
  { id: "W0", scenario: "행 없음 — 현행 자기선언(전 기간 무주택) 유지", mode: "", events: [], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
  { id: "W1", scenario: "주택 취득 2020-01-02(이후 계속) — 무주택 2,191일(비사업 1,460 ≤ 1,460.4)", mode: "", events: [], houseRows: [["2020-01-02"]], biz: [[OS, "2020-01-02"]],
    expect: { nonBusiness: false, eff: 2191, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: true },
  { id: "W2", scenario: "주택 취득 2020-01-01 — 무주택 2,190일(비사업 1,461 > 1,460.4)", mode: "", events: [], houseRows: [["2020-01-01"]], biz: [[OS, "2020-01-01"]],
    expect: { nonBusiness: true, eff: 2190, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: true, reads: true },
  { id: "W3", scenario: "주택 취득 2019-01-01 — 무주택 1,825일", mode: "", events: [], houseRows: [["2019-01-01"]], biz: [[OS, "2019-01-01"]],
    expect: { nonBusiness: true, eff: 1825, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: true, reads: true },
  { id: "W4a", scenario: "주택 취득 2021-01-01 — 무주택 2,556일", mode: "", events: [], houseRows: [["2021-01-01"]], biz: [[OS, "2021-01-01"]],
    expect: { nonBusiness: false, eff: 2556, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: true },
  { id: "W4b", scenario: "주택 취득 2022-01-01 — 무주택 2,921일", mode: "", events: [], houseRows: [["2022-01-01"]], biz: [[OS, "2022-01-01"]],
    expect: { nonBusiness: false, eff: 2921, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: true },
  { id: "W5", scenario: "4팀-978형: 주택 소유 2018-01-01~2021-01-01(처분 후 무주택 복귀) — 소유 구간만 제외", mode: "", events: [], houseRows: [["2018-01-01", "2021-01-01"]], biz: [[OS, "2018-01-01"], ["2021-01-01", T24]],
    expect: { nonBusiness: false, eff: 2555, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: true },
  { id: "W5b", scenario: "W5 종료일 = 양도일 명시(빈칸과 같다 — D-7)", mode: "", events: [], houseRows: [["2020-01-01", T24]], biz: [[OS, "2020-01-01"]],
    expect: { nonBusiness: true, eff: 2190, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: true, reads: true },
  { id: "W6", scenario: "이력 `unchanged` + 행(W2와 같은 행) — Q-3 (가): 이력 모드와 무관하게 행을 읽는다", mode: "unchanged", events: [], houseRows: [["2020-01-01"]], biz: [[OS, "2020-01-01"]],
    expect: { nonBusiness: true, eff: 2190, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: true, reads: true },
  { id: "W7", scenario: "이력 `unknown` + 행 — 모름도 행을 읽는다", mode: "unknown", events: [], houseRows: [["2020-01-01"]], biz: [[OS, "2020-01-01"]],
    expect: { nonBusiness: true, eff: 2190, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: true, reads: true },
  { id: "W8", scenario: "꼬리 건물 + 이력 OFF + 행 — 호 요건 실패(건축물 있음)라 행을 읽지 않는다(N)", mode: "unchanged", events: [], tailBuilding: true, tailTax: "comprehensive", houseRows: [["2020-01-01"]], biz: [],
    expect: { nonBusiness: true, eff: 3651, total: 3651 }, current: { nonBusiness: true, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
];

/** UI 계획서 §1.3 시료(N0~D2 · R-8) — 기타토지 600㎡ · 일반주거 · 철거 직전 구분 «모름»(`""`)은 종합합산 접힘과 같다. 11호 행(D1·D2)은 다목이라 이력과 독립(전 기간 사업용). */
export const E3E_UI_ROWS: readonly E3eRow[] = [
  { id: "N0", scenario: "13호 · 질문 미선택 · 나지", mode: "", events: [], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
  { id: "N1", scenario: "13호 · `unchanged` · 나지", mode: "unchanged", events: [], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
  { id: "N1b", scenario: "13호 · `unchanged` · 건축물 있음(종합합산) — 13호 불인정", mode: "unchanged", events: [], tailBuilding: true, tailTax: "comprehensive", biz: [],
    expect: { nonBusiness: true, eff: 3651, total: 3651 }, current: { nonBusiness: true, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
  { id: "C1", scenario: "13호 · 신축 2014-01-02 → 철거 2018-06-01 · 현재 나지(꼬리만 나지)", events: [built("2014-01-02"), rm("2018-06-01", "")], biz: [["2018-06-01", T24]],
    expect: { nonBusiness: false, eff: 2040, total: 3651 }, current: { nonBusiness: false, eff: 2040, basis: "state_history" }, changes: false, reads: true },
  { id: "C1p", scenario: "C1에서 호 없음(`none`) — 꼬리 종합합산 나지는 비사업용", ho: "none", events: [built("2014-01-02"), rm("2018-06-01", "")], biz: [],
    expect: { nonBusiness: true, eff: 0, total: 3651 }, current: { nonBusiness: true, eff: 0, basis: "state_history" }, changes: false, reads: true },
  { id: "C2", scenario: "13호 · (소유 시작부터 건축물) 철거 2019-01-01 · 현재 나지", events: [rm("2019-01-01", "")], biz: [["2019-01-01", T24]],
    expect: { nonBusiness: false, eff: 1826, total: 3651 }, current: { nonBusiness: false, eff: 1826, basis: "state_history" }, changes: false, reads: true },
  { id: "C3", scenario: "13호 · 신축 2022-01-01(앞 나지 2,921일) · 현재 건축물(종합합산) — 현행은 13호 무효", events: [built("2022-01-01")], tailTax: "comprehensive", biz: [[OS, "2022-01-01"]],
    expect: { nonBusiness: false, eff: 2921, total: 3651 }, current: { nonBusiness: true, eff: 0, basis: "state_history" }, changes: true, reads: true },
  { id: "C3p", scenario: "C3에서 호 없음 — 13호 무효와 같은 값", ho: "none", events: [built("2022-01-01")], tailTax: "comprehensive", biz: [],
    expect: { nonBusiness: true, eff: 0, total: 3651 }, current: { nonBusiness: true, eff: 0, basis: "state_history" }, changes: false, reads: true },
  { id: "C4", scenario: "13호 · 신축 2016-01-01 → 철거 2021-01-01(건물 구간 별도합산) · 현재 나지 — 앞 나지 729일 추가", events: [built("2016-01-01"), rm("2021-01-01", "separate")], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 2922, basis: "state_history" }, changes: true, reads: true },
  { id: "C5", scenario: "13호 · 800㎡(660 초과) · 철거 후 나지 · `changed` — 부분 면적이라 이력 미적용", area: "800", events: [rm("2023-06-01", "")], biz: [],
    expect: { nonBusiness: true, eff: 3651, total: 3651 }, current: { nonBusiness: true, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
  { id: "C6", scenario: "13호 · `unknown` · 나지", mode: "unknown", events: [], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_at_transfer" }, changes: false, reads: false },
  { id: "D1", scenario: "11호 양어장(다목) · C1 입력 — 다목은 이력과 독립(전 기간 사업용)", ho: "fish_farm_licensed", events: [built("2014-01-02"), rm("2018-06-01", "")], biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_history" }, changes: false, reads: false },
  { id: "D2", scenario: "11호 · C3 입력 — 앞 나지·건물 구간 모두 사업용(다목)", ho: "fish_farm_licensed", events: [built("2022-01-01")], tailTax: "comprehensive", biz: [[OS, T24]],
    expect: { nonBusiness: false, eff: 3651, total: 3651 }, current: { nonBusiness: false, eff: 3651, basis: "state_history" }, changes: false, reads: false },
];

export const E3E_ALL_ROWS: readonly E3eRow[] = [...E3E_BARE_ROWS, ...E3E_HOUSE_ROWS, ...E3E_UI_ROWS];

/** 행 → raw 와이어 칸(`nonBusinessLandRaw`). `history`·`houseRows` 옵션으로 현행 입력(칸 없음)·신규 입력을 가른다. */
export function e3eRowRaw(row: E3eRow, opts: { houseRows?: boolean } = {}): Record<string, unknown> {
  const mode = row.mode ?? "changed";
  const last = row.events[row.events.length - 1];
  const tailBuilding = last ? last[0] === "building_built" : (row.tailBuilding ?? false);
  const useRows = opts.houseRows ?? true;
  return {
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    acquisitionArea: row.area ?? "600",
    acquisitionDate: row.acq ?? A0,
    transferDate: row.transfer ?? T24,
    nblOtherRelatedBusinessType: row.ho ?? VACANT_HO,
    nblOtherPropertyTaxType: tailBuilding ? (row.tailTax ?? "separate") : "comprehensive",
    nblOtherHasBuilding: tailBuilding,
    nblOtherBuildingFloorArea: tailBuilding ? "250" : "",
    nblOtherStateHistoryMode: mode,
    nblOtherStateEvents:
      mode === "changed"
        ? row.events.map(([kind, date, before, basis, limit]) => ({
            kind,
            date,
            ...(kind === "building_removed" ? { propertyTaxTypeBefore: before ?? "comprehensive" } : {}),
            ...(kind === "building_built" && before ? { propertyTaxTypeBefore: before } : {}),
            ...(basis ? { propertyTaxBasisBefore: basis } : {}),
            ...(limit ? { areaWithinLimitBefore: limit } : {}),
          }))
        : [],
    nblGracePeriods: (row.grace ?? []).map((g) => ({ ...g })),
    ...(useRows && row.houseRows && row.houseRows.length > 0
      ? { nblOtherHouseholdHousePeriods: row.houseRows.map(([startDate, endDate]) => ({ startDate, ...(endDate ? { endDate } : {}) })) }
      : {}),
  };
}

/** 거래의 B/N 세액을 판정 결과로 고른다. */
export const e3eTax = (nonBusiness: boolean): number => (nonBusiness ? E3E_N : E3E_B);
