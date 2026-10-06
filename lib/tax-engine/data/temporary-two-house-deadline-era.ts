/**
 * 「소득세법 시행령」 §155① 일시적 2주택 — **조정대상지역 처분기한의 연혁** (OH-01)
 * (개정 없는 확정 역사 데이터. 정적 상수 — seed `tax_rates`로 연혁을 표현하지 않는다:
 *  E-14n 전 다건 route는 과세기간 말일로 행을 골라 자산별 양도일을 표현할 수 없었고, 행은 신규취득일 축도 표현하지 못한다.)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.1. 본문·부칙은 법제처 DRF 실독(2026-09-26).
 *
 * | 구간 | 기준축 | 기한 | 근거 |
 * |---|---|---|---|
 * | 양도 < 2002-03-30 | 양도일 | **2년** · 1년 경과 요건 없음 | 1999-01-01 ~ 2002-01-01본 §155①(DRF eflaw 실독 — 1999-01-01 전 시행본은 미확인) |
 * | 2002-03-30 ≤ 양도 < 2008-11-28 | 양도일 | **1년** · 1년 경과 요건 없음 | 2002-03-30본 §155①(제17555호, 공포일 시행) · 같은 부칙 ② 「시행후 최초로 양도하는 분부터」 |
 * | ↳ 그중 신규 취득 < 2002-03-30 | 신규취득일 | 부칙 ③ 경과조치(아래) — **미구현: 종전 2년 + 판정 보류 고지** | 제17555호 부칙 ③ |
 * | 2008-11-28 ≤ 양도 < 2012-06-29 | 양도일 | **2년** · 1년 경과 요건 없음 | 2008-11-28본 §155①(제21138호, 부칙 제2조 「시행 후 최초로 양도하는 분부터」) |
 * | 양도 ≥ 2012-06-29 | — | 본문 3년 + 「종전의 주택을 취득한 날부터 1년 이상이 지난 후」 | 2012-06-29본 §155①(제23887호, 공포일 시행) — DRF eflaw 실독 2026-10-06 |
 * | 비조정 또는 한쪽만 조정 | — | 3년(본문) | §155① 본문 |
 * | 조정→조정, 양도 < 2018-10-23 | 양도일 | 3년(본문) | 대통령령 제29242호 부칙 제2조① |
 * | 조정→조정, 신규 취득 ≤ 2018-09-13 | 신규취득일 | 3년(본문) | 제29242호 부칙 제2조②1호 |
 * | 조정→조정, 신규 취득 ≥ 2018-09-14 | 신규취득일 | **2년** | §155① 괄호(MST 204914, 2018-10-23 시행) |
 * | 조정→조정, 신규 취득 ≥ 2019-12-17 · 양도 2020-02-11 ~ 2022-05-09 | 둘 다 | **1년** + 1년 내 세대전원 전입 | §155①2호 가·나목(MST 218373), 제30395호 부칙 제15조 |
 * | 조정→조정, 양도 2022-05-10 ~ 2023-01-11 | 양도일 | **2년** | §155①2호(MST 242735), 제32654호 부칙 제3조 |
 * | 양도 2023-01-12 ~ 2026-09-30 | 양도일 | 3년(본문) | 2호 삭제(MST 248191), 제33267호 부칙 제8조 |
 * | 조정→조정, 양도 ≥ 2026-10-01 · 신규 취득(또는 계약) ≥ 2026-08-04 | 둘 다 | **2년** | §155①1호(MST 290841), 제36737호 부칙 제2조① |
 * | 양도 ≥ 2026-10-01 · 1호 외(신규 취득·계약이 2026-08-03 이전 등) | — | 3년(2호) | §155①2호(MST 290841), 제36737호 부칙 제2조②1·2호 |
 *
 * 부칙 원문(대통령령 제30395호 제15조): 「① 제155조제1항의 개정규정은 이 영 시행 이후 양도하는 분부터
 * 적용한다. ② … 2019년 12월 16일 이전에 조정대상지역에 있는 신규 주택 … 을 취득한 경우 …
 * 종전의 규정에 따른다.」 제29242호 제2조②는 같은 구조로 2018-09-13을 기준으로 한다.
 *
 * 부칙 원문(대통령령 제36737호 제2조 — 2026.9.30. 공포·2026.10.1. 시행, MST 290841 실독): 「①
 * 제155조제1항제1호의 개정규정은 조정대상지역에 종전의 주택을 보유한 1세대가 2026년 8월 4일 이후에
 * 조정대상지역에 있는 신규 주택을 취득하는 경우(제2항 각 호에 해당하는 경우는 제외한다)로서 이 영 시행
 * 이후 종전의 주택을 양도하는 경우부터 적용한다. ② 다음 각 호의 어느 하나에 해당하는 경우에는 제155조
 * 제1항제1호의 개정규정에도 불구하고 종전의 제155조제1항에 따른다. 1. … 2026년 8월 3일 이전에 …
 * 신규 주택(신규 주택을 취득할 수 있는 권리를 포함한다) … 을 취득한 경우 2. … 2026년 8월 3일 이전에 …
 * 매매계약을 체결하고 계약금을 지급한 사실이 증명서류에 의해 확인되는 경우」 — 구조는 제29242호
 * 제2조②·제30395호 제15조②와 같다(이르면 기준일, 취득·계약 중 이른 날 기준).
 *
 * 🔑 A2b(2026-09-26)에서 아래를 이 leaf에 넣었다:
 *   1. 2019-12-17 체제 **2호 가목(1년 내 세대전원 이사·전입신고)** — `moveInDate`가 있으면 판정하고
 *      (`moveInMet`), 없으면 종전대로 `moveInRequirementPending`으로 「판정하지 않았다」를 알린다.
 *   2. 같은 호 **단서(기존 임차인)** — 원문(대통령령 제30395호로 개정된 §155①2호 단서, MST 218373 실독):
 *      「신규 주택의 취득일 현재 기존 임차인이 거주하고 있는 것이 임대차계약서 등 명백한 증명서류에 의해
 *      확인되고 그 임대차기간이 끝나는 날이 신규 주택의 취득일부터 1년 후인 경우에는 다음 각 목의 기간을
 *      전 소유자와 임차인간의 임대차계약 종료일까지로 하되, 신규 주택의 취득일부터 최대 2년을 한도로 하고,
 *      신규 주택 취득일 이후 갱신한 임대차계약은 인정하지 않는다.」 ⇒ `existingTenantLeaseEndDate`가
 *      1년 기한 말일 **뒤**면 가·나목 기한이 min(종료일, 2년 기한 말일)이 된다(`deadlineDate`).
 *   3. 부칙 제29242호 제2조②**2호**·제30395호 제15조②**2호**(기준일 이전 「매매계약을 체결하고 계약금을
 *      지급한 사실이 증빙서류에 의하여 확인되는 경우」) — `newContractDate`가 기준일 이전이면 취득일이
 *      뒤여도 종전 규정을 따른다.
 *
 * 조정 여부의 **판정 대상·시점**(「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규
 * 주택을 취득」)은 호출부 `resolveRegulatedAtNewAcquisition`(`transfer-tax-temporary-two-house-timing.ts`)가
 * 신규 취득일 기준으로 판정해 `bothRegulated`로 넘긴다.
 */

