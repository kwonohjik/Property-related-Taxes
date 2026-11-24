/**
 * 철거ㆍ멸실 후 재산세 한시 지위(지방세법 시행령 §103의2) — 고지 leaf (NBL-STATE-HISTORY-E3-⑤ · E3f-1a). 순수 함수 — DB·`new Date(x)` 없음.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.engine.plan.md v4 §1.2~§1.3 · §5.1 · §5.8 · §6.2 D-5 · §7.3 (K-19~K-23 · K-30)
 * E3f-1a는 **고지**(입력 0 · 판정·세액 불변), E3f-1b는 **꼬리 한도**(`isTailDemolishedClearlyExpired` — 철거ㆍ멸실일 입력이 있을 때만 읽는다), **E3f-2는 나대지 구간 선언의 한시 창**(`demolishedRequiredFacts` · `demolishedStatusWindow`)을 소유한다.
 *
 * ## 고지 연혁화(Q-2 (가) · F-1)
 * 종전 `NBL_PTAX_DEMOLISHED_STATUS_NOTICE`는 «1년»(2026.6.1.~ 시행본)을 양도일과 무관하게 고정해 그 전 양도에도 «1년»이라 말했다.
 * `demolishedStatusNotice(transferDate)`는 **양도일 ≥ 6.1. 경계 상수**(`demolishedStatusEra` — 2016.6.1. · 2019.6.1. · 2024.6.1. · 2026.6.1.)로 시행본 문구를 고른다.
 * 양도일 ≥ 2026.6.1.의 문구는 종전과 **같은 문장**이다(상수의 항 번호 정정 «시행령 §103의2 ① 1호» → «§103의2 1호»만 다르다 — 조문에 항이 없다).
 * 시행본 본문은 KoreanLaw MCP 실독(MST 178638 · 206456 · 257499 · 262781 · 282549 · 290815)에 기댄다 — 연혁 문언은 현행만 검증하는 `verify:legal` 대상이 아니다(계획서 V-11).
 * 한시 지위는 과세기준일마다 그날 시행본으로 정해지므로 «양도일 시행본» 안내는 근사다 — 그래서 2026.6.1. 전 변형에는 그 한계를 밝힌다(판정에는 쓰지 않는다).
 */
import { NBL } from "../legal-codes";
import { demolishedAreaClauseApplies } from "../data/nbl-historical-values-era";
import { demolishedOtherUseClauseApplies } from "../data/nbl-historical-values-era";
import { demolishedPermitClauseApplies } from "../data/nbl-historical-values-era";
import { demolishedStatusEra, demolishedStatusMaxMonths, hasDemolishedStatusEraDate, isVacantHouseThreeYearCell, lastPropertyTaxBaseDateOnOrBefore } from "../data/nbl-historical-values-era";
import { demolishedStatusPeriodMonths } from "../data/nbl-historical-values-era";
import { demolishedVacantHouseClauseApplies } from "../data/nbl-historical-values-era";
import type { DemolishedStatusEra } from "../data/nbl-historical-values-era";
import { isWithinPeriodMonths, periodEndFromMonths } from "../civil-period";
import { judgeAppurtenantLandExcess } from "../appurtenant-land-excess";
import { addDays, isBefore, isValid, parseISO } from "../utc-date";
import type { DemolishedFact } from "./land-usage.types";
import type { DateInterval, NonBusinessLandInput } from "./types";

const EPILOGUE_ERA_NOTE = "한시 지위는 과세기준일마다 그날의 시행본으로 정해지는데 양도일 기준 시행본으로 안내했고, ";

/**
 * 철거 전 바닥면적 × 영 §101② 적용배율 범위 문언은 2024.5.28. 시행본(1호 후단)부터다(첫 과세기준일 2024.6.1.) — 그 전 시행본 안내에 덧붙인다.
 * 이 계산기는 그 전 과세기준일 시행본에는 면적 제한이 없다고 보고 부속토지 전체를 별도합산 범위로 계산한다(사용자 결정 2026-11-24 · `demolishedAreaClauseApplies`) — 부속토지 범위 자체는 확인 필요.
 */
const NO_AREA_CLAUSE_NOTE =
  "이 시행본 본문에는 철거 전 바닥면적에 용도지역별 적용배율을 곱한 면적 범위 문언이 없어 이 계산기는 그 범위를 적용하지 않고 부속토지 전체를 별도합산 범위로 보았습니다(어디까지가 철거된 건축물의 부속토지인지는 판정하지 않았습니다). ";

/**
 * 꼬리 근거(E3f-1b)가 철거ㆍ멸실일을 읽는 범위 — 양도일 직전 마지막 과세기준일까지 한시 기간이 **확실히** 지났는지(충분조건)만이다. 지났으면 근거를 접는다(`isTailDemolishedClearlyExpired`).
 * 한시 지위(과세기준일 현재 성립 여부)와 요건(허가·건축 외 용도·빈집정비 여부)은 판정하지 않는다.
 */
