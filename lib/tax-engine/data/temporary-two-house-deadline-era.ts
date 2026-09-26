/**
 * 「소득세법 시행령」 §155① 일시적 2주택 — **조정대상지역 처분기한의 연혁** (OH-01)
 * (개정 없는 확정 역사 데이터. 정적 상수 — seed `tax_rates`로 연혁을 표현하지 않는다:
 *  다건 route가 과세기간 말일로 행을 고르므로 자산별 양도일을 표현할 수 없다.)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.1. 본문·부칙은 법제처 DRF 실독(2026-09-26).
 *
 * | 구간 | 기준축 | 기한 | 근거 |
 * |---|---|---|---|
 * | 비조정 또는 한쪽만 조정 | — | 3년(본문) | §155① 본문 |
 * | 조정→조정, 양도 < 2018-10-23 | 양도일 | 3년(본문) | 대통령령 제29242호 부칙 제2조① |
 * | 조정→조정, 신규 취득 ≤ 2018-09-13 | 신규취득일 | 3년(본문) | 제29242호 부칙 제2조②1호 |
 * | 조정→조정, 신규 취득 ≥ 2018-09-14 | 신규취득일 | **2년** | §155① 괄호(MST 204914, 2018-10-23 시행) |
 * | 조정→조정, 신규 취득 ≥ 2019-12-17 · 양도 2020-02-11 ~ 2022-05-09 | 둘 다 | **1년** + 1년 내 세대전원 전입 | §155①2호 가·나목(MST 218373), 제30395호 부칙 제15조 |
 * | 조정→조정, 양도 2022-05-10 ~ 2023-01-11 | 양도일 | **2년** | §155①2호(MST 242735), 제32654호 부칙 제3조 |
 * | 양도 ≥ 2023-01-12 | 양도일 | 3년(본문) | 2호 삭제(MST 248191), 제33267호 부칙 제8조 |
 *
 * 부칙 원문(대통령령 제30395호 제15조): 「① 제155조제1항의 개정규정은 이 영 시행 이후 양도하는 분부터
 * 적용한다. ② … 2019년 12월 16일 이전에 조정대상지역에 있는 신규 주택 … 을 취득한 경우 …
 * 종전의 규정에 따른다.」 제29242호 제2조②는 같은 구조로 2018-09-13을 기준으로 한다.
 *
 * ⚠️ **이 leaf는 기한(년)만 정한다.** 아래는 아직 판정하지 않는다 — A2b에서 입력 경로를 만든다:
 *   1. 조정 여부의 **판정 대상·시점** — 법은 「종전 주택이 조정대상지역에 있는 상태에서 조정대상지역에
 *      있는 신규 주택을 **취득**」(신규 취득 당시 두 주택 모두)이다. 호출부는 아직 종전 소스(양도일
 *      기준 양도주택 조정 여부)를 `bothRegulated`로 넘긴다.
 *   2. 2019-12-17 체제의 **1년 내 세대전원 전입 요건(2호 가목)**과 **기존 임차인 단서**(임대차 종료일까지,
 *      신규 취득일부터 최대 2년) — `moveInRequirementPending`으로 「판정하지 않았다」를 알린다.
 *   3. 부칙 제2조②2호·제15조②2호의 **매매계약·계약금 지급일** 경로 — 취득일만 받으므로 계약이
 *      기준일 이전이고 취득이 이후인 세대는 신규 체제로 판정된다(확인 필요 — 계약일 입력 없음).
 *   4. §155① 괄호의 「조정대상지역 공고 전 취득·계약」 제외.
 */

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

export interface TemporaryTwoHouseDeadlineEra {
  /** 처분기한(년) — 「신규 주택을 취득한 날부터 N년 이내」 */
  years: number;
  /**
   * 2019-12-17 체제(§155①2호 가·나목)에 해당해 **1년 내 세대전원 전입 요건과 기존 임차인 단서를
   * 판정하지 않았다** — 판정 메뉴·계산기가 이 사실을 고지한다(A2b 전까지).
   */
  moveInRequirementPending: boolean;
}

/**
 * §155① 처분기한(년)을 연혁대로 정한다.
 *
 * @param bothRegulated 「종전 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을
 *   취득」했는가 — 호출부가 판정해 넘긴다(위 ⚠️ 1).
 * @param baseDeadlineYears §155① 본문 기한(3년). 규칙 행 `temporary_two_house.disposalDeadlineYears`
 *   — 연혁 없이 전 구간 3년이라(각 시행본 본문 실독) 연혁 값이 아니다.
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
  transferDate: Date;
}): TemporaryTwoHouseDeadlineEra {
  const base = { years: p.baseDeadlineYears, moveInRequirementPending: false };
  if (!p.bothRegulated) return base;
  const t = p.transferDate.getTime();
  const n = p.newAcquisitionDate?.getTime();
  if (t >= TT_REGULATED_ABOLISHED_TRANSFER_START.getTime()) return base;
  if (t >= TT_REGULATED_2022_TRANSFER_START.getTime()) return { years: 2, moveInRequirementPending: false };
  if (t < TT_REGULATED_2Y_TRANSFER_START.getTime()) return base;
  if (n === undefined) return { years: 2, moveInRequirementPending: false };
  if (n < TT_REGULATED_2Y_NEW_ACQ_START.getTime()) return base;
  if (t >= TT_REGULATED_1Y_TRANSFER_START.getTime() && n >= TT_REGULATED_1Y_NEW_ACQ_START.getTime()) {
    return { years: 1, moveInRequirementPending: true };
  }
  return { years: 2, moveInRequirementPending: false };
}
