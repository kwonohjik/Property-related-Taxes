/**
 * 조특법 §99의3 — 시기 축 leaf (법률 제6762호 부칙 §29 · 리뷰 NH-01 · NH-04)
 *
 * 2003.1.1. 시행본(법률 제6762호)부터 §99의3①에 «대통령령으로 정하는 지역 외의 지역» 요건과 «고가주택» 단서가
 * 들어왔다. 종전 규정(2002.11.27. 시행본, MST 58080)에는 지역 제외가 없고 단서는 «고급주택»이었다.
 *
 * - 부칙 §29① — 2003.1.1. 전에 계약금을 납부(1호)했거나 사용승인(2호)을 받은 신축주택 → 종전의 규정,
 *   그 계약·승인일 당시의 고급주택 기준.
 * - 부칙 §29② — 2호로서 2003.1.1. 전에 공사에 착수하여 2003.6.30. 이전에 사용승인을 받은 신축주택 → 종전의 규정.
 *   해석: 재정경제부 재산세제과-96(2007.1.6.) — 이 경우 과세특례가 배제되는 고가(고급)주택 판정 기준도 종전 규정.
 * - 그 밖(개정규정 적용분)의 고가주택은 양도 당시 소득세법 §89①3호 기준 — 재산세과-3466(2008.10.24.).
 *   (2008.10.7.~ 9억 · 2021.12.8.~ 12억. 소득세법 시행령 §156 2003.1.1. 시행본은 6억)
 *
 * 착공 여부(§29② 요건)는 3-state — «모름»·미입력은 §29② 불성립(개정규정 적용) + 확인 필요(자동으로 종전 규정을 적용하지 않는다).
 */

/** UTC 자정 파싱 — API 경유 입력(new Date("YYYY-MM-DD") = UTC midnight)과 같은 기준. */
const D = (s: string) => new Date(s);

/** 법률 제6762호 시행일 — 이 날 이후 계약·승인분은 원칙적으로 개정규정(지역 제외·고가주택 단서). */
const AMENDED_EFFECTIVE = D("2003-01-01");
/** 부칙 §29② 사용승인 상한 */
const ADDENDA_29_2_APPROVAL_END = D("2003-06-30");
/**
 * §29② 해당분의 «종전 고급주택 기준» 기준일 — 소득세법 시행령 §156(2002.10.1. 시행본: 공동주택 149㎡ 이상 + 6억 초과)의
 * 마지막 시행일. 2003.1.1.부터는 «고가주택 6억 초과»로 바뀐다(대통령령 제17825호).
 */
export const PRIOR_ADVANCED_HOUSE_STANDARD_DATE = D("2002-12-31");

const HV_2008_10_05 = D("2008-10-05");
const HV_2021_12_07 = D("2021-12-07");

export type New993PriorRuleBasis = "addenda_29_1" | "addenda_29_2";
export type ConstructionStartAnswer = "yes" | "no" | "unknown";

export interface New993Era {
  /** 종전 규정 적용 근거 — 없으면 개정규정 적용 */
  priorRuleBasis?: New993PriorRuleBasis;
  /** §29② 범위(2호 · 사용승인 2003.1.1.~6.30.)인데 착공 «예»가 확인되지 않음(모름·미입력) */
  needsConstructionStartConfirmation: boolean;
}

/** 2호 사용승인이 §29② 범위(2003.1.1.~2003.6.30.)인가 — 착공 여부를 묻는 범위(UI·validate·Zod 공용). */
export function isAddenda29_2Window(
  acquisitionType: "from_builder" | "self_built",
  baseDate: Date,
): boolean {
  return acquisitionType === "self_built" && baseDate >= AMENDED_EFFECTIVE && baseDate <= ADDENDA_29_2_APPROVAL_END;
}

/**
 * 종전 규정/개정규정 판정. `baseDate`는 `resolveNew99BaseDate`(1호 계약일 · 2호 사용승인일).
 * 시한 외(2003.6.30. 초과)는 여기서 가르지 않는다 — 신축주택취득기간 게이트가 따로 막는다.
 */
export function resolveNew993Era(
  baseDate: Date,
  acquisitionType: "from_builder" | "self_built",
  constructionStartedBefore2003: ConstructionStartAnswer | undefined,
): New993Era {
  if (baseDate < AMENDED_EFFECTIVE) {
    return { priorRuleBasis: "addenda_29_1", needsConstructionStartConfirmation: false };
  }
  if (isAddenda29_2Window(acquisitionType, baseDate)) {
    if (constructionStartedBefore2003 === "yes") {
      return { priorRuleBasis: "addenda_29_2", needsConstructionStartConfirmation: false };
    }
    return { needsConstructionStartConfirmation: constructionStartedBefore2003 !== "no" };
  }
  return { needsConstructionStartConfirmation: false };
}

/**
 * 양도 당시 소득세법 §89①3호 고가주택 — 양도가액(물건 전체) 기준 금액만 본다(면적 요건 없음).
 * 시행령 §156①: 2008.10.7. 전 6억 · 2008.10.7.~2021.12.7. 9억 · 2021.12.8.~ 12억.
 * 경계 상수는 기존 기준일 축 헬퍼(`isHighValueHouseUnder993`)와 같은 값(≤2008-10-05 = 6억)을 그대로 쓴다 — 이 함수가 단일 소스다
 * (2008-10-06 하루 경계는 계산 범위(2009.3.16. 이후 양도) 밖이라 실익이 없다 — 리뷰 NH-04).
 */
export function isHighValueHouseAtDate(date: Date, wholePropertyTransferPrice: number): boolean {
  if (date <= HV_2008_10_05) return wholePropertyTransferPrice > 600_000_000;
  if (date <= HV_2021_12_07) return wholePropertyTransferPrice > 900_000_000;
  return wholePropertyTransferPrice > 1_200_000_000;
}