const TAIL_LIMIT_JUDGED_NOTE =
  "철거ㆍ멸실일은 한시 기간이 양도일 직전 과세기준일까지 확실히 지났는지만 판정했고(지났으면 이 근거를 인정하지 않고 종합합산으로 보았습니다) ";
const TAIL_STATUS_NOT_JUDGED = `${TAIL_LIMIT_JUDGED_NOTE}한시 지위 자체는 판정하지 않았습니다 — 확인 필요.`;
const TAIL_STATUS_AND_REQUIREMENTS_NOT_JUDGED = `${TAIL_LIMIT_JUDGED_NOTE}한시 지위 자체와 이 요건들은 판정하지 않았습니다 — 확인 필요.`;

/** 양도일 미입력(⑤ 미리보기) — 단일 시행본을 단정하지 않는다(계획서 D-5 · K-30). */
export const NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE =
  "철거 후 한시 별도합산 기간은 양도일(과세기준일)에 따라 다릅니다 — 2016.6.1.~ 6개월(2019.6.1.~ 허가·사용승인 요건), 2024.6.1.~ 빈집정비사업 철거 빈집 3년·건축 외 용도 제외, 2026.6.1.~ 1년 — " +
  "양도일을 입력하면 해당 시행본으로 안내합니다 — 확인 필요.";

const NOTICE_BY_ERA = {
  not_yet:
    `${NBL.PTAX_BASIS_DEMOLISHED_BODY}은 2016.1.1. 시행 시행령이 «이 영 시행 이후 최초로 납세의무가 성립하는 분부터 적용»되어(부칙 제2조) 이 근거를 적용할 최초 과세기준일은 2016.6.1.입니다. ` +
    `양도일이 그 전이면 이 근거를 적용할 과세기준일이 없습니다 — 이 계산기는 선택하신 근거를 그대로 받아들여 판정했고, 철거일(한시 지위)과 요건은 판정하지 않았습니다 — 확인 필요.`,
  six_month:
    `${NBL.PTAX_BASIS_DEMOLISHED_BODY}은 과세기준일 현재 철거ㆍ멸실된 날부터 6개월이 지나지 않은 건축물 또는 주택의 부속토지입니다(이 시행본에는 허가·사용승인 요건·빈집정비사업 3년 연장·건축 용도 외 사용 제외가 없습니다). ` +
    `${NO_AREA_CLAUSE_NOTE}${EPILOGUE_ERA_NOTE}${TAIL_STATUS_NOT_JUDGED}`,
  permit:
    `${NBL.PTAX_BASIS_DEMOLISHED_BODY}은 과세기준일 현재 철거ㆍ멸실된 날부터 6개월이 지나지 않은 건축물 또는 주택의 부속토지이고, 허가·사용승인을 받지 않은 건축물 또는 주택의 부속토지는 제외됩니다(2019.6.1. 과세기준일부터 — 이 시행본에는 빈집정비사업 3년 연장·건축 용도 외 사용 제외가 없습니다). ` +
    `${NO_AREA_CLAUSE_NOTE}${EPILOGUE_ERA_NOTE}${TAIL_STATUS_AND_REQUIREMENTS_NOT_JUDGED}`,
  vacant_house:
    `${NBL.PTAX_BASIS_DEMOLISHED}은 철거ㆍ멸실된 날부터 6개월이 지나지 않은 건축물(빈집정비사업 등으로 철거된 빈집은 3년)의 부속토지이고, 건축 용도 외의 다른 용도로 쓰는 부분과 ` +
    `허가·사용승인을 받지 않은 건축물의 부속토지는 제외됩니다. ${EPILOGUE_ERA_NOTE}${TAIL_STATUS_AND_REQUIREMENTS_NOT_JUDGED}`,
  one_year:
    `${NBL.PTAX_BASIS_DEMOLISHED}은 철거ㆍ멸실된 날부터 1년이 지나지 않은 건축물(빈집정비사업 등으로 철거된 빈집은 3년)의 부속토지이고, 건축 용도 외의 다른 용도로 쓰는 부분과 ` +
    `허가·사용승인을 받지 않은 건축물의 부속토지는 제외됩니다. ${TAIL_STATUS_AND_REQUIREMENTS_NOT_JUDGED}`,
} as const satisfies Record<DemolishedStatusEra, string>;

/**
 * 근거 «철거ㆍ멸실» 한시 지위 고지(Q-2 (가)) — 양도일 시행본 연혁. `undefined`·Invalid Date(양도일 미입력)이면 시행본 연혁을 한 줄로 밝히는 변형(`NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE`).
 * 양도일은 **실제 양도일**이다(양도일 의제 §168의14②와 무관 — 재산세 과세기준일은 실제 시간축).
 */
export function demolishedStatusNotice(transferDate: Date | undefined): string {
  return hasDemolishedStatusEraDate(transferDate) ? NOTICE_BY_ERA[demolishedStatusEra(transferDate)] : NBL_PTAX_DEMOLISHED_STATUS_ERA_UNKNOWN_NOTICE;
}