import { isOnOrBeforeDeadline, periodEndFrom } from "../civil-period";

/**
 * 제17555호 시행(공포)일 — 이 날 이후 양도분부터 처분기한 2년 → 1년 (부칙 ②).
 * 부칙 ③(중복보유기간 단축 경과조치): 시행 당시 신규 주택을 이미 취득해 종전 2년이 끝나지 않았으면 1호(시행일까지
 * 1년 이하 — 시행일부터 1년이 되는 날, 단 시행일부터 6월 경과 후 보유기간 충족이면 충족일 + 6월과 취득일부터 2년 중
 * 빠른 날)·2호(1년 초과 — 취득일부터 2년이 되는 날)까지 양도하면 1세대1주택. 보유기간 충족일(당시 §154① 지역별
 * 보유·거주)을 정확히 재현하지 못해 구현하지 않았다 — 종전 2년으로 두고 판정 보류를 고지한다.
 */
export const TT_1Y_DEADLINE_TRANSFER_START = new Date("2002-03-30");
/** 제21138호 시행(공포)일 — 이 날 이후 양도분부터 처분기한 1년 → 2년 (부칙 제2조). */
export const TT_2Y_DEADLINE_TRANSFER_START = new Date("2008-11-28");
/**
 * 제23887호 시행(공포)일 — 이 날 이후 양도분부터 처분기한 2년 → 3년과 「종전의 주택을 취득한 날부터
 * 1년 이상이 지난 후 다른 주택을 취득」 요건(부칙 제2조 「이 영 시행 후 최초로 양도하는 분부터」).
 */
export const TT_3Y_AND_ONE_YEAR_HOLD_TRANSFER_START = new Date("2012-06-29");

