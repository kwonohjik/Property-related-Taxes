/**
 * 「소득세법 시행령」 §154① 본문 — **보유 3년** · **서울·과천·5개 신도시 거주 2년** 연혁 (M2. 정적 상수 —
 * seed `special:one_house_exemption`은 1990-01-01 한 행(보유 2년)이라 양도일 연혁을 담지 못한다.)
 *
 * 법제처 시행본 실독(2026-10-07):
 *
 * | 양도일 | 보유 | 거주(보유기간 중) | 근거 |
 * |---|---|---|---|
 * | 2003-11-20 ~ 2011-06-02 | 3년 | 서울특별시·과천시·분당·일산·평촌·산본·중동 신도시 **2년** | 대통령령 제18127호(부칙 제2조 시행 후 양도분) · MST 83140 |
 * | 2011-06-03 ~ 2012-06-28 | 3년 | 없음 | 대통령령 제22950호(부칙 제3조 「시행 후 최초로 양도하는 주택부터」) · MST 113823 |
 * | 2012-06-29 ~ | 2년 | (2017-08-03 이후 조정대상지역 취득분 2년 — seed `prePolicyDate`) | 대통령령 제23887호(부칙 제2조) · MST 126479 |
 *
 * 범위(사용자 결정 2026-10-07 — 보유 3년 요건 구간만, 2005년 이전 양도 계산 수요 없음):
 * - 2003-11-20 전 양도분의 거주 1년(제17751호 2002-10-01 · 부칙 제3조① 1년 유예)은 다루지 않는다.
 * - 제18127호 부칙 제3조(시행 당시 일시적 2주택·합가 2주택의 종전 규정)는 다루지 않는다.
 *
 * 신도시 지역은 「택지개발예정지구로 지정·고시된」 지구다 — 법정동코드로는 그 시·구 안인지까지만 안다.
 * 그래서 서울·과천은 확정, 신도시가 있는 시·구는 「안일 수 있음」(판정 보류 고지와 함께 요건 적용 —
 * 모르는 사실은 혜택 불성립), 주소가 없으면 「모름」(같은 처리)이다.
 */

/** 이 날 이후 양도분부터 보유 2년(제23887호). 그 전 양도분은 3년. */
export const ONE_HOUSE_HOLDING_2Y_TRANSFER_START = new Date("2012-06-29");
/** 서울 등 거주 2년 — 제18127호 시행일(이 날 이후 양도분) */
export const CAPITAL_NEWTOWN_RESIDENCE_TRANSFER_START = new Date("2003-11-20");
/** 서울 등 거주요건 폐지 — 제22950호 시행일(이 날 이후 양도분은 거주요건 없음) */
export const CAPITAL_NEWTOWN_RESIDENCE_TRANSFER_END = new Date("2011-06-03");
/** 서울 등 거주요건 연수 */
export const CAPITAL_NEWTOWN_RESIDENCE_YEARS = 2;

/** §154① 보유 연수 — 양도일 연혁. 2012-06-29 전 양도분은 3년, 그 뒤는 seed 값. */
export function resolveOneHouseMinHoldingYears(transferDate: Date, ruleYears: number): number {
  return transferDate.getTime() < ONE_HOUSE_HOLDING_2Y_TRANSFER_START.getTime() ? Math.max(3, ruleYears) : ruleYears;
}

/** 양도일이 서울 등 거주 2년 구간인가 */
export function isCapitalNewTownResidenceEra(transferDate: Date): boolean {
  const t = transferDate.getTime();
  return t >= CAPITAL_NEWTOWN_RESIDENCE_TRANSFER_START.getTime() && t < CAPITAL_NEWTOWN_RESIDENCE_TRANSFER_END.getTime();
}

/** 서울특별시(11) · 과천시(41290) — 지역 전체 */
const WHOLE_AREA_PREFIXES = ["11", "41290"];
/**
 * 신도시가 있는 시·구 — 성남 분당구(41135) · 고양 일산동구(41285)·일산서구(41287) ·
 * 안양 동안구(41173) · 군포시(41410) · 부천시(4119 — 구 폐지·부활 코드 포함, 오정구는 아래 제외)
 */
const NEW_TOWN_PREFIXES = ["41135", "41285", "41287", "41173", "41410", "4119"];

/**
 * 부천시 안에서 **중동 택지개발예정지구 밖**인 구 — 오정구(현행 41196 · 폐지 전 코드 41199).
 *
 * 규정의 대상은 「택지개발촉진법 제3조에 따라 택지개발예정지구로 지정·고시된 … 중동 신도시지역」이지
 * 부천시 전역이 아니다(「소득세법 시행령」 제154조제1항 괄호 — 2009.6.9. 시행본 MST 94701 · 2006.1.1.·2006.2.9. 시행본 MST 72432·72871 같은 문언).
 * 오정구 전역이 그 지구 밖이라는 것은 법령 밖의 **지리 사실**이다 — 사용자 지시(2026-10-11, PR9a)로 반영했고
 * 지구 지정·고시 원문(도면)은 이 저장소에서 확인하지 못했다. 소사구(41194·41197)는 송내동 일부가 지구에 걸리는지
 * 확인 전이라 「안일 수 있음」으로 둔다(확인 필요). 원미구(41192·41195)는 중동 지구가 있는 구다.
 * 같은 원미구 안의 상동택지개발지구는 중동신도시가 아니지만(재산46014-394, 2003.11.21.) 법정동코드가
 * 시·구 단위라 가르지 못한다 — 판정 보류 고지가 안내한다.
 */
const NOT_IN_NEW_TOWN_PREFIXES = ["41196", "41199"];

export type CapitalNewTownLocation = "in" | "maybe" | "out" | "unknown";

/** 양도 주택 법정동코드 → 서울·과천·5개 신도시 해당 여부 */
export function capitalNewTownLocation(regionCode: string | undefined): CapitalNewTownLocation {
  if (!regionCode) return "unknown";
  if (WHOLE_AREA_PREFIXES.some((p) => regionCode.startsWith(p))) return "in";
  if (NOT_IN_NEW_TOWN_PREFIXES.some((p) => regionCode.startsWith(p))) return "out";
  if (NEW_TOWN_PREFIXES.some((p) => regionCode.startsWith(p))) return "maybe";
  return "out";
}