/**
 * 빈집 3년 셀 고지 — 근거 «철거ㆍ멸실»을 선언하지 **않은** 입력용(입력 칸 없이 발동). 철거ㆍ멸실일이 [2021.6.1., 2022.6.1.]이고 양도일이 [2024.6.1., 2025.3.21.)이면
 * 과세기준일 2024.6.1. 현재 빈집정비 3년 한시가 성립할 수 있으나 건축물 멸실 유예 9호(2년)가 그날을 덮지 못한다(판정 뒤집힘 셀 — 계획서 §3.3 · K-23).
 * 이 계산기는 한시 지위를 판정하지 않는다(E3f-2 이후 문구는 «나대지 구간 근거 «철거ㆍ멸실»에서 빈집정비를 선택하면 반영»으로 바뀐다). 세액 불변 — 고지만.
 */
export const NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE =
  `철거ㆍ멸실일 이후 양도일까지의 기간에 과세기준일 2024.6.1.이 걸리고, 빈집정비사업 등의 시행으로 철거된 빈집이면 ${NBL.PTAX_BASIS_DEMOLISHED_VACANT_HOUSE}에 따라 철거된 날부터 3년이 지나지 않은 빈집의 부속토지는 별도합산과세대상이 될 수 있습니다. ` +
  `이 계산기는 철거 후 재산세 한시 지위를 판정하지 않았고, 건축물 멸실 유예기간(9호)은 2년이라 그 과세기준일을 덮지 못합니다. 빈집정비사업으로 철거한 주택이면 재산세 과세내역(고지서)으로 확인하세요 — 확인 필요.`;

/**
 * 빈집 셀 고지 발동 판정 — 철거ㆍ멸실일 후보 `removedOn` = ① 상태 이력(`changed`)의 **주택** 철거 행 날짜(`stateHistoryHouseRemovalDates`) ② 건축물 멸실 유예 9호 행의 기산일(행에는 주택 여부가 없다).
 * 하나라도 셀 안이면 한 줄. `tailBasisIsDemolished` = 꼬리 근거 «철거ㆍ멸실»을 선언해 `demolishedStatusNotice`가 이미 3년 문언을 싣는 경우 — 그때는 이 고지를 싣지 않는다.
 * (이 leaf는 `landStateHistory`를 읽지 않는다 — 그 입력의 판정 쪽 reader는 types·매퍼·`other-land-state-history-apply`뿐이다: WIRE-7 게이트.)
 */
export function demolishedVacantHouseCellNotices(i: { transferDate: Date; removedOn: ReadonlyArray<Date> }, tailBasisIsDemolished: boolean): string[] {
  if (tailBasisIsDemolished) return [];
  return i.removedOn.some((r) => isVacantHouseThreeYearCell(r, i.transferDate)) ? [NBL_PTAX_DEMOLISHED_VACANT_HOUSE_3Y_NOTICE] : [];
}

/** 건축물 멸실 유예 9호 행의 기산일(= 철거ㆍ멸실일) 목록 — 빈집 셀 고지의 후보. */
export function demolitionGraceAnchorDates(input: Pick<NonBusinessLandInput, "gracePeriods">): Date[] {
  return input.gracePeriods.filter((g) => g.reasonCode === "demolition").map((g) => g.startDate);
}

/**
 * 꼬리 근거 «철거ㆍ멸실»의 «확실히 지남» **충분조건**(E3f-1b · 계획서 §5.3 · Q-6 (가)) — 양도일 이전(당일 포함) 마지막 과세기준일 `s`에 대해
 *   `s`가 «철거ㆍ멸실된 날부터 W_max(s)개월이 지나지 아니한» 기간(만료일 당일까지)의 **뒤**다(W_max = 2016.6.1. 전 시행본 없음 · 2024.6.1. 전 6개월 · 그 이후 3년 — 빈집정비 여부를 받지 않아 긴 기간으로 본다).
 * 참이면 철거ㆍ멸실일부터 `s`까지 한시 기간이 이미 끝났다 — 꼬리 전체를 별도합산 사업용으로 세는 것은 법 근거가 없으므로 근거를 접는다(종합합산 + 확인 필요).
 *
 * **기간 계산**: 지방세기본법 §23 → 「민법」 §157(초일불산입 — 기산일은 철거ㆍ멸실일 다음날) · §160②(만료 월의 기산일 응당일 전날 만료) · §160③(해당일 없으면 그 달 말일 만료).
 * 만료일 **당일까지는 한시 안**이다 — `isWithinPeriodMonths`(`civil-period.ts`). 철거일이 월 말일이면 `addMonths`가 아니라 만료 월의 말일이 만료일이다(4.30. 철거 + 6개월 = 10.31.).
 *
 * **접으면 안 되는 경우**(법 근거 없는 불리 금지): 철거 후 첫 과세기준일이 아직 안 왔으면(`s < 철거일` — 그 과세기준일의 지위는 건축물 부속토지) · 한시 안(충분조건 미충족) · 시행 전(2016.6.1. 전) · 날짜 해석 불가 → 거짓.
 * 경계 쌍(K-11a/b · 2026-11-24 정정): 철거 2022-12-01 → 기산일 12-02 → 6개월 만료일 2023-06-01(그날 끝까지 기간 안) → 과세기준일 2023-06-01 현재는 «6개월이 지나지 아니한» = **한시 안** · 철거 2022-11-30 → 만료일 2023-05-31 → 지남.
 * (정정 전에는 `s ≥ 철거일 + 6개월`로 만료일 당일을 «지남»으로 읽어 하루 불리했다.)
 */