/** 요건 A(종전주택 취득 후 1년 경과 후 신규 취득)가 이 양도에 있는가 — 2012-06-29 전 양도분에는 없다. */
export function isOneYearHoldRequiredForTemporaryTwoHouse(transferDate: Date): boolean {
  return transferDate.getTime() >= TT_3Y_AND_ONE_YEAR_HOLD_TRANSFER_START.getTime();
}

/** 제29242호 시행(공포)일 — 이 날 이후 양도분부터 조정→조정 2년 (부칙 제2조①). */
export const TT_REGULATED_2Y_TRANSFER_START = new Date("2018-10-23");
/** 제29242호 부칙 제2조② — 신규 취득이 이 날 **전**(2018-09-13 이전)이면 종전 3년. */
export const TT_REGULATED_2Y_NEW_ACQ_START = new Date("2018-09-14");
/** 제30395호 시행(공포)일 — 이 날 이후 양도분부터 1년·전입 체제 (부칙 제15조①). */
export const TT_REGULATED_1Y_TRANSFER_START = new Date("2020-02-11");
/** 제30395호 부칙 제15조② — 신규 취득이 이 날 **전**(2019-12-16 이전)이면 종전 2년. */
export const TT_REGULATED_1Y_NEW_ACQ_START = new Date("2019-12-17");
/** 제32654호 부칙 제3조① — 이 날 이후 종전주택 양도분부터 2년. */
export const TT_REGULATED_2022_TRANSFER_START = new Date("2022-05-10");
/** 제33267호 부칙 제8조① — 이 날 이후 양도분부터 조정 구분 없이 본문 3년. */
export const TT_REGULATED_ABOLISHED_TRANSFER_START = new Date("2023-01-12");
/** 제36737호 시행(부칙 제1조)일 — 이 날 이후 양도분부터 2026 개정 §155①(1호 2년·2호 3년) 체제. */
export const TT_REGULATED_2026_TRANSFER_START = new Date("2026-10-01");
/** 제36737호 부칙 제2조①·②1·2호 — 신규 취득(또는 계약)이 이 날 **전**(2026-08-03 이전)이면 종전 규정(3년). */
export const TT_REGULATED_2026_NEW_ACQ_START = new Date("2026-08-04");

export interface TemporaryTwoHouseDeadlineEra {
  /** 처분기한(년) — 「신규 주택을 취득한 날부터 N년 이내」 */
  years: number;
  /**
   * 2019-12-17 체제(§155①2호 가·나목)에 해당하는데 **세대전원 전입일이 입력되지 않아** 가목(1년 내
   * 세대전원 이사·전입신고)을 판정하지 않았다 — 판정 메뉴·계산기가 이 사실을 고지한다.
   */
  moveInRequirementPending: boolean;
  /**
   * 2019-12-17 체제 **2호 가목** 판정 — 전입일이 가·나목 기한(`deadlineDate` 또는 1년 기한 말일)
   * 이내인가. 그 체제가 아니거나 전입일이 없으면 `undefined`.
   */
  moveInMet?: boolean;
  /**
   * 2호 **단서(기존 임차인)**로 늘어난 가·나목 기한 말일(그 날까지) — 「전 소유자와 임차인간의
   * 임대차계약 종료일까지로 하되, 신규 주택의 취득일부터 최대 2년을 한도」. 단서가 적용되지 않으면
   * `undefined`(기한은 `years`로 센다).
   */
  deadlineDate?: Date;
  /** 제17555호 부칙 ③(2002-03-30 전 신규 취득 · 그 후 양도) 경과조치를 판정하지 않았다 — 판정 보류 고지용. */
  transition2002Unverified?: boolean;
}

/** UTC 달력일 키 — `civil-period.ts`와 같은 규약(date-coerce 운영 경로 = UTC 자정). */
const dayKey = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * §155① 처분기한(년)을 연혁대로 정한다.
 *
 * @param bothRegulated 「종전 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을
 *   취득」했는가 — 호출부가 신규 취득일 기준으로 판정해 넘긴다.
 * @param baseDeadlineYears §155① 본문 기한(3년). 규칙 행 `temporary_two_house.disposalDeadlineYears`.
 *   🔴 종전 주석은 「연혁 없이 전 구간 3년」이었으나 틀렸다 — 2012-06-29 전 양도분은 2년, 2002-03-30 ~
 *   2008-11-27 양도분은 1년, 그 전은 2년이다(D14). 그 구간들은 아래에서 이 값보다 먼저 정한다.
 */
