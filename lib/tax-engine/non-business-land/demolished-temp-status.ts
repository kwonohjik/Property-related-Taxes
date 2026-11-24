/**
 * 철거ㆍ멸실 후 재산세 한시 지위(지방세법 시행령 §103의2) — 고지 leaf (NBL-STATE-HISTORY-E3-⑤ · E3f-1a). 순수 함수 — DB·`new Date(x)` 없음.
 *
 * 계획서(정본): docs/01-plan/features/nbl-state-history-e3-5-demolition-temp-status.engine.plan.md v4 §1.2~§1.3 · §5.1 · §5.8 · §6.2 D-5 · §7.3 (K-19~K-23 · K-30)
 * E3f-1a는 **고지**(입력 0 · 판정·세액 불변), E3f-1b는 **꼬리 한도**(`isTailDemolishedClearlyExpired` — 철거ㆍ멸실일 입력이 있을 때만 읽는다)를 소유한다. E3f-2가 한시 창·구간 선언 함수(`demolishedStatusWindow` 등)를 더하는 자리다.
 *
 * ## 고지 연혁화(Q-2 (가) · F-1)
 * 종전 `NBL_PTAX_DEMOLISHED_STATUS_NOTICE`는 «1년»(2026.6.1.~ 시행본)을 양도일과 무관하게 고정해 그 전 양도에도 «1년»이라 말했다.
 * `demolishedStatusNotice(transferDate)`는 **양도일 ≥ 6.1. 경계 상수**(`demolishedStatusEra` — 2016.6.1. · 2019.6.1. · 2024.6.1. · 2026.6.1.)로 시행본 문구를 고른다.
 * 양도일 ≥ 2026.6.1.의 문구는 종전과 **같은 문장**이다(상수의 항 번호 정정 «시행령 §103의2 ① 1호» → «§103의2 1호»만 다르다 — 조문에 항이 없다).
 * 시행본 본문은 KoreanLaw MCP 실독(MST 178638 · 206456 · 257499 · 262781 · 282549 · 290815)에 기댄다 — 연혁 문언은 현행만 검증하는 `verify:legal` 대상이 아니다(계획서 V-11).
 * 한시 지위는 과세기준일마다 그날 시행본으로 정해지므로 «양도일 시행본» 안내는 근사다 — 그래서 2026.6.1. 전 변형에는 그 한계를 밝힌다(판정에는 쓰지 않는다).
 */
import { NBL } from "../legal-codes";
import { demolishedStatusEra, demolishedStatusMaxMonths, hasDemolishedStatusEraDate, isVacantHouseThreeYearCell, lastPropertyTaxBaseDateOnOrBefore } from "../data/nbl-historical-values-era";
import type { DemolishedStatusEra } from "../data/nbl-historical-values-era";
import { addMonths, isBefore, isValid } from "../utc-date";
import type { NonBusinessLandInput } from "./types";

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
 * 빈집 3년 셀 고지 — 근거 «철거ㆍ멸실»을 선언하지 **않은** 입력용(입력 칸 없이 발동). 철거ㆍ멸실일이 (2021.6.1., 2022.6.1.]이고 양도일이 [2024.6.1., 2025.3.21.)이면
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
 *   `s ≥ 철거ㆍ멸실일` ∧ `s ≥ 철거ㆍ멸실일 + W_max(s)`(W_max = 2016.6.1. 전 시행본 없음 · 2024.6.1. 전 6개월 · 그 이후 3년 — 빈집정비 여부를 받지 않아 긴 기간으로 본다).
 * 참이면 철거ㆍ멸실일부터 `s`까지 한시 기간이 이미 끝났다 — 꼬리 전체를 별도합산 사업용으로 세는 것은 법 근거가 없으므로 근거를 접는다(종합합산 + 확인 필요).
 *
 * **접으면 안 되는 경우**(법 근거 없는 불리 금지): 철거 후 첫 과세기준일이 아직 안 왔으면(`s < 철거일` — 그 과세기준일의 지위는 건축물 부속토지) · 한시 안(충분조건 미충족) · 시행 전(2016.6.1. 전) · 날짜 해석 불가 → 거짓.
 * 경계 쌍(K-11a/b): 철거 2022-12-01은 철거일 + 6개월 = 2023-06-01 = 과세기준일(«6개월이 지나지 않은»이 아님) → 지남 · 12-02는 한시 안.
 */
export function isTailDemolishedClearlyExpired(removedOn: Date, transferDate: Date): boolean {
  if (!isValid(removedOn) || !isValid(transferDate)) return false;
  const s = lastPropertyTaxBaseDateOnOrBefore(transferDate);
  if (!s) return false;
  // `s ≥ 철거일 + W`(W > 0)이면 `s ≥ 철거일`이 따라온다 — 철거 후 첫 과세기준일이 아직 안 온 경우(K-13)는 따로 가르지 않아도 거짓이다.
  const months = demolishedStatusMaxMonths(s);
  return months > 0 && !isBefore(s, addMonths(removedOn, months));
}

/** 꼬리 근거 «철거ㆍ멸실» — 철거일부터 한시 기간이 확실히 지나 근거를 접은 고지. 입력 화면의 시점 안내(⑤)와 결과 고지가 같은 문구를 읽는다(단일 소스). */
export const NBL_PTAX_DEMOLISHED_PERIOD_ELAPSED_NOTICE =
  `철거ㆍ멸실일부터 한시 별도합산 기간(${NBL.PTAX_BASIS_DEMOLISHED_BODY} — 시행본에 따라 6개월, 2024.6.1.~ 빈집정비사업으로 철거된 빈집은 3년이며 이 계산기는 어느 쪽인지 묻지 않고 긴 기간으로 보았습니다)이 양도일 직전 과세기준일까지 확실히 지나 ` +
  `이 근거는 인정하지 않고 종합합산으로 판정했습니다. 그 기간의 별도합산 인정은 「부득이한 사유 유예기간」의 「건축물 멸실·철거·붕괴」(9호)를 입력했으면 그대로 반영됩니다 — 확인 필요.`;

/** 꼬리 근거 «철거ㆍ멸실» — 철거ㆍ멸실일 없이 엔진을 직접 호출한 경우의 안전망 고지(화면·API 경로는 ⑧·⑫가 먼저 막아 도달하지 않는다). */
export const NBL_PTAX_DEMOLISHED_DATE_MISSING_NOTICE =
  `근거 «철거ㆍ멸실»의 철거ㆍ멸실일이 없어 한시 별도합산 기간(${NBL.PTAX_BASIS_DEMOLISHED_BODY})이 지났는지 확인할 수 없으므로 이 근거는 인정하지 않고 종합합산으로 판정했습니다 — 확인 필요.`;