export function isTailDemolishedClearlyExpired(removedOn: Date, transferDate: Date): boolean {
  if (!isValid(removedOn) || !isValid(transferDate)) return false;
  const s = lastPropertyTaxBaseDateOnOrBefore(transferDate);
  if (!s) return false;
  // `s ≥ 철거일 + W`(W > 0)이면 `s ≥ 철거일`이 따라온다 — 철거 후 첫 과세기준일이 아직 안 온 경우(K-13)는 따로 가르지 않아도 거짓이다.
  const months = demolishedStatusMaxMonths(s);
  return months > 0 && !isWithinPeriodMonths(removedOn, months, s);
}

/** 꼬리 근거 «철거ㆍ멸실» — 철거일부터 한시 기간이 확실히 지나 근거를 접은 고지. 입력 화면의 시점 안내(⑤)와 결과 고지가 같은 문구를 읽는다(단일 소스). */
export const NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE =
  `철거ㆍ멸실일부터 한시 별도합산 기간(${NBL.PTAX_BASIS_DEMOLISHED_BODY} — 시행본에 따라 6개월, 2024.6.1.~ 빈집정비사업으로 철거된 빈집은 3년이며 이 계산기는 어느 쪽인지 묻지 않고 긴 기간으로 보았습니다)이 양도일 직전 과세기준일까지 확실히 지나 ` +
  `이 근거는 인정하지 않고 종합합산으로 판정했습니다. 그 기간의 별도합산 인정은 「부득이한 사유 유예기간」의 「건축물 멸실·철거·붕괴」(9호)를 입력했으면 그대로 반영됩니다 — 확인 필요.`;

/** 꼬리 근거 «철거ㆍ멸실» — 철거ㆍ멸실일 없이 엔진을 직접 호출한 경우의 안전망 고지(화면·API 경로는 ⑧·⑫가 먼저 막아 도달하지 않는다). */
export const NBL_PTAX_DEMOLISHED_DATE_MISSING_NOTICE =
  `근거 «철거ㆍ멸실»의 철거ㆍ멸실일이 없어 한시 별도합산 기간(${NBL.PTAX_BASIS_DEMOLISHED_BODY})이 지났는지 확인할 수 없으므로 이 근거는 인정하지 않고 종합합산으로 판정했습니다 — 확인 필요.`;

// ─────────────────────────────────────────────────────────────────────────────
// E3f-2 — 나대지 구간 근거 «철거ㆍ멸실»의 한시 창 (계획서 §4 · §5.1 · §5.4 · §7.5)
// ─────────────────────────────────────────────────────────────────────────────
//
// ## 일 단위 창 (재도출 — #3641 «끝» 경계 정정 반영)
// 철거일 `r`, 한시 기간 `W`개월: 「지방세기본법」 §23 → 「민법」 §157(초일불산입 — 기산일 = `r` 다음날) · §160②③(만료일) → 한시 기간은 `r` 다음날부터 `periodEndFromMonths(r, W)` **당일까지**다.
// 계획서 v4의 `[r, r+W)`(과세기준일이 만료일과 같으면 «지남»)는 하루 불리했다(§7.5).
//   · **게이트(Q-4)**: 과세기준일 `s`(6.1.) 중 `max(r, 구간 시작) ≤ s < 구간 끝`이고 `s`가 «`r`부터 `W(s)`개월이 지나지 아니한» 기간(만료일 당일까지) 안인 것이 **하나도 없으면** 한시는 성립하지 않는다.
//     구간 안에 과세기준일이 있어야 하는 이유: 재산세 구분은 과세기준일마다 정해지므로 선언한 구분(별도합산 + 근거 «철거ㆍ멸실»)은 **그 구간 안의 과세기준일**에서만 지위를 갖는다 — 철거 → 구분 변경 → 구분 변경으로 나대지 구간을 쪼갠 사용자는
//     과세기준일이 없는 조각에는 창을 받지 못한다(조각을 어떻게 나누느냐로 인정 일수가 늘지 않는 보수 쪽 · 계획서 §4의 «r ≤ s ≤ 구간 끝»에서 «구간 시작»을 더한 해석 — 확인 필요).
//   · **창** = `[r, 만료일 + 1일)` — 철거일 **당일부터** 만료일 당일까지(일 단위 · 닫는 사건일·구간 시작으로 자른다). 철거일 당일은 이력 구간 관례(`[사건일, 다음 사건일)`)로 나대지 구간의 첫날이고,
//     그날은 철거 전 건축물 부속토지이거나 철거된 날 기준 한시 안(과세기준일이 철거일이면 «6개월이 지나지 아니한» — 꼬리 한도 `isTailDemolishedClearlyExpired`와 같은 읽기)이라 어느 쪽이든 별도합산 기간이다 —
//     창이 `r + 1`일에서 시작하면 건축물 구간(`[…, r)`)과 창 사이에 하루가 비고, `r`에서 시작하면 겹치지 않고 비지 않는다. 길이 = W개월 + 1일(철거일 당일 포함).
//   · 창은 **과세기준일 `s`가 지위를 갖는 날을 며칠에 배정하는가**의 근사다 — 법문에 일 배정은 없고 이 창은 «철거일부터 만료일까지 전부» 인정하는 상한 쪽이다(계획서 V-14 — 고지로 밝힘).
//   · 「민법」 §161(공휴일 연장)은 적용하지 않는다(요건 기간이지 행위 기한이 아니다 — #3641과 같은 결정 · 확인 필요).