export function resolveTemporaryTwoHouseDeadlineEra(p: {
  bothRegulated: boolean;
  baseDeadlineYears: number;
  /**
   * 신규주택 취득일(요건 B의 기산일). 엔진 판정 경로(E-3·중과 15호)는 `temporaryTwoHouse` 게이트를
   * 통과한 뒤에만 부르므로 항상 넘긴다. 없으면 2018·2019 경과조치(3년·1년)를 가를 수 없어
   * 두 부칙 사이 구간은 제29242호 본칙인 2년으로 둔다(양도일만으로 정해지는 구간은 그대로).
   */
  newAcquisitionDate?: Date;
  /**
   * 신규 주택 매매계약 체결·계약금 지급일 — 부칙 제29242호 제2조②2호·제30395호 제15조②2호.
   * 기준일(2018-09-13 · 2019-12-16) 이전이면 취득일이 그 뒤여도 **종전의 규정**에 따른다.
   * (「증빙서류에 의하여 확인되는 경우」 — 자기선언 입력이다.)
   */
  newContractDate?: Date;
  /**
   * 종전주택 취득일(D13) — 부칙 제29242호 제2조②·제30395호 제15조②·제36737호 제2조②는 모두 「조정대상지역에
   * 종전의 주택을 **보유한** 1세대가 … 이전에 신규 주택을 취득(계약)한 경우」다. 종전주택을 보유하기 **전에**
   * 신규 분양권을 계약했으면 그 계약은 경과조치의 기준이 아니고 종전주택 취득시점이 기준이다
   * (기획재정부 재산세제과-512, 2021.5.25. 별첨 Case 2 — 분양권 2개면 먼저 주택이 되는 시점).
   * ⚠️ 같은 Case 2는 조정대상지역 여부도 「해당 시점들」로 보지만, 호출부의 `bothRegulated`는 신규 취득일 기준이다(확인 필요).
   */
  previousAcquisitionDate?: Date;
  /** 2019-12-17 체제 2호 가목 — 세대전원 이사·전입신고를 마친 날. */
  moveInDate?: Date;
  /** 2019-12-17 체제 2호 단서 — 신규 취득일 현재 거주하던 기존 임차인과 전 소유자의 임대차계약 종료일. */
  existingTenantLeaseEndDate?: Date;
  transferDate: Date;
}): TemporaryTwoHouseDeadlineEra {
  const base = { years: p.baseDeadlineYears, moveInRequirementPending: false };
  const t = p.transferDate.getTime();
  // D14 — 조정대상지역 기한이 생기기 전 구간. 지역과 무관하게 양도일로 정한다.
  if (t < TT_1Y_DEADLINE_TRANSFER_START.getTime()) return { years: 2, moveInRequirementPending: false };
  if (t < TT_2Y_DEADLINE_TRANSFER_START.getTime()) {
    if (p.newAcquisitionDate && p.newAcquisitionDate.getTime() < TT_1Y_DEADLINE_TRANSFER_START.getTime()) {
      return { years: 2, moveInRequirementPending: false, transition2002Unverified: true };
    }
    return { years: 1, moveInRequirementPending: false };
  }
  if (t < TT_3Y_AND_ONE_YEAR_HOLD_TRANSFER_START.getTime()) return { years: 2, moveInRequirementPending: false };
  if (!p.bothRegulated) return base;
  // 부칙 경과조치의 기준 — 「…이전에 취득한 경우」(1호) 또는 「…이전에 매매계약을 체결하고 계약금을
  //   지급한 경우」(2호). 둘 중 하나라도 기준일 이전이면 종전 규정이므로 이른 날짜가 기준이다.
  const acq = p.newAcquisitionDate?.getTime();
  const contract = p.newContractDate?.getTime();
  const earliest = acq === undefined ? undefined : contract === undefined ? acq : Math.min(acq, contract);
  // D13 — 종전주택 보유 전의 계약·취득은 「종전의 주택을 보유한 1세대가」의 기준이 될 수 없다 — 종전주택 취득시점.
  const prev = p.previousAcquisitionDate?.getTime();
  const n = earliest === undefined || prev === undefined ? earliest : Math.max(earliest, prev);
  // 2026 개정(제36737호) — §155①1호 「신규 취득일 현재 조정→조정」 + 신규 취득(또는 계약)이
  //   2026-08-04 이후인 경우만 2년. 그 밖은 「제1호 외의 경우」(2호)로 본문 3년 — n 미확정(호출부가
  //   항상 넘긴다는 전제가 깨진 경우)도 1호를 확정할 수 없으므로 2호로 둔다(법 근거 없이 유리하게
  //   적용하지 않는다).
  if (t >= TT_REGULATED_2026_TRANSFER_START.getTime()) {
    if (n !== undefined && n >= TT_REGULATED_2026_NEW_ACQ_START.getTime()) {
      return { years: 2, moveInRequirementPending: false };
    }
    return base;
  }
  if (t >= TT_REGULATED_ABOLISHED_TRANSFER_START.getTime()) return base;
  if (t >= TT_REGULATED_2022_TRANSFER_START.getTime()) return { years: 2, moveInRequirementPending: false };
  if (t < TT_REGULATED_2Y_TRANSFER_START.getTime()) return base;
  if (n === undefined) return { years: 2, moveInRequirementPending: false };
  if (n < TT_REGULATED_2Y_NEW_ACQ_START.getTime()) return base;
  if (t >= TT_REGULATED_1Y_TRANSFER_START.getTime() && n >= TT_REGULATED_1Y_NEW_ACQ_START.getTime()) {
    return resolveMoveInRegime(p.newAcquisitionDate!, p.moveInDate, p.existingTenantLeaseEndDate);
  }
  return { years: 2, moveInRequirementPending: false };
}