/** 철거된 건축물 종류 — `house`(주택 — 빈집정비 3년 대상 · 면적 한도 칸 없음) · `building`(비주택 건축물 — 종전 바닥면적 × 영 §101② 배율). */
export type DemolishedRemovedKind = "house" | "building";

/** 이 구간에서 어떤 사실 칸이 필요한가 — ⑤ 표시 = ⑧ 요구 = ⑫′ 400 = ④ 운반 = ⑭ 읽기의 **단일 술어**(노출 ≡ 필수 — 화면에 없는 칸 400 금지). */
export interface DemolishedRequiredFacts {
  /** 허가·사용승인 3지선다 — 후보 과세기준일 ≥ 2019.6.1. */
  permit: boolean;
  /** 철거 후 건축 외 용도 사용 여부 3지선다 — 후보 ≥ 2024.6.1. */
  otherUse: boolean;
  /** 빈집정비사업 철거 빈집 3지선다 — **주택 철거 행** ∧ 후보 ≥ 2024.6.1. */
  vacantHouse: boolean;
  /** 종전 바닥면적(㎡) — **비주택 건축물 철거 행** ∧ 후보 ≥ 2024.6.1.(면적 범위 문언이 있는 시행본). */
  floorArea: boolean;
}

const NONE_REQUIRED: DemolishedRequiredFacts = { permit: false, otherUse: false, vacantHouse: false, floorArea: false };

/** 과세기준일(매년 6.1.) 중 `from ≤ s < toExclusive`. */
function propertyTaxBaseDatesIn(from: Date, toExclusive: Date): Date[] {
  const out: Date[] = [];
  for (let y = from.getUTCFullYear(); y <= toExclusive.getUTCFullYear(); y++) {
    const s = parseISO(`${String(y).padStart(4, "0")}-06-01`);
    if (!isBefore(s, from) && isBefore(s, toExclusive)) out.push(s);
  }
  return out;
}

/** 과세기준일 `s`가 «철거일부터 `months`개월이 지나지 아니한» 기간 안(만료일 당일까지)에 있는가 — `s ≥ r`은 호출자가 이미 보장한다. */
function holdsAt(removedOn: Date, s: Date, months: number): boolean {
  return months > 0 && isWithinPeriodMonths(removedOn, months, s);
}

/** 과세기준일 `s`의 범위 시작 — 철거일과 구간 시작 중 늦은 날(구간 시작을 모르면 철거일). */
const gateFrom = (removedOn: Date, intervalStart: Date | undefined): Date => (intervalStart && intervalStart.getTime() > removedOn.getTime() ? intervalStart : removedOn);

/**
 * **후보 과세기준일** — 사실 칸이 필요한지 정하는 보수적 집합: 빈집정비 «예»일 가능성(주택 행의 3년)을 열어 둔 최대 W로 `max(r, 구간 시작) ≤ s < end` 안에서 한시 안인 과세기준일.
 * 사용자 답에 따라 실제 성립 집합은 이 부분집합이다(`demolishedStatusWindow`).
 */
function candidateBaseDates(removedOn: Date, intervalStart: Date | undefined, end: Date, kind: DemolishedRemovedKind): Date[] {
  return propertyTaxBaseDatesIn(gateFrom(removedOn, intervalStart), end).filter((s) => holdsAt(removedOn, s, demolishedStatusPeriodMonths(s, kind === "house")));
}

/**
 * 이 구간에 «어떤 사실 칸이 필요한가». `historyRead`가 거짓(엔진이 이력을 읽지 않음 — 양도일 의제 ∨ core 부분 면적, UQ-8 (가))이거나 날짜를 못 쓰면 **빈 집합**(4칸 모두 요구·표시하지 않는다).
 * 후보 과세기준일이 하나도 없으면(한시 불성립 — 접힘 `demolished_never_period`) 사실을 물을 이유가 없어 빈 집합이다.
 */
export function demolishedRequiredFacts(i: {
  removedOn: Date | undefined;
  /** 선언한 나대지 구간의 시작(앞 사건일 — 철거 → 구분 변경 → … 이면 둘째 이후 조각은 철거일보다 늦다). 모르면 철거일. */
  intervalStart?: Date | undefined;
  end: Date | undefined;
  kind: DemolishedRemovedKind;
  historyRead: boolean;
}): DemolishedRequiredFacts {
  if (!i.historyRead || !i.removedOn || !i.end || !isValid(i.removedOn) || !isValid(i.end)) return NONE_REQUIRED;
  const candidates = candidateBaseDates(i.removedOn, i.intervalStart && isValid(i.intervalStart) ? i.intervalStart : undefined, i.end, i.kind);
  if (candidates.length === 0) return NONE_REQUIRED;
  return {
    permit: candidates.some(demolishedPermitClauseApplies),
    otherUse: candidates.some(demolishedOtherUseClauseApplies),
    vacantHouse: i.kind === "house" && candidates.some(demolishedVacantHouseClauseApplies),
    floorArea: i.kind === "building" && candidates.some(demolishedAreaClauseApplies),
  };
}

/**
 * E3f-3 — 영 §103의2 2호 **단서**(빈집정비 철거 빈집 부속토지의 국가 등 공용·공공용 사용)를 묻는 하위 칸이 열리는가 — ⑤ 표시 · ⑧ 차단 · ⑫′ 400 · ④ 운반 · ⑭ 읽기가 모두 이 함수 하나를 부른다(노출 ≡ 필수).
 * `need`는 구조 술어(`demolishedRequiredFacts` — 후보 과세기준일 시행본 · 주택 철거 행), `ev`는 와이어(문자열) 사건 행이다. 답 의존 사슬: 건축 외 용도 «예» ∧ 빈집정비 «예» → 공용 사용(`publicUse`) →
 * «예»이면 유료 여부(`paid`) → «예»이면 개시일·종료일(`dates`). 상위 답이 «아니오»·«모름»·미선택이면 하위 칸은 열리지 않는다(요구 0 · 운반 0 · 읽기 0).
 */
export interface DemolishedPublicUseAsked {
  /** 공용·공공용 1년 이상 사용 3지선다 칸. */
  publicUse: boolean;
  /** 유료·유상이전 약정(재산세 부과) 3지선다 칸. */
  paid: boolean;
  /** 사용 개시일·종료일 칸. */
  dates: boolean;
}

export function demolishedPublicUseAsked(
  need: Pick<DemolishedRequiredFacts, "otherUse" | "vacantHouse">,
  ev: { demolishedOtherUseBefore?: string; demolishedVacantHouseBefore?: string; demolishedPublicUseBefore?: string; demolishedPublicUsePaidBefore?: string },
): DemolishedPublicUseAsked {
  const publicUse = need.otherUse && need.vacantHouse && ev.demolishedOtherUseBefore === "yes" && ev.demolishedVacantHouseBefore === "yes";
  const paid = publicUse && ev.demolishedPublicUseBefore === "yes";
  const dates = paid && ev.demolishedPublicUsePaidBefore === "yes";
  return { publicUse, paid, dates };
}

export interface DemolishedStatusFacts {
  permit?: DemolishedFact;
  otherUse?: DemolishedFact;
  vacantHouse?: DemolishedFact;
  floorArea?: number;
  /** E3f-3 — 영 §103의2 2호 단서: 국가 등 1년 이상 공용·공공용 사용(계약서 입증 포함) · 유료·유상이전 약정 선사용(재산세 부과 — 법 §109② 단서) · 사용 개시일·종료일(양 끝 포함). */
  publicUse?: DemolishedFact;
  publicPaid?: DemolishedFact;
  publicUseFrom?: Date;
  publicUseTo?: Date;
}

export type DemolishedFoldReason =
  | "demolished_never_period"
  | "demolished_permit"
  | "demolished_other_use"
  | "demolished_public_use_no_base_date"
  | "demolished_area_missing"
  | "demolished_area_exceeded";

export type DemolishedStatusWindow =
  /**
   * 한시가 성립한다 — `window`는 구간 안으로 자른 일 단위 창 · `months`는 창을 정한 한시 기간 · `vacantHouseExtensionUnconfirmed` = 주택인데 빈집정비 «예»가 아니라 3년 연장을 반영하지 않았다 ·
   * `publicUse` = 영 §103의2 2호 단서(국가 등 공용 사용 기간)로 받은 창이 결과에 쓰였다(E3f-3) ·
   * `publicUseWindow` = 제한 없는 창(`window`)과 단서 창이 **떨어져 있어** 합치지 못한 때의 단서 창(두 창의 합집합이 사업용 — 맞닿거나 겹치면 `window` 하나로 합쳐 없다. 이때 `months`는 `window`를 정한 기간) ·
   * `publicUseMixed` = 제한 없는 창(단서 시행 전 과세기준일 몫)과 단서 창이 **함께** 성립했다(맞닿아 합쳤든 떨어졌든) — 인정 기간이 «공용 사용 기간만»이 아님을 라벨·고지가 말하는 근거 ·
   * `publicUseUnused` = 단서를 «주장»(4칸 모두 답함)했으나 공용 사용 기간 안에 단서가 필요한 과세기준일이 하나도 없어 결과에 아무 영향도 주지 못했다(고지 — 접힘 사유 `demolished_public_use_no_base_date`와 겹치지 않는다: 접히면 이 값은 없다).
   */
  | { kind: "holds"; window: DateInterval; publicUseWindow?: DateInterval; months: 6 | 12 | 36; vacantHouseExtensionUnconfirmed: boolean; publicUse: boolean; publicUseMixed: boolean; publicUseUnused: boolean }
  /** 접는다(종합합산 + 확인 필요). */
  | { kind: "fold"; reason: DemolishedFoldReason };