/**
 * 2019-12-17 체제 — §155①2호 가목(1년 내 세대전원 이사·전입신고)·나목(1년 내 양도)과 단서(기존 임차인).
 *
 * 기간은 「신규 주택의 취득일부터 1년 이내」 — 초일불산입 B 유형(`periodEndFrom`)이다.
 * 단서는 「그 임대차기간이 끝나는 날이 신규 주택의 취득일부터 1년 **후**인 경우」에만 적용된다 —
 * 종료일이 1년 기한 말일 이하면 기한은 그대로 1년이다.
 */
function resolveMoveInRegime(
  newAcquisitionDate: Date,
  moveInDate: Date | undefined,
  leaseEnd: Date | undefined,
): TemporaryTwoHouseDeadlineEra {
  const oneYearEnd = periodEndFrom(newAcquisitionDate, 1);
  const deadlineDate =
    leaseEnd && dayKey(leaseEnd) > dayKey(oneYearEnd)
      ? new Date(Math.min(dayKey(leaseEnd), dayKey(periodEndFrom(newAcquisitionDate, 2))))
      : undefined;
  if (!moveInDate) {
    return { years: 1, moveInRequirementPending: true, ...(deadlineDate ? { deadlineDate } : {}) };
  }
  return {
    years: 1,
    moveInRequirementPending: false,
    // 「1년 이내」·단서 기한 말일에도 민법 §161(토요일·공휴일 → 익일) — 법령해석과-3656(2021.10.21.)이 바로 이 가목 기한.
    moveInMet: isOnOrBeforeDeadline(moveInDate, deadlineDate ?? oneYearEnd),
    ...(deadlineDate ? { deadlineDate } : {}),
  };
}

/**
 * 판정 메뉴 입력 노출 — 새 입력이 **결론을 바꿀 수 있는 구간**인가 (⑤·⑧이 같은 술어를 쓴다).
 *
 * - `regulatedAxis`: 양도일이 조정→조정 단축 기한이 있던 2018-10-23 ~ 2023-01-11, 또는 2026 개정
 *   (제36737호) 시행일 2026-10-01 이후. 밖이면 두 주택의 조정 여부와 무관하게 본문 3년이다.
 * - `moveIn`: 신규 취득(또는 계약) 2019-12-17 이후 · 양도 2020-02-11 ~ 2022-05-09 — 2호 가목·단서 체제.
 *   두 주택이 모두 조정대상지역인지는 호출부가 AND 한다(조정 여부 미확인이면 열어 둔다).
 */
export function temporaryTwoHouseEraInputRelevance(p: {
  newAcquisitionDate: Date;
  newContractDate?: Date;
  transferDate: Date;
}): { regulatedAxis: boolean; moveIn: boolean } {
  const t = p.transferDate.getTime();
  const regulatedAxis =
    (t >= TT_REGULATED_2Y_TRANSFER_START.getTime() && t < TT_REGULATED_ABOLISHED_TRANSFER_START.getTime()) ||
    t >= TT_REGULATED_2026_TRANSFER_START.getTime();
  const moveIn =
    resolveTemporaryTwoHouseDeadlineEra({
      bothRegulated: true,
      baseDeadlineYears: 3,
      newAcquisitionDate: p.newAcquisitionDate,
      newContractDate: p.newContractDate,
      transferDate: p.transferDate,
    }).years === 1;
  return { regulatedAxis, moveIn };
}