/** 종전 바닥면적 × 영 §101② 용도지역별 배율 범위가 토지 면적 이상인가. 바닥면적이 없거나 배율표 밖 용도지역이면 `missing`(⑧·⑫가 먼저 막는다 — 직접 호출 안전망). */
function areaVerdict(floorArea: number | undefined, landArea: number, zoneType: string): "within" | "exceeded" | "missing" {
  if (floorArea === undefined || !Number.isFinite(floorArea) || !(floorArea > 0) || !Number.isFinite(landArea)) return "missing";
  try {
    return judgeAppurtenantLandExcess({ landArea, buildingFootprintArea: floorArea, zoneType, context: "기타토지(철거·멸실 나대지 구간)" }).isWithinLimit ? "within" : "exceeded";
  } catch {
    return "missing";
  }
}

/**
 * 나대지 구간 근거 «철거ㆍ멸실»의 한시 창을 정한다(순수). `removedOn` = 철거 행 날짜 · `intervalStart`·`end` = 선언한 나대지 구간 `[start, end)`(닫는 사건일이 끝).
 *
 * 과세기준일 `s`가 **성립**하려면: `r ≤ s < end` ∧ `s`가 W(s) 안(만료일 당일까지 — 주택 행은 빈집정비 «예»일 때 W(s) = 36) ∧ 그 시행본이 요구하는 사실을 충족
 * (허가 `yes`(s ≥ 2019.6.1.) · 건축 외 용도 `no`(s ≥ 2024.6.1.) · 비주택 건축물은 종전 바닥면적 × 배율 ≥ 토지 면적(s ≥ 2024.6.1.)). «모름»·`""` = 충족하지 못함(혜택 불성립 + 확인 필요).
 * 성립하는 과세기준일이 하나도 없으면 접는다 — 사유 우선순위: 기간(never) → 허가 → 건축 외 용도 → 면적. 성립 과세기준일의 **최대 W**가 창 길이를 정하고(`[r, 만료일 + 1일)`),
 * 창은 구간 `[intervalStart, end)` 안으로 자른다(게이트가 «구간 안의 과세기준일»이라 구간이 만료일 뒤에 시작하면 `demolished_never_period`).
 * 면적이 부분(허용 < 토지)이면 그 시행본의 과세기준일은 성립하지 않는다 — 자동 안분 없음(Q-9: 「초과」가 「모름」보다 유리하지 않다).
 */
export function demolishedStatusWindow(i: {
  removedOn: Date;
  intervalStart: Date;
  end: Date;
  kind: DemolishedRemovedKind;
  facts: DemolishedStatusFacts;
  landArea: number;
  zoneType: string;
}): DemolishedStatusWindow {
  const vacantYes = i.kind === "house" && i.facts.vacantHouse === "yes";
  const inBase = propertyTaxBaseDatesIn(gateFrom(i.removedOn, i.intervalStart), i.end);
  const monthsAt = (s: Date) => demolishedStatusPeriodMonths(s, vacantYes);
  const inPeriod = inBase.filter((s) => holdsAt(i.removedOn, s, monthsAt(s)));
  if (inPeriod.length === 0) return { kind: "fold", reason: "demolished_never_period" };

  const needsArea = i.kind === "building" && inPeriod.some(demolishedAreaClauseApplies);
  const area = needsArea ? areaVerdict(i.facts.floorArea, i.landArea, i.zoneType) : "within";
  // E3f-3 — 영 §103의2 2호 단서: 빈집정비 «예» ∧ 건축 외 용도 «예» ∧ 공용 사용 «예» ∧ 유료(재산세 부과) «예» ∧ 개시일 ≤ 종료일일 때만 «주장». 하나라도 «아니오»·«모름»·빈칸이면 주장 아님(혜택 불성립).
  const { publicUseFrom: from, publicUseTo: to } = i.facts;
  const claimed =
    vacantYes && i.facts.otherUse === "yes" && i.facts.publicUse === "yes" && i.facts.publicPaid === "yes" && !!from && !!to && isValid(from) && isValid(to) && !isBefore(to, from);
  const inPublicUse = (s: Date) => claimed && !isBefore(s, from!) && !isBefore(to!, s);
  const permitOk = (s: Date) => !demolishedPermitClauseApplies(s) || i.facts.permit === "yes";
  const otherUseOk = (s: Date) => !demolishedOtherUseClauseApplies(s) || i.facts.otherUse === "no" || inPublicUse(s);
  // 단서에 기대어 성립하는 과세기준일(건축 외 용도 제한 시행본 ∧ 건축 외 용도 «아니오» 아님) — 그 날은 공용 사용 기간 안일 때만 성립한다.
  const relyOnClaim = (s: Date) => demolishedOtherUseClauseApplies(s) && i.facts.otherUse !== "no";
  const areaOk = (s: Date) => i.kind !== "building" || !demolishedAreaClauseApplies(s) || area === "within";
  const holding = inPeriod.filter((s) => permitOk(s) && otherUseOk(s) && areaOk(s));
  if (holding.length === 0) {
    if (inPeriod.some((s) => !permitOk(s))) return { kind: "fold", reason: "demolished_permit" };
    if (inPeriod.some((s) => !otherUseOk(s))) return { kind: "fold", reason: claimed ? "demolished_public_use_no_base_date" : "demolished_other_use" };
    return { kind: "fold", reason: area === "exceeded" ? "demolished_area_exceeded" : "demolished_area_missing" };
  }

  // 창 = [철거일, 만료일 + 1일) ∩ 구간 — 단서에 기댄 과세기준일만 있으면 추가로 공용 사용 기간 [개시일, 종료일 + 1일)과 교집합한다(현행 문언 «그 공용 또는 공공용으로 사용하는 기간 동안의»).
  const windowFor = (dates: Date[], publicOnly: boolean): DateInterval => {
    const lastDay = periodEndFromMonths(i.removedOn, Math.max(...dates.map(monthsAt)));
    const startRaw = i.removedOn.getTime() > i.intervalStart.getTime() ? i.removedOn : i.intervalStart;
    const endRaw = addDays(lastDay, 1);
    let start = startRaw;
    let end = endRaw.getTime() < i.end.getTime() ? endRaw : i.end;
    if (publicOnly) {
      if (from!.getTime() > start.getTime()) start = from!;
      const toExcl = addDays(to!, 1);
      if (toExcl.getTime() < end.getTime()) end = toExcl;
    }
    return { start, end };
  };
  const own = holding.filter((s) => !relyOnClaim(s));
  const byClaim = holding.filter(relyOnClaim);
  let window: DateInterval;
  let publicUseWindow: DateInterval | undefined;
  let publicUse = false;
  let publicUseMixed = false;
  let used = holding; // 창 길이(`months`)를 정한 과세기준일
  if (byClaim.length === 0) {
    window = windowFor(own, false);
  } else if (own.length === 0) {
    window = windowFor(byClaim, true);
    publicUse = true;
  } else {
    // 단서 시행(2024.6.1.) 전 과세기준일(제한 없음)과 단서에 기댄 과세기준일이 함께 성립 — 각 창은 자기 게이트(`own` · `byClaim`)를 각자 충족한 합집합이다.
    // 맞닿거나 겹치면 하나로 합치고, 떨어져 있으면 두 창을 따로 둔다(떨어진 사이는 메우지 않는다 — 합집합이라 종전 판정도 줄지 않는다).
    const a = windowFor(own, false);
    const b = windowFor(byClaim, true);
    publicUse = true;
    publicUseMixed = true;
    if (b.start.getTime() <= a.end.getTime() && a.start.getTime() <= b.end.getTime()) {
      window = { start: a.start.getTime() < b.start.getTime() ? a.start : b.start, end: a.end.getTime() > b.end.getTime() ? a.end : b.end };
    } else {
      // `b`는 항상 `a` 뒤다(둘 다 `max(철거일, 구간 시작)`에서 시작하고 `b`는 거기에 개시일 하한이 더 붙는다).
      window = a;
      publicUseWindow = b;
      used = own;
    }
  }
  // 주장했으나 단서에 기댄 과세기준일이 하나도 성립하지 않았다 — 결과에 영향이 없었음을 고지한다.
  const publicUseUnused = claimed && byClaim.length === 0;
  const months = Math.max(...used.map(monthsAt)) as 6 | 12 | 36;
  // 구간 안에 한시 안의 과세기준일 `s`가 있으므로(`inPeriod`) `구간 시작 ≤ s ≤ 만료일` — 자른 창은 비지 않는다(방어: 비면 불성립).
  if (window.end.getTime() <= window.start.getTime()) return { kind: "fold", reason: "demolished_never_period" };
  // 3년 연장을 묻는 구간(주택 + 후보 ≥ 2024.6.1.)에서 빈집정비 «예»가 아니면 일반 W만 반영했다는 고지를 단다.
  const extensionAsked = i.kind === "house" && inBase.some((s) => demolishedVacantHouseClauseApplies(s) && holdsAt(i.removedOn, s, demolishedStatusPeriodMonths(s, true)));
  return { kind: "holds", window, ...(publicUseWindow ? { publicUseWindow } : {}), months, vacantHouseExtensionUnconfirmed: extensionAsked && !vacantYes, publicUse, publicUseMixed, publicUseUnused };
}
